// Name labels may move; geographic coordinate markers always stay fixed.
export function arrangeMapLabels(frame: HTMLElement) {
  const bounds = frame.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  type Box = { x: number; y: number; width: number; height: number };
  const relativeBox = (el: HTMLElement): Box => {
    const r = el.getBoundingClientRect();
    return {
      x: r.x - bounds.x,
      y: r.y - bounds.y,
      width: r.width,
      height: r.height,
    };
  };
  const overlaps = (a: Box, b: Box) =>
    a.x < b.x + b.width + 5 &&
    a.x + a.width + 5 > b.x &&
    a.y < b.y + b.height + 5 &&
    a.y + a.height + 5 > b.y;
  const onMap = (x: number, y: number) =>
    x >= 8 && x <= bounds.width - 8 && y >= 8 && y <= bounds.height - 8;
  const occupied = Array.from(
    (frame.closest(".finder-map") || frame).querySelectorAll<HTMLElement>(
      ".dispatch-timer, .map-tap-controls, .current-location, .map-caption, .location-status",
    ),
  ).map(relativeBox);
  const anchors = Array.from(
    frame.querySelectorAll<HTMLElement>(".map-label-anchor"),
  )
    .filter((anchor) => {
      const point = relativeBox(anchor);
      const visible = onMap(point.x, point.y);
      // Off-screen coordinate labels must not poke into the map and cover visible ones.
      anchor.style.visibility = visible ? "visible" : "hidden";
      return visible;
    })
    .sort(
      (a, b) =>
        Number(b.classList.contains("active")) -
        Number(a.classList.contains("active")),
    );
  occupied.push(
    ...anchors.map((anchor) =>
      relativeBox(anchor.querySelector<HTMLElement>(".map-coordinate-target")!),
    ),
  );
  const origin = frame.querySelector<HTMLElement>(".user-location-marker");
  if (origin) {
    const box = relativeBox(origin);
    occupied.push({
      x: box.x - 7,
      y: box.y - 7,
      width: box.width + 14,
      height: box.height + 14,
    });
  }
  const place = (
    x: number,
    y: number,
    width: number,
    height: number,
    below = false,
  ): Box => {
    const at = (cx: number, cy: number): Box => ({
      x: Math.max(8, Math.min(bounds.width - width - 8, cx - width / 2)),
      y: Math.max(8, Math.min(bounds.height - height - 8, cy - height / 2)),
      width,
      height,
    });
    const clear = (box: Box) => !occupied.some((other) => overlaps(box, other));
    const preferred = at(x, y + (below ? 1 : -1) * (height / 2 + 24));
    if (clear(preferred)) {
      occupied.push(preferred);
      return preferred;
    }
    let best: Box | null = null;
    let score = Infinity;
    // Scan the available map area instead of giving up when nearby radial slots are full.
    for (let top = 8; top <= bounds.height - height - 8; top += 8) {
      for (let left = 8; left <= bounds.width - width - 8; left += 8) {
        const box = { x: left, y: top, width, height };
        const distance = Math.hypot(left + width / 2 - x, top + height / 2 - y);
        if (distance < score && clear(box)) {
          best = box;
          score = distance;
        }
      }
    }
    const result = best || preferred;
    occupied.push(result);
    return result;
  };
  if (origin) {
    const originBox = relativeBox(origin);
    const label = origin.querySelector<HTMLElement>(".user-location-label")!;
    const x = originBox.x + originBox.width / 2;
    const y = originBox.y + originBox.height / 2;
    label.style.visibility = onMap(x, y) ? "visible" : "hidden";
    if (onMap(x, y)) {
      const box = place(x, y, label.offsetWidth, label.offsetHeight, true);
      label.style.left = `${box.x + box.width / 2 - originBox.x}px`;
      label.style.top = `${box.y - originBox.y}px`;
    }
  }
  for (const anchor of anchors) {
    const label = anchor.querySelector<HTMLElement>(".map-marker")!;
    const line = anchor.querySelector<HTMLElement>(".map-label-leader")!;
    const point = relativeBox(anchor);
    const box = place(point.x, point.y, label.offsetWidth, label.offsetHeight);
    const dx = box.x + box.width / 2 - point.x;
    const dy = box.y + box.height / 2 - point.y;
    label.style.left = `${dx}px`;
    label.style.top = `${dy}px`;
    const length = Math.hypot(dx, dy);
    line.style.width = length > 5 ? `${length}px` : "0px";
    line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  }
}
