import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import type { Principal } from "./domain.js";

export interface AccessTokenVerifier {
  verify(authorization: string | undefined): Promise<Principal | null>;
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
  const keys = createRemoteJWKSet(new URL(config.jwksUrl));
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
        // The issuer's trusted adapter must map its user to a stable Orion ID.
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
        const capabilities = new Set<"approval:review">();
        if (payload.scope.split(" ").includes("approval:review"))
          capabilities.add("approval:review");
        return { id, capabilities };
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
