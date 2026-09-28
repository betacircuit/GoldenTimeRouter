import { useEffect, useRef, useState } from "react";
import {
  Compass,
  MapPin,
  MapPinned,
  Navigation,
  RotateCcw,
  Crosshair,
  Plus,
  Minus,
} from "lucide-react";
import type { Candidate, Origin, Point, Route } from "../domain";
import { hasKakaoKey, loadKakao } from "../services/kakao";

interface Props {
  origin: Origin;
  candidates?: Candidate[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  route?: Route | null;
  compact?: boolean;
  demo: boolean;
}
export default function MapView({
  origin,
  candidates = [],
  selectedId,
  onSelect,
  route,
  compact = false,
  demo,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const selectRef = useRef(onSelect);
  const recenter = useRef<(() => void) | null>(null);
  const zoom = useRef<((delta: number) => void) | null>(null);
  selectRef.current = onSelect;
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const candidateKey = candidates
    .map(
      (c) =>
        `${c.id}:${c.rank}:${c.position.lat}:${c.position.lng}:${c.probability}:${c.durationSeconds}:${c.name}`,
    )
    .join("|");

  useEffect(() => {
    if (!hasKakaoKey) return;
    let disposed = false;
    let cleanup = () => {};
    setError("");
    setLoaded(false);
    loadKakao()
      .then((sdk) => {
        if (disposed || !host.current) return;
        const maps = sdk.maps;
        const container = host.current;
        container.replaceChildren();
        const map = new maps.Map(container, {
          center: new maps.LatLng(origin.lat, origin.lng),
          level: candidates.length ? 6 : 3,
          draggable: false,
          scrollwheel: false,
          disableDoubleClickZoom: true,
        });
        map.setDraggable(false);
        map.setZoomable(false);
        zoom.current = (delta) => map.setLevel(Math.max(1, Math.min(12, map.getLevel() + delta)));
        const bounds = new maps.LatLngBounds();
        const overlays: Array<{ setMap(map: unknown): void }> = [];
        function add(
          point: Point,
          text: string,
          label: string,
          selected: boolean,
          click?: () => void,
          candidate?: Candidate,
        ) {
          const position = new maps.LatLng(point.lat, point.lng);
          bounds.extend(position);
          const button = document.createElement("button");
          button.type = "button";
          button.className = `map-marker ${candidate ? `rank-${candidate.rank}` : "departure-pin"} ${selected ? "active" : ""}`;
          const badge = document.createElement("span");
          badge.className = "marker-number";
          badge.textContent = text;
          button.append(badge);
          if (candidate && !compact) {
            const name = document.createElement("span");
            name.className = "marker-name";
            name.textContent = candidate.name;
            button.append(name);
          }
          button.setAttribute("aria-label", label);
          button.title = label;
          button.setAttribute("aria-pressed", String(selected));
          if (click) button.addEventListener("click", click);
          const overlay = new maps.CustomOverlay({
            position,
            content: button,
            yAnchor: 0.5,
            xAnchor: 0.5,
            zIndex: !candidate ? 8 : selected ? 6 : candidate.rank <= 3 ? 4 : 2,
          });
          overlay.setMap(map);
          overlays.push(overlay);
        }
        add(origin, "출발", "출발 위치", true);
        candidates.forEach((c) =>
          add(
            c.position,
            String(c.rank),
            `${c.rank}위 ${c.name} 선택`,
            c.id === selectedId,
            () => selectRef.current?.(c.id),
            c,
          ),
        );
        if (route && !route.isDemo) {
          const line = new maps.Polyline({
            path: route.path.map((p) => new maps.LatLng(p.lat, p.lng)),
            strokeWeight: 5,
            strokeColor: "#0284c7",
            strokeOpacity: 0.9,
            strokeStyle: "solid",
          });
          line.setMap(map);
          overlays.push(line);
          route.path.forEach((p) =>
            bounds.extend(new maps.LatLng(p.lat, p.lng)),
          );
        }
        const reset = () => {
          if (candidates.length) map.setBounds(bounds, 85, 100, 85, 100);
          else { map.setCenter(new maps.LatLng(origin.lat, origin.lng)); map.setLevel(3); }
        };
        recenter.current = reset;
        reset();
        const observer = new ResizeObserver(() => {
          map.relayout();
          reset();
        });
        observer.observe(host.current);
        cleanup = () => {
          observer.disconnect();
          recenter.current = null;
          zoom.current = null;
          overlays.forEach((o) => o.setMap(null));
          container.replaceChildren();
        };
        setLoaded(true);
      })
      .catch(() => {
        if (!disposed)
          setError(
            "지도를 불러오지 못했습니다. 병원 목록은 계속 확인할 수 있습니다.",
          );
      });
    return () => {
      disposed = true;
      cleanup();
    };
    // SDK overlays are rebuilt only when map inputs change.
  }, [
    origin.lat,
    origin.lng,
    candidateKey,
    selectedId,
    route,
    attempt,
    compact,
  ]);

  if (hasKakaoKey && !error)
    return (
      <div className={`map-frame ${compact ? "compact" : ""}`}>
        <div
          className="kakao-host"
          ref={host}
          aria-label="출발지와 후보 병원 지도"
        />
        {!loaded && (
          <div className="map-loading" role="status">
            <MapPinned size={22} /> 지도를 불러오는 중입니다
          </div>
        )}
        {loaded && (
          <div className="map-tap-controls">
          <button type="button" className="icon-button" aria-label="지도 확대" onClick={() => zoom.current?.(-1)}><Plus size={22}/></button>
          <button type="button" className="icon-button" aria-label="지도 축소" onClick={() => zoom.current?.(1)}><Minus size={22}/></button>
          <button
            type="button"
            className="icon-button"
            aria-label="출발지와 병원 전체 보기"
            onClick={() => recenter.current?.()}
          >
            <Crosshair size={23} />
          </button>
          </div>
        )}
        {demo && candidates.length > 0 && (
          <span className="map-caption">
            데모 병원 위치 · 실제 의료기관 아님
          </span>
        )}
      </div>
    );
  if (!demo)
    return (
      <div
        className={`map-frame map-unavailable ${compact ? "compact" : ""}`}
        role="status"
      >
        <MapPinned size={32} />
        <strong>지도를 표시할 수 없습니다</strong>
        <p>
          {error ||
            "지도 연결을 확인해 주세요. 병원 목록과 입력 정보는 유지됩니다."}
        </p>
        {hasKakaoKey && (
          <button
            type="button"
            className="button secondary"
            onClick={() => setAttempt((a) => a + 1)}
          >
            <RotateCcw size={17} /> 다시 시도
          </button>
        )}
      </div>
    );

  const points = [
    origin,
    ...candidates.map((c) => c.position),
    ...(route?.path || []),
  ];
  const lats = points.map((p) => p.lat),
    lngs = points.map((p) => p.lng);
  const latMin = Math.min(...lats),
    latMax = Math.max(...lats),
    lngMin = Math.min(...lngs),
    lngMax = Math.max(...lngs);
  const latSpan = Math.max(latMax - latMin, 0.025),
    lngSpan = Math.max(lngMax - lngMin, 0.035);
  const project = (p: Point) => ({
    x: 50 + ((p.lng - (lngMin + lngMax) / 2) / lngSpan) * 70,
    y: 50 - ((p.lat - (latMin + latMax) / 2) / latSpan) * 65,
  });
  const departure = project(origin);
  return (
    <div className={`map-frame schematic ${compact ? "compact" : ""}`}>
      <span className="map-caption">
        <span className="tiny-dot" /> 데모 위치 개요 · 실제 지도 아님
      </span>
      <span className="compass">
        <Compass size={21} />
        <span>N</span>
      </span>
      <svg
        className="map-lines"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {route && (
          <polyline
            points={route.path
              .map((p) => {
                const v = project(p);
                return `${v.x},${v.y}`;
              })
              .join(" ")}
            fill="none"
            stroke="#0284c7"
            strokeWidth=".6"
            strokeDasharray="1.5 1"
          />
        )}
      </svg>
      <div
        className="origin-marker"
        style={{ left: `${departure.x}%`, top: `${departure.y}%` }}
      >
        <span>
          <Navigation size={18} fill="currentColor" />
        </span>
        <label>출발 위치</label>
      </div>
      {candidates.map((c) => {
        const pos = project(c.position);
        return (
          <button
            key={c.id}
            type="button"
            className={`map-marker schematic-marker rank-${c.rank} ${c.id === selectedId ? "active" : ""}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            aria-label={`${c.rank}위 ${c.name} 선택`}
            aria-pressed={c.id === selectedId}
            onClick={() => onSelect?.(c.id)}
          >
            <span className="marker-number">{c.rank}</span>
            {!compact && <span className="marker-name">{c.name}</span>}
          </button>
        );
      })}
      {compact && (
        <span className="map-location">
          <MapPin size={14} /> {origin.label.split(" · ")[0]}
        </span>
      )}
      {route && (
        <span className="schematic-note">점선은 시연용 연결선입니다</span>
      )}
      {error && (
        <span className="schematic-note">
          지도 연결 실패 · 위치 개요 표시 중
        </span>
      )}
    </div>
  );
}
