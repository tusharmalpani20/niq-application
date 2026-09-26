import { expect, test } from "bun:test";
import type { OnboardOrganization } from "@niq/application-contracts";
import { DrizzleQueryError } from "drizzle-orm";
import type { Principal } from "./application";
import { PostgresApplicationService } from "./postgres-application";

const input: OnboardOrganization = {
  legalName: "Demo",
  displayName: "Demo",
  slug: "demo",
  primaryColor: "#3BB9BD",
  secondaryColor: "#4F5052",
  patientReferencePrefix: "PAT",
  userLimit: null,
  firstAdminEmail: "admin@demo.com",
  logo: null,
};

test("onboarding reports a duplicate organization URL name from a wrapped database error", async () => {
  const cause = Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
    constraint_name: "organizations_slug_uidx",
  });
  const db = { transaction: async () => { throw new DrizzleQueryError("insert into organizations", [], cause); } };
  const service = new PostgresApplicationService(db as never, { INVITATION_TTL_HOURS: 24 } as never, {} as never);

  await expect(service.onboardOrganization({ platformRole: "NIQ_ADMIN" } as Principal, input, { requestId: "request-1" }))
    .rejects.toMatchObject({
      code: "CONFLICT",
      message: "An organization with this URL name already exists. Choose a different name.",
      details: { field: "name" },
    });
});
