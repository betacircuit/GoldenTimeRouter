import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Database,
  FlaskConical,
  Info,
  Home,
  LoaderCircle,
  MapPin,
  Timer,
  X,
} from "lucide-react";
import {
  requestSchema,
  type Origin,
  type RecommendationResponse,
  type RecommendationRequest,
} from "./domain";
import { primaryApi, isDemo } from "./services/api";
import { mockApi } from "./services/mock";
import {
  configureDemo,
  demoDraft,
  demoOrigins,
  initialDemo,
  type DemoConfig,
} from "./services/demo";
import { projectPatient } from "./patient/extraction";
import NaturalPatient, {
  initialNatural,
  type NaturalDraft,
  type NaturalPatientHandle,
} from "./components/NaturalPatient";
import MapView from "./components/MapView";
import { HospitalGrid, HospitalContact } from "./components/HospitalGrid";
import DemoSettings from "./components/DemoSettings";
import DataEvidence from "./components/DataEvidence";
import RequestProgress from "./components/RequestProgress";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [natural, setNatural] = useState(initialNatural);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [response, setResponse] = useState<RecommendationResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(isDemo);
  const [demoConfig, setDemoConfig] = useState(initialDemo);
  const [demoOpen, setDemoOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [needsSearch, setNeedsSearch] = useState(false);
  const naturalRef = useRef<NaturalPatientHandle>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const pipeline = useRef(0);
  const locationRequest = useRef(0);
  const searching = useRef(false);
  const isEntry = location.pathname === "/";
  const toolbarVisible = isEntry || toolbarOpen;
  const contactId = location.pathname.startsWith("/hospitals/")
    ? decodeURIComponent(location.pathname.slice(11))
    : "";
  const contact = response?.candidates.find((c) => c.id === contactId);

  useEffect(() => {
    setToolbarOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setToolbarOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  useEffect(() => {
    document.title = "병원 찾기 · Golden Time Router";
    const params = new URLSearchParams(window.location.search);
    if (params.get("data") === "demo" && params.get("run") === "1")
      void runDemo(initialDemo());
    else void locate();
    return () => {
      activeRequest.current?.abort();
      locationRequest.current++;
      pipeline.current++;
      searching.current = false;
    };
  }, []);
  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);
  useEffect(() => {
    if (contactId && !contact && !busy)
      navigate("/results" + location.search, { replace: true });
  }, [contactId, contact, busy]);

  const clearResults = () => {
    setResponse(null);
    setSelectedId("");
    setError("");
  };
  const changeNatural = (next: NaturalDraft) => {
    if (next.text !== natural.text) {
      setNeedsSearch(Boolean(response) || needsSearch);
      clearResults();
      if (contactId) navigate("/results" + location.search, { replace: true });
    }
    setNatural(next);
  };
  function locate({
    resetSearch = false,
    forSearch = false,
  } = {}): Promise<Origin | null> {
    const id = ++locationRequest.current;
    setGeoBusy(true);
    setGeoError("");
    if (forSearch) clearResults();
    if (!navigator.geolocation) {
      setGeoBusy(false);
      setGeoError("이 기기에서 위치를 확인할 수 없습니다.");
      return Promise.resolve(null);
    }
    return new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (id !== locationRequest.current) return resolve(null);
          const currentOrigin: Origin = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            label: "현재 위치",
            accuracyMeters: pos.coords.accuracy,
            capturedAt: new Date(pos.timestamp).toISOString(),
          };
          setOrigin(currentOrigin);
          setGeoBusy(false);
          clearResults();
          setNeedsSearch(!resetSearch && (Boolean(response) || needsSearch));
          resolve(currentOrigin);
        },
        (err) => {
          if (id !== locationRequest.current) return resolve(null);
          setGeoBusy(false);
          setGeoError(
            err.code === 1
              ? "위치 권한을 허용한 뒤 현재 위치를 눌러 주세요."
              : "위치를 확인하지 못했습니다. 현재 위치를 다시 눌러 주세요.",
          );
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
      ),
    );
  }
  async function recommend(
    request: RecommendationRequest,
    demo: boolean,
    config: DemoConfig,
  ) {
    const parsed = requestSchema.safeParse(request);
    if (!parsed.success) {
      setError("입력된 환자 정보와 위치를 확인해 주세요.");
      return;
    }
    const controller = new AbortController();
    activeRequest.current?.abort();
    activeRequest.current = controller;
    clearResults();
    try {
      const result = await (demo ? mockApi : primaryApi).recommend(
        parsed.data,
        controller.signal,
        config.scenario === "wide" || config.scenario === "clustered"
          ? "normal"
          : config.scenario,
      );
      if (controller.signal.aborted) return;
      const next = demo
        ? configureDemo(result, config, request.origin, request.patient)
        : result;
      setResponse(next);
      setNeedsSearch(false);
      setSelectedId(next.candidates[0]?.id || "");
      if (!demo) navigate("/results");
      else if (!window.location.pathname.startsWith("/hospitals/"))
        navigate("/results" + window.location.search, { replace: true });
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "병원 정보를 불러오지 못했습니다.",
        );
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (searching.current || busy) return;
    searching.current = true;
    setBusy(true);
    setError("");
    const id = ++pipeline.current;
    setStartedAt((t) => t ?? Date.now());
    try {
      const next = await naturalRef.current?.extract();
      if (!next || id !== pipeline.current) return;
      if (
        !next.records.some((f) => f.active) ||
        next.issues.some((i) => i.code === "multiple_patients")
      ) {
        setError("한 환자의 증상과 상태를 입력해 주세요.");
        return;
      }
      // Keep an explicitly configured demo origin; real searches always use a
      // fresh fix after extraction, immediately before the recommendation call.
      const configuredDemo =
        demoMode && new URLSearchParams(location.search).get("run") === "1";
      const currentOrigin = configuredDemo
        ? origin
        : await locate({ forSearch: true });
      if (!currentOrigin || id !== pipeline.current) return;
      await recommend(
        { origin: currentOrigin, patient: projectPatient(next.records) },
        demoMode,
        demoConfig,
      );
    } finally {
      if (id === pipeline.current) {
        searching.current = false;
        setBusy(false);
      }
    }
  }
  async function runDemo(config: DemoConfig) {
    cancel();
    locationRequest.current++;
    setGeoBusy(false);
    setGeoError("");
    setDemoConfig(config);
    setDemoMode(true);
    setDemoOpen(false);
    const next = demoDraft(config),
      demoOrigin = demoOrigins[config.originIndex];
    setNatural(next);
    setOrigin(demoOrigin);
    clearResults();
    setStartedAt(Date.now() - 522000);
    const params = new URLSearchParams({
      data: "demo",
      run: "1",
      case: config.caseId,
      scenario: config.scenario,
      origin: String(config.originIndex),
      metrics: config.metrics
        .map((m) => m.minutes + "-" + m.probability)
        .join(","),
    });
    navigate("/results?" + params.toString(), {
      replace: window.location.pathname === "/results",
    });
    const id = ++pipeline.current;
    searching.current = true;
    setBusy(true);
    try {
      await recommend(
        { origin: demoOrigin, patient: projectPatient(next.records) },
        true,
        config,
      );
    } finally {
      if (id === pipeline.current) {
        searching.current = false;
        setBusy(false);
      }
    }
  }
  function cancel() {
    pipeline.current++;
    locationRequest.current++;
    setGeoBusy(false);
    activeRequest.current?.abort();
    activeRequest.current = null;
    naturalRef.current?.cancel();
    searching.current = false;
    setBusy(false);
    setExtracting(false);
  }
  function select(id: string) {
    setSelectedId(id);
  }
  function goHome() {
    cancel();
    locationRequest.current++;
    setNatural(initialNatural());
    clearResults();
    setOrigin(null);
    setStartedAt(null);
    setNeedsSearch(false);
    setToolbarOpen(false);
    setDemoMode(
      import.meta.env.VITE_DATA_MODE !== "server" &&
        import.meta.env.VITE_DATA_MODE !== "live",
    );
    navigate("/");
    void locate({ resetSearch: true });
  }
  function openPhone(id: string) {
    select(id);
    navigate("/hospitals/" + encodeURIComponent(id) + location.search);
  }

  return (
    <div
      className={`finder-shell ${isEntry ? "is-entry" : "is-finding"} ${toolbarOpen ? "toolbar-open" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        본문으로 이동
      </a>
      {!isEntry && toolbarOpen && (
        <button
          className="toolbar-scrim"
          aria-label="상단 바 접기"
          onClick={() => setToolbarOpen(false)}
        />
      )}
      {!isEntry && (
        <button
          type="button"
          className="toolbar-toggle"
          aria-label={toolbarOpen ? "상단 바 닫기" : "상단 바 열기"}
          aria-controls="finder-toolbar"
          aria-expanded={toolbarOpen}
          onClick={() => setToolbarOpen((v) => !v)}
        >
          {toolbarOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          <span>{toolbarOpen ? "닫기" : "메뉴"}</span>
        </button>
      )}
      <header
        id="finder-toolbar"
        className={`finder-header ${toolbarVisible ? "is-open" : "is-closed"}`}
        inert={!toolbarVisible}
      >
        <a
          className="brand"
          href="/"
          aria-label="Golden Time Router 병원 찾기"
          onClick={(e) => {
            e.preventDefault();
            goHome();
          }}
        >
          <svg
            className="brand-logo"
            role="img"
            aria-label="Golden Time Router 로고"
            viewBox="35 410 1180 435"
          >
            <image href="/gtr-logo.png" width="1254" height="1254" />
          </svg>
        </a>
        <div className="finder-header-actions">
          {!isEntry && (
            <button type="button" className="toolbar-home" onClick={goHome}>
              <Home size={17} /> 처음 화면
            </button>
          )}
          {demoMode && response && (
            <span className="demo-mode-label">DEMO</span>
          )}
          {demoMode &&
            (import.meta.env.VITE_DATA_MODE === "server" ||
              import.meta.env.VITE_DATA_MODE === "live") && (
              <button
                type="button"
                className="button ghost"
                disabled={busy}
                onClick={() => {
                  goHome();
                }}
              >
                실제 병원
              </button>
            )}
          <button
            className="icon-button"
            aria-label="데이터 근거"
            onClick={() => {
              setToolbarOpen(false);
              setDataOpen(true);
            }}
          >
            <Database size={18} />
          </button>
          <button
            className="demo-launch"
            aria-label="데모 시나리오 설정"
            onClick={() => {
              setToolbarOpen(false);
              setDemoOpen(true);
            }}
            disabled={busy}
          >
            <FlaskConical size={18} /> Demo
          </button>
        </div>
      </header>
      <main id="main-content" className="finder-layout">
        <div className="finder-left">
          <form onSubmit={submit}>
            <NaturalPatient
              value={natural}
              onChange={changeNatural}
              disabled={busy}
              onBusy={setExtracting}
              controlRef={naturalRef}
              action={
                <button
                  type="submit"
                  className="button primary finder-search"
                  disabled={busy || geoBusy}
                >
                  {busy ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <ArrowRight size={17} />
                  )}{" "}
                  {needsSearch ? "병원 다시 찾기" : "병원 찾기"}
                </button>
              }
            />
          </form>
          {error && (
            <div className="finder-error" role="alert">
              <Info size={16} />
              <span>{error}</span>
              <button aria-label="안내 닫기" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          <HospitalGrid
            response={response}
            selectedId={selectedId}
            onSelect={select}
            onPhone={openPhone}
          />
        </div>
        <section className="finder-map" aria-label="병원 위치 비교">
          {origin ? (
            <MapView
              origin={origin}
              candidates={response?.candidates || []}
              selectedId={selectedId}
              onSelect={select}
              demo={demoMode}
            />
          ) : (
            <div className="finder-location-empty">
              <MapPin size={36} />
              <strong>
                {geoBusy
                  ? "현재 위치를 확인하고 있어요"
                  : "현재 위치를 확인해 주세요"}
              </strong>
            </div>
          )}
          <div
            className="dispatch-timer"
            role="timer"
            aria-label="출동 경과 시간"
            aria-live="off"
          >
            <Timer size={17} />
            <span>출동 경과</span>
            <strong>
              {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
              {String(elapsed % 60).padStart(2, "0")}
            </strong>
          </div>
          <button
            type="button"
            className="current-location"
            onClick={() => locate()}
            disabled={geoBusy || busy}
          >
            {geoBusy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Crosshair size={17} />
            )}{" "}
            현재 위치
          </button>
          {geoError && (
            <div className="finder-location-error" role="alert">
              {geoError}
            </div>
          )}
        </section>
      </main>
      {busy && (
        <div className="finder-processing">
          <RequestProgress
            phase={extracting ? "extract" : geoBusy ? "locate" : "recommend"}
            extraction={extracting}
            onCancel={cancel}
          />
        </div>
      )}
      {demoOpen && (
        <DemoSettings
          value={demoConfig}
          onRun={(v) => void runDemo(v)}
          close={() => setDemoOpen(false)}
        />
      )}
      {contact && (
        <HospitalContact
          key={contact.id}
          candidate={contact}
          demo={Boolean(response?.isDemo)}
          rankingBasis={response?.rankingBasis}
          close={() => navigate("/results" + location.search)}
        />
      )}
      {dataOpen && <DataEvidence onClose={() => setDataOpen(false)} />}
    </div>
  );
}
