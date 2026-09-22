import type { ApplicationConfig } from "@niq/application-config";
import { randomOtp } from "./tokens";

// Generate the test code instead of bypassing challenge verification: expiry,
// attempt limits, consumption and account checks still apply normally.
export function createMfaOtp(config: Pick<ApplicationConfig, "NODE_ENV" | "DEV_FIXED_OTP">): string {
  if (config.DEV_FIXED_OTP) {
    if (config.NODE_ENV !== "development") throw new Error("Fixed OTP is allowed only in development");
    return "000000";
  }
  return randomOtp();
}
