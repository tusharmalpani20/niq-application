import { scoringServiceUrl } from "./scoring-service-url";
import { randomUUID } from "node:crypto";
import type { ActivateScoring } from "@niq/application-contracts";
import type { ApplicationConfig } from "@niq/application-config";
import { createEntityId } from "@niq/application-domain";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client";
import { auditEvents, organizations, scoringActivationAttempts, scoringConnections } from "../db/schema";
import { encryptCredential } from "../security/credential-encryption";
import { keyedHash } from "../security/tokens";
import { ServiceError, type Principal, type RequestContext } from "./application";

const responseSchema = z.object({
  deploymentId: z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/),
  clientId: z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/),
  credential: z.string().min(32),
});
const publicConnection = { deploymentId: scoringConnections.deploymentId, scoringOrganizationId: scoringConnections.scoringOrganizationId, keyVersion: scoringConnections.keyVersion, activatedAt: scoringConnections.activatedAt };
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function lockOrganization(tx: Transaction, organizationId: string) {
  const [organization] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).for("update");
  if (!organization) throw new ServiceError("NOT_FOUND", "Organization not found.");
}

/** Authorization is enforced by the Application service before entering this helper. */
export async function activateScoringConnection(db: Database, config: ApplicationConfig, actor: Principal, organizationId: string, input: ActivateScoring, context: RequestContext) {
  const encryptionKey = config.SCORING_CREDENTIAL_ENCRYPTION_KEY;
  if (!config.SCORING_API_URL || !encryptionKey) throw new ServiceError("SCORING_NOT_CONFIGURED", "NIQ Scoring is not configured for this application installation.");
  const tokenHash = await keyedHash(JSON.stringify(["niq-scoring-activation-v1", input.activationToken]), encryptionKey);
  // Persist ownership before sending the one-use token. Do not hold a DB transaction
  // while waiting on the remote service, and never persist the raw activation token.
  const attempt = await db.transaction(async tx => {
    await lockOrganization(tx, organizationId);
    const [prior] = await tx.select().from(scoringActivationAttempts).where(eq(scoringActivationAttempts.organizationId, organizationId));
    if (prior?.tokenHash === tokenHash) {
      if (prior.completedAt) {
        const [connection] = await tx.select(publicConnection).from(scoringConnections).where(eq(scoringConnections.organizationId, organizationId));
        if (!connection) throw new ServiceError("CONFLICT", "This connection was disconnected. Use a new activation token.");
        return { requestId: prior.requestId, connection };
      }
      return { requestId: prior.requestId };
    }
    const requestId = randomUUID();
    await tx.insert(scoringActivationAttempts).values({ organizationId, tokenHash, requestId }).onConflictDoUpdate({ target: scoringActivationAttempts.organizationId, set: { tokenHash, requestId, completedAt: null, updatedAt: new Date() } });
    return { requestId };
  });
  if (attempt.connection) return { connection: attempt.connection };

  let response: Response;
  try {
    response = await fetch(scoringServiceUrl(config.SCORING_API_URL, "/v1/activate"), {
      method: "POST", redirect: "error", headers: { "content-type": "application/json", "x-request-id": context.requestId },
      body: JSON.stringify({ activationToken: input.activationToken, activationRequestId: attempt.requestId, clientReference: organizationId }),
      signal: AbortSignal.timeout(config.SCORING_TIMEOUT_MS),
    });
  } catch { throw new ServiceError("SCORING_UNAVAILABLE", "The scoring service could not be reached. Retry with the same activation token."); }
  if (response.status === 401) throw new ServiceError("INVALID_OR_EXPIRED_TOKEN", "The scoring activation token is invalid or expired. If activation was interrupted more than 15 minutes ago, request a new token.");
  if (!response.ok) throw new ServiceError("SCORING_UNAVAILABLE", "The scoring service could not complete activation.");
  const parsed = responseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new ServiceError("SCORING_UNAVAILABLE", "The scoring service returned an invalid activation response.");
  const encrypted = encryptCredential(parsed.data.credential, encryptionKey);
  return db.transaction(async tx => {
    await lockOrganization(tx, organizationId);
    const [current] = await tx.select().from(scoringActivationAttempts).where(eq(scoringActivationAttempts.organizationId, organizationId));
    // A newer token (or a disconnect) supersedes this exchange. Its late response
    // must not overwrite the current connection or append a misleading audit.
    if (current?.requestId !== attempt.requestId || current.tokenHash !== tokenHash) throw new ServiceError("CONFLICT", "A newer connection request replaced this activation.");
    if (current.completedAt) {
      const [connection] = await tx.select(publicConnection).from(scoringConnections).where(eq(scoringConnections.organizationId, organizationId));
      if (!connection) throw new ServiceError("CONFLICT", "This connection was disconnected. Use a new activation token.");
      return { connection };
    }
    const activatedAt = new Date();
    const [connection] = await tx.insert(scoringConnections).values({ id: createEntityId(), organizationId, deploymentId: parsed.data.deploymentId, scoringOrganizationId: parsed.data.clientId, encryptedCredential: encrypted.ciphertext, credentialIv: encrypted.iv, keyVersion: config.SCORING_CREDENTIAL_KEY_VERSION, activatedAt }).onConflictDoUpdate({ target: scoringConnections.organizationId, set: { deploymentId: parsed.data.deploymentId, scoringOrganizationId: parsed.data.clientId, encryptedCredential: encrypted.ciphertext, credentialIv: encrypted.iv, keyVersion: config.SCORING_CREDENTIAL_KEY_VERSION, activatedAt, updatedAt: activatedAt } }).returning(publicConnection);
    const globalActor = actor.platformRole === "NIQ_ADMIN" && actor.organizationId !== organizationId;
    await tx.insert(auditEvents).values({ id: createEntityId(), organizationId, actorType: globalActor ? "NIQ_ADMIN" : "USER", actorMembershipId: globalActor ? undefined : actor.membershipId, action: "SCORING_CONNECTION_ACTIVATED", resourceType: "scoring_connection", resourceId: connection!.deploymentId, requestId: context.requestId, ipAddressHash: context.ipAddress ? await keyedHash(context.ipAddress, config.SESSION_SECRET) : undefined, metadata: { actorUserId: actor.userId, keyVersion: config.SCORING_CREDENTIAL_KEY_VERSION } });
    await tx.update(scoringActivationAttempts).set({ completedAt: activatedAt, updatedAt: activatedAt }).where(eq(scoringActivationAttempts.organizationId, organizationId));
    return { connection };
  });
}

export async function invalidateScoringActivation(tx: Transaction, organizationId: string) {
  await lockOrganization(tx, organizationId);
  const deleted = await tx.delete(scoringActivationAttempts).where(eq(scoringActivationAttempts.organizationId, organizationId)).returning({ organizationId: scoringActivationAttempts.organizationId });
  return deleted.length > 0;
}
