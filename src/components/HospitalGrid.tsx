import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Phone,
  X,
} from "lucide-react";
import {
  minutes,
  percent,
  type Candidate,
  type Hospital,
  type RecommendationResponse,
} from "../domain";
import { primaryApi } from "../services/api";
import { mockApi } from "../services/mock";

export function HospitalGrid({
  response,
  page,
  onPage,
  selectedId,
  onSelect,
  onPhone,
}: {
  response: RecommendationResponse | null;
  page: number;
  onPage: (p: number) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  onPhone: (id: string) => void;
}) {
  const candidates = [...(response?.candidates || [])].sort(
    (a, b) => a.rank - b.rank,
  );
  const count = Math.ceil(candidates.length / 9);
  return (
    <section className="hospital-grid-section" aria-label="병원 선택">
      {response && !candidates.length ? (
        <div className="finder-empty">
          <MapPin size={28} />
          <h2>조건에 맞는 병원이 없습니다</h2>
          <p>환자 정보를 수정하거나 다른 데모 상황을 선택해 주세요.</p>
        </div>
      ) : (
        <div className="hospital-grid">
          {response
            ? candidates.slice(page * 9, page * 9 + 9).map((c) => (
                <article
                  key={c.id}
                  className={`finder-card hospital-card ${c.rank <= 3 ? "priority-card" : ""} ${selectedId === c.id ? "is-selected" : ""}`}
                >
                  <button
                    type="button"
                    className="hospital-select"
                    onClick={() => onSelect(c.id)}
                    aria-label={`${c.rank}위 ${c.name} 선택`}
                    aria-pressed={selectedId === c.id}
                  >
                    <span className="hospital-card-top">
                      <span className="hospital-rank">#{c.rank}</span>
                      <span>
                        {c.distanceKind === "straight" && (
                          <span className="sr-only">직선 </span>
                        )}
                        {c.distanceMeters === null
                          ? "거리 미상"
                          : `${(c.distanceMeters / 1000).toFixed(1)} km`}
                      </span>
                    </span>
                    <strong className="hospital-card-name">{c.name}</strong>
                    <span className="hospital-numbers">
                      <span
                        aria-label={`예상 이동 시간 ${minutes(c.durationSeconds)}`}
                      >
                        <Clock3 size={15} />
                        <strong
                          className={
                            c.durationSeconds === null ? "missing-value" : ""
                          }
                        >
                          {c.durationSeconds === null ? (
                            "조회 불가"
                          ) : (
                            <>
                              {Math.ceil(c.durationSeconds / 60)
                                .toString()
                                .padStart(2, "0")}
                              <small>분</small>
                            </>
                          )}
                        </strong>
                      </span>
                      <span aria-label={`수용 확률 ${percent(c.probability)}`}>
                        <strong
                          className={
                            c.probability === null ? "missing-value" : ""
                          }
                        >
                          {c.probability === null ? (
                            "정보 없음"
                          ) : (
                            <>
                              {Math.round(c.probability * 100)}
                              <small>%</small>
                            </>
                          )}
                        </strong>
                      </span>
                    </span>
                  </button>
                  {(c.dataStatus !== "fresh" ||
                    c.resources.some((r) => r.status !== "met")) && (
                    <span className="hospital-caveat">
                      {c.dataStatus === "stale"
                        ? "오래된 정보"
                        : c.resources.some((r) => r.status === "unmet")
                          ? "필요 자원 미충족"
                          : "정보 확인 필요"}
                    </span>
                  )}
                  <button
                    type="button"
                    className="hospital-phone"
                    onClick={() => onPhone(c.id)}
                    aria-label={`${c.name} 전화`}
                  >
                    <Phone size={14} /> 전화
                  </button>
                </article>
              ))
            : Array.from({ length: 9 }, (_, i) => (
                <div
                  key={i}
                  className="hospital-placeholder"
                  aria-hidden="true"
                >
                  <span>0{i + 1}</span>
                  <div />
                  <div />
                </div>
              ))}
          {!response && (
            <div className="grid-invitation">
              <MapPin size={22} />
              <strong>어느 병원으로 갈까요?</strong>
              <span>환자 정보를 입력하고 병원을 찾아보세요.</span>
            </div>
          )}
        </div>
      )}
      {count > 1 && (
        <nav className="finder-pagination" aria-label="병원 목록 페이지">
          <button
            type="button"
            aria-label="병원 목록 이전"
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            {page + 1} <i>/ {count}</i>
          </span>
          <button
            type="button"
            aria-label="병원 목록 다음"
            disabled={page === count - 1}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </nav>
      )}
    </section>
  );
}

export function HospitalContact({
  candidate,
  demo,
  rankingBasis,
  close,
}: {
  candidate: Candidate;
  demo: boolean;
  rankingBasis?: RecommendationResponse["rankingBasis"];
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
    const el = dialog.current;
    return () => el?.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setHospital(null);
    setError("");
    (demo ? mockApi : primaryApi)
      .hospital(candidate.id, controller.signal)
      .then((h) => {
        if (!controller.signal.aborted) setHospital(h);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("연락처를 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [candidate.id, demo, retry]);
  return (
    <dialog
      ref={dialog}
      className="contact-dialog"
      aria-labelledby="contact-title"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog-heading">
        <div>
          <span className="dialog-kicker">병원 연락처</span>
          <h2 id="contact-title">{candidate.name}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="병원 카드 닫기"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      <div className="contact-number">
        <Phone size={21} />
        {error ? (
          <div role="alert">
            {error}
            <button type="button" onClick={() => setRetry((v) => v + 1)}>
              다시 시도
            </button>
          </div>
        ) : !hospital ? (
          <span role="status">연락처 확인 중</span>
        ) : (
          <div>
            <strong>
              {demo
                ? `02-0000-${candidate.id.replace("demo-", "").padStart(4, "0")}`
                : hospital.emergencyPhone || "등록된 전화번호 없음"}
            </strong>
            {demo && <small>시연용 가상 번호</small>}
          </div>
        )}
      </div>
      <div className="contact-reason">
        <Check size={17} />
        <p>
          {rankingBasis === "distance" || rankingBasis === "eta"
            ? "거리·이동 시간 기준 후보입니다. 환자별 치료 적합성과 수용 가능성은 아직 평가되지 않았습니다."
            : candidate.reasons[0] ||
              "환자와의 일치 근거가 제공되지 않았습니다."}
        </p>
      </div>
      {candidate.resources.some((r) => r.status === "unmet") && (
        <p className="contact-caveat">
          일부 필요 자원이 충족되지 않은 후보입니다.
        </p>
      )}
    </dialog>
  );
}
