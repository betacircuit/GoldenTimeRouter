import { describe, expect, it, vi } from "vitest";
import {
  DEMO_ORIGINS,
  responseSchema,
  sortCandidates,
  type RecommendationRequest,
} from "../domain";
import { createHttpApi } from "./api";
import { createFixture } from "./mock";
import { draftToRequest, initialDraft } from "../components/PatientForm";
import { applyExtraction, exampleExtraction } from "../patient/extraction";

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

describe("completed model API contract", () => {
  it("sends unmeasured fields as null, preserving zero and unknown age", () => {
    const value = draftToRequest({
      ...initialDraft(),
      origin: DEMO_ORIGINS[0],
      natural: {
        ...initialDraft().natural,
        records: applyExtraction(
          [],
          {
            facts: [
              {
                ...exampleExtraction().facts[0],
                field: "vitals.pulse",
                value: 0,
                unit: "/min",
              },
            ],
            issues: [],
          },
          1,
        ),
      },
    });
    expect(value.patient.ageYears).toBeNull();
    expect(value.patient.vitals).toEqual({
      systolic: null,
      diastolic: null,
      heartRate: 0,
      spo2: null,
      respiratoryRate: null,
      temperature: null,
    });
  });
  it("returns 10, 3 and 0 candidates without filling missing places", () => {
    expect(createFixture(request).candidates).toHaveLength(10);
    expect(createFixture(request, "three").candidates).toHaveLength(3);
    expect(createFixture(request, "empty").candidates).toHaveLength(0);
  });
  it("preserves model rank and independent probability; sorts unavailable ETA last", () => {
    const fixture = createFixture(request, "mixed");
    const original = fixture.candidates.map((c) => c.id);
    expect(sortCandidates(fixture.candidates, "eta").at(-1)?.id).toBe("demo-3");
    expect(sortCandidates(fixture.candidates, "rank").map((c) => c.id)).toEqual(
      original,
    );
    expect(fixture.candidates.map((c) => c.id)).toEqual(original);
    expect(fixture.candidates[1].probability).toBeNull();
    expect(
      fixture.candidates.reduce((sum, c) => sum + (c.probability || 0), 0),
    ).toBeGreaterThan(1);
  });
  it("rejects invalid probability, repeated hospital IDs and reversed intervals", () => {
    const fixture = createFixture(request);
    expect(
      responseSchema.safeParse({
        ...fixture,
        candidates: [{ ...fixture.candidates[0], probability: 92 }],
      }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({
        ...fixture,
        candidates: [fixture.candidates[0], fixture.candidates[0]],
      }).success,
    ).toBe(false);
    expect(
      responseSchema.safeParse({
        ...fixture,
        candidates: [
          {
            ...fixture.candidates[0],
            interval: { lower: 0.9, upper: 0.8, level: 0.9 },
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("posts patient input to the API and consumes the same fixture contract", async () => {
    const fixture = createFixture(request);
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(fixture), { status: 200 }),
      );
    const api = createHttpApi("/api/", fetcher);
    expect(await api.recommend(request)).toEqual(fixture);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/recommendations");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(request);
  });
  it("provides independent hospital and selected route calls", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "h1",
            name: "병원",
            address: "주소",
            emergencyPhone: "02-1234-5678",
            isDemo: false,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            path: [DEMO_ORIGINS[0], DEMO_ORIGINS[1]],
            durationSeconds: 200,
            distanceMeters: 1000,
            isDemo: false,
          }),
        ),
      );
    const api = createHttpApi("/api", fetcher);
    await api.hospital("h1");
    await api.route(request, "h1");
    expect(fetcher.mock.calls[0][0]).toBe("/api/hospitals/h1");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      origin: request.origin,
      hospitalId: "h1",
    });
  });
  it("does not replace server errors or malformed results with demo data", async () => {
    const api = createHttpApi(
      "/api",
      vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
    );
    await expect(api.recommend(request)).rejects.toThrow(
      "정보를 불러오지 못했습니다",
    );
    const malformed = createHttpApi(
      "/api",
      vi.fn().mockResolvedValue(new Response("{}")),
    );
    await expect(malformed.recommend(request)).rejects.toThrow(
      "서버 응답 형식",
    );
  });
  it("propagates caller cancellation to fetch", async () => {
    const fetcher = vi.fn(
      (_url, init) =>
        new Promise<Response>((_, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const api = createHttpApi("/api", fetcher as typeof fetch);
    const controller = new AbortController();
    const promise = api.recommend(request, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
