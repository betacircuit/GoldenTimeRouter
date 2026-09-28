import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";

export default function RequestProgress({
  phase,
  onCancel,
  extraction = true,
}: {
  phase: "extract" | "locate" | "recommend";
  onCancel: () => void;
  extraction?: boolean;
}) {
  const [started] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [started]);
  const steps =
    phase === "locate"
      ? ["현재 위치 확인", "병원·이동 시간 조회", "결과 표시"]
      : extraction
        ? ["환자 정보 정리", "병원·이동 시간 조회", "결과 표시"]
        : ["병원·이동 시간 조회", "결과 표시"];
  const current =
    phase === "extract" || phase === "locate" || !extraction ? 0 : 1;
  return (
    <div className="request-progress" aria-label="요청 처리 진행 상황">
      <div className="progress-symbol">
        <LoaderCircle size={28} className="spin" />
      </div>
      <h2 role="status">
        {phase === "extract"
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
            {step}
            <div className="stage-track">
              <span />
            </div>
          </li>
        ))}
      </ol>
      {elapsed >= 30 && <p>응답을 기다리고 있습니다.</p>}
      <button type="button" className="button secondary" onClick={onCancel}>
        검색 취소
      </button>
    </div>
  );
}
