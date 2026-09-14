import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Principal } from "./application";

// No assignments means "All facilities". Resolve assignments in the data query,
// not from session state, so access changes take effect on the next request.
export function facilityAccessCondition(actor: Principal, organizationId: string, facilityColumn: AnyPgColumn) {
  if (actor.platformRole === "NIQ_ADMIN") return sql`true`;
  return sql`(
    not exists (
      select 1 from facility_memberships fm
      where fm.organization_id = ${organizationId}
        and fm.organization_membership_id = ${actor.membershipId}
    )
    or exists (
      select 1 from facility_memberships fm
      where fm.organization_id = ${organizationId}
        and fm.organization_membership_id = ${actor.membershipId}
        and fm.facility_id = ${facilityColumn}
    )
  )`;
}
