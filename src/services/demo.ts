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

// Synthetic positions and values for UI demonstrations only.
const offsets = [
  [0.041, -0.019],
  [-0.027, 0.023],
  [0.065, 0.06],
  [0.006, -0.064],
  [0.057, 0.095],
  [-0.047, 0.07],
  [-0.07, -0.035],
  [0.065, -0.067],
  [-0.019, -0.102],
  [0.095, 0.015],
];
export function configureDemo(
  response: RecommendationResponse,
  config: DemoConfig,
  origin: Origin,
  patient: Patient,
): RecommendationResponse {
  return {
    ...response,
    candidates: response.candidates.map((c, i): Candidate => {
      const metric = config.metrics[i];
      const [lat, lng] =
        config.scenario === "wide" && i === 1 ? [0.18, 0.21] : offsets[i];
      const probability =
        config.scenario === "mixed" && i === 1
          ? null
          : metric.probability / 100;
      return {
        ...c,
        position: {
          lat: origin.lat + lat * (config.scenario === "clustered" ? 0.22 : 1),
          lng: origin.lng + lng * (config.scenario === "clustered" ? 0.22 : 1),
        },
        durationSeconds:
          config.scenario === "mixed" && i === 2 ? null : metric.minutes * 60,
        distanceMeters:
          config.scenario === "mixed" && i === 2
            ? null
            : Math.round(
                Math.hypot(lat * 111, lng * 88) *
                  1000 *
                  (config.scenario === "clustered" ? 0.22 : 1),
              ),
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
