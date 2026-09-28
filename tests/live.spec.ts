import { fillNatural } from "./patient-helper";
import { expect, test } from "@playwright/test";
import { createFixture } from "../src/services/mock";
import type { RecommendationRequest } from "../src/domain";

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 37.5663, longitude: 126.9779 });
});

test("real cards keep unknown values and hour durations readable and open meaningful details", async ({
  page,
}) => {
  await page.route("**/api/recommendations", (r) => {
    const response = createFixture(r.request().postDataJSON());
    response.isDemo = false;
    response.rankingBasis = "eta";
    response.candidates.forEach((c, i) => {
      c.name =
        i === 5
          ? "의료법인서울효천의료재단에이치플러스양지병원"
          : `검증 병원 ${i + 1}`;
      c.durationSeconds =
        i === 0
          ? 80 * 60
          : i === 1
            ? 120 * 60
            : i === 2
              ? null
              : c.durationSeconds;
      c.probability = i === 0 ? -0.2 : i === 1 ? 0 : null;
      c.resources = [
        { name: "외상 진료", status: "unknown" },
        { name: "CT", status: "unmet" },
      ];
    });
    return r.fulfill({ json: response });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "현재 위치", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".hospital-grid")).toHaveCount(0);
  expect(
    (await page.getByLabel("환자 관찰 기록").boundingBox())!.height,
  ).toBeGreaterThan(400);
  await expect(
    page.getByText("현재 위치 확인됨", { exact: true }),
  ).toBeVisible();
  await fillNatural(page, 63);
  await page.getByRole("button", { name: "병원 찾기", exact: true }).click();
  await expect(page.locator(".hospital-card")).toHaveCount(10);
  await expect(page.locator(".hospital-card").nth(0)).toContainText(
    "1시간 20분",
  );
  await expect(page.locator(".hospital-card").nth(1)).toContainText("2시간");
  await expect(page.locator(".hospital-card").nth(0)).toContainText("0%");
  await expect(page.locator(".hospital-card").nth(2)).toContainText(
    "정보 없음",
  );
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1186, height: 730 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    const metrics = await page
      .locator(".hospital-numbers")
      .evaluateAll((nodes) =>
        nodes.map((el) => {
          const a = el.children[0]
            .querySelector("strong")!
            .getBoundingClientRect();
          const b = el.children[1]
            .querySelector("strong")!
            .getBoundingClientRect();
          const metric = el.getBoundingClientRect();
          const phone = el
            .closest("article")!
            .querySelector(".hospital-phone")!
            .getBoundingClientRect();
          return {
            overlap: a.right > b.left,
            overflow: b.right > metric.right,
            gap: phone.top - metric.bottom,
            wrapped: [...el.querySelectorAll("strong")].some(
              (n) => n.scrollWidth > n.clientWidth + 1,
            ),
          };
        }),
      );
    for (const metric of metrics) {
      expect(metric.overlap || metric.overflow || metric.wrapped).toBe(false);
      expect(metric.gap).toBeGreaterThanOrEqual(8);
    }
  }
  await page
    .getByRole("button", { name: "1위 검증 병원 1 선택", exact: true })
    .click();
  const details = page.getByRole("dialog", {
    name: "검증 병원 1",
    exact: true,
  });
  await expect(details).toContainText("환자에게 맞는 부분");
  await expect(details).toContainText("외상 진료 · 가능 여부 미확인");
  await expect(details).toContainText("CT · 필요 자원 미충족");
  await expect(details).toContainText("환자별 치료 적합도 순위는 아닙니다");
  await page.getByRole("button", { name: "병원 상세 닫기" }).click();
  await expect(details).toHaveCount(0);
});
test("live response and contact remain available without a map or automatic dial", async ({
  page,
  context,
}) => {
  let submitted: RecommendationRequest | undefined;
  await page.route("**/api/recommendations", (r) => {
    submitted = r.request().postDataJSON();
    const response = createFixture(submitted!, "three");
    response.isDemo = false;
    response.candidates.forEach((c, i) => {
      c.name = "연동 검증 병원 " + (i + 1);
    });
    return r.fulfill({ json: response });
  });
  await page.route("**/api/hospitals/*", (r) =>
    r.fulfill({
      json: {
        id: "demo-1",
        name: "연동 검증 병원 1",
        address: "테스트 주소",
        emergencyPhone: "02-0000-0000",
        isDemo: false,
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "현재 위치", exact: true }),
  ).toBeEnabled();
  await fillNatural(page, 63);
  // The device moved after the initial page fix. Search must refresh it.
  await context.setGeolocation({
    latitude: 37.4979,
    longitude: 127.0276,
    accuracy: 12,
  });
  await page
    .getByRole("button", { name: /병원 (다시 )?찾기/, exact: true })
    .click();
  await expect(page.locator(".hospital-card")).toHaveCount(3);
  expect(submitted?.patient.ageYears).toBe(63);
  expect(submitted?.origin).toMatchObject({
    lat: 37.4979,
    lng: 127.0276,
    accuracyMeters: 12,
  });
  expect(submitted?.patient.vitals.heartRate).toBeNull();
  await expect(page.getByText("지도를 표시할 수 없습니다")).toBeVisible();
  await page.getByRole("button", { name: "연동 검증 병원 1 전화" }).click();
  await expect(page.getByRole("dialog")).toContainText("02-0000-0000");
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText("입력된 필요 자원");
});

test("failed location refresh never submits the old fix and a new search retries", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let denyNext = false;
    let searching = false;
    window.addEventListener("deny-next-location", () => {
      denyNext = true;
      searching = true;
    });
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(
          success: PositionCallback,
          failure: PositionErrorCallback,
          options: PositionOptions,
        ) {
          if (denyNext) {
            denyNext = false;
            return failure({ code: 1 } as GeolocationPositionError);
          }
          if (options.maximumAge !== 0 || !options.enableHighAccuracy)
            throw new Error("Fresh high accuracy fix required");
          success({
            coords: {
              latitude: searching ? 37.4979 : 37.5663,
              longitude: 127.0276,
              accuracy: 10,
            },
            timestamp: Date.now(),
          } as GeolocationPosition);
        },
      },
    });
  });
  const requests: RecommendationRequest[] = [];
  await page.route("**/api/recommendations", (r) => {
    const request = r.request().postDataJSON();
    requests.push(request);
    return r.fulfill({
      json: { ...createFixture(request, "three"), isDemo: false },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "현재 위치", exact: true }),
  ).toBeEnabled();
  await fillNatural(page);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("deny-next-location")),
  );
  await page.getByRole("button", { name: "병원 찾기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("위치 권한");
  await expect(page.locator(".finder-processing")).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await expect(page.locator(".hospital-card")).toHaveCount(0);
  await page.getByRole("button", { name: "병원 찾기", exact: true }).click();
  await expect(page.locator(".hospital-card")).toHaveCount(3);
  expect(requests).toHaveLength(1);
  expect(requests[0].origin.lat).toBe(37.4979);
});

test("cancelling location refresh ignores its late fix and allows another search", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let searchCalls = 0;
    let armed = false;
    window.addEventListener("hold-next-location", () => {
      armed = true;
    });
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(success: PositionCallback) {
          if (armed) searchCalls++;
          const position = {
            coords: {
              latitude: searchCalls > 1 ? 37.53 : 37.51,
              longitude: 127.0276,
              accuracy: 10,
            },
            timestamp: Date.now(),
          } as GeolocationPosition;
          if (searchCalls === 1)
            window.addEventListener(
              "release-test-location",
              () => success(position),
              { once: true },
            );
          else success(position);
        },
      },
    });
  });
  const requests: RecommendationRequest[] = [];
  await page.route("**/api/recommendations", (r) => {
    const request = r.request().postDataJSON();
    requests.push(request);
    return r.fulfill({
      json: { ...createFixture(request, "three"), isDemo: false },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "현재 위치", exact: true }),
  ).toBeEnabled();
  await fillNatural(page);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("hold-next-location")),
  );
  await page.getByRole("button", { name: "병원 찾기", exact: true }).click();
  await expect(
    page.locator(".finder-processing").getByRole("status"),
  ).toHaveText("검색에 사용할 현재 위치를 확인하고 있어요");
  await page.getByRole("button", { name: "검색 취소" }).click();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("release-test-location")),
  );
  await expect(page.locator(".finder-processing")).toHaveCount(0);
  await expect(page.locator(".hospital-card")).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "병원 찾기", exact: true }).click();
  await expect(page.locator(".hospital-card")).toHaveCount(3);
  expect(requests).toHaveLength(1);
  expect(requests[0].origin.lat).toBe(37.53);
});
test("live failure preserves input without inventing candidates; Demo works in live mode", async ({
  page,
}) => {
  await page.route("**/api/recommendations", (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "현재 위치", exact: true }),
  ).toBeEnabled();
  await fillNatural(page, null);
  await page
    .getByRole("button", { name: /병원 (다시 )?찾기/, exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "정보를 불러오지 못했습니다",
  );
  await expect(page.locator(".hospital-card")).toHaveCount(0);
  await expect(page.getByLabel("환자 관찰 기록")).not.toHaveValue("");
  await page.getByRole("button", { name: "데모 시나리오 설정" }).click();
  await page.getByRole("button", { name: "데모 병원 찾기" }).click();
  await expect(page.locator(".hospital-card")).toHaveCount(10);
  await page.getByRole("button", { name: "데모 중앙병원 전화" }).click();
  await expect(page.getByRole("dialog")).toContainText("시연용 가상 번호");
});
