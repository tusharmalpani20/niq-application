import { describe, expect, test } from "bun:test";
import { canReserveUserSeat, canRetryScoring, createEntityId, normalizeEmail, requiresMfa } from "./index";

describe("user entitlements", () => {
  test("pending invitations reserve seats", () => {
    expect(canReserveUserSeat({ limit: 3, activeUsers: 2, pendingInvitations: 1 })).toEqual({
      allowed: false,
      reason: "USER_LIMIT_REACHED",
      remaining: 0,
    });
  });

  test("null limit means unlimited", () => {
    expect(canReserveUserSeat({ limit: null, activeUsers: 10_000, pendingInvitations: 500 })).toEqual({
      allowed: true,
      remaining: null,
    });
  });
});

describe("scoring recovery", () => {
  test("allows retry after an external outage", () => {
    expect(canRetryScoring("SCORING_UNAVAILABLE")).toBe(true);
    expect(canRetryScoring("SCORED")).toBe(false);
  });
});

describe("entity identifiers", () => {
  test("generates canonical 26-character uppercase ULIDs", () => {
    expect(createEntityId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  test("encodes creation time in the sortable prefix", () => {
    expect(createEntityId(1_000).slice(0, 10) < createEntityId(2_000).slice(0, 10)).toBe(true);
  });
});

describe("identity policy", () => {
  test("normalizes email and requires MFA for privileged users", () => {
    expect(normalizeEmail(" Admin@Example.COM ")).toBe("admin@example.com");
    expect(requiresMfa("ORGANIZATION_ADMIN")).toBe(true);
    expect(requiresMfa("MEDICAL")).toBe(false);
    expect(requiresMfa("MEDICAL", true)).toBe(true);
  });
});
