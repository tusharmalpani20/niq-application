import { describe, expect, test } from "bun:test";
import { hasPermission, membershipRoles, permissions, rolePermissions } from "./roles";
import { createInvitationSchema } from "./index";

describe("organisation roles", () => {
  test("clinical roles start with identical independent permission lists", () => {
    expect(rolePermissions.DOCTOR).toEqual(rolePermissions.NUTRITIONIST);
    expect(rolePermissions.DOCTOR).toEqual(rolePermissions.OTHER_MEDICAL);
    expect(rolePermissions.DOCTOR).not.toBe(rolePermissions.NUTRITIONIST);
    for (const role of ["DOCTOR", "NUTRITIONIST", "OTHER_MEDICAL"]) {
      for (const permission of ["assessments.edit", "assessments.submit", "scans.perform", "reports.manage", "scores.review"] as const) expect(hasPermission(role, permission)).toBe(true);
      for (const permission of ["users.manage", "facilities.manage", "organization.manage", "scoring.manage", "assessments.reconcile"] as const) expect(hasPermission(role, permission)).toBe(false);
    }
  });
  test("admin has management permissions without clinical review and support retains only registration and list access", () => {
    for (const permission of permissions) {
      expect(hasPermission("ORGANIZATION_ADMIN", permission)).toBe(!["scores.review", "reviews.claim", "reviews.complete"].includes(permission));
      expect(hasPermission("SUPPORT", permission)).toBe(["patients.read", "patients.create", "patients.edit", "assessments.list", "facilities.read"].includes(permission));
      expect(hasPermission("MEDICAL", permission)).toBe(false);
      expect(hasPermission("toString", permission)).toBe(false);
    }
  });
  test("invitations accept every role and default to other medical", () => {
    const input = { email: "person@example.com", displayName: "Person" };
    for (const role of membershipRoles) expect(createInvitationSchema.parse({ ...input, role }).role).toBe(role);
    expect(createInvitationSchema.parse(input).role).toBe("OTHER_MEDICAL");
    expect(createInvitationSchema.safeParse({ ...input, role: "MEDICAL" }).success).toBe(false);
  });
});
