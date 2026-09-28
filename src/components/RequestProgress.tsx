import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";

export type RequestPhase = "extract" | "locate" | "recommend";
const labels: Record<RequestPhase, string> = {
  extract: "환자 정보 정리",
  locate: "현재 위치 확인",
  recommend: "병원·이동 시간 조회",
};

export default function RequestProgress({
  phase,
  onCancel,
  extraction = true,
  steps: configuredSteps,
}: {
  phase: RequestPhase | "complete";
  onCancel: () => void;
  extraction?: boolean;
  steps?: RequestPhase[];
}) {
  const [started] = useState(() => Date.now());
  // Freeze the pipeline for this request so completed stages never disappear.
  const [steps] = useState<RequestPhase[]>(
    () =>
      configuredSteps ??
      (extraction ? ["extract", "recommend"] : ["recommend"]),
  );
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [started]);
  const complete = phase === "complete";
  const current = complete ? steps.length : Math.max(0, steps.indexOf(phase));
  return (
    <div
      className="request-progress"
      aria-label="요청 처리 진행 상황"
      data-phase={phase}
    >
      <div className="progress-symbol">
        {complete ? (
          <Check size={28} />
        ) : (
          <LoaderCircle size={28} className="spin" />
        )}
      </div>
      <h2 role="status">
        {complete
          ? "병원 조회를 완료했어요"
          : phase === "extract"
            ? "작성한 환자 정보를 정리하고 있어요"
            : phase === "locate"
              ? "검색에 사용할 현재 위치를 확인하고 있어요"
              : "병원과 이동 시간을 확인하고 있어요"}
      </h2>
      <div className="elapsed-time" role="timer" aria-live="off">
        <strong>{elapsed}</strong>초 경과
      </div>
      <ol className="request-stages">
        {steps.map((step, i) => (
          <li
            key={step}
            className={i < current ? "done" : i === current ? "active" : ""}
            aria-current={i === current ? "step" : undefined}
          >
            <span>{i < current ? <Check size={16} /> : i + 1}</span>
            {labels[step]}
            <div
              className="stage-track"
              role="progressbar"
              aria-label={labels[step]}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={i < current ? 100 : i > current ? 0 : undefined}
              aria-valuetext={
                i < current ? "완료" : i === current ? "진행 중" : "대기 중"
              }
            >
              <span />
            </div>
          </li>
        ))}
      </ol>
      {elapsed >= 30 && !complete && <p>응답을 기다리고 있습니다.</p>}
      <button
        type="button"
        className="button secondary"
        onClick={onCancel}
        disabled={complete}
      >
        검색 취소
      </button>
    </div>
  );
}
