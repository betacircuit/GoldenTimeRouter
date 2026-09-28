import type { Candidate, Origin } from "../domain";

export function highestProbability(candidates: Candidate[]) {
  return [...candidates]
    .sort(
      (a, b) =>
        (b.probability ?? -1) - (a.probability ?? -1) || a.rank - b.rank,
    )
    .slice(0, 3);
}

// Use 10 km by default; zoom into a compact cluster, or out for distant top picks.
export function mapViewport(origin: Origin, candidates: Candidate[]) {
  const lngKm = 111.32 * Math.cos((origin.lat * Math.PI) / 180);
  const distance = (c: Candidate) =>
    Math.hypot(
      (c.position.lat - origin.lat) * 111.32,
      (c.position.lng - origin.lng) * lngKm,
    );
  const top = highestProbability(candidates);
  if (!candidates.length)
    return {
      south: origin.lat - 10 / 111.32,
      north: origin.lat + 10 / 111.32,
      west: origin.lng - 10 / lngKm,
      east: origin.lng + 10 / lngKm,
    };
  const points = [
    origin,
    ...candidates.filter((c) => distance(c) <= 10).map((c) => c.position),
    ...top.map((c) => c.position),
  ];
  const south = Math.min(...points.map((p) => p.lat)),
    north = Math.max(...points.map((p) => p.lat));
  const west = Math.min(...points.map((p) => p.lng)),
    east = Math.max(...points.map((p) => p.lng));
  const latPadding = Math.max(0.7 / 111.32, (north - south) * 0.08);
  const lngPadding = Math.max(0.7 / lngKm, (east - west) * 0.08);
  return {
    south: south - latPadding,
    north: north + latPadding,
    west: west - lngPadding,
    east: east + lngPadding,
  };
}
