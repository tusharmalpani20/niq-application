import { hasPermission, type AssessmentSummary } from "@niq/application-contracts";
import type { assessments } from "../db/schema";
import type { Principal } from "./application";

export function myAssessmentAction(actor: Principal, row: Pick<typeof assessments.$inferSelect, "status" | "createdByMembershipId">, correctionPersonId: string | null): AssessmentSummary["myAction"] {
  if (actor.platformRole !== "USER") return null;
  const ownerId = correctionPersonId ?? row.createdByMembershipId;
  if (ownerId !== actor.membershipId) return null;
  if (row.status === "DRAFT" && hasPermission(actor.role, "assessments.edit")) return correctionPersonId ? "CORRECT_DRAFT" : "EDIT_DRAFT";
  if (row.status === "SCORED" && hasPermission(actor.role, "assessments.submit")) return "SEND_FOR_REVIEW";
  return null;
}
