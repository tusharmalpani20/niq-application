import { initializeMonitoring, captureOperationalFailure } from "./monitoring";
import { AssessmentFaceScanService } from "./services/assessment-face-scan";
import { loadApplicationConfig } from "@niq/application-config";
import { createApp } from "./app";
import { createDatabase, isDatabaseSchemaReady } from "./db/client";
import { DevelopmentOtpDelivery, UnconfiguredOtpDelivery } from "./services/dev-otp";
import { PostgresApplicationService } from "./services/postgres-application";
import { AssessmentWorkflowService } from "./services/assessment-workflow";
import { WebPushService } from "./services/web-push";
import { GeneratedReportService } from "./services/generated-report";

initializeMonitoring();
const config = loadApplicationConfig(process.env);
const { db, sql } = createDatabase(config);
const otpDelivery = (config.DEV_OTP_DELIVERY || config.DEV_FIXED_OTP) ? new DevelopmentOtpDelivery() : new UnconfiguredOtpDelivery();
const service = new PostgresApplicationService(db, config, otpDelivery);

const workflow = new AssessmentWorkflowService({ db, applicationService: service, config });
const webPush = new WebPushService(db, workflow, config);
let deliveringPush = false;
const pushWorker = setInterval(async () => {
  if (deliveringPush) return;
  deliveringPush = true;
  try { await webPush.deliverDue(); } catch (error) { captureOperationalFailure("push_delivery", error); console.warn("Push delivery temporarily unavailable"); }
  finally { deliveringPush = false; }
}, 10_000);
pushWorker.unref();
const faceScans = new AssessmentFaceScanService(workflow);
const automaticReports = new GeneratedReportService(workflow);
let reconciling = false;
const recovery = setInterval(async () => {
  if (reconciling) return;
  reconciling = true;
  try { await faceScans.recoverPending(); } catch (error) { captureOperationalFailure("face_scan_recovery", error); console.warn("Face scan reconciliation unavailable"); }
  finally { reconciling = false; }
}, config.FACE_SCAN_RECONCILE_INTERVAL_MS);
recovery.unref();
let preparingReports = false;
const reportWorker = setInterval(async () => {
  if (preparingReports) return;
  preparingReports = true;
  try { await automaticReports.processDue(); } catch (error) { captureOperationalFailure("report_worker", error); console.warn("Automatic report worker temporarily unavailable"); }
  finally { preparingReports = false; }
}, 5_000);
reportWorker.unref();

const app = createApp({
  allowedOrigin: config.WEB_ORIGIN,
  authMode: config.AUTH_MODE,
  runtimeEnvironment: config.NODE_ENV,
  reportDiagnosticsEnabled: config.REPORT_DIAGNOSTICS_ENABLED,
  checkDatabase: () => isDatabaseSchemaReady(sql),
  service,
  assessmentWorkflow: workflow,
  webPush,
  sessionCookieName: config.SESSION_COOKIE_NAME,
  secureCookies: config.SECURE_COOKIES || config.NODE_ENV === "production",
  bootstrapToken: config.BOOTSTRAP_TOKEN,
  exposeDevelopmentTokens: config.NODE_ENV !== "production",
});

console.log(JSON.stringify({
  level: "info",
  message: "NIQ application API started",
  host: config.API_HOST,
  port: config.API_PORT,
  region: config.APP_REGION,
  deploymentMode: config.DEPLOYMENT_MODE,
}));

export default {
  fetch: app.fetch,
  hostname: config.API_HOST,
  port: config.API_PORT,
};
