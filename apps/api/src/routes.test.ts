import { describe, expect, test } from "bun:test";
import { createApp } from "./app";
import type { ApplicationService, Principal } from "./services/application";

const principal: Principal = {
  userId: "01J00000000000000000000001",
  organizationId: "01J00000000000000000000002",
  membershipId: "01J00000000000000000000003",
  email: "admin@example.com",
  displayName: "Admin",
  role: "ORGANIZATION_ADMIN",
  platformRole: "USER",
};

function fakeService(overrides: Partial<ApplicationService> = {}): ApplicationService {
  return {
    authenticate: async (token) => token === "valid-session" ? principal : null,
    signIn: async () => ({ kind: "authenticated", session: { token: "valid-session", expiresAt: new Date(Date.now() + 60_000), principal } }),
    verifyMfa: async () => ({ token: "valid-session", expiresAt: new Date(Date.now() + 60_000), principal }),
    signOut: async () => {}, acceptInvitation: async () => principal, bootstrap: async () => principal,
    createOrganization: async () => ({}), listOrganizations: async () => [], getOrganization: async () => ({}), updateOrganization: async () => ({}),
    createFacility: async () => ({}), listFacilities: async () => [], updateFacility: async () => ({}),
    inviteUser: async () => ({ invitation: {}, token: "invite-token" }), listUsers: async () => [], setUserActive: async () => ({}),
    ...overrides,
  };
}

describe("local authentication routes", () => {
  test("issues an HttpOnly SameSite cookie after successful sign-in", async () => {
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService() });
    const response = await app.request("/v1/auth/sign-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password: "a secure password" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("niq_session=valid-session");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
  });

  test("returns an opaque MFA challenge without exposing an OTP", async () => {
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService({ signIn: async () => ({ kind: "mfa_required", challengeToken: "x".repeat(43), expiresAt: new Date(Date.now() + 60_000) }) }) });
    const response = await app.request("/v1/auth/sign-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password: "a secure password" }) });
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.mfaRequired).toBe(true);
    expect(body.otp).toBeUndefined();
  });

  test("rejects protected routes without a valid server-side session", async () => {
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService() });
    const response = await app.request("/v1/organizations");
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  test("authorizes a tenant-scoped request from the session principal", async () => {
    let observedOrganization = "";
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService({ listFacilities: async (_actor, organizationId) => { observedOrganization = organizationId; return []; } }) });
    const response = await app.request(`/v1/organizations/${principal.organizationId}/facilities`, { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(200);
    expect(observedOrganization).toBe(principal.organizationId);
  });

  test("requires the independent bootstrap token", async () => {
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService(), bootstrapToken: "b".repeat(32) });
    const response = await app.request("/v1/bootstrap", { method: "POST", headers: { "content-type": "application/json", "x-bootstrap-token": "wrong" }, body: JSON.stringify({ legalName: "NIQ Private Limited", displayName: "NIQ", slug: "niq", adminEmail: "admin@example.com", adminDisplayName: "NIQ Admin", adminPassword: "a very secure password", userLimit: null }) });
    expect(response.status).toBe(403);
  });
});
