import { useEffect, useRef, useState } from "react";
import { ArrowRight, FlaskConical, X } from "lucide-react";
import {
  demoCases,
  demoOrigins,
  type DemoConfig,
  type DemoScenario,
} from "../services/demo";

export default function DemoSettings({
  value,
  onRun,
  close,
}: {
  value: DemoConfig;
  onRun: (v: DemoConfig) => void;
  close: () => void;
}) {
  const [config, setConfig] = useState(() => ({
    ...value,
    metrics: value.metrics.map((m) => ({ ...m })),
  }));
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const el = dialog.current;
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="demo-dialog"
      aria-labelledby="demo-title"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onRun(config);
        }}
      >
        <div className="dialog-heading">
          <div>
            <span className="dialog-kicker">
              <FlaskConical size={15} /> DEMO STUDIO
            </span>
            <h2 id="demo-title">상황을 선택하고 둘러보세요</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="데모 닫기"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        <fieldset className="demo-cases">
          <legend>환자 시나리오</legend>
          {demoCases.map((c) => (
            <button
              type="button"
              key={c.id}
              className={config.caseId === c.id ? "active" : ""}
              aria-pressed={config.caseId === c.id}
              onClick={() => setConfig({ ...config, caseId: c.id })}
            >
              {c.name}
            </button>
          ))}
        </fieldset>
        <p className="demo-preview">
          {demoCases.find((c) => c.id === config.caseId)?.text}
        </p>
        <div className="demo-selects">
          <label>
            출발 위치
            <select
              aria-label="출발 위치"
              value={config.originIndex}
              onChange={(e) =>
                setConfig({ ...config, originIndex: Number(e.target.value) })
              }
            >
              {demoOrigins.map((o, i) => (
                <option key={o.label} value={i}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            응답 시나리오
            <select
              aria-label="응답 시나리오"
              value={config.scenario}
              onChange={(e) =>
                setConfig({
                  ...config,
                  scenario: e.target.value as DemoScenario,
                })
              }
            >
              <option value="normal">기본 · 병원 10곳</option>
              <option value="three">병원 3곳</option>
              <option value="clustered">가까이 모인 병원 · 자동 확대</option>
              <option value="wide">상위 병원이 10 km 밖에 있음</option>
              <option value="empty">조건 일치 병원 없음</option>
              <option value="mixed">누락·오래된 정보</option>
              <option value="error">요청 오류</option>
            </select>
          </label>
        </div>
        <details className="demo-metrics">
          <summary>병원별 시간·확률 설정</summary>
          <p>설정한 값은 선택한 시나리오의 병원 순서에 반영됩니다.</p>
          <div className="demo-metric-head">
            <span>병원</span>
            <span>이동 시간 (분)</span>
            <span>수용 확률 (%)</span>
          </div>
          {config.metrics.map((m, i) => (
            <div className="demo-metric-row" key={i}>
              <span>후보 {i + 1}</span>
              <input
                aria-label={`후보 ${i + 1} 이동 시간`}
                type="number"
                min="1"
                max="180"
                required
                value={m.minutes}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    metrics: config.metrics.map((v, j) =>
                      j === i ? { ...v, minutes: Number(e.target.value) } : v,
                    ),
                  })
                }
              />
              <input
                aria-label={`후보 ${i + 1} 수용 확률`}
                type="number"
                min="0"
                max="100"
                required
                value={m.probability}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    metrics: config.metrics.map((v, j) =>
                      j === i
                        ? {
                            ...v,
                            probability: Math.max(0, Number(e.target.value)),
                          }
                        : v,
                    ),
                  })
                }
              />
            </div>
          ))}
        </details>
        <div className="demo-dialog-footer">
          <span>가상 병원·시연용 수치입니다.</span>
          <button className="button primary" type="submit">
            데모 병원 찾기 <ArrowRight size={18} />
          </button>
        </div>
      </form>
    </dialog>
  );
}
