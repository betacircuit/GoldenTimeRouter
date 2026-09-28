import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
  type ReactNode,
} from "react";
import { FileText, Info } from "lucide-react";
import {
  applyExtraction,
  containsIdentifier,
  extractionResponseSchema,
  validateExtraction,
  type ClinicalRecord,
  type Extraction,
} from "../patient/extraction";

export interface NaturalPatientHandle {
  extract: () => Promise<NaturalDraft | null>;
  cancel: () => void;
}
export interface NaturalDraft {
  text: string;
  extractedText: string;
  records: ClinicalRecord[];
  issues: Extraction["issues"];
  reviewedAt: string | null;
  revision: number;
  mode: "replace" | "append";
  source: "model" | "example" | null;
}
export const initialNatural = (): NaturalDraft => ({
  text: "",
  extractedText: "",
  records: [],
  issues: [],
  reviewedAt: null,
  revision: 0,
  mode: "replace",
  source: null,
});
export function isReady(d: NaturalDraft) {
  return (
    Boolean(d.reviewedAt) &&
    d.text === d.extractedText &&
    d.records.some((f) => f.active)
  );
}

export default function NaturalPatient({
  value,
  onChange,
  disabled,
  onBusy,
  controlRef,
  action,
}: {
  value: NaturalDraft;
  onChange: (v: NaturalDraft) => void;
  disabled: boolean;
  onBusy: (v: boolean) => void;
  controlRef: Ref<NaturalPatientHandle>;
  action?: ReactNode;
  onExample?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef<AbortController | null>(null);
  const version = useRef(0);
  useEffect(() => {
    setError("");
  }, [value.revision, value.source]);
  useEffect(() => () => activeRequest.current?.abort(), []);

  async function extract(): Promise<NaturalDraft | null> {
    if (activeRequest.current) return null;
    if (
      value.text === value.extractedText &&
      value.records.some((f) => f.active)
    )
      return value;
    if (!value.text.trim()) {
      setError("환자 상태를 입력해 주세요.");
      return null;
    }
    if (containsIdentifier(value.text)) {
      setError(
        "이름·연락처·주민번호·상세 주소를 지운 뒤 환자 상태만 입력해 주세요.",
      );
      return null;
    }
    const requestVersion = ++version.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    onBusy(true);
    setError("");
    const timeout = setTimeout(() => controller.abort(), 65000);
    try {
      const prior = value.mode === "append" ? value.records : [];
      const res = await fetch("/patient-api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: value.text,
          inputVersion: requestVersion,
          priorFacts: prior,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error || "환자 정보 추출에 실패했습니다.");
      const parsed = extractionResponseSchema.parse(json);
      if (parsed.inputVersion !== requestVersion || controller.signal.aborted)
        return null;
      const result = validateExtraction(
        { facts: parsed.facts, issues: parsed.issues },
        value.text,
        prior,
      );
      const records = applyExtraction(prior, result, value.revision + 1);
      if (records.length > 200)
        throw new Error(
          "기록이 너무 많습니다. 한 환자의 관련 기록만 남겨 주세요.",
        );
      const next: NaturalDraft = {
        ...value,
        records,
        issues: result.issues,
        revision: value.revision + 1,
        extractedText: value.text,
        reviewedAt: null,
        source: "model",
      };
      onChange(next);
      return next;
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "추출에 실패했습니다. 입력은 유지됩니다.",
        );
      else if (activeRequest.current === controller)
        setError("추출 시간이 초과되었습니다. 입력은 유지됩니다.");
      return null;
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
        onBusy(false);
      }
    }
  }
  const cancel = () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setLoading(false);
    onBusy(false);
    setError("");
  };
  useImperativeHandle(controlRef, () => ({ extract, cancel }));

  return (
    <section className="patient-composer">
      <div className="patient-composer-heading">
        <h1>
          <FileText size={19} /> 환자 정보
        </h1>
        <span>{value.text.length.toLocaleString()} / 6,000</span>
      </div>
      <label className="sr-only" htmlFor="patient-narrative">
        환자 관찰 기록
      </label>
      <textarea
        id="patient-narrative"
        value={value.text}
        disabled={loading || disabled}
        rows={3}
        maxLength={6000}
        placeholder="환자의 증상, 발생 시각, 관찰한 상태를 입력하세요."
        onChange={(e) => {
          onChange({ ...value, text: e.target.value, reviewedAt: null });
          setError("");
        }}
      />
      <div className="patient-composer-footer">
        <span>관찰한 내용을 자유롭게 적어 주세요.</span>
        {action}
      </div>
      {error && (
        <div className="inline-alert" role="alert">
          <Info size={16} />
          {error}
        </div>
      )}
    </section>
  );
}
