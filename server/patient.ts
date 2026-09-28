import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { z } from "zod";
import { FIELD_CATALOG } from "../src/patient/catalog";
import {
  containsIdentifier,
  extractionInputSchema,
  extractionSchema,
  validateExtraction,
} from "../src/patient/extraction";

export const DEFAULT_MODEL = "qwen/qwen3.8-27b:free";
export function patientExtractionPlugin(
  apiKey: string,
  model = DEFAULT_MODEL,
  provider: "openrouter" | "groq" = "openrouter",
): Plugin {
  const providerName = provider === "groq" ? "Groq" : "OpenRouter";
  const install = (server: {
    middlewares: {
      use: (
        fn: (
          req: IncomingMessage,
          res: ServerResponse,
          next: () => void,
        ) => void,
      ) => void;
    };
  }) => {
    let running = false;
    server.middlewares.use(async (req, res, next) => {
      const path = req.url?.split("?")[0];
      if (!path?.startsWith("/patient-api/")) return next();
      const send = (status: number, body: unknown) => {
        if (!res.destroyed) {
          res.writeHead(status, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify(body));
        }
      };
      if (
        req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}` &&
        req.headers.origin !== `https://${req.headers.host}`
      )
        return send(403, {
          error: "같은 화면에서만 추출을 요청할 수 있습니다.",
        });
      if (path === "/patient-api/status" && req.method === "GET")
        return send(200, { configured: Boolean(apiKey), model, provider });
      if (path !== "/patient-api/extract" || req.method !== "POST")
        return send(404, { error: "지원하지 않는 요청입니다." });
      if (!apiKey)
        return send(503, {
          error:
            `${providerName} API 키가 아직 설정되지 않았습니다.`,
          code: "missing_key",
        });
      if (running)
        return send(429, {
          error: "이전 추출이 진행 중입니다. 완료 후 다시 시도해 주세요.",
        });
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return send(415, { error: "JSON 입력만 지원합니다." });
      running = true;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const disconnect = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on("close", disconnect);
      try {
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of req) {
          chunks.push(Buffer.from(chunk));
          bytes += Buffer.byteLength(chunk);
          if (bytes > 180000) {
            send(413, {
              error: "입력이 너무 깁니다. 기록을 나누어 입력해 주세요.",
            });
            return;
          }
        }
        const input = extractionInputSchema.safeParse(
          JSON.parse(Buffer.concat(chunks).toString("utf8")),
        );
        if (!input.success)
          return send(400, {
            error: "입력 길이 또는 이전 기록 형식을 확인해 주세요.",
          });
        const { text, inputVersion, priorFacts } = input.data;
        if (
          containsIdentifier(text) ||
          priorFacts.some((f) => containsIdentifier(JSON.stringify(f)))
        )
          return send(422, {
            error:
              "이름·연락처·주민번호·상세 주소로 보이는 정보가 있습니다. 식별정보를 지운 뒤 환자 상태만 입력해 주세요.",
            code: "identifier",
          });
        const prompt = readFileSync(
          resolve(process.cwd(), "server/patient-prompt.txt"),
          "utf8",
        );
        const response = await fetch(
          provider === "groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "X-OpenRouter-Title": "Golden Time Router",
            },
            body: JSON.stringify({
              model,
              temperature: 0,
              max_tokens: 6000,
              stream: false,
              ...(provider === "groq" ? { reasoning_effort: "low" } : { reasoning: { enabled: false }, provider: { require_parameters: true, data_collection: "deny" } }),
              messages: [
                {
                  role: "system",
                  content: `${prompt}\nFIELD_CATALOG_JSON:\n${JSON.stringify(FIELD_CATALOG)}\nissues 형식: {code: ambiguous/conflict/multiple_patients/identifier/unsupported/other, message: 입력 해석 문제, evidence: 원문 부분문자열 또는 null}`,
                },
                {
                  role: "user",
                  content: JSON.stringify({
                    text,
                    context: {
                      input_version: inputVersion,
                      prior_facts: priorFacts.filter((f) => f.active),
                    },
                  }),
                },
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "gtr_patient_extraction",
                  strict: true,
                  schema: z.toJSONSchema(extractionSchema, {
                    target: "draft-7",
                  }),
                },
              },
            }),
          },
        );
        if (!response.ok) {
          const message =
            response.status === 429
              ? "무료 모델의 호출 한도 또는 혼잡으로 추출하지 못했습니다. 잠시 후 다시 시도해 주세요."
              : response.status === 401 || response.status === 402
                ? `${providerName} 키 또는 계정 사용 상태를 확인해 주세요.`
                : response.status === 404
                  ? "선택 모델에서 구조화 출력과 데이터 수집 제한을 함께 지원하는 제공자를 찾지 못했습니다."
                  : `${providerName} 응답 오류 (${response.status})입니다. 다시 시도해 주세요.`;
          return send(response.status === 429 ? 429 : 502, { error: message });
        }
        const data = await response.json();
        const choice = data.choices?.[0];
        if (
          choice?.finish_reason !== "stop" ||
          typeof choice?.message?.content !== "string"
        )
          return send(502, {
            error:
              "추출 응답이 완료되지 않았습니다. 기록을 나누어 다시 시도해 주세요.",
          });
        const result = validateExtraction(
          JSON.parse(choice.message.content),
          text,
          priorFacts,
        );
        send(200, { ...result, inputVersion, model });
      } catch (e) {
        send(controller.signal.aborted ? 504 : 502, {
          error: controller.signal.aborted
            ? "추출 시간이 초과되었거나 요청이 취소되었습니다. 입력은 유지됩니다."
            : e instanceof SyntaxError || e instanceof z.ZodError
              ? "모델 응답이 정해진 형식과 다릅니다. 다시 추출해 주세요."
              : e instanceof Error && !e.message.includes("fetch")
                ? e.message
                : "추출 서버에 연결하지 못했습니다. 입력은 유지됩니다.",
        });
      } finally {
        clearTimeout(timeout);
        res.off("close", disconnect);
        running = false;
      }
    });
  };
  return {
    name: "gtr-patient-extraction",
    configureServer: install,
    configurePreviewServer: install,
  };
}
