import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import Fastify, { LogController, type FastifyHttpOptions } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { Logger } from "pino";
import { publicError, type CoreErrorCode } from "./errors.js";
import { Lifecycle, withDeadline } from "./lifecycle.js";
import { healthOperations } from "./health-contracts.js";
import { currentTraceId } from "./request-context.js";
import { AuthenticationUnavailableError } from "./authentication.js";
import { errorDiagnostics } from "./error-diagnostics.js";
import type { RegisteredModule } from "./module.js";
import {
  apiPrefix,
  framePolicy,
  resolveWebFile,
  type EmbedOrigins,
  type WebBuild,
} from "./web-hosting.js";

class SafeLogController extends LogController {
  constructor() {
    super({ disableRequestLogging: true, requestIdLogLabel: "request_id" });
  }
}

export function createApp(
  logger: Logger,
  lifecycle = new Lifecycle(),
  options: {
    modules?: readonly RegisteredModule[];
    /** Readiness of configured dependencies, such as the database. */
    checkReady?: () => Promise<boolean>;
    /** Exact proxy addresses/ranges whose forwarded headers are honored. */
    trustedProxies?: readonly string[];
    /** HTTPS listener material for the proxy-to-application hop. */
    https?: Readonly<{ key: Buffer; cert: Buffer }>;
    /** Serve this web build at the same origin; the API moves under /api. */
    web?: Readonly<{ build: WebBuild; embed: EmbedOrigins }>;
  } = {},
) {
  // The https option makes Fastify create an https.Server, which offers the
  // same surface the runtime uses (listen, close, closeAllConnections).
  const app = Fastify({
    loggerInstance: logger,
    logController: new SafeLogController(),
    genReqId: () => `req_${randomUUID()}`,
    requestTimeout: 30_000,
    connectionTimeout: 10_000,
    trustProxy: options.trustedProxies ? [...options.trustedProxies] : false,
    ...(options.https ? { https: { ...options.https } } : {}),
  } as FastifyHttpOptions<
    Server,
    Logger
  >).withTypeProvider<TypeBoxTypeProvider>();
  const prefix = options.web ? apiPrefix : "";
  const healthUrls = new Set(
    healthOperations.flatMap((operation) =>
      prefix ? [operation.url, `${prefix}${operation.url}`] : [operation.url],
    ),
  );
  const isHealth = (url: string) =>
    url.startsWith("/health/") || url.startsWith(`${prefix}/health/`);
  // Successful web file responses are as uninteresting as health probes.
  const webResponses = new WeakSet<object>();

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    if (
      (lifecycle.phase === "draining" || lifecycle.phase === "stopped") &&
      !isHealth(request.url)
    ) {
      reply
        .code(503)
        .send(publicError("SERVICE_UNAVAILABLE", request.id, currentTraceId()));
    }
  });

  // Only the embedded surfaces may be framed, by their own host (ADR-0023).
  // No response leaks a Referer: every same-origin write uses fetch(), whose
  // Origin header survives no-referrer (ADR-0029).
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-content-type-options", "nosniff");
    if (!reply.hasHeader("referrer-policy"))
      reply.header("referrer-policy", "no-referrer");
    if (!reply.hasHeader("content-security-policy"))
      reply.header(
        "content-security-policy",
        framePolicy("/", options.web?.embed ?? {}),
      );
  });

  app.addHook("onResponse", async (request, reply) => {
    if (
      reply.statusCode < 400 &&
      ((request.routeOptions.url !== undefined &&
        healthUrls.has(request.routeOptions.url)) ||
        webResponses.has(request))
    )
      return;
    // Never log URL, headers, bodies, or arbitrary errors here.
    request.log.info(
      {
        statusCode: reply.statusCode,
      },
      "http_request",
    );
  });

  app.setErrorHandler((error, request, reply) => {
    const validation =
      typeof error === "object" &&
      error !== null &&
      ("validation" in error ||
        ("code" in error && error.code === "FST_ERR_CTP_BODY_TOO_LARGE"));
    const rateLimited =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 429;
    const authenticationUnavailable =
      error instanceof AuthenticationUnavailableError;
    const code: CoreErrorCode = authenticationUnavailable
      ? "SERVICE_UNAVAILABLE"
      : rateLimited
        ? "RATE_LIMITED"
        : validation
          ? "VALIDATION_FAILED"
          : "INTERNAL_ERROR";
    const errorId =
      code === "INTERNAL_ERROR" || authenticationUnavailable
        ? `err_${randomUUID()}`
        : undefined;
    if (errorId) {
      request.log.error(
        {
          errorId,
          diagnostic: errorDiagnostics(error),
        },
        authenticationUnavailable
          ? "authentication_unavailable"
          : "unhandled_request_error",
      );
    }
    reply
      .code(
        authenticationUnavailable
          ? 503
          : rateLimited
            ? 429
            : validation
              ? 400
              : 500,
      )
      .send(publicError(code, request.id, currentTraceId(), errorId));
  });

  const web = options.web;
  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split("?", 1)[0];
    const file =
      web && (request.method === "GET" || request.method === "HEAD")
        ? resolveWebFile(web.build, pathname, request.headers.accept)
        : undefined;
    if (!file || !web) {
      reply
        .code(404)
        .send(publicError("RESOURCE_NOT_FOUND", request.id, currentTraceId()));
      return;
    }
    webResponses.add(request);
    reply
      .header("content-type", file.type)
      .header("etag", file.etag)
      .header(
        "cache-control",
        file.immutable ? "public, max-age=31536000, immutable" : "no-cache",
      )
      .header("content-security-policy", framePolicy(pathname, web.embed));
    if (request.headers["if-none-match"] === file.etag) {
      reply.code(304).send();
      return;
    }
    if (request.method === "HEAD")
      reply.code(200).header("content-length", file.body.length).send();
    else reply.code(200).send(file.body);
  });

  const registerHealth = (scope: typeof app) => {
    scope.get(
      healthOperations[0].url,
      { schema: healthOperations[0].schema },
      async (_request, reply) => {
        if (!lifecycle.startupOk) reply.code(503);
        return { status: lifecycle.startupOk ? "ok" : "unavailable" } as const;
      },
    );
    scope.get(
      healthOperations[1].url,
      { schema: healthOperations[1].schema },
      async (_request, reply) => {
        if (!lifecycle.live) reply.code(503);
        return { status: lifecycle.live ? "ok" : "unavailable" } as const;
      },
    );
    scope.get(
      healthOperations[2].url,
      { schema: healthOperations[2].schema },
      async (_request, reply) => {
        let ready = lifecycle.ready;
        if (ready && options.checkReady) {
          try {
            await withDeadline(
              options.checkReady().then((value) => {
                ready = value;
              }),
              500,
            );
          } catch {
            ready = false;
          }
        }
        if (!ready) reply.code(503);
        return { status: ready ? "ok" : "unavailable" } as const;
      },
    );
  };
  // Probes always answer at the root; the API contract follows the prefix.
  registerHealth(app);
  if (prefix)
    void app.register(
      (scope, _options, done) => {
        const api = scope as unknown as typeof app;
        registerHealth(api);
        for (const module of options.modules ?? []) module.register(api);
        done();
      },
      { prefix },
    );
  else for (const module of options.modules ?? []) module.register(app);
  return { app, lifecycle };
}
