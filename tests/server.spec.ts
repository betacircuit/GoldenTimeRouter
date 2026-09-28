import { fillNatural } from "./patient-helper";
import { expect, test } from "@playwright/test";
test("server snapshot retains unknown predictions and real contacts in the concise workspace", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 37.5663, longitude: 126.9779 });
  await page.route("**/routing-api/**", (r) =>
    r.fulfill({ status: 502, json: { error: "test route failure" } }),
  );
  await page.route("**/server-catalog.json", (r) =>
    r.fulfill({
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
  await expect(
    page.getByRole("button", { name: "현재 위치", exact: true }),
  ).toBeEnabled();
  await fillNatural(page, null);
  await page
    .getByRole("button", { name: /병원 (다시 )?찾기/, exact: true })
    .click();
  await expect(page).toHaveURL(/results/);
  await expect(page.locator(".hospital-card")).toHaveCount(1);
  await expect(page.locator(".hospital-card")).toContainText("정보 없음");
  await expect(page.locator(".hospital-card")).toContainText("오래된 정보");
  await page.getByRole("button", { name: "서버 검증 기관 전화" }).click();
  await expect(page.getByRole("dialog")).toContainText("02-0000-0000");
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  await page.getByRole("button", { name: "병원 카드 닫기" }).click();
  await page.setViewportSize({ width: 320, height: 760 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "데모 시나리오 설정" }).click();
  await page.getByRole("button", { name: "데모 병원 찾기" }).click();
  await expect(page.locator(".hospital-card")).toHaveCount(9);
});
