import { eq, inArray, or, sql } from "drizzle-orm";
import { hasPermission } from "@niq/application-contracts";
import { assessments } from "../db/schema";
import type { Principal } from "./application";

/** Candidate scope. Legacy correction assignments are encrypted and checked after decryption. */
export function assessmentVisibilityCondition(actor: Principal) {
  if (actor.platformRole !== "USER") return sql`false`;
  if (actor.role === "ORGANIZATION_ADMIN") return sql`true`;
  const reviewOrFinal = hasPermission(actor.role, "assessments.read")
    ? inArray(assessments.status, ["UNDER_REVIEW", "COMPLETED"])
    : sql`false`;
  return or(eq(assessments.currentOwnerMembershipId, actor.membershipId), reviewOrFinal,
    sql`(${assessments.currentOwnerMembershipId} is null and ${assessments.status} in ('DRAFT','SCORED','SCORING_PENDING','SCORING_UNAVAILABLE'))`)!;
}

type OwnershipRow = Pick<typeof assessments.$inferSelect, "status" | "currentOwnerMembershipId" | "createdByMembershipId">;

export function isCurrentAssessmentOwner(row: OwnershipRow, actor: Principal, legacyCorrectionPersonId?: string | null): boolean {
  if (actor.platformRole !== "USER" || actor.role === "ORGANIZATION_ADMIN") return false;
  if (["UNDER_REVIEW", "COMPLETED", "VOIDED"].includes(row.status)) return row.status === "UNDER_REVIEW" && row.currentOwnerMembershipId === actor.membershipId;
  const ownerId = row.currentOwnerMembershipId ?? legacyCorrectionPersonId ?? row.createdByMembershipId;
  return ownerId === actor.membershipId;
}

export function canSeeAssessment(row: OwnershipRow, actor: Principal, legacyCorrectionPersonId?: string | null): boolean {
  if (actor.platformRole !== "USER") return false;
  if (actor.role === "ORGANIZATION_ADMIN") return true;
  if (["UNDER_REVIEW", "COMPLETED"].includes(row.status)) return hasPermission(actor.role, "assessments.read");
  return isCurrentAssessmentOwner(row, actor, legacyCorrectionPersonId);
}
