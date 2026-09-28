import { z } from "zod";
import type { RouterApi } from "./api";
import {
  candidateSchema,
  routeSchema,
  type Point,
  type Candidate,
} from "../domain";

const hospital = z.object({
  hospital_id: z.string(),
  hospital_name: z.string(),
  address: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  emergency_institution_category_name: z.string().nullable(),
  emergency_phone: z.string().nullable(),
  retrieved_at_utc: z.string(),
});
const state = z.object({
  hospital_id: z.string(),
  source_endpoint: z.string(),
  retrieved_at_utc: z.string(),
  er_beds_available: z.number().nullable(),
  icu_beds_available: z.number().nullable(),
  operating_rooms_available: z.number().nullable(),
  ct_availability_status: z.string().nullable(),
  mri_availability_status: z.string().nullable(),
});
const catalogSchema = z.object({
  exportedAt: z.string(),
  source: z.string(),
  hospitals: z.array(hospital),
  states: z.array(state),
  structural: z
    .record(z.string(), candidateSchema.shape.structural.unwrap())
    .default({}),
  trauma: z
    .array(
      z.object({
        hospital_id: z.string(),
        is_official_trauma_center: z.boolean(),
      }),
    )
    .default([]),
});
const etaSchema = z.object({
  queriedAt: z.string(),
  results: z.array(
    z.object({
      id: z.string(),
      durationSeconds: z.number().nonnegative().nullable(),
      distanceMeters: z.number().nonnegative().nullable(),
      status: z.enum(["ok", "unavailable"]),
    }),
  ),
});
async function routing(path: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(`/routing-api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error("자동차 길찾기를 조회하지 못했습니다.");
  return response.json();
}
export function distance(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return Math.round(
    6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h))),
  );
}
async function catalog(signal?: AbortSignal) {
  const response = await fetch("/server-catalog.json", {
    signal,
    cache: "no-cache",
  });
  if (!response.ok)
    throw new Error(
      "서버 수집 데이터를 불러오지 못했습니다. 스냅샷 동기화 상태를 확인해 주세요.",
    );
  return catalogSchema.parse(await response.json());
}
export const serverCatalogApi: RouterApi = {
  async recommend(request, signal) {
    const data = await catalog(signal);
    const candidates: Candidate[] = data.hospitals
      .filter((h) => h.latitude !== null && h.longitude !== null)
      .map((h) => ({
        h,
        meters: distance(request.origin, {
          lat: h.latitude!,
          lng: h.longitude!,
        }),
      }))
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 10)
      .map(({ h, meters }, i) => {
        const observation = data.states.find(
          (s) =>
            s.hospital_id === h.hospital_id &&
            s.source_endpoint === "getEmrrmRltmUsefulSckbdInfoInqire",
        );
        const updatedAt = observation?.retrieved_at_utc || null;
        const fields = [
          ["er_beds_available", "응급실 가용 병상"],
          ["icu_beds_available", "중환자실 가용 병상"],
          ["operating_rooms_available", "가용 수술실"],
          ["ct_availability_status", "CT 상태"],
          ["mri_availability_status", "MRI 상태"],
        ] as const;
        return {
          id: h.hospital_id,
          name: h.hospital_name,
          level: h.emergency_institution_category_name || "응급의료기관",
          position: { lat: h.latitude!, lng: h.longitude! },
          rank: i + 1,
          distanceMeters: meters,
          distanceKind: "straight",
          durationSeconds: null,
          probability: null,
          interval: null,
          resources: request.patient.requiredResources.map((name) => ({
            name,
            status: "unknown",
          })),
          reasons: [
            "출발 좌표에서 가까운 10개 기관 안에서 비교합니다.",
            "환자별 치료 적합성과 수용 가능성은 아직 평가되지 않았습니다.",
          ],
          updatedAt,
          dataStatus: updatedAt
            ? Date.now() - Date.parse(updatedAt) > 15 * 60 * 1000
              ? "stale"
              : "fresh"
            : "unknown",
          routeStatus: "unavailable",
          structural: data.structural[h.hospital_id],
          traumaCenter: data.trauma.some(
            (t) =>
              t.hospital_id === h.hospital_id && t.is_official_trauma_center,
          ),
          observations: observation
            ? fields.map(([key, label]) => ({
                label,
                value:
                  observation[key] === null
                    ? "미제공"
                    : String(observation[key]),
                recordedAt: observation.retrieved_at_utc,
                source: observation.source_endpoint,
              }))
            : [],
        };
      });
    let queriedAt: string | undefined;
    let routingNotice = "";
    if (candidates.length) {
      try {
        const etas = etaSchema.parse(
          await routing(
            "eta",
            {
              origin: { lat: request.origin.lat, lng: request.origin.lng },
              destinations: candidates.map((c) => ({
                id: c.id,
                ...c.position,
              })),
            },
            signal,
          ),
        );
        queriedAt = etas.queriedAt;
        for (const c of candidates) {
          const e = etas.results.find((r) => r.id === c.id);
          if (
            e?.status === "ok" &&
            e.durationSeconds !== null &&
            e.distanceMeters !== null
          ) {
            c.durationSeconds = e.durationSeconds;
            c.distanceMeters = e.distanceMeters;
            c.distanceKind = "road";
            c.routeStatus = "available";
          }
        }
        candidates.sort(
          (a, b) =>
            (a.durationSeconds ?? Infinity) - (b.durationSeconds ?? Infinity) ||
            a.rank - b.rank,
        );
        candidates.forEach((c, i) => {
          c.rank = i + 1;
          if (c.durationSeconds !== null)
            c.reasons.unshift(
              `카카오 일반 자동차 예상 이동 ${Math.ceil(c.durationSeconds / 60)}분${i === 0 ? "으로 조회 성공 후보 중 가장 짧습니다." : "입니다."}`,
            );
        });
        const count = candidates.filter(
          (c) => c.durationSeconds !== null,
        ).length;
        routingNotice = `카카오모빌리티 ETA ${count}/${candidates.length}곳 조회 · 일반 자동차 기준`;
      } catch (e) {
        if (signal?.aborted) throw e;
        routingNotice = "자동차 경로 조회 실패 · 직선 거리순으로 표시합니다.";
      }
    }
    return {
      requestId: crypto.randomUUID(),
      generatedAt: new Date().toISOString(),
      isDemo: false,
      model: { name: "추론 API 미연결", version: "—" },
      rankingBasis: candidates.some((c) => c.durationSeconds !== null)
        ? "eta"
        : "distance",
      routingNotice,
      routingQueriedAt: queriedAt,
      snapshotAt: data.exportedAt,
      candidates,
    };
  },
  async hospital(id, signal) {
    const data = await catalog(signal);
    const h = data.hospitals.find((h) => h.hospital_id === id);
    if (!h) throw new Error("병원 정보가 없습니다.");
    return {
      id,
      name: h.hospital_name,
      address: h.address,
      emergencyPhone: h.emergency_phone,
      isDemo: false,
    };
  },
  async route(request, id, signal) {
    const data = await catalog(signal);
    const h = data.hospitals.find((h) => h.hospital_id === id);
    if (!h || h.latitude === null || h.longitude === null)
      throw new Error("병원 길찾기 좌표가 없습니다.");
    try {
      return routeSchema.parse(
        await routing(
          "route",
          {
            origin: { lat: request.origin.lat, lng: request.origin.lng },
            destinations: [{ id, lat: h.latitude, lng: h.longitude }],
          },
          signal,
        ),
      );
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new Error("자동차 길찾기를 불러오지 못했습니다.");
    }
  },
};
