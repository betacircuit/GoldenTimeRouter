import { fillNatural } from "./patient-helper";
import { expect, test } from "@playwright/test";
import { createFixture } from "../src/services/mock";
import type { RecommendationRequest } from "../src/domain";

test("live HTTP adapter renders model response, enables verified contact and isolates map failure", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 37.5663, longitude: 126.9779 });
  let submitted: RecommendationRequest | undefined;
  await page.route("**/api/recommendations", async (route) => {
    submitted = route.request().postDataJSON();
    const response = createFixture(submitted!, "three");
    response.isDemo = false;
    response.model.version = "test-contract";
    response.candidates.forEach((c, i) => {
      c.name = `연동 검증 병원 ${i + 1}`;
    });
    await route.fulfill({ json: response });
  });
  await page.route("**/api/hospitals/*", (route) =>
    route.fulfill({
      json: {
        id: "demo-1",
        name: "연동 검증 병원 1",
        address: "연동 테스트 주소",
        emergencyPhone: "02-0000-0000",
        isDemo: false,
      },
    }),
  );
  await page.route("**/api/routes", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/");
  await expect(page.getByText("데모 데이터·예측", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "새로고침" }).click();
  await expect(page.getByRole("button", { name: "새로고침" })).toBeEnabled();
  await fillNatural(page, 63);
  await page.getByRole("button", { name: "병원 찾기", exact: true }).click();
  await expect(page.locator(".hospital-card")).toHaveCount(3);
  expect(submitted?.patient.ageYears).toBe(63);
  expect(submitted?.patient.vitals.heartRate).toBeNull();
  await page.getByRole("tab", { name: "지도", exact: true }).click();
  await expect(page.getByText("지도를 표시할 수 없습니다")).toBeVisible();
  await expect(
    page.getByText("경로를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "1위 연동 검증 병원 1 상세 보기" })
    .click();
  await expect(page.getByRole("link", { name: "응급실 전화" })).toHaveAttribute(
    "href",
    "tel:0200000000",
  );
  await expect(
    page.getByRole("heading", { name: "연동 검증 병원 1", exact: true }),
  ).toBeVisible();
});

test("live API failure does not manufacture hospital candidates", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 37.5663, longitude: 126.9779 });
  await page.route("**/api/recommendations", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "새로고침" }).click();
  await expect(page.getByRole("button", { name: "새로고침" })).toBeEnabled();
  await fillNatural(page, null);
  await page.getByRole("button", { name: "병원 찾기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "정보를 불러오지 못했습니다",
  );
  await expect(page.locator(".hospital-card")).toHaveCount(0);
  await expect(page.getByLabel("환자 관찰 기록")).not.toHaveValue("");
});
