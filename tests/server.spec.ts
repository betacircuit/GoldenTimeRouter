import { fillNatural } from "./patient-helper";
import { expect, test } from "@playwright/test";
test("server snapshot uses current coordinates, raw resource reports, and real contacts without inventing model outputs", async ({
  page,
  context,
}) => {
  await page.route("**/routing-api/**", (r) =>
    r.fulfill({ status: 502, json: { error: "test route failure" } }),
  );
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 37.5663, longitude: 126.9779 });
  await page.route("**/server-catalog.json", (route) =>
    route.fulfill({
      json: {
        exportedAt: "2026-09-28T06:00:00Z",
        source: "NEMC",
        hospitals: [
          {
            hospital_id: "nemc:test",
            hospital_name: "서버 검증 기관",
            address: "서버 주소",
            latitude: 37.57,
            longitude: 126.98,
            emergency_phone: "02-0000-0000",
            emergency_institution_category_name: "지역응급의료센터",
            retrieved_at_utc: "2026-09-14T01:00:00Z",
          },
        ],
        states: [
          {
            hospital_id: "nemc:test",
            source_endpoint: "getEmrrmRltmUsefulSckbdInfoInqire",
            retrieved_at_utc: "2020-01-01T00:00:00Z",
            er_beds_available: -2,
            icu_beds_available: 0,
            operating_rooms_available: null,
            ct_availability_status: "Y",
            mri_availability_status: null,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "새로고침" })).toBeEnabled();
  await fillNatural(page, null);
  await page.getByRole("button", { name: "병원 찾기", exact: true }).click();
  await expect(page).toHaveURL(/results/);
  await expect(page.locator(".hospital-card")).toHaveCount(1);
  await expect(page.locator(".hospital-card")).toContainText("예측 정보 없음");
  await expect(page.locator(".hospital-card")).toContainText("직선");
  await expect(page.locator(".hospital-card")).toContainText("오래된 정보");
  await page.locator(".hospital-card").click();
  await expect(page.locator(".observation-list")).toContainText("-2");
  await expect(page.getByRole("link", { name: "응급실 전화" })).toHaveAttribute(
    "href",
    "tel:0200000000",
  );
  await page.setViewportSize({ width: 320, height: 760 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "연결 정보" }).click();
  await page.getByRole("link", { name: "예시 모델 보기" }).click();
  await page.getByRole("button", { name: "예시 입력" }).click();

  await page.getByRole("button", { name: "병원 찾기", exact: true }).click();
  await expect(page).toHaveURL(/results\?data=demo/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "예시 입력" }),
  ).toBeVisible();
});

test("real ETA ranking keeps one preferred candidate, structural provenance and aggregate data separate", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 37.5663, longitude: 126.9779 });
  await page.route("**/routing-api/eta", (r) => {
    const request = r.request().postDataJSON();
    return r.fulfill({
      json: {
        queriedAt: new Date().toISOString(),
        results: request.destinations.map((d: { id: string }, i: number) => ({
          id: d.id,
          durationSeconds: 600 + i * 60,
          distanceMeters: 4000 + i * 100,
          status: "ok",
        })),
      },
    });
  });
  await page.route("**/routing-api/route", (r) =>
    r.fulfill({ status: 502, json: { error: "test path failure" } }),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "새로고침" })).toBeEnabled();
  await fillNatural(page, null);
  await page.getByRole("button", { name: "병원 찾기", exact: true }).click();
  await expect(page.locator(".hospital-card")).toHaveCount(4);
  await expect(page.locator(".preferred-hospital")).toHaveCount(1);
  await expect(page.locator(".preferred-hospital")).toContainText(
    "가까운 병원",
  );
  await expect(page.locator(".preferred-hospital")).toContainText("10분");

  await page.locator(".preferred-hospital button").click();
  await expect(
    page.getByRole("heading", { name: "보유 시설·장비·전문의" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "병원 목록으로" }).click();
  await page.getByRole("button", { name: "데이터 근거", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("7,915,798");
  await page.getByLabel("NEDIS 자료 연도").selectOption("2018");
  await expect(page.getByRole("dialog")).toContainText("1,102,789");
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1366, height: 1024 },
    { width: 320, height: 760 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "데이터 근거 닫기" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
