import type { ApplicationConfig } from "@niq/application-config";
import type { ByocSetupRequest, ByocSetupStatus } from "@niq/application-contracts";
import type { Database } from "../db/client";
import { createEntityId, normalizeEmail } from "@niq/application-domain";
import { byocSetupRequestSchema } from "@niq/application-contracts";
import { sql } from "drizzle-orm";
import { auditEvents, byocInstallationSetups, organizationEntitlements, organizationMemberships, organizations, users } from "../db/schema";
import { hashPassword, secureEqual } from "../security/tokens";
import { ServiceError } from "./application";

export class ByocSetupService {
  constructor(private readonly db: Database, private readonly config: ApplicationConfig) {}
  authorize(token: string) {
    if (this.config.DEPLOYMENT_MODE !== "client-cloud" || this.config.AUTH_MODE !== "local"
      || !this.config.BYOC_SETUP_TOKEN || !this.config.BYOC_SETUP_EXPIRES_AT
      || Date.parse(this.config.BYOC_SETUP_EXPIRES_AT) <= Date.now()
      || !secureEqual(token, this.config.BYOC_SETUP_TOKEN)) throw new ServiceError("FORBIDDEN", "Setup is disabled, expired or its authorization is invalid.");
  }
  async status(token: string): Promise<ByocSetupStatus> {
    this.authorize(token);
    const completed = await this.db.select({ id: byocInstallationSetups.id }).from(byocInstallationSetups).limit(1);
    return { state: completed.length ? "completed" : "pending", origin: this.config.WEB_ORIGIN,
      httpsConfigured: new URL(this.config.WEB_ORIGIN).protocol === "https:",
      scoringConfigured: Boolean(this.config.SCORING_API_URL && this.config.SCORING_CREDENTIAL_ENCRYPTION_KEY),
      // Production delivery is a separate gate; never report the development adapter as production-ready.
      otpDeliveryConfigured: this.config.NODE_ENV === "development" && (this.config.DEV_OTP_DELIVERY || this.config.DEV_FIXED_OTP),
      expiresAt: this.config.BYOC_SETUP_EXPIRES_AT! };
  }
  async complete(token: string, input: ByocSetupRequest, requestId: string): Promise<{ organizationId: string; signInRequired: true }> {
    this.authorize(token);
    const parsed = byocSetupRequestSchema.safeParse(input);
    if (!parsed.success) throw new ServiceError("VALIDATION_ERROR", "Provide valid organization and administrator details.");
    const data = parsed.data;
    return this.db.transaction(async tx => {
      // Use the platform bootstrap lock as well: two first-account paths must not race.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('niq-platform-bootstrap', 0))`);
      this.authorize(token);
      const completed = await tx.select({ id: byocInstallationSetups.id }).from(byocInstallationSetups).limit(1);
      const existing = await tx.select({ id: organizations.id }).from(organizations).limit(1);
      const accounts = await tx.select({ id: users.id }).from(users).limit(1);
      if (completed.length || existing.length || accounts.length) throw new ServiceError("CONFLICT", "Initial setup is already complete or this database is not empty.");
      const organizationId = createEntityId(), userId = createEntityId(), membershipId = createEntityId();
      await tx.insert(organizations).values({ id: organizationId, legalName: data.organizationName, displayName: data.organizationName, slug: data.organizationSlug });
      await tx.insert(users).values({ id: userId, email: normalizeEmail(data.adminEmail), displayName: data.adminName,
        passwordHash: await hashPassword(data.adminPassword), status: "ACTIVE", platformRole: "USER", mfaEnabled: true });
      await tx.insert(organizationMemberships).values({ id: membershipId, organizationId, userId, role: "ORGANIZATION_ADMIN" });
      await tx.insert(organizationEntitlements).values({ id: createEntityId(), organizationId, userLimit: this.config.BYOC_USER_LIMIT, changedByMembershipId: membershipId, reason: "BYOC initial hospital setup" });
      await tx.insert(auditEvents).values({ id: createEntityId(), organizationId, actorMembershipId: membershipId, actorType: "USER",
        action: "BYOC_HOSPITAL_SETUP_COMPLETED", resourceType: "organization", resourceId: organizationId, requestId });
      await tx.insert(byocInstallationSetups).values({ id: "byoc", organizationId, adminUserId: userId });
      return { organizationId, signInRequired: true };
    });
  }
}
