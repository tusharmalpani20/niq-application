import { editPatient, editOrganizationUser } from "./profile-edits";
import { faceScanSessionSchema } from "../../../../packages/contracts/src/face-scan";
import { formatAssessmentReference, hasPermission, type Permission } from "@niq/application-contracts";
import type { ApplicationConfig } from "@niq/application-config";
import type { AcceptInvitation, ActivateScoring, BootstrapAdmin, CreateFacility, CreateInvitation, CreateOrganization, CreatePlatformAdministratorInvitation, OnboardOrganization, RegisterPatient, ResendMfaRequest, SignInRequest, UpdateFacility, UpdateOrganization, UpdatePatient, UpdateOrganizationUser, VerifyMfaRequest } from "@niq/application-contracts";
import { createEntityId, normalizeEmail, requiresMfa } from "@niq/application-domain";
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client";
import {
  auditEvents,
  assessmentFaceScans,
  assessments,
  authenticationFailures,
  authSessions,
  facilities,
  facilityMemberships,
  invitationFacilities,
  invitations,
  mfaChallenges,
  organizationEntitlements,
  organizationBrandAssets,
  organizationMemberships,
  organizations,
  patients,
  scoringConnections,
  users,
} from "../db/schema";
import { decryptCredential, encryptCredential } from "../security/credential-encryption";
import { decodeOrganizationLogo, InvalidOrganizationLogoError } from "../security/organization-logo";
import { decryptPatientData, encryptPatientData, patientDataKey } from "../security/patient-data";
import { createMfaOtp } from "../security/mfa-otp";
import { hashPassword, keyedHash, randomToken, secureEqual, verifyPassword } from "../security/tokens";
import type { ApplicationService, MfaChallengeResult, OtpDelivery, Principal, RequestContext, SessionResult, SignInResult } from "./application";
import { ServiceError } from "./application";
import { facilityAccessCondition } from "./facility-access";
import { facilityTrend } from "./facility-performance";
import { requestScoringOrganizationInfo, ScoringOrganizationInfoRequestError } from "./scoring-organization-info";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;
const scoringActivationResponseSchema = z.object({
  deploymentId: z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/),
  clientId: z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/),
  credential: z.string().min(32),
});
const patientProfileSchema = z.object({
  name: z.string(),
  phone: z.string().optional(),
  email: z.string().optional(),
});
type PatientRecord = {
  id: string;
  organizationId: string;
  referencePrefix: string;
  serialNumber: number;
  dateOfBirth: string | null;
  gender: "FEMALE" | "MALE" | "OTHER" | "UNKNOWN";
  encryptedProfile: Uint8Array;
  encryptedExternalReference: Uint8Array;
  facilityId: string | null;
  facilityName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function databaseCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

export class PostgresApplicationService implements ApplicationService {
  constructor(private readonly db: Database, private readonly config: ApplicationConfig, private readonly otpDelivery: OtpDelivery) {}

  private async audit(executor: Executor, organizationId: string, context: RequestContext, action: string, resourceType: string, resourceId?: string, actor?: Principal, metadata: Record<string, unknown> = {}) {
    await executor.insert(auditEvents).values({
      id: createEntityId(), organizationId, actorMembershipId: actor?.membershipId, actorType: actor ? "USER" : ("actorUserId" in metadata ? "NIQ_ADMIN" : "SYSTEM"),
      action, resourceType, resourceId, requestId: context.requestId,
      ipAddressHash: context.ipAddress ? await keyedHash(context.ipAddress, this.config.SESSION_SECRET) : undefined,
      metadata,
    });
  }

  private ensureOrganizationAccess(actor: Principal, organizationId: string, permission?: Permission) {
    if (actor.platformRole === "NIQ_ADMIN") return;
    if (actor.organizationId !== organizationId || (permission && !hasPermission(actor.role, permission))) {
      throw new ServiceError("FORBIDDEN", "You do not have access to this organization.");
    }
  }

  private presentPatient(row: PatientRecord) {
    const key = patientDataKey(this.config.PATIENT_DATA_ENCRYPTION_KEY, this.config.SESSION_SECRET);
    const profile = patientProfileSchema.parse(JSON.parse(decryptPatientData(row.encryptedProfile, key)));
    return {
      id: row.id,
      organizationId: row.organizationId,
      reference: `${row.referencePrefix}-${row.serialNumber}`,
      homeFacility: row.facilityId && row.facilityName ? { id: row.facilityId, name: row.facilityName } : null,
      dateOfBirth: row.dateOfBirth,
      gender: row.gender,
      displayName: profile.name,
      medicalRecordNumber: decryptPatientData(row.encryptedExternalReference, key),
      ...(profile.phone ? { phone: profile.phone } : {}),
      ...(profile.email ? { email: profile.email } : {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async createSession(executor: Executor, principal: Principal): Promise<SessionResult> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + this.config.SESSION_TTL_HOURS * 60 * 60 * 1000);
    await executor.insert(authSessions).values({
      id: createEntityId(), userId: principal.userId, organizationId: principal.organizationId,
      membershipId: principal.membershipId, tokenHash: await keyedHash(token, this.config.SESSION_SECRET), expiresAt,
    });
    return { token, expiresAt, principal };
  }

  private async findPrincipal(email: string): Promise<(Principal & { passwordHash: string | null; mfaEnabled: boolean }) | null> {
    const rows = await this.db.select({
      userId: users.id, email: users.email, displayName: users.displayName, passwordHash: users.passwordHash,
      platformRole: users.platformRole, mfaEnabled: users.mfaEnabled, userStatus: users.status,
      organizationId: organizationMemberships.organizationId, membershipId: organizationMemberships.id,
      role: organizationMemberships.role, membershipActive: organizationMemberships.isActive,
      organizationStatus: organizations.status,
    }).from(users)
      .innerJoin(organizationMemberships, eq(organizationMemberships.userId, users.id))
      .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
      .where(eq(users.email, normalizeEmail(email))).limit(1);
    const row = rows[0];
    if (!row || row.userStatus !== "ACTIVE" || !row.membershipActive || row.organizationStatus !== "ACTIVE") return null;
    return row;
  }

  private async recordFailure(principalHash: string): Promise<boolean> {
    const now = new Date();
    const lockUntil = new Date(now.getTime() + this.config.AUTH_LOCKOUT_MINUTES * 60_000);
    return this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(authenticationFailures).where(eq(authenticationFailures.principalHash, principalHash)).for("update").limit(1);
      const stale = !existing || now.getTime() - existing.windowStartedAt.getTime() > this.config.AUTH_LOCKOUT_MINUTES * 60_000;
      const failedAttempts = stale ? 1 : existing.failedAttempts + 1;
      await tx.insert(authenticationFailures).values({ principalHash, failedAttempts, windowStartedAt: stale ? now : existing!.windowStartedAt, lockedUntil: failedAttempts >= this.config.AUTH_MAX_ATTEMPTS ? lockUntil : null, updatedAt: now })
        .onConflictDoUpdate({ target: authenticationFailures.principalHash, set: { failedAttempts, windowStartedAt: stale ? now : existing!.windowStartedAt, lockedUntil: failedAttempts >= this.config.AUTH_MAX_ATTEMPTS ? lockUntil : null, updatedAt: now } });
      return failedAttempts >= this.config.AUTH_MAX_ATTEMPTS;
    });
  }

  async signIn(input: SignInRequest, context: RequestContext): Promise<SignInResult> {
    const email = normalizeEmail(input.email);
    const principalHash = await keyedHash(email, this.config.SESSION_SECRET);
    const [failure] = await this.db.select().from(authenticationFailures).where(eq(authenticationFailures.principalHash, principalHash)).limit(1);
    if (failure?.lockedUntil && failure.lockedUntil > new Date()) throw new ServiceError("ACCOUNT_LOCKED", "Sign-in is temporarily locked. Try again later.");

    const principal = await this.findPrincipal(email);
    const passwordHash = principal?.passwordHash ?? "$argon2id$v=19$m=65536,t=3,p=1$DIIKMCk8ipRClT+MfvGtjYX+0NFC7oDSijyGitid6tQ$Csz5WYzo1LkpUYc7nzL70kddQyAOJm6RKrcNJjncPQ0";
    if (!(await verifyPassword(input.password, passwordHash)) || !principal?.passwordHash) {
      const locked = await this.recordFailure(principalHash);
      if (principal) await this.audit(this.db, principal.organizationId, context, locked ? "AUTH_ACCOUNT_LOCKED" : "AUTH_SIGN_IN_FAILED", "user", principal.userId, principal);
      throw new ServiceError("INVALID_CREDENTIALS", "The email or password is incorrect.");
    }
    await this.db.delete(authenticationFailures).where(eq(authenticationFailures.principalHash, principalHash));

    if (principal.mfaEnabled || requiresMfa(principal.role, principal.platformRole === "NIQ_ADMIN")) {
      const challengeToken = randomToken();
      const otp = createMfaOtp(this.config);
      const sentAt = new Date();
      const expiresAt = new Date(sentAt.getTime() + this.config.MFA_OTP_TTL_MINUTES * 60_000);
      await this.db.insert(mfaChallenges).values({
        id: createEntityId(), userId: principal.userId, organizationId: principal.organizationId,
        membershipId: principal.membershipId, challengeTokenHash: await keyedHash(challengeToken, this.config.SESSION_SECRET),
        otpHash: await keyedHash(otp, this.config.SESSION_SECRET), maxAttempts: this.config.MFA_MAX_ATTEMPTS,
        lastSentAt: sentAt, expiresAt,
      });
      await this.otpDelivery.deliver({ email, otp, expiresAt });
      await this.audit(this.db, principal.organizationId, context, "AUTH_MFA_CHALLENGE_CREATED", "user", principal.userId, principal);
      return {
        kind: "mfa_required", challengeToken, expiresAt,
        resendAvailableAt: new Date(sentAt.getTime() + this.config.MFA_RESEND_COOLDOWN_SECONDS * 1000),
        attemptsRemaining: this.config.MFA_MAX_ATTEMPTS,
        resendsRemaining: this.config.MFA_MAX_RESENDS,
      };
    }
    const session = await this.createSession(this.db, principal);
    await this.db.update(users).set({ lastSignedInAt: new Date(), updatedAt: new Date() }).where(eq(users.id, principal.userId));
    await this.audit(this.db, principal.organizationId, context, "AUTH_SIGNED_IN", "user", principal.userId, principal);
    return { kind: "authenticated", session };
  }

  async resendMfa(input: ResendMfaRequest, context: RequestContext): Promise<MfaChallengeResult> {
    const challengeHash = await keyedHash(input.challengeToken, this.config.SESSION_SECRET);
    const now = new Date();
    const challengeToken = randomToken();
    const otp = createMfaOtp(this.config);
    const result = await this.db.transaction(async (tx) => {
      const [challenge] = await tx.select().from(mfaChallenges)
        .where(and(eq(mfaChallenges.challengeTokenHash, challengeHash), isNull(mfaChallenges.consumedAt)))
        .for("update").limit(1);
      const chainExpiresAt = challenge
        ? new Date(challenge.createdAt.getTime() + this.config.MFA_OTP_TTL_MINUTES * 60_000 * (this.config.MFA_MAX_RESENDS + 1))
        : now;
      if (!challenge || chainExpiresAt <= now) {
        throw new ServiceError("INVALID_OR_EXPIRED_TOKEN", "This verification request has expired. Please sign in again.");
      }
      if (challenge.resendCount >= this.config.MFA_MAX_RESENDS) {
        throw new ServiceError("RATE_LIMITED", "The resend limit has been reached. Please sign in again.", { resendsRemaining: 0 });
      }
      const resendAvailableAt = new Date(challenge.lastSentAt.getTime() + this.config.MFA_RESEND_COOLDOWN_SECONDS * 1000);
      if (resendAvailableAt > now) {
        throw new ServiceError("RATE_LIMITED", "Please wait before requesting another code.", {
          retryAfterSeconds: Math.ceil((resendAvailableAt.getTime() - now.getTime()) / 1000),
          resendsRemaining: this.config.MFA_MAX_RESENDS - challenge.resendCount,
        });
      }
      const [account] = await tx.select({ email: users.email }).from(users)
        .innerJoin(organizationMemberships, and(
          eq(organizationMemberships.id, challenge.membershipId),
          eq(organizationMemberships.userId, users.id),
          eq(organizationMemberships.organizationId, challenge.organizationId),
        ))
        .innerJoin(organizations, eq(organizations.id, challenge.organizationId))
        .where(and(
          eq(users.id, challenge.userId), eq(users.status, "ACTIVE"),
          eq(organizationMemberships.isActive, true), eq(organizations.status, "ACTIVE"),
        )).limit(1);
      if (!account) throw new ServiceError("INVALID_OR_EXPIRED_TOKEN", "The account is no longer active.");

      const expiresAt = new Date(now.getTime() + this.config.MFA_OTP_TTL_MINUTES * 60_000);
      const resendCount = challenge.resendCount + 1;
      await tx.update(mfaChallenges).set({
        challengeTokenHash: await keyedHash(challengeToken, this.config.SESSION_SECRET),
        otpHash: await keyedHash(otp, this.config.SESSION_SECRET),
        attempts: 0, resendCount, lastSentAt: now, expiresAt, updatedAt: now,
      }).where(eq(mfaChallenges.id, challenge.id));
      await this.audit(tx, challenge.organizationId, context, "AUTH_MFA_CHALLENGE_RESENT", "user", challenge.userId, undefined, { resendCount });
      return {
        email: account.email,
        expiresAt,
        resendAvailableAt: new Date(now.getTime() + this.config.MFA_RESEND_COOLDOWN_SECONDS * 1000),
        resendsRemaining: this.config.MFA_MAX_RESENDS - resendCount,
        attemptsRemaining: challenge.maxAttempts,
      };
    });
    await this.otpDelivery.deliver({ email: result.email, otp, expiresAt: result.expiresAt });
    return { challengeToken, ...result };
  }

  async verifyMfa(input: VerifyMfaRequest, context: RequestContext): Promise<SessionResult> {
    const challengeHash = await keyedHash(input.challengeToken, this.config.SESSION_SECRET);
    const result = await this.db.transaction(async (tx) => {
      const [challenge] = await tx.select().from(mfaChallenges).where(and(eq(mfaChallenges.challengeTokenHash, challengeHash), isNull(mfaChallenges.consumedAt))).for("update").limit(1);
      if (!challenge || challenge.expiresAt <= new Date() || challenge.attempts >= challenge.maxAttempts) throw new ServiceError("INVALID_OR_EXPIRED_TOKEN", "The MFA challenge is invalid or expired.");
      const otpHash = await keyedHash(input.otp, this.config.SESSION_SECRET);
      if (!secureEqual(otpHash, challenge.otpHash)) {
        const attemptsRemaining = Math.max(0, challenge.maxAttempts - challenge.attempts - 1);
        await tx.update(mfaChallenges).set({ attempts: challenge.attempts + 1, updatedAt: new Date() }).where(eq(mfaChallenges.id, challenge.id));
        await this.audit(tx, challenge.organizationId, context, "AUTH_MFA_FAILED", "user", challenge.userId);
        return { session: null, attemptsRemaining };
      }
      const [row] = await tx.select({
        userId: users.id, email: users.email, displayName: users.displayName, platformRole: users.platformRole,
        organizationId: organizationMemberships.organizationId, membershipId: organizationMemberships.id,
        role: organizationMemberships.role,
      }).from(users).innerJoin(organizationMemberships, eq(organizationMemberships.userId, users.id))
        .where(and(eq(users.id, challenge.userId), eq(organizationMemberships.id, challenge.membershipId), eq(users.status, "ACTIVE"), eq(organizationMemberships.isActive, true))).limit(1);
      if (!row) throw new ServiceError("INVALID_OR_EXPIRED_TOKEN", "The account is no longer active.");
      await tx.update(mfaChallenges).set({ consumedAt: new Date(), updatedAt: new Date() }).where(eq(mfaChallenges.id, challenge.id));
      await tx.update(users).set({ lastSignedInAt: new Date(), updatedAt: new Date() }).where(eq(users.id, row.userId));
      const session = await this.createSession(tx, row);
      await this.audit(tx, row.organizationId, context, "AUTH_SIGNED_IN", "user", row.userId, row);
      return { session, attemptsRemaining: challenge.maxAttempts - challenge.attempts };
    });
    if (!result.session) throw new ServiceError("INVALID_CREDENTIALS", "The verification code is incorrect.", { attemptsRemaining: result.attemptsRemaining });
    return result.session;
  }

  async authenticate(sessionToken: string): Promise<Principal | null> {
    const tokenHash = await keyedHash(sessionToken, this.config.SESSION_SECRET);
    const [row] = await this.db.select({
      sessionId: authSessions.id, userId: users.id, email: users.email, displayName: users.displayName,
      platformRole: users.platformRole, organizationId: organizationMemberships.organizationId,
      membershipId: organizationMemberships.id, role: organizationMemberships.role,
    }).from(authSessions).innerJoin(users, eq(users.id, authSessions.userId))
      .innerJoin(organizationMemberships, eq(organizationMemberships.id, authSessions.membershipId))
      .innerJoin(organizations, eq(organizations.id, authSessions.organizationId))
      .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, new Date()),
        eq(users.status, "ACTIVE"), eq(organizationMemberships.isActive, true), eq(organizations.status, "ACTIVE"))).limit(1);
    if (!row) return null;
    await this.db.update(authSessions).set({ lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(authSessions.id, row.sessionId));
    return row;
  }

  async signOut(sessionToken: string, context: RequestContext): Promise<void> {
    const tokenHash = await keyedHash(sessionToken, this.config.SESSION_SECRET);
    const [session] = await this.db.select().from(authSessions).where(eq(authSessions.tokenHash, tokenHash)).limit(1);
    if (!session) return;
    await this.db.transaction(async (tx) => {
      await tx.update(authSessions).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(authSessions.id, session.id));
      await this.audit(tx, session.organizationId, context, "AUTH_SIGNED_OUT", "session", session.id);
    });
  }

  async acceptInvitation(input: AcceptInvitation, context: RequestContext): Promise<Principal> {
    const tokenHash = await keyedHash(input.token, this.config.SESSION_SECRET);
    return this.db.transaction(async (tx) => {
      const [invite] = await tx.select().from(invitations).where(and(eq(invitations.tokenHash, tokenHash), eq(invitations.status, "PENDING"))).for("update").limit(1);
      if (!invite || invite.expiresAt <= new Date()) throw new ServiceError("INVALID_OR_EXPIRED_TOKEN", "The invitation is invalid or expired.");
      const email = normalizeEmail(invite.email);
      const existing = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing.length > 0) throw new ServiceError("CONFLICT", "An account already exists for this email.");
      const userId = createEntityId(); const membershipId = createEntityId();
      await tx.insert(users).values({ id: userId, email, displayName: input.displayName, passwordHash: await hashPassword(input.password), status: "ACTIVE", platformRole: invite.platformRole, mfaEnabled: invite.role === "ORGANIZATION_ADMIN" || invite.platformRole === "NIQ_ADMIN" });
      await tx.update(invitations).set({ status: "ACCEPTED", acceptedAt: new Date(), updatedAt: new Date() }).where(eq(invitations.id, invite.id));
      await tx.insert(organizationMemberships).values({ id: membershipId, organizationId: invite.organizationId, userId, role: invite.role });
      const assigned = await tx.select().from(invitationFacilities).where(eq(invitationFacilities.invitationId, invite.id));
      if (assigned.length) await tx.insert(facilityMemberships).values(assigned.map((item) => ({ id: createEntityId(), organizationId: invite.organizationId, organizationMembershipId: membershipId, facilityId: item.facilityId })));
      const principal: Principal = { userId, organizationId: invite.organizationId, membershipId, email, displayName: input.displayName, role: invite.role, platformRole: invite.platformRole };
      await this.audit(tx, invite.organizationId, context, "INVITATION_ACCEPTED", "invitation", invite.id, principal);
      return principal;
    });
  }

  async bootstrap(input: BootstrapAdmin, context: RequestContext): Promise<Principal> {
    return this.db.transaction(async (tx) => {
      const existing = await tx.select({ id: users.id }).from(users).where(eq(users.platformRole, "NIQ_ADMIN")).limit(1);
      if (existing.length) throw new ServiceError("CONFLICT", "Bootstrap has already been completed.");
      const organizationId = createEntityId(); const userId = createEntityId(); const membershipId = createEntityId();
      await tx.insert(organizations).values({ id: organizationId, legalName: input.legalName, displayName: input.displayName, slug: input.slug, primaryColor: input.primaryColor, secondaryColor: input.secondaryColor, patientReferencePrefix: input.patientReferencePrefix });
      await tx.insert(users).values({ id: userId, email: normalizeEmail(input.adminEmail), displayName: input.adminDisplayName, passwordHash: await hashPassword(input.adminPassword), status: "ACTIVE", platformRole: "NIQ_ADMIN", mfaEnabled: true });
      await tx.insert(organizationMemberships).values({ id: membershipId, organizationId, userId, role: "ORGANIZATION_ADMIN" });
      await tx.insert(organizationEntitlements).values({ id: createEntityId(), organizationId, userLimit: input.userLimit, changedByMembershipId: membershipId, reason: "Initial NIQ bootstrap" });
      const principal: Principal = { userId, organizationId, membershipId, email: normalizeEmail(input.adminEmail), displayName: input.adminDisplayName, role: "ORGANIZATION_ADMIN", platformRole: "NIQ_ADMIN" };
      await this.audit(tx, organizationId, context, "PLATFORM_BOOTSTRAPPED", "organization", organizationId, principal);
      return principal;
    });
  }

  async listPlatformAdministrators(actor: Principal) {
    if (actor.platformRole !== "NIQ_ADMIN") throw new ServiceError("FORBIDDEN", "NIQ administrator access is required.");
    const [administratorUsers, pendingInvitations] = await Promise.all([
      this.db.select({
        userId: users.id,
        membershipId: organizationMemberships.id,
        email: users.email,
        displayName: users.displayName,
        status: users.status,
        active: organizationMemberships.isActive,
        createdAt: users.createdAt,
      }).from(users).innerJoin(organizationMemberships, and(
        eq(organizationMemberships.userId, users.id),
        eq(organizationMemberships.organizationId, actor.organizationId),
      )).where(eq(users.platformRole, "NIQ_ADMIN")).orderBy(users.displayName),
      this.db.select({
        invitationId: invitations.id,
        email: invitations.email,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      }).from(invitations).where(and(
        eq(invitations.organizationId, actor.organizationId),
        eq(invitations.platformRole, "NIQ_ADMIN"),
        eq(invitations.status, "PENDING"),
        gt(invitations.expiresAt, new Date()),
      )).orderBy(desc(invitations.createdAt)),
    ]);
    return [
      ...administratorUsers.map((administrator) => ({ kind: "USER" as const, ...administrator })),
      ...pendingInvitations.map((invitation) => ({ kind: "INVITATION" as const, ...invitation, status: "PENDING" as const })),
    ];
  }

  async invitePlatformAdministrator(actor: Principal, input: CreatePlatformAdministratorInvitation, context: RequestContext) {
    if (actor.platformRole !== "NIQ_ADMIN") throw new ServiceError("FORBIDDEN", "NIQ administrator access is required.");
    const token = randomToken();
    const invitationId = createEntityId();
    const email = normalizeEmail(input.email);
    const expiresAt = new Date(Date.now() + this.config.INVITATION_TTL_HOURS * 3_600_000);
    try {
      const invitation = await this.db.transaction(async (tx) => {
        await tx.update(invitations).set({ status: "EXPIRED", updatedAt: new Date() })
          .where(and(eq(invitations.email, email), eq(invitations.status, "PENDING"), sql`${invitations.expiresAt} <= now()`));
        const [existingUser, existingInvitation] = await Promise.all([
          tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1),
          tx.select({ id: invitations.id }).from(invitations).where(and(eq(invitations.email, email), eq(invitations.status, "PENDING"), gt(invitations.expiresAt, new Date()))).limit(1),
        ]);
        if (existingUser.length || existingInvitation.length) throw new ServiceError("CONFLICT", "This email is already associated with an account or pending invitation.");
        const [created] = await tx.insert(invitations).values({
          id: invitationId,
          organizationId: actor.organizationId,
          email,
          role: "ORGANIZATION_ADMIN",
          platformRole: "NIQ_ADMIN",
          tokenHash: await keyedHash(token, this.config.SESSION_SECRET),
          expiresAt,
          invitedByMembershipId: actor.membershipId,
        }).returning({ invitationId: invitations.id, email: invitations.email, expiresAt: invitations.expiresAt });
        if (!created) throw new Error("Platform administrator invitation insert failed");
        await this.audit(tx, actor.organizationId, context, "PLATFORM_ADMIN_INVITED", "invitation", invitationId, undefined, { actorUserId: actor.userId });
        return created;
      });
      return { invitation, token };
    } catch (error) {
      if (databaseCode(error) === "23505") throw new ServiceError("CONFLICT", "This email is already associated with an account or pending invitation.");
      throw error;
    }
  }

  async revokePlatformAdministratorInvitation(actor: Principal, invitationId: string, context: RequestContext) {
    if (actor.platformRole !== "NIQ_ADMIN") throw new ServiceError("FORBIDDEN", "NIQ administrator access is required.");
    await this.db.transaction(async (tx) => {
      const invite = await this.lockPlatformInvitation(tx, actor, invitationId);
      if (invite.status !== "PENDING" && invite.status !== "EXPIRED") throw new ServiceError("CONFLICT", "This invitation has already been accepted or revoked.");
      await tx.update(invitations).set({ status: "REVOKED", updatedAt: new Date() }).where(eq(invitations.id, invitationId));
      await this.audit(tx, actor.organizationId, context, "PLATFORM_ADMIN_INVITATION_REVOKED", "invitation", invitationId, actor);
    });
  }

  async regeneratePlatformAdministratorInvitation(actor: Principal, invitationId: string, context: RequestContext) {
    if (actor.platformRole !== "NIQ_ADMIN") throw new ServiceError("FORBIDDEN", "NIQ administrator access is required.");
    const token = randomToken();
    try {
      const invitation = await this.db.transaction(async (tx) => {
        const invite = await this.lockPlatformInvitation(tx, actor, invitationId);
        if (invite.status !== "PENDING" && invite.status !== "EXPIRED") throw new ServiceError("CONFLICT", "This invitation has already been accepted or revoked.");
        const [existingUser, otherInvitation] = await Promise.all([
          tx.select({ id: users.id }).from(users).where(eq(users.email, invite.email)).limit(1),
          tx.select({ id: invitations.id }).from(invitations).where(and(eq(invitations.email, invite.email), ne(invitations.id, invitationId), eq(invitations.status, "PENDING"))).limit(1),
        ]);
        if (existingUser.length || otherInvitation.length) throw new ServiceError("CONFLICT", "This email is already associated with an account or another pending invitation.");
        const expiresAt = new Date(Date.now() + this.config.INVITATION_TTL_HOURS * 3_600_000);
        const [updated] = await tx.update(invitations).set({ status: "PENDING", tokenHash: await keyedHash(token, this.config.SESSION_SECRET), expiresAt, updatedAt: new Date() })
          .where(eq(invitations.id, invitationId)).returning({ invitationId: invitations.id, email: invitations.email, expiresAt: invitations.expiresAt });
        if (!updated) throw new Error("Platform administrator invitation update failed");
        await this.audit(tx, actor.organizationId, context, "PLATFORM_ADMIN_INVITATION_REGENERATED", "invitation", invitationId, actor);
        return updated;
      });
      return { invitation, token };
    } catch (error) {
      if (databaseCode(error) === "23505") throw new ServiceError("CONFLICT", "Another pending invitation already exists for this email.");
      throw error;
    }
  }

  private async lockPlatformInvitation(tx: Transaction, actor: Principal, invitationId: string) {
    // Share the row lock used by acceptance so an accepted invite cannot be revived.
    const [invite] = await tx.select().from(invitations).where(and(
      eq(invitations.id, invitationId), eq(invitations.organizationId, actor.organizationId), eq(invitations.platformRole, "NIQ_ADMIN"),
    )).for("update").limit(1);
    if (!invite) throw new ServiceError("NOT_FOUND", "Administrator invitation not found.");
    return invite;
  }

  async setPlatformAdministratorActive(actor: Principal, membershipId: string, active: boolean, context: RequestContext) {
    if (actor.platformRole !== "NIQ_ADMIN") throw new ServiceError("FORBIDDEN", "NIQ administrator access is required.");
    if (membershipId === actor.membershipId && !active) throw new ServiceError("CONFLICT", "You cannot disable your own administrator access.");
    return this.db.transaction(async (tx) => {
      const [administrator] = await tx.select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        status: users.status,
        createdAt: users.createdAt,
      }).from(organizationMemberships).innerJoin(users, eq(users.id, organizationMemberships.userId)).where(and(
        eq(organizationMemberships.organizationId, actor.organizationId),
        eq(organizationMemberships.id, membershipId),
        eq(users.platformRole, "NIQ_ADMIN"),
      )).limit(1);
      if (!administrator) throw new ServiceError("NOT_FOUND", "NIQ administrator not found.");
      await tx.update(organizationMemberships).set({ isActive: active, updatedAt: new Date() }).where(eq(organizationMemberships.id, membershipId));
      if (!active) await tx.update(authSessions).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(authSessions.membershipId, membershipId), isNull(authSessions.revokedAt)));
      await this.audit(tx, actor.organizationId, context, active ? "PLATFORM_ADMIN_ENABLED" : "PLATFORM_ADMIN_DISABLED", "membership", membershipId, undefined, { actorUserId: actor.userId });
      return { kind: "USER" as const, membershipId, ...administrator, active };
    });
  }

  async createOrganization(actor: Principal, input: CreateOrganization, context: RequestContext) {
    if (actor.platformRole !== "NIQ_ADMIN") throw new ServiceError("FORBIDDEN", "NIQ administrator access is required.");
    const [created] = await this.db.insert(organizations).values({ id: createEntityId(), ...input }).returning();
    if (!created) throw new Error("Organization insert failed");
    await this.audit(this.db, created.id, context, "ORGANIZATION_CREATED", "organization", created.id, undefined, { actorUserId: actor.userId });
    return created;
  }
  async onboardOrganization(actor: Principal, input: OnboardOrganization, context: RequestContext) {
    if (actor.platformRole !== "NIQ_ADMIN") throw new ServiceError("FORBIDDEN", "NIQ administrator access is required.");
    const organizationId = createEntityId();
    const invitationId = createEntityId();
    const token = randomToken();
    const expiresAt = new Date(Date.now() + this.config.INVITATION_TTL_HOURS * 3_600_000);
    const email = normalizeEmail(input.firstAdminEmail);
    let logo: ReturnType<typeof decodeOrganizationLogo>;
    try {
      logo = decodeOrganizationLogo(input.logo);
    } catch (error) {
      if (error instanceof InvalidOrganizationLogoError) throw new ServiceError("VALIDATION_ERROR", error.message);
      throw error;
    }
    const logoAssetId = logo ? createEntityId() : null;

    try {
      return await this.db.transaction(async (tx) => {
        const existingOrganization = await tx.select({ id: organizations.id }).from(organizations)
          .where(sql`lower(btrim(${organizations.displayName})) = lower(btrim(${input.displayName}))`).limit(1);
        if (existingOrganization.length) throw new ServiceError("CONFLICT", "An organization with this name already exists.", { field: "name" });

        await tx.update(invitations).set({ status: "EXPIRED", updatedAt: new Date() })
          .where(and(eq(invitations.email, email), eq(invitations.status, "PENDING"), sql`${invitations.expiresAt} <= now()`));
        const existingUser = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
        const existingInvitation = await tx.select({ id: invitations.id }).from(invitations)
          .where(and(eq(invitations.email, email), eq(invitations.status, "PENDING"), gt(invitations.expiresAt, new Date()))).limit(1);
        if (existingUser.length || existingInvitation.length) throw new ServiceError("CONFLICT", "This email is already associated with an account or pending invitation.", { field: "email" });
        const [organization] = await tx.insert(organizations).values({
          id: organizationId,
          legalName: input.legalName,
          displayName: input.displayName,
          slug: input.slug,
          primaryColor: input.primaryColor,
          secondaryColor: input.secondaryColor,
          patientReferencePrefix: input.patientReferencePrefix,
          logoObjectKey: logoAssetId ? `database:${logoAssetId}` : null,
        }).returning();
        if (!organization) throw new Error("Organization insert failed");
        if (logo && logoAssetId) await tx.insert(organizationBrandAssets).values({ id: logoAssetId, organizationId, content: logo.data, mimeType: logo.mimeType, byteSize: logo.data.byteLength, sha256: logo.sha256 });
        await tx.insert(organizationEntitlements).values({
          id: createEntityId(),
          organizationId,
          userLimit: input.userLimit,
          reason: "Initial client onboarding",
        });
        const [invitation] = await tx.insert(invitations).values({
          id: invitationId,
          organizationId,
          email,
          role: "ORGANIZATION_ADMIN",
          tokenHash: await keyedHash(token, this.config.SESSION_SECRET),
          expiresAt,
        }).returning();
        if (!invitation) throw new Error("Invitation insert failed");
        await this.audit(tx, organizationId, context, "ORGANIZATION_ONBOARDED", "organization", organizationId, undefined, {
          actorUserId: actor.userId,
          firstAdminInvitationId: invitationId,
        });
        return { organization, invitation, token };
      });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (databaseCode(error) === "23505") throw new ServiceError("CONFLICT", "The organization name or administrator email is already in use.");
      if (databaseCode(error) === "23514" && String(error).includes("user limit")) throw new ServiceError("USER_LIMIT_REACHED", "The organization user limit must allow its first administrator.");
      throw error;
    }
  }
  async listOrganizations(actor: Principal) {
    if (actor.platformRole === "NIQ_ADMIN") return this.db.select().from(organizations).where(ne(organizations.id, actor.organizationId)).orderBy(organizations.displayName);
    return this.db.select().from(organizations).where(eq(organizations.id, actor.organizationId));
  }
  async getOrganization(actor: Principal, organizationId: string) {
    this.ensureOrganizationAccess(actor, organizationId);
    const [organization] = await this.db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!organization) throw new ServiceError("NOT_FOUND", "Organization not found.");
    const [entitlements, organizationInvitations, scoringConnectionsForOrganization] = await Promise.all([
      this.db.select({
        userLimit: organizationEntitlements.userLimit,
        effectiveFrom: organizationEntitlements.effectiveFrom,
      }).from(organizationEntitlements).where(and(
        eq(organizationEntitlements.organizationId, organizationId),
        sql`${organizationEntitlements.effectiveFrom} <= now()`,
        sql`(${organizationEntitlements.effectiveUntil} IS NULL OR ${organizationEntitlements.effectiveUntil} > now())`,
      )).orderBy(desc(organizationEntitlements.effectiveFrom), desc(organizationEntitlements.createdAt)).limit(1),
      this.db.select({ id: invitations.id, email: invitations.email, role: invitations.role, status: invitations.status, expiresAt: invitations.expiresAt })
        .from(invitations).where(eq(invitations.organizationId, organizationId)).orderBy(desc(invitations.createdAt)),
      this.db.select({ deploymentId: scoringConnections.deploymentId, scoringOrganizationId: scoringConnections.scoringOrganizationId, keyVersion: scoringConnections.keyVersion, activatedAt: scoringConnections.activatedAt })
        .from(scoringConnections).where(eq(scoringConnections.organizationId, organizationId)).limit(1),
    ]);
    return {
      organization,
      entitlement: entitlements[0] ?? null,
      invitations: organizationInvitations,
      scoringConnection: scoringConnectionsForOrganization[0] ?? null,
    };
  }

  async getOrganizationBySlug(actor: Principal, organizationSlug: string) {
    if (actor.platformRole !== "NIQ_ADMIN") {
      const [actorOrganization] = await this.db.select({ id: organizations.id, slug: organizations.slug }).from(organizations).where(eq(organizations.id, actor.organizationId)).limit(1);
      if (!actorOrganization || actorOrganization.slug !== organizationSlug) {
        throw new ServiceError("FORBIDDEN", "You do not have access to this organization.");
      }
      return this.getOrganization(actor, actorOrganization.id);
    }
    const [organization] = await this.db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, organizationSlug)).limit(1);
    if (!organization) throw new ServiceError("NOT_FOUND", "Organization not found.");
    return this.getOrganization(actor, organization.id);
  }

  async getOrganizationLogo(actor: Principal, organizationId: string) {
    this.ensureOrganizationAccess(actor, organizationId);
    const [asset] = await this.db.select({ data: organizationBrandAssets.content, mimeType: organizationBrandAssets.mimeType, etag: organizationBrandAssets.sha256 }).from(organizationBrandAssets).where(eq(organizationBrandAssets.organizationId, organizationId)).limit(1);
    if (!asset) throw new ServiceError("NOT_FOUND", "Organization logo not found.");
    return asset;
  }
  async getScoringOrganizationInfo(actor: Principal, organizationId: string, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, "scoring.manage");
    if (!this.config.SCORING_API_URL || !this.config.SCORING_CREDENTIAL_ENCRYPTION_KEY) {
      throw new ServiceError("SCORING_NOT_CONFIGURED", "NIQ Scoring is not configured for this application installation.");
    }
    const [connection] = await this.db.select({
      encryptedCredential: scoringConnections.encryptedCredential,
      credentialIv: scoringConnections.credentialIv,
    }).from(scoringConnections).where(eq(scoringConnections.organizationId, organizationId)).limit(1);
    if (!connection) throw new ServiceError("NOT_FOUND", "This organization is not connected to NIQ Scoring.");

    let credential: string;
    try {
      credential = decryptCredential(connection.encryptedCredential, connection.credentialIv, this.config.SCORING_CREDENTIAL_ENCRYPTION_KEY);
    } catch {
      throw new ServiceError("SCORING_UNAVAILABLE", "The saved NIQ Scoring connection could not be opened.");
    }

    try {
      return await requestScoringOrganizationInfo({
        baseUrl: this.config.SCORING_API_URL,
        credential,
        requestId: context.requestId,
        timeoutMs: this.config.SCORING_TIMEOUT_MS,
      });
    } catch (error) {
      if (error instanceof ScoringOrganizationInfoRequestError) {
        if (error.reason === "unauthorized") throw new ServiceError("INVALID_OR_EXPIRED_TOKEN", "The NIQ Scoring connection has expired or was revoked. Reconnect it to continue.");
        if (error.reason === "disabled") throw new ServiceError("SCORING_UNAVAILABLE", "This organization or its NIQ Scoring deployment is disabled.");
        if (error.reason === "incomplete") throw new ServiceError("SCORING_UNAVAILABLE", "NIQ Scoring configuration is incomplete.");
      }
      throw new ServiceError("SCORING_UNAVAILABLE", "NIQ Scoring information could not be loaded.");
    }
  }
  async activateScoring(actor: Principal, organizationId: string, input: ActivateScoring, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, "scoring.manage");
    if (!this.config.SCORING_API_URL || !this.config.SCORING_CREDENTIAL_ENCRYPTION_KEY) {
      throw new ServiceError("SCORING_NOT_CONFIGURED", "NIQ Scoring is not configured for this application installation.");
    }
    const [organization] = await this.db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!organization) throw new ServiceError("NOT_FOUND", "Organization not found.");

    let response: Response;
    try {
      response = await fetch(new URL("/v1/activate", this.config.SCORING_API_URL), {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": context.requestId },
        body: JSON.stringify({ ...input, clientReference: organizationId }),
        signal: AbortSignal.timeout(this.config.SCORING_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceError("SCORING_UNAVAILABLE", "The scoring service could not be reached.");
    }
    if (response.status === 401) throw new ServiceError("INVALID_OR_EXPIRED_TOKEN", "The scoring activation token is invalid or expired.");
    if (!response.ok) throw new ServiceError("SCORING_UNAVAILABLE", "The scoring service could not complete activation.");
    const parsed = scoringActivationResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new ServiceError("SCORING_UNAVAILABLE", "The scoring service returned an invalid activation response.");

    const encrypted = encryptCredential(parsed.data.credential, this.config.SCORING_CREDENTIAL_ENCRYPTION_KEY);
    const activatedAt = new Date();
    const [connection] = await this.db.insert(scoringConnections).values({
      id: createEntityId(), organizationId, deploymentId: parsed.data.deploymentId, scoringOrganizationId: parsed.data.clientId,
      encryptedCredential: encrypted.ciphertext, credentialIv: encrypted.iv,
      keyVersion: this.config.SCORING_CREDENTIAL_KEY_VERSION, activatedAt,
    }).onConflictDoUpdate({
      target: scoringConnections.organizationId,
      set: { deploymentId: parsed.data.deploymentId, scoringOrganizationId: parsed.data.clientId, encryptedCredential: encrypted.ciphertext, credentialIv: encrypted.iv, keyVersion: this.config.SCORING_CREDENTIAL_KEY_VERSION, activatedAt, updatedAt: activatedAt },
    }).returning({ deploymentId: scoringConnections.deploymentId, scoringOrganizationId: scoringConnections.scoringOrganizationId, keyVersion: scoringConnections.keyVersion, activatedAt: scoringConnections.activatedAt });
    await this.audit(this.db, organizationId, context, "SCORING_CONNECTION_ACTIVATED", "scoring_connection", connection?.deploymentId, undefined, { actorUserId: actor.userId, keyVersion: this.config.SCORING_CREDENTIAL_KEY_VERSION });
    return { connection };
  }
  async disconnectScoring(actor: Principal, organizationId: string, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, "scoring.manage");
    await this.db.transaction(async (tx) => {
      const [connection] = await tx.select({ deploymentId: scoringConnections.deploymentId })
        .from(scoringConnections).where(eq(scoringConnections.organizationId, organizationId)).limit(1);
      if (!connection) throw new ServiceError("NOT_FOUND", "This organization is not connected to NIQ Scoring.");
      await tx.delete(scoringConnections).where(eq(scoringConnections.organizationId, organizationId));
      await this.audit(tx, organizationId, context, "SCORING_CONNECTION_DISCONNECTED", "scoring_connection", connection.deploymentId, undefined, { actorUserId: actor.userId });
    });
  }
  async updateOrganization(actor: Principal, organizationId: string, input: UpdateOrganization, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, "organization.manage");
    const { logo: upload, ...settings } = input;
    let logo: ReturnType<typeof decodeOrganizationLogo>;
    try {
      logo = decodeOrganizationLogo(upload ?? null);
    } catch (error) {
      if (error instanceof InvalidOrganizationLogoError) throw new ServiceError("VALIDATION_ERROR", error.message);
      throw error;
    }
    return this.db.transaction(async (tx) => {
      // Lock the organization so concurrent logo replacements remain consistent with its cache key.
      const [existing] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).for("update");
      if (!existing) throw new ServiceError("NOT_FOUND", "Organization not found.");
      if (logo) {
        const assetId = createEntityId();
        const values = { content: logo.data, mimeType: logo.mimeType, byteSize: logo.data.byteLength, sha256: logo.sha256, updatedAt: new Date() };
        await tx.insert(organizationBrandAssets).values({ id: assetId, organizationId, ...values })
          .onConflictDoUpdate({ target: organizationBrandAssets.organizationId, set: { ...values, id: assetId } });
        settings.logoObjectKey = `database:${assetId}`;
      }
      const [result] = await tx.update(organizations).set({ ...settings, updatedAt: new Date() }).where(eq(organizations.id, organizationId)).returning();
      await this.audit(tx, organizationId, context, "ORGANIZATION_UPDATED", "organization", organizationId, actor, { fields: Object.keys(input) });
      return result;
    });
  }
  async createFacility(actor: Principal, organizationId: string, input: CreateFacility, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, "facilities.manage");
    const [result] = await this.db.insert(facilities).values({ id: createEntityId(), organizationId, ...input, code: input.code.toUpperCase() }).returning();
    await this.audit(this.db, organizationId, context, "FACILITY_CREATED", "facility", result?.id, actor); return result;
  }
  async listFacilities(actor: Principal, organizationId: string) {
    this.ensureOrganizationAccess(actor, organizationId, "facilities.read");
    return this.db.select().from(facilities).where(and(eq(facilities.organizationId, organizationId), facilityAccessCondition(actor, organizationId, facilities.id))).orderBy(facilities.name);
  }
  async getFacilityPerformance(actor: Principal, organizationId: string, facilityId: string) {
    this.ensureOrganizationAccess(actor, organizationId, "users.manage");
    const [facility] = await this.db.select({ id: facilities.id, timezone: facilities.timezone }).from(facilities)
      .where(and(eq(facilities.organizationId, organizationId), eq(facilities.id, facilityId), facilityAccessCondition(actor, organizationId, facilities.id))).limit(1);
    if (!facility) throw new ServiceError("NOT_FOUND", "Facility not found.");
    const [completed, scans] = await Promise.all([
      this.db.select({ completedAt: assessments.completedAt }).from(assessments)
        .where(and(eq(assessments.organizationId, organizationId), eq(assessments.facilityId, facilityId), eq(assessments.status, "COMPLETED"))),
      this.db.select({ projection: assessmentFaceScans.projection }).from(assessmentFaceScans)
        .innerJoin(assessments, and(eq(assessments.organizationId, assessmentFaceScans.organizationId), eq(assessments.id, assessmentFaceScans.assessmentId)))
        .where(and(eq(assessmentFaceScans.organizationId, organizationId), eq(assessments.facilityId, facilityId), eq(assessmentFaceScans.state, "COMPLETED"))),
    ]);
    const key = patientDataKey(this.config.PATIENT_DATA_ENCRYPTION_KEY, this.config.SESSION_SECRET);
    const scanDates = scans.flatMap(({ projection }) => {
      const encrypted = (projection as { encrypted?: string } | null)?.encrypted;
      if (!encrypted) throw new ServiceError("CONFLICT", "Scan completion data could not be read.");
      const session = faceScanSessionSchema.parse(JSON.parse(decryptPatientData(Buffer.from(encrypted, "base64"), key)));
      if (!session.completedAt) throw new ServiceError("CONFLICT", "Scan completion date could not be read.");
      return [new Date(session.completedAt)];
    });
    const now = new Date();
    return {
      timezone: facility.timezone,
      assessments: facilityTrend(completed.flatMap(row => row.completedAt ? [row.completedAt] : []), now, facility.timezone),
      faceScans: facilityTrend(scanDates, now, facility.timezone),
    };
  }
  async updateFacility(actor: Principal, organizationId: string, facilityId: string, input: UpdateFacility, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, "facilities.manage");
    const values = { ...input, ...(input.code ? { code: input.code.toUpperCase() } : {}), updatedAt: new Date() };
    const [result] = await this.db.update(facilities).set(values).where(and(eq(facilities.organizationId, organizationId), eq(facilities.id, facilityId), facilityAccessCondition(actor, organizationId, facilities.id))).returning();
    if (!result) throw new ServiceError("NOT_FOUND", "Facility not found.");
    await this.audit(this.db, organizationId, context, "FACILITY_UPDATED", "facility", facilityId, actor, { fields: Object.keys(input) }); return result;
  }
  async updatePatient(actor: Principal, organizationId: string, patientLocator: string, input: UpdatePatient, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, "patients.edit");
    return this.presentPatient(await editPatient(this.db, this.config, actor, organizationId, patientLocator, input, context));
  }
  async updateOrganizationUser(actor: Principal, organizationId: string, membershipId: string, input: UpdateOrganizationUser, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, "users.manage");
    return editOrganizationUser(this.db, actor, organizationId, membershipId, input, context);
  }
  async createPatient(actor: Principal, organizationId: string, input: RegisterPatient, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, "patients.create");
    const key = patientDataKey(this.config.PATIENT_DATA_ENCRYPTION_KEY, this.config.SESSION_SECRET);
    const normalizedReference = input.medicalRecordNumber.trim().toUpperCase();
    const profile = JSON.stringify({
      name: input.name,
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.email ? { email: input.email } : {}),
    });
    try {
      return await this.db.transaction(async (tx) => {
        const [facility] = await tx.select({ id: facilities.id, name: facilities.name }).from(facilities)
          .where(and(eq(facilities.organizationId, organizationId), eq(facilities.id, input.homeFacilityId), eq(facilities.status, "ACTIVE"), facilityAccessCondition(actor, organizationId, facilities.id))).limit(1);
        if (!facility) throw new ServiceError("NOT_FOUND", "Facility not found or inactive.");
        const [created] = await tx.insert(patients).values({
          id: createEntityId(),
          organizationId,
          homeFacilityId: facility.id,
          encryptedExternalReference: encryptPatientData(normalizedReference, key),
          externalReferenceLookupHash: await keyedHash(normalizedReference, key.toString("base64")),
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          encryptedProfile: encryptPatientData(profile, key),
          encryptionKeyVersion: this.config.PATIENT_DATA_KEY_VERSION,
        }).returning();
        if (!created) throw new ServiceError("INTERNAL_ERROR", "The patient could not be created.");
        await this.audit(tx, organizationId, context, "PATIENT_CREATED", "patient", created.id, actor, { facilityId: facility.id });
        return this.presentPatient({ ...created, facilityId: facility.id, facilityName: facility.name });
      });
    } catch (error) {
      if (databaseCode(error) === "23505") throw new ServiceError("CONFLICT", "A patient with this medical record number already exists in this organization.");
      throw error;
    }
  }
  async listPatients(actor: Principal, organizationId: string) {
    this.ensureOrganizationAccess(actor, organizationId, "patients.read");
    const rows = await this.db.select({
      id: patients.id,
      organizationId: patients.organizationId,
      referencePrefix: patients.referencePrefix,
      serialNumber: patients.serialNumber,
      dateOfBirth: patients.dateOfBirth,
      gender: patients.gender,
      encryptedProfile: patients.encryptedProfile,
      encryptedExternalReference: patients.encryptedExternalReference,
      facilityId: facilities.id,
      facilityName: facilities.name,
      createdAt: patients.createdAt,
      updatedAt: patients.updatedAt,
    }).from(patients).leftJoin(facilities, and(eq(facilities.organizationId, patients.organizationId), eq(facilities.id, patients.homeFacilityId)))
      .where(and(eq(patients.organizationId, organizationId), eq(patients.isArchived, false), facilityAccessCondition(actor, organizationId, patients.homeFacilityId))).orderBy(desc(patients.createdAt));
    return rows.map((row) => this.presentPatient(row));
  }
  async getPatient(actor: Principal, organizationId: string, patientLocator: string) {
    this.ensureOrganizationAccess(actor, organizationId, "patients.read");
    const reference = /^([A-Z][A-Z0-9]{1,11})-([1-9]\d{0,9})$/.exec(patientLocator);
    const patientMatch = reference
      ? and(eq(patients.referencePrefix, reference[1]!), eq(patients.serialNumber, Number(reference[2])))
      : eq(patients.id, patientLocator);
    const [row] = await this.db.select({
      id: patients.id,
      organizationId: patients.organizationId,
      referencePrefix: patients.referencePrefix,
      serialNumber: patients.serialNumber,
      dateOfBirth: patients.dateOfBirth,
      gender: patients.gender,
      encryptedProfile: patients.encryptedProfile,
      encryptedExternalReference: patients.encryptedExternalReference,
      facilityId: facilities.id,
      facilityName: facilities.name,
      createdAt: patients.createdAt,
      updatedAt: patients.updatedAt,
    }).from(patients).leftJoin(facilities, and(eq(facilities.organizationId, patients.organizationId), eq(facilities.id, patients.homeFacilityId)))
      .where(and(eq(patients.organizationId, organizationId), patientMatch, eq(patients.isArchived, false), facilityAccessCondition(actor, organizationId, patients.homeFacilityId))).limit(1);
    if (!row) throw new ServiceError("NOT_FOUND", "Patient not found.");
    return this.presentPatient(row);
  }
  async listAssessments(actor: Principal, organizationId: string) {
    this.ensureOrganizationAccess(actor, organizationId, "assessments.list");
    const rows = await this.db.select({
      id: assessments.id,
      serialNumber: assessments.serialNumber,
      organizationId: assessments.organizationId,
      patientId: patients.id,
      patientReferencePrefix: patients.referencePrefix,
      patientSerialNumber: patients.serialNumber,
      patientEncryptedProfile: patients.encryptedProfile,
      facilityId: facilities.id,
      facilityName: facilities.name,
      status: assessments.status,
      createdAt: assessments.createdAt,
      completedAt: assessments.completedAt,
    }).from(assessments)
      .innerJoin(patients, and(eq(patients.organizationId, assessments.organizationId), eq(patients.id, assessments.patientId)))
      .leftJoin(facilities, and(eq(facilities.organizationId, assessments.organizationId), eq(facilities.id, assessments.facilityId)))
      .where(and(eq(assessments.organizationId, organizationId), facilityAccessCondition(actor, organizationId, assessments.facilityId)))
      .orderBy(desc(assessments.createdAt));
    const key = patientDataKey(this.config.PATIENT_DATA_ENCRYPTION_KEY, this.config.SESSION_SECRET);
    return rows.map((row) => ({
      id: row.id,
      reference: formatAssessmentReference(row.serialNumber),
      serialNumber: row.serialNumber,
      organizationId: row.organizationId,
      patient: {
        id: row.patientId,
        reference: `${row.patientReferencePrefix}-${row.patientSerialNumber}`,
        displayName: patientProfileSchema.parse(JSON.parse(decryptPatientData(row.patientEncryptedProfile, key))).name,
      },
      facility: row.facilityId && row.facilityName ? { id: row.facilityId, name: row.facilityName } : null,
      status: row.status,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
    }));
  }
  async invitationAccess(actor: Principal, organizationId: string) {
    this.ensureOrganizationAccess(actor, organizationId, "users.manage");
    if (actor.platformRole === "NIQ_ADMIN") return { allFacilities: true };
    const assigned = await this.db.select({ id: facilityMemberships.facilityId }).from(facilityMemberships)
      .where(and(eq(facilityMemberships.organizationId, organizationId), eq(facilityMemberships.organizationMembershipId, actor.membershipId)));
    return { allFacilities: assigned.length === 0 };
  }

  async manageUserInvitation(actor: Principal, organizationId: string, invitationId: string, action: "revoke" | "regenerate", context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, "users.manage");
    const token = action === "regenerate" ? randomToken() : undefined;
    try {
      const invitation = await this.db.transaction(async (tx) => {
        // Acceptance takes the same invitation lock, preventing accepted links being revived.
        const [invite] = await tx.select().from(invitations).where(and(eq(invitations.id, invitationId), eq(invitations.organizationId, organizationId), eq(invitations.platformRole, "USER"))).for("update").limit(1);
        if (!invite) throw new ServiceError("NOT_FOUND", "Invitation not found.");
        if (invite.status !== "PENDING" && invite.status !== "EXPIRED") throw new ServiceError("CONFLICT", "This invitation has already been accepted or revoked.");
        if (actor.platformRole !== "NIQ_ADMIN") {
          const assigned = await tx.select({ facilityId: facilityMemberships.facilityId }).from(facilityMemberships).where(and(eq(facilityMemberships.organizationId, organizationId), eq(facilityMemberships.organizationMembershipId, actor.membershipId)));
          if (assigned.length) {
            const targets = await tx.select({ facilityId: invitationFacilities.facilityId }).from(invitationFacilities).where(and(eq(invitationFacilities.organizationId, organizationId), eq(invitationFacilities.invitationId, invitationId)));
            if (!targets.length || targets.some((target) => !assigned.some((item) => item.facilityId === target.facilityId))) throw new ServiceError("FORBIDDEN", "You can manage invitations only for your assigned facilities.");
          }
        }
        if (token) {
          const [accounts, pending] = await Promise.all([
            tx.select({ id: users.id }).from(users).where(eq(users.email, invite.email)).limit(1),
            tx.select({ id: invitations.id }).from(invitations).where(and(eq(invitations.email, invite.email), ne(invitations.id, invitationId), eq(invitations.status, "PENDING"), gt(invitations.expiresAt, new Date()))).limit(1),
          ]);
          if (accounts.length || pending.length) throw new ServiceError("CONFLICT", "This email already has an account or another invitation.");
          // Release only this email's stale unique reservation. Touching every expired
          // row here can deadlock with another invitation being renewed concurrently.
          await tx.update(invitations).set({ status: "EXPIRED", updatedAt: new Date() }).where(and(eq(invitations.organizationId, organizationId), eq(invitations.email, invite.email), ne(invitations.id, invitationId), eq(invitations.status, "PENDING"), sql`${invitations.expiresAt} <= now()`));
        }
        const [updated] = await tx.update(invitations).set(token
          ? { status: "PENDING", tokenHash: await keyedHash(token, this.config.SESSION_SECRET), expiresAt: new Date(Date.now() + this.config.INVITATION_TTL_HOURS * 3_600_000), updatedAt: new Date() }
          : { status: "REVOKED", updatedAt: new Date() }).where(eq(invitations.id, invitationId)).returning({ id: invitations.id, email: invitations.email, expiresAt: invitations.expiresAt });
        await this.audit(tx, organizationId, context, token ? "USER_INVITATION_REGENERATED" : "USER_INVITATION_REVOKED", "invitation", invitationId, actor);
        return updated;
      });
      return { invitation, token };
    } catch (error) {
      if (databaseCode(error) === "23514" && String(error).includes("user limit")) throw new ServiceError("USER_LIMIT_REACHED", "The organization user limit has been reached.");
      if (databaseCode(error) === "23505") throw new ServiceError("CONFLICT", "Another invitation already exists for this email.");
      throw error;
    }
  }

  async inviteUser(actor: Principal, organizationId: string, input: CreateInvitation, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, "users.manage"); const token = randomToken(); const invitationId = createEntityId();
    if (actor.platformRole !== "NIQ_ADMIN") {
      const assigned = await this.db.select({ facilityId: facilityMemberships.facilityId }).from(facilityMemberships)
        .where(and(eq(facilityMemberships.organizationId, organizationId), eq(facilityMemberships.organizationMembershipId, actor.membershipId)));
      if (assigned.length && (!input.facilityIds.length || input.facilityIds.some((id) => !assigned.some((item) => item.facilityId === id)))) {
        throw new ServiceError("FORBIDDEN", "You can invite users only to your assigned facilities.");
      }
    }
    try {
      const invitation = await this.db.transaction(async (tx) => {
        // Clear this email's stale unique reservation. The capacity trigger excludes
        // expired links without requiring writes to unrelated invitations.
        await tx.update(invitations).set({ status: "EXPIRED", updatedAt: new Date() }).where(and(eq(invitations.organizationId, organizationId), eq(invitations.email, normalizeEmail(input.email)), eq(invitations.status, "PENDING"), sql`${invitations.expiresAt} <= now()`));
        if (input.facilityIds.length) {
          const valid = await tx.select({ id: facilities.id }).from(facilities).where(and(eq(facilities.organizationId, organizationId), inArray(facilities.id, input.facilityIds)));
          if (valid.length !== input.facilityIds.length) throw new ServiceError("NOT_FOUND", "One or more facilities were not found.");
        }
        const [created] = await tx.insert(invitations).values({ id: invitationId, organizationId, email: normalizeEmail(input.email), role: input.role, tokenHash: await keyedHash(token, this.config.SESSION_SECRET), expiresAt: new Date(Date.now() + this.config.INVITATION_TTL_HOURS * 3_600_000), invitedByMembershipId: actor.membershipId }).returning();
        if (input.facilityIds.length) await tx.insert(invitationFacilities).values(input.facilityIds.map((facilityId) => ({ id: createEntityId(), organizationId, invitationId, facilityId })));
        await this.audit(tx, organizationId, context, "USER_INVITED", "invitation", invitationId, actor, { role: input.role, facilityCount: input.facilityIds.length }); return created;
      });
      return { invitation, token };
    } catch (error) {
      if (databaseCode(error) === "23514" && String(error).includes("user limit")) throw new ServiceError("USER_LIMIT_REACHED", "The organization user limit has been reached.");
      if (databaseCode(error) === "23505") throw new ServiceError("CONFLICT", "A pending invitation or account already exists."); throw error;
    }
  }
  async listUsers(actor: Principal, organizationId: string) {
    this.ensureOrganizationAccess(actor, organizationId, "users.manage");
    const records = await this.db.select({ membershipId: organizationMemberships.id, userId: users.id, email: users.email, displayName: users.displayName, status: users.status, role: organizationMemberships.role, active: organizationMemberships.isActive, createdAt: organizationMemberships.createdAt })
      .from(organizationMemberships).innerJoin(users, eq(users.id, organizationMemberships.userId)).where(eq(organizationMemberships.organizationId, organizationId)).orderBy(users.displayName);
    const assignments = await this.db.select({ membershipId: facilityMemberships.organizationMembershipId, id: facilities.id, name: facilities.name }).from(facilityMemberships).innerJoin(facilities, and(eq(facilities.id, facilityMemberships.facilityId), eq(facilities.organizationId, facilityMemberships.organizationId))).where(eq(facilityMemberships.organizationId, organizationId));
    return records.map((record) => ({ ...record, facilities: assignments.filter((item) => item.membershipId === record.membershipId).map(({ id, name }) => ({ id, name })) }));
  }
  async setUserActive(actor: Principal, organizationId: string, membershipId: string, active: boolean, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, "users.manage");
    if (membershipId === actor.membershipId && !active) throw new ServiceError("CONFLICT", "You cannot deactivate your own membership.");
    try {
      return await this.db.transaction(async (tx) => {
        // Serialize access changes without blocking the foreign-key locks used by
        // invitation acceptance while the quota advisory lock is held.
        await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).for("no key update");
        const [target] = await tx.select().from(organizationMemberships).where(and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.id, membershipId))).limit(1);
        if (!target) throw new ServiceError("NOT_FOUND", "User membership not found.");
        if (!active && target.role === "ORGANIZATION_ADMIN" && target.isActive) {
          const remaining = await tx.select({ id: organizationMemberships.id }).from(organizationMemberships).innerJoin(users, eq(users.id, organizationMemberships.userId)).where(and(eq(organizationMemberships.organizationId, organizationId), ne(organizationMemberships.id, membershipId), eq(organizationMemberships.role, "ORGANIZATION_ADMIN"), eq(organizationMemberships.isActive, true), eq(users.status, "ACTIVE")));
          if (!remaining.length) throw new ServiceError("CONFLICT", "Keep at least one enabled organization administrator.");
        }
        const [result] = await tx.update(organizationMemberships).set({ isActive: active, updatedAt: new Date() }).where(eq(organizationMemberships.id, membershipId)).returning();
        if (!active) await tx.update(authSessions).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(authSessions.organizationId, organizationId), eq(authSessions.membershipId, membershipId), isNull(authSessions.revokedAt)));
        await this.audit(tx, organizationId, context, active ? "USER_REACTIVATED" : "USER_DEACTIVATED", "membership", membershipId, actor);
        return result;
      });
    } catch (error) {
      if (databaseCode(error) === "23514" && String(error).includes("user limit")) throw new ServiceError("USER_LIMIT_REACHED", "The organization user limit has been reached."); throw error;
    }
  }
}
