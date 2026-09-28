import { useEffect, useRef, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FlaskConical,
  Ambulance,
  RefreshCw,
  Settings2,
  ShieldCheck,
  X,
  Database,
} from "lucide-react";
import {
  requestSchema,
  type Candidate,
  type RecommendationRequest,
  type RecommendationResponse,
  type Scenario,
} from "./domain";
import { api, isDemo, isServerData } from "./services/api";
import PatientForm, {
  initialDraft,
  type Draft,
} from "./components/PatientForm";
import {
  HospitalDetail,
  Results,
  type ViewState,
} from "./components/Hospitals";
import DataEvidence from "./components/DataEvidence";

const freshView = (): ViewState => ({
  tab: "list",
  sort: "rank",
  selectedId: "",
  scroll: 0,
  page: 0,
});
export default function App() {
  const navigateRouter = useNavigate();
  const location = useLocation();
  const modeSearch =
    import.meta.env.VITE_DATA_MODE === "server" && isDemo ? "?data=demo" : "";
  const navigate = (path: string) => navigateRouter(`${path}${modeSearch}`);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [request, setRequest] = useState<RecommendationRequest | null>(null);
  const [response, setResponse] = useState<RecommendationResponse | null>(null);
  const [view, setView] = useState<ViewState>(freshView);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scenario, setScenario] = useState<Scenario>(() => { const s = new URLSearchParams(window.location.search).get("scenario"); return ["normal", "three", "empty", "mixed", "error"].includes(s || "") ? s as Scenario : "normal"; });
  const [settings, setSettings] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  useEffect(() => { const c = new AbortController(); fetch("/patient-api/status", { signal: c.signal }).then(r => r.json()).then(v => setAiConfigured(v.configured === true)).catch(() => setAiConfigured(false)); return () => c.abort(); }, []);
  const activeRequest = useRef<AbortController | null>(null);
  const stage = location.pathname.startsWith("/hospitals/")
    ? 3
    : location.pathname === "/results"
      ? 2
      : 1;
  const demo = isDemo || Boolean(response?.isDemo);

  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => {
    if (stage !== 2) window.scrollTo({ top: 0, behavior: "instant" });
    document.title = `${["환자 정보", "병원 비교", "병원 상세"][stage - 1]} · Golden Time Router`;
  }, [location.pathname, stage]);

  async function submit(value: RecommendationRequest) {
    if (activeRequest.current) return;
    const parsed = requestSchema.safeParse(value);
    if (!parsed.success) {
      setError("입력한 연령과 환자 정보를 확인해 주세요.");
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setError("");
    setBusy(true);
    try {
      const result = await api.recommend(
        parsed.data,
        controller.signal,
        scenario,
      );
      if (controller.signal.aborted) return;
      setRequest(parsed.data);
      setResponse(result);
      setView(freshView());
      navigate("/results");
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "추천 정보를 불러오지 못했습니다. 다시 시도해 주세요.",
        );
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  }
  const cancel = () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setBusy(false);
  };
  const edit = () => {
    setError("");
    navigate("/");
  };
  const open = (id: string) => {
    setView((v) => ({ ...v, selectedId: id, scroll: window.scrollY }));
    navigate(`/hospitals/${encodeURIComponent(id)}`);
  };
  const updateDraft: React.Dispatch<React.SetStateAction<Draft>> = (value) => {
    setDraft(value);
    setError("");
  };

  return (
    <div className={`app-shell workspace-shell stage-${stage} ${stage === 2 ? "is-results" : ""}`}>
      <a className="skip-link" href="#main-content">
        본문으로 이동
      </a>
      <header className="app-header compact-header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="Golden Time Router 환자 입력" onClick={e => { e.preventDefault(); if (!busy) navigate("/"); }}>
            <svg className="brand-logo" role="img" aria-label="Golden Time Router 로고" viewBox="35 410 1180 435"><image href="/gtr-logo.png" width="1254" height="1254"/></svg>
          </a>
          <div className="header-right">
            {stage !== 1 && <button className="button secondary" onClick={edit} disabled={busy}>정보 수정</button>}
            {stage === 2 && request && <button className="icon-button" aria-label="다시 조회" onClick={() => submit(request)} disabled={busy}><RefreshCw size={18} className={busy ? "spin" : ""}/></button>}
            <button className="icon-button" aria-label="연결 정보" onClick={() => setConnectionsOpen(true)}><Settings2 size={18}/></button>
            <button className="icon-button" aria-label="데이터 근거" onClick={() => setDataOpen(true)}><Database size={18}/></button>
            <button className="button ghost" aria-label="데모 시나리오 설정" onClick={() => setSettings(true)}><FlaskConical size={18}/> Demo</button>
          </div>
        </div>
      </header>
      {dataOpen && <DataEvidence onClose={() => setDataOpen(false)}/>}
      {connectionsOpen && <ConnectionInfo close={() => setConnectionsOpen(false)} configured={aiConfigured} demo={demo} response={response}/>}
      <main id="main-content" className="main-content">
        {stage === 2 && error && (
          <div className="notice error-notice" role="alert">
            {error} 기존 조회 결과를 유지합니다.
          </div>
        )}
        <Routes>
          <Route
            path="/"
            element={
              <PatientForm
                draft={draft}
                setDraft={updateDraft}
                onSubmit={submit}
                busy={busy}
                error={error}
                hasPrevious={Boolean(response)}
                onPrevious={() => navigate("/results")}
                onCancel={cancel}
              />
            }
          />
          <Route
            path="/results"
            element={
              request && response ? (
                <Results
                  request={request}
                  response={response}
                  view={view}
                  setView={setView}
                  onOpen={open}
                  onEdit={edit}
                />
              ) : (
                <Navigate to={`/${modeSearch}`} replace />
              )
            }
          />
          <Route
            path="/hospitals/:id"
            element={
              request && response ? (
                <DetailRoute
                  candidates={response.candidates}
                  render={(candidate) => (
                    <HospitalDetail
                      candidate={candidate}
                      request={request}
                      response={response}
                      onBack={() => navigate("/results")}
                    />
                  )}
                />
              ) : (
                <Navigate to={`/${modeSearch}`} replace />
              )
            }
          />
          <Route
            path="*"
            element={<Navigate to={`/${modeSearch}`} replace />}
          />
        </Routes>
      </main>
      {settings && (
        <DemoSettings
          scenario={scenario}
          onChange={setScenario}
          close={() => setSettings(false)}
        />
      )}
    </div>
  );
}

function DetailRoute({
  candidates,
  render,
}: {
  candidates: Candidate[];
  render: (c: Candidate) => React.ReactNode;
}) {
  const { id } = useParams();
  const location = useLocation();
  const candidate = candidates.find((c) => c.id === id);
  return candidate ? (
    render(candidate)
  ) : (
    <Navigate to={`/results${location.search}`} replace />
  );
}

function DemoSettings({
  scenario,
  onChange,
  close,
}: {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const el = ref.current;
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="settings-dialog"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog-heading">
        <div>
          
          <h2>Demo 시나리오</h2>
        </div>
        <button className="icon-button" aria-label="설정 닫기" onClick={close}>
          <X size={20} />
        </button>
      </div>
      <label htmlFor="scenario">응답 시나리오</label>
      <select
        id="scenario"
        value={scenario}
        onChange={(e) => onChange(e.target.value as Scenario)}
      >
        <option value="normal">기본 · 병원 10곳</option>
        <option value="three">후보 부족 · 병원 3곳</option>
        <option value="empty">조건 일치 병원 없음</option>
        <option value="mixed">확률 누락 · 경로 실패 · 오래된 정보</option>
        <option value="error">추천 API 오류</option>
      </select>
      {isDemo ? <button className="button primary" onClick={close}>적용</button> : <a className="button primary" href={`/?data=demo&scenario=${scenario}`}>Demo 시작</a>}
      {isDemo && <a className="button ghost" href="/?data=server">실제 병원</a>}
    </dialog>
  );
}

function ConnectionInfo({ close, configured, demo, response }: { close: () => void; configured: boolean | null; demo: boolean; response: RecommendationResponse | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); const el = ref.current; return () => el?.close(); }, []);
  return <dialog ref={ref} className="settings-dialog" aria-label="연결 정보" onCancel={close}>
    <div className="dialog-heading"><h2>연결 정보</h2><button className="icon-button" aria-label="연결 정보 닫기" onClick={close}><X size={20}/></button></div>
    <dl className="connection-list"><dt>환자 정보 추출</dt><dd>{configured ? "OpenRouter 키 설정됨 · 제공자 응답 상태는 요청 시 확인" : "AI 키 설정 필요"}</dd><dt>병원 정보</dt><dd>{demo ? "가상 병원 · 데모 데이터·예측" : "NEMC 수집본 · HIRA 보유 정보"}</dd><dt>이동 시간</dt><dd>{demo ? "예시 이동 시간" : "카카오모빌리티 · 일반 자동차 예상값"}</dd><dt>예측 모델</dt><dd>{demo ? "완성 모델의 예시 응답" : "환자별 추론 API 미연결 · 현재는 거리/ETA 기준"}</dd>{response?.snapshotAt && <><dt>병원 자료 동기화</dt><dd>{new Date(response.snapshotAt).toLocaleString("ko-KR")}</dd></>}{response?.routingNotice && <><dt>최근 경로 조회</dt><dd>{response.routingNotice}</dd></>}</dl>
    <a className="button secondary source-switch" href={demo ? "/?data=server" : "/?data=demo"}>{demo ? "서버 병원 보기" : "예시 모델 보기"}</a>
  </dialog>;
}
