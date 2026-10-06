import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

function scryptAsync(secret: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(secret, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

/** Slow salted hash for passwords and PINs. Format: scrypt$N$r$p$salt$hash (base64url). */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const key = await scryptAsync(secret, salt, keylen, { N, r, p });
  return ["scrypt", N, r, p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifySecret(secret: string, stored: string | null): Promise<boolean> {
  // Hash something even when there is no stored hash, so timing does not reveal which accounts exist.
  const [scheme, n, r, p, saltText, keyText] = (stored ?? DUMMY_HASH).split("$");
  if (scheme !== "scrypt" || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, "base64url");
  const key = await scryptAsync(secret, Buffer.from(saltText, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return stored !== null && timingSafeEqual(key, expected);
}

const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** 256-bit random bearer token. Stored only as `tokenHash(token)`. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Tokens are high-entropy, so a fast hash is enough (and allows lookup by hash). */
export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// No 0/O, 1/I/L: codes are read off one screen and typed on another.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** 8-character pairing code (~40 bits), shown as XXXX-XXXX. */
export function newPairingCode(): string {
  const chars = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** Normalise what a person typed: case, spaces and dashes don't matter. */
export function normalisePairingCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}
