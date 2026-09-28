import { describe, expect, it } from "vitest";
import { requestSchema } from "../domain";
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
import { highestProbability, mapViewport } from "./mapViewport";

const config: DemoConfig = {
  caseId: "chest",
  originIndex: 0,
  scenario: "normal",
  metrics: defaultMetrics(),
};
const origin = demoOrigins[0];
const request = { origin, patient: projectPatient(demoDraft(config).records) };
const response = configureDemo(
  createFixture(request),
  config,
  origin,
  request.patient,
);

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
      configureDemo(createFixture(request), configured, origin, request.patient)
        .candidates[0],
    ).toMatchObject({ durationSeconds: 1860, probability: 0.61 });
    expect(
      configureDemo(
        createFixture(request, "empty"),
        configured,
        origin,
        request.patient,
      ).candidates,
    ).toEqual([]);
  });
});

describe("adaptive map coverage", () => {
  it("starts with a 10 km radius without results and zooms into close hospitals", () => {
    const initial = mapViewport(origin, []);
    const clustered = configureDemo(
      createFixture(request),
      { ...config, scenario: "clustered" },
      origin,
      request.patient,
    );
    const close = mapViewport(origin, clustered.candidates);
    expect((initial.north - initial.south) * 111.32).toBeCloseTo(20);
    expect((close.north - close.south) * 111.32).toBeLessThan(6);
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
