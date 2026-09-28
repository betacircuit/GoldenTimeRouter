import type { RouterApi } from "./api";
import {
  DEMO_ORIGINS,
  responseSchema,
  type Candidate,
  type RecommendationRequest,
  type RecommendationResponse,
  type Scenario,
} from "../domain";

const names = [
  "중앙",
  "한빛",
  "북서울",
  "서림",
  "새봄",
  "동서울",
  "가온",
  "서강",
  "강북",
  "푸른",
];
const positions = [
  [37.568, 126.99],
  [37.559, 126.968],
  [37.581, 126.986],
  [37.562, 126.953],
  [37.552, 126.997],
  [37.575, 127.01],
  [37.589, 126.963],
  [37.548, 126.949],
  [37.596, 126.993],
  [37.541, 127.013],
];
const durations = [840, 660, 1020, 780, 1200, 1140, 1380, 1500, 1620, 1800];
const probabilities = [
  0.92, 0.87, 0.84, 0.79, 0.76, 0.72, 0.68, 0.64, 0.59, 0.53,
];
const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });

// These are completed-model response fixtures, not an in-browser clinical model.
export function createFixture(
  request: RecommendationRequest,
  scenario: Scenario = "normal",
  now = new Date(),
): RecommendationResponse {
  const resources = request.patient.requiredResources.length
    ? request.patient.requiredResources
    : ["응급실", "응급 검사"];
  let candidates: Candidate[] = names.map((name, index) => ({
    id: `demo-${index + 1}`,
    name: `데모 ${name}병원`,
    level: index < 3 ? "권역응급의료센터" : "지역응급의료센터",
    position: { lat: positions[index][0], lng: positions[index][1] },
    rank: index + 1,
    durationSeconds: durations[index],
    distanceMeters: 2100 + index * 860,
    probability: probabilities[index],
    interval: {
      lower: Math.max(0, probabilities[index] - 0.07),
      upper: Math.min(1, probabilities[index] + 0.04),
      level: 0.9,
    },
    resources: resources.map((name) => ({ name, status: "met" as const })),
    reasons: [
      "입력된 필요 자원을 충족하는 후보입니다.",
      "예상 도착 시점의 자원 상태를 반영한 모델 예측입니다.",
      "수용 가능성과 이동 시간을 함께 고려한 추천 순위입니다.",
    ],
    updatedAt: new Date(
      now.getTime() - ((index % 3) + 1) * 60000,
    ).toISOString(),
    dataStatus: "fresh",
    routeStatus: "available",
  }));
  if (scenario === "three") candidates = candidates.slice(0, 3);
  if (scenario === "empty") candidates = [];
  if (scenario === "mixed") {
    candidates[1] = { ...candidates[1], probability: null, interval: null };
    candidates[2] = {
      ...candidates[2],
      durationSeconds: null,
      distanceMeters: null,
      routeStatus: "unavailable",
    };
    candidates[3] = {
      ...candidates[3],
      updatedAt: new Date(now.getTime() - 45 * 60000).toISOString(),
      dataStatus: "stale",
      resources: [{ name: resources[0], status: "unknown" }],
    };
    candidates[4] = {
      ...candidates[4],
      resources: [{ name: resources[0], status: "unmet" }],
    };
  }
  return responseSchema.parse({
    requestId: `demo-${now.getTime()}`,
    generatedAt: now.toISOString(),
    isDemo: true,
    model: { name: "Golden Time Prediction", version: "1.0-demo" },
    candidates,
  });
}

export const mockApi: RouterApi = {
  async recommend(request, signal, scenario = "normal") {
    await delay(950, signal);
    if (scenario === "error")
      throw new Error(
        "추천 정보를 불러오지 못했습니다. 입력 정보는 유지됩니다. 다시 시도해 주세요.",
      );
    return createFixture(request, scenario);
  },
  async hospital(id, signal) {
    await delay(180, signal);
    const index = Number(id.replace("demo-", "")) - 1;
    if (!names[index]) throw new Error("병원 정보를 찾을 수 없습니다.");
    return {
      id,
      name: `데모 ${names[index]}병원`,
      address: `서울특별시 · 시연용 가상 병원 ${index + 1}`,
      emergencyPhone: null,
      isDemo: true,
    };
  },
  async route(request, hospitalId, signal) {
    await delay(220, signal);
    const index = Number(hospitalId.replace("demo-", "")) - 1;
    if (!positions[index]) throw new Error("경로를 찾을 수 없습니다.");
    const origin = request.origin || DEMO_ORIGINS[0];
    const destination = { lat: positions[index][0], lng: positions[index][1] };
    return {
      path: [origin, { lat: origin.lat, lng: destination.lng }, destination],
      durationSeconds: durations[index],
      distanceMeters: 2100 + index * 860,
      isDemo: true,
    };
  },
};
