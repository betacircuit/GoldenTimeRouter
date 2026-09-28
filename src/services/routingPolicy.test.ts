import { expect, it } from "vitest";
import { etaRequest, useBatch } from "../../server/routing";
it("uses one batch only for current departures inside the 10km radius", () => {
  const origin = { lat: 37.5663, lng: 126.9779 };
  expect(useBatch(origin, [{ lat: 37.57, lng: 126.99 }])).toBe(true);
  expect(useBatch(origin, [{ lat: 37.57, lng: 126.99 }], true)).toBe(false);
  expect(useBatch(origin, [{ lat: 37.8, lng: 127.2 }])).toBe(false);
});
it("rejects oversized destination sets, invalid coordinates and patient payloads at the server boundary", () => {
  const origin = { lat: 37.5663, lng: 126.9779 };
  const destinations = Array.from({ length: 10 }, (_, i) => ({
    ...origin,
    id: String(i),
  }));
  expect(etaRequest.safeParse({ origin, destinations }).success).toBe(true);
  expect(
    etaRequest.safeParse({
      origin,
      destinations: [...destinations, destinations[0]],
    }).success,
  ).toBe(false);
  expect(
    etaRequest.safeParse({ origin: { lat: 100, lng: 126 }, destinations })
      .success,
  ).toBe(false);
  expect(
    etaRequest.safeParse({
      origin,
      destinations,
      patient: { symptoms: ["흉통"] },
    }).success,
  ).toBe(false);
});
