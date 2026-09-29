import { randomUUID } from "node:crypto";
import Fastify, { LogController } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { Logger } from "pino";
import { publicError, type ErrorCode } from "./errors.js";
import { Lifecycle, withDeadline } from "./lifecycle.js";
import { registerApprovalRoutes } from "./features/approval-requests/routes.js";
import type { ApprovalRequestService } from "./features/approval-requests/service.js";
import type { AccessTokenVerifier } from "./features/approval-requests/authentication.js";
import { healthOperations } from "./health-contracts.js";
import { currentTraceId } from "./request-context.js";
import { AuthenticationUnavailableError } from "./features/approval-requests/authentication.js";
import { errorDiagnostics } from "./error-diagnostics.js";

class SafeLogController extends LogController {
  constructor() {
    super({ disableRequestLogging: true, requestIdLogLabel: "request_id" });
  }
}

export function createApp(
  logger: Logger,
  lifecycle = new Lifecycle(),
  feature?: {
    service: ApprovalRequestService;
    verifier: AccessTokenVerifier;
    checkReady?: () => Promise<boolean>;
    rateLimit?: { max: number; timeWindow: number };
  },
) {
  const app = Fastify({
    loggerInstance: logger,
    logController: new SafeLogController(),
    genReqId: () => `req_${randomUUID()}`,
    requestTimeout: 30_000,
    connectionTimeout: 10_000,
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    if (
      (lifecycle.phase === "draining" || lifecycle.phase === "stopped") &&
      !request.url.startsWith("/health/")
    ) {
      reply
        .code(503)
        .send(publicError("SERVICE_UNAVAILABLE", request.id, currentTraceId()));
    }
  });

  app.addHook("onResponse", async (request, reply) => {
    if (
      reply.statusCode < 400 &&
      healthOperations.some(
        (operation) => operation.url === request.routeOptions.url,
      )
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
      typeof error === "object" && error !== null && "validation" in error;
    const rateLimited =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 429;
    const authenticationUnavailable =
      error instanceof AuthenticationUnavailableError;
    const code: ErrorCode = authenticationUnavailable
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

  app.setNotFoundHandler((request, reply) => {
    reply
      .code(404)
      .send(publicError("RESOURCE_NOT_FOUND", request.id, currentTraceId()));
  });

  app.get(
    healthOperations[0].url,
    { schema: healthOperations[0].schema },
    async (_request, reply) => {
      if (!lifecycle.startupOk) reply.code(503);
      return { status: lifecycle.startupOk ? "ok" : "unavailable" } as const;
    },
  );
  app.get(
    healthOperations[1].url,
    { schema: healthOperations[1].schema },
    async (_request, reply) => {
      if (!lifecycle.live) reply.code(503);
      return { status: lifecycle.live ? "ok" : "unavailable" } as const;
    },
  );
  app.get(
    healthOperations[2].url,
    { schema: healthOperations[2].schema },
    async (_request, reply) => {
      let ready = lifecycle.ready;
      if (ready && feature?.checkReady) {
        try {
          await withDeadline(
            feature.checkReady().then((value) => {
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
  if (feature)
    registerApprovalRoutes(
      app,
      feature.service,
      feature.verifier,
      feature.rateLimit,
    );
  return { app, lifecycle };
}
