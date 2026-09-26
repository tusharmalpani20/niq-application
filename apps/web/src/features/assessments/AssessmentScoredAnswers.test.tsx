import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import type { FormField } from "@niq/application-contracts";
import { AssessmentScoredAnswers } from "./AssessmentScoredAnswers";

test("scored answers keep form groups and show selected options as icon chips", () => {
  const fields = [
    { id: "patient_name", label: "Patient name", kind: "text", owner: "application" },
    { id: "age", label: "Age", kind: "number", owner: "application" },
    { id: "tumour_type", label: "Type of tumour", kind: "multi_select", owner: "scoring", options: [
      { id: "tumour_type_solid", label: "Solid tumour" }, { id: "tumour_type_haematological", label: "Haematological" },
    ] },
    { id: "cancer_type", label: "Type of cancer", kind: "select", owner: "scoring", options: [{ id: "cancer_2", label: "Lung cancer" }] },
  ] as FormField[];
  const html = renderToStaticMarkup(<AssessmentScoredAnswers fields={fields} answers={{ patient_name: "TEST patient", age: 42, tumour_type: ["tumour_type_solid", "tumour_type_haematological"], cancer_type: "cancer_2" }} components={[]} revised={false} />);
  const document = new JSDOM(html).window.document;
  const personalGroup = document.querySelector('[data-score-group="patient_name"]');
  expect(personalGroup?.querySelectorAll("[data-score-field]")).toHaveLength(2);
  expect(personalGroup?.textContent).toContain("TEST patient");
  const tumour = document.querySelector('[data-score-field="tumour_type"]');
  expect(tumour?.querySelectorAll("[data-tumour-icon]")).toHaveLength(2);
  expect(tumour?.textContent).toContain("Solid tumour");
  expect(tumour?.textContent).toContain("Haematological");
  expect(document.querySelector('[data-score-field="cancer_type"] [data-cancer-icon="cancer_2"]')).not.toBeNull();
  expect(document.querySelector('[data-score-field="patient_name"] svg')).toBeNull();
});

test("scored answer layout retains item scores and calculated values", () => {
  const fields = [
    { id: "height_cm", label: "Height", kind: "number", owner: "application", unit: "cm" },
    { id: "current_weight_kg", label: "Current weight", kind: "number", owner: "application", unit: "kg" },
    { id: "bmi", label: "BMI", kind: "calculated", owner: "application" },
    { id: "stage", label: "Stage", kind: "select", owner: "scoring", options: [{ id: "stage_metastatic", label: "Metastatic" }] },
  ] as FormField[];
  const html = renderToStaticMarkup(<AssessmentScoredAnswers fields={fields} answers={{ height_cm: 175, current_weight_kg: 70, stage: "stage_metastatic" }} components={[{ id: "stage", sectionId: "disease", label: "Stage", points: 4, status: "answered" }]} reviewedItems={[{ id: "stage", niqPoints: 4, reviewedPoints: 5, overridden: true }]} revised />);
  const document = new JSDOM(html).window.document;
  expect(document.querySelector('[data-score-group="height_cm"]')?.querySelectorAll("[data-score-field]")).toHaveLength(3);
  expect(document.querySelector('[data-score-field="bmi"]')?.textContent).toContain("22.9");
  expect(document.querySelector('[data-score-field="stage"]')?.textContent).toContain("NIQ 4 pts");
  expect(document.querySelector('[data-score-field="stage"]')?.textContent).toContain("Reviewed 5 pts · Adjusted");
  expect(document.querySelector('[data-score-field="stage"] [data-disease-choice-icon="stage_metastatic"]')).not.toBeNull();
});

test("protein shows the returned adequacy and assigns points only to protein intake", () => {
  const fields = [
    { id: "dietary_intake", label: "Dietary intake change", kind: "select", owner: "supporting", options: [{ id: "dietary_intake_more_than_usual", label: "More than usual" }] },
    { id: "protein_intake", label: "Protein intake", kind: "calculated", owner: "scoring" },
  ] as FormField[];
  const html = renderToStaticMarkup(<AssessmentScoredAnswers fields={fields} answers={{ dietary_intake: "dietary_intake_more_than_usual" }} components={[{ id: "protein_intake", sectionId: "dietary_details", label: "Protein intake", points: 0, status: "answered" }]} derived={{ weightLossPercent: null, proteinAdequacy: "adequate" }} revised={false} />);
  const document = new JSDOM(html).window.document;
  const dietary = document.querySelector('[data-score-field="dietary_intake"]');
  const protein = document.querySelector('[data-score-field="protein_intake"]');
  expect(dietary?.textContent).toContain("Used to derive protein intake · No separate points");
  expect(dietary?.textContent).not.toContain("0 pts");
  expect(protein?.textContent).toContain("Adequate");
  expect(protein?.textContent).toContain("0 pts");
  expect(protein?.textContent).not.toContain("Calculated from assessment answers");
});

test("palliative treatment follow-ups share a row after treatment status", () => {
  const fields = [
    { id: "treatment_status", label: "Treatment status", kind: "select", owner: "scoring", options: [{ id: "palliative_care", label: "Palliative Care" }] },
    { id: "palliative_status", label: "Palliative treatment path", kind: "select", owner: "scoring", visibleWhen: [{ fieldId: "treatment_status", equals: "palliative_care" }], options: [{ id: "post_treatment", label: "Post treatment" }] },
    { id: "palliative_timing", label: "Palliative post-treatment timing", kind: "select", owner: "scoring", visibleWhen: [{ fieldId: "palliative_status", equals: "post_treatment" }], options: [{ id: "post_12_months", label: "Post 12 months" }] },
  ] as FormField[];
  const answers = { treatment_status: "palliative_care", palliative_status: "post_treatment", palliative_timing: "post_12_months" };
  const document = new JSDOM(renderToStaticMarkup(<AssessmentScoredAnswers fields={fields} answers={answers} components={[]} revised={false} />)).window.document;
  const group = document.querySelector('[data-score-group="treatment_status"]');
  expect(group?.querySelectorAll("[data-score-field]")).toHaveLength(3);
  expect(group?.querySelector('[data-score-field="treatment_status"]')?.className).toContain("@min-[36rem]:col-span-2");
  expect(group?.querySelector('[data-score-field="palliative_status"]')?.className).not.toContain("col-span-2");
  expect(group?.querySelector('[data-score-field="palliative_timing"]')?.className).not.toContain("col-span-2");
});
