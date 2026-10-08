import { randomUUID } from "node:crypto";
import {
  isLocalRequest,
  isDevelopmentTokenRequest,
} from "../../local-access.js";
import rateLimit from "@fastify/rate-limit";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { ApiModule, ModuleResources } from "../../module.js";
import type { ServerConfig } from "../../config.js";
import { coreErrors, errorResponder } from "../../errors.js";
import { currentTraceId } from "../../request-context.js";
import { errorDiagnostics } from "../../error-diagnostics.js";
import { SalesChat, authorizeSales, type SalesActor } from "./application.js";
import { SalesFailure, salesErrors } from "./errors.js";
import {
  chatOperation,
  deleteOperation,
  statusOperation,
} from "./contracts.js";
import { createOpenAiModel } from "../../ai/openai.js";
import { createModelInterpreter } from "./interpreter.js";
import { createSalesReaders } from "./readers.js";

const respond = errorResponder({ ...coreErrors, ...salesErrors });
export function providersConfigured(config: ServerConfig) {
  return Boolean(
    config.openaiApiKey &&
    config.sankhyaUser &&
    config.sankhyaPassword &&
    config.sankhyaConnectString,
  );
}

export function createSalesModule(
  injected?:
    SalesChat | ((resources: ModuleResources) => SalesChat | undefined),
): ApiModule {
  return {
    name: "sales",
    tag: "Sales",
    requires: [],
    operations: [statusOperation, chatOperation, deleteOperation],
    errors: salesErrors,
    activate(resources) {
      const config = resources.config;
      if (!config)
        throw new Error(
          "Invalid API configuration: sales requires runtime configuration",
        );
      if (
        config.environment === "production" &&
        (!resources.verifier || !providersConfigured(config))
      )
        throw new Error(
          "Invalid API configuration: sales requires authentication and providers in production",
        );
      const supplied =
        typeof injected === "function" ? injected(resources) : injected;
      const configured = supplied !== undefined || providersConfigured(config);
      const chat =
        supplied ??
        (configured
          ? new SalesChat(
              createModelInterpreter(
                createOpenAiModel(config, config.openaiModel),
              ),
              createSalesReaders(config),
            )
          : undefined);
      const actors = new WeakMap<FastifyRequest, SalesActor>();
      return {
        name: "sales",
        register(app) {
          app.addHook("onClose", async () => {
            await chat?.close();
          });
          void app.register(async (instance) => {
            const scope = instance.withTypeProvider<TypeBoxTypeProvider>();
            await scope.register(rateLimit, {
              global: false,
              hook: "preHandler",
              max: 15,
              timeWindow: "1 minute",
            });
            const authenticate = async (
              request: FastifyRequest,
              reply: FastifyReply,
            ) => {
              reply.header("cache-control", "no-store");
              if (
                (config.localAccess && isLocalRequest(request)) ||
                isDevelopmentTokenRequest(request, config)
              ) {
                actors.set(request, {
                  id: "local-developer",
                  canReadSales: true,
                });
                return;
              }
              const principal = await resources.verifier?.verify(
                request.headers.authorization,
              );
              if (!principal) {
                const failure = respond(
                  "AUTHENTICATION_REQUIRED",
                  request.id,
                  currentTraceId(),
                );
                await reply.code(failure.status).send(failure.body);
                return;
              }
              const actor = {
                id: principal.id,
                canReadSales: principal.scopes.has("sales:read"),
              };
              try {
                authorizeSales(actor);
              } catch (error) {
                if (!(error instanceof SalesFailure)) throw error;
                const response = respond(
                  error.code,
                  request.id,
                  currentTraceId(),
                );
                await reply.code(response.status).send(response.body);
                return;
              }
              actors.set(request, actor);
            };
            function failure(error: SalesFailure, request: FastifyRequest) {
              const errorId =
                error.code === "SALES_PROVIDER_UNAVAILABLE"
                  ? `err_${randomUUID()}`
                  : undefined;
              if (errorId)
                request.log.error(
                  {
                    errorId,
                    ...error.boundary,
                    diagnostic: errorDiagnostics(error.cause),
                  },
                  "sales_provider_unavailable",
                );
              return respond(error.code, request.id, currentTraceId(), errorId);
            }
            scope.get(
              statusOperation.url,
              { schema: statusOperation.schema },
              (_request, reply) => {
                reply.header("cache-control", "no-store");
                return {
                  configured,
                  accessMode: config.devAccessToken
                    ? ("token" as const)
                    : config.localAccess
                      ? ("local" as const)
                      : resources.verifier
                        ? ("token" as const)
                        : ("unavailable" as const),
                };
              },
            );
            scope.post(
              chatOperation.url,
              {
                schema: chatOperation.schema,
                bodyLimit: 12000,
                onRequest: authenticate,
                config: {
                  rateLimit: {
                    max: 15,
                    timeWindow: "1 minute",
                    keyGenerator: (request) =>
                      actors.get(request)?.id ?? request.ip,
                  },
                },
              },
              async (request, reply) => {
                // The foundation's short socket inactivity timeout would close
                // real HTTP connections while the bounded providers are busy.
                const controller = new AbortController();
                const abort = () => controller.abort();
                reply.raw.setTimeout(95000, abort);
                const timeout = setTimeout(abort, 90000);
                request.raw.on("aborted", abort);
                reply.raw.on("close", abort);
                try {
                  if (!chat) throw new SalesFailure("SALES_NOT_CONFIGURED");
                  return await chat.ask(
                    actors.get(request)!,
                    request.body.message,
                    request.body.conversationId,
                    controller.signal,
                  );
                } catch (error) {
                  if (!(error instanceof SalesFailure)) throw error;
                  const response = failure(error, request);
                  reply.code(response.status);
                  return response.body;
                } finally {
                  clearTimeout(timeout);
                  request.raw.off("aborted", abort);
                  reply.raw.off("close", abort);
                }
              },
            );
            scope.delete(
              deleteOperation.url,
              { schema: deleteOperation.schema, onRequest: authenticate },
              (request, reply) => {
                try {
                  if (!chat)
                    throw new SalesFailure("SALES_CONVERSATION_EXPIRED");
                  chat.forget(
                    actors.get(request)!,
                    request.params.conversationId,
                  );
                  return { forgotten: true as const };
                } catch (error) {
                  if (!(error instanceof SalesFailure)) throw error;
                  const response = failure(error, request);
                  reply.code(response.status);
                  return response.body;
                }
              },
            );
          });
        },
      };
    },
  };
}
export const salesModule = createSalesModule();
