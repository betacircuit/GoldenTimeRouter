import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  ExternalLink,
  Info,
  List,
  LoaderCircle,
  Map,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  clockTime,
  minutes,
  percent,
  resourceLabel,
  sortCandidates,
  type Candidate,
  type Hospital,
  type RecommendationRequest,
  type RecommendationResponse,
  type Route,
  type Sort,
} from "../domain";
import { api } from "../services/api";
import MapView from "./MapView";
import Pager from "./Pager";

export interface ViewState {
  tab: "list" | "map";
  sort: Sort;
  selectedId: string;
  scroll: number;
  page?: number;
}

function useRoute(
  request: RecommendationRequest,
  candidate: Candidate | undefined,
  revision: number,
) {
  const [state, setState] = useState<{
    id: string;
    route: Route | null;
    loading: boolean;
    error: string;
  }>({ id: "", route: null, loading: false, error: "" });
  useEffect(() => {
    if (!candidate) return;
    const controller = new AbortController();
    if (candidate.routeStatus === "unavailable") {
      setState({
        id: candidate.id,
        route: null,
        loading: false,
        error: "경로 조회 불가 · 병원 정보는 계속 확인할 수 있습니다.",
      });
      return;
    }
    setState({ id: candidate.id, route: null, loading: true, error: "" });
    api
      .route(request, candidate.id, controller.signal)
      .then((route) => {
        if (!controller.signal.aborted)
          setState({ id: candidate.id, route, loading: false, error: "" });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({
            id: candidate.id,
            route: null,
            loading: false,
            error: "경로를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
          });
      });
    return () => controller.abort();
  }, [request, candidate?.id, candidate?.routeStatus, revision]);
  return state.id === candidate?.id
    ? state
    : { route: null, loading: Boolean(candidate), error: "" };
}

export function ResourceStatus({
  candidate,
  full = false,
}: {
  candidate: Candidate;
  full?: boolean;
}) {
  return (
    <span className={`resource-list ${full ? "full" : ""}`}>
      {(full ? candidate.resources : candidate.resources.slice(0, 2)).map(
        (r, i) => (
          <span
            key={`${r.name}-${i}`}
            className={`resource-status ${r.status}`}
          >
            {r.status === "met" ? (
              <Check size={14} />
            ) : (
              <TriangleAlert size={14} />
            )}
            {r.name}
            <span>{resourceLabel[r.status]}</span>
          </span>
        ),
      )}
      {!full && candidate.resources.length > 2 && (
        <span className="resource-extra">
          +{candidate.resources.length - 2}
        </span>
      )}
      {!candidate.resources.length && (
        <span className="resource-status unknown">자원 정보 확인 필요</span>
      )}
    </span>
  );
}

function Freshness({ candidate }: { candidate: Candidate }) {
  return (
    <span className={`freshness ${candidate.dataStatus}`}>
      <span className="tiny-dot" />
      {candidate.updatedAt
        ? `${clockTime(candidate.updatedAt)} 수집`
        : "갱신 시각 미상"}
      {candidate.dataStatus === "stale" && " · 오래된 정보"}
      {candidate.dataStatus === "unknown" && " · 최신성 확인 필요"}
    </span>
  );
}

function HospitalCard({
  candidate: c,
  onOpen,
  selected,
}: {
  candidate: Candidate;
  onOpen: () => void;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`hospital-card rank-${c.rank} ${c.rank <= 3 ? "top-candidate" : ""} ${selected ? "selected-card" : ""}`}
      aria-label={`${c.rank}위 ${c.name} 상세 보기`}
    >
      <span className="card-topline">
        <span className="rank">
          #{c.rank}
          <span>{c.rank <= 3 ? "우선 확인" : "후보"}</span>
        </span>
        <span className="card-distance">
          <MapPin size={12} />
          {c.distanceKind === "straight" ? "직선 " : ""}
          {c.distanceMeters === null
            ? "거리 미상"
            : `${(c.distanceMeters / 1000).toFixed(1)} km`}
        </span>
      </span>
      <span className="hospital-identity">
        <strong>{c.name}</strong>
        <span className="hospital-type">{c.level}</span>
      </span>
      <span className="metric-well">
        <span className="hospital-metric eta">
          <span>
            <Clock3 size={13} /> 소요 시간
          </span>
          <strong className={c.durationSeconds === null ? "no-value" : ""}>
            {c.durationSeconds === null ? (
              "조회 불가"
            ) : (
              <>
                {Math.ceil(c.durationSeconds / 60)}
                <small>분</small>
              </>
            )}
          </strong>
        </span>
        <span className="hospital-metric probability">
          <span>수용·치료 가능성 예측</span>
          <strong className={c.probability === null ? "no-value" : ""}>
            {c.probability === null ? (
              "예측 정보 없음"
            ) : (
              <>
                {Math.round(c.probability * 100)}
                <small>%</small>
              </>
            )}
          </strong>
        </span>
      </span>
      <span className="card-resource-block">
        <ResourceStatus candidate={c} />
      </span>
      <Freshness candidate={c} />
      <span className="detail-link">
        <Phone size={15} /> 상세 · 연락처 확인 <ArrowRight size={16} />
      </span>
    </button>
  );
}

export function PatientSummary({
  request,
  onEdit,
}: {
  request: RecommendationRequest;
  onEdit?: () => void;
}) {
  return (
    <div className="patient-summary">
      <span className="summary-icon">
        <ShieldCheck size={22} />
      </span>
      <div>
        <strong>
          {request.patient.ageYears === null
            ? "연령 미상"
            : `${request.patient.ageYears}세`}
          <span className="summary-separator" />
          {request.patient.symptoms.join(" · ") || "주요 증상 미상"}
        </strong>
        <span>
          <MapPin size={13} />
          {request.origin.label}
        </span>
      </div>
      {onEdit && (
        <button className="button secondary" onClick={onEdit}>
          정보 수정
        </button>
      )}
    </div>
  );
}

export function Results({
  request,
  response,
  view,
  setView,
  onOpen,
  onEdit,
}: {
  request: RecommendationRequest;
  response: RecommendationResponse;
  view: ViewState;
  setView: (v: ViewState) => void;
  onOpen: (id: string) => void;
  onEdit: () => void;
}) {
  const [wide, setWide] = useState(() => window.innerWidth >= 1180);
  const [pageSize, setPageSize] = useState(() => window.innerWidth >= 650 ? 4 : 2);
  useEffect(() => { const resize = () => { setWide(window.innerWidth >= 1180); setPageSize(window.innerWidth >= 650 ? 4 : 2); }; window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, []);
  const candidates = sortCandidates(response.candidates, view.sort);
  const pageCount = Math.ceil(candidates.length / pageSize);
  const page = Math.min(view.page ?? 0, Math.max(0, pageCount - 1));
  const visibleCandidates = candidates.slice(page * pageSize, (page + 1) * pageSize);
  const selected =
    response.candidates.find((c) => c.id === view.selectedId) || candidates[0];
  const [routeRevision, setRouteRevision] = useState(0);
  const route = useRoute(
    request,
    wide || view.tab === "map" ? selected : undefined,
    routeRevision,
  );
  const distanceOnly = response.rankingBasis === "distance";
  const etaOnly = response.rankingBasis === "eta";
  const noModel = distanceOnly || etaOnly;
  const preferred = [...response.candidates].sort((a, b) => a.rank - b.rank)[0];
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      window.scrollTo({ top: view.scroll, behavior: "instant" }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className={`results-page ${wide ? "split-results" : ""}`}>
      {preferred && (
        <section
          className="preferred-hospital"
          aria-label="우선 확인 병원과 이유"
        >
          <div className="preferred-label"><ShieldCheck size={21}/><span>{noModel ? "가까운 병원" : "추천"}</span></div>
          <div className="preferred-body">
            <h2>{preferred.name}</h2>
          </div>
          <div className="preferred-metric">
            <strong>{minutes(preferred.durationSeconds)}</strong>
            <span>{percent(preferred.probability)}</span>
            <button
              className="button primary"
              onClick={() => onOpen(preferred.id)}
            >
              상세 <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}
      <div className="comparison-layout">
        <section className="candidate-area" aria-label="병원 후보">
          <div className="results-toolbar">
            <label className="sort-label">
              <span className="sr-only">병원 정렬</span>
              <select
                aria-label="병원 정렬"
                value={view.sort}
                onChange={(e) =>
                  setView({ ...view, sort: e.target.value as Sort, page: 0 })
                }
              >
                <option value="rank">
                  {etaOnly
                    ? "이동 시간 기준"
                    : distanceOnly
                      ? "가까운 거리순"
                      : "추천순"}
                </option>
                <option value="eta" disabled={distanceOnly}>
                  이동 시간순
                </option>
              </select>
            </label>
          </div>
          <div className="view-tabs" role="tablist" aria-label="병원 보기 방식">
            <button
              role="tab"
              id="list-tab"
              aria-controls="hospital-panel"
              aria-selected={view.tab === "list"}
              className={view.tab === "list" ? "active" : ""}
              onClick={() => setView({ ...view, tab: "list" })}
            >
              <List size={18} />
              목록
            </button>
            <button
              role="tab"
              id="map-tab"
              aria-controls="hospital-panel"
              aria-selected={view.tab === "map"}
              className={view.tab === "map" ? "active" : ""}
              onClick={() => setView({ ...view, tab: "map" })}
            >
              <Map size={18} />
              지도
            </button>
          </div>
          {!candidates.length ? (
            <div className="empty-state panel">
              <div className="empty-icon">
                <MapPin size={30} />
              </div>
              <h2>조건에 맞는 병원이 없습니다</h2>
              <p>
                입력한 환자 상태와 출발 위치를 확인해 주세요.
                <br />
                필요한 자원 조건을 확인한 뒤 다시 검색할 수 있습니다.
              </p>
              <button className="button primary" onClick={onEdit}>
                입력 정보 확인 <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            (wide || view.tab === "list") && (
              <div
                className="hospital-list"
                id="hospital-panel"
                role={wide ? undefined : "tabpanel"}
                aria-labelledby={wide ? undefined : "list-tab"}
              >
                {visibleCandidates.map((c) => (
                  <HospitalCard
                    key={c.id}
                    candidate={c}
                    selected={view.selectedId === c.id}
                    onOpen={() => onOpen(c.id)}
                  />
                ))}
              </div>
            )
          )}
          {(wide || view.tab === "list") && <Pager page={page} count={pageCount} onChange={p => setView({ ...view, page: p })} label="병원 목록"/>}
        </section>
        {Boolean(candidates.length) && (wide || view.tab === "map") && (
          <section
            className="map-results"
            aria-label="병원 위치 비교"
            id={!wide ? "hospital-panel" : undefined}
            role={wide ? undefined : "tabpanel"}
            aria-labelledby={wide ? undefined : "map-tab"}
          >
            <div className="map-panel-heading">
              <span>
                <MapPin size={18} />
                <strong>주변 병원 지도</strong>
              </span>

            </div>
            <MapView
              origin={request.origin}
              candidates={candidates}
              selectedId={selected?.id}
              onSelect={(id) => setView({ ...view, selectedId: id })}
              route={route.route}
              demo={response.isDemo}
            />
            {route.loading && (
              <div className="route-status" role="status">
                <LoaderCircle size={16} className="spin" />
                선택한 병원의 경로를 확인하고 있습니다.
              </div>
            )}
            {route.error && (
              <div className="inline-alert route-alert" role="status">
                <Info size={16} />
                <span>{route.error}</span>
                {selected?.routeStatus !== "unavailable" && (
                  <button onClick={() => setRouteRevision((v) => v + 1)}>
                    다시 시도
                  </button>
                )}
              </div>
            )}
            {selected &&
              (wide ? (
                <button
                  className={`map-selection rank-${selected.rank}`}
                  onClick={() => onOpen(selected.id)}
                  aria-label={`${selected.rank}위 ${selected.name} 상세 보기`}
                >
                  <span className="rank">#{selected.rank}</span>
                  <span>
                    <small>선택한 병원</small>
                    <strong>{selected.name}</strong>
                    <span>
                      {minutes(selected.durationSeconds)} ·{" "}
                      {percent(selected.probability)}
                    </span>
                  </span>
                  <ArrowRight size={22} />
                </button>
              ) : (
                <HospitalCard
                  candidate={selected}
                  selected
                  onOpen={() => onOpen(selected.id)}
                />
              ))}
          </section>
        )}
      </div>
      <div className="results-note">
        <Info size={17} />
        <p>
          {response.routingQueriedAt && (
            <>
              <strong>
                경로: 카카오모빌리티 ·{" "}
                {new Date(response.routingQueriedAt).toLocaleString("ko-KR")}{" "}
                조회
              </strong>
              <br />
            </>
          )}
          도착 시 수용·치료 가능성 예측은 병원별 모델 예측이며, 실제 수용 여부는
          병원에 확인해야 합니다.
          <br />
          <span>
            이동 시간은 일반 자동차 경로의 예상값입니다. 병원별 확률의 합계는
            100%가 아닐 수 있습니다.
          </span>
        </p>
      </div>
    </div>
  );
}

export function HospitalDetail({
  candidate: c,
  request,
  response,
  onBack,
}: {
  candidate: Candidate;
  request: RecommendationRequest;
  response: RecommendationResponse;
  onBack: () => void;
}) {
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [routeRevision, setRouteRevision] = useState(0);
  const route = useRoute(request, c, routeRevision);
  useEffect(() => {
    const controller = new AbortController();
    setHospital(null);
    setError("");
    api
      .hospital(c.id, controller.signal)
      .then((h) => {
        if (!controller.signal.aborted) setHospital(h);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("병원 연락처와 주소를 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [c.id, revision]);
  const phone =
    hospital?.emergencyPhone &&
    /^\+?[0-9\s()-]{7,25}$/.test(hospital.emergencyPhone) &&
    !hospital.isDemo &&
    !response.isDemo
      ? hospital.emergencyPhone.replace(/[^+0-9]/g, "")
      : null;
  const arrival =
    c.durationSeconds === null
      ? null
      : new Date(
          new Date(response.generatedAt).getTime() + c.durationSeconds * 1000,
        );
  return (
    <div className="detail-page">
      <button className="button ghost back-button" onClick={onBack}>
        <ArrowLeft size={18} /> 병원 목록으로
      </button>
      <div className="detail-heading">
        <div>
          <div className="eyebrow">HOSPITAL INSIGHT</div>
          <div className="detail-name">
            <span className="rank first">
              {String(c.rank).padStart(2, "0")}
            </span>
            <h1>{c.name}</h1>
          </div>
          <p>
            {c.level}
            <span className="summary-separator" />
            {response.rankingBasis === "eta"
              ? "이동 시간"
              : response.rankingBasis === "distance"
                ? "거리순"
                : "추천"}{" "}
            {c.rank}
            순위
          </p>
        </div>
        <Freshness candidate={c} />
      </div>
      <div className="detail-stats">
        <div className="detail-stat">
          <span>도착 시 수용·치료 가능성 예측</span>
          <strong
            className={c.probability === null ? "missing-probability" : ""}
          >
            {percent(c.probability)}
          </strong>
          <span>병원 수용 확정과 별도</span>
        </div>
        <div className="detail-stat">
          <span>
            <Clock3 size={15} />
            예상 이동 시간
          </span>
          <strong>{minutes(c.durationSeconds)}</strong>
          <span>
            {c.distanceMeters === null
              ? "거리 정보 없음"
              : `${c.distanceKind === "straight" ? "직선 거리" : "이동 거리"} ${(c.distanceMeters / 1000).toFixed(1)} km`}
          </span>
        </div>
        <div className="detail-stat">
          <span>
            <Navigation size={15} />
            예상 도착 시각
          </span>
          <strong>{arrival ? clockTime(arrival) : "정보 없음"}</strong>
          <span>{clockTime(response.generatedAt)} 출발 기준</span>
        </div>
      </div>
      {c.dataStatus !== "fresh" && (
        <div className="notice warning-notice">
          <TriangleAlert size={19} />
          <span>
            {c.dataStatus === "stale"
              ? "오래된 자원 정보가 포함되어 있습니다. 병원에 현재 상태를 확인해 주세요."
              : "정보의 최신성을 확인할 수 없습니다. 병원에 현재 상태를 확인해 주세요."}
          </span>
        </div>
      )}
      <div className="detail-grid">
        <div className="detail-primary">
          <section className="panel detail-section">
            <div className="section-heading">
              <ShieldCheck size={20} />
              <h2>
                {response.rankingBasis === "distance" ||
                response.rankingBasis === "eta"
                  ? "후보 표시 기준"
                  : "이 병원이 추천된 이유"}
              </h2>
            </div>
            <ul className="reason-list">
              {c.reasons.length ? (
                c.reasons.map((reason, i) => (
                  <li key={i}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {reason}
                  </li>
                ))
              ) : (
                <li>추천 근거 정보가 제공되지 않았습니다.</li>
              )}
            </ul>
            <div className="resource-heading">필요 자원 확인</div>
            <ResourceStatus candidate={c} full />
          </section>
          {Boolean(c.observations?.length) && (
            <section className="panel detail-section">
              <div className="section-heading">
                <Info size={20} />
                <h2>서버 수집 정보</h2>
              </div>
              <p className="help">
                NEMC 원본 보고값입니다. 자원 충족 또는 수용 확정을 뜻하지
                않습니다. 음수도 원문 그대로 표시합니다.
              </p>
              <dl className="metadata observation-list">
                {c.observations?.map((o) => (
                  <div key={o.label}>
                    <dt>{o.label}</dt>
                    <dd>
                      {o.value}
                      <small>{clockTime(o.recordedAt)} 수집</small>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {(c.structural || c.traumaCenter) && (
            <section className="panel detail-section">
              <div className="section-heading">
                <ShieldCheck size={20} />
                <h2>보유 시설·장비·전문의</h2>
              </div>
              <p className="help">
                HIRA 등록 수량입니다. 현재 근무 인원이나 사용 가능한 장비 수를
                뜻하지 않습니다. 기관 연결은 자동 매칭된 자료이므로
                기관명·주소를 함께 확인해 주세요.
              </p>
              {c.traumaCenter && (
                <p className="resource-status met">NEMC 외상센터 목록에 등재</p>
              )}
              {[
                "facility",
                "medical_equipment",
                "specialist",
                "designation",
              ].map((group) => {
                const facts =
                  c.structural?.facts.filter((f) => f.group === group) || [];
                return facts.length ? (
                  <details
                    className="structural-group"
                    key={group}
                    open={group === "facility"}
                  >
                    <summary>
                      {
                        (
                          {
                            facility: "시설 보유 현황",
                            medical_equipment: "의료 장비",
                            specialist: "진료과별 전문의",
                            designation: "지정 정보",
                          } as Record<string, string>
                        )[group]
                      }{" "}
                      <span>{facts.length}항목</span>
                    </summary>
                    <dl className="metadata observation-list">
                      {facts.map((f, i) => (
                        <div key={`${f.label}-${i}`}>
                          <dt>{f.label}</dt>
                          <dd>
                            {f.value}
                            <small>
                              {f.source.split(" / ")[0]} ·{" "}
                              {new Date(f.recordedAt).toLocaleDateString(
                                "ko-KR",
                              )}{" "}
                              수집
                            </small>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : null;
              })}
            </section>
          )}
          <section className="panel detail-section">
            <div className="section-heading">
              <ActivityIcon />
              <h2>예측 정보</h2>
            </div>
            {c.interval && c.probability !== null ? (
              <div className="interval-block">
                <div>
                  <span>{Math.round(c.interval.level * 100)}% 신뢰구간</span>
                  <strong>
                    {percent(c.interval.lower)} – {percent(c.interval.upper)}
                  </strong>
                </div>
                <div
                  className="interval-track"
                  role="img"
                  aria-label={`${Math.round(c.interval.level * 100)}퍼센트 신뢰구간 ${percent(c.interval.lower)}부터 ${percent(c.interval.upper)}`}
                >
                  <span
                    style={{
                      left: `${c.interval.lower * 100}%`,
                      width: `${(c.interval.upper - c.interval.lower) * 100}%`,
                    }}
                  />
                  <i style={{ left: `${c.probability * 100}%` }} />
                </div>
                <div className="interval-scale">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>
            ) : (
              <p className="help">
                {c.probability === null
                  ? "이 병원의 예측 확률이 제공되지 않았습니다."
                  : "신뢰구간이 제공되지 않았습니다."}
              </p>
            )}
            <dl className="metadata">
              <div>
                <dt>모델</dt>
                <dd>
                  {response.model.name} · {response.model.version}
                </dd>
              </div>
              <div>
                <dt>예측 기준</dt>
                <dd>{clockTime(response.generatedAt)} 조회 · 예상 도착 시점</dd>
              </div>
              <div>
                <dt>자원 정보 수집 시각</dt>
                <dd>
                  {c.updatedAt
                    ? new Date(c.updatedAt).toLocaleString("ko-KR")
                    : "확인 필요"}
                </dd>
              </div>
            </dl>
          </section>
        </div>
        <aside className="detail-secondary">
          <section className="panel route-panel">
            <div className="section-heading">
              <MapPin size={20} />
              <h2>위치와 이동 경로</h2>
            </div>
            <MapView
              origin={request.origin}
              candidates={[c]}
              selectedId={c.id}
              route={route.route}
              demo={response.isDemo}
              compact
            />
            {route.loading && (
              <p className="route-status" role="status">
                <LoaderCircle className="spin" size={16} />
                경로 확인 중
              </p>
            )}
            {route.error && (
              <div className="inline-alert" role="status">
                <Info size={16} />
                <span>{route.error}</span>
                {c.routeStatus !== "unavailable" && (
                  <button onClick={() => setRouteRevision((v) => v + 1)}>
                    다시 시도
                  </button>
                )}
              </div>
            )}
            <div className="contact-block">
              {error ? (
                <div className="inline-alert" role="alert">
                  <span>{error}</span>
                  <button onClick={() => setRevision((v) => v + 1)}>
                    <RefreshCw size={15} /> 다시 시도
                  </button>
                </div>
              ) : hospital ? (
                <>
                  <span className="field-caption">병원 주소</span>
                  <p>{hospital.address}</p>
                  <span className="field-caption">응급실 연락처</span>
                  <strong className="phone-number">
                    {hospital.emergencyPhone ||
                      (hospital.isDemo
                        ? "데모 병원 · 실제 연락처 없음"
                        : "연락처 정보 없음")}
                  </strong>
                </>
              ) : (
                <p className="help" role="status">
                  병원 상세 정보를 불러오는 중입니다.
                </p>
              )}
              {phone ? (
                <a
                  className="button primary phone-button"
                  href={`tel:${phone}`}
                >
                  <Phone size={18} /> 응급실 전화
                </a>
              ) : (
                <button className="button secondary phone-button" disabled>
                  <Phone size={18} /> 응급실 전화
                </button>
              )}
              {!response.isDemo && (
                <a
                  className="external-map"
                  href={`https://map.kakao.com/link/map/${encodeURIComponent(c.name)},${c.position.lat},${c.position.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  카카오맵에서 위치 보기 <ExternalLink size={14} />
                </a>
              )}
            </div>
          </section>
        </aside>
      </div>
      <div className="results-note">
        <Info size={17} />
        <p>
          예측 결과는 병원의 수용 확정이 아닙니다. 연락 후 현재 수용 가능 여부를
          확인해 주세요.
          <br />
          <span>이동 시간은 일반 자동차 경로의 예상값입니다.</span>
        </p>
      </div>
    </div>
  );
}

function ActivityIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </svg>
  );
}
