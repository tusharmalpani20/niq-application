import { describe, expect, test } from "bun:test";
import type { Principal } from "./application";
import { myAssessmentAction } from "./postgres-application";

const creator: Principal = {
  userId: "creator-user", organizationId: "org", membershipId: "creator",
  email: "creator@example.test", displayName: "Creator", role: "DOCTOR", platformRole: "USER",
};
const colleague: Principal = { ...creator, userId: "colleague-user", membershipId: "colleague" };

describe("personal assessment action", () => {
  test("shows a normal draft only to its creator", () => {
    const row = { status: "DRAFT" as const, createdByMembershipId: "creator" };
    expect(myAssessmentAction(creator, row, null)).toBe("EDIT_DRAFT");
    expect(myAssessmentAction(colleague, row, null)).toBeNull();
  });

  test("a correction assignment takes precedence over creation", () => {
    const draft = { status: "DRAFT" as const, createdByMembershipId: "creator" };
    const scored = { ...draft, status: "SCORED" as const };
    expect(myAssessmentAction(creator, draft, "colleague")).toBeNull();
    expect(myAssessmentAction(colleague, draft, "colleague")).toBe("CORRECT_DRAFT");
    expect(myAssessmentAction(creator, scored, "colleague")).toBeNull();
    expect(myAssessmentAction(colleague, scored, "colleague")).toBe("SEND_FOR_REVIEW");
  });

  test("only the scored assessment creator can send an unassigned assessment", () => {
    const row = { status: "SCORED" as const, createdByMembershipId: "creator" };
    expect(myAssessmentAction(creator, row, null)).toBe("SEND_FOR_REVIEW");
    expect(myAssessmentAction(colleague, row, null)).toBeNull();
  });

  test("other states and roles have no personal action", () => {
    for (const status of ["READY_FOR_SCORING", "SCORING_PENDING", "SCORING_UNAVAILABLE", "UNDER_REVIEW", "COMPLETED", "VOIDED"] as const) {
      expect(myAssessmentAction(creator, { status, createdByMembershipId: "creator" }, null)).toBeNull();
    }
    expect(myAssessmentAction({ ...creator, role: "SUPPORT" }, { status: "DRAFT", createdByMembershipId: "creator" }, null)).toBeNull();
    expect(myAssessmentAction({ ...creator, platformRole: "NIQ_ADMIN" }, { status: "SCORED", createdByMembershipId: "creator" }, null)).toBeNull();
  });
});
