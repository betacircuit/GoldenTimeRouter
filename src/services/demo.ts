import type {
  Candidate,
  Origin,
  Patient,
  RecommendationResponse,
  Scenario,
} from "../domain";
import {
  applyExtraction,
  type Extraction,
  type Fact,
} from "../patient/extraction";
import {
  initialNatural,
  type NaturalDraft,
} from "../components/NaturalPatient";
import { distance, type CatalogHospital } from "./serverCatalog";

export const demoCases = [
  {
    id: "chest",
    name: "흉통",
    age: 58,
    symptom: "흉통",
    text: "58세 환자. 30분 전부터 흉통과 식은땀. 혈압 100/65 mmHg, 산소포화도 92%. 심장 진료와 응급 검사를 요청함.",
    resources: ["심장 진료", "응급 검사"],
  },
  {
    id: "stroke",
    name: "뇌졸중 의심",
    age: 72,
    symptom: "오른쪽 마비와 언어 장애",
    text: "72세 환자. 20분 전부터 오른쪽 팔에 힘이 없고 말이 어눌함. 뇌 영상 검사와 신경과 진료를 요청함.",
    resources: ["뇌 영상 검사", "신경과 진료"],
  },
  {
    id: "trauma",
    name: "교통사고",
    age: 35,
    symptom: "교통사고 후 복통",
    text: "35세 환자. 차량 충돌 후 복통과 왼쪽 다리 통증을 호소함. 의식은 명료함. 외상 진료와 CT 검사를 요청함.",
    resources: ["외상 진료", "CT 검사"],
  },
  {
    id: "child",
    name: "소아 고열",
    age: 6,
    symptom: "고열",
    text: "6세 환자. 오늘부터 39도 고열과 구토. 보호자와 동행 중이며 소아 진료를 요청함.",
    resources: ["소아 진료", "응급 검사"],
  },
  {
    id: "breathing",
    name: "호흡곤란",
    age: 67,
    symptom: "호흡곤란",
    text: "67세 환자. 1시간 전부터 호흡곤란이 심해짐. 산소포화도 88%. 호흡기 진료와 산소 치료를 요청함.",
    resources: ["호흡기 진료", "산소 치료"],
  },
] as const;

export const demoOrigins: Origin[] = [
  { label: "강남역", lat: 37.498, lng: 127.0276 },
  { label: "서울시청", lat: 37.5663, lng: 126.9779 },
  { label: "잠실역", lat: 37.5133, lng: 127.1001 },
];
export type DemoScenario = Scenario | "wide" | "clustered";
export interface DemoMetric {
  minutes: number;
  probability: number;
}
export interface DemoConfig {
  caseId: string;
  originIndex: number;
  scenario: DemoScenario;
  metrics: DemoMetric[];
}
export const defaultMetrics = (): DemoMetric[] =>
  [
    [8, 98],
    [6, 95],
    [12, 92],
    [14, 86],
    [17, 84],
    [15, 71],
    [22, 88],
    [18, 79],
    [20, 75],
    [24, 68],
  ].map(([minutes, probability]) => ({ minutes, probability }));
export const initialDemo = (): DemoConfig => {
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get("scenario") || "normal";
  return {
    caseId: demoCases.some((c) => c.id === params.get("case"))
      ? params.get("case")!
      : "chest",
    originIndex: Math.max(
      0,
      Math.min(2, Math.floor(Number(params.get("origin")) || 0)),
    ),
    scenario: [
      "normal",
      "three",
      "empty",
      "mixed",
      "error",
      "wide",
      "clustered",
    ].includes(scenario)
      ? (scenario as DemoScenario)
      : "normal",
    metrics: readMetrics(params.get("metrics")),
  };
};

function readMetrics(value: string | null): DemoMetric[] {
  const parsed = value?.split(",").map((pair) => {
    const [minutes, probability] = pair.split("-").map(Number);
    return { minutes, probability };
  });
  return parsed?.length === 10 &&
    parsed.every(
      (m) =>
        Number.isInteger(m.minutes) &&
        m.minutes >= 1 &&
        m.minutes <= 180 &&
        Number.isInteger(m.probability) &&
        m.probability >= 0 &&
        m.probability <= 100,
    )
    ? parsed
    : defaultMetrics();
}

export function demoDraft(config: DemoConfig): NaturalDraft {
  const c = demoCases.find((c) => c.id === config.caseId) || demoCases[0];
  let factId = 0;
  const fact = (
    field: Fact["field"],
    value: Fact["value"],
    evidence: string,
    unit: string | null = null,
  ): Fact => ({
    local_id: `n${++factId}`,
    field,
    value,
    unit,
    status: "affirmed",
    source: "unspecified",
    subject: "patient",
    evidence,
    time_text: null,
    group_id: null,
    operation: "add",
    target_id: null,
  });
  const extraction: Extraction = {
    facts: [
      fact("patient.age", c.age, `${c.age}세`, "year"),
      fact("presentation.chief_complaint", c.symptom, c.text),
      ...c.resources.map((r) => fact("assessment.requested_resource", r, r)),
    ],
    issues: [],
  };
  if (c.id === "chest")
    extraction.facts.push(
      fact("vitals.sbp", 100, "혈압 100/65 mmHg", "mmHg"),
      fact("vitals.dbp", 65, "혈압 100/65 mmHg", "mmHg"),
      fact("vitals.spo2", 92, "산소포화도 92%", "%"),
    );
  if (c.id === "breathing")
    extraction.facts.push(fact("vitals.spo2", 88, "산소포화도 88%", "%"));
  if (c.id === "child")
    extraction.facts.push(fact("vitals.temperature", 39, "39도", "Cel"));
  return {
    ...initialNatural(),
    text: c.text,
    extractedText: c.text,
    revision: 1,
    source: "example",
    records: applyExtraction([], extraction, 1, "example"),
  };
}

// The demonstration changes model outputs, never hospital identity or location.
export function configureDemo(
  response: RecommendationResponse,
  config: DemoConfig,
  origin: Origin,
  patient: Patient,
  hospitals: CatalogHospital[],
): RecommendationResponse {
  const nearest = hospitals
    .filter((h) => h.latitude !== null && h.longitude !== null)
    .map((h) => ({
      hospital: h,
      meters: distance(origin, { lat: h.latitude!, lng: h.longitude! }),
    }))
    .sort((a, b) => a.meters - b.meters);
  if (nearest.length < response.candidates.length)
    throw new Error("실제 병원 위치 데이터가 충분하지 않습니다.");
  const chosen = nearest.slice(0, response.candidates.length);
  if (config.scenario === "wide" && chosen.length > 1) {
    const distant = nearest.find((h) => h.meters > 12000);
    if (distant) chosen[1] = distant;
  }
  return {
    ...response,
    candidates: response.candidates.map((c, i): Candidate => {
      const metric = config.metrics[i];
      const { hospital, meters } = chosen[i];
      const probability =
        config.scenario === "mixed" && i === 1
          ? null
          : Math.max(0, metric.probability) / 100;
      return {
        ...c,
        id: hospital.hospital_id,
        name: hospital.hospital_name,
        level: hospital.emergency_institution_category_name || "응급의료기관",
        position: { lat: hospital.latitude!, lng: hospital.longitude! },
        durationSeconds:
          config.scenario === "mixed" && i === 2 ? null : metric.minutes * 60,
        distanceMeters:
          config.scenario === "mixed" && i === 2
            ? null
            : meters,
        distanceKind: "straight",
        probability,
        interval:
          probability === null
            ? null
            : {
                lower: Math.max(0, probability - 0.07),
                upper: Math.min(1, probability + 0.02),
                level: 0.9,
              },
        reasons: [
          patient.requiredResources.length
            ? `${patient.requiredResources.slice(0, 2).join("·")} 요청에 맞춘 데모 후보입니다.`
            : `${patient.symptoms.slice(0, 2).join("·") || "입력된 환자 상태"}를 반영한 데모 후보입니다.`,
        ],
      };
    }),
  };
}
