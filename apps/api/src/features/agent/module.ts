import { randomUUID } from "node:crypto";
import rateLimit from "@fastify/rate-limit";
import { Value } from "typebox/value";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiModule, ModuleResources } from "../../module.js";
import { coreErrors, errorResponder } from "../../errors.js";
import {
  isLocalRequest,
  isDevelopmentTokenRequest,
} from "../../local-access.js";
import { errorDiagnostics } from "../../error-diagnostics.js";
import { currentTraceId } from "../../request-context.js";
import { SalesFailure } from "../sales/errors.js";
import type { SourceSelection } from "../sales/sources.js";
import { AgentFailure, agentErrors } from "./errors.js";
import { CorporateAgent, type AgentActor } from "./application.js";
import { AgentRepository } from "./prisma-repository.js";
import { createAgentPlanner } from "./planner.js";
import { createOpenAiModel } from "../../ai/openai.js";
import type { AgentCapability } from "./capabilities.js";
import {
  updateConversationOperation,
  searchConversationsOperation,
  conversationPatchSchema,
  type ConversationPatch,
  type ConversationScope,
  agentOperations,
  agentStatusOperation,
  createConversationOperation,
  listConversationsOperation,
  getConversationOperation,
  deleteConversationOperation,
  submitTurnOperation,
} from "./contracts.js";
const respond = errorResponder({ ...coreErrors, ...agentErrors });
export function createAgentModule(
  capabilityFactory: (resources: ModuleResources) => readonly AgentCapability[],
  injected?: CorporateAgent,
  developmentPermissions: readonly string[] = [],
): ApiModule {
  return {
    name: "agent",
    tag: "Agent",
    requires: [],
    operations: agentOperations,
    errors: agentErrors,
    activate(resources) {
      const config = resources.config;
      if (!config)
        throw new Error(
          "Invalid API configuration: agent requires configuration",
        );
      if (
        config.environment === "production" &&
        (!resources.database || !resources.verifier || !config.openaiApiKey)
      )
        throw new Error(
          "Invalid API configuration: agent requires database, authentication and OpenAI in production",
        );
      const capabilities =
        injected?.capabilities ?? capabilityFactory(resources);
      const agent =
        injected ??
        (resources.database
          ? new CorporateAgent(
              new AgentRepository(resources.database),
              config.openaiApiKey
                ? createAgentPlanner(createOpenAiModel(config), capabilities)
                : undefined,
              capabilities,
              { traceLevel: config.aiTrace },
            )
          : undefined);
      const configured = Boolean(agent && (injected || config.openaiApiKey));
      return {
        name: "agent",
        register(app) {
          app.addHook("onClose", async () => {
            await agent?.close();
          });
          if (resources.database)
            app.addHook("onReady", async () => {
              await resources.database!
                .$queryRaw`SELECT c.pinned, c.archived, c.title_manual, c.owner, c.contexts, c.version, c.active_turn_id, c.lease_until, t.reply, t.events, t.state, t.request_id, t.sequence, t.source FROM agent_conversations c LEFT JOIN agent_turns t ON t.conversation_id = c.id LIMIT 0`;
              // Content tracing writes with each turn outcome; refuse to start
              // against a schema without its table.
              if (config.aiTrace === "content")
                await resources.database!
                  .$queryRaw`SELECT turn_id, conversation_id, captured_at, trace FROM agent_turn_traces LIMIT 0`;
            });
          void app.register(async (scope) => {
            const actors = new WeakMap<FastifyRequest, AgentActor>();
            await scope.register(rateLimit, { global: false });
            const authenticate = async (
              request: FastifyRequest,
              reply: FastifyReply,
            ) => {
              reply.header("cache-control", "no-store");
              if (isDevelopmentTokenRequest(request, config)) {
                actors.set(request, {
                  id: "local-developer",
                  permissions: new Set(developmentPermissions),
                });
                return;
              }
              if (config.localAccess && isLocalRequest(request)) {
                actors.set(request, {
                  id: "local-developer",
                  permissions: new Set(
                    capabilities.map((item) => item.permission),
                  ),
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
              actors.set(request, {
                id: principal.id,
                permissions: principal.scopes,
              });
            };
            function report(
              error: unknown,
              request: FastifyRequest,
              turnId: string,
            ): string {
              if (
                error instanceof SalesFailure &&
                error.code !== "SALES_PROVIDER_UNAVAILABLE"
              )
                return error.code;
              if (
                error instanceof AgentFailure &&
                error.code !== "AGENT_PROVIDER_UNAVAILABLE"
              )
                return error.code;
              request.log.error(
                {
                  errorId: `err_${randomUUID()}`,
                  turnId,
                  ...(error instanceof SalesFailure
                    ? error.boundary
                    : {
                        provider:
                          error instanceof AgentFailure
                            ? "openai"
                            : "application",
                        stage: "execution",
                      }),
                  diagnostic: errorDiagnostics(error),
                },
                "agent_execution_failed",
              );
              return error instanceof SalesFailure
                ? error.code
                : error instanceof AgentFailure
                  ? error.code
                  : "INTERNAL_ERROR";
            }
            const requireAgent = () => {
              if (!agent) throw new AgentFailure("AGENT_NOT_CONFIGURED");
              return agent;
            };
            const handle = async (
              request: FastifyRequest,
              reply: FastifyReply,
              work: () => Promise<unknown>,
            ) => {
              try {
                return await work();
              } catch (error) {
                if (!(error instanceof AgentFailure)) throw error;
                const failure = respond(
                  error.code,
                  request.id,
                  currentTraceId(),
                );
                return reply.code(failure.status).send(failure.body);
              }
            };
            scope.get(
              agentStatusOperation.url,
              { schema: agentStatusOperation.schema },
              (_request, reply) => {
                reply.header("cache-control", "no-store");
                return {
                  configured,
                  accessMode: config.devAccessToken
                    ? "token"
                    : config.localAccess
                      ? "local"
                      : resources.verifier
                        ? "token"
                        : "unavailable",
                  capabilities: capabilities.map(
                    ({ id, title, description, examples }) => ({
                      id,
                      title,
                      description,
                      examples: [...examples],
                    }),
                  ),
                };
              },
            );
            scope.post(
              createConversationOperation.url,
              {
                schema: createConversationOperation.schema,
                onRequest: authenticate,
              },
              (request, reply) =>
                handle(request, reply, async () => {
                  const result = await requireAgent().repository.create(
                    actors.get(request)!.id,
                  );
                  reply.code(201);
                  return result;
                }),
            );
            scope.get<{
              Querystring: { cursor?: string; scope?: ConversationScope };
            }>(
              listConversationsOperation.url,
              {
                schema: listConversationsOperation.schema,
                onRequest: authenticate,
              },
              (request, reply) =>
                handle(request, reply, () =>
                  requireAgent().repository.list(
                    actors.get(request)!.id,
                    request.query.cursor,
                    { scope: request.query.scope },
                  ),
                ),
            );
            scope.get<{
              Params: { conversationId: string };
              Querystring: { beforeSequence?: number };
            }>(
              getConversationOperation.url,
              {
                schema: getConversationOperation.schema,
                onRequest: authenticate,
              },
              (request, reply) =>
                handle(request, reply, async () => {
                  const detail = await requireAgent().repository.detail(
                    actors.get(request)!.id,
                    request.params.conversationId,
                    request.query.beforeSequence,
                  );
                  const actor = actors.get(request)!;
                  if (
                    detail.turns.some(
                      (turn) =>
                        turn.reply?.capabilityId &&
                        !capabilities.some(
                          (capability) =>
                            capability.id === turn.reply!.capabilityId &&
                            actor.permissions.has(capability.permission),
                        ),
                    )
                  )
                    throw new AgentFailure("AGENT_ACCESS_DENIED");
                  return detail;
                }),
            );
            scope.patch<{
              Params: { conversationId: string };
              Body: ConversationPatch;
            }>(
              updateConversationOperation.url,
              {
                schema: updateConversationOperation.schema,
                onRequest: authenticate,
                preValidation: async (request, reply) => {
                  if (!Value.Check(conversationPatchSchema, request.body)) {
                    const failure = respond(
                      "VALIDATION_FAILED",
                      request.id,
                      currentTraceId(),
                    );
                    return reply.code(failure.status).send(failure.body);
                  }
                },
              },
              (request, reply) =>
                handle(request, reply, () =>
                  requireAgent().repository.update(
                    actors.get(request)!.id,
                    request.params.conversationId,
                    request.body,
                  ),
                ),
            );
            scope.post<{ Body: { query: string; cursor?: string } }>(
              searchConversationsOperation.url,
              {
                schema: searchConversationsOperation.schema,
                onRequest: authenticate,
                preValidation: async (request, reply) => {
                  if (
                    !Value.Check(
                      searchConversationsOperation.schema.body!,
                      request.body,
                    )
                  ) {
                    const failure = respond(
                      "VALIDATION_FAILED",
                      request.id,
                      currentTraceId(),
                    );
                    return reply.code(failure.status).send(failure.body);
                  }
                },
                bodyLimit: 5000,
                config: {
                  rateLimit: {
                    max: 60,
                    timeWindow: "1 minute",
                    keyGenerator: (request) =>
                      actors.get(request)?.id ?? request.ip,
                  },
                },
              },
              (request, reply) =>
                handle(request, reply, () =>
                  requireAgent().repository.list(
                    actors.get(request)!.id,
                    request.body.cursor,
                    { scope: "all", search: request.body.query },
                  ),
                ),
            );
            scope.delete<{ Params: { conversationId: string } }>(
              deleteConversationOperation.url,
              {
                schema: deleteConversationOperation.schema,
                onRequest: authenticate,
              },
              (request, reply) =>
                handle(request, reply, async () => {
                  await requireAgent().repository.remove(
                    actors.get(request)!.id,
                    request.params.conversationId,
                  );
                  return { deleted: true };
                }),
            );
            scope.post<{
              Params: { conversationId: string };
              Body: {
                message: string;
                requestId: string;
                source?: SourceSelection;
              };
            }>(
              submitTurnOperation.url,
              {
                schema: submitTurnOperation.schema,
                onRequest: authenticate,
                bodyLimit: 12000,
                config: {
                  rateLimit: {
                    max: 15,
                    timeWindow: "1 minute",
                    keyGenerator: (request) =>
                      actors.get(request)?.id ?? request.ip,
                  },
                },
              },
              (request, reply) =>
                handle(request, reply, async () => {
                  const result = await requireAgent().submit(
                    actors.get(request)!,
                    request.params.conversationId,
                    request.body.requestId,
                    request.body.message.trim(),
                    request.body.source ?? "sankhya",
                    (error, turnId) => report(error, request, turnId),
                    // Allowlisted metadata only: decisions, issue codes,
                    // timings and token counts, never user text or results.
                    (trace, turnId) =>
                      request.log.info({ turnId, ai: trace }, "ai_turn_traced"),
                  );
                  reply.code(202);
                  return result;
                }),
            );
          });
        },
      };
    },
  };
}
