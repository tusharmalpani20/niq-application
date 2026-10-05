/**
 * Extra local-only load data for facilities and the clinical review queue.
 * Run from this repository root: bun --env-file=.env scripts/seed-local-performance-extra.ts
 * Facilities can be resumed; assessment creation refuses a second run.
 */
import postgres from "../apps/api/node_modules/postgres/src/index.js";
import { createHash } from "node:crypto";
import { createEntityId } from "../packages/domain/src/index";
import { encryptPatientData, patientDataKey } from "../apps/api/src/security/patient-data";
import { keyedHash } from "../apps/api/src/security/tokens";
import { buildAssessmentForm } from "../packages/contracts/src/assessment-form";
import { getScoringAssessmentAnswers } from "../packages/contracts/src/assessment-form-validation";
import { projectScoreReviews } from "../packages/contracts/src/assessment-score-reviews";
import { assessmentScoringCalculationSchema } from "../apps/api/src/services/assessment-scoring";
import { publicQuestionnaire } from "../../niq-scoring/packages/contracts/src/rule-public";
import { evaluateVersionedRule, classifyScore } from "../../niq-scoring/packages/scoring-engine/src/versioned-evaluator";
import { calculateFaceScanScore } from "../../niq-scoring/packages/scoring-engine/src/face-scan-scoring";
import { encryptActivationToken } from "../../niq-scoring/apps/api/src/lib/activation-secret";

const marker = "PERF-20261005-EXTRA";
const sourceMarker = "PERF-20261005";
const organizationId = "01M2G2AS24X6K5HGEJ3CB24JV3";
const membershipId = "01M35B88Y4QWRZ1PZPJFY62R7J";
const deploymentId = "01M2FHDK75DEXERYFMQMB66CCR";
const clientId = "01M2FDAT532K4JDA6W3G7PCWWF";
const ruleVersionId = "01M3DSJSJN9VQKREMTYAPCN85G";
const totalPatients = 500;
const totalAssessments = 500;
const completedAssessments = 500;
const totalFacilities = 1000;

function localDatabase(url: string | undefined, expected: string) {
  if (!url) throw new Error(`Missing ${expected} database URL`);
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || decodeURIComponent(parsed.pathname.slice(1)) !== expected)
    throw new Error(`This seed only runs against local ${expected}`);
  return url;
}
if (process.env.NODE_ENV && process.env.NODE_ENV !== "development") throw new Error("Development mode required");
const scoringEnv = await Bun.file(new URL("../../niq-scoring/.env", import.meta.url)).text();
const scoringValue = (name: string) => scoringEnv.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.replace(/^['"]|['"]$/g, "");
const app = postgres(localDatabase(process.env.DATABASE_URL, "niq_application"), { max: 4 });
const scoring = postgres(localDatabase(scoringValue("DATABASE_URL"), "niq_scoring"), { max: 4 });
const key = patientDataKey(process.env.PATIENT_DATA_ENCRYPTION_KEY, process.env.SESSION_SECRET!);
const seal = (value: unknown) => ({ encrypted: encryptPatientData(JSON.stringify(value), key).toString("base64") });
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const json = (db: typeof app, value: unknown) => db.json(value as any);
const pick = <T>(items: T[], n: number) => items[n % items.length]!;
const male = ["Aarav", "Arjun", "Aditya", "Rohan", "Kiran", "Vikram", "Rahul", "Sanjay", "Nikhil", "Pranav", "Harish", "Suresh", "Dev", "Manish", "Akash", "Rajesh", "Sameer", "Varun", "Anand", "Ravi"];
const female = ["Ananya", "Priya", "Meera", "Kavya", "Neha", "Asha", "Divya", "Pooja", "Lakshmi", "Sneha", "Nandini", "Ritika", "Shreya", "Swati", "Isha", "Rekha", "Deepa", "Aditi", "Tara", "Sana"];
const surnames = ["Sharma", "Rao", "Iyer", "Patel", "Reddy", "Nair", "Gupta", "Menon", "Kulkarni", "Das", "Singh", "Mehta", "Joshi", "Pillai", "Verma", "Kumar", "Shah", "Mishra", "Bose", "Saxena", "Naidu", "Chatterjee", "Kapoor", "Sethi", "Bhat", "Fernandes"];
const at = (i: number) => new Date(Date.now() - ((i * 37) % 360) * 86400000 - ((i * 97) % 86400) * 1000);
const id = () => createEntityId();
const cities = ["Pune", "Mumbai", "Delhi", "Jaipur", "Ahmedabad", "Surat", "Kolkata", "Bhubaneswar", "Kochi", "Coimbatore", "Mysuru", "Visakhapatnam", "Indore", "Lucknow", "Nagpur", "Chandigarh", "Thiruvananthapuram", "Vijayawada", "Patna", "Guwahati"];
const facilityTypes = ["Oncology Centre", "Cancer Care Centre", "Nutrition Clinic", "Clinical Care Centre", "Medical Centre"];

async function insert(db: typeof app, table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  // postgres.js expands row objects into a multi-value INSERT with safe parameters.
  await db`insert into ${db(table)} ${db(rows)}`;
}

try {
  const [org] = await app`select id, patient_reference_prefix from organizations where id=${organizationId} and display_name='Demo'`;
  const [member] = await app`select id from organization_memberships where id=${membershipId} and organization_id=${organizationId}`;
  const [connection] = await app`select id from scoring_connections where organization_id=${organizationId} and deployment_id=${deploymentId} and scoring_organization_id=${clientId}`;
  const [deployment] = await scoring`select id from deployments where id=${deploymentId} and client_id=${clientId}`;
  const [rule] = await scoring`select id,version,package_checksum,definition from scoring_rule_versions where id=${ruleVersionId}`;
  const [questionnaire] = await app`select id from questionnaire_definitions where organization_id=${organizationId} and key=${ruleVersionId} and version=${rule?.package_checksum} and is_published=true`;
  if (!org || !member || !connection || !deployment || !rule || !questionnaire) throw new Error("Demo organization or active Scoring configuration is missing");
  const [existingAssessments] = await app`select count(*)::int as count from assessment_initializations where request_key like ${`${marker}-INIT-%`}`;
  if (existingAssessments.count) throw new Error(`${marker} assessments already exist; refusing to duplicate them`);
  const existingFacilities = await app`select code from facilities where organization_id=${organizationId} and code like 'PF26%'`;
  const existingCodes = new Set(existingFacilities.map(row => row.code));
  const newFacilities = Array.from({ length: totalFacilities }, (_, i) => {
    const number = i + 1;
    const code = `PF26${String(number).padStart(4, "0")}`;
    const city = pick(cities, i * 37 + Math.floor(i / 11));
    const kind = pick(facilityTypes, i * 19 + Math.floor(i / 7));
    return { id: id(), organization_id: organizationId, code, name: `Test · ${city} ${kind} ${String(number).padStart(4, "0")}`, timezone: "Asia/Kolkata", status: "ACTIVE" };
  }).filter(row => !existingCodes.has(row.code));
  for (let start = 0; start < newFacilities.length; start += 100) await insert(app, "facilities", newFacilities.slice(start, start + 100));
  const [{ count: facilityCount }] = await app`select count(*)::int as count from facilities where organization_id=${organizationId} and code like 'PF26%'`;
  if (facilityCount !== totalFacilities) throw new Error(`Expected ${totalFacilities} marked facilities, found ${facilityCount}`);
  console.log(`Ready: ${facilityCount} marked synthetic facilities`);
  const definition = rule.definition;
  const publicForm = publicQuestionnaire(definition);
  const manifest = buildAssessmentForm(publicForm);
  const connectionIdentity = { origin: "http://localhost:4100", deploymentId, scoringOrganizationId: clientId };
  const people: Array<{ id: string; name: string; dob: string; gender: string; facility: {id:string;name:string}; reference: string; height: number; weight: number }> = [];
  const sourceHashes: string[] = [];
  for (let i = 0; i < totalPatients; i++) {
    const gender = i % 2 ? "FEMALE" : "MALE";
    const name = `${pick(gender === "MALE" ? male : female, i * 7 + Math.floor(i / 20))} ${pick(surnames, i * 11 + Math.floor(i / 20))}`;
    const dob = `${1950 + (i * 13) % 51}-${String(1 + (i * 7) % 12).padStart(2,"0")}-${String(1 + (i * 11) % 28).padStart(2,"0")}`;
    const reference = `${sourceMarker}-${String(i + 1).padStart(6,"0")}`;
    people.push({ id: "", name, dob, gender, facility: { id: "", name: "" }, reference, height: 152 + (i * 17) % 35, weight: 48 + (i * 19) % 43 });
    sourceHashes.push(await keyedHash(reference, key.toString("base64")));
  }
  const patientsByHash = new Map((await app`select p.id,p.external_reference_lookup_hash,p.serial_number,p.reference_prefix,p.home_facility_id,f.name as facility_name from patients p join facilities f on f.id=p.home_facility_id and f.organization_id=p.organization_id where p.organization_id=${organizationId} and p.external_reference_lookup_hash in ${app(sourceHashes)}`).map(row => [row.external_reference_lookup_hash, row]));
  if (patientsByHash.size !== totalPatients) throw new Error("Original synthetic patients are missing");
  const serialById = new Map();
  for (let i=0;i<people.length;i++) { const stored=patientsByHash.get(sourceHashes[i]); people[i]!.id=stored.id; people[i]!.facility={id:stored.home_facility_id,name:stored.facility_name}; serialById.set(stored.id,stored); }

  const assessmentRows: Record<string, unknown>[] = [];
  const initRows: Record<string, unknown>[] = [];
  const appScanRows: Record<string, unknown>[] = [];
  const consentRows: Record<string, unknown>[] = [];
  const submissionRows: Record<string, unknown>[] = [];
  const requestRows: Record<string, unknown>[] = [];
  const resultRows: Record<string, unknown>[] = [];
  const bindingRows: Record<string, unknown>[] = [];
  const usageRows: Record<string, unknown>[] = [];
  const sessionRows: Record<string, unknown>[] = [];
  const workflowRows: Record<string, unknown>[] = [];
  const historyRows: Record<string, unknown>[] = [];
  const scanConfiguration = definition.faceScanScoring;
  const riskCategories = definition.riskCategories.map(({ id, label, color, min, max, minInclusive, maxInclusive }: any) => ({ id, label, color, min, max, minInclusive, maxInclusive }));
  for (let i = 0; i < totalAssessments; i++) {
    const p = people[i % totalPatients]!;
    const assessmentId = id(), bindingId = id(), scanId = id(), remoteScanId = id(), scanUsageId = id();
    const consentId = id(), submissionId = id(), scoringUsageId = id(), resultId = id();
    const completed = i < completedAssessments;
    const when = at(i);
    const timestamp = when.toISOString();
    const finished = new Date(when.getTime() + 3600000).toISOString();
    const phone = String(i % totalPatients + 1).padStart(10,"0");
    const patient = { id: p.id, reference: `${org.patient_reference_prefix}-${String(serialById.get(p.id).serial_number).padStart(6,"0")}`,
      displayName: p.name, dateOfBirth: p.dob, gender: p.gender, phone, homeFacility: p.facility };
    const age = when.getUTCFullYear() - Number(p.dob.slice(0,4));
    const answers: Record<string, string | string[] | number | null> = { patient_name: p.name, age, gender: p.gender, contact: phone,
      height_cm: p.height, current_weight_kg: p.weight };
    if (completed) {
      for (const section of publicForm.sections) for (const field of section.fields) {
        if (field.type === "calculated" || field.type === "derived") continue;
        const options = field.options ?? [];
        if (!options.length) continue;
        if (field.id === "treatment_status") { answers[field.id] = "treatment_status_under_treatment"; continue; }
        if (field.id === "cancer_surgical_status") { answers[field.id] = "cancer_surgical_status_not_required"; continue; }
        if (field.id === "previous_surgeries") { answers[field.id] = "previous_surgeries_no"; continue; }
        if (field.id === "family_history_cancer") { answers[field.id] = "family_history_cancer_no"; continue; }
        const selected = options[(i * 17 + field.id.length) % options.length]!.id;
        answers[field.id] = field.type === "multi_select" ? [selected] : selected;
      }
      answers.cancer_type = pick(["cancer_1", "cancer_2", "cancer_3", "cancer_7", "cancer_10"], i);
      if (answers.stage === "stage_metastatic") answers.metastasis_site = "bone";
      answers.bowel_pattern = "normal";
      answers.stool_frequency = "daily";
      answers.previous_weight_kg = p.weight + (i % 5);
      answers.dietary_intake = publicForm.supportingInputs.find((x:any)=>x.id==="dietary_intake")?.options?.[i % (publicForm.supportingInputs.find((x:any)=>x.id==="dietary_intake")?.options?.length ?? 1)]?.id ?? null;
    }
    const binding = { assessmentReference: assessmentId, bindingId, ruleVersionId, checksum: rule.package_checksum, version: rule.version, questionnaire: publicForm };
    const context = { dob: p.dob, gender: p.gender.toLowerCase(), heightCm: p.height, weightKg: p.weight, posture: "resting", employeeId: `${marker}-operator` };
    const wellnessScore = 55 + (i * 23) % 41;
    const faceResult = { schemaVersion: 1, providerScanId: `${marker}-SCAN-${i + 1}`, providerCompletedAt: finished,
      wellnessScore, healthRiskScore: 100-wellnessScore,
      vitals: { heartRate: 62+(i*7)%35, oxygenSaturation: 95+i%5, respiratoryRate: 14+i%9, systolic: 108+i%31, diastolic: 68+i%21 },
      additionalMetrics: { synthetic: "true" }, physiologicalScore: null, mentalWellbeingScore: null };
    const scanScore = calculateFaceScanScore({ wellnessScore }, scanConfiguration, ruleVersionId);
    const publicScanScore = { status: scanScore.status, points: scanScore.points, ruleVersionId, wellnessScore, scoringVersion: scanScore.scoringVersion };
    const scanProjection = { id: remoteScanId, state: "COMPLETED", context, createdAt: timestamp, updatedAt: finished, completedAt: finished,
      failureCode: null, result: faceResult, score: publicScanScore };
    const workflow = { binding, connection: connectionIdentity, manifest, patient, answers,
      heightReferenceYear: when.getUTCFullYear(), heightSource: null, cycle: 0, faceScanSessionId: remoteScanId };
    const selected = getScoringAssessmentAnswers(manifest, answers);
    const evaluated: any = evaluateVersionedRule(definition, selected);
    if (completed && (!evaluated.complete || evaluated.issues.length)) throw new Error(`Invalid synthetic answers at ${i}: ${JSON.stringify(evaluated.issues)}`);
    const score = completed ? (evaluated.score ?? 0) + scanScore.points! : null;
    const { questionnaire: _questionnaire, ...evidence } = binding;
    const calculated = completed ? { ...evidence, formatVersion: 2, profile: "NIQ_FINAL_ASSESSMENT", complete: true, score,
      classification: classifyScore(definition, score!), questionnaireScore: evaluated.score,
      faceScan: { sessionId: remoteScanId, points: scanScore.points }, riskCategories,
      components: evaluated.components, answerCoverage: evaluated.answerCoverage, derived: evaluated.derived,
      riskStatus: evaluated.riskStatus, clinicalUsePermitted: evaluated.clinicalUsePermitted, interventions: evaluated.interventions,
      issues: [], calculatedAt: finished, resultReference: scoringUsageId } : null;
    if (completed) assessmentScoringCalculationSchema.parse({ result: calculated, idempotencyKey: `${marker}-SCORE-${i + 1}` });
    const reviewScore = completed ? { ...projectScoreReviews(calculated as any, [], { id: scanId, points: scanScore.points }),
      risk: { status: "ORIGINAL", classification: calculated!.classification, resultReference: scoringUsageId, failureCode: null, canRetry: false } } : null;
    const actor = { membershipId, displayName: "Example Doc", role: "DOCTOR" };
    const clinicalReview = { revision: 1, assignee: null, correctionPerson: null, previousReviewer: null,
      submittedAt: finished, completedAt: null, returnReason: null, finalRemark: null,
      history: [{ id: id(), action: "SEND", revision: 1, cycle: 0, actor, assignee: null, createdAt: finished }] };
    assessmentRows.push({ id: assessmentId, organization_id: organizationId, patient_id: p.id, facility_id: p.facility.id,
      questionnaire_definition_id: questionnaire.id, questionnaire_scope_key: organizationId, status: "UNDER_REVIEW",
      assigned_to_membership_id: null, created_by_membership_id: membershipId, current_owner_membership_id: null,
      revision: 2, workflow: json(app, seal(workflow)), clinical_review: json(app, seal(clinicalReview)),
      current_submission_id: null, cycle: 0, scored_at: finished, completed_at: null,
      created_at: timestamp, updated_at: finished });
    historyRows.push({ id: id(), organization_id: organizationId, assessment_id: assessmentId,
      actor_id: membershipId, cycle: 0, revision: 2, kind: "SEND", request_key: `${marker}-SEND-${i + 1}`,
      payload: json(app, seal({ actor, synthetic: true, submissionId })), created_at: finished });
    initRows.push({ id: assessmentId, organization_id: organizationId, patient_id: p.id, facility_id: p.facility.id,
      creator_id: membershipId, request_key: `${marker}-INIT-${i + 1}`, status: "READY", assessment_id: assessmentId,
      connection: json(app, connectionIdentity), created_at: timestamp, updated_at: finished });
    consentRows.push({ id: consentId, organization_id: organizationId, assessment_id: assessmentId, patient_id: p.id,
      actor_id: membershipId, cycle: 0, method: "LINK", provenance: "SIMULATED", status: "APPROVED", is_current: true,
      requested_at: timestamp, responded_at: timestamp, created_at: timestamp, updated_at: timestamp });
    appScanRows.push({ id: scanId, organization_id: organizationId, assessment_id: assessmentId, revision: 0,
      request_key: `${marker}-SCAN-${i + 1}`, connection: json(app, connectionIdentity), remote_request_key: `${marker}-SCAN-${i + 1}`,
      snapshot: json(app, seal({ context, synthetic: true })), remote_id: remoteScanId, state: "COMPLETED", consent_id: consentId,
      is_current: true, cycle: 0, active: false, projection: json(app, seal(scanProjection)), created_at: timestamp, updated_at: finished });
    bindingRows.push({ id: bindingId, deployment_id: deploymentId, client_id: clientId, assessment_reference: assessmentId,
      scoring_rule_version_id: ruleVersionId, package_checksum: rule.package_checksum, created_at: timestamp });
    sessionRows.push({ id: remoteScanId, client_id: clientId, deployment_id: deploymentId, assessment_reference: assessmentId,
      provider: "synthetic-performance", provider_session_reference: `${marker}-SCAN-${i + 1}`,
      state: "COMPLETED", idempotency_key: `${marker}-SCAN-${i + 1}`, completed_at: finished,
      created_at: timestamp, updated_at: finished });
    usageRows.push({ id: scanUsageId, client_id: clientId, deployment_id: deploymentId, capability: "FACE_SCAN",
      scoring_rule_version_id: ruleVersionId, request_id: `${marker}-SCAN-${i + 1}`, idempotency_key: `${marker}-SCAN-${i + 1}`,
      assessment_reference: assessmentId, outcome: "SUCCEEDED", billable: false,
      response_payload: json(scoring, { synthetic: true, sessionId: remoteScanId }), completed_at: finished, occurred_at: timestamp });
    workflowRows.push({ session_id: remoteScanId, usage_id: scanUsageId, deployment_id: deploymentId,
      organization_reference: organizationId, assessment_reference: assessmentId, request_fingerprint: sha(`${marker}-SCAN-${i + 1}`),
      context_ciphertext: encryptActivationToken(JSON.stringify(context), scoringValue("FACE_SCAN_ENCRYPTION_KEY")!),
      state: "COMPLETED", provider_account: "synthetic-performance", provider_scan_id: faceResult.providerScanId,
      mapping: json(scoring, { ruleVersionId, checksum: rule.package_checksum, assignmentId: null, configuration: scanConfiguration }),
      result: json(scoring, faceResult), score: json(scoring, scanScore), capture_expires_at: finished, completed_at: finished,
      created_at: timestamp, updated_at: finished });
    if (completed) {
      submissionRows.push({ id: submissionId, organization_id: organizationId, assessment_id: assessmentId, revision: 1,
        snapshot: json(app, seal({ ...workflow, reports: [] })), idempotency_key: `${marker}-SCORE-${i + 1}`, status: "SUCCEEDED",
        result: json(app, seal(calculated)), attempt_count: 1, created_at: finished, updated_at: finished });
      requestRows.push({ id: submissionId, organization_id: organizationId, assessment_id: assessmentId,
        idempotency_key: `${marker}-SCORE-${i + 1}`, external_request_id: scoringUsageId, status: "SUCCEEDED",
        requested_version: rule.version, requested_at: finished, completed_at: finished, created_at: finished, updated_at: finished });
      resultRows.push({ id: resultId, organization_id: organizationId, assessment_id: assessmentId, scoring_request_id: submissionId,
        scoring_version: rule.version, rule_checksum: rule.package_checksum, result: json(app, seal(calculated)),
        calculated_at: finished, received_at: finished, created_at: finished, updated_at: finished });
      usageRows.push({ id: scoringUsageId, client_id: clientId, deployment_id: deploymentId, capability: "SCORING",
        scoring_rule_version_id: ruleVersionId, request_id: `${marker}-SCORE-${i + 1}`, idempotency_key: `${marker}-SCORE-${i + 1}`,
        assessment_reference: assessmentId, outcome: "SUCCEEDED", billable: false,
        response_payload: json(scoring, { result: calculated, idempotencyKey: `${marker}-SCORE-${i + 1}`, synthetic: true }),
        completed_at: finished, occurred_at: timestamp });
    }
  }
  console.log(`Prepared ${assessmentRows.length} assessments, ${completedAssessments} scored results, and ${appScanRows.length} synthetic scans`);
  for (let start = 0; start < totalAssessments; start += 50) {
    const end = start + 50;
    await scoring.begin(async tx => {
      await insert(tx as typeof scoring, "assessment_bindings", bindingRows.slice(start,end));
      await insert(tx as typeof scoring, "usage_events", usageRows.filter((_,j) => j >= start*2 && j < end*2));
      await insert(tx as typeof scoring, "face_scan_sessions", sessionRows.slice(start,end));
      await insert(tx as typeof scoring, "face_scan_workflows", workflowRows.slice(start,end));
    });
    await app.begin(async tx => {
      await insert(tx as typeof app, "assessments", assessmentRows.slice(start,end));
      await insert(tx as typeof app, "assessment_initializations", initRows.slice(start,end));
      await insert(tx as typeof app, "assessment_history", historyRows.slice(start,end));
      await insert(tx as typeof app, "face_scan_consents", consentRows.slice(start,end));
      await insert(tx as typeof app, "assessment_face_scans", appScanRows.slice(start,end));
      const eligible = (rows: Record<string,unknown>[]) => rows.filter(row => {
        const index = assessmentRows.findIndex(a => a.id === row.assessment_id);
        return index >= start && index < end;
      });
      await insert(tx as typeof app, "assessment_submissions", eligible(submissionRows));
      await insert(tx as typeof app, "scoring_requests", eligible(requestRows));
      await insert(tx as typeof app, "scoring_results", eligible(resultRows));
      await tx`update assessments a set current_submission_id=s.id from assessment_submissions s where a.id=s.assessment_id and a.organization_id=${organizationId} and a.id in ${tx(assessmentRows.slice(start,end).map(r=>r.id as string))}`;
    });
    if (end % 500 === 0) console.log(`Seeded ${Math.min(end,totalAssessments)}/${totalAssessments} assessments`);
  }
  console.log(`Finished ${marker}`);
} finally {
  await app.end();
  await scoring.end();
}
