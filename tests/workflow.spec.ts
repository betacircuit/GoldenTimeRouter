import { expect, test, type Page } from "@playwright/test";
import { EXAMPLE_TEXT, exampleExtraction } from "../src/patient/extraction";

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 37.5663, longitude: 126.9779 });
});
async function demo(page: Page, scenario = "normal") {
  await page.goto("/results?data=demo&run=1&scenario=" + scenario);
  await expect(
    page.getByRole("button", { name: /병원 (다시 )?찾기/, exact: true }),
  ).toBeEnabled();
}
async function openToolbar(page: Page) {
  const toggle = page.getByRole("button", {
    name: "상단 바 열기",
    exact: true,
  });
  if (await toggle.isVisible()) await toggle.click();
}
test("unified 3 by 3 workspace fits desktop and tablet and omits removed controls", async ({
  page,
}) => {
  await demo(page);
  await expect(page.locator(".hospital-card")).toHaveCount(10);
  await expect(page.locator(".priority-card")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "주소 검색" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "정보 확인" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "예시 입력" })).toHaveCount(0);
  await expect(page.locator(".hospital-grid")).not.toContainText("소요시간");
  await expect(page.locator(".hospital-grid")).not.toContainText("수용확률");
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 1024 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    const cards = await page.locator(".hospital-card").evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x, y: r.y, bottom: r.bottom };
      }),
    );
    expect(cards[1].y).toBe(cards[0].y);
    expect(cards[2].y).toBe(cards[0].y);
    expect(cards[3].x).toBe(cards[0].x);
    expect(cards[8].bottom).toBeLessThanOrEqual(viewport.height);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".hospital-card")
        .evaluateAll((nodes) =>
          nodes.every((n) => n.scrollHeight <= n.clientHeight + 2),
        ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "상단 바 열기" }),
  ).toBeVisible();
  expect(
    await page
      .locator(".finder-shell")
      .evaluate((el) => el.clientWidth / el.clientHeight),
  ).toBeCloseTo(4 / 3);
  for (const label of await page.locator(".map-marker .marker-name").all())
    await expect(label).toBeVisible();
  expect(
    await page
      .locator(".hospital-card")
      .evaluateAll((nodes) =>
        nodes.every(
          (n) => getComputedStyle(n).backgroundColor === "rgb(255, 255, 255)",
        ),
      ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/finder-ipad.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/finder-mobile.png",
    fullPage: true,
  });
});
test("drag scroll reaches remaining hospitals and map selection returns to the right card", async ({
  page,
}) => {
  await demo(page);
  await expect(
    page.getByRole("navigation", { name: "병원 목록 페이지" }),
  ).toHaveCount(0);
  const grid = page.getByLabel("병원 목록 스크롤", { exact: true });
  const bounds = (await grid.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height - 45,
  );
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 45, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(() => grid.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(50);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "데모 푸른병원 전화" }).click();
  await expect(page).toHaveURL(/hospitals\/demo-10/);
  await expect(page.getByRole("dialog")).toContainText("02-0000-0010");
  await expect(page.getByRole("dialog")).toContainText("심장 진료");
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(() => grid.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(50);
  await page
    .getByRole("button", { name: "3위 데모 북서울병원 지도에서 선택" })
    .click();
  await expect.poll(() => grid.evaluate((el) => el.scrollTop)).toBeLessThan(10);
  await expect(
    page.getByRole("button", { name: "3위 데모 북서울병원 선택", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "데모 북서울병원 전화" }).click();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("Demo applies selected patient, origin, custom values and restores them on reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "데모 시나리오 설정" }).click();
  await page.getByRole("button", { name: "소아 고열", exact: true }).click();
  await page.getByLabel("출발 위치", { exact: true }).selectOption("2");
  await page.getByText("병원별 시간·확률 설정", { exact: true }).click();
  await page.getByLabel("후보 1 이동 시간", { exact: true }).fill("9");
  await page.getByLabel("후보 1 수용 확률", { exact: true }).fill("96");
  await page.getByRole("button", { name: "데모 병원 찾기" }).click();
  await expect(page.locator(".hospital-card").first()).toContainText("09분");
  await expect(page.locator(".hospital-card").first()).toContainText("96%");
  await expect(page.getByLabel("환자 관찰 기록")).toContainText("6세");
  await expect(page).toHaveURL(/case=child/);
  await page.reload();
  await expect(page.locator(".hospital-card").first()).toContainText("96%");
  await page.getByRole("button", { name: "데모 중앙병원 전화" }).click();
  await expect(page.getByRole("dialog")).toContainText("소아 진료");
});
test("editing patient text invalidates both cards and map, and search uses new extraction", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/patient-api/extract", (r) => {
    calls++;
    return r.fulfill({
      json: {
        ...exampleExtraction(),
        model: "test",
        inputVersion: r.request().postDataJSON().inputVersion,
      },
    });
  });
  await demo(page);
  await page.getByLabel("환자 관찰 기록").fill(EXAMPLE_TEXT);
  await expect(page.locator(".hospital-card")).toHaveCount(0);
  await expect(page.locator(".schematic-marker")).toHaveCount(0);
  await page.getByRole("button", { name: "병원 다시 찾기" }).click();
  await expect(page.locator(".hospital-card")).toHaveCount(10);
  expect(calls).toBe(1);
});
for (const [scenario, count] of [
  ["three", 3],
  ["empty", 0],
] as const)
  test(scenario + " response has no invented candidates", async ({ page }) => {
    await demo(page, scenario);
    await expect(page.locator(".hospital-card")).toHaveCount(count);
    if (!count)
      await expect(
        page.getByRole("heading", { name: "조건에 맞는 병원이 없습니다" }),
      ).toBeVisible();
  });
test("mixed response preserves missing values and resource warnings", async ({
  page,
}) => {
  await demo(page, "mixed");
  await expect(page.locator(".hospital-card").nth(1)).toContainText(
    "정보 없음",
  );
  await expect(page.locator(".hospital-card").nth(2)).toContainText(
    "조회 불가",
  );
  await expect(page.locator(".hospital-card").nth(3)).toContainText(
    "오래된 정보",
  );
  await expect(page.locator(".hospital-card").nth(4)).toContainText(
    "필요 자원 미충족",
  );
});
test("error scenario retains input and recovers through Demo", async ({
  page,
}) => {
  await demo(page, "error");
  await expect(page.getByRole("alert")).toContainText(
    "추천 정보를 불러오지 못했습니다",
  );
  await expect(page.getByLabel("환자 관찰 기록")).not.toHaveValue("");
  await openToolbar(page);
  await page.getByRole("button", { name: "데모 시나리오 설정" }).click();
  await page.getByLabel("응답 시나리오").selectOption("normal");
  await page.getByRole("button", { name: "데모 병원 찾기" }).click();
  await expect(page.locator(".hospital-card")).toHaveCount(10);
});
test("map zooms into a nearby cluster and expands to contain distant top three", async ({
  page,
}) => {
  await demo(page, "normal");
  const normal = Number(
    await page.locator(".schematic").getAttribute("data-map-span-km"),
  );
  await demo(page, "clustered");
  const clustered = Number(
    await page.locator(".schematic").getAttribute("data-map-span-km"),
  );
  expect(clustered).toBeLessThan(normal / 2);
  await demo(page, "wide");
  const wide = Number(
    await page.locator(".schematic").getAttribute("data-map-span-km"),
  );
  expect(wide).toBeGreaterThan(normal);
  const frame = (await page.locator(".map-frame").boundingBox())!;
  for (const marker of await page.locator(".top-marker").all()) {
    const box = (await marker.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(frame.x);
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width);
    expect(box.y).toBeGreaterThanOrEqual(frame.y);
    expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height);
  }
});
test("toolbar expands on demand and exits to a clean first screen", async ({
  page,
}) => {
  await demo(page);
  await expect(
    page.getByRole("button", { name: "처음 화면", exact: true }),
  ).toHaveCount(0);
  await openToolbar(page);
  await expect(
    page.getByRole("button", { name: "상단 바 닫기", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "처음 화면", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "상단 바 열기", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await openToolbar(page);
  await page.getByRole("button", { name: "처음 화면", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("환자 관찰 기록")).toHaveValue("");
  await expect(page.locator(".hospital-card")).toHaveCount(0);
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("button", { name: "병원 찾기", exact: true })).toBeEnabled();
  await expect(page.getByRole("timer", { name: "출동 경과 시간" })).toHaveText(
    "출동 경과00:00",
  );
});
test("cancelled extraction cannot display late results", async ({ page }) => {
  await page.route("**/patient-api/extract", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await r
      .fulfill({
        json: {
          ...exampleExtraction(),
          model: "test",
          inputVersion: r.request().postDataJSON().inputVersion,
        },
      })
      .catch(() => {});
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "현재 위치", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("환자 관찰 기록").fill(EXAMPLE_TEXT);
  await page
    .getByRole("button", { name: /병원 (다시 )?찾기/, exact: true })
    .click();
  await page.getByRole("button", { name: "검색 취소" }).click();
  await expect(page.locator(".finder-processing")).toHaveCount(0);
  await expect(page.getByLabel("환자 관찰 기록")).toHaveValue(EXAMPLE_TEXT);
  await expect(page.locator(".hospital-card")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /병원 (다시 )?찾기/, exact: true }),
  ).toBeEnabled();
});
test("location denial offers current-location retry and Demo still works", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(
          _success: unknown,
          failure: (e: { code: number }) => void,
        ) {
          failure({ code: 1 });
        },
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("위치 권한");
  await expect(
    page.getByRole("button", { name: "현재 위치", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "데모 시나리오 설정" }).click();
  await page.getByRole("button", { name: "데모 병원 찾기" }).click();
  await expect(page.locator(".hospital-card")).toHaveCount(10);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
