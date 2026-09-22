import { expect, test } from "bun:test";
import { createMfaOtp } from "./mfa-otp";

test("fixed codes require an explicit development flag", () => {
  expect(createMfaOtp({ NODE_ENV: "development", DEV_FIXED_OTP: true })).toBe("000000");
  for (const NODE_ENV of ["test", "production"] as const) {
    expect(() => createMfaOtp({ NODE_ENV, DEV_FIXED_OTP: true })).toThrow("only in development");
  }
  expect(createMfaOtp({ NODE_ENV: "production", DEV_FIXED_OTP: false })).toMatch(/^\d{6}$/);
});
