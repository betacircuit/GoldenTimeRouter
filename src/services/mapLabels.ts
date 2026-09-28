// Move only the name labels; the red coordinate targets never move.
export function arrangeMapLabels(frame: HTMLElement) {
  const bounds = frame.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  type Box = { x: number; y: number; width: number; height: number };
  const overlaps = (a: Box, b: Box) =>
    a.x < b.x + b.width + 5 &&
    a.x + a.width + 5 > b.x &&
    a.y < b.y + b.height + 5 &&
    a.y + a.height + 5 > b.y;
  const occupied: Box[] = Array.from(
    (frame.closest(".finder-map") || frame).querySelectorAll<HTMLElement>(
      ".dispatch-timer, .map-tap-controls, .current-location, .map-caption, .origin-marker, .departure-pin",
    ),
  ).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.x - bounds.x,
      y: r.y - bounds.y,
      width: r.width,
      height: r.height,
    };
  });
  const anchors = Array.from(
    frame.querySelectorAll<HTMLElement>(".map-label-anchor"),
  );
  // Reserve every coordinate so a label cannot cover a hospital's hit target.
  occupied.push(
    ...anchors.map((anchor) => {
      const r = anchor
        .querySelector<HTMLElement>(".map-coordinate-target")!
        .getBoundingClientRect();
      return {
        x: r.x - bounds.x,
        y: r.y - bounds.y,
        width: r.width,
        height: r.height,
      };
    }),
  );
  for (const anchor of anchors) {
    const label = anchor.querySelector<HTMLButtonElement>(".map-marker")!;
    const line = anchor.querySelector<HTMLElement>(".map-label-leader")!;
    const point = anchor.getBoundingClientRect();
    const x = point.x - bounds.x,
      y = point.y - bounds.y;
    const width = label.offsetWidth,
      height = label.offsetHeight;
    if (x < 0 || x > bounds.width || y < 0 || y > bounds.height) {
      label.style.left = "0px";
      label.style.top = `${-height / 2 - 22}px`;
      line.style.width = "0px";
      continue;
    }
    const boxAt = (dx: number, dy: number): Box => ({
      x: Math.max(8, Math.min(bounds.width - width - 8, x + dx - width / 2)),
      y: Math.max(8, Math.min(bounds.height - height - 8, y + dy - height / 2)),
      width,
      height,
    });
    let box = boxAt(0, -height / 2 - 22);
    search: if (occupied.some((other) => overlaps(box, other))) {
      for (let radius = 12; radius <= 252; radius += 12) {
        for (const [dx, dy] of [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
          [-0.7, -0.7],
          [0.7, -0.7],
          [-0.7, 0.7],
          [0.7, 0.7],
        ]) {
          const next = boxAt(dx * radius, dy * radius);
          if (!occupied.some((other) => overlaps(next, other))) {
            box = next;
            break search;
          }
        }
      }
    }
    occupied.push(box);
    const dx = box.x + width / 2 - x,
      dy = box.y + height / 2 - y;
    label.style.left = `${dx}px`;
    label.style.top = `${dy}px`;
    const length = Math.hypot(dx, dy);
    line.style.width = length > 5 ? `${length}px` : "0px";
    line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    anchor.classList.toggle("is-offset", length > 5);
  }
}
