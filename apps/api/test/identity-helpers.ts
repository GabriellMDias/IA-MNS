import { generateKeyPairSync } from "node:crypto";

/** Synthetic P-256 IA-MNS signing key (base64url PKCS#8 DER) for tests only. */
export function signingKey() {
  return generateKeyPairSync("ec", { namedCurve: "P-256" })
    .privateKey.export({ type: "pkcs8", format: "der" })
    .toString("base64url");
}
