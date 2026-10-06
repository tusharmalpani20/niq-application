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
    createFacility: async () => ({}), listFacilities: async () => [], getFacilityPerformance: async () => ({}), updateFacility: async () => ({}),
    updatePatient: async () => ({}), correctPatientMrn: async () => ({}), correctPatientDob: async () => ({}), updateOrganizationUser: async () => ({}),
    listPatientPage: async (_actor, _org, options) => ({ items: [], total: 0, page: options.page, pageSize: options.pageSize }),
    createPatient: async () => ({}), listPatients: async () => [], getPatient: async () => ({}), listPatientAssessments: async () => [], listPatientAssessmentPage: async (_actor, _org, _patient, options) => ({ items: [], overviewItems: [], total: 0, page: options.page, pageSize: options.pageSize }), listAssessments: async () => [], listAssessmentPage: async (_actor, _org, options) => ({ items: [], total: 0, allCount: 0, myWorkCount: 0, completedCount: 0, page: options.page, pageSize: options.pageSize }), getAssessmentPriority: async () => false, setAssessmentPriority: async (_actor, _organizationId, assessmentId, isPriority) => ({ assessmentId, isPriority }), getOverviewRisk: async () => ({ highRiskPatients: 0, highRiskPatients30DaysAgo: 0, assessedPatients: 0, categories: { low: 0, moderate: 0, high: 0 }, categories30DaysAgo: { low: 0, moderate: 0, high: 0 }, highRiskAssessments: [], nutrition: { protein: { assessed: 0, inadequate: 0 }, eatingBarrier: { assessed: 0, top: null } } }), getOverviewSummary: async (_actor, _org, priorityPage, recentPage) => ({ patientCount: 0, patientsAdded30Days: 0, completedCount: 0, completedAdded30Days: 0, myAssessmentActions: 0, readyToSend: 0, correctionsToMake: 0, scoringIssues: 0, priority: { total: 0, page: priorityPage, pageSize: 3, items: [] }, recent: { total: 0, page: recentPage, pageSize: 4, items: [] } }), getOverviewActivity: async () => ({ days: [] }), getOverviewActivityDay: async () => ({ assessmentCount: 0, milestoneCount: 0, pageCount: 0, assessments: [] }),
    invitationAccess: async () => ({ allFacilities: true }), manageUserInvitation: async () => ({ invitation: {}, token: "replacement-token" }),
    inviteUser: async () => ({ invitation: {}, token: "invite-token" }), listUsers: async () => [], setUserActive: async () => ({}),
    ...overrides,
  };
}

describe("local authentication routes", () => {
  test("push status checks the current authenticated session", async () => {
    const calls: string[] = [];
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true,
      service: fakeService(), assessmentWorkflow: {} as NonNullable<Parameters<typeof createApp>[0]["assessmentWorkflow"]>, webPush: {
        subscriptionStatus: async (actor: Principal, organizationId: string, token: string, endpoint: string) => {
          expect(actor).toEqual(principal);
          expect(organizationId).toBe(principal.organizationId);
          expect(endpoint).toBe("https://web.push.apple.com/example");
          calls.push(token);
          return { enabled: token === "valid-session" };
        },
      } as NonNullable<Parameters<typeof createApp>[0]["webPush"]>,
    });
    const path = `/v1/organizations/${principal.organizationId}/push/subscriptions/status`;
    const body = JSON.stringify({ endpoint: "https://web.push.apple.com/example" });
    const headers = { cookie: "niq_session=valid-session", origin: "http://localhost:5173", "content-type": "application/json" };
    expect(await (await app.request(path, { method: "POST", headers, body })).json()).toEqual({ enabled: true });
    expect((await app.request(path, { method: "POST", headers: { ...headers, origin: "http://elsewhere.test" }, body })).status).toBe(403);
    expect((await app.request(path, { method: "POST", headers: { ...headers, cookie: "" }, body })).status).toBe(401);
    expect(calls).toEqual(["valid-session"]);
  });
  test("rejects authenticated mutations from missing or sibling origins", async () => {
    let revoked = 0;
    let tenantInvitations = 0;
    let signedOut = 0;
    const app = createApp({
      allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true,
      service: fakeService({
        revokePlatformAdministratorInvitation: async () => { revoked++; },
        manageUserInvitation: async () => { tenantInvitations++; return { invitation: {}, token: "replacement-token" }; },
        signOut: async () => { signedOut++; },
      }),
    });
    const invitation = "/v1/platform/administrators/invitations/01J00000000000000000000004/revoke";
    const tenantInvitation = `/v1/organizations/${principal.organizationId}/invitations/01J00000000000000000000004/revoke`;
    for (const origin of [undefined, "http://sibling.localhost:5173"]) {
      const headers = { cookie: "niq_session=valid-session", ...(origin ? { origin } : {}) };
      expect((await app.request(invitation, { method: "POST", headers })).status).toBe(403);
      expect((await app.request(tenantInvitation, { method: "POST", headers })).status).toBe(403);
      expect((await app.request("/v1/auth/sign-out", { method: "POST", headers })).status).toBe(403);
    }
    expect(revoked).toBe(0);
    expect(tenantInvitations).toBe(0);
    expect(signedOut).toBe(0);
    expect((await app.request(invitation, { method: "POST", headers: { cookie: "niq_session=valid-session", origin: "http://localhost:5173" } })).status).toBe(204);
    expect(revoked).toBe(1);
  });

  test("validates personal assessment priority changes within the authenticated tenant", async () => {
    const assessmentId = "01J00000000000000000000004";
    const calls: boolean[] = [];
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true,
      service: fakeService({ setAssessmentPriority: async (actor, organizationId, id, isPriority) => {
        expect(actor).toEqual(principal);
        expect(organizationId).toBe(principal.organizationId);
        expect(id).toBe(assessmentId);
        calls.push(isPriority);
        return { assessmentId: id, isPriority };
      } }) });
    const path = `/v1/organizations/${principal.organizationId}/assessments/${assessmentId}/priority`;
    const request = (body: unknown, cookie = "niq_session=valid-session") => app.request(path, { method: "PATCH", headers: { cookie, origin: "http://localhost:5173", "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await (await request({ isPriority: true })).json()).isPriority).toBe(true);
    expect((await (await request({ isPriority: false })).json()).isPriority).toBe(false);
    expect((await request({ isPriority: "true" })).status).toBe(400);
    expect((await request({ isPriority: true, extra: true })).status).toBe(400);
    expect((await request({ isPriority: true }, "")).status).toBe(401);
    expect(calls).toEqual([true, false]);
  });
  test("patient and user profile edits validate input and require authentication", async () => {
    let patientCalls = 0, correctionCalls = 0, dobCorrectionCalls = 0, userCalls = 0;
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService({
      updatePatient: async (actor, organizationId, locator, input) => {
        expect(actor).toEqual(principal); expect(organizationId).toBe(principal.organizationId); expect(locator).toBe("PAT-2"); expect(input.email).toBeUndefined(); patientCalls++; return {};
      },
      correctPatientMrn: async (actor, organizationId, locator, input) => {
        expect(actor).toEqual(principal); expect(organizationId).toBe(principal.organizationId); expect(locator).toBe("PAT-2"); expect(input.reason).toBe("Registration error"); correctionCalls++; return {};
      },
      correctPatientDob: async (actor, organizationId, locator, input) => {
        expect(actor).toEqual(principal); expect(organizationId).toBe(principal.organizationId); expect(locator).toBe("PAT-2"); expect(input.dateOfBirth).toBe("2000-01-01"); expect(input.reason).toBe("Registration error"); dobCorrectionCalls++; return {};
      },
      updateOrganizationUser: async (_actor, organizationId, membershipId, input) => {
        expect(organizationId).toBe(principal.organizationId); expect(membershipId).toBe(principal.membershipId); expect(input.role).toBe("DOCTOR"); userCalls++; return {};
      },
    }) });
    const request = (path: string, method: string, input: unknown, cookie = "niq_session=valid-session") => app.request(`/v1/organizations/${principal.organizationId}/${path}`, { method, headers: { origin: "http://localhost:5173", cookie, "content-type": "application/json" }, body: JSON.stringify(input) });
    const patient = { name: "Patient", homeFacilityId: principal.organizationId, gender: "UNKNOWN", phone: "9012345678", email: "" };
    expect((await request("patients/PAT-2", "PATCH", patient)).status).toBe(200);
    expect((await request("patients/PAT-2", "PATCH", { ...patient, medicalRecordNumber: "CHANGED" })).status).toBe(400);
    expect((await request("patients/PAT-2", "PATCH", { ...patient, phone: "" })).status).toBe(400);
    expect((await request("patients/PAT-2", "PATCH", patient, "")).status).toBe(401);
    expect((await request("patients/PAT-2", "PATCH", { ...patient, dateOfBirth: "2000-01-01" })).status).toBe(400);
    expect((await request("patients/PAT-2/correct-mrn", "POST", { medicalRecordNumber: "NEW", reason: "Registration error" })).status).toBe(200);
    expect((await request("patients/PAT-2/correct-mrn", "POST", { medicalRecordNumber: "NEW", reason: "" })).status).toBe(400);
    expect((await request("patients/PAT-2/correct-dob", "POST", { dateOfBirth: "2000-01-01", reason: "Registration error" })).status).toBe(200);
    expect((await request("patients/PAT-2/correct-dob", "POST", { dateOfBirth: "3000-01-01", reason: "Registration error" })).status).toBe(400);
    expect((await request("patients/PAT-2/correct-dob", "POST", { dateOfBirth: "2000-01-01", reason: "" })).status).toBe(400);
    const user = { displayName: "Colleague", role: "DOCTOR", facilityIds: [] };
    const path = `users/${principal.membershipId}/profile`;
    expect((await request(path, "PUT", user)).status).toBe(200);
    expect((await request(path, "PUT", user, "")).status).toBe(401);
    expect((await request(path, "PUT", { ...user, email: "new@example.com" })).status).toBe(400);
    expect(patientCalls).toBe(1); expect(correctionCalls).toBe(1); expect(dobCorrectionCalls).toBe(1); expect(userCalls).toBe(1);
  });

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
      method: "PATCH", headers: { origin: "http://localhost:5173", cookie, "content-type": "application/json" },
      body: JSON.stringify({ logo: { ...logo, mimeType } }),
    });
    expect((await request("image/png")).status).toBe(200);
    expect((await request("image/svg+xml")).status).toBe(400);
    expect((await request("image/png", "")).status).toBe(401);
    expect(updates).toBe(1);
  });
  test("passes logo removal through authenticated organization updates", async () => {
    let removed = false;
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService({
      updateOrganization: async (_actor, _organizationId, input) => {
        removed = input.logoObjectKey === null;
        return {};
      },
    }) });
    const response = await app.request(`/v1/organizations/${principal.organizationId}`, {
      method: "PATCH", headers: { origin: "http://localhost:5173", cookie: "niq_session=valid-session", "content-type": "application/json" },
      body: JSON.stringify({ logoObjectKey: null }),
    });
    expect(response.status).toBe(200);
    expect(removed).toBe(true);
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

  test("routes facility performance through the authenticated tenant boundary", async () => {
    const facilityId = "01J00000000000000000000004";
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true, service: fakeService({
      getFacilityPerformance: async (actor, organizationId, requestedFacilityId) => {
        expect(actor).toEqual(principal);
        expect(organizationId).toBe(principal.organizationId);
        expect(requestedFacilityId).toBe(facilityId);
        return { timezone: "UTC", assessments: { months: [], previous: null }, faceScans: { months: [], previous: null } };
      },
    }) });
    const path = `/v1/organizations/${principal.organizationId}/facilities/${facilityId}/performance`;
    expect((await app.request(path, { headers: { cookie: "niq_session=valid-session" } })).status).toBe(200);
    expect((await app.request(path)).status).toBe(401);
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
      headers: { origin: "http://localhost:5173", "content-type": "application/json", cookie: "niq_session=valid-session" },
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
        updatePatient: async () => ({}), updateOrganizationUser: async () => ({}),
    createPatient: async (_actor, organizationId, input) => {
          observedOrganization = organizationId;
          observedMedicalRecordNumber = input.medicalRecordNumber;
          return patient;
        },
        listPatients: async () => [patient],
      }),
    });
    const patientInput = {
      medicalRecordNumber: "MRN-1001",
      homeFacilityId: "01J00000000000000000000004",
      dateOfBirth: "1980-01-02",
      gender: "FEMALE",
      name: "Test Patient",
      phone: "9012345678",
    };
    const response = await app.request(`/v1/organizations/${principal.organizationId}/patients`, {
      method: "POST",
      headers: { origin: "http://localhost:5173", "content-type": "application/json", cookie: "niq_session=valid-session" },
      body: JSON.stringify(patientInput),
    });
    expect(response.status).toBe(201);
    expect(observedOrganization).toBe(principal.organizationId);
    expect(observedMedicalRecordNumber).toBe("MRN-1001");
    const withoutPhone = await app.request(`/v1/organizations/${principal.organizationId}/patients`, {
      method: "POST",
      headers: { origin: "http://localhost:5173", "content-type": "application/json", cookie: "niq_session=valid-session" },
      body: JSON.stringify({ ...patientInput, phone: "" }),
    });
    expect(withoutPhone.status).toBe(400);

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

  test("validates and forwards paginated patient filters", async () => {
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true,
      service: fakeService({ listPatientPage: async (actor, organizationId, options) => {
        expect(actor).toEqual(principal);
        expect(organizationId).toBe(principal.organizationId);
        expect(options).toEqual({ page: 2, pageSize: 10, facility: "facility-1", gender: "Female", sort: "assessment-oldest", query: "PAT-11", registered: "this-month" });
        return { items: [], total: 21, page: options.page, pageSize: options.pageSize };
      } }),
    });
    const path = `/v1/organizations/${principal.organizationId}/patients/page`;
    const response = await app.request(`${path}?page=2&pageSize=10&facility=facility-1&gender=Female&sort=assessment-oldest&query=PAT-11&registered=this-month`, { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], total: 21, page: 2, pageSize: 10 });
    expect((await app.request(`${path}?page=0`, { headers: { cookie: "niq_session=valid-session" } })).status).toBe(400);
    expect((await app.request(`${path}?gender=invalid`, { headers: { cookie: "niq_session=valid-session" } })).status).toBe(400);
    expect((await app.request(path)).status).toBe(401);
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

  test("lists only the requested patient's assessments", async () => {
    const observed: string[] = [];
    const assessment = { id: "01J00000000000000000000010", status: "DRAFT" };
    const app = createApp({
      allowedOrigin: "http://localhost:5173",
      authMode: "local",
      checkDatabase: async () => true,
      service: fakeService({ listPatientAssessments: async (actor, organizationId, patientLocator) => {
        expect(actor).toEqual(principal);
        observed.push(organizationId, patientLocator);
        return [assessment];
      } }),
    });
    const response = await app.request(`/v1/organizations/${principal.organizationId}/patients/PAT-2/assessments`, { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(observed).toEqual([principal.organizationId, "PAT-2"]);
    expect(await response.json()).toEqual({ items: [assessment] });
  });

  test("validates and forwards a patient assessment page", async () => {
    const app = createApp({
      allowedOrigin: "http://localhost:5173",
      authMode: "local",
      checkDatabase: async () => true,
      service: fakeService({ listPatientAssessmentPage: async (actor, organizationId, patientLocator, options) => {
        expect(actor).toEqual(principal);
        expect(organizationId).toBe(principal.organizationId);
        expect(patientLocator).toBe("PAT-2");
        expect(options).toEqual({ page: 2, pageSize: 10 });
        return { items: [], total: 12, page: 2, pageSize: 10, overviewItems: [] };
      } }),
    });
    const path = `/v1/organizations/${principal.organizationId}/patients/PAT-2/assessments/page`;
    const response = await app.request(`${path}?page=2&pageSize=10`, { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ items: [], total: 12, page: 2, pageSize: 10, overviewItems: [] });
    expect((await app.request(`${path}?pageSize=101`, { headers: { cookie: "niq_session=valid-session" } })).status).toBe(400);
  });

  test("validates and forwards paginated assessment filters", async () => {
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true,
      service: fakeService({ listAssessmentPage: async (actor, organizationId, options) => {
        expect(actor).toEqual(principal);
        expect(organizationId).toBe(principal.organizationId);
        expect(options).toEqual({ page: 2, pageSize: 10, tab: "completed", facility: "all", status: "COMPLETED_THIS_MONTH", risk: "high", query: "PAT-11" });
        return { items: [], total: 0, allCount: 20, myWorkCount: 3, completedCount: 12, page: options.page, pageSize: options.pageSize };
      } }),
    });
    const path = `/v1/organizations/${principal.organizationId}/assessments/page`;
    const response = await app.request(`${path}?page=2&pageSize=10&tab=completed&status=COMPLETED_THIS_MONTH&risk=high&query=PAT-11`, { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ total: 0, allCount: 20, completedCount: 12, page: 2 });
    expect((await app.request(`${path}?page=0`, { headers: { cookie: "niq_session=valid-session" } })).status).toBe(400);
    expect((await app.request(`${path}?risk=unknown`, { headers: { cookie: "niq_session=valid-session" } })).status).toBe(400);
    expect((await app.request(path)).status).toBe(401);
  });

  test("returns private risk counts through the authenticated tenant boundary", async () => {
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true,
      service: fakeService({ getOverviewRisk: async (actor, organizationId) => {
        expect(actor).toEqual(principal);
        expect(organizationId).toBe(principal.organizationId);
        return { highRiskPatients: 2, highRiskPatients30DaysAgo: 3, assessedPatients: 5, categories: { low: 2, moderate: 1, high: 2 }, categories30DaysAgo: { low: 1, moderate: 1, high: 3 }, highRiskAssessments: [], nutrition: { protein: { assessed: 4, inadequate: 2 }, eatingBarrier: { assessed: 3, top: { id: "dietary_symptoms_nausea", label: "Nausea", count: 2 } } } };
      } }),
    });
    const url = `/v1/organizations/${principal.organizationId}/overview-risk`;
    expect((await app.request(url)).status).toBe(401);
    const response = await app.request(url, { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ highRiskPatients: 2, highRiskPatients30DaysAgo: 3, assessedPatients: 5, categories: { low: 2, moderate: 1, high: 2 }, categories30DaysAgo: { low: 1, moderate: 1, high: 3 }, highRiskAssessments: [], nutrition: { protein: { assessed: 4, inadequate: 2 }, eatingBarrier: { assessed: 3, top: { id: "dietary_symptoms_nausea", label: "Nausea", count: 2 } } } });
  });

  test("returns paged overview data through the authenticated tenant boundary", async () => {
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true,
      service: fakeService({ getOverviewSummary: async (actor, organizationId, priorityPage, recentPage) => {
        expect(actor).toEqual(principal);
        expect(organizationId).toBe(principal.organizationId);
        expect([priorityPage, recentPage]).toEqual([2, 3]);
        return { patientCount: 9, patientsAdded30Days: 2, completedCount: 4, completedAdded30Days: 1, myAssessmentActions: 0, readyToSend: 0, correctionsToMake: 0, scoringIssues: 0,
          priority: { total: 5, page: priorityPage, pageSize: 3, items: [] }, recent: { total: 10, page: recentPage, pageSize: 4, items: [] } };
      } }),
    });
    const url = `/v1/organizations/${principal.organizationId}/overview-summary?priorityPage=2&recentPage=3`;
    expect((await app.request(url)).status).toBe(401);
    const invalid = await app.request(`${url}&priorityPage=0`, { headers: { cookie: "niq_session=valid-session" } });
    expect(invalid.status).toBe(400);
    const response = await app.request(url, { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).patientCount).toBe(9);
  });

  test("returns only requested personal assessment activity through the tenant boundary", async () => {
    const day = { day: "2026-09-24", assessmentCount: 1, milestoneCount: 1, actions: ["ASSESSMENT_CREATED" as const] };
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true,
      service: fakeService({ getOverviewActivity: async (actor, organizationId, from, to, timeZone) => {
        expect(actor).toEqual(principal);
        expect(organizationId).toBe(principal.organizationId);
        expect(from.toISOString()).toBe("2026-08-31T18:30:00.000Z");
        expect(to.toISOString()).toBe("2026-09-30T18:30:00.000Z");
        expect(timeZone).toBe("Asia/Kolkata");
        return { days: [day] };
      } }),
    });
    const url = `/v1/organizations/${principal.organizationId}/overview-activity?from=2026-08-31T18%3A30%3A00.000Z&to=2026-09-30T18%3A30%3A00.000Z&timeZone=Asia%2FKolkata`;
    expect((await app.request(url)).status).toBe(401);
    const response = await app.request(url, { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ days: [day] });
    expect((await app.request(url.replace("Asia%2FKolkata", "Invalid%2FZone"), { headers: { cookie: "niq_session=valid-session" } })).status).toBe(400);
  });

  test("returns a bounded page of personal activity with assessment labels", async () => {
    const detail = { assessmentCount: 5, milestoneCount: 6, pageCount: 2, assessments: [{ assessmentId: principal.membershipId, reference: "NIQ-A-1", patientDisplayName: "A Person", milestones: [{ action: "ASSESSMENT_CREATED" as const, occurredAt: new Date("2026-09-24T08:30:00.000Z") }] }] };
    const app = createApp({ allowedOrigin: "http://localhost:5173", authMode: "local", checkDatabase: async () => true,
      service: fakeService({ getOverviewActivityDay: async (actor, organizationId, from, to, page) => {
        expect(actor).toEqual(principal);
        expect(organizationId).toBe(principal.organizationId);
        expect(from.toISOString()).toBe("2026-09-23T18:30:00.000Z");
        expect(to.toISOString()).toBe("2026-09-24T18:30:00.000Z");
        expect(page).toBe(2);
        return detail;
      } }),
    });
    const url = `/v1/organizations/${principal.organizationId}/overview-activity/day?from=2026-09-23T18%3A30%3A00.000Z&to=2026-09-24T18%3A30%3A00.000Z&page=2`;
    expect((await app.request(url)).status).toBe(401);
    const response = await app.request(url, { headers: { cookie: "niq_session=valid-session" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ...detail, assessments: [{ ...detail.assessments[0], milestones: [{ ...detail.assessments[0]!.milestones[0], occurredAt: "2026-09-24T08:30:00.000Z" }] }] });
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
      headers: { origin: "http://localhost:5173", cookie: "niq_session=valid-session", "content-type": "application/json" },
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
      const request = (action: string, invitationId = id, cookie = "niq_session=valid-session") => app.request(`/v1/platform/administrators/invitations/${invitationId}/${action}`, { method: "POST", headers: { origin: "http://localhost:5173", cookie } });
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
      const request = (action: string, invitationId = id, cookie = "niq_session=valid-session") => app.request(`/v1/organizations/${principal.organizationId}/invitations/${invitationId}/${action}`, { method: "POST", headers: { origin: "http://localhost:5173", cookie } });
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
      headers: { origin: "http://localhost:5173", cookie: "niq_session=valid-session", "content-type": "application/json" },
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
      headers: { origin: "https://app.example.com", cookie: "niq_session=valid-session", "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", role: "OTHER_MEDICAL", facilityIds: [] }),
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
      headers: { origin: "http://localhost:5173", cookie: "niq_session=valid-session", "content-type": "application/json" },
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
      headers: { origin: "http://localhost:5173", cookie: "niq_session=valid-session", "content-type": "application/json" },
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
      headers: { origin: "http://localhost:5173", cookie: "niq_session=valid-session", "content-type": "application/json" },
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
      headers: { origin: "http://localhost:5173", cookie: "niq_session=valid-session" },
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
