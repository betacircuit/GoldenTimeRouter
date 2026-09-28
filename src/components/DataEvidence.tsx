import { useEffect, useRef, useState } from "react";
import { Database, X, Info } from "lucide-react";
import { z } from "zod";
const schema = z.object({
  generatedAt: z.string(),
  profiledAt: z.string(),
  nedis: z.object({
    rows: z.number(),
    columns: z.number(),
    verifiedArchives: z.number(),
    years: z.array(
      z.object({
        year: z.number(),
        rows: z.number(),
        ktas: z.array(z.object({ label: z.string(), count: z.number() })),
      }),
    ),
  }),
  tables: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.string(),
      use: z.string(),
      rows: z.number(),
      files: z.number(),
    }),
  ),
});
export default function DataEvidence({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<z.infer<typeof schema> | null>(null);
  const [error, setError] = useState("");
  const [year, setYear] = useState(2024);
  useEffect(() => {
    dialog.current?.showModal();
    const control = new AbortController();
    fetch("/data-insights.json", { signal: control.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((v) => setData(schema.parse(v)))
      .catch(() => {
        if (!control.signal.aborted)
          setError("데이터 집계를 불러오지 못했습니다.");
      });
    return () => control.abort();
  }, []);
  const chosen = data?.nedis.years.find((y) => y.year === year);
  return (
    <dialog
      ref={dialog}
      className="data-dialog"
      onCancel={onClose}
      aria-labelledby="data-evidence-title"
    >
      <div className="data-dialog-heading">
        <div>
          <span className="eyebrow">DATA EVIDENCE</span>
          <h2 id="data-evidence-title">
            <Database size={22} /> 데이터 근거와 활용
          </h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="데이터 근거 닫기"
          autoFocus
        >
          <X />
        </button>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p role="status">집계 정보를 불러오는 중입니다.</p>
      ) : (
        <>
          <div className="data-summary">
            <div>
              <strong>{data.tables.length}</strong>
              <span>서버 데이터 종류</span>
            </div>
            <div>
              <strong>{data.nedis.rows.toLocaleString()}</strong>
              <span>NEDIS 표본 행 · 2018–2024</span>
            </div>
            <div>
              <strong>{data.nedis.verifiedArchives}/7</strong>
              <span>로컬·서버 파일 일치</span>
            </div>
          </div>
          <section className="data-research">
            <div className="section-heading">
              <h3>NEDIS 연도별 중증도 분포</h3>
              <label>
                <span className="sr-only">NEDIS 자료 연도</span>
                <select
                  aria-label="NEDIS 자료 연도"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  {data.nedis.years.map((y) => (
                    <option key={y.year} value={y.year}>
                      {y.year}년
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="help">
              선택 연도 전체 {chosen?.rows.toLocaleString()}행 기준 · 최초
              KTAS(내원 후 분류). 현장 Pre-KTAS와 구분합니다.
            </p>
            <div className="distribution-bars">
              {chosen?.ktas.map((k) => (
                <div key={k.label}>
                  <span>{k.label}</span>
                  <div className="distribution-track">
                    <i style={{ width: `${(k.count / chosen.rows) * 100}%` }} />
                  </div>
                  <strong>
                    {((k.count / chosen.rows) * 100).toFixed(1)}%{" "}
                    <small>{k.count.toLocaleString()}건</small>
                  </strong>
                </div>
              ))}
            </div>
            <p className="data-caution">
              <Info size={18} /> 공개 표본의 기술 통계입니다. 현재 환자의
              위험·생존·병원 수용 확률로 해석하지 않습니다.
            </p>
            <div className="data-uses">
              <p>
                <strong>활용 가능</strong>연도별 분포 변화, 결측 처리,
                중증도·입원·전원 예측의 시간 분리 검증
              </p>
              <p>
                <strong>추가 데이터 필요</strong>병원 수락·거절, 실제 처치, 119
                탐색 기록, NEMC 병원 ID 연결
              </p>
            </div>
          </section>
          <section>
            <h3>서버 데이터 전체 목록</h3>
            <p className="help">
              {new Date(data.generatedAt).toLocaleString("ko-KR")} 감사 집계 ·
              행 수는 스냅샷 기준
            </p>
            <div className="data-source-list">
              {data.tables.map((t) => (
                <article key={t.id}>
                  <div>
                    <strong>{t.name}</strong>
                    <span
                      className={`data-status ${t.status === "화면 연결" ? "connected" : ""}`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <p>{t.use}</p>
                  <small>
                    {t.rows.toLocaleString()}행 · {t.files.toLocaleString()}개
                    파일
                  </small>
                </article>
              ))}
            </div>
          </section>
          <p className="help">
            환자 원본 행은 브라우저로 보내지 않습니다. NEDIS 분석 기준{" "}
            {new Date(data.profiledAt).toLocaleDateString("ko-KR")} · ZIP CRC 및
            SHA-256 검증 완료.
          </p>
        </>
      )}
    </dialog>
  );
}
