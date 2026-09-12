const encoder = new TextEncoder();

export function randomToken(bytes = 32): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Buffer.from(value).toString("base64url");
}

export function randomOtp(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return String(value % 1_000_000).padStart(6, "0");
}

export async function keyedHash(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Buffer.from(signature).toString("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id", memoryCost: 65_536, timeCost: 3 });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(password, hash, "argon2id");
  } catch {
    return false;
  }
}

export function secureEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index]! ^ rightBytes[index]!;
  return difference === 0;
}
