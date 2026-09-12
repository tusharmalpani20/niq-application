import type { OtpDelivery } from "./application";

/** Development adapter only. Production startup rejects this adapter in config validation. */
export class DevelopmentOtpDelivery implements OtpDelivery {
  async deliver(input: { email: string; otp: string; expiresAt: Date }): Promise<void> {
    console.info(JSON.stringify({
      level: "info",
      message: "Development MFA OTP",
      email: input.email,
      otp: input.otp,
      expiresAt: input.expiresAt.toISOString(),
    }));
  }
}

export class UnconfiguredOtpDelivery implements OtpDelivery {
  async deliver(): Promise<void> {
    throw new Error("OTP delivery is not configured");
  }
}
