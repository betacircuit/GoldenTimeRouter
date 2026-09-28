import { describe, expect, it } from "vitest";
import {
  applyExtraction,
  containsIdentifier,
  EXAMPLE_TEXT,
  exampleExtraction,
  projectPatient,
  validateExtraction,
  type Fact,
} from "./extraction";
const fact = (patch: Partial<Fact> = {}): Fact => ({
  ...exampleExtraction().facts[0],
  ...patch,
});
describe("natural-language clinical draft boundaries", () => {
  it("keeps negation, evidence, missing measurements and exact stated values", () => {
    const parsed = validateExtraction(exampleExtraction(), EXAMPLE_TEXT);
    const records = applyExtraction([], parsed, 1);
    const p = projectPatient(records);
    expect(p.ageYears).toBe(58);
    expect(p.vitals.spo2).toBe(92);
    expect(p.vitals.temperature).toBeNull();
    expect(p.requiredResources).toEqual([]);
    expect(records.find((f) => f.field === "history.condition")?.status).toBe(
      "negated",
    );
    expect(p.clinicalFacts).toHaveLength(7);
  });
  it("does not turn an age band, missing unit, or uncertain value into a measured scalar", () => {
    const records = applyExtraction(
      [],
      {
        facts: [
          fact({ field: "patient.age_text", value: "60대", unit: null }),
          fact({ local_id: "n2", field: "vitals.spo2", value: 92, unit: null }),
          fact({
            local_id: "n3",
            field: "vitals.pulse",
            value: 90,
            unit: "/min",
            status: "uncertain",
          }),
        ],
        issues: [],
      },
      1,
    );
    expect(projectPatient(records)).toMatchObject({
      ageYears: null,
      vitals: { spo2: null, heartRate: null },
    });
    expect(records[0].value).toBe("60대");
  });
  it("retains repeat observations; only explicit targeted corrections supersede a fact", () => {
    const initial = applyExtraction(
      [],
      {
        facts: [fact({ field: "vitals.spo2", value: 92, unit: "%" })],
        issues: [],
      },
      1,
    );
    const observed = applyExtraction(
      initial,
      {
        facts: [
          fact({
            field: "vitals.spo2",
            value: 96,
            unit: "%",
            time_text: "산소 투여 후",
          }),
        ],
        issues: [],
      },
      2,
    );
    expect(observed.filter((f) => f.active)).toHaveLength(2);
    expect(projectPatient(observed).vitals.spo2).toBeNull();
    const correction = {
      facts: [
        fact({
          field: "vitals.spo2",
          value: 94,
          unit: "%",
          operation: "correct",
          target_id: "r1-n1",
          evidence: "92가 아니라 94%",
        }),
      ],
      issues: [],
    };
    validateExtraction(correction, "92가 아니라 94%", initial);
    const corrected = applyExtraction(initial, correction, 2);
    expect(initial[0].active).toBe(true);
    expect(corrected[0].active).toBe(false);
    expect(projectPatient(corrected).vitals.spo2).toBe(94);
  });
  it("accepts a correction to an earlier local fact and records retraction history", () => {
    const input = {
      facts: [
        fact({ evidence: "58세" }),
        fact({
          local_id: "n2",
          value: 59,
          operation: "correct",
          target_id: "n1",
          evidence: "58세가 아니라 59세",
        }),
        fact({
          local_id: "n3",
          value: null,
          operation: "retract",
          target_id: "n2",
          evidence: "연령 기록 취소",
        }),
      ],
      issues: [],
    };
    validateExtraction(input, "58세가 아니라 59세. 연령 기록 취소");
    expect(applyExtraction([], input, 1).filter((f) => f.active)).toHaveLength(
      0,
    );
  });
  it("rejects invented evidence, numeric strings, fabricated defaults, unknown targets, and KTAS conversion", () => {
    for (const f of [
      fact({ evidence: "없는 문장" }),
      fact({ value: "58" }),
      fact({ status: "unknown", value: 58 }),
      fact({ operation: "correct", target_id: "missing" }),
      fact({ field: "triage.pre_ktas", value: 2, evidence: "KTAS 2" }),
    ]) {
      expect(() =>
        validateExtraction({ facts: [f], issues: [] }, "58세. KTAS 2"),
      ).toThrow();
    }
  });
  it("does not merge multiple patients or send common explicit identifiers", () => {
    expect(() =>
      validateExtraction(
        {
          facts: [fact()],
          issues: [
            { code: "multiple_patients", message: "두 환자", evidence: null },
          ],
        },
        "58세",
      ),
    ).toThrow();
    for (const value of [
      "010-1234-5678",
      "900101-1234567",
      "환자명 홍길동",
      "세종대로 110",
    ])
      expect(containsIdentifier(value)).toBe(true);
    expect(containsIdentifier(EXAMPLE_TEXT)).toBe(false);
  });
});
