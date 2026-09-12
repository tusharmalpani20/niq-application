export type UserCapacity = {
  limit: number | null;
  activeUsers: number;
  pendingInvitations: number;
};

export type CapacityDecision =
  | { allowed: true; remaining: number | null }
  | { allowed: false; reason: "USER_LIMIT_REACHED"; remaining: 0 };

export function canReserveUserSeat(capacity: UserCapacity): CapacityDecision {
  if (capacity.limit === null) return { allowed: true, remaining: null };

  const remaining = Math.max(0, capacity.limit - capacity.activeUsers - capacity.pendingInvitations);
  if (remaining === 0) return { allowed: false, reason: "USER_LIMIT_REACHED", remaining: 0 };
  return { allowed: true, remaining: remaining - 1 };
}

export const retryableScoringStatuses = new Set(["READY_FOR_SCORING", "SCORING_PENDING", "SCORING_UNAVAILABLE"]);

export function canRetryScoring(status: string): boolean {
  return retryableScoringStatuses.has(status);
}

const crockfordBase32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeBase32(value: bigint, length: number): string {
  let encoded = "";
  for (let index = 0; index < length; index += 1) {
    encoded = crockfordBase32[Number(value & 31n)] + encoded;
    value >>= 5n;
  }
  return encoded;
}

/** Generates a canonical uppercase ULID at the application creation boundary. */
export function createEntityId(now = Date.now()): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > 281_474_976_710_655) {
    throw new RangeError("ULID timestamp must fit in 48 bits");
  }

  const randomBytes = crypto.getRandomValues(new Uint8Array(10));
  let randomness = 0n;
  for (const byte of randomBytes) randomness = (randomness << 8n) | BigInt(byte);

  return `${encodeBase32(BigInt(now), 10)}${encodeBase32(randomness, 16)}`;
}
