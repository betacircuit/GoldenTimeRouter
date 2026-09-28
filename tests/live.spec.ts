import { fillNatural } from "./patient-helper";
import { expect, test } from "@playwright/test";
import { createFixture } from "../src/services/mock";
import type { RecommendationRequest } from "../src/domain";

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 37.5663, longitude: 126.9779 });
});
test("live response and contact remain available without a map or automatic dial", async ({
  page,
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
  await page
    .getByRole("button", { name: /병원 (다시 )?찾기/, exact: true })
    .click();
  await expect(page.locator(".hospital-card")).toHaveCount(3);
  expect(submitted?.patient.ageYears).toBe(63);
  expect(submitted?.patient.vitals.heartRate).toBeNull();
  await expect(page.getByText("지도를 표시할 수 없습니다")).toBeVisible();
  await page.getByRole("button", { name: "연동 검증 병원 1 전화" }).click();
  await expect(page.getByRole("dialog")).toContainText("02-0000-0000");
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText("입력된 필요 자원");
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
  await expect(page.locator(".hospital-card")).toHaveCount(9);
  await page.getByRole("button", { name: "데모 중앙병원 전화" }).click();
  await expect(page.getByRole("dialog")).toContainText("시연용 가상 번호");
});
