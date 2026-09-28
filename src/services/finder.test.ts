import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  requestSchema,
  candidateSchema,
  elapsedTime,
  minutes,
  percent,
} from "../domain";
import { projectPatient } from "../patient/extraction";
import {
  configureDemo,
  defaultMetrics,
  demoCases,
  demoDraft,
  demoOrigins,
  type DemoConfig,
} from "./demo";
import { createFixture } from "./mock";
import type { CatalogHospital } from "./serverCatalog";
import {
  destinationViewport,
  highestProbability,
  mapViewport,
} from "./mapViewport";

describe("selected destination viewport", () => {
  it("includes origin and destination with room around both, even at the same coordinate", () => {
    for (const destination of [
      origin,
      { lat: origin.lat + 0.07, lng: origin.lng - 0.12 },
    ]) {
      const view = destinationViewport(origin, destination);
      for (const point of [origin, destination]) {
        expect(point.lat).toBeGreaterThan(view.south);
        expect(point.lat).toBeLessThan(view.north);
        expect(point.lng).toBeGreaterThan(view.west);
        expect(point.lng).toBeLessThan(view.east);
      }
    }
  });
});

const config: DemoConfig = {
  caseId: "chest",
  originIndex: 0,
  scenario: "normal",
  metrics: defaultMetrics(),
};
const origin = demoOrigins[0];
const hospitals = (JSON.parse(
  readFileSync(new URL("../../public/server-catalog.json", import.meta.url), "utf8"),
) as { hospitals: CatalogHospital[] }).hospitals;
const request = { origin, patient: projectPatient(demoDraft(config).records) };
const response = configureDemo(
  createFixture(request),
  config,
  origin,
  request.patient,
  hospitals,
);

describe("compact metric formatting", () => {
  it("keeps hours, zero probability and absent predictions distinct", () => {
    expect(minutes(59 * 60)).toBe("59분");
    expect(minutes(59 * 60 + 1)).toBe("1시간");
    expect(minutes(80 * 60)).toBe("1시간 20분");
    expect(minutes(120 * 60)).toBe("2시간");
    expect(minutes(null)).toBe("조회 불가");
    expect(elapsedTime(3599)).toBe("59:59");
    expect(elapsedTime(3600)).toBe("1:00:00");
    expect(elapsedTime(7201)).toBe("2:00:01");
    expect(percent(-0.2)).toBe("0%");
    expect(percent(0)).toBe("0%");
    expect(percent(null)).toBe("예측 정보 없음");
    expect(
      candidateSchema.parse({ ...response.candidates[0], probability: -0.2 })
        .probability,
    ).toBe(0);
  });
});

describe("demo patient and result contracts", () => {
  for (const c of demoCases)
    it(`${c.id} produces valid patient facts and matching resources`, () => {
      const patient = projectPatient(
        demoDraft({ ...config, caseId: c.id }).records,
      );
      expect(requestSchema.safeParse({ origin, patient }).success).toBe(true);
      expect(patient.ageYears).toBe(c.age);
      expect(patient.requiredResources).toEqual([...c.resources]);
    });
  it("applies selected values without fabricating missing results", () => {
    const configured = {
      ...config,
      metrics: config.metrics.map((m, i) =>
        i ? m : { minutes: 31, probability: 61 },
      ),
    };
    expect(
      configureDemo(createFixture(request), configured, origin, request.patient, hospitals)
        .candidates[0],
    ).toMatchObject({ durationSeconds: 1860, probability: 0.61 });
    expect(
      configureDemo(
        createFixture(request, "empty"),
        configured,
        origin,
        request.patient,
        hospitals,
      ).candidates,
    ).toEqual([]);
  });
});

describe("adaptive map coverage", () => {
  it("starts at street scale without results and fits the hospitals after searching", () => {
    const initial = mapViewport(origin, []);
    const clustered = configureDemo(
      createFixture(request),
      { ...config, scenario: "clustered" },
      origin,
      request.patient,
      hospitals,
    );
    const close = mapViewport(origin, clustered.candidates);
    expect((initial.north - initial.south) * 111.32).toBeCloseTo(0.32);
    expect((close.north - close.south) * 111.32).toBeLessThan(12);
  });
  it("includes highest probabilities even when their ranks and positions differ", () => {
    const candidates = response.candidates.map((c, i) =>
      i === 8
        ? {
            ...c,
            probability: 0.999,
            position: { lat: origin.lat + 0.3, lng: origin.lng - 0.25 },
          }
        : c,
    );
    expect(highestProbability(candidates)[0].rank).toBe(9);
    const bounds = mapViewport(origin, candidates);
    for (const c of highestProbability(candidates)) {
      expect(c.position.lat).toBeGreaterThan(bounds.south);
      expect(c.position.lat).toBeLessThan(bounds.north);
      expect(c.position.lng).toBeGreaterThan(bounds.west);
      expect(c.position.lng).toBeLessThan(bounds.east);
    }
  });
  it("identical locations keep a useful minimum map scale", () => {
    const bounds = mapViewport(
      origin,
      response.candidates.map((c) => ({ ...c, position: origin })),
    );
    expect((bounds.north - bounds.south) * 111.32).toBeCloseTo(1.4);
  });
});
