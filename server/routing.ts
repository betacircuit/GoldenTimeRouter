import type { Plugin } from "vite";
import { z } from "zod";
import { pointSchema, routeSchema } from "../src/domain.js";
import { distance } from "../src/services/serverCatalog.js";

const destination = pointSchema.extend({ id: z.string().min(1).max(100) });
export const etaRequest = z
  .object({
    origin: pointSchema,
    destinations: z.array(destination).min(1).max(10),
    departureTime: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
const summary = z.object({
  duration: z.number().nonnegative(),
  distance: z.number().nonnegative(),
});
const providerRoute = z.object({
  key: z.string().optional(),
  result_code: z.number(),
  result_msg: z.string().optional(),
  summary: summary.optional(),
  sections: z
    .array(
      z.object({
        roads: z.array(z.object({ vertexes: z.array(z.number()) })).optional(),
      }),
    )
    .optional(),
});
const providerResponse = z.object({ routes: z.array(providerRoute) });
export function useBatch(
  origin: { lat: number; lng: number },
  destinations: { lat: number; lng: number }[],
  future = false,
) {
  return !future && destinations.every((d) => distance(origin, d) <= 10000);
}
export function kakaoRoutingPlugin(key: string): Plugin {
  let calls = 0;
  const inFlight = new Map<string, Promise<unknown>>();
  async function call(path: string, method: string, body?: unknown) {
    if (!key) throw new Error("카카오 자동차 길찾기 키가 설정되지 않았습니다.");
    if (++calls > 100)
      throw new Error("로컬 세션의 길찾기 호출 한도에 도달했습니다.");
    const r = await fetch(`https://apis-navi.kakaomobility.com${path}`, {
      method,
      headers: {
        Authorization: `KakaoAK ${key}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error(`카카오 길찾기 응답 오류 (${r.status})`);
    return providerResponse.parse(await r.json()).routes;
  }
  async function single(
    origin: z.infer<typeof pointSchema>,
    dest: z.infer<typeof destination>,
    geometry: boolean,
    departureTime?: string,
  ) {
    const p = new URLSearchParams({
      origin: `${origin.lng},${origin.lat}`,
      destination: `${dest.lng},${dest.lat}`,
      priority: "TIME",
      summary: String(!geometry),
      alternatives: "false",
    });
    let path = "/v1/directions";
    if (departureTime) {
      const when = new Date(departureTime);
      if (when.getTime() <= Date.now())
        throw new Error("미래 출발 시각을 지정해 주세요.");
      path = "/v1/future/directions";
      p.set(
        "departure_time",
        new Date(when.getTime() + 9 * 3600000)
          .toISOString()
          .replace(/[-:T]/g, "")
          .slice(0, 12),
      );
    }
    return (await call(`${path}?${p}`, "GET"))[0];
  }
  const install: NonNullable<Plugin["configureServer"]> = (server) => {
    server.middlewares.use("/routing-api", async (req, res, next) => {
      if (req.method !== "POST") return next();
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      try {
        // Browser calls must originate from this local app; no cross-origin key proxy.
        if (
          req.headers.origin &&
          new URL(req.headers.origin).host !== req.headers.host
        ) {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: "동일 출처 요청만 가능합니다." }));
          return;
        }
        if (!["/eta", "/route"].includes(req.url || "")) {
          res.statusCode = 404;
          res.end("{}");
          return;
        }
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 12000) throw new Error("요청이 너무 큽니다.");
        }
        const data = etaRequest.parse(JSON.parse(raw));
        if (
          new Set(data.destinations.map((d) => d.id)).size !==
          data.destinations.length
        )
          throw new Error("병원 ID가 중복되었습니다.");
        const geometry = req.url === "/route";
        if (geometry && data.destinations.length !== 1)
          throw new Error("경로는 선택한 병원 한 곳만 요청할 수 있습니다.");
        const requestKey = JSON.stringify([req.url, data]);
        let pending = inFlight.get(requestKey);
        if (!pending) {
          pending = (async () => {
            const queriedAt = new Date().toISOString();
            if (geometry) {
              const r = await single(
                data.origin,
                data.destinations[0],
                true,
                data.departureTime,
              );
              if (!r || r.result_code !== 0 || !r.summary)
                throw new Error("선택한 병원의 경로를 조회하지 못했습니다.");
              const path = (r.sections || []).flatMap((s) =>
                (s.roads || []).flatMap((road) =>
                  road.vertexes.flatMap((lng, i, a) =>
                    i % 2 === 0 && a[i + 1] !== undefined
                      ? [{ lng, lat: a[i + 1] }]
                      : [],
                  ),
                ),
              );
              return routeSchema.parse({
                path,
                durationSeconds: r.summary.duration,
                distanceMeters: r.summary.distance,
                isDemo: false,
              });
            }
            let routes;
            let mode = "individual";
            if (
              useBatch(
                data.origin,
                data.destinations,
                Boolean(data.departureTime),
              )
            ) {
              mode = "multi-destination";
              const received = await call(
                "/v1/destinations/directions",
                "POST",
                {
                  origin: { x: data.origin.lng, y: data.origin.lat },
                  destinations: data.destinations.map((d) => ({
                    x: d.lng,
                    y: d.lat,
                    key: d.id,
                  })),
                  radius: 10000,
                  priority: "TIME",
                },
              );
              routes = data.destinations.map((d) => ({
                id: d.id,
                route: received.find((r) => r.key === d.id),
              }));
            } else {
              routes = [];
              // A failed destination must not erase successful ETAs.
              for (const d of data.destinations) {
                try {
                  routes.push({
                    id: d.id,
                    route: await single(
                      data.origin,
                      d,
                      false,
                      data.departureTime,
                    ),
                  });
                } catch {
                  routes.push({ id: d.id, route: undefined });
                }
              }
            }
            return {
              provider: "Kakao Mobility",
              queriedAt,
              departureTime: data.departureTime || queriedAt,
              mode,
              results: routes.map(({ id, route: r }) => ({
                id,
                durationSeconds:
                  r?.result_code === 0 ? (r.summary?.duration ?? null) : null,
                distanceMeters:
                  r?.result_code === 0 ? (r.summary?.distance ?? null) : null,
                status:
                  r?.result_code === 0 && r.summary ? "ok" : "unavailable",
              })),
            };
          })();
          inFlight.set(requestKey, pending);
          void pending
            .finally(() => inFlight.delete(requestKey))
            .catch(() => {});
        }
        res.end(JSON.stringify(await pending));
      } catch (e) {
        res.statusCode = e instanceof z.ZodError ? 400 : 502;
        res.end(
          JSON.stringify({
            error:
              e instanceof z.ZodError
                ? "길찾기 요청 형식이 올바르지 않습니다."
                : e instanceof Error
                  ? e.message
                  : "경로 조회 실패",
          }),
        );
      }
    });
  };
  return { name: "local-kakao-routing", configureServer: install };
}
