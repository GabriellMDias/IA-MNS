import { createPrivateKey, type KeyObject } from "node:crypto";
import { SignJWT, type JWK } from "jose";
import { issuerPublicJwk } from "../../authentication.js";
import type { Assurance } from "./domain.js";
import { lifetimes } from "./domain.js";

/** IA-MNS access-token issuer (ADR-0012 contract: typ at+jwt, orion_principal_id, scope). */
export class AccessTokenIssuer {
  private readonly privateKey: KeyObject;
  readonly publicJwk: JWK & { kid: string };
  readonly issuer: string;
  readonly audience: string;
  constructor(input: {
    /** base64url PKCS#8 DER of a P-256 private key. */
    signingKey: string;
    issuer: string;
    audience: string;
  }) {
    this.publicJwk = issuerPublicJwk(input.signingKey);
    this.privateKey = createPrivateKey({
      key: Buffer.from(input.signingKey, "base64url"),
      format: "der",
      type: "pkcs8",
    });
    this.issuer = input.issuer;
    this.audience = input.audience;
  }

  async issue(input: {
    personId: string;
    sessionId: string;
    permissions: readonly string[];
    assurance: Assurance;
    authTime: Date;
  }): Promise<{ accessToken: string; expiresIn: number }> {
    const accessToken = await new SignJWT({
      orion_principal_id: input.personId,
      orion_actor_type: "human",
      scope: input.permissions.join(" "),
      sid: input.sessionId,
      acr: `urn:ia-mns:assurance:${input.assurance}`,
      auth_time: Math.floor(input.authTime.getTime() / 1000),
    })
      .setProtectedHeader({
        alg: "ES256",
        typ: "at+jwt",
        kid: this.publicJwk.kid,
      })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(input.personId)
      .setIssuedAt()
      .setExpirationTime(`${lifetimes.accessTokenSeconds}s`)
      .sign(this.privateKey);
    return { accessToken, expiresIn: lifetimes.accessTokenSeconds };
  }
}
