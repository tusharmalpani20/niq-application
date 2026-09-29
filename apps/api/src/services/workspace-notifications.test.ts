import { expect, test } from "bun:test";
import { notificationStillRelevant } from "./workspace-notifications";

const actor = { organizationId: "org", membershipId: "owner", role: "DOCTOR", platformRole: "USER" } as any;
const workflow = { unseal: (value: unknown) => value } as any;
const queued = { status: "UNDER_REVIEW", currentOwnerMembershipId: null, createdByMembershipId: "creator", clinicalReview: null } as any;

test("action alerts disappear when ownership or review state changes", () => {
  expect(notificationStillRelevant(workflow, queued, actor, "REVIEW_AVAILABLE")).toBe(true);
  const claimed = { ...queued, currentOwnerMembershipId: "owner", clinicalReview: { assignee: { membershipId: "owner" }, correctionPerson: null } };
  expect(notificationStillRelevant(workflow, claimed, actor, "REVIEW_AVAILABLE")).toBe(false);
  expect(notificationStillRelevant(workflow, claimed, actor, "REVIEW_ASSIGNED")).toBe(true);
  expect(notificationStillRelevant(workflow, { ...claimed, currentOwnerMembershipId: "another" }, actor, "REVIEW_ASSIGNED")).toBe(false);
  expect(notificationStillRelevant(workflow, { ...claimed, status: "COMPLETED" }, actor, "REVIEW_COMPLETED")).toBe(true);
  expect(notificationStillRelevant(workflow, { ...claimed, status: "COMPLETED" }, actor, "REVIEW_ASSIGNED")).toBe(false);
});
