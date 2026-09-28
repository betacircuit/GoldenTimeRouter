import { afterEach, expect, it, vi } from "vitest";
import { serverCatalogApi, distance } from "./serverCatalog";
import {
  DEMO_ORIGINS,
  responseSchema,
  type RecommendationRequest,
} from "../domain";
const request: RecommendationRequest = {
  origin: DEMO_ORIGINS[0],
  patient: {
    ageYears: null,
    symptoms: ["흉통"],
    preKtas: null,
    suspectedCondition: null,
    requiredResources: ["CT"],
    vitals: {
      systolic: null,
      diastolic: null,
      heartRate: null,
      spo2: null,
      respiratoryRate: null,
      temperature: null,
    },
  },
};
const hospitals = Array.from({ length: 12 }, (_, i) => ({
  hospital_id: `nemc:${i}`,
  hospital_name: `기관 ${i}`,
  address: "공개 기관 주소",
  latitude: 37.5663 + i * 0.01,
  longitude: 126.9779,
  emergency_institution_category_name: "지역응급의료센터",
  emergency_phone: "02-0000-0000",
  retrieved_at_utc: "2026-09-14T01:00:00Z",
}));
const snapshot = {
  exportedAt: "2026-09-28T06:00:00Z",
  source: "NEMC",
  hospitals,
  states: [
    {
      hospital_id: "nemc:0",
      source_endpoint: "getSrsillDissAceptncPosblInfoInqire",
      retrieved_at_utc: "2026-09-28T06:00:00Z",
      er_beds_available: null,
      icu_beds_available: null,
      operating_rooms_available: null,
      ct_availability_status: null,
      mri_availability_status: null,
    },
    {
      hospital_id: "nemc:0",
      source_endpoint: "getEmrrmRltmUsefulSckbdInfoInqire",
      retrieved_at_utc: "2020-01-01T00:00:00Z",
      er_beds_available: -2,
      icu_beds_available: 0,
      operating_rooms_available: null,
      ct_availability_status: "Y",
      mri_availability_status: "정보미제공",
    },
  ],
};
afterEach(() => vi.unstubAllGlobals());
it("joins ETAs by hospital ID, preserves partial failures and never sends patient details to routing", async () => {
  const fetchMock = vi.fn().mockImplementation((url: string) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          url === "/server-catalog.json"
            ? snapshot
            : {
                queriedAt: "2026-09-28T06:00:00Z",
                results: [
                  {
                    id: "nemc:2",
                    durationSeconds: 120,
                    distanceMeters: 2000,
                    status: "ok",
                  },
                  {
                    id: "nemc:0",
                    durationSeconds: 480,
                    distanceMeters: 3200,
                    status: "ok",
                  },
                  {
                    id: "nemc:1",
                    durationSeconds: null,
                    distanceMeters: null,
                    status: "unavailable",
                  },
                ],
              },
        ),
      ),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const result = await serverCatalogApi.recommend(request);
  expect(result.rankingBasis).toBe("eta");
  expect(result.candidates[0]).toMatchObject({
    id: "nemc:2",
    rank: 1,
    durationSeconds: 120,
    distanceKind: "road",
    probability: null,
    routeStatus: "available",
  });
  expect(result.candidates.find((c) => c.id === "nemc:1")).toMatchObject({
    durationSeconds: null,
    distanceKind: "straight",
    routeStatus: "unavailable",
  });
  const sent = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(Object.keys(sent).sort()).toEqual(["destinations", "origin"]);
  expect(sent.destinations).toHaveLength(10);
  expect(responseSchema.safeParse(result).success).toBe(true);
});
it("uses nearest actual institutions and keeps missing model/road results null", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot))),
  );
  const result = await serverCatalogApi.recommend(request);
  expect(responseSchema.safeParse(result).success).toBe(true);
  expect(result.candidates).toHaveLength(10);
  expect(result.candidates[0]).toMatchObject({
    id: "nemc:0",
    distanceMeters: 0,
    distanceKind: "straight",
    durationSeconds: null,
    probability: null,
    interval: null,
    routeStatus: "unavailable",
    dataStatus: "stale",
    resources: [{ name: "CT", status: "unknown" }],
  });
  expect(result.candidates[0].observations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: "응급실 가용 병상", value: "-2" }),
      expect.objectContaining({ label: "CT 상태", value: "Y" }),
    ]),
  );
  expect(result.rankingBasis).toBe("distance");
  expect(result.isDemo).toBe(false);
});
it("responds to origin changes, exposes only recorded emergency contact", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(snapshot))),
      ),
  );
  const result = await serverCatalogApi.recommend({
    ...request,
    origin: { lat: 37.6763, lng: 126.9779, label: "새 출발지" },
  });
  expect(result.candidates[0].id).toBe("nemc:11");
  expect(await serverCatalogApi.hospital("nemc:0")).toMatchObject({
    isDemo: false,
    emergencyPhone: "02-0000-0000",
  });
  await expect(serverCatalogApi.hospital("missing")).rejects.toThrow();
  await expect(serverCatalogApi.route(request, "nemc:0")).rejects.toThrow(
    "길찾기",
  );
  expect(distance(DEMO_ORIGINS[0], DEMO_ORIGINS[0])).toBe(0);
});
it("does not replace an unavailable catalog with invented institutions", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 404 })),
  );
  await expect(serverCatalogApi.recommend(request)).rejects.toThrow(
    "수집 데이터",
  );
});
