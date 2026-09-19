import { describe, expect, test } from "bun:test";
import { createApp } from "./app";
import { ServiceError, type ApplicationService, type Principal } from "./services/application";

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
    resendMfa: async () => ({ challengeToken: "y".repeat(43), expiresAt: new Date(Date.now() + 60_000), resendAvailableAt: new Date(Date.now() + 30_000), attemptsRemaining: 5, resendsRemaining: 2 }),
    signOut: async () => {}, acceptInvitation: async () => principal, bootstrap: async () => principal,
    listPlatformAdministrators: async () => [], invitePlatformAdministrator: async () => ({ invitation: {}, token: "invite-token" }), setPlatformAdministratorActive: async () => ({}),
    revokePlatformAdministratorInvitation: async () => {}, regeneratePlatformAdministratorInvitation: async () => ({ invitation: {}, token: "new-token" }),
    createOrganization: async () => ({}), listOrganizations: async () => [], getOrganization: async () => ({}), getOrganizationBySlug: async () => ({}), getOrganizationLogo: async () => ({ data: new Uint8Array([1, 2, 3]), mimeType: "image/png", etag: "abc" }), updateOrganization: async () => ({}),
    onboardOrganization: async () => ({ organization: {}, invitation: {}, token: "invite-token" }),
    activateScoring: async () => ({ connection: {} }),
    disconnectScoring: async () => {},
    getScoringOrganizationInfo: async () => ({}),
    createFacility: async () => ({}), listFacilities: async () => [], updateFacility: async () => ({}),
    createPatient: async () => ({}), listPatients: async () => [], getPatient: async () => ({}), listAssessments: async () => [],
    invitationAccess: async () => ({ allFacilities: true }), manageUserInvitation: async () => ({ invitation: {}, token: "replacement-token" }),
    inviteUser: async () => ({ invitation: {}, token: "invite-token" }), listUsers: async () => [], setUserActive: async () => ({}),
    ...overrides,
  };
}

describe("local authentication routes", () => {
  test("passes logo replacement through authenticated organization updates and rejects SVG", async () => {
    const logo = { mimeType: "image/png" as const, contentBase64: "iVBORw0KGgo=" };
    let updates = 0;
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService({
      updateOrganization: async (actor, organizationId, input) => {
        expect(actor.organizationId).toBe(principal.organizationId);
        expect(organizationId).toBe(principal.organizationId);
        expect(input.logo).toEqual(logo);
        updates++;
        return {};
      },
    }) });
    const request = (mimeType: string, cookie = "niq_session=valid-session") => app.request("/v1/organizations/" + principal.organizationId, {
      method: "PATCH", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ logo: { ...logo, mimeType } }),
    });
    expect((await request("image/png")).status).toBe(200);
    expect((await request("image/svg+xml")).status).toBe(400);
    expect((await request("image/png", "")).status).toBe(401);
    expect(updates).toBe(1);
  });
  test("issues an HttpOnly SameSite cookie after successful sign-in", async () => {
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService() });
    const response = await app.request("/v1/auth/sign-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password: "a secure password" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("niq_session=valid-session");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
  });

  test("returns an opaque MFA challenge without exposing an OTP", async () => {
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService({ signIn: async () => ({ kind: "mfa_required", challengeToken: "x".repeat(43), expiresAt: new Date(Date.now() + 60_000), resendAvailableAt: new Date(Date.now() + 30_000), attemptsRemaining: 5, resendsRemaining: 3 }) }) });
    const response = await app.request("/v1/auth/sign-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password: "a secure password" }) });
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.mfaRequired).toBe(true);
    expect(body.otp).toBeUndefined();
    expect(body.attemptsRemaining).toBe(5);
  });

  test("replaces an MFA challenge through the resend boundary", async () => {
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService() });
    const response = await app.request("/v1/auth/mfa/resend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeToken: "x".repeat(43) }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.challengeToken).toBe("y".repeat(43));
    expect(body.resendsRemaining).toBe(2);
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

  test("creates facilities through the tenant boundary", async () => {
    let observedOrganization = "";
    let observedCode = "";
    const facility = { id: "01J00000000000000000000004", name: "Chennai Central", code: "CHE" };
    const app = createApp({
      allowedOrigin: "http://localhost:5173",
      authMode: "local",
      checkDatabase: async () => true,
      service: fakeService({
        createFacility: async (_actor, organizationId, input) => {
          observedOrganization = organizationId;
          observedCode = input.code;
          return facility;
        },
      }),
    });
    const response = await app.request(`/v1/organizations/${principal.organizationId}/facilities`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "niq_session=valid-session" },
      body: JSON.stringify({ name: "Chennai Central", code: "CHE", timezone: "Asia/Kolkata" }),
    });
    expect(response.status).toBe(201);
    expect(observedOrganization).toBe(principal.organizationId);
    expect(observedCode).toBe("CHE");
    expect(await response.json()).toEqual(facility);
  });

  test("creates and lists patients through the tenant boundary", async () => {
    let observedOrganization = "";
    let observedMedicalRecordNumber = "";
    const patient = { id: "01J00000000000000000000009", reference: "PAT-1" };
    const app = createApp({
      allowedOrigin: "http://localhost:5173",
      authMode: "local",
      checkDatabase: async () => true,
      service: fakeService({
        createPatient: async (_actor, organizationId, input) => {
          observedOrganization = organizationId;
          observedMedicalRecordNumber = input.medicalRecordNumber;
          return patient;
        },
        listPatients: async () => [patient],
      }),
    });
    const response = await app.request(`/v1/organizations/${principal.organizationId}/patients`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "niq_session=valid-session" },
      body: JSON.stringify({
        medicalRecordNumber: "MRN-1001",
        homeFacilityId: "01J00000000000000000000004",
        dateOfBirth: "1980-01-02",
        gender: "FEMALE",
        name: "Test Patient",
      }),
    });
    expect(response.status).toBe(201);
    expect(observedOrganization).toBe(principal.organizationId);
    expect(observedMedicalRecordNumber).toBe("MRN-1001");

    const listResponse = await app.request(`/v1/organizations/${principal.organizationId}/patients`, { headers: { cookie: "niq_session=valid-session" } });
    expect(listResponse.status).toBe(200);
    expect((await listResponse.json()).items).toEqual([patient]);
  });

  test("resolves a patient reference through the tenant boundary", async () => {
    let observedOrganization = "";
    let observedReference = "";
    const patient = { id: "01J00000000000000000000009", reference: "PAT-1" };
    const app = createApp({
      allowedOrigin: "http://localhost:5173",
      authMode: "local",
      checkDatabase: async () => true,
      service: fakeService({
        getPatient: async (_actor, organizationId, patientReference) => {
          observedOrganization = organizationId;
          observedReference = patientReference;
          return patient;
        },
      }),
    });

    const response = await app.request(`/v1/organizations/${principal.organizationId}/patients/pat-1`, { headers: { cookie: "niq_session=valid-session" } });

    expect(response.status).toBe(200);
    expect(observedOrganization).toBe(principal.organizationId);
    expect(observedReference).toBe("PAT-1");
    expect(await response.json()).toEqual(patient);
  });

  test("rejects malformed patient references", async () => {
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService() });
    const response = await app.request(`/v1/organizations/${principal.organizationId}/patients/PAT-0`, { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(400);
  });

  test("continues to resolve legacy patient ID links", async () => {
    let observedLocator = "";
    const app = createApp({
      allowedOrigin: "http://localhost:5173",
      authMode: "local",
      checkDatabase: async () => true,
      service: fakeService({ getPatient: async (_actor, _organizationId, patientLocator) => { observedLocator = patientLocator; return {}; } }),
    });
    const response = await app.request(`/v1/organizations/${principal.organizationId}/patients/01J00000000000000000000009`, { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(200);
    expect(observedLocator).toBe("01J00000000000000000000009");
  });

  test("lists assessments through the tenant boundary", async () => {
    let observedOrganization = "";
    const assessment = { id: "01J00000000000000000000010", status: "DRAFT" };
    const app = createApp({
      allowedOrigin: "http://localhost:5173",
      authMode: "local",
      checkDatabase: async () => true,
      service: fakeService({ listAssessments: async (_actor, organizationId) => { observedOrganization = organizationId; return [assessment]; } }),
    });
    const response = await app.request(`/v1/organizations/${principal.organizationId}/assessments`, { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(200);
    expect(observedOrganization).toBe(principal.organizationId);
    expect((await response.json()).items).toEqual([assessment]);
  });

  test("resolves an organization detail by its URL name", async () => {
    let observedSlug = "";
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService({ getOrganizationBySlug: async (_actor, slug) => { observedSlug = slug; return { slug }; } }) });
    const response = await app.request("/v1/organizations/by-slug/example-health", { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(200);
    expect(observedSlug).toBe("example-health");
  });

  test("requires the independent bootstrap token", async () => {
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService(), bootstrapToken: "b".repeat(32) });
    const response = await app.request("/v1/bootstrap", { method: "POST", headers: { "content-type": "application/json", "x-bootstrap-token": "wrong" }, body: JSON.stringify({ legalName: "NIQ Private Limited", displayName: "NIQ", slug: "niq", adminEmail: "admin@example.com", adminDisplayName: "NIQ Admin", adminPassword: "a very secure password", userLimit: null }) });
    expect(response.status).toBe(403);
  });

  test("lists and invites NIQ administrators through the platform boundary", async () => {
    const niqAdmin = { ...principal, platformRole: "NIQ_ADMIN" as const };
    let invitedEmail = "";
    const app = createApp({
      allowedOrigin: "http://localhost:5173",
      authMode: "local",
      checkDatabase: async () => true,
      exposeDevelopmentTokens: true,
      service: fakeService({
        authenticate: async () => niqAdmin,
        listPlatformAdministrators: async () => [{ kind: "USER", email: niqAdmin.email }],
        invitePlatformAdministrator: async (_actor, input) => {
          invitedEmail = input.email;
          return { invitation: { invitationId: "01J00000000000000000000009", email: input.email, expiresAt: new Date() }, token: "platform-invite-token" };
        },
      }),
    });
    const listResponse = await app.request("/v1/platform/administrators", { headers: { cookie: "niq_session=valid-session" } });
    expect(listResponse.status).toBe(200);
    expect((await listResponse.json()).items).toHaveLength(1);
    const inviteResponse = await app.request("/v1/platform/administrators/invitations", {
      method: "POST",
      headers: { cookie: "niq_session=valid-session", "content-type": "application/json" },
      body: JSON.stringify({ email: "second.admin@niq.test" }),
    });
    expect(inviteResponse.status).toBe(201);
    expect(invitedEmail).toBe("second.admin@niq.test");
    expect((await inviteResponse.json()).activationToken).toBe("platform-invite-token");
  });

  test("regenerates and revokes invitations through authenticated validated routes", async () => {
    const id = "01J00000000000000000000009";
    for (const exposeDevelopmentTokens of [false, true]) {
      let regenerated = 0;
      let revoked = 0;
      const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, exposeDevelopmentTokens, service: fakeService({
        regeneratePlatformAdministratorInvitation: async (actor, invitationId) => {
          expect(actor.userId).toBe(principal.userId);
          expect(invitationId).toBe(id);
          regenerated++;
          return { invitation: { invitationId }, token: "rotated-secret" };
        },
        revokePlatformAdministratorInvitation: async (_actor, invitationId) => { expect(invitationId).toBe(id); revoked++; },
      }) });
      const request = (action: string, invitationId = id, cookie = "niq_session=valid-session") => app.request(`/v1/platform/administrators/invitations/${invitationId}/${action}`, { method: "POST", headers: { cookie } });
      const response = await request("regenerate");
      expect(response.status).toBe(200);
      expect((await response.json()).activationToken).toBe(exposeDevelopmentTokens ? "rotated-secret" : undefined);
      expect((await request("revoke")).status).toBe(204);
      expect((await request("regenerate", "bad-id")).status).toBe(400);
      expect((await request("revoke", id, "")).status).toBe(401);
      expect(regenerated).toBe(1);
      expect(revoked).toBe(1);
    }
  });

  test("tenant invitation actions validate IDs and keep replacement tokens development-only", async () => {
    const id = "01J00000000000000000000009";
    for (const exposeDevelopmentTokens of [false, true]) {
      let calls = 0;
      const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, exposeDevelopmentTokens, service: fakeService({
        manageUserInvitation: async (actor, organizationId, invitationId, action) => {
          expect(actor.userId).toBe(principal.userId);
          expect(organizationId).toBe(principal.organizationId);
          expect(invitationId).toBe(id);
          calls++;
          return { invitation: { id }, ...(action === "regenerate" ? { token: "new-tenant-secret" } : {}) };
        },
      }) });
      const request = (action: string, invitationId = id, cookie = "niq_session=valid-session") => app.request(`/v1/organizations/${principal.organizationId}/invitations/${invitationId}/${action}`, { method: "POST", headers: { cookie } });
      const response = await request("regenerate");
      expect(response.status).toBe(200);
      expect((await response.json()).activationToken).toBe(exposeDevelopmentTokens ? "new-tenant-secret" : undefined);
      const revoke = await request("revoke");
      expect(revoke.status).toBe(200);
      expect((await revoke.json()).activationToken).toBeUndefined();
      expect((await request("revoke", "bad-id")).status).toBe(400);
      expect((await request("revoke", id, "")).status).toBe(401);
      expect(calls).toBe(2);
    }
  });

  test("changes NIQ administrator access through the platform boundary", async () => {
    const niqAdmin = { ...principal, platformRole: "NIQ_ADMIN" as const };
    let observedMembership = "";
    let observedActive = true;
    const app = createApp({
      allowedOrigin: "http://localhost:5173",
      authMode: "local",
      checkDatabase: async () => true,
      service: fakeService({
        authenticate: async () => niqAdmin,
        setPlatformAdministratorActive: async (_actor, membershipId, active) => {
          observedMembership = membershipId;
          observedActive = active;
          return { kind: "USER", membershipId, userId: "01J00000000000000000000008", email: "second.admin@niq.test", displayName: "Second Admin", status: "DISABLED", active, createdAt: new Date() };
        },
      }),
    });
    const membershipId = "01J00000000000000000000009";
    const response = await app.request(`/v1/platform/administrators/${membershipId}`, {
      method: "PATCH",
      headers: { cookie: "niq_session=valid-session", "content-type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    expect(response.status).toBe(200);
    expect(observedMembership).toBe(membershipId);
    expect(observedActive).toBe(false);
    expect((await response.json()).active).toBe(false);
  });

  test("does not expose invitation activation tokens outside development", async () => {
    const app = createApp({ allowedOrigin: "https://app.example.com", authMode: "local", checkDatabase: async () => true, service: fakeService() });
    const response = await app.request(`/v1/organizations/${principal.organizationId}/invitations`, {
      method: "POST",
      headers: { cookie: "niq_session=valid-session", "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", role: "MEDICAL", facilityIds: [] }),
    });
    expect(response.status).toBe(201);
    expect((await response.json()).activationToken).toBeUndefined();
  });

  test("returns a first-admin activation token only in development onboarding", async () => {
    const niqAdmin = { ...principal, platformRole: "NIQ_ADMIN" as const };
    const app = createApp({
      allowedOrigin: "http://localhost:5173",
      authMode: "local",
      checkDatabase: async () => true,
      exposeDevelopmentTokens: true,
      service: fakeService({
        authenticate: async () => niqAdmin,
        onboardOrganization: async () => ({ organization: { id: "01J00000000000000000000004" }, invitation: { id: "01J00000000000000000000005" }, token: "local-invite-token" }),
      }),
    });
    const response = await app.request("/v1/organizations/onboard", {
      method: "POST",
      headers: { cookie: "niq_session=valid-session", "content-type": "application/json" },
      body: JSON.stringify({
        legalName: "Example Health Network Private Limited",
        displayName: "Example Health Network",
        slug: "example-health",
        firstAdminEmail: "admin@example-health.test",
      }),
    });
    expect(response.status).toBe(201);
    expect((await response.json()).activationToken).toBe("local-invite-token");
  });

  test("serves organization logos as private, non-sniffable assets", async () => {
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService() });
    const response = await app.request(`/v1/organizations/${principal.organizationId}/logo`, { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("returns scoring connection metadata without exposing the credential", async () => {
    const niqAdmin = { ...principal, platformRole: "NIQ_ADMIN" as const };
    const app = createApp({
      allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true,
      service: fakeService({
        authenticate: async () => niqAdmin,
        activateScoring: async () => ({ connection: { deploymentId: "01J00000000000000000000006", scoringOrganizationId: "01J00000000000000000000007", keyVersion: "local-v1", activatedAt: new Date() } }),
      }),
    });
    const response = await app.request(`/v1/organizations/${principal.organizationId}/scoring/activate`, {
      method: "POST",
      headers: { cookie: "niq_session=valid-session", "content-type": "application/json" },
      body: JSON.stringify({ activationToken: `niq_act_${"x".repeat(48)}` }),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.connection.deploymentId).toBe("01J00000000000000000000006");
    expect(body.connection.scoringOrganizationId).toBe("01J00000000000000000000007");
    expect(body.credential).toBeUndefined();
  });

  test("returns the system error type when NIQ Scoring is not configured", async () => {
    const niqAdmin = { ...principal, platformRole: "NIQ_ADMIN" as const };
    const app = createApp({
      allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true,
      service: fakeService({
        authenticate: async () => niqAdmin,
        activateScoring: async () => { throw new ServiceError("SCORING_NOT_CONFIGURED", "NIQ Scoring is not configured for this application installation."); },
      }),
    });
    const response = await app.request(`/v1/organizations/${principal.organizationId}/scoring/activate`, {
      method: "POST",
      headers: { cookie: "niq_session=valid-session", "content-type": "application/json" },
      body: JSON.stringify({ activationToken: `niq_act_${"x".repeat(48)}` }),
    });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("SCORING_NOT_CONFIGURED");
    expect(body.error.requestId).toBeString();
  });

  test("returns live NIQ Scoring organization information without secret material", async () => {
    const app = createApp({
      allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true,
      service: fakeService({
        getScoringOrganizationInfo: async () => ({
          organization: { id: "01J00000000000000000000004", name: "Example Health", status: "ACTIVE" },
          deployment: { id: "01J00000000000000000000005", mode: "NIQ_HOSTED", environment: "production", status: "ACTIVE" },
          services: { scoring: { enabled: true }, faceScan: { enabled: false } },
          limits: { scoresPerMonth: 1000, faceScansPerMonth: null },
          usage: { period: "2026-09", scores: 12, faceScans: 0 },
          updatedAt: "2026-09-14T10:00:00.000Z",
          unavailableFields: ["limits.users"],
        }),
      }),
    });
    const response = await app.request(`/v1/organizations/${principal.organizationId}/scoring/organization-info`, { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.usage.scores).toBe(12);
    expect(JSON.stringify(body)).not.toContain("credential");
  });

  test("disconnects NIQ Scoring without accepting credential material", async () => {
    let disconnectedOrganization = "";
    const app = createApp({
      allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true,
      service: fakeService({ disconnectScoring: async (_actor, organizationId) => { disconnectedOrganization = organizationId; } }),
    });
    const response = await app.request(`/v1/organizations/${principal.organizationId}/scoring/connection`, {
      method: "DELETE",
      headers: { cookie: "niq_session=valid-session" },
    });
    expect(response.status).toBe(204);
    expect(disconnectedOrganization).toBe(principal.organizationId);
  });

  test("requires reconnection when NIQ Scoring rejects the saved credential", async () => {
    const app = createApp({
      allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true,
      service: fakeService({ getScoringOrganizationInfo: async () => { throw new ServiceError("INVALID_OR_EXPIRED_TOKEN", "Reconnect NIQ Scoring."); } }),
    });
    const response = await app.request(`/v1/organizations/${principal.organizationId}/scoring/organization-info`, { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("INVALID_OR_EXPIRED_TOKEN");
  });
});
