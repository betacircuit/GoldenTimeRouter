import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import {
  Check,
  ChevronDown,
  FileText,
  Info,
  LoaderCircle,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { FIELD_CATALOG } from "../patient/catalog";
import {
  applyExtraction,
  containsIdentifier,
  extractionResponseSchema,
  fieldInfo,
  sourceLabels,
  statusLabels,
  validateExtraction,
  type ClinicalRecord,
  type Extraction,
  type Fact,
  type FieldName,
} from "../patient/extraction";
import NumberWheel from "./NumberWheel";
import Pager from "./Pager";
export interface NaturalPatientHandle { extract: (review?: boolean) => Promise<NaturalDraft | null>; cancel: () => void; }

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
const integerFields = new Set<FieldName>([
  "patient.age",
  "exam.gcs_total",
  "exam.gcs_eye",
  "exam.gcs_verbal",
  "exam.gcs_motor",
  "triage.pre_ktas",
]);

export default function NaturalPatient({
  value,
  onChange,
  disabled,
  onBusy,
  controlRef,
  onExample,
}: {
  value: NaturalDraft;
  onChange: (v: NaturalDraft) => void;
  disabled: boolean;
  onBusy: (v: boolean) => void;
  controlRef: Ref<NaturalPatientHandle>;
  onExample: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [page, setPage] = useState(0);
  const reviewRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (review && !reviewRef.current?.open) reviewRef.current?.showModal(); if (!review) reviewRef.current?.close(); }, [review, value.records.length]);
  const [editing, setEditing] = useState<ClinicalRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [addField, setAddField] = useState<FieldName>("vitals.spo2");
  const activeRequest = useRef<AbortController | null>(null);
  const version = useRef(0);
  useEffect(() => {
    setError("");
  }, [value.revision, value.source]);
  useEffect(() => () => activeRequest.current?.abort(), []);
  const patch = (v: Partial<NaturalDraft>) => onChange({ ...value, ...v });
  const stale = value.records.length > 0 && value.text !== value.extractedText;
  const active = value.records.filter((f) => f.active);
  const shown = active.slice(page * 4, page * 4 + 4);
  const groups = [...new Set(shown.map((f) => f.field.split(".")[0]))];
  const groupLabels: Record<string, string> = {
    patient: "기본 정보",
    presentation: "증상·경과",
    vitals: "활력징후",
    exam: "관찰·평가",
    history: "병력·약제",
    incident: "발생 상황",
    oxygen: "산소",
    special: "특이 사항",
    treatment: "처치",
    triage: "중증도",
    assessment: "언급한 판단·요청",
    transport: "이송",
    notes: "기타",
  };
  async function extract(openReview = false): Promise<NaturalDraft | null> {
    if (activeRequest.current) return null;
    if (value.text === value.extractedText && active.length) { if (openReview) setReview(true); return value; }
    if (!value.text.trim()) { setError("환자 상태를 입력해 주세요."); return null; }
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
      const next: NaturalDraft = { ...value, records, issues: result.issues, revision: value.revision + 1, extractedText: value.text, reviewedAt: null, source: "model" };
      onChange(next); setPage(0);
      if (openReview) setReview(true);
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
    setError("추출을 취소했습니다. 작성한 내용은 유지됩니다.");
  };
  useImperativeHandle(controlRef, () => ({ extract, cancel }));
  const saveFact = (record: ClinicalRecord) => {
    const old = value.records.find((f) => f.id === record.id);
    // Preserve the extracted fact and attach a separate reviewer correction.
    const newId = `manual-${crypto.randomUUID()}`;
    const corrected: ClinicalRecord = {
      ...record,
      id: newId,
      provenance: "manual",
      originalValue: old?.value,
      operation: old ? "correct" : "add",
      target_id: old?.id ?? null,
      active: true,
    };
    patch({
      records: old ? value.records.flatMap((f) => f.id === old.id ? [{ ...f, active: false }, corrected] : [f]) : [...value.records, corrected],
      reviewedAt: null,
    });
    setEditing(null);
  };
  return (
    <section className="panel natural-panel composer-panel">
      <div className="composer-heading"><div><h1>환자 정보</h1></div><button type="button" className="button ghost example-button" disabled={disabled || loading} onClick={onExample}><Sparkles size={16}/> 예시 입력</button></div>
      <div className="natural-editor">
        <div className="editor-caption">
          <FileText size={17} />
          <label htmlFor="patient-narrative">
            {value.mode === "append" ? "추가·정정 기록" : "환자 관찰 기록"}
          </label>
          <span>{value.text.length.toLocaleString()} / 6,000</span>
        </div>
        <textarea
          id="patient-narrative"
          value={value.text}
          disabled={loading || disabled}
          rows={6}
          maxLength={6000}
          placeholder="예: 60대 남성, 30분 전부터 흉통 호소. 혈압 100에 65 mmHg, 산소포화도 92%. 당뇨는 없다고 말함. 알레르기는 모름."
          onChange={(e) => {
            patch({ text: e.target.value, reviewedAt: null });
            setError("");
          }}
        />
        <div className="editor-footer">

          <button
            type="button"
            className="button primary"
            disabled={loading || disabled || !value.text.trim()}
            onClick={() => void extract(true)}
          >
            {loading ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <Sparkles size={18} />
            )}{" "}
            {loading ? "정보 추출 중" : "정보 확인"}
          </button>
        </div>
      </div>
      {error && (
        <div className="inline-alert" role="alert">
          <Info size={17} />
          {error}
        </div>
      )}
      {(value.records.length > 0 || value.source) && (
        <dialog ref={reviewRef} className="extraction-review review-dialog" aria-label="환자 정보 검토" onCancel={() => setReview(false)}>
          <button type="button" className="icon-button review-close" aria-label="추출 정보 닫기" onClick={() => setReview(false)}><X size={20}/></button>
          <div className="review-heading">
            <div>
              
              <h3>
                추출 정보 확인 <span>{active.length}</span>
              </h3>
            </div>
          </div>
          {!active.length && (
            <p className="notice">
              추출된 환자 정보가 없습니다. 관찰한 상태를 입력하거나 항목을
              추가해 주세요.
            </p>
          )}
          {groups.map((group) => (
            <section className="fact-group" key={group}>
              <h4>{groupLabels[group] ?? group}</h4>
              <div className="fact-grid">
                {shown
                  .filter((f) => f.field.startsWith(`${group}.`))
                  .map((f) => (
                    <button
                      type="button"
                      key={f.id}
                      className={`fact-card status-${f.status}`}
                      disabled={disabled || loading || stale}
                      onClick={() => setEditing(f)}
                      aria-label={`${fieldInfo(f.field).label} 수정: ${f.value ?? statusLabels[f.status]}`}
                    >
                      <span className="fact-label">
                        {fieldInfo(f.field).label}
                        <span className="fact-status">
                          {statusLabels[f.status]}
                        </span>
                      </span>
                      <strong>
                        {f.value ?? "미상"}
                        <small>
                          {f.unit ||
                            (fieldInfo(f.field).type === "number"
                              ? "단위 미상"
                              : "")}
                        </small>
                        <ChevronDown size={16} />
                      </strong>
                      <span className="fact-evidence">“{f.evidence}”</span>
                      <span className="fact-source">
                        {f.provenance === "manual"
                          ? "검토자 수정"
                          : sourceLabels[f.source]}
                        {f.time_text ? ` · ${f.time_text}` : ""}
                      </span>
                    </button>
                  ))}
              </div>
            </section>
          ))}
          <Pager page={page} count={Math.ceil(active.length / 4)} onChange={setPage} label="추출 정보"/>
          {value.issues.length > 0 && (
            <div className="review-issues">
              <h4>
                <Info size={17} /> 함께 확인할 내용
              </h4>
              {value.issues.map((issue, i) => (
                <p key={i}>
                  {issue.message}
                  {issue.evidence && <q>{issue.evidence}</q>}
                </p>
              ))}
            </div>
          )}
          <div className="review-tools">
            <button
              type="button"
              className="button secondary"
              disabled={disabled || loading || stale}
              onClick={() => setAdding((v) => !v)}
            >
              <Plus size={17} /> 항목 추가
            </button>
            <button
              type="button"
              className="button ghost"
              disabled={disabled || loading || stale}
              onClick={() =>
                patch({
                  mode: "append",
                  text: "",
                  extractedText: "",
                  reviewedAt: null,
                })
              }
            >
              추가·정정 기록 입력
            </button>
          </div>
          {adding && (
            <div className="add-fact">
              <label htmlFor="new-fact">보완할 항목</label>
              <select
                id="new-fact"
                value={addField}
                onChange={(e) => setAddField(e.target.value as FieldName)}
              >
                {FIELD_CATALOG.map((f) => (
                  <option value={f.field} key={f.field}>
                    {f.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setEditing({
                    id: "new",
                    local_id: "n0",
                    active: true,
                    field: addField,
                    value: null,
                    unit: null,
                    status: "unknown",
                    subject: "patient",
                    source: "unspecified",
                    time_text: null,
                    group_id: null,
                    evidence: "검토자가 직접 입력",
                    operation: "add",
                    target_id: null,
                    provenance: "manual",
                  });
                  setAdding(false);
                }}
              >
                값 입력
              </button>
            </div>
          )}
          {value.records.some((f) => !f.active) && (
            <details className="fact-history">
              <summary>
                정정·철회 이력 {value.records.filter((f) => !f.active).length}건
              </summary>
              {value.records
                .filter((f) => !f.active)
                .map((f) => (
                  <p key={f.id}>
                    {fieldInfo(f.field).label} · {f.value ?? "미상"} {f.unit} ·{" "}
                    {f.operation === "retract" ? "철회" : "이전 기록"}
                  </p>
                ))}
            </details>
          )}
          <button type="button" className="button primary review-done" onClick={() => setReview(false)}>완료</button>
        </dialog>
      )}
      {editing && (
        <FactEditor
          record={editing}
          onSave={saveFact}
          onClose={() => setEditing(null)}
          onRemove={() => {
            patch({
              records: [
                ...value.records.map((f) =>
                  f.id === editing.id ? { ...f, active: false } : f,
                ),
                {
                  ...editing,
                  id: `manual-${crypto.randomUUID()}`,
                  value: null,
                  active: false,
                  provenance: "manual",
                  operation: "retract",
                  target_id: editing.id,
                },
              ],
              reviewedAt: null,
            });
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function FactEditor({
  record,
  onSave,
  onClose,
  onRemove,
}: {
  record: ClinicalRecord;
  onSave: (v: ClinicalRecord) => void;
  onClose: () => void;
  onRemove: () => void;
}) {
  const [current, setCurrent] = useState(record);
  const [wheel, setWheel] = useState(fieldInfo(record.field).type === "number");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!wheel) el?.showModal();
    return () => el?.close();
  }, [wheel]);
  const numeric = fieldInfo(record.field).type === "number";
  if (wheel)
    return (
      <NumberWheel
        label={fieldInfo(record.field).label}
        value={typeof current.value === "number" ? current.value : null}
        unit={current.unit}
        integer={integerFields.has(record.field)}
        min={record.field === "triage.pre_ktas" ? 1 : undefined}
        max={record.field === "triage.pre_ktas" ? 5 : undefined}
        onSave={(v) =>
          setCurrent((c) => ({
            ...c,
            value: v,
            status: v === null ? "unknown" : "affirmed",
          }))
        }
        onClose={() => setWheel(false)}
      />
    );
  return (
    <dialog
      className="fact-dialog"
      ref={ref}
      aria-labelledby="fact-title"
      onCancel={onClose}
    >
      <div className="dialog-heading">
        <h2 id="fact-title">{fieldInfo(record.field).label} 수정</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="항목 수정 닫기"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {numeric ? (
        <button
          type="button"
          className="numeric-trigger"
          onClick={() => setWheel(true)}
        >
          {current.value ?? "미상"}
          <span>{current.unit || "단위 미상"}</span>
          <ChevronDown size={18} />
        </button>
      ) : (
        <label>
          내용
          <input
            value={current.value === null ? "" : String(current.value)}
            maxLength={1000}
            onChange={(e) =>
              setCurrent((c) => ({ ...c, value: e.target.value || null }))
            }
          />
        </label>
      )}
      <div className="two-col">
        <label>
          상태
          <select
            value={current.status}
            onChange={(e) => {
              const status = e.target.value as Fact["status"];
              setCurrent((c) => ({
                ...c,
                status,
                value:
                  numeric &&
                  [
                    "unknown",
                    "not_measured",
                    "unobtainable",
                    "declined",
                  ].includes(status)
                    ? null
                    : c.value,
              }));
            }}
          >
            {Object.entries(statusLabels).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          단위
          <input
            value={current.unit ?? ""}
            maxLength={30}
            placeholder="미상"
            onChange={(e) =>
              setCurrent((c) => ({ ...c, unit: e.target.value || null }))
            }
          />
        </label>
      </div>
      <label>
        정보 출처
        <select
          value={current.source}
          onChange={(e) =>
            setCurrent((c) => ({
              ...c,
              source: e.target.value as Fact["source"],
            }))
          }
        >
          {Object.entries(sourceLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <p className="help">
        원문: {record.evidence}
        <br />
        수정 시 원래 추출값은 이력으로 남습니다.
      </p>
      <div className="wheel-actions">
        {record.id !== "new" && (
          <button type="button" className="button ghost" onClick={onRemove}>
            항목 철회
          </button>
        )}
        <button
          type="button"
          className="button primary"
          onClick={() => onSave(current)}
        >
          <Check size={18} /> 수정 저장
        </button>
      </div>
    </dialog>
  );
}
