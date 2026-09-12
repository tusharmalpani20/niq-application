import { loadApplicationConfig } from "@niq/application-config";
import { createApp } from "./app";
import { createDatabase, isDatabaseSchemaReady } from "./db/client";

const config = loadApplicationConfig(process.env);
const { sql } = createDatabase(config);

const app = createApp({
  allowedOrigin: config.WEB_ORIGIN,
  authMode: config.AUTH_MODE,
  checkDatabase: () => isDatabaseSchemaReady(sql),
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
