import rateLimit from "@fastify/rate-limit";
import type { JSONWebKeySet } from "jose";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiModule, ModuleResources } from "../../module.js";
import { coreErrors, errorResponder } from "../../errors.js";
import { currentTraceId } from "../../request-context.js";
import type { ServerConfig } from "../../config.js";
import {
  IdentityFailure,
  identityErrors,
  type IdentityErrorCode,
} from "./errors.js";
import { IdentityRepository, type OwnershipTransfer } from "./repository.js";
import { AccessTokenIssuer } from "./tokens.js";
import { PdtIdentityClient } from "./pdt.js";
import { SankhyaAssertionVerifier } from "./sankhya.js";
import {
  createSankhyaDirectory,
  type SankhyaDirectory,
} from "./sankhya-directory.js";
import {
  IdentityService,
  type FlowOutcome,
  type IdentityProviders,
  type Intent,
} from "./service.js";
import {
  parseProviderGrants,
  providerGrantPolicy,
  providers,
  validateCatalog,
  defaultSecurityPolicy,
  lifetimes,
  type MfaRequirement,
  type PermissionDescriptor,
  type Provider,
  type Surface,
} from "./domain.js";
import * as contracts from "./contracts.js";

const respond = errorResponder({ ...coreErrors, ...identityErrors });
type CookieKind =
  "session" | "pdt" | "sankhya" | "provision" | "merge" | "device";

/**
 * What identity needs from the composition: moving another module's
 * Person-owned data when two profiles are consolidated, and optionally a
 * Sankhya user directory factory (replaceable in tests).
 */
export type IdentityPorts = {
  transferOwnership: OwnershipTransfer;
  sankhyaDirectory?: (config: ServerConfig) => SankhyaDirectory;
};

/**
 * HTTPS origins (required in production) use __Host- cookies with Secure. A
 * plain-HTTP loopback development origin uses the same names without the
 * prefix, because browsers do not reliably keep Secure cookies over HTTP.
 */
function cookieJar(origin: string) {
  const secure = origin.startsWith("https:");
  const name = (kind: CookieKind) => `${secure ? "__Host-" : ""}ia-mns-${kind}`;
  return {
    name,
    read(request: FastifyRequest, kind: CookieKind) {
      return parseCookies(request.headers.cookie)[name(kind)];
    },
    write(
      reply: FastifyReply,
      kind: CookieKind,
      value: string,
      sameSite: "Strict" | "Lax" | "None",
      maxAgeSeconds: number,
    ) {
      const previous = reply.getHeader("set-cookie");
      const cookies = Array.isArray(previous)
        ? previous
        : previous
          ? [String(previous)]
          : [];
      // SameSite=None is only honored with Secure; plain-HTTP development keeps Lax.
      const site = !secure && sameSite === "None" ? "Lax" : sameSite;
      cookies.push(
        `${name(kind)}=${value}; Path=/; HttpOnly${secure ? "; Secure" : ""}; SameSite=${site}; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
      );
      reply.header("set-cookie", cookies);
    },
  };
}

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0)
      result[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return result;
}

/** Builds the identity service for this configuration, or undefined when unconfigured. */
export function identityServiceFor(
  config: ServerConfig,
  resources: ModuleResources,
  catalog: readonly PermissionDescriptor[],
  ports: IdentityPorts,
  options: { fetcher?: typeof fetch; now?: () => Date } = {},
): IdentityService | undefined {
  if (
    !resources.database ||
    !config.publicOrigin ||
    !config.identitySigningKey ||
    !config.identityEncryptionKey
  )
    return undefined;
  validateCatalog(catalog);
  const policy = providerGrantPolicy(
    catalog,
    config.providerGrants === undefined
      ? undefined
      : parseProviderGrants(config.providerGrants),
  );
  const configured: IdentityProviders = {};
  if (
    config.pdtBaseUrl &&
    config.pdtIssuer &&
    config.pdtClientId &&
    config.pdtClientSecret &&
    config.pdtRedirectUri
  )
    configured.pdt = {
      client: new PdtIdentityClient(
        {
          baseUrl: config.pdtBaseUrl,
          issuer: config.pdtIssuer,
          clientId: config.pdtClientId,
          clientSecret: config.pdtClientSecret,
          redirectUri: config.pdtRedirectUri,
        },
        options.fetcher,
      ),
      embedOrigin: config.pdtEmbedOrigin ?? null,
      directCallback:
        new URL(config.pdtRedirectUri).origin === config.publicOrigin,
    };
  if (config.sankhyaIdentityIssuer)
    configured.sankhya = {
      ...(config.sankhyaIdentityKeys
        ? {
            connector: new SankhyaAssertionVerifier({
              issuer: config.sankhyaIdentityIssuer,
              audience: config.identityAudience,
              keys: JSON.parse(config.sankhyaIdentityKeys) as JSONWebKeySet,
            }),
          }
        : {}),
      ...(config.sankhyaDirectoryView
        ? {
            directory: (ports.sankhyaDirectory ?? createSankhyaDirectory)(
              config,
            ),
          }
        : {}),
      issuer: config.sankhyaIdentityIssuer,
      authorizeUrl: config.sankhyaIdentityAuthorizeUrl ?? null,
      embedOrigin: config.sankhyaEmbedOrigin ?? null,
    };
  return new IdentityService(
    new IdentityRepository(resources.database),
    new AccessTokenIssuer({
      signingKey: config.identitySigningKey,
      issuer: config.publicOrigin,
      audience: config.identityAudience,
    }),
    catalog,
    policy,
    Buffer.from(config.identityEncryptionKey, "base64url"),
    configured,
    ports.transferOwnership,
    config.environment === "production",
    options.now,
  );
}

export function createIdentityModule(
  catalog: readonly PermissionDescriptor[],
  ports: IdentityPorts,
  injected?: (resources: ModuleResources) => IdentityService | undefined,
): ApiModule {
  return {
    name: "identity",
    tag: "Identity",
    requires: [],
    operations: contracts.identityOperations,
    errors: identityErrors,
    activate(resources) {
      const config = resources.config;
      if (!config)
        throw new Error(
          "Invalid API configuration: identity requires configuration",
        );
      if (config.publicOrigin && !resources.database)
        throw new Error(
          "Invalid API configuration: identity requires the database",
        );
      const service = injected
        ? injected(resources)
        : identityServiceFor(config, resources, catalog, ports);
      const origin = config.publicOrigin ?? "";
      const jar = cookieJar(origin);
      const setCookie = (
        reply: FastifyReply,
        kind: CookieKind,
        value: string,
        sameSite: "Strict" | "Lax" | "None",
        maxAgeSeconds: number,
      ) => jar.write(reply, kind, value, sameSite, maxAgeSeconds);
      return {
        name: "identity",
        register(app) {
          let pruning: NodeJS.Timeout | undefined;
          if (service) {
            app.addHook("onReady", (done) => {
              pruning = setInterval(
                () => void service.prune().catch(() => undefined),
                3600_000,
              );
              pruning.unref();
              done();
            });
            app.addHook("onClose", async () => {
              clearInterval(pruning);
              await service.close();
            });
          }
          void app.register(async (scope) => {
            await scope.register(rateLimit, { global: false });
            scope.addContentTypeParser(
              "application/x-www-form-urlencoded",
              { parseAs: "string", bodyLimit: 8192 },
              (_request, body, done) =>
                done(
                  null,
                  Object.fromEntries(new URLSearchParams(String(body))),
                ),
            );
            scope.addHook("onRequest", async (_request, reply) => {
              reply.header("cache-control", "no-store");
              reply.header("referrer-policy", "no-referrer");
            });
            const limit = (max: number) => ({
              config: { rateLimit: { max, timeWindow: "1 minute" } },
            });

            const fail = (
              request: FastifyRequest,
              reply: FastifyReply,
              code:
                | IdentityErrorCode
                | "AUTHENTICATION_REQUIRED"
                | "VALIDATION_FAILED",
            ) => {
              const failure = respond(code, request.id, currentTraceId());
              return reply.code(failure.status).send(failure.body);
            };
            const handle = async (
              request: FastifyRequest,
              reply: FastifyReply,
              work: (service: IdentityService) => Promise<unknown>,
            ) => {
              if (!service)
                return fail(request, reply, "IDENTITY_NOT_CONFIGURED");
              try {
                return await work(service);
              } catch (error) {
                if (error instanceof IdentityFailure) {
                  if (error.code === "IDENTITY_PROVIDER_UNAVAILABLE")
                    request.log.warn(
                      { provider: "identity" },
                      "identity_provider_unavailable",
                    );
                  return fail(request, reply, error.code);
                }
                throw error;
              }
            };
            /** Cookie-authenticated endpoints accept only same-origin web requests. */
            const sameOriginWeb = (request: FastifyRequest) => {
              const site = request.headers["sec-fetch-site"];
              const requestOrigin = request.headers.origin;
              return (
                request.headers["x-ia-mns-client"] === "web" &&
                (site === undefined || site === "same-origin") &&
                (requestOrigin === undefined || requestOrigin === origin)
              );
            };
            const bearerSession = async (
              request: FastifyRequest,
            ): Promise<string | undefined> => {
              const principal = await resources.verifier?.verify(
                request.headers.authorization,
              );
              return principal?.sessionId;
            };
            const requireSession = async (
              request: FastifyRequest,
              reply: FastifyReply,
            ) => {
              const sessionId = await bearerSession(request);
              if (!sessionId) {
                await fail(request, reply, "AUTHENTICATION_REQUIRED");
                return undefined;
              }
              return sessionId;
            };
            /** The refresh cookie lives exactly as long as the session may. */
            const sessionCookieSeconds = (expiresAt: Date | null) =>
              expiresAt
                ? Math.max(0, (expiresAt.getTime() - Date.now()) / 1000)
                : defaultSecurityPolicy.sessionMaxMinutes * 60;
            const deliver = (reply: FastifyReply, outcome: FlowOutcome) => {
              if (outcome.kind !== "authenticated") return outcome;
              if (outcome.refreshToken)
                setCookie(
                  reply,
                  "session",
                  outcome.refreshToken,
                  "Strict",
                  sessionCookieSeconds(outcome.sessionExpiresAt),
                );
              if (outcome.rememberDevice)
                setCookie(
                  reply,
                  "device",
                  outcome.rememberDevice.token,
                  "Strict",
                  outcome.rememberDevice.days * 24 * 3600,
                );
              return {
                kind: outcome.kind,
                accessToken: outcome.accessToken,
                expiresIn: outcome.expiresIn,
                provisioned: outcome.provisioned,
              };
            };
            const redirect = (reply: FastifyReply, path: string) =>
              reply.code(303).header("location", `${origin}${path}`).send();
            /** Browser navigation result after a direct provider callback. */
            const finishNavigation = async (
              request: FastifyRequest,
              reply: FastifyReply,
              work: (service: IdentityService) => Promise<FlowOutcome>,
            ) => {
              if (!service)
                return redirect(reply, "/entrar?erro=IDENTITY_NOT_CONFIGURED");
              try {
                const outcome = await work(service);
                if (outcome.kind === "authenticated") {
                  deliver(reply, outcome);
                  if (outcome.resumeFirstAccess)
                    return redirect(reply, "/entrar/primeiro-acesso");
                  if (outcome.provisioned)
                    return redirect(reply, "/conta?novo=1");
                  if (outcome.linked)
                    return redirect(
                      reply,
                      `/conta?vinculado=${outcome.linked}`,
                    );
                  return redirect(reply, "/");
                }
                if (outcome.kind === "merge_available") {
                  setCookie(
                    reply,
                    "merge",
                    outcome.ticket,
                    "Strict",
                    lifetimes.provisionTicketMs / 1000,
                  );
                  return redirect(reply, `/conta?unificar=${outcome.provider}`);
                }
                if (outcome.kind === "provision_required") {
                  setCookie(
                    reply,
                    "provision",
                    outcome.ticket,
                    "Strict",
                    lifetimes.provisionTicketMs / 1000,
                  );
                  return redirect(reply, "/entrar/primeiro-acesso");
                }
                if (outcome.kind === "linked")
                  return redirect(
                    reply,
                    `/conta?vinculado=${outcome.provider}`,
                  );
                if (outcome.kind === "reauthenticated")
                  return redirect(reply, "/conta?confirmado=1");
                return redirect(reply, "/entrar?erro=IDENTITY_FLOW_EXPIRED");
              } catch (error) {
                if (error instanceof IdentityFailure)
                  return redirect(reply, `/entrar?erro=${error.code}`);
                throw error;
              }
            };

            scope.get(
              contracts.statusOperation.url,
              { schema: contracts.statusOperation.schema },
              () => ({
                configured: Boolean(service),
                methods: {
                  local: Boolean(service),
                  pdt: Boolean(service?.directSignInAvailable("pdt")),
                  sankhya: Boolean(service?.directSignInAvailable("sankhya")),
                },
                sankhyaSessionTrust: config.sankhyaSessionTrust,
                embedHosts: {
                  pdt: service?.providers.pdt?.embedOrigin ?? null,
                  sankhya: service?.providers.sankhya?.embedOrigin ?? null,
                },
              }),
            );

            scope.post<{
              Body: { login: string; password: string; surface?: Surface };
            }>(
              contracts.localLoginOperation.url,
              { schema: contracts.localLoginOperation.schema, ...limit(10) },
              (request, reply) =>
                handle(request, reply, async (svc) =>
                  deliver(
                    reply,
                    await svc.loginLocal(
                      request.body.login,
                      request.body.password,
                      request.body.surface ?? "direct",
                      // Remembered browsers apply only to same-origin sign-in.
                      sameOriginWeb(request)
                        ? jar.read(request, "device")
                        : undefined,
                    ),
                  ),
                ),
            );
            scope.post<{
              Body: {
                challenge: string;
                code: string;
                rememberDevice?: boolean;
              };
            }>(
              contracts.mfaOperation.url,
              { schema: contracts.mfaOperation.schema, ...limit(10) },
              (request, reply) =>
                handle(request, reply, async (svc) =>
                  deliver(
                    reply,
                    await svc.completeMfa(
                      request.body.challenge,
                      request.body.code,
                      request.body.rememberDevice === true &&
                        sameOriginWeb(request),
                    ),
                  ),
                ),
            );
            scope.post<{ Body: { challenge: string } }>(
              contracts.signInEnrollmentStartOperation.url,
              {
                schema: contracts.signInEnrollmentStartOperation.schema,
                ...limit(10),
              },
              (request, reply) =>
                handle(request, reply, (svc) =>
                  svc.startSignInEnrollment(request.body.challenge),
                ),
            );
            scope.post<{
              Body: { challenge: string; setup: string; code: string };
            }>(
              contracts.signInEnrollmentConfirmOperation.url,
              {
                schema: contracts.signInEnrollmentConfirmOperation.schema,
                ...limit(10),
              },
              (request, reply) =>
                handle(request, reply, async (svc) => {
                  const result = await svc.completeSignInEnrollment(
                    request.body.challenge,
                    request.body.setup,
                    request.body.code,
                  );
                  deliver(reply, result);
                  return {
                    recoveryCodes: result.recoveryCodes,
                    accessToken: result.accessToken,
                    expiresIn: result.expiresIn,
                  };
                }),
            );
            scope.post<{ Body: { active?: boolean } }>(
              contracts.refreshOperation.url,
              { schema: contracts.refreshOperation.schema, ...limit(60) },
              (request, reply) =>
                handle(request, reply, async (svc) => {
                  const refresh = jar.read(request, "session");
                  if (!refresh || !sameOriginWeb(request))
                    throw new IdentityFailure("IDENTITY_INVALID_CREDENTIALS");
                  try {
                    const result = await svc.refresh(
                      refresh,
                      request.body.active !== false,
                    );
                    // A concurrent renewal keeps the cookie the winner set.
                    if (result.refreshToken)
                      setCookie(
                        reply,
                        "session",
                        result.refreshToken,
                        "Strict",
                        sessionCookieSeconds(result.sessionExpiresAt),
                      );
                    return {
                      accessToken: result.accessToken,
                      expiresIn: result.expiresIn,
                    };
                  } catch (error) {
                    setCookie(reply, "session", "", "Strict", 0);
                    throw error;
                  }
                }),
            );
            scope.post(
              contracts.logoutOperation.url,
              { schema: contracts.logoutOperation.schema, ...limit(30) },
              (request, reply) =>
                handle(request, reply, async (svc) => {
                  const sessionId = await bearerSession(request);
                  if (sessionId) await svc.logout(sessionId);
                  setCookie(reply, "session", "", "Strict", 0);
                  return { ok: true as const };
                }),
            );

            scope.post<{
              Params: { provider: Provider };
              Body: {
                intent: Intent;
                mode: "direct" | "embedded";
                invitation?: string;
                resumeFirstAccess?: boolean;
              };
            }>(
              contracts.providerStartOperation.url,
              { schema: contracts.providerStartOperation.schema, ...limit(20) },
              (request, reply) =>
                handle(request, reply, async (svc) => {
                  const intent = request.body.intent;
                  const bound = intent === "link" || intent === "reauth";
                  const sessionId = bound
                    ? await bearerSession(request)
                    : undefined;
                  if (bound && !sessionId)
                    throw new IdentityFailure("IDENTITY_SESSION_EXPIRED");
                  if (intent === "invite" && !request.body.invitation)
                    throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
                  if (request.body.mode === "direct") {
                    // A browser already signed in must not silently get a
                    // second profile on an unknown account's first access.
                    const signedInPersonId =
                      intent === "login" && sameOriginWeb(request)
                        ? await svc.signedInPerson(jar.read(request, "session"))
                        : null;
                    const started = await svc.startDirect(
                      request.params.provider,
                      intent,
                      sessionId,
                      {
                        invitation: request.body.invitation,
                        signedInPersonId,
                        resumeFirstAccess: request.body.resumeFirstAccess,
                      },
                    );
                    // PDT returns with a top-level GET (Lax); the Om posts a cross-site form (None).
                    setCookie(
                      reply,
                      request.params.provider,
                      started.binding,
                      request.params.provider === "pdt" ? "Lax" : "None",
                      lifetimes.providerFlowMs / 1000,
                    );
                    return {
                      mode: "direct" as const,
                      redirectUrl: started.url,
                    };
                  }
                  return {
                    mode: "embedded" as const,
                    ...(await svc.startEmbedded(
                      request.params.provider,
                      intent,
                      sessionId,
                      { invitation: request.body.invitation },
                    )),
                  };
                }),
            );
            scope.get<{
              Querystring: { code?: string; state?: string; iss?: string };
            }>(
              contracts.pdtCallbackOperation.url,
              { schema: contracts.pdtCallbackOperation.schema, ...limit(30) },
              (request, reply) => {
                const binding = jar.read(request, "pdt") ?? "";
                setCookie(reply, "pdt", "", "Lax", 0);
                const { code, state, iss } = request.query;
                return finishNavigation(request, reply, (svc) => {
                  if (!code || !state || !iss || !binding)
                    throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
                  return svc.completePdt({
                    lookup: { state, binding },
                    code,
                    iss,
                  });
                });
              },
            );
            scope.post<{ Body: { assertion: string; state: string } }>(
              contracts.sankhyaCallbackOperation.url,
              {
                schema: contracts.sankhyaCallbackOperation.schema,
                ...limit(30),
              },
              (request, reply) => {
                const binding = jar.read(request, "sankhya") ?? "";
                setCookie(reply, "sankhya", "", "None", 0);
                return finishNavigation(request, reply, (svc) => {
                  if (!binding)
                    throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
                  return svc.completeSankhya({
                    lookup: { state: request.body.state, binding },
                    assertion: request.body.assertion,
                  });
                });
              },
            );
            scope.post<{
              Params: { provider: Provider };
              Body: {
                pendingId: string;
                state?: string;
                code?: string;
                iss?: string;
                assertion?: string;
              };
            }>(
              contracts.embeddedCompleteOperation.url,
              {
                schema: contracts.embeddedCompleteOperation.schema,
                ...limit(30),
              },
              (request, reply) =>
                handle(request, reply, async (svc) => {
                  const body = request.body;
                  if (request.params.provider === "pdt") {
                    if (!body.code || !body.state || !body.iss)
                      throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
                    return deliver(
                      reply,
                      await svc.completePdt({
                        lookup: {
                          pendingId: body.pendingId,
                          state: body.state,
                        },
                        code: body.code,
                        iss: body.iss,
                      }),
                    );
                  }
                  if (!body.assertion)
                    throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
                  return deliver(
                    reply,
                    await svc.completeSankhya({
                      lookup: { pendingId: body.pendingId },
                      assertion: body.assertion,
                    }),
                  );
                }),
            );

            const provisionTicket = (
              request: FastifyRequest<{ Body: { ticket?: string } }>,
              reply: FastifyReply,
            ) => {
              if (request.body.ticket) return request.body.ticket;
              const cookie = jar.read(request, "provision");
              setCookie(reply, "provision", "", "Strict", 0);
              if (!cookie || !sameOriginWeb(request))
                throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
              return cookie;
            };
            scope.post<{ Body: { ticket?: string } }>(
              contracts.provisionInspectOperation.url,
              {
                schema: contracts.provisionInspectOperation.schema,
                ...limit(20),
              },
              (request, reply) =>
                handle(request, reply, (svc) => {
                  const ticket =
                    request.body.ticket ??
                    (sameOriginWeb(request)
                      ? jar.read(request, "provision")
                      : undefined);
                  if (!ticket)
                    throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
                  return svc.inspectProvision(ticket);
                }),
            );
            scope.post<{ Body: { ticket?: string } }>(
              contracts.provisionCreateOperation.url,
              {
                schema: contracts.provisionCreateOperation.schema,
                ...limit(10),
              },
              (request, reply) =>
                handle(request, reply, async (svc) =>
                  deliver(
                    reply,
                    await svc.provisionCreate(provisionTicket(request, reply)),
                  ),
                ),
            );
            scope.post<{ Body: { ticket?: string } }>(
              contracts.provisionLinkOperation.url,
              { schema: contracts.provisionLinkOperation.schema, ...limit(10) },
              async (request, reply) => {
                const sessionId = await requireSession(request, reply);
                if (!sessionId) return reply;
                return handle(request, reply, (svc) =>
                  svc.provisionLink(provisionTicket(request, reply), sessionId),
                );
              },
            );
            scope.post<{ Body: { ticket?: string } }>(
              contracts.mergeOperation.url,
              { schema: contracts.mergeOperation.schema, ...limit(10) },
              async (request, reply) => {
                const sessionId = await requireSession(request, reply);
                if (!sessionId) return reply;
                return handle(request, reply, (svc) => {
                  let ticket = request.body.ticket;
                  if (!ticket) {
                    ticket = jar.read(request, "merge");
                    setCookie(reply, "merge", "", "Strict", 0);
                    if (!ticket || !sameOriginWeb(request))
                      throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
                  }
                  return svc.mergeSelf(ticket, sessionId);
                });
              },
            );

            scope.post<{
              Body: {
                purpose: "bootstrap" | "enrollment" | "reset" | "link";
                token: string;
              };
            }>(
              contracts.invitationInspectOperation.url,
              {
                schema: contracts.invitationInspectOperation.schema,
                ...limit(20),
              },
              (request, reply) =>
                handle(request, reply, (svc) =>
                  svc.inspectInvitation(
                    request.body.purpose,
                    request.body.token,
                  ),
                ),
            );
            scope.post<{
              Body: {
                token: string;
                displayName: string;
                login: string;
                password: string;
              };
            }>(
              contracts.bootstrapOperation.url,
              { schema: contracts.bootstrapOperation.schema, ...limit(5) },
              (request, reply) =>
                handle(request, reply, async (svc) =>
                  deliver(
                    reply,
                    await svc.completeBootstrap(
                      request.body.token,
                      request.body.displayName,
                      request.body.login,
                      request.body.password,
                    ),
                  ),
                ),
            );
            scope.post<{
              Body: {
                purpose: "enrollment" | "reset";
                token: string;
                login: string;
                password: string;
              };
            }>(
              contracts.invitationCompleteOperation.url,
              {
                schema: contracts.invitationCompleteOperation.schema,
                ...limit(10),
              },
              (request, reply) =>
                handle(request, reply, async (svc) =>
                  deliver(
                    reply,
                    await svc.completeInvitation(
                      request.body.purpose,
                      request.body.token,
                      request.body.login,
                      request.body.password,
                    ),
                  ),
                ),
            );

            // ---------- authenticated self-service ----------
            type Authed<T = unknown> = (
              svc: IdentityService,
              sessionId: string,
              request: FastifyRequest<T & object>,
            ) => Promise<unknown>;
            const authed =
              <T>(work: Authed<T>) =>
              async (
                request: FastifyRequest<T & object>,
                reply: FastifyReply,
              ) => {
                const sessionId = await requireSession(request, reply);
                if (!sessionId) return reply;
                return handle(request, reply, (svc) =>
                  work(svc, sessionId, request),
                );
              };
            const ok = { ok: true as const };
            const iso = (value: Date) => value.toISOString();
            const personView = (
              detail: Pick<
                Awaited<ReturnType<IdentityService["me"]>>,
                "snapshot" | "permissions" | "sessions"
              >,
              current: string | null,
            ) => ({
              id: detail.snapshot.id,
              displayName: detail.snapshot.displayName,
              status: detail.snapshot.status,
              owner: detail.snapshot.roles.includes("owner"),
              grants: detail.snapshot.grants.map((item) => item.permission),
              permissions: detail.permissions,
              links: detail.snapshot.links.map((link) => ({
                id: link.id,
                provider: link.provider,
                label: link.label,
                establishedBy: link.establishedBy,
                linkedAt: iso(link.linkedAt),
                lastVerifiedAt: iso(link.lastVerifiedAt),
              })),
              local: detail.snapshot.local
                ? {
                    login: detail.snapshot.local.login,
                    totpEnabled: detail.snapshot.local.totpEnabled,
                    recoveryCodesRemaining:
                      detail.snapshot.local.recoveryCodesRemaining,
                  }
                : null,
              sessions: detail.sessions.map((item) => ({
                id: item.id,
                method: item.method,
                surface: item.surface as Surface,
                assurance: item.assurance as "single" | "mfa",
                createdAt: iso(item.createdAt),
                lastSeenAt: iso(item.lastSeenAt),
                expiresAt: iso(item.expiresAt),
                current: item.id === current,
              })),
            });

            scope.get(
              contracts.meOperation.url,
              { schema: contracts.meOperation.schema },
              authed(async (svc, sessionId) => {
                const detail = await svc.me(sessionId);
                return {
                  person: personView(detail, sessionId),
                  session: {
                    id: detail.session.id,
                    method: detail.session.method,
                    surface: detail.session.surface,
                    assurance: detail.session.assurance,
                    authenticatedAt: iso(detail.session.authTime),
                  },
                  rememberedDevices: detail.rememberedDevices,
                  linkableProviders: providers.filter(
                    (item) =>
                      svc.directSignInAvailable(item) &&
                      !detail.snapshot.links.some(
                        (link) => link.provider === item,
                      ),
                  ),
                };
              }),
            );
            scope.patch<{ Body: { displayName: string } }>(
              contracts.renameOperation.url,
              { schema: contracts.renameOperation.schema },
              authed<{ Body: { displayName: string } }>(
                async (svc, sessionId, request) => {
                  await svc.rename(sessionId, request.body.displayName);
                  return ok;
                },
              ),
            );
            scope.post<{ Body: { password: string; code?: string } }>(
              contracts.reauthenticateOperation.url,
              {
                schema: contracts.reauthenticateOperation.schema,
                ...limit(10),
              },
              authed<{ Body: { password: string; code?: string } }>(
                async (svc, sessionId, request) => {
                  const result = await svc.reauthenticateLocal(
                    sessionId,
                    request.body.password,
                    request.body.code,
                  );
                  return {
                    accessToken: result.accessToken,
                    expiresIn: result.expiresIn,
                  };
                },
              ),
            );
            scope.put<{ Body: { password: string; login?: string } }>(
              contracts.passwordOperation.url,
              { schema: contracts.passwordOperation.schema, ...limit(10) },
              authed<{ Body: { password: string; login?: string } }>(
                async (svc, sessionId, request) => {
                  await svc.setPassword(
                    sessionId,
                    request.body.password,
                    request.body.login,
                  );
                  return ok;
                },
              ),
            );
            scope.post(
              contracts.totpStartOperation.url,
              { schema: contracts.totpStartOperation.schema, ...limit(10) },
              authed(async (svc, sessionId) => svc.startTotpSetup(sessionId)),
            );
            scope.post<{ Body: { setup: string; code: string } }>(
              contracts.totpConfirmOperation.url,
              { schema: contracts.totpConfirmOperation.schema, ...limit(10) },
              authed<{ Body: { setup: string; code: string } }>(
                async (svc, sessionId, request) => {
                  const result = await svc.confirmTotpSetup(
                    sessionId,
                    request.body.setup,
                    request.body.code,
                  );
                  return {
                    recoveryCodes: result.recoveryCodes,
                    accessToken: result.accessToken,
                    expiresIn: result.expiresIn,
                  };
                },
              ),
            );
            scope.delete(
              contracts.totpDisableOperation.url,
              { schema: contracts.totpDisableOperation.schema },
              authed(async (svc, sessionId) => {
                await svc.disableTotp(sessionId);
                return ok;
              }),
            );
            scope.post(
              contracts.recoveryCodesOperation.url,
              { schema: contracts.recoveryCodesOperation.schema, ...limit(5) },
              authed(async (svc, sessionId) => ({
                recoveryCodes: await svc.regenerateRecoveryCodes(sessionId),
              })),
            );
            scope.delete<{ Params: { linkId: string } }>(
              contracts.unlinkOperation.url,
              { schema: contracts.unlinkOperation.schema },
              authed<{ Params: { linkId: string } }>(
                async (svc, sessionId, request) => {
                  await svc.unlink(sessionId, request.params.linkId);
                  return ok;
                },
              ),
            );
            scope.delete<{ Params: { sessionId: string } }>(
              contracts.revokeSessionOperation.url,
              { schema: contracts.revokeSessionOperation.schema },
              authed<{ Params: { sessionId: string } }>(
                async (svc, sessionId, request) => {
                  await svc.revokeOwnSession(
                    sessionId,
                    request.params.sessionId,
                  );
                  return ok;
                },
              ),
            );

            scope.delete(
              contracts.forgetDevicesOperation.url,
              { schema: contracts.forgetDevicesOperation.schema },
              authed(async (svc, sessionId) => ({
                forgotten: await svc.forgetRememberedDevices(sessionId),
              })),
            );

            // ---------- owner administration ----------
            scope.get(
              contracts.adminPolicyOperation.url,
              { schema: contracts.adminPolicyOperation.schema },
              authed(async (svc, sessionId) => {
                const view = await svc.securityPolicyView(sessionId);
                return {
                  ...view,
                  updatedAt: view.updatedAt ? iso(view.updatedAt) : null,
                  history: view.history.map((item) => ({
                    ...item,
                    occurredAt: iso(item.occurredAt),
                  })),
                };
              }),
            );
            type PolicyBody = {
              Body: {
                sessionMaxMinutes: number;
                idleTimeoutMinutes: number;
                recentAuthMinutes: number;
                adminRecentAuthMinutes: number;
                mfaRequirement: MfaRequirement;
                rememberDeviceDays: number;
                acknowledgeReducedSecurity?: boolean;
              };
            };
            scope.put<PolicyBody>(
              contracts.adminUpdatePolicyOperation.url,
              { schema: contracts.adminUpdatePolicyOperation.schema },
              authed<PolicyBody>(async (svc, sessionId, request) => {
                const { acknowledgeReducedSecurity, ...policy } = request.body;
                return svc.updateSecurityPolicy(
                  sessionId,
                  policy,
                  acknowledgeReducedSecurity === true,
                );
              }),
            );
            type PersonParams = { Params: { personId: string } };
            const capabilities = (svc: IdentityService) => ({
              sankhyaDirectory: svc.directoryAvailable(),
              linkInvitations: providers.filter((item) =>
                svc.signInAvailable(item),
              ),
            });
            scope.get<{ Querystring: { query?: string; cursor?: string } }>(
              contracts.adminListOperation.url,
              { schema: contracts.adminListOperation.schema },
              authed<{ Querystring: { query?: string; cursor?: string } }>(
                async (svc, sessionId, request) => ({
                  ...(await svc.listPersons(
                    sessionId,
                    request.query.query,
                    request.query.cursor,
                  )),
                  capabilities: capabilities(svc),
                }),
              ),
            );
            scope.get<PersonParams>(
              contracts.adminDetailOperation.url,
              { schema: contracts.adminDetailOperation.schema },
              authed<PersonParams>(async (svc, sessionId, request) => {
                const detail = await svc.personDetail(
                  sessionId,
                  request.params.personId,
                );
                return {
                  person: personView(detail, null),
                  capabilities: capabilities(svc),
                  catalog: svc.catalog.map((item) => ({
                    permission: item.permission,
                    title: item.title,
                    access: item.access,
                    autoGrantProviders: svc.policy
                      .filter((rule) => rule.permission === item.permission)
                      .map((rule) => rule.provider),
                  })),
                  audit: detail.audit.map((event) => ({
                    action: event.action,
                    occurredAt: iso(event.occurredAt),
                    byOwner:
                      event.actorPersonId !== null &&
                      event.actorPersonId !== event.targetPersonId,
                    details: event.details as Record<
                      string,
                      string | number | boolean | null
                    >,
                  })),
                };
              }),
            );
            type CreateBody = {
              Body: {
                displayName: string;
                localInvitation: boolean;
                sankhyaUser?: string;
                linkInvitations?: Provider[];
              };
            };
            scope.post<CreateBody>(
              contracts.adminCreateOperation.url,
              { schema: contracts.adminCreateOperation.schema },
              async (request, reply) => {
                const sessionId = await requireSession(request, reply);
                if (!sessionId) return reply;
                return handle(request, reply, async (svc) => {
                  const created = await svc.createPerson(sessionId, {
                    displayName: request.body.displayName,
                    localInvitation: request.body.localInvitation,
                    sankhyaCodusu: request.body.sankhyaUser,
                    linkInvitations: request.body.linkInvitations ?? [],
                  });
                  reply.code(201);
                  return created;
                });
              },
            );
            scope.get<{ Querystring: { query: string } }>(
              contracts.adminDirectoryOperation.url,
              {
                schema: contracts.adminDirectoryOperation.schema,
                ...limit(30),
              },
              authed<{ Querystring: { query: string } }>(
                async (svc, sessionId, request) => ({
                  items: await svc.searchSankhyaDirectory(
                    sessionId,
                    request.query.query,
                  ),
                }),
              ),
            );
            scope.post<PersonParams & { Body: { codusu: string } }>(
              contracts.adminLinkSankhyaOperation.url,
              { schema: contracts.adminLinkSankhyaOperation.schema },
              authed<PersonParams & { Body: { codusu: string } }>(
                async (svc, sessionId, request) => {
                  await svc.linkSankhyaFromDirectory(
                    sessionId,
                    request.params.personId,
                    request.body.codusu,
                  );
                  return ok;
                },
              ),
            );
            scope.post<PersonParams & { Body: { provider: Provider } }>(
              contracts.adminLinkInvitationOperation.url,
              { schema: contracts.adminLinkInvitationOperation.schema },
              authed<PersonParams & { Body: { provider: Provider } }>(
                async (svc, sessionId, request) => ({
                  token: await svc.issueLinkInvitation(
                    sessionId,
                    request.params.personId,
                    request.body.provider,
                  ),
                }),
              ),
            );
            scope.post<PersonParams>(
              contracts.adminEnrollmentOperation.url,
              { schema: contracts.adminEnrollmentOperation.schema },
              authed<PersonParams>(async (svc, sessionId, request) => ({
                enrollmentToken: await svc.issueEnrollment(
                  sessionId,
                  request.params.personId,
                ),
              })),
            );
            scope.post<PersonParams & { Body: { sourcePersonId: string } }>(
              contracts.adminMergeOperation.url,
              { schema: contracts.adminMergeOperation.schema },
              authed<PersonParams & { Body: { sourcePersonId: string } }>(
                async (svc, sessionId, request) => {
                  await svc.adminMerge(
                    sessionId,
                    request.params.personId,
                    request.body.sourcePersonId,
                  );
                  return ok;
                },
              ),
            );
            type GrantParams = {
              Params: { personId: string; permission: string };
            };
            scope.put<GrantParams>(
              contracts.adminGrantOperation.url,
              { schema: contracts.adminGrantOperation.schema },
              authed<GrantParams>(async (svc, sessionId, request) => {
                await svc.setGrant(
                  sessionId,
                  request.params.personId,
                  request.params.permission,
                  true,
                );
                return ok;
              }),
            );
            scope.delete<GrantParams>(
              contracts.adminRevokeGrantOperation.url,
              { schema: contracts.adminRevokeGrantOperation.schema },
              authed<GrantParams>(async (svc, sessionId, request) => {
                await svc.setGrant(
                  sessionId,
                  request.params.personId,
                  request.params.permission,
                  false,
                );
                return ok;
              }),
            );
            scope.put<PersonParams>(
              contracts.adminOwnerOperation.url,
              { schema: contracts.adminOwnerOperation.schema },
              authed<PersonParams>(async (svc, sessionId, request) => {
                await svc.setOwner(sessionId, request.params.personId, true);
                return ok;
              }),
            );
            scope.delete<PersonParams>(
              contracts.adminRemoveOwnerOperation.url,
              { schema: contracts.adminRemoveOwnerOperation.schema },
              authed<PersonParams>(async (svc, sessionId, request) => {
                await svc.setOwner(sessionId, request.params.personId, false);
                return ok;
              }),
            );
            scope.patch<
              PersonParams & { Body: { status: "active" | "disabled" } }
            >(
              contracts.adminStatusOperation.url,
              { schema: contracts.adminStatusOperation.schema },
              authed<
                PersonParams & { Body: { status: "active" | "disabled" } }
              >(async (svc, sessionId, request) => {
                await svc.setPersonStatus(
                  sessionId,
                  request.params.personId,
                  request.body.status,
                );
                return ok;
              }),
            );
            scope.delete<{ Params: { personId: string; linkId: string } }>(
              contracts.adminUnlinkOperation.url,
              { schema: contracts.adminUnlinkOperation.schema },
              authed<{ Params: { personId: string; linkId: string } }>(
                async (svc, sessionId, request) => {
                  await svc.adminUnlink(
                    sessionId,
                    request.params.personId,
                    request.params.linkId,
                  );
                  return ok;
                },
              ),
            );
            scope.post<PersonParams>(
              contracts.adminResetOperation.url,
              { schema: contracts.adminResetOperation.schema },
              authed<PersonParams>(async (svc, sessionId, request) => ({
                resetToken: await svc.resetLocal(
                  sessionId,
                  request.params.personId,
                ),
              })),
            );
            scope.delete<PersonParams>(
              contracts.adminRevokeSessionsOperation.url,
              { schema: contracts.adminRevokeSessionsOperation.schema },
              authed<PersonParams>(async (svc, sessionId, request) => ({
                revoked: await svc.revokePersonSessions(
                  sessionId,
                  request.params.personId,
                ),
              })),
            );
          });
        },
      };
    },
  };
}
