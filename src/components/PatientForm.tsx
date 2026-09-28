import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronDown,
  Crosshair,
  Info,
  LoaderCircle,
  MapPin,
  Plus,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  DEMO_ORIGINS,
  type Origin,
  type RecommendationRequest,
} from "../domain";
import { hasKakaoKey, searchAddress } from "../services/kakao";
import { isDemo, isServerData } from "../services/api";
import NaturalPatient, {
  initialNatural,
  isReady,
  type NaturalDraft,
  type NaturalPatientHandle,
} from "./NaturalPatient";
import {
  EXAMPLE_TEXT,
  applyExtraction,
  exampleExtraction,
  projectPatient,
} from "../patient/extraction";
import MapView from "./MapView";
import RequestProgress from "./RequestProgress";

export interface Draft {
  origin: Origin | null;
  natural: NaturalDraft;
}
export const initialDraft = (): Draft => ({
  origin: null,
  natural: initialNatural(),
});
export function draftToRequest(draft: Draft): RecommendationRequest {
  return {
    origin: draft.origin!,
    patient: {
      ...projectPatient(draft.natural.records),
      ...(draft.natural.reviewedAt ? { reviewedAt: draft.natural.reviewedAt } : {}),
    },
  };
}

interface Props {
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  onSubmit: (request: RecommendationRequest) => Promise<void>;
  busy: boolean;
  error: string;
  hasPrevious: boolean;
  onPrevious: () => void;
  onCancel: () => void;
}
export default function PatientForm({
  draft,
  setDraft,
  onSubmit,
  busy,
  error,
  hasPrevious,
  onPrevious,
  onCancel,
}: Props) {
  const natural = draft.natural ?? initialNatural();
  const [extracting, setExtracting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const naturalRef = useRef<NaturalPatientHandle>(null);
  const pipeline = useRef(false);
  const cancelled = useRef(false);
  const addressRef = useRef<HTMLDialogElement>(null);
  const [addressOpen, setAddressOpen] = useState(false);
  useEffect(() => { if (addressOpen) addressRef.current?.showModal(); else addressRef.current?.close(); }, [addressOpen]);

  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Origin[]>([]);
  const [addressError, setAddressError] = useState("");
  const [searching, setSearching] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [validation, setValidation] = useState("");
  const [showLocationMap, setShowLocationMap] = useState(false);
  const locationRequest = useRef(0);
  useEffect(
    () => () => {
      locationRequest.current++;
    },
    [],
  );
  const patch = (values: Partial<Draft>) =>
    setDraft((previous) => ({ ...previous, ...values }));
  const complete = [
    Boolean(draft.origin),
    natural.records.some((f) => f.active),
    isReady(natural),
  ];
  const chooseOrigin = (origin: Origin) => {
    locationRequest.current++;
    setGeoBusy(false);
    setSearching(false);
    patch({ origin });
    setAddressOpen(false);
    setMatches([]);
    setAddressError("");
  };

  async function locate() {
    const requestId = ++locationRequest.current;
    setSearching(false);
    setAddressError("");
    setGeoBusy(true);
    if (!navigator.geolocation) {
      setAddressError(
        "이 기기에서는 위치를 확인할 수 없습니다. 주소를 검색해 주세요.",
      );
      setGeoBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (requestId !== locationRequest.current) {
          return;
        }
        chooseOrigin({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "현재 위치 · 기기 위치 정보",
          accuracyMeters: pos.coords.accuracy,
          capturedAt: new Date(pos.timestamp).toISOString(),
        });
        setGeoBusy(false);
      },
      (err) => {
        if (requestId !== locationRequest.current) {
          return;
        }
        setAddressError(
          err.code === 1
            ? "위치 권한이 거절되었습니다. 주소 검색으로 출발지를 지정해 주세요."
            : err.code === 3
              ? "기기 위치 응답 시간이 초과되었습니다. 현재 위치를 다시 요청하거나 주소를 검색해 주세요."
              : "기기에서 위치 좌표를 제공하지 못했습니다. Chrome과 Windows 위치 설정을 확인하거나 주소를 검색해 주세요.",
        );
        setGeoBusy(false);
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 0 },
    );
  }

  useEffect(() => {
    if (!draft.origin) void locate();
  }, []);

  async function findAddress() {
    if (!query.trim()) return;
    const requestId = ++locationRequest.current;
    setGeoBusy(false);
    setSearching(true);
    setAddressError("");
    try {
      const found = hasKakaoKey
        ? await searchAddress(query.trim())
        : isDemo
          ? DEMO_ORIGINS.filter((o) => o.label.includes(query.trim()))
          : [];
      if (requestId !== locationRequest.current) return;
      setMatches(found);
      if (!found.length)
        setAddressError(
          hasKakaoKey
            ? "검색 결과가 없습니다. 도로명 주소를 다시 확인해 주세요."
            : "데모에서는 서울시청, 광화문광장, 서울역을 검색할 수 있습니다.",
        );
    } catch (e) {
      if (requestId === locationRequest.current)
        setAddressError(
          e instanceof Error ? e.message : "주소 검색에 실패했습니다.",
        );
    } finally {
      if (requestId === locationRequest.current) setSearching(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || extracting || pipeline.current) return;
    if (!draft.origin) { setValidation("출발 위치를 확인해 주세요. 위치 권한이 없으면 주소를 검색할 수 있습니다."); return; }
    pipeline.current = true; cancelled.current = false; setPreparing(true); setValidation("");
    try {
      const next = await naturalRef.current?.extract();
      if (!next || cancelled.current) return;
      if (!next.records.some(f => f.active) || next.issues.some(i => i.code === "multiple_patients")) { setValidation("추출된 환자 정보가 없거나 여러 환자가 섞여 있습니다. 한 환자의 상태를 입력해 주세요."); return; }
      await onSubmit(draftToRequest({ ...draft, natural: next }));
    } finally { pipeline.current = false; setPreparing(false); }
  }
  function example() {
    locationRequest.current++; setGeoBusy(false); setAddressError("");
    setDraft({ origin: draft.origin || (isDemo ? DEMO_ORIGINS[0] : null), natural: { ...initialNatural(), text: EXAMPLE_TEXT, extractedText: EXAMPLE_TEXT, records: applyExtraction([], exampleExtraction(), natural.revision + 1, "example"), source: "example", revision: natural.revision + 1 } });
    setValidation("");
  }
  const cancelSearch = () => { cancelled.current = true; naturalRef.current?.cancel(); onCancel(); setPreparing(false); };
  return <form onSubmit={submit} className="patient-page focused-input">
    <div className="input-layout">
      <div className="composer-column">
        <NaturalPatient value={natural} onChange={next => patch({ natural: next })} disabled={busy} onBusy={setExtracting} controlRef={naturalRef} onExample={example}/>
        <div className="input-actions">
          {hasPrevious ? <button type="button" className="button secondary" onClick={onPrevious} disabled={busy || preparing}>이전 결과 보기</button> : <span/>}
          <button type="submit" className="button primary search-hospitals" disabled={busy || extracting || preparing || geoBusy || searching}>{busy || preparing ? <><LoaderCircle className="spin" size={20}/> 처리 중</> : <>병원 찾기 <ArrowRight size={21}/></>}</button>
        </div>
      </div>
      <aside className="input-aside location-panel panel" aria-label="현재 위치 확인">
        <div className="location-panel-heading"><h2>현재 위치</h2>{geoBusy && <LoaderCircle className="spin" size={18}/>}</div>
        <div className="location-map-area">{draft.origin ? <MapView origin={draft.origin} compact demo={isDemo}/> : <div className="location-placeholder">{geoBusy ? <LoaderCircle className="spin" size={30}/> : <MapPin size={30}/>}<strong>{geoBusy ? "현재 위치를 확인하고 있어요" : "위치를 확인해 주세요"}</strong></div>}</div>
        <div className="location-actions"><button type="button" className="button secondary" onClick={locate} disabled={geoBusy || busy || preparing}><Crosshair size={17}/> 새로고침</button><button type="button" className="button secondary" onClick={() => { setAddressOpen(true); setAddressError(""); }} disabled={busy || preparing}><Search size={17}/> 주소 검색</button></div>
        {addressError && <div className="inline-alert" role="alert"><Info size={17}/>{addressError}</div>}
      </aside>
    </div>
    {(validation || error) && <div className="input-error-toast notice error-notice" role="alert"><Info size={18}/><span>{validation || error}</span>{validation && <button type="button" aria-label="안내 닫기" onClick={() => setValidation("")}><X size={18}/></button>}</div>}
    {(preparing || busy || extracting) && <div className="processing-overlay"><RequestProgress phase={extracting ? "extract" : "recommend"} extraction={preparing || extracting} onCancel={cancelSearch}/></div>}
    <dialog ref={addressRef} className="address-dialog" aria-labelledby="address-title" onCancel={() => setAddressOpen(false)}>
      <div className="dialog-heading"><h2 id="address-title">출발 주소 검색</h2><button type="button" className="icon-button" aria-label="주소 검색 닫기" onClick={() => setAddressOpen(false)}><X size={20}/></button></div>
      <label htmlFor="address-query">도로명 주소 검색</label><div className="search-row"><input id="address-query" value={query} onChange={e => setQuery(e.target.value)} placeholder={hasKakaoKey ? "도로명 주소 입력" : "서울시청, 광화문광장, 서울역"} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void findAddress(); } }}/><button type="button" className="button primary" onClick={findAddress} disabled={searching || !query.trim()}>{searching ? "검색 중" : "검색"}</button></div>
      <div className="address-options">{matches.map(o => <button type="button" key={o.label} onClick={() => chooseOrigin(o)}><MapPin size={16}/>{o.label}<ArrowRight size={16}/></button>)}</div>
      {addressError && <p className="inline-alert" role="alert">{addressError}</p>}
    </dialog>
  </form>;
}
