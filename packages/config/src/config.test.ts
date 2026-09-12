import { describe, expect, test } from "bun:test";
import { loadApplicationConfig } from "./index";

describe("configuration", () => {
  test("rejects a weak session secret", () => {
    expect(() => loadApplicationConfig({ DATABASE_URL: "postgres://localhost/niq", SESSION_SECRET: "short" })).toThrow();
  });

  test("defaults to India-first hosted deployment", () => {
    const config = loadApplicationConfig({
      DATABASE_URL: "postgres://localhost/niq",
      SESSION_SECRET: "a-development-secret-with-32-chars",
    });
    expect(config.APP_REGION).toBe("india");
    expect(config.DEPLOYMENT_MODE).toBe("niq-hosted");
  });
});
