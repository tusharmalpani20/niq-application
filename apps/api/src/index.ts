import { loadApplicationConfig } from "@niq/application-config";
import { createApp } from "./app";
import { createDatabase, isDatabaseSchemaReady } from "./db/client";
import { DevelopmentOtpDelivery, UnconfiguredOtpDelivery } from "./services/dev-otp";
import { PostgresApplicationService } from "./services/postgres-application";

const config = loadApplicationConfig(process.env);
const { db, sql } = createDatabase(config);
const otpDelivery = config.DEV_OTP_DELIVERY ? new DevelopmentOtpDelivery() : new UnconfiguredOtpDelivery();
const service = new PostgresApplicationService(db, config, otpDelivery);

const app = createApp({
  allowedOrigin: config.WEB_ORIGIN,
  authMode: config.AUTH_MODE,
  checkDatabase: () => isDatabaseSchemaReady(sql),
  service,
  sessionCookieName: config.SESSION_COOKIE_NAME,
  secureCookies: config.NODE_ENV === "production",
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
