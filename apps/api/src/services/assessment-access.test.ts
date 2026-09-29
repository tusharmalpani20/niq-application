import { describe, expect, test } from "bun:test";
import type { Principal } from "./application";
import { canSeeAssessment, isCurrentAssessmentOwner } from "./assessment-access";

const clinician: Principal = {
  userId: "user-a", organizationId: "org", membershipId: "member-a",
  email: "a@example.test", displayName: "A", role: "DOCTOR", platformRole: "USER",
};
const other = { ...clinician, userId: "user-b", membershipId: "member-b" };
const admin = { ...clinician, role: "ORGANIZATION_ADMIN" as const };
const draft = { status: "DRAFT" as const, createdByMembershipId: "member-a", currentOwnerMembershipId: "member-a" };

describe("assessment ownership and visibility", () => {
  test("a transferred draft is private to its current owner and visible read-only to an admin", () => {
    const transferred = { ...draft, currentOwnerMembershipId: "member-b" };
    expect(canSeeAssessment(transferred, clinician)).toBe(false);
    expect(canSeeAssessment(transferred, other)).toBe(true);
    expect(canSeeAssessment(transferred, admin)).toBe(true);
    expect(isCurrentAssessmentOwner(transferred, clinician)).toBe(false);
    expect(isCurrentAssessmentOwner(transferred, other)).toBe(true);
    expect(isCurrentAssessmentOwner(transferred, admin)).toBe(false);
  });

  test("legacy returned drafts use the encrypted correction assignment, never creator ownership", () => {
    const legacy = { ...draft, currentOwnerMembershipId: null };
    expect(canSeeAssessment(legacy, clinician, "member-b")).toBe(false);
    expect(canSeeAssessment(legacy, other, "member-b")).toBe(true);
    expect(isCurrentAssessmentOwner(legacy, clinician, "member-b")).toBe(false);
  });

  test("unclaimed review can be seen by clinical reviewers but has no owner", () => {
    const review = { ...draft, status: "UNDER_REVIEW" as const, currentOwnerMembershipId: null };
    expect(canSeeAssessment(review, other)).toBe(true);
    expect(isCurrentAssessmentOwner(review, clinician)).toBe(false);
  });
});
