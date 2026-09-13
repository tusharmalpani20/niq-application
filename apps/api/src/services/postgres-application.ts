import type { ApplicationConfig } from "@niq/application-config";
import type { AcceptInvitation, BootstrapAdmin, CreateFacility, CreateInvitation, CreateOrganization, OnboardOrganization, ResendMfaRequest, SignInRequest, UpdateFacility, UpdateOrganization, VerifyMfaRequest } from "@niq/application-contracts";
import { createEntityId, normalizeEmail, requiresMfa } from "@niq/application-domain";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  auditEvents,
  authenticationFailures,
  authSessions,
  facilities,
  facilityMemberships,
  invitationFacilities,
  invitations,
  mfaChallenges,
  organizationEntitlements,
  organizationMemberships,
  organizations,
  users,
} from "../db/schema";
import { hashPassword, keyedHash, randomOtp, randomToken, secureEqual, verifyPassword } from "../security/tokens";
import type { ApplicationService, MfaChallengeResult, OtpDelivery, Principal, RequestContext, SessionResult, SignInResult } from "./application";
import { ServiceError } from "./application";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

function databaseCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

export class PostgresApplicationService implements ApplicationService {
  constructor(private readonly db: Database, private readonly config: ApplicationConfig, private readonly otpDelivery: OtpDelivery) {}

  private async audit(executor: Executor, organizationId: string, context: RequestContext, action: string, resourceType: string, resourceId?: string, actor?: Principal, metadata: Record<string, unknown> = {}) {
    await executor.insert(auditEvents).values({
      id: createEntityId(), organizationId, actorMembershipId: actor?.membershipId, actorType: actor ? "USER" : "SYSTEM",
      action, resourceType, resourceId, requestId: context.requestId,
      ipAddressHash: context.ipAddress ? await keyedHash(context.ipAddress, this.config.SESSION_SECRET) : undefined,
      metadata,
    });
  }

  private ensureOrganizationAccess(actor: Principal, organizationId: string, admin = false) {
    if (actor.platformRole === "NIQ_ADMIN") return;
    if (actor.organizationId !== organizationId || (admin && actor.role !== "ORGANIZATION_ADMIN")) {
      throw new ServiceError("FORBIDDEN", "You do not have access to this organization.");
    }
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
      const otp = randomOtp();
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
    const otp = randomOtp();
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
      await tx.insert(users).values({ id: userId, email, displayName: input.displayName, passwordHash: await hashPassword(input.password), status: "ACTIVE", mfaEnabled: invite.role === "ORGANIZATION_ADMIN" });
      await tx.update(invitations).set({ status: "ACCEPTED", acceptedAt: new Date(), updatedAt: new Date() }).where(eq(invitations.id, invite.id));
      await tx.insert(organizationMemberships).values({ id: membershipId, organizationId: invite.organizationId, userId, role: invite.role });
      const assigned = await tx.select().from(invitationFacilities).where(eq(invitationFacilities.invitationId, invite.id));
      if (assigned.length) await tx.insert(facilityMemberships).values(assigned.map((item) => ({ id: createEntityId(), organizationId: invite.organizationId, organizationMembershipId: membershipId, facilityId: item.facilityId })));
      const principal: Principal = { userId, organizationId: invite.organizationId, membershipId, email, displayName: input.displayName, role: invite.role, platformRole: "USER" };
      await this.audit(tx, invite.organizationId, context, "INVITATION_ACCEPTED", "invitation", invite.id, principal);
      return principal;
    });
  }

  async bootstrap(input: BootstrapAdmin, context: RequestContext): Promise<Principal> {
    return this.db.transaction(async (tx) => {
      const existing = await tx.select({ id: users.id }).from(users).where(eq(users.platformRole, "NIQ_ADMIN")).limit(1);
      if (existing.length) throw new ServiceError("CONFLICT", "Bootstrap has already been completed.");
      const organizationId = createEntityId(); const userId = createEntityId(); const membershipId = createEntityId();
      await tx.insert(organizations).values({ id: organizationId, legalName: input.legalName, displayName: input.displayName, slug: input.slug, primaryColor: input.primaryColor, secondaryColor: input.secondaryColor });
      await tx.insert(users).values({ id: userId, email: normalizeEmail(input.adminEmail), displayName: input.adminDisplayName, passwordHash: await hashPassword(input.adminPassword), status: "ACTIVE", platformRole: "NIQ_ADMIN", mfaEnabled: true });
      await tx.insert(organizationMemberships).values({ id: membershipId, organizationId, userId, role: "ORGANIZATION_ADMIN" });
      await tx.insert(organizationEntitlements).values({ id: createEntityId(), organizationId, userLimit: input.userLimit, changedByMembershipId: membershipId, reason: "Initial NIQ bootstrap" });
      const principal: Principal = { userId, organizationId, membershipId, email: normalizeEmail(input.adminEmail), displayName: input.adminDisplayName, role: "ORGANIZATION_ADMIN", platformRole: "NIQ_ADMIN" };
      await this.audit(tx, organizationId, context, "PLATFORM_BOOTSTRAPPED", "organization", organizationId, principal);
      return principal;
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

    try {
      return await this.db.transaction(async (tx) => {
        const existingUser = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
        if (existingUser.length) throw new ServiceError("CONFLICT", "An account already exists for the first administrator email.");
        const [organization] = await tx.insert(organizations).values({
          id: organizationId,
          legalName: input.legalName,
          displayName: input.displayName,
          slug: input.slug,
          primaryColor: input.primaryColor,
          secondaryColor: input.secondaryColor,
          deploymentMode: input.deploymentMode,
          scoringEnabled: input.scoringEnabled,
          faceScanEnabled: input.faceScanEnabled,
        }).returning();
        if (!organization) throw new Error("Organization insert failed");
        await tx.insert(organizationEntitlements).values({
          id: createEntityId(),
          organizationId,
          userLimit: input.userLimit,
          scoringMonthlyLimit: input.scoringMonthlyLimit,
          faceScanMonthlyLimit: input.faceScanMonthlyLimit,
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
          deploymentMode: input.deploymentMode,
          firstAdminInvitationId: invitationId,
        });
        return { organization, invitation, token };
      });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (databaseCode(error) === "23505") throw new ServiceError("CONFLICT", "The organization slug or administrator email is already in use.");
      if (databaseCode(error) === "23514" && String(error).includes("user limit")) throw new ServiceError("USER_LIMIT_REACHED", "The organization user limit must allow its first administrator.");
      throw error;
    }
  }
  async listOrganizations(actor: Principal) {
    if (actor.platformRole === "NIQ_ADMIN") return this.db.select().from(organizations).orderBy(organizations.displayName);
    return this.db.select().from(organizations).where(eq(organizations.id, actor.organizationId));
  }
  async getOrganization(actor: Principal, organizationId: string) {
    this.ensureOrganizationAccess(actor, organizationId);
    const [result] = await this.db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!result) throw new ServiceError("NOT_FOUND", "Organization not found."); return result;
  }
  async updateOrganization(actor: Principal, organizationId: string, input: UpdateOrganization, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, true);
    const [result] = await this.db.update(organizations).set({ ...input, updatedAt: new Date() }).where(eq(organizations.id, organizationId)).returning();
    if (!result) throw new ServiceError("NOT_FOUND", "Organization not found.");
    await this.audit(this.db, organizationId, context, "ORGANIZATION_UPDATED", "organization", organizationId, actor, { fields: Object.keys(input) }); return result;
  }
  async createFacility(actor: Principal, organizationId: string, input: CreateFacility, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, true);
    const [result] = await this.db.insert(facilities).values({ id: createEntityId(), organizationId, ...input, code: input.code.toUpperCase() }).returning();
    await this.audit(this.db, organizationId, context, "FACILITY_CREATED", "facility", result?.id, actor); return result;
  }
  async listFacilities(actor: Principal, organizationId: string) {
    this.ensureOrganizationAccess(actor, organizationId); return this.db.select().from(facilities).where(eq(facilities.organizationId, organizationId)).orderBy(facilities.name);
  }
  async updateFacility(actor: Principal, organizationId: string, facilityId: string, input: UpdateFacility, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, true);
    const values = { ...input, ...(input.code ? { code: input.code.toUpperCase() } : {}), updatedAt: new Date() };
    const [result] = await this.db.update(facilities).set(values).where(and(eq(facilities.organizationId, organizationId), eq(facilities.id, facilityId))).returning();
    if (!result) throw new ServiceError("NOT_FOUND", "Facility not found.");
    await this.audit(this.db, organizationId, context, "FACILITY_UPDATED", "facility", facilityId, actor, { fields: Object.keys(input) }); return result;
  }
  async inviteUser(actor: Principal, organizationId: string, input: CreateInvitation, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, true); const token = randomToken(); const invitationId = createEntityId();
    try {
      const invitation = await this.db.transaction(async (tx) => {
        // Expired invitations no longer reserve paid seats. This also keeps the
        // database trigger's transactional capacity calculation accurate.
        await tx.update(invitations).set({ status: "EXPIRED", updatedAt: new Date() }).where(and(eq(invitations.organizationId, organizationId), eq(invitations.status, "PENDING"), sql`${invitations.expiresAt} <= now()`));
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
    this.ensureOrganizationAccess(actor, organizationId, true);
    return this.db.select({ membershipId: organizationMemberships.id, userId: users.id, email: users.email, displayName: users.displayName, status: users.status, role: organizationMemberships.role, active: organizationMemberships.isActive, createdAt: organizationMemberships.createdAt })
      .from(organizationMemberships).innerJoin(users, eq(users.id, organizationMemberships.userId)).where(eq(organizationMemberships.organizationId, organizationId)).orderBy(users.displayName);
  }
  async setUserActive(actor: Principal, organizationId: string, membershipId: string, active: boolean, context: RequestContext) {
    this.ensureOrganizationAccess(actor, organizationId, true);
    if (membershipId === actor.membershipId && !active) throw new ServiceError("CONFLICT", "You cannot deactivate your own membership.");
    try {
      const [result] = await this.db.update(organizationMemberships).set({ isActive: active, updatedAt: new Date() }).where(and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.id, membershipId))).returning();
      if (!result) throw new ServiceError("NOT_FOUND", "User membership not found.");
      if (!active) await this.db.update(authSessions).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(authSessions.organizationId, organizationId), eq(authSessions.membershipId, membershipId), isNull(authSessions.revokedAt)));
      await this.audit(this.db, organizationId, context, active ? "USER_REACTIVATED" : "USER_DEACTIVATED", "membership", membershipId, actor); return result;
    } catch (error) {
      if (databaseCode(error) === "23514" && String(error).includes("user limit")) throw new ServiceError("USER_LIMIT_REACHED", "The organization user limit has been reached."); throw error;
    }
  }
}
