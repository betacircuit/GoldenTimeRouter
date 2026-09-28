import { useEffect, useRef, useState } from "react";
import { Crosshair, MapPinned, Minus, Plus, RotateCcw } from "lucide-react";
import type { Candidate, Origin, Point, Route } from "../domain";
import { hasKakaoKey, loadKakao } from "../services/kakao";
import { destinationViewport, mapViewport } from "../services/mapViewport";
import { arrangeMapLabels } from "../services/mapLabels";

// A coordinate icon, not an inferred outline of the real building.
const buildingIcon =
  '<path d="M5 29V7h15v22M20 15h9v14M3 29h28M10 12h2m3 0h1M10 17h2m3 0h1M10 22h2m3 0h1M24 20h1m-1 5h1M11 29v-3h4v3" fill="white" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><g class="building-check"><circle cx="27" cy="28" r="7" fill="currentColor" stroke="white" stroke-width="1.5"/><path d="m24 28 2 2 4-4" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>';

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
  const focusMap = useRef<((destination: Point) => void) | null>(null);
  const chooseHospital = useRef<(candidate: Candidate) => void>(() => {});
  const focusedRef = useRef("");
  const markers = useRef<Map<string, HTMLElement>>(new Map());
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [fallbackZoom, setFallbackZoom] = useState(1);
  const [focusedId, setFocusedId] = useState("");
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
  const overview = mapViewport(origin, candidates);
  const focused = candidates.find((c) => c.id === focusedId);
  const viewport = focused
    ? destinationViewport(origin, focused.position)
    : overview;
  const topIds = new Set(
    [...candidates]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 3)
      .map((c) => c.id),
  );
  chooseHospital.current = (candidate) => {
    selectRef.current?.(candidate.id);
    focusedRef.current = candidate.id;
    setFocusedId(candidate.id);
    setFallbackZoom(1);
    focusMap.current?.(candidate.position);
  };
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
  }, [origin.lat, origin.lng, candidateKey, focusedId, fallbackZoom, error]);
  useEffect(() => {
    setFallbackZoom(1);
    setFocusedId("");
    focusedRef.current = "";
  }, [origin.lat, origin.lng, candidateKey]);
  useEffect(() => {
    markers.current.forEach((anchor, id) => {
      anchor.classList.toggle("active", id === selectedId);
      anchor.querySelectorAll("button").forEach((button) => {
        button.classList.toggle("active", id === selectedId);
        button.setAttribute("aria-pressed", String(id === selectedId));
      });
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
        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        zoom.current = (delta) => {
          const destination = candidates.find(
            (c) => c.id === focusedRef.current,
          );
          map.setLevel(Math.max(1, Math.min(12, map.getLevel() + delta)), {
            animate: reducedMotion ? false : { duration: 400 },
            ...(destination
              ? {
                  anchor: new maps.LatLng(
                    destination.position.lat,
                    destination.position.lng,
                  ),
                }
              : {}),
          });
        };
        const overlays: Array<{ setMap: (m: unknown) => void }> = [];
        const add = (point: Point, candidate?: Candidate) => {
          if (!candidate) {
            const marker = document.createElement("div");
            marker.className = "user-location-marker";
            marker.setAttribute("role", "img");
            marker.setAttribute(
              "aria-label",
              demo ? "데모 출발 위치" : "현재 위치",
            );
            const dot = document.createElement("span");
            dot.className = "user-location-dot";
            const label = document.createElement("span");
            label.className = "user-location-label";
            label.textContent = demo ? "데모 출발" : "현재 위치";
            marker.append(dot, label);
            const overlay = new maps.CustomOverlay({
              position: new maps.LatLng(point.lat, point.lng),
              content: marker,
              xAnchor: 0.5,
              yAnchor: 0.5,
              zIndex: 7,
            });
            overlay.setMap(map);
            overlays.push(overlay);
            return;
          }
          const button = document.createElement("button");
          button.type = "button";
          const selected = candidate.id === selectedRef.current;
          button.className =
            "map-marker " +
            (topIds.has(candidate.id) ? "top-marker " : "") +
            (selected ? "active" : "");
          const label = document.createElement("span");
          label.className = "marker-name";
          label.textContent = candidate.name.replace("데모 ", "");
          button.append(label);
          button.setAttribute(
            "aria-label",
            candidate.rank + "위 " + candidate.name + " 지도에서 선택",
          );
          button.setAttribute("aria-pressed", String(selected));
          button.addEventListener("click", () =>
            chooseHospital.current(candidate),
          );
          const anchor = document.createElement("div");
          anchor.className = "map-label-anchor" + (selected ? " active" : "");
          anchor.dataset.hospitalId = candidate.id;
          const leader = document.createElement("span");
          leader.className = "map-label-leader";
          leader.setAttribute("aria-hidden", "true");
          const target = document.createElement("button");
          target.type = "button";
          target.className =
            "map-coordinate-target" + (selected ? " active" : "");
          target.setAttribute("aria-label", candidate.name + " 실제 위치 선택");
          target.setAttribute("aria-pressed", String(selected));
          const building = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
          );
          building.setAttribute("viewBox", "0 0 36 36");
          building.setAttribute("class", "hospital-building");
          building.setAttribute("aria-hidden", "true");
          building.innerHTML = buildingIcon;
          target.append(building);
          target.addEventListener("click", () =>
            chooseHospital.current(candidate),
          );
          anchor.append(leader, target, button);
          markers.current.set(candidate.id, anchor);
          const overlay = new maps.CustomOverlay({
            position: new maps.LatLng(point.lat, point.lng),
            content: anchor,
            yAnchor: 0,
            xAnchor: 0,
            zIndex: topIds.has(candidate.id) ? 5 : 3,
          });
          overlay.setMap(map);
          overlays.push(overlay);
        };
        add(origin);
        candidates.forEach((c) => add(c.position, c));
        const arrange = () => {
          container.classList.toggle("is-building-view", map.getLevel() <= 3);
          container.dataset.zoomLevel = String(map.getLevel());
          arrangeMapLabels(container);
        };
        let animation = 0;
        const scheduleLabels = () => {
          cancelAnimationFrame(animation);
          animation = requestAnimationFrame(arrange);
        };
        maps.event.addListener(map, "idle", scheduleLabels);
        maps.event.addListener(map, "zoom_changed", scheduleLabels);
        maps.event.addListener(map, "bounds_changed", scheduleLabels);
        const fit = (view: typeof overview, animate = false) => {
          const bounds = new maps.LatLngBounds();
          bounds.extend(new maps.LatLng(view.south, view.west));
          bounds.extend(new maps.LatLng(view.north, view.east));
          if (animate && !reducedMotion) {
            // Use the current projection to calculate a fitting zoom level,
            // then animate center and zoom together without an intermediate jump.
            const projection = map.getProjection();
            const sw = projection.containerPointFromCoords(
              new maps.LatLng(view.south, view.west),
            );
            const ne = projection.containerPointFromCoords(
              new maps.LatLng(view.north, view.east),
            );
            const ratio = Math.max(
              Math.abs(ne.x - sw.x) / Math.max(80, container.clientWidth - 150),
              Math.abs(ne.y - sw.y) /
                Math.max(80, container.clientHeight - 180),
              0.01,
            );
            const level = Math.max(
              1,
              Math.min(12, map.getLevel() + Math.ceil(Math.log2(ratio))),
            );
            map.jump(
              new maps.LatLng(
                (view.south + view.north) / 2,
                (view.west + view.east) / 2,
              ),
              level,
              { animate: { duration: 550 } },
            );
          } else map.setBounds(bounds, 95, 75, 85, 75);
          scheduleLabels();
        };
        focusMap.current = (point) =>
          fit(destinationViewport(origin, point), true);
        const reset = (animate = false) => {
          focusedRef.current = "";
          setFocusedId("");
          fit(overview, animate);
        };
        recenter.current = () => reset(true);
        reset();
        const observer = new ResizeObserver(() => {
          map.relayout();
          const destination = candidates.find(
            (c) => c.id === focusedRef.current,
          );
          fit(
            destination
              ? destinationViewport(origin, destination.position)
              : overview,
          );
        });
        observer.observe(container);
        cleanup = () => {
          cancelAnimationFrame(animation);
          maps.event.removeListener(map, "idle", scheduleLabels);
          maps.event.removeListener(map, "zoom_changed", scheduleLabels);
          maps.event.removeListener(map, "bounds_changed", scheduleLabels);
          observer.disconnect();
          overlays.forEach((o) => o.setMap(null));
          markers.current.clear();
          recenter.current = null;
          zoom.current = null;
          focusMap.current = null;
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
  }, [origin.lat, origin.lng, candidateKey, attempt, demo]);

  const controls = (fallback = false) => (
    <div className="map-tap-controls">
      <button
        type="button"
        className="icon-button"
        aria-label="지도 확대"
        onClick={() =>
          fallback
            ? setFallbackZoom((z) => Math.min(32, z * 1.6))
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
            ? setFallbackZoom((z) => Math.max(0.5, z / 1.6))
            : zoom.current?.(1)
        }
      >
        <Minus size={20} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="지도 범위 맞추기"
        onClick={() => {
          if (fallback) {
            setFallbackZoom(1);
            setFocusedId("");
            focusedRef.current = "";
          } else recenter.current?.();
        }}
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
          data-map-focus={focusedId}
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

  const center = {
    lat: (viewport.south + viewport.north) / 2,
    lng: (viewport.west + viewport.east) / 2,
  };
  const zoomCenter = focused
    ? {
        lat:
          focused.position.lat -
          (focused.position.lat - center.lat) / fallbackZoom,
        lng:
          focused.position.lng -
          (focused.position.lng - center.lng) / fallbackZoom,
      }
    : center;
  const project = (p: Point) => ({
    x:
      50 +
      ((p.lng - zoomCenter.lng) / (viewport.east - viewport.west)) *
        80 *
        fallbackZoom,
    y:
      50 -
      ((p.lat - zoomCenter.lat) / (viewport.north - viewport.south)) *
        76 *
        fallbackZoom,
  });
  const departure = project(origin);
  return (
    <div
      ref={fallbackHost}
      className={
        "map-frame schematic " +
        (((viewport.north - viewport.south) * 111.32) / fallbackZoom <= 1.2
          ? "is-building-view "
          : "") +
        (compact ? "compact" : "")
      }
      data-map-focus={focusedId}
      data-map-span-km={(
        ((viewport.north - viewport.south) * 111.32) /
        fallbackZoom
      ).toFixed(2)}
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
        className="user-location-marker schematic-origin"
        role="img"
        aria-label={demo ? "데모 출발 위치" : "현재 위치"}
        style={{ left: departure.x + "%", top: departure.y + "%" }}
      >
        <span className="user-location-dot" />
        <span className="user-location-label">
          {demo ? "데모 출발" : "현재 위치"}
        </span>
      </div>
      {candidates.map((c) => {
        const pos = project(c.position);
        return (
          <div
            key={c.id}
            className={
              "map-label-anchor schematic-anchor" +
              (c.id === selectedId ? " active" : "")
            }
            data-hospital-id={c.id}
            style={{ left: pos.x + "%", top: pos.y + "%" }}
          >
            <span className="map-label-leader" aria-hidden="true" />
            <button
              type="button"
              className={
                "map-coordinate-target" + (c.id === selectedId ? " active" : "")
              }
              aria-label={c.name + " 실제 위치 선택"}
              aria-pressed={c.id === selectedId}
              onClick={() => chooseHospital.current(c)}
            >
              <svg
                viewBox="0 0 36 36"
                className="hospital-building"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: buildingIcon }}
              />
            </button>
            <button
              type="button"
              className={
                "map-marker schematic-marker " +
                (topIds.has(c.id) ? "top-marker " : "") +
                (c.id === selectedId ? "active" : "")
              }
              aria-label={c.rank + "위 " + c.name + " 지도에서 선택"}
              aria-pressed={c.id === selectedId}
              onClick={() => chooseHospital.current(c)}
            >
              <span className="marker-name">{c.name.replace("데모 ", "")}</span>
            </button>
          </div>
        );
      })}
      {controls(true)}
      <span className="map-caption">데모 위치 개요 · 실제 지도 아님</span>
    </div>
  );
}
