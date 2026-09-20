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

## Questionnaire presentation and navigation

Visible overall and section percentages use `getAssessmentAnswerCoverage`: all applicable non-calculated fields, including optional answers and patient context. `getAssessmentCompletion` remains the separate required-answer readiness gate for submission. Optional answers therefore change visible questionnaire progress without changing workbook requiredness. Reports, deferred labs and face scanning do not affect questionnaire coverage.

Controls share theme tokens and React Aria primitives. Long lists are searchable; explicit custom entries map to existing Other IDs and companion text fields only for cancer type and metastatic site. Short single-choice lists use radio controls. Multiple answers use removable chips. The UI offers explicit None only for workbook medications (G66), supplements (G76), co-morbidities (G89), and GI symptoms (G104); tumour F11:F14 has no None option.

Cancer surgery Done/Planned requires its conditional date (H54). Previous surgeries Yes requires the count (H97); the workbook does not specify names/dates for each historic surgery.

Section switches retain in-memory questionnaire and report edits without a leave confirmation. Report metadata is persisted with Save report; questionnaire answers with Save draft/Save & continue. Actual route departures with unsaved edits use the shared discard dialog. Browser reload/close retains native unload protection. Face scan has a separate unavailable section until integration is delivered.

Question groups keep visible conditional details with their controlling question; separators occur between groups. This includes stage/metastasis, surgery/date, previous surgeries/count, and family history/relationship. Previous weight appears before the derived weight change; protein's explanation sits with dietary intake and makes clear that NIQ Scoring derives it on submission. Weight inputs use numeric controls and reject negative changes while server-side bounds remain authoritative. Explicit None uses a removable chip; removing a final positive selection leaves the question unanswered rather than silently selecting None. Custom Other entries show the approved option label in the selector and typed text only in the companion field.
