import { hasPermission, type MembershipRole } from "@niq/application-contracts";
import { matchPath } from "react-router-dom";

const restrictedRoutes = {
  "/users": "users.manage",
  "/settings/branding": "organization.manage",
  "/settings/scoring": "scoring.manage",
} as const;

export function canVisitOrganizationRoute(role: MembershipRole, pathname: string): boolean {
  // Use the router's matching rules, including case and trailing-slash handling.
  const match = Object.entries(restrictedRoutes).find(([path]) => matchPath(path, pathname));
  return !match || hasPermission(role, match[1]);
}
