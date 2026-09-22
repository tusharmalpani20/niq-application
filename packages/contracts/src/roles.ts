import { z } from "zod";

export const membershipRoles = ["ORGANIZATION_ADMIN", "DOCTOR", "NUTRITIONIST", "OTHER_MEDICAL", "SUPPORT"] as const;
export const membershipRoleSchema = z.enum(membershipRoles);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export const membershipRoleLabels: Record<MembershipRole, string> = {
  ORGANIZATION_ADMIN: "Organization admin",
  DOCTOR: "Doctor",
  NUTRITIONIST: "Nutritionist",
  OTHER_MEDICAL: "Other Medical Personnel",
  SUPPORT: "Support",
};

export const permissions = [
  "patients.read", "patients.create", "patients.edit", "assessments.list", "assessments.read",
  "assessments.edit", "assessments.submit", "assessments.reconcile",
  "scans.perform", "reports.manage", "scores.review", "facilities.read",
  "reviews.submit", "reviews.claim", "reviews.transfer", "reviews.complete", "reviews.assign", "reviews.return",
  "facilities.manage", "users.manage", "organization.manage", "scoring.manage",
] as const;
export type Permission = typeof permissions[number];
const supportPermissions: readonly Permission[] = ["patients.read", "patients.create", "patients.edit", "assessments.list", "facilities.read"];
const clinicalPermissions: readonly Permission[] = [
  ...supportPermissions, "assessments.read", "assessments.edit", "assessments.submit",
  "scans.perform", "reports.manage", "scores.review",
  "reviews.submit", "reviews.claim", "reviews.transfer", "reviews.complete", "reviews.return",
];

/** Roles remain distinct even while their initial permission sets are identical.
 * Organisation, active membership and facility checks must still run on the server.
 */
export const rolePermissions: Readonly<Record<MembershipRole, readonly Permission[]>> = {
  ORGANIZATION_ADMIN: permissions.filter(permission => !["scores.review", "reviews.claim", "reviews.complete"].includes(permission)),
  DOCTOR: [...clinicalPermissions],
  NUTRITIONIST: [...clinicalPermissions],
  OTHER_MEDICAL: [...clinicalPermissions],
  SUPPORT: [...supportPermissions],
};
export function hasPermission(role: string, permission: Permission): boolean {
  return Object.hasOwn(rolePermissions, role) && rolePermissions[role as MembershipRole].includes(permission);
}
