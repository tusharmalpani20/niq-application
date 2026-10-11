import { expect, test } from "bun:test";
import { OTHER_DRUG_CLASS_ID, suggestedDrugClassIds, upgradeDraftAssessmentForm, type AssessmentFormManifest } from "./assessment-form";
import { getScoringAssessmentAnswers, isAssessmentFieldApplicable, validateAssessmentAnswers } from "./assessment-form-validation";

const manifest: AssessmentFormManifest = {
  version: "test",
  sections: [
    { id: "disease_status", title: "Disease", fields: [{ id: "cancer_type", label: "Cancer", kind: "select", required: true, owner: "application", source: "test", options: [{ id: "cancer_lung", label: "Lung" }, { id: "cancer_breast", label: "Breast" }, { id: "cancer_other", label: "Other" }] }] },
    { id: "treatment", title: "Treatment", fields: [
      { id: "current_cancer_treatment", label: "Treatment", kind: "multi_select", required: false, owner: "scoring", source: "test", options: [{ id: "chemotherapy", label: "Chemotherapy" }, { id: "immunotherapy", label: "Immunotherapy" }] },
      { id: "drug_classes", label: "Drug classes", kind: "multi_select", required: false, owner: "application", source: "test", options: [{ id: "platinum", label: "Platinum agents" }, { id: "checkpoint", label: "Checkpoint inhibitors" }, { id: "tki", label: "Tyrosine kinase inhibitors" }], visibleWhen: [{ fieldId: "cancer_type", nonEmpty: true }, { fieldId: "current_cancer_treatment", nonEmpty: true }] },
    ] },
  ],
  drugClassSuggestions: [
    { cancerTypeId: "cancer_lung", treatmentTypeId: "chemotherapy", classId: "platinum" },
    { cancerTypeId: null, treatmentTypeId: "chemotherapy", classId: "tki" },
    { cancerTypeId: null, treatmentTypeId: "immunotherapy", classId: "checkpoint" },
  ],
};

test("drug class menu suggests the cancer and each selected treatment but accepts any configured class", () => {
  const answers = { cancer_type: "cancer_lung", current_cancer_treatment: ["chemotherapy", "immunotherapy"], drug_classes: ["tki"] };
  expect(suggestedDrugClassIds(manifest, answers)).toEqual(["platinum", "checkpoint"]);
  expect(suggestedDrugClassIds(manifest, { ...answers, cancer_type: "cancer_breast" })).toEqual(["tki", "checkpoint"]);
  expect(suggestedDrugClassIds(manifest, { ...answers, cancer_type: "cancer_other" })).toBeUndefined();
  expect(suggestedDrugClassIds(manifest, { ...answers, current_cancer_treatment: ["current_cancer_treatment_other"] })).toBeUndefined();
  expect(suggestedDrugClassIds(manifest, { ...answers, current_cancer_treatment: ["radiation"] })).toBeUndefined();
  expect(validateAssessmentAnswers(manifest, answers)).toEqual({});
  expect(validateAssessmentAnswers(manifest, { ...answers, drug_classes: ["unknown"] }).drug_classes).toBe("Choose valid options");
});

test("drug classes are optional, conditional, and absent from scoring input", () => {
  const field = manifest.sections[1]!.fields[1]!;
  expect(isAssessmentFieldApplicable(field, {})).toBe(false);
  expect(isAssessmentFieldApplicable(field, { cancer_type: "cancer_lung", current_cancer_treatment: [] })).toBe(false);
  expect(isAssessmentFieldApplicable(field, { cancer_type: "cancer_lung", current_cancer_treatment: ["chemotherapy"] })).toBe(true);
  const answers = { cancer_type: "cancer_lung", current_cancer_treatment: ["chemotherapy"], drug_classes: ["tki"] };
  expect(getScoringAssessmentAnswers(manifest, answers)).toEqual({ current_cancer_treatment: ["chemotherapy"] });
});

test("older pinned class catalogues gain Other in draft forms without changing scoring input", () => {
  const upgraded = upgradeDraftAssessmentForm(manifest);
  expect(upgraded.drugClassSuggestions).toEqual(manifest.drugClassSuggestions);
  const options = upgraded.sections[1]!.fields[1]!.options;
  expect(options?.at(-1)).toEqual({ id: OTHER_DRUG_CLASS_ID, label: "Other" });
  expect(upgradeDraftAssessmentForm(upgraded)).toBe(upgraded);
  const answers = { cancer_type: "cancer_lung", current_cancer_treatment: ["chemotherapy"], drug_classes: [OTHER_DRUG_CLASS_ID] };
  expect(validateAssessmentAnswers(upgraded, answers)).toEqual({});
  expect(getScoringAssessmentAnswers(upgraded, answers)).toEqual({ current_cancer_treatment: ["chemotherapy"] });
  expect(validateAssessmentAnswers(upgraded, { ...answers, drug_classes: ["platinum", OTHER_DRUG_CLASS_ID] }).drug_classes)
    .toBe("Other cannot be selected with named drug classes");
  expect(validateAssessmentAnswers(manifest, answers).drug_classes).toBe("Choose valid options");
});
