import { expect, test, type Page } from "@playwright/test";
import { EXAMPLE_TEXT, exampleExtraction } from "../src/patient/extraction";

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 37.5663, longitude: 126.9779 });
});
async function example(page: Page) {
  await page.getByRole("button", { name: "예시 입력" }).click();
}
async function search(page: Page) {
  await page.getByRole("button", { name: "병원 찾기", exact: true }).click();
  await expect(page).toHaveURL(/results/);
}
async function scenario(page: Page, value: string) {
  await page.getByRole("button", { name: "데모 시나리오 설정" }).click();
  await page.getByLabel("응답 시나리오").selectOption(value);
  await page.getByRole("button", { name: "적용", exact: true }).click();
}

test("tablet input and results fit without page scrolling, with logo and concise controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "Golden Time Router 로고" })).toBeVisible();
  await expect(page.getByRole("button", { name: "데이터 근거" })).toHaveText("");
  await expect(page.getByText("자동 등록됨")).toHaveCount(0);
  await expect(page.getByText("DEPARTURE")).toHaveCount(0);
  for (const viewport of [{width:1024,height:768},{width:768,height:1024},{width:1366,height:768}]) {
    await page.setViewportSize(viewport);
    const input = await page.getByLabel("환자 관찰 기록").boundingBox();
    const map = await page.locator(".location-panel").boundingBox();
    expect(map!.x).toBeGreaterThan(input!.x);
    expect(map!.height).toBeGreaterThan(400);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({path:"test-results/tablet-input.png"});
  await example(page); await search(page);
  await expect(page.getByText("조건에 맞는 병원 10곳")).toHaveCount(0);
  for (const viewport of [{width:1024,height:768},{width:768,height:1024},{width:1366,height:768}]) {
    await page.setViewportSize(viewport);
    const last = await page.locator(".hospital-card").last().boundingBox();
    expect(last!.y+last!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(page.getByRole("region", {name:"병원 위치 비교"})).toBeVisible();
  const sideMap = await page.locator(".map-results .map-frame").boundingBox();
  expect(sideMap!.height).toBeGreaterThan(200);
  await page.screenshot({path:"test-results/tablet-results.png"});
});

test("direct search, all ten candidates, sort and page selection survive detail", async ({ page }) => {
  await page.goto("/"); await example(page); await search(page);
  await expect(page.locator(".hospital-card")).toHaveCount(4);
  await page.getByRole("button", {name:"병원 목록 다음"}).click();
  await expect(page.locator(".hospital-card")).toHaveCount(4);
  await page.getByRole("button", {name:"8위 데모 서강병원 상세 보기"}).click();
  await expect(page.getByRole("heading", {name:"데모 서강병원",exact:true})).toBeVisible();
  await expect(page.getByRole("button", {name:"응급실 전화"})).toBeDisabled();
  await page.getByRole("button", {name:"병원 목록으로"}).click();
  await expect(page.locator(".selected-card")).toHaveAccessibleName("8위 데모 서강병원 상세 보기");
  await page.getByRole("button", {name:"병원 목록 다음"}).click();
  await expect(page.locator(".hospital-card")).toHaveCount(2);
  await page.getByLabel("병원 정렬").selectOption("eta");
  await expect(page.locator(".hospital-card").first()).toHaveAccessibleName("2위 데모 한빛병원 상세 보기");
});

test("map marker selection and detail refer to the same hospital", async ({ page }) => {
  await page.goto("/"); await example(page); await search(page);
  await page.getByRole("tab", {name:"지도",exact:true}).click();
  await page.getByRole("button", {name:"3위 데모 북서울병원 선택",exact:true}).click();
  await page.getByRole("button", {name:"3위 데모 북서울병원 상세 보기",exact:true}).click();
  await expect(page.getByRole("heading", {name:"데모 북서울병원",exact:true})).toBeVisible();
  await page.getByRole("button", {name:"병원 목록으로"}).click();
  await expect(page.getByRole("button", {name:"3위 데모 북서울병원 선택",exact:true})).toHaveAttribute("aria-pressed","true");
});

test("optional numeric review keeps the wheel and records corrections", async ({ page }) => {
  await page.goto("/"); await example(page);
  await page.getByRole("button", {name:"정보 확인",exact:true}).click();
  await page.getByRole("button", {name:"연령 수정: 58",exact:true}).click();
  const tens=page.getByRole("spinbutton", {name:"10의 자리",exact:true});
  await expect.poll(()=>tens.evaluate(e=>e.scrollTop)).toBe(5*48);
  await tens.press("ArrowUp");
  await page.getByRole("spinbutton", {name:"1의 자리",exact:true}).press("ArrowUp");
  await page.getByRole("button", {name:"선택 적용",exact:true}).click();
  await page.getByRole("button", {name:"수정 저장",exact:true}).click();
  await expect(page.getByRole("button", {name:"연령 수정: 47",exact:true})).toBeVisible();
  await page.getByRole("button", {name:"완료",exact:true}).click();
  await search(page);
  await page.getByRole("button", {name:"정보 수정",exact:true}).click();
  await page.getByRole("button", {name:"정보 확인",exact:true}).click();
  await expect(page.getByRole("button", {name:"연령 수정: 47",exact:true})).toBeVisible();
  await expect(page.locator('input[type="number"]')).toHaveCount(0);
});

test("a single click extracts narrative then searches, showing elapsed progress", async ({ page }) => {
  let calls=0;
  await page.route("**/patient-api/extract", async r=>{
    calls++;
    await new Promise(resolve=>setTimeout(resolve,1300));
    await r.fulfill({json:{...exampleExtraction(), model:"test", inputVersion:r.request().postDataJSON().inputVersion}});
  });
  await page.goto("/");
  await page.getByLabel("환자 관찰 기록").fill(EXAMPLE_TEXT);
  await page.getByRole("button", {name:"병원 찾기",exact:true}).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(page.getByRole("button", {name:"처리 중",exact:true})).toBeDisabled();
  await expect(page).toHaveURL(/results/);
  expect(calls).toBe(1);
});

test("cancelling extraction prevents late navigation and preserves input", async ({ page }) => {
  await page.route("**/patient-api/extract", async r=>{
    await new Promise(resolve=>setTimeout(resolve,1500));
    await r.fulfill({json:{...exampleExtraction(),model:"test",inputVersion:r.request().postDataJSON().inputVersion}}).catch(()=>{});
  });
  await page.goto("/"); await page.getByLabel("환자 관찰 기록").fill(EXAMPLE_TEXT);
  await page.getByRole("button", {name:"병원 찾기",exact:true}).click();
  await page.getByRole("button", {name:"검색 취소",exact:true}).click();
  await expect(page.getByRole("timer")).toHaveCount(0);
  await expect(page.getByLabel("환자 관찰 기록")).toHaveValue(EXAMPLE_TEXT);
  await expect(page.getByRole("button", {name:"병원 찾기",exact:true})).toBeEnabled();
});

test("extraction quota errors preserve changed text and do not reuse old facts", async ({ page }) => {
  await page.route("**/patient-api/extract",r=>r.fulfill({status:429,json:{error:"호출 한도"}}));
  await page.goto("/"); await example(page);
  await page.getByLabel("환자 관찰 기록").fill("60대 환자, 흉통 호소");
  await page.getByRole("button", {name:"병원 찾기",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("호출 한도");
  await expect(page.getByLabel("환자 관찰 기록")).toHaveValue("60대 환자, 흉통 호소");
  await expect(page.locator(".hospital-card")).toHaveCount(0);
});

for (const [mode,count] of [["three",3],["empty",0]] as const) test(`${count} candidates render without invented results`, async ({page})=>{
  await page.goto("/"); await scenario(page,mode); await example(page); await search(page);
  await expect(page.locator(".hospital-card")).toHaveCount(count);
  if(!count) await expect(page.getByRole("heading",{name:"조건에 맞는 병원이 없습니다"})).toBeVisible();
});

test("missing probability, route failure, stale and unmet resources remain explicit", async ({page})=>{
  await page.goto("/"); await scenario(page,"mixed"); await example(page); await search(page);
  await expect(page.getByRole("button",{name:"2위 데모 한빛병원 상세 보기"})).toContainText("정보 없음");
  await expect(page.getByRole("button",{name:"3위 데모 북서울병원 상세 보기"})).toContainText("조회 불가");
  await expect(page.getByRole("button",{name:"4위 데모 서림병원 상세 보기"})).toContainText("오래된 정보");
  await page.getByRole("button",{name:"3위 데모 북서울병원 상세 보기"}).click();
  await expect(page.getByText("경로 조회 불가 · 병원 정보는 계속 확인할 수 있습니다.")).toBeVisible();
  await page.getByRole("button",{name:"병원 목록으로"}).click();
  await page.getByRole("button",{name:"병원 목록 다음"}).click();
  await expect(page.getByRole("button",{name:"5위 데모 새봄병원 상세 보기"})).toContainText("미충족");
});

test("recommendation errors keep input and can recover", async ({page})=>{
  await page.goto("/"); await scenario(page,"error"); await example(page);
  await page.getByRole("button",{name:"병원 찾기",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("추천 정보를 불러오지 못했습니다");
  await expect(page.getByLabel("환자 관찰 기록")).toHaveValue(EXAMPLE_TEXT);
  await scenario(page,"normal"); await search(page);
});

test("manual address works when location is pending", async ({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,"geolocation",{value:{getCurrentPosition(){}}}));
  await page.goto("/");
  await page.getByRole("button",{name:"주소 검색",exact:true}).click();
  await page.getByLabel("도로명 주소 검색").fill("서울역");
  await page.getByRole("button",{name:"검색",exact:true}).click();
  await page.getByRole("button",{name:"서울역 · 서울 용산구 한강대로 405"}).click();
  await expect(page.getByRole("button",{name:"병원 찾기",exact:true})).toBeEnabled();
  await example(page); await search(page);
});

test("invalid detail URL returns to entry",async({page})=>{
  await page.goto("/hospitals/missing");
  await expect(page.getByRole("heading",{name:"환자 정보",exact:true})).toBeVisible();
});
