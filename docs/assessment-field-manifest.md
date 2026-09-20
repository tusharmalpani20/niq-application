# Final assessment overlay v1

Source: `../../../Document Recieved/Final NIQ Assessment Form_with section_field_details.xlsx`, Sheet1 A2:H157. Runtime cell references: `packages/contracts/src/assessment-form.ts`; exact 24 cancer options: `assessment-form-options.ts`.

Version: `niq-final-overlay-v1`. Scoring fields and options come exclusively from persisted public format-2 NIQ_FINAL_ASSESSMENT metadata. No scoring points, cutoffs or formulas are imported. Requiredness follows workbook column C: personal fields required, scoring entries optional. Explicit conditional detail requirements follow column H. Contact is required (Sheet1 B7/C7) and reads the patient profile as confirmed by the user. It is read-only in the assessment. Missing contact prompts an explicit patient-profile update before submission.

| Section | Source | Fields |
| --- | --- | --- |
| Personal | B2:H10 | Read-only patient name, age, gender and contact context; height; fresh current weight (supporting input); derived BMI |
| Disease | B11:H49 | Remote tumour_type, stage, relapse_status; cancer type F15:F38 and conditional Other text; metastasis F42:F46 at metastatic stage and conditional Other text |
| Treatment | B50:H88 | Remote treatment_status, cancer_surgical_status, current_cancer_treatment, current_medications, supplements_intake; palliative path/timing; conditional done/planned surgery date; cycle number/frequency |
| History | B89:H100 | Remote co_morbidities, previous_surgeries, family_history_cancer; positive safe-integer surgery count if Yes; relationship if family history Yes |
| Clinical & GUT | B101:H119 | Remote appetite_status, gastrointestinal_symptoms; bowel pattern F113:F116; stool frequency F117:F119 |
| Dietary | B120:H156 | Remote weight_loss, dietary_symptoms, functional_capacity, stress_level, protein_intake, fluid_intake; previous weight and dietary intake supporting inputs |
| Reports | A157 | Separate workflow, excluded from questionnaire progress |

Labs B82:F88 are deferred until units are confirmed: haemoglobin, SGPT, SGOT, total bilirubin, albumin, serum creatinine and C-reactive protein. No guessed units or progress penalty. Face scan is a separate deferred integration.

Inactive dependent values remain saved for reversible editing but are excluded from effective validation/progress/submission. Explicit `[]` is answered none; absent/null/empty text is unanswered. Calculated fields do not count twice. No unconfirmed exclusive-choice symptom rules are imposed.

Height uses assessment reference year minus birth year, eligible at 18+. Only earlier SCORED/COMPLETED valid measurements qualify. Repository callers must scope history to organization, patient and access before using the pure selector. Persist copied value and provenance once; never rerun default initialization on resume.
