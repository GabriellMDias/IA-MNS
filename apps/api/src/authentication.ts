import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JSONWebKeySet,
  type JWK,
  type JWTVerifyGetKey,
} from "jose";

/** Provider-independent identity established by a verified access token. */
export interface VerifiedPrincipal {
  /** Stable application principal UUID, never a provider-native subject. */
  id: string;
  /** Issuer-granted scopes; modules map them to their own capabilities. */
  scopes: ReadonlySet<string>;
  /** Issuer session identifier when the issuer provides one (`sid`). */
  sessionId?: string;
}

export interface AccessTokenVerifier {
  verify(authorization: string | undefined): Promise<VerifiedPrincipal | null>;
}

export class AuthenticationUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Authentication verification unavailable", { cause });
    this.name = "AuthenticationUnavailableError";
  }
}

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createAccessTokenVerifier(config: {
  issuer: string;
  audience: string;
  jwksUrl: string;
}): AccessTokenVerifier {
  return verifierFor(config, createRemoteJWKSet(new URL(config.jwksUrl)));
}

/** Same contract for an in-process issuer whose public keys are known locally. */
export function createLocalAccessTokenVerifier(config: {
  issuer: string;
  audience: string;
  keys: JSONWebKeySet;
}): AccessTokenVerifier {
  return verifierFor(config, createLocalJWKSet(config.keys));
}

/** Tries each trusted issuer; a token is accepted only by its own issuer's keys. */
export function combineVerifiers(
  verifiers: readonly AccessTokenVerifier[],
): AccessTokenVerifier {
  return {
    async verify(authorization) {
      for (const verifier of verifiers) {
        const principal = await verifier.verify(authorization);
        if (principal) return principal;
      }
      return null;
    },
  };
}

function verifierFor(
  config: { issuer: string; audience: string },
  keys: JWTVerifyGetKey,
): AccessTokenVerifier {
  return {
    async verify(authorization) {
      if (!authorization || !/^Bearer [^\s]+$/i.test(authorization))
        return null;
      try {
        const token = authorization.slice(7);
        const { payload, protectedHeader } = await jwtVerify(token, keys, {
          issuer: config.issuer,
          audience: config.audience,
          algorithms: ["RS256", "ES256"],
        });
        // The issuer's trusted adapter must map its user to a stable application principal ID.
        const id = payload.orion_principal_id;
        if (
          protectedHeader.typ !== "at+jwt" ||
          typeof payload.sub !== "string" ||
          payload.sub.length === 0 ||
          typeof payload.exp !== "number" ||
          typeof payload.iat !== "number" ||
          payload.iat > Math.floor(Date.now() / 1000) + 30 ||
          payload.exp <= payload.iat ||
          typeof id !== "string" ||
          !uuid.test(id) ||
          payload.orion_actor_type !== "human" ||
          typeof payload.scope !== "string"
        )
          return null;
        return {
          id,
          scopes: new Set(payload.scope.split(" ").filter(Boolean)),
          ...(typeof payload.sid === "string" && uuid.test(payload.sid)
            ? { sessionId: payload.sid }
            : {}),
        };
      } catch (error) {
        // Reject invalid credentials normally. Key retrieval, malformed trusted
        // JWKS data, and unexpected verifier failures must remain observable.
        if (
          error instanceof errors.JWTClaimValidationFailed ||
          error instanceof errors.JWTExpired ||
          error instanceof errors.JOSEAlgNotAllowed ||
          error instanceof errors.JOSENotSupported ||
          error instanceof errors.JWSInvalid ||
          error instanceof errors.JWTInvalid ||
          error instanceof errors.JWKSNoMatchingKey ||
          error instanceof errors.JWSSignatureVerificationFailed
        )
          return null;
        throw new AuthenticationUnavailableError(error);
      }
    },
  };
}

/**
 * Public verification key of the in-process IA-MNS issuer, derived from its
 * configured P-256 signing key (base64url PKCS#8 DER). `kid` is the RFC 7638
 * thumbprint, so the issuer and the verifier agree without sharing state.
 */
export function issuerPublicJwk(signingKey: string): JWK & { kid: string } {
  const privateKey = createPrivateKey({
    key: Buffer.from(signingKey, "base64url"),
    format: "der",
    type: "pkcs8",
  });
  if (
    privateKey.asymmetricKeyType !== "ec" ||
    privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  )
    throw new Error(
      "Invalid API configuration: identity signing key must be P-256",
    );
  const jwk = createPublicKey(privateKey).export({ format: "jwk" }) as {
    crv: string;
    kty: string;
    x: string;
    y: string;
  };
  const thumbprint = createHash("sha256")
    .update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }))
    .digest("base64url");
  return {
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
    kid: thumbprint,
    alg: "ES256",
    use: "sig",
  };
}
