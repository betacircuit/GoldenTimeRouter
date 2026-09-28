import { z } from "zod";
import { recordSchema } from "./patient/extraction.js";

export const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export const originSchema = pointSchema.extend({
  label: z.string(),
  accuracyMeters: z.number().nonnegative().optional(),
  capturedAt: z.iso.datetime({ offset: true }).optional(),
});
const nullableNumber = z.number().finite().nullable();
export const patientSchema = z.object({
  ageYears: z.number().int().min(0).max(130).nullable(),
  symptoms: z.array(z.string().min(1)),
  clinicalFacts: z.array(recordSchema).max(200).optional(),
  reviewedAt: z.iso.datetime({ offset: true }).optional(),
  preKtas: z.number().int().min(1).max(5).nullable(),
  vitals: z.object({
    systolic: nullableNumber,
    diastolic: nullableNumber,
    heartRate: nullableNumber,
    spo2: nullableNumber,
    respiratoryRate: nullableNumber,
    temperature: nullableNumber,
  }),
  suspectedCondition: z.string().nullable(),
  requiredResources: z.array(z.string()),
});
export const requestSchema = z.object({
  origin: originSchema,
  patient: patientSchema,
});
export const resourceSchema = z.object({
  name: z.string(),
  status: z.enum(["met", "unmet", "unknown"]),
});
const intervalSchema = z
  .object({
    lower: z.number().min(0).max(1),
    upper: z.number().min(0).max(1),
    level: z.number().gt(0).lt(1),
  })
  .refine((v) => v.lower <= v.upper, "Invalid probability interval");
export const candidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.string(),
  position: pointSchema,
  rank: z.number().int().positive(),
  durationSeconds: z.number().nonnegative().nullable(),
  distanceMeters: z.number().nonnegative().nullable(),
  distanceKind: z.enum(["road", "straight"]).optional(),
  probability: z
    .number()
    .max(1)
    .transform((value) => Math.max(0, value))
    .nullable(),
  interval: intervalSchema.nullable(),
  resources: z.array(resourceSchema),
  reasons: z.array(z.string()),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
  dataStatus: z.enum(["fresh", "stale", "unknown"]),
  routeStatus: z.enum(["available", "unavailable"]),
  structural: z
    .object({
      matchMethod: z.string(),
      matchConfidence: z.number(),
      facts: z.array(
        z.object({
          label: z.string(),
          value: z.string(),
          recordedAt: z.string(),
          source: z.string(),
          group: z.string(),
        }),
      ),
    })
    .optional(),
  traumaCenter: z.boolean().optional(),
  observations: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        recordedAt: z.string(),
        source: z.string(),
      }),
    )
    .optional(),
});
export const responseSchema = z
  .object({
    requestId: z.string(),
    generatedAt: z.iso.datetime({ offset: true }),
    isDemo: z.boolean(),
    model: z.object({ name: z.string(), version: z.string() }),
    rankingBasis: z.enum(["model", "distance", "eta"]).optional(),
    routingNotice: z.string().optional(),
    routingQueriedAt: z.string().optional(),
    snapshotAt: z.string().optional(),
    candidates: z.array(candidateSchema).max(10),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.candidates.map((c) => c.id)).size !==
        value.candidates.length ||
      new Set(value.candidates.map((c) => c.rank)).size !==
        value.candidates.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Hospital IDs and ranks must be unique",
      });
    }
  });
export const hospitalSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  emergencyPhone: z.string().nullable(),
  isDemo: z.boolean(),
});
export const routeSchema = z.object({
  path: z.array(pointSchema).min(2),
  durationSeconds: z.number().nonnegative(),
  distanceMeters: z.number().nonnegative(),
  isDemo: z.boolean(),
});

export type Point = z.infer<typeof pointSchema>;
export type Origin = z.infer<typeof originSchema>;
export type Patient = z.infer<typeof patientSchema>;
export type RecommendationRequest = z.infer<typeof requestSchema>;
export type RecommendationResponse = z.infer<typeof responseSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type Hospital = z.infer<typeof hospitalSchema>;
export type Route = z.infer<typeof routeSchema>;
export type Scenario = "normal" | "three" | "empty" | "mixed" | "error";
export type Sort = "rank" | "eta";

export const percent = (value: number | null) =>
  value === null
    ? "예측 정보 없음"
    : `${Math.round(Math.max(0, value) * 100)}%`;
export const minutes = (seconds: number | null) => {
  if (seconds === null) return "조회 불가";
  const total = Math.ceil(seconds / 60);
  return total < 60
    ? `${total}분`
    : `${Math.floor(total / 60)}시간${total % 60 ? ` ${total % 60}분` : ""}`;
};
export const elapsedTime = (seconds: number) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${seconds >= 3600 ? `${Math.floor(seconds / 3600)}:` : ""}${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
};
export const clockTime = (value: string | Date) =>
  new Date(value).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export const sortCandidates = (items: Candidate[], sort: Sort) =>
  [...items].sort((a, b) =>
    sort === "eta"
      ? (a.durationSeconds ?? Infinity) - (b.durationSeconds ?? Infinity) ||
        a.rank - b.rank
      : a.rank - b.rank,
  );
export const resourceLabel = {
  met: "충족",
  unmet: "미충족",
  unknown: "확인 필요",
} as const;
export const DEMO_ORIGINS: Origin[] = [
  { label: "서울시청 · 서울 중구 세종대로 110", lat: 37.5663, lng: 126.9779 },
  {
    label: "광화문광장 · 서울 종로구 세종대로 172",
    lat: 37.5727,
    lng: 126.9768,
  },
  { label: "서울역 · 서울 용산구 한강대로 405", lat: 37.5547, lng: 126.9707 },
];
