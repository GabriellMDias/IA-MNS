import {
  combineVerifiers,
  createAccessTokenVerifier,
  createLocalAccessTokenVerifier,
  issuerPublicJwk,
  type AccessTokenVerifier,
} from "./authentication.js";
import type { ServerConfig } from "./config.js";
import type { Database } from "./database.js";
import type { RegisteredModule } from "./module.js";
import { apiModules } from "./modules.js";

/**
 * Token verification and module activation for a validated configuration.
 * Shared by the server and the configuration check, so a check that passes
 * exercises the same production requirements as startup. Nothing here opens a
 * connection. Activation is loaded on use, as `main.ts` loads composition.
 */
export async function composeModules(
  config: ServerConfig,
  database: Database | undefined,
): Promise<{ verifier?: AccessTokenVerifier; modules: RegisteredModule[] }> {
  // Trusted issuers: the in-process IA-MNS identity issuer and/or an external one.
  const verifiers = [
    ...(config.publicOrigin && config.identitySigningKey
      ? [
          createLocalAccessTokenVerifier({
            issuer: config.publicOrigin,
            audience: config.identityAudience,
            keys: { keys: [issuerPublicJwk(config.identitySigningKey)] },
          }),
        ]
      : []),
    ...(config.tokenIssuer && config.tokenAudience && config.tokenJwksUrl
      ? [
          createAccessTokenVerifier({
            issuer: config.tokenIssuer,
            audience: config.tokenAudience,
            jwksUrl: config.tokenJwksUrl,
          }),
        ]
      : []),
  ];
  const verifier =
    verifiers.length === 0
      ? undefined
      : verifiers.length === 1
        ? verifiers[0]
        : combineVerifiers(verifiers);
  const { activateModules } = await import("./module.js");
  const modules = activateModules(
    apiModules,
    { database, verifier, config },
    config.environment,
  );
  return { ...(verifier ? { verifier } : {}), modules };
}
