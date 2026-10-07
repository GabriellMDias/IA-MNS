import {
  createLocalJWKSet,
  errors,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
} from "jose";

import { normalizeEmail } from "./domain.js";

// Sankhya identity connector boundary. The IA-MNS side only accepts a verified,
// stable Sankhya identity (installation issuer + CODUSU). How that proof is
// produced is a connector implementation detail:
//  - "session assertion" (implemented here): a short JWS minted server-side by an
//    IA-MNS add-on inside the Om from the authenticated Om session, verified with
//    pinned public keys. Production use is gated by PH-11 (Om transport and session hardening).
//  - legacy credential login: a documented fallback only; not implemented.

export type SankhyaIdentity = Readonly<{
  issuer: string;
  /** Sankhya CODUSU as a canonical decimal string. */
  subject: string;
  name: string | null;
  email: string | null;
  jti: string;
  expiresAt: Date;
}>;

export class SankhyaFailure extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Sankhya identity: ${reason}`);
    this.name = "SankhyaFailure";
    this.reason = reason;
  }
}

export interface SankhyaIdentityConnector {
  /** Verifies a host-produced proof bound to the IA-MNS flow nonce. */
  verify(proof: string, expectedNonce: string): Promise<SankhyaIdentity>;
}

export type SankhyaAssertionConfig = Readonly<{
  issuer: string;
  audience: string;
  keys: JSONWebKeySet;
}>;

export class SankhyaAssertionVerifier implements SankhyaIdentityConnector {
  private readonly keys;
  private readonly config: SankhyaAssertionConfig;
  constructor(config: SankhyaAssertionConfig) {
    if (!config.keys.keys.length)
      throw new Error("Sankhya identity requires at least one key");
    this.config = config;
    this.keys = createLocalJWKSet(config.keys);
  }

  async verify(proof: string, expectedNonce: string): Promise<SankhyaIdentity> {
    if (typeof proof !== "string" || proof.length > 4096)
      throw new SankhyaFailure("malformed");
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(proof, this.keys, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ["RS256", "ES256"],
        typ: "JWT",
        requiredClaims: ["iat", "exp", "jti", "sub", "nonce"],
        clockTolerance: 5,
      }));
    } catch (error) {
      if (error instanceof errors.JOSEError)
        throw new SankhyaFailure("invalid_assertion");
      throw error;
    }
    if (
      payload.exp! - payload.iat! > 120 ||
      payload.iat! > Math.floor(Date.now() / 1000) + 30
    )
      throw new SankhyaFailure("bad_lifetime");
    if (payload.nonce !== expectedNonce)
      throw new SankhyaFailure("nonce_mismatch");
    // CODUSU 0 (SUP) is accepted by the owner's 2026-10-06 decision, so the
    // shared SUP account can be linked to an administrator's Person.
    if (
      typeof payload.sub !== "string" ||
      !/^(0|[1-9][0-9]{0,9})$/.test(payload.sub)
    )
      throw new SankhyaFailure("bad_subject");
    if (typeof payload.jti !== "string" || payload.jti.length > 128)
      throw new SankhyaFailure("bad_jti");
    const name =
      typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim().slice(0, 120)
        : null;
    return {
      issuer: this.config.issuer,
      subject: payload.sub,
      name,
      email: normalizeEmail(payload.email),
      jti: payload.jti,
      expiresAt: new Date(payload.exp! * 1000),
    };
  }
}
