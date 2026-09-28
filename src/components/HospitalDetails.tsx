import { useEffect, useRef } from "react";
import { Check, Info, Phone, X } from "lucide-react";
import {
  minutes,
  percent,
  type Candidate,
  type RecommendationResponse,
} from "../domain";

export default function HospitalDetails({
  candidate: c,
  response,
  close,
  onPhone,
}: {
  candidate: Candidate;
  response: RecommendationResponse;
  close: () => void;
  onPhone: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const matched = c.resources.filter((r) => r.status === "met");
  const uncertain = c.resources.filter((r) => r.status !== "met");
  const modelRanked =
    !response.rankingBasis || response.rankingBasis === "model";
  const facts = [...(c.observations || []), ...(c.structural?.facts || [])];
  return (
    <dialog
      ref={dialog}
      className="contact-dialog hospital-detail-dialog"
      aria-labelledby="hospital-detail-title"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog-heading">
        <div>
          <span className="dialog-kicker">
            {response.isDemo ? "실제 병원 · 추천 수치 시연" : "병원 비교"}
          </span>
          <h2 id="hospital-detail-title">{c.name}</h2>
          <p>{c.level}</p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="병원 상세 닫기"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      <div className="detail-metrics">
        <div>
          <span>예상 이동</span>
          <strong>{minutes(c.durationSeconds)}</strong>
        </div>
        <div>
          <span>수용 가능성</span>
          <strong>{percent(c.probability)}</strong>
        </div>
        <div>
          <span>
            {c.distanceKind === "straight" ? "직선 거리" : "이동 거리"}
          </span>
          <strong>
            {c.distanceMeters === null
              ? "정보 없음"
              : `${(c.distanceMeters / 1000).toFixed(1)} km`}
          </strong>
        </div>
      </div>
      <section className="detail-section detail-match">
        <h3>
          <Check size={17} /> 환자에게 맞는 부분
        </h3>
        {matched.length ? (
          <ul>
            {matched.map((r) => (
              <li key={r.name}>{r.name} · 제공 응답에서 충족</li>
            ))}
          </ul>
        ) : (
          <p>환자에게 필요한 진료·검사가 가능한지 아직 확인되지 않았습니다.</p>
        )}
        {modelRanked && c.reasons.length > 0 && (
          <ul>
            {c.reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        )}
        {!modelRanked && (
          <p>
            {response.rankingBasis === "eta"
              ? "현재 순위는 조회된 자동차 이동 시간을 기준으로 정했습니다."
              : "현재 순위는 출발지와의 직선 거리를 기준으로 정했습니다."}{" "}
            환자별 치료 적합도 순위는 아닙니다.
          </p>
        )}
      </section>
      <section className="detail-section detail-uncertain">
        <h3>
          <Info size={17} /> 확인이 필요한 부분
        </h3>
        <ul>
          {uncertain.map((r) => (
            <li key={r.name}>
              {r.name} ·{" "}
              {r.status === "unmet" ? "필요 자원 미충족" : "가능 여부 미확인"}
            </li>
          ))}
          {c.probability === null && (
            <li>환자별 수용 확률을 산출한 결과가 없습니다.</li>
          )}
          {c.durationSeconds === null && (
            <li>자동차 이동 시간을 확인하지 못했습니다.</li>
          )}
          {c.dataStatus !== "fresh" && (
            <li>
              {c.dataStatus === "stale"
                ? "수집된 병원 현황이 오래되어 현재 상태를 다시 확인해야 합니다."
                : "병원 현황의 갱신 시점을 확인하지 못했습니다."}
            </li>
          )}
          {c.structural && c.structural.matchConfidence < 1 && (
            <li>
              기관 정보는 이름·주소를 대조해 연결한 자료입니다. 동일 기관 여부를
              확인해야 합니다.
            </li>
          )}
          <li>
            예상 확률이나 장비 보유 정보만으로 실제 수용·즉시 진료가 확정되지는
            않습니다.
          </li>
        </ul>
      </section>
      {facts.length > 0 && (
        <details className="detail-facts">
          <summary>병원 현황과 정보 기준 시각</summary>
          <dl>
            {facts.map((fact, i) => (
              <div key={i}>
                <dt>{fact.label}</dt>
                <dd>
                  {fact.value}
                  <small>
                    {fact.recordedAt
                      ? new Date(fact.recordedAt).toLocaleString("ko-KR")
                      : "기준 시각 미제공"}{" "}
                    · {fact.source}
                  </small>
                </dd>
              </div>
            ))}
          </dl>
          <p>장비·인력 등록 정보는 현재 가동·당직 상태와 다를 수 있습니다.</p>
        </details>
      )}
      <button
        className="button primary detail-phone"
        type="button"
        onClick={onPhone}
      >
        <Phone size={16} /> 전화번호 확인
      </button>
    </dialog>
  );
}
