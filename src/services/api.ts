import { z } from "zod";
import {
  hospitalSchema,
  requestSchema,
  responseSchema,
  routeSchema,
  type Hospital,
  type RecommendationRequest,
  type RecommendationResponse,
  type Route,
  type Scenario,
} from "../domain";
import { mockApi } from "./mock";
import { serverCatalogApi } from "./serverCatalog";

export interface RouterApi {
  recommend(
    request: RecommendationRequest,
    signal?: AbortSignal,
    scenario?: Scenario,
  ): Promise<RecommendationResponse>;
  hospital(id: string, signal?: AbortSignal): Promise<Hospital>;
  route(
    request: RecommendationRequest,
    hospitalId: string,
    signal?: AbortSignal,
  ): Promise<Route>;
}

export function createHttpApi(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
): RouterApi {
  const base = baseUrl.replace(/\/$/, "");
  async function call<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 20000);
    try {
      const response = await fetcher(`${base}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers:
          body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "요청이 많습니다. 잠시 후 다시 시도해 주세요."
            : "정보를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.",
        );
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success)
        throw new Error(
          "서버 응답 형식을 확인할 수 없습니다. 다시 시도하거나 담당자에게 문의해 주세요.",
        );
      return parsed.data;
    } catch (error) {
      if (controller.signal.aborted && !signal?.aborted)
        throw new Error("응답 시간이 초과되었습니다. 다시 시도해 주세요.");
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
  return {
    recommend: (request, signal) =>
      call(
        "/recommendations",
        responseSchema,
        requestSchema.parse(request),
        signal,
      ),
    hospital: (id, signal) =>
      call(
        `/hospitals/${encodeURIComponent(id)}`,
        hospitalSchema,
        undefined,
        signal,
      ),
    route: (request, hospitalId, signal) =>
      call(
        "/routes",
        routeSchema,
        { origin: request.origin, hospitalId },
        signal,
      ),
  };
}

const selectedMode =
  import.meta.env.VITE_DATA_MODE === "server"
    ? new URLSearchParams(
        typeof window === "undefined" ? "" : window.location.search,
      ).get("data") === "demo"
      ? "demo"
      : "server"
    : import.meta.env.VITE_DATA_MODE;
export const isServerData = selectedMode === "server";
export const isDemo = selectedMode !== "live" && !isServerData;
export const api: RouterApi = isServerData
  ? serverCatalogApi
  : isDemo
    ? mockApi
    : createHttpApi(import.meta.env.VITE_API_BASE_URL || "/api");
