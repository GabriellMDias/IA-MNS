import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { nfkc } from "./domain.js";

// Established platform primitives only (scrypt, HMAC, AES-GCM, CSPRNG). No custom
// cryptography: these helpers fix parameters, encodings and comparisons.

/** 256-bit opaque secret for tickets, refresh credentials and flow state. */
export function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Lookup hash for high-entropy secrets; never used for passwords. */
export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

// scrypt N=2^15, r=8, p=1 (~32 MiB, OWASP-recommended minimum class).
const SCRYPT = {
  cost: 2 ** 15,
  blockSize: 8,
  parallelization: 1,
  keyLength: 32,
};
const scryptOptions = {
  N: SCRYPT.cost,
  r: SCRYPT.blockSize,
  p: SCRYPT.parallelization,
  maxmem: 64 * 1024 * 1024,
};

function derive(input: string, salt: Buffer, options = scryptOptions) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(nfkc(input), salt, SCRYPT.keyLength, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${Math.log2(SCRYPT.cost)}$${SCRYPT.blockSize}$${SCRYPT.parallelization}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** Constant-shape verification; a malformed stored hash never verifies. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, log2, r, p, salt, expected] = parts;
  if (!/^\d{1,2}$/.test(log2) || !/^\d{1,2}$/.test(r) || !/^\d{1,2}$/.test(p))
    return false;
  const key = await derive(password, Buffer.from(salt, "base64url"), {
    ...scryptOptions,
    N: 2 ** Number(log2),
    r: Number(r),
    p: Number(p),
  });
  const wanted = Buffer.from(expected, "base64url");
  return wanted.length === key.length && timingSafeEqual(wanted, key);
}

/** Equalizes timing for unknown logins without revealing account existence. */
let dummy: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword(randomSecret());
  await verifyPassword(password, await dummy);
}

// ---- RFC 6238 TOTP (HMAC-SHA1, 30 s, 6 digits), RFC 4648 base32 ----
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function totpCode(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, "0");
}

export const totpStep = (at: number) => Math.floor(at / 30_000);

/** Returns the matching step within ±1 step that is newer than `lastStep`. */
export function matchTotp(
  secret: Buffer,
  code: string,
  at: number,
  lastStep: number | null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = totpStep(at);
  for (const step of [current - 1, current, current + 1])
    if (
      (lastStep === null || step > lastStep) &&
      safeEqual(totpCode(secret, step), code)
    )
      return step;
  return null;
}

export function newTotpSecret(): Buffer {
  return randomBytes(20);
}

export function otpauthUri(secret: Buffer, account: string): string {
  const label = encodeURIComponent(`IA-MNS:${account}`);
  return `otpauth://totp/${label}?secret=${base32Encode(secret)}&issuer=IA-MNS&algorithm=SHA1&digits=6&period=30`;
}

// ---- AES-256-GCM sealing of TOTP secrets at rest ----
export function seal(key: Buffer, plaintext: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${body.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function unseal(key: Buffer, sealed: string): Buffer {
  const [version, iv, body, tag] = sealed.split(".");
  if (version !== "v1" || !iv || !body || !tag)
    throw new Error("Unsupported sealed value");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]);
}

/** Ten single-use recovery codes: 50 bits each, grouped for readability. */
export function recoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const raw = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code
    .trim()
    .toLowerCase()
    .replace(/[^a-z2-7]/g, "");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
