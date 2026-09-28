import type { Page } from "@playwright/test";
import { exampleExtraction } from "../src/patient/extraction";
export async function fillNatural(page: Page, age: number | null = 58) {
  await page.route("**/patient-api/status", (r) =>
    r.fulfill({ json: { configured: true, model: "test-model" } }),
  );
  await page.route("**/patient-api/extract", (r) => {
    const request = r.request().postDataJSON();
    const result = exampleExtraction();
    result.facts = result.facts.filter(
      (f) =>
        ![
          "vitals.sbp",
          "vitals.dbp",
          "vitals.spo2",
          "triage.pre_ktas",
          "history.condition",
        ].includes(f.field),
    );
    if (age === null)
      result.facts = result.facts.filter((f) => f.field !== "patient.age");
    else
      result.facts[0] = {
        ...result.facts[0],
        value: age,
        evidence: `${age}세`,
      };
    return r.fulfill({
      json: {
        ...result,
        model: "test-model",
        inputVersion: request.inputVersion,
      },
    });
  });
  await page
    .getByLabel("환자 관찰 기록")
    .fill(
      `${age === null ? "연령 모름" : `${age}세`}. 30분 전부터 흉통이 있다고 말함.`,
    );
}
