import { z } from "zod";
import { FIELD_CATALOG } from "./catalog.js";

export const fieldNames = FIELD_CATALOG.map((f) => f.field);
export type FieldName = (typeof FIELD_CATALOG)[number]["field"];
export const fieldInfo = (field: FieldName) =>
  FIELD_CATALOG.find((f) => f.field === field)!;
export const statusLabels = {
  affirmed: "명시됨",
  negated: "없음",
  uncertain: "불확실",
  unknown: "미상",
  not_measured: "미측정",
  unobtainable: "측정 불가",
  declined: "거절",
} as const;
export const sourceLabels = {
  patient_report: "환자 진술",
  caregiver_report: "보호자 진술",
  ems_observation: "대원 관찰·측정",
  unspecified: "출처 미상",
} as const;
export const factSchema = z
  .object({
    local_id: z.string().regex(/^n\d+$/),
    field: z.enum(fieldNames),
    value: z.union([z.string().max(1000), z.number().finite(), z.null()]),
    unit: z.string().max(30).nullable(),
    status: z.enum(
      Object.keys(statusLabels) as [
        keyof typeof statusLabels,
        ...Array<keyof typeof statusLabels>,
      ],
    ),
    subject: z.literal("patient"),
    source: z.enum(
      Object.keys(sourceLabels) as [
        keyof typeof sourceLabels,
        ...Array<keyof typeof sourceLabels>,
      ],
    ),
    time_text: z.string().max(200).nullable(),
    group_id: z.string().max(60).nullable(),
    evidence: z.string().min(1).max(2000),
    operation: z.enum(["add", "correct", "retract"]),
    target_id: z.string().max(100).nullable(),
  })
  .strict();
export const issueSchema = z
  .object({
    code: z.enum([
      "ambiguous",
      "conflict",
      "multiple_patients",
      "identifier",
      "unsupported",
      "other",
    ]),
    message: z.string().min(1).max(400),
    evidence: z.string().max(2000).nullable(),
  })
  .strict();
export const extractionSchema = z
  .object({
    facts: z.array(factSchema).max(100),
    issues: z.array(issueSchema).max(30),
  })
  .strict();
export type Fact = z.infer<typeof factSchema>;
export type Extraction = z.infer<typeof extractionSchema>;
export const recordSchema = factSchema.extend({
  id: z.string().max(100),
  active: z.boolean(),
  provenance: z.enum(["model", "example", "manual"]),
  originalValue: z.union([z.string(), z.number(), z.null()]).optional(),
});
export type ClinicalRecord = z.infer<typeof recordSchema>;
export const extractionInputSchema = z
  .object({
    text: z.string().trim().min(1).max(6000),
    inputVersion: z.number().int().nonnegative(),
    priorFacts: z.array(recordSchema).max(200),
  })
  .strict();
export const extractionResponseSchema = extractionSchema.extend({
  inputVersion: z.number().int(),
  model: z.string(),
});

// This preflight catches common explicit identifiers; it is not a complete de-identification system.
export function containsIdentifier(text: string) {
  return /\d{6}\s*[-–]\s*[1-8]\d{6}|(?:0\d{1,2})[-\s]?\d{3,4}[-\s]?\d{4}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:이름|성명|환자명)\s*[:：]?\s*[가-힣]{2,5}|(?:[가-힣]+(?:대로|로|길))\s*\d+(?:-\d+)?/i.test(
    text,
  );
}

export function validateExtraction(
  raw: unknown,
  text: string,
  prior: ClinicalRecord[] = [],
): Extraction {
  const parsed = extractionSchema.parse(raw);
  const known = new Map(prior.filter((f) => f.active).map((f) => [f.id, f]));
  const ids = new Set<string>();
  if (
    parsed.issues.some((i) => i.code === "multiple_patients") &&
    parsed.facts.length
  )
    throw new Error(
      "여러 환자의 정보가 섞인 응답입니다. 한 환자씩 입력해 주세요.",
    );
  for (const fact of parsed.facts) {
    if (ids.has(fact.local_id))
      throw new Error("추출 항목 식별자가 중복되었습니다.");
    ids.add(fact.local_id);
    if (
      !text.includes(fact.evidence) ||
      containsIdentifier(fact.evidence) ||
      containsIdentifier(String(fact.value ?? ""))
    )
      throw new Error(
        "원문 근거를 확인할 수 없는 추출값입니다. 다시 추출해 주세요.",
      );
    if (fact.time_text && !text.includes(fact.time_text))
      throw new Error("원문에 없는 시점이 반환되었습니다.");
    const numeric = fieldInfo(fact.field).type === "number";
    if (
      fact.value !== null &&
      typeof fact.value !== (numeric ? "number" : "string")
    )
      throw new Error("추출값 형식이 항목 사전과 다릅니다.");
    if (
      numeric &&
      ["unknown", "not_measured", "unobtainable", "declined"].includes(
        fact.status,
      ) &&
      fact.value !== null
    )
      throw new Error("미상인 수치에 값이 채워져 있습니다.");
    if (
      fact.field === "triage.pre_ktas" &&
      fact.value !== null &&
      !/pre[\s-]*ktas/i.test(fact.evidence)
    )
      throw new Error("Pre-KTAS라고 명시된 평가만 사용할 수 있습니다.");
    if (fact.operation === "add") {
      if (fact.target_id !== null)
        throw new Error("새 관측의 정정 대상은 비어 있어야 합니다.");
    } else {
      const target = known.get(fact.target_id ?? "");
      if (!target || target.field !== fact.field)
        throw new Error("정정·철회할 항목을 특정할 수 없습니다.");
      known.delete(fact.target_id!);
      if (fact.operation === "retract" && fact.value !== null)
        throw new Error("철회 항목의 값이 비어 있지 않습니다.");
    }
    if (fact.operation !== "retract")
      known.set(fact.local_id, fact as ClinicalRecord);
  }
  for (const issue of parsed.issues) {
    if (issue.evidence && !text.includes(issue.evidence))
      throw new Error("확인 사항의 원문 근거가 일치하지 않습니다.");
    if (containsIdentifier(issue.message + (issue.evidence ?? "")))
      throw new Error("식별정보가 포함된 응답을 차단했습니다.");
  }
  return parsed;
}

export function applyExtraction(
  prior: ClinicalRecord[],
  result: Extraction,
  revision: number,
  provenance: "model" | "example" = "model",
): ClinicalRecord[] {
  const records = prior.map((f) => ({ ...f }));
  const localIds = new Map<string, string>();
  for (const fact of result.facts) {
    const id = `r${revision}-${fact.local_id}`;
    const targetId = localIds.get(fact.target_id ?? "") ?? fact.target_id;
    if (fact.operation !== "add") {
      const target = records.find((f) => f.id === targetId && f.active);
      if (!target || target.field !== fact.field)
        throw new Error("정정 대상이 변경되었습니다. 다시 추출해 주세요.");
      target.active = false;
    }
    records.push({
      ...fact,
      target_id: targetId,
      group_id: fact.group_id ? `r${revision}-${fact.group_id}` : null,
      id,
      active: fact.operation !== "retract",
      provenance,
    });
    localIds.set(fact.local_id, id);
  }
  return records;
}

// Conservative projection for the existing API; all reviewed facts also travel intact.
// Conflicting/repeated values are not collapsed into an invented "latest" measurement.
export function projectPatient(records: ClinicalRecord[]) {
  const active = records.filter((f) => f.active);
  const number = (field: FieldName, unit?: string) => {
    const facts = active.filter((f) => f.field === field);
    if (
      !facts.length ||
      facts.some(
        (f) =>
          f.status !== "affirmed" ||
          typeof f.value !== "number" ||
          (unit && f.unit !== unit),
      )
    )
      return null;
    const values = new Set(facts.map((f) => f.value as number));
    return values.size === 1 ? [...values][0] : null;
  };
  const age = number("patient.age", "year"),
    ktas = number("triage.pre_ktas");
  const texts = (fields: FieldName[], statuses = ["affirmed", "uncertain"]) =>
    active
      .filter(
        (f) =>
          fields.includes(f.field) &&
          statuses.includes(f.status) &&
          typeof f.value === "string",
      )
      .map((f) =>
        f.status === "uncertain" ? `${f.value} (불확실)` : String(f.value),
      );
  return {
    ageYears:
      age !== null && Number.isInteger(age) && age >= 0 && age <= 130
        ? age
        : null,
    symptoms: texts(["presentation.chief_complaint", "presentation.symptom"]),
    preKtas:
      ktas !== null && Number.isInteger(ktas) && ktas >= 1 && ktas <= 5
        ? ktas
        : null,
    vitals: {
      systolic: number("vitals.sbp", "mmHg"),
      diastolic: number("vitals.dbp", "mmHg"),
      heartRate: number("vitals.pulse", "/min"),
      spo2: number("vitals.spo2", "%"),
      respiratoryRate: number("vitals.respiratory_rate", "/min"),
      temperature: number("vitals.temperature", "Cel"),
    },
    suspectedCondition:
      texts(["assessment.stated_impression"]).join(" · ") || null,
    requiredResources: texts(["assessment.requested_resource"], ["affirmed"]),
    clinicalFacts: records,
  };
}

export const EXAMPLE_TEXT =
  "58세 환자. 30분 전부터 흉통이 있다고 말함. 대원이 측정한 혈압 100에 65 mmHg, 산소포화도 92%. 당뇨는 없다고 말함. Pre-KTAS 2로 평가함.";
export function exampleExtraction(): Extraction {
  const make = (
    field: FieldName,
    value: Fact["value"],
    evidence: string,
    unit: string | null = null,
    status: Fact["status"] = "affirmed",
    source: Fact["source"] = "unspecified",
  ): Fact => ({
    local_id: "n0",
    field,
    value,
    unit,
    status,
    source,
    subject: "patient",
    evidence,
    time_text: null,
    group_id: null,
    operation: "add",
    target_id: null,
  });
  const facts = [
    make("patient.age", 58, "58세", "year"),
    make(
      "presentation.chief_complaint",
      "흉통",
      "30분 전부터 흉통이 있다고 말함",
      null,
      "affirmed",
      "patient_report",
    ),
    make(
      "vitals.sbp",
      100,
      "대원이 측정한 혈압 100에 65 mmHg",
      "mmHg",
      "affirmed",
      "ems_observation",
    ),
    make(
      "vitals.dbp",
      65,
      "대원이 측정한 혈압 100에 65 mmHg",
      "mmHg",
      "affirmed",
      "ems_observation",
    ),
    make("vitals.spo2", 92, "산소포화도 92%", "%"),
    make(
      "history.condition",
      "당뇨",
      "당뇨는 없다고 말함",
      null,
      "negated",
      "patient_report",
    ),
    make("triage.pre_ktas", 2, "Pre-KTAS 2로 평가함"),
  ];
  facts[1].time_text = "30분 전부터";
  facts[2].group_id = facts[3].group_id = "bp1";
  return {
    facts: facts.map((f, i) => ({ ...f, local_id: `n${i + 1}` })),
    issues: [],
  };
}
