import { expect, test } from "bun:test";
import { bootstrapAdministrator } from "./bootstrap-admin";

const token = "b".repeat(32);
const input = JSON.stringify({ legalName: "NIQ Private Limited", displayName: "NIQ", slug: "niq", adminEmail: "admin@example.com",
  adminDisplayName: "NIQ Admin", adminPassword: "a very secure password", userLimit: null });

test("bootstrap CLI submits stdin credentials only to its guarded endpoint", async () => {
  let observed: Request | undefined;
  await bootstrapAdministrator(input, { BOOTSTRAP_TOKEN: token }, (async (url, options) => {
    observed = new Request(url as URL, options);
    return new Response(null, { status: 201 });
  }) as typeof fetch);
  expect(observed!.url).toBe("http://127.0.0.1:3000/v1/bootstrap");
  expect(observed!.headers.get("x-bootstrap-token")).toBe(token);
  expect(await observed!.json()).toMatchObject({ adminPassword: "a very secure password" });
  expect(observed!.redirect).toBe("error");
});

test("bootstrap CLI refuses insecure remote transport and missing tokens without sending", async () => {
  let calls = 0;
  const request = (async () => { calls++; return new Response(null, { status: 201 }); }) as unknown as typeof fetch;
  await expect(bootstrapAdministrator(input, {}, request)).rejects.toThrow("Set BOOTSTRAP_TOKEN");
  await expect(bootstrapAdministrator(input, { BOOTSTRAP_TOKEN: token, BOOTSTRAP_API_URL: "invalid private value" }, request)).rejects.toThrow("Set a valid bootstrap API URL.");
  for (const BOOTSTRAP_API_URL of ["http://example.com", "https://user:password@example.com", "file:///tmp/bootstrap"]) {
    await expect(bootstrapAdministrator(input, { BOOTSTRAP_TOKEN: token, BOOTSTRAP_API_URL }, request)).rejects.toThrow("loopback HTTP or HTTPS");
  }
  expect(calls).toBe(0);
});

test("bootstrap CLI reports closed bootstrap without exposing upstream response bodies", async () => {
  for (const [status, message] of [[403, "Bootstrap is disabled"], [409, "already been completed"], [500, "HTTP 500"]] as const) {
    const request = (async () => new Response("private credentials", { status })) as unknown as typeof fetch;
    await expect(bootstrapAdministrator(input, { BOOTSTRAP_TOKEN: token }, request)).rejects.toThrow(message);
  }
});
