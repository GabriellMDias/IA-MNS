import { generateKeyPairSync, randomBytes } from "node:crypto";

/**
 * Fresh IA-MNS identity keys in the formats `src/config.ts` validates: an
 * ES256 (P-256) signing key as base64url PKCS#8 DER and a 32-byte AES-256-GCM
 * key for second-factor secrets. Every environment gets its own keys.
 */
export function generateIdentityKeys(): {
  IA_MNS_IDENTITY_SIGNING_KEY: string;
  IA_MNS_IDENTITY_ENCRYPTION_KEY: string;
} {
  return {
    IA_MNS_IDENTITY_SIGNING_KEY: generateKeyPairSync("ec", {
      namedCurve: "P-256",
    })
      .privateKey.export({ type: "pkcs8", format: "der" })
      .toString("base64url"),
    IA_MNS_IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
  };
}
