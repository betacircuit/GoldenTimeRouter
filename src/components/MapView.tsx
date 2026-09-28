import { useEffect, useRef, useState } from "react";
import {
  Crosshair,
  MapPinned,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
} from "lucide-react";
import type { Candidate, Origin, Point, Route } from "../domain";
import { hasKakaoKey, loadKakao } from "../services/kakao";
import { highestProbability, mapViewport } from "../services/mapViewport";
import { arrangeMapLabels } from "../services/mapLabels";

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
  compact = false,
  demo,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const fallbackHost = useRef<HTMLDivElement>(null);
  const selectRef = useRef(onSelect);
  const selectedRef = useRef(selectedId);
  selectRef.current = onSelect;
  selectedRef.current = selectedId;
  const recenter = useRef<(() => void) | null>(null);
  const zoom = useRef<((delta: number) => void) | null>(null);
  const markers = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [fallbackZoom, setFallbackZoom] = useState(1);
  const candidateKey = candidates
    .map((c) =>
      [
        c.id,
        c.rank,
        c.position.lat,
        c.position.lng,
        c.probability,
        c.durationSeconds,
        c.name,
      ].join(":"),
    )
    .join("|");
  const viewport = mapViewport(origin, candidates);
  const topIds = new Set(highestProbability(candidates).map((c) => c.id));
  useEffect(() => {
    const frame = fallbackHost.current;
    if (!frame) return;
    const arrange = () => arrangeMapLabels(frame);
    const resize = new ResizeObserver(arrange);
    resize.observe(frame);
    const animation = requestAnimationFrame(arrange);
    return () => {
      resize.disconnect();
      cancelAnimationFrame(animation);
    };
  }, [origin.lat, origin.lng, candidateKey, fallbackZoom, error]);
  useEffect(() => {
    setFallbackZoom(1);
  }, [origin.lat, origin.lng, candidateKey]);
  useEffect(() => {
    markers.current.forEach((button, id) => {
      button.classList.toggle("active", id === selectedId);
      button.setAttribute("aria-pressed", String(id === selectedId));
    });
  }, [selectedId]);

  useEffect(() => {
    if (!hasKakaoKey) return;
    let disposed = false;
    let cleanup = () => {};
    setError("");
    setLoaded(false);
    loadKakao()
      .then((sdk) => {
        if (disposed || !host.current) return;
        const maps = sdk.maps,
          container = host.current;
        container.replaceChildren();
        const map = new maps.Map(container, {
          center: new maps.LatLng(origin.lat, origin.lng),
          level: 7,
          draggable: true,
          scrollwheel: true,
        });
        zoom.current = (delta) =>
          map.setLevel(Math.max(1, Math.min(12, map.getLevel() + delta)));
        const bounds = new maps.LatLngBounds();
        bounds.extend(new maps.LatLng(viewport.south, viewport.west));
        bounds.extend(new maps.LatLng(viewport.north, viewport.east));
        const overlays: Array<{ setMap: (m: unknown) => void }> = [];
        const add = (point: Point, candidate?: Candidate) => {
          const button = document.createElement("button");
          button.type = "button";
          const selected = candidate?.id === selectedRef.current;
          button.className = candidate
            ? "map-marker " +
              (topIds.has(candidate.id) ? "top-marker " : "") +
              (selected ? "active" : "")
            : "map-marker departure-pin";
          const badge = document.createElement("span");
          badge.className = "marker-number";
          badge.textContent = candidate ? String(candidate.rank) : "+";
          button.append(badge);
          if (candidate) {
            const label = document.createElement("span");
            label.className = "marker-name";
            label.textContent = candidate.name.replace("데모 ", "");
            button.append(label);
            const metric = document.createElement("small");
            metric.textContent =
              (candidate.durationSeconds === null
                ? "—"
                : Math.ceil(candidate.durationSeconds / 60) + "분") +
              " · " +
              (candidate.probability === null
                ? "—"
                : Math.round(candidate.probability * 100) + "%");
            label.append(metric);
            button.setAttribute(
              "aria-label",
              candidate.rank + "위 " + candidate.name + " 지도에서 선택",
            );
            button.setAttribute("aria-pressed", String(selected));
            button.addEventListener("click", () =>
              selectRef.current?.(candidate.id),
            );
            markers.current.set(candidate.id, button);
          } else {
            button.setAttribute("aria-label", "출발 위치");
          }
          let content: HTMLElement = button;
          if (candidate) {
            const anchor = document.createElement("div");
            anchor.className = "map-label-anchor";
            const leader = document.createElement("span");
            leader.className = "map-label-leader";
            leader.setAttribute("aria-hidden", "true");
            const point = document.createElement("span");
            point.className = "map-label-point";
            point.setAttribute("aria-hidden", "true");
            anchor.append(leader, point, button);
            content = anchor;
          }
          const overlay = new maps.CustomOverlay({
            position: new maps.LatLng(point.lat, point.lng),
            content,
            yAnchor: candidate ? 0 : 0.5,
            xAnchor: candidate ? 0 : 0.5,
            zIndex: candidate ? (topIds.has(candidate.id) ? 5 : 3) : 7,
          });
          overlay.setMap(map);
          overlays.push(overlay);
        };
        add(origin);
        candidates.forEach((c) => add(c.position, c));
        const arrange = () => arrangeMapLabels(container);
        let animation = 0;
        const scheduleLabels = () => {
          cancelAnimationFrame(animation);
          animation = requestAnimationFrame(arrange);
        };
        maps.event.addListener(map, "idle", scheduleLabels);
        const reset = () => {
          map.setBounds(bounds, 85, 70, 75, 65);
          scheduleLabels();
        };
        recenter.current = reset;
        reset();
        const observer = new ResizeObserver(() => {
          map.relayout();
          reset();
        });
        observer.observe(container);
        cleanup = () => {
          cancelAnimationFrame(animation);
          maps.event.removeListener(map, "idle", scheduleLabels);
          observer.disconnect();
          overlays.forEach((o) => o.setMap(null));
          markers.current.clear();
          recenter.current = null;
          zoom.current = null;
          container.replaceChildren();
        };
        setLoaded(true);
      })
      .catch(() => {
        if (!disposed)
          setError(
            "지도 연결을 확인해 주세요. 병원 목록은 계속 볼 수 있습니다.",
          );
      });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [origin.lat, origin.lng, candidateKey, attempt]);

  const controls = (fallback = false) => (
    <div className="map-tap-controls">
      <button
        type="button"
        className="icon-button"
        aria-label="지도 확대"
        onClick={() =>
          fallback
            ? setFallbackZoom((z) => Math.min(4, z * 1.3))
            : zoom.current?.(-1)
        }
      >
        <Plus size={20} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="지도 축소"
        onClick={() =>
          fallback
            ? setFallbackZoom((z) => Math.max(0.5, z / 1.3))
            : zoom.current?.(1)
        }
      >
        <Minus size={20} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="지도 범위 맞추기"
        onClick={() => (fallback ? setFallbackZoom(1) : recenter.current?.())}
      >
        <Crosshair size={19} />
      </button>
    </div>
  );

  if (hasKakaoKey && !error)
    return (
      <div className={"map-frame " + (compact ? "compact" : "")}>
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
        {loaded && controls()}
        {demo && <span className="map-caption">데모 · 가상 병원 위치</span>}
      </div>
    );

  if (!demo)
    return (
      <div className="map-frame map-unavailable" role="status">
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

  const project = (p: Point) => ({
    x:
      50 +
      ((p.lng - (viewport.west + viewport.east) / 2) /
        (viewport.east - viewport.west)) *
        80 *
        fallbackZoom,
    y:
      50 -
      ((p.lat - (viewport.south + viewport.north) / 2) /
        (viewport.north - viewport.south)) *
        76 *
        fallbackZoom,
  });
  const departure = project(origin);
  return (
    <div
      ref={fallbackHost}
      className={"map-frame schematic " + (compact ? "compact" : "")}
      data-map-span-km={((viewport.north - viewport.south) * 111.32).toFixed(2)}
    >
      <svg
        className="demo-map-terrain"
        viewBox="0 0 800 900"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M-60 300 Q120 230 300 380 T850 350"
          fill="none"
          stroke="#b4d7e8"
          strokeWidth="62"
        />
        <path
          d="M-60 300 Q120 230 300 380 T850 350"
          fill="none"
          stroke="#c7e3ee"
          strokeWidth="45"
        />
        <path
          d="M80 20 L260 160 600 50 760 190 M-20 680 L180 560 360 640 830 570 M180 -30 L280 280 190 570 330 930 M660 -20 L520 270 670 600 520 920"
          fill="none"
          stroke="#fefefd"
          strokeWidth="15"
        />
        <path
          d="M80 20 L260 160 600 50 760 190 M-20 680 L180 560 360 640 830 570 M180 -30 L280 280 190 570 330 930 M660 -20 L520 270 670 600 520 920"
          fill="none"
          stroke="#dfcdab"
          strokeWidth="3"
        />
        <path
          d="M40 85 Q140 10 175 100 T150 205 Q45 220 40 85 M600 730 Q740 660 770 790 T650 900 Q580 860 600 730"
          fill="#cde0cc"
          opacity=".65"
        />
      </svg>
      <div
        className="origin-marker"
        style={{ left: departure.x + "%", top: departure.y + "%" }}
      >
        <span>
          <Navigation size={17} fill="currentColor" />
        </span>
        <label>출발</label>
      </div>
      {candidates.map((c) => {
        const pos = project(c.position);
        return (
          <div
            key={c.id}
            className="map-label-anchor schematic-anchor"
            style={{ left: pos.x + "%", top: pos.y + "%" }}
          >
            <span className="map-label-leader" aria-hidden="true" />
            <span className="map-label-point" aria-hidden="true" />
            <button
              type="button"
              className={
                "map-marker schematic-marker " +
                (topIds.has(c.id) ? "top-marker " : "") +
                (c.id === selectedId ? "active" : "")
              }
              aria-label={c.rank + "위 " + c.name + " 지도에서 선택"}
              aria-pressed={c.id === selectedId}
              onClick={() => onSelect?.(c.id)}
            >
              <span className="marker-number">{c.rank}</span>
              <span className="marker-name">
                {c.name.replace("데모 ", "")}
                <small>
                  {c.durationSeconds === null
                    ? "—"
                    : Math.ceil(c.durationSeconds / 60) + "분"}{" "}
                  ·{" "}
                  {c.probability === null
                    ? "—"
                    : Math.round(c.probability * 100) + "%"}
                </small>
              </span>
            </button>
          </div>
        );
      })}
      {controls(true)}
      <span className="map-caption">데모 위치 개요 · 실제 지도 아님</span>
    </div>
  );
}
