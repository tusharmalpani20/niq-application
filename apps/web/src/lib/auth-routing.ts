import type { AuthenticatedUser } from "@niq/application-contracts";

export function authenticatedLandingPath(user: Pick<AuthenticatedUser, "platformRole">) {
  return user.platformRole === "NIQ_ADMIN" ? "/admin/organizations" : "/";
}
