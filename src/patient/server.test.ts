import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from "node:http";
import { patientExtractionPlugin } from "../../server/patient";
import { EXAMPLE_TEXT, exampleExtraction } from "./extraction";
const nativeFetch = globalThis.fetch;
let server: Server | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});
async function start(key = "test-secret", provider: "openrouter" | "groq" = "openrouter") {
  let middleware: (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => void = () => {};
  const plugin = patientExtractionPlugin(key, provider === "groq" ? "openai/gpt-oss-120b" : undefined, provider);
  (plugin.configureServer as Function)({
    middlewares: {
      use: (fn: typeof middleware) => {
        middleware = fn;
      },
    },
  });
  server = createServer((req, res) =>
    middleware(req, res, () => {
      res.writeHead(404);
      res.end();
    }),
  );
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
describe("server-only extraction boundary", () => {
  it("sends the supplied prompt, all 56 fields and strict schema to the selected free model, without coordinates", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(exampleExtraction()) },
              },
            ],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const base = await start();
    const res = await nativeFetch(`${base}/patient-api/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: EXAMPLE_TEXT,
        inputVersion: 9,
        priorFacts: [],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      inputVersion: 9,
      model: "qwen/qwen3.8-27b:free",
      facts: exampleExtraction().facts,
    });
    const [url, options] = fetcher.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.provider).toEqual({
      require_parameters: true,
      data_collection: "deny",
    });
    expect(body.messages[0].content).toContain("notes.clinical_other");
    expect(JSON.parse(body.messages[1].content)).toEqual({
      text: EXAMPLE_TEXT,
      context: { input_version: 9, prior_facts: [] },
    });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
  it("blocks common identifiers and cross-origin extraction before transmitting any text", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const base = await start();
    const res = await nativeFetch(`${base}/patient-api/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "환자명 홍길동, 010-1234-5678",
        inputVersion: 0,
        priorFacts: [],
      }),
    });
    expect(res.status).toBe(422);
    const cross = await nativeFetch(`${base}/patient-api/extract`, {
      method: "POST",
      headers: { Origin: "https://unrelated.example" },
    });
    expect(cross.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("exposes missing-key and provider-rate-limit errors without leaking credentials or provider body", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response("private-provider-error", { status: 429 }),
      );
    vi.stubGlobal("fetch", fetcher);
    const base = await start();
    const res = await nativeFetch(`${base}/patient-api/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: EXAMPLE_TEXT,
        inputVersion: 0,
        priorFacts: [],
      }),
    });
    expect(res.status).toBe(429);
    const text = await res.text();
    expect(text).not.toContain("test-secret");
    expect(text).not.toContain("private-provider-error");
    const status = await nativeFetch(`${base}/patient-api/status`);
    expect(await status.json()).toEqual({
      configured: true,
      model: "qwen/qwen3.8-27b:free",
      provider: "openrouter",
    });
  });
  it("reports an unconfigured key and never substitutes an example", async () => {
    const base = await start("");
    const res = await nativeFetch(`${base}/patient-api/extract`, {
      method: "POST",
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "missing_key" });
  });
  it("uses the Groq endpoint and schema without OpenRouter-only parameters", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(exampleExtraction()) } }] })));
    vi.stubGlobal("fetch", fetcher);
    const base = await start("groq-test-key", "groq");
    const res = await nativeFetch(`${base}/patient-api/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: EXAMPLE_TEXT, inputVersion: 1, priorFacts: [] }) });
    expect(res.status).toBe(200);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(options.body);
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.provider).toBeUndefined();
    expect(body.reasoning).toBeUndefined();
    expect(body.response_format.json_schema.strict).toBe(true);
  });
});
