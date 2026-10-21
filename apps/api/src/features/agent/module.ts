import rateLimit from "@fastify/rate-limit";
import { Value } from "typebox/value";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiModule, ModuleResources } from "../../module.js";
import { coreErrors, errorResponder } from "../../errors.js";
import {
  isLocalRequest,
  isDevelopmentTokenRequest,
} from "../../local-access.js";
import { currentTraceId } from "../../request-context.js";
import type { SourceSelection } from "../sales/sources.js";
import { agentFailureCode } from "./failures.js";
import { AgentFailure, agentErrors } from "./errors.js";
import { CorporateAgent, type AgentActor } from "./application.js";
import { AgentRepository } from "./prisma-repository.js";
import { createAgentPlanner } from "./planner.js";
import { createOpenAiModel } from "../../ai/openai.js";
import { createOpenAiConversationModel } from "../../ai/openai-conversation.js";
import { canReadReply } from "./evidence.js";
import type { AgentCapability } from "./capabilities.js";
import type { OperationalParameters } from "../../parameters.js";
import type { AccessResolver } from "../../access.js";
import type { PresentationPreferences } from "./preferences.js";
import { presentationPreferencesSchema } from "./preferences.js";
import { uploadAttachmentSchema } from "./attachments.js";
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
  uploadAttachmentOperation,
  deleteAttachmentOperation,
  setPreferencesOperation,
} from "./contracts.js";
const respond = errorResponder({ ...coreErrors, ...agentErrors });
export function createAgentModule(
  capabilityFactory: (resources: ModuleResources) => readonly AgentCapability[],
  injected?: CorporateAgent,
  developmentPermissions: readonly string[] = [],
  /** Composition's operational parameters (AI model and trace level). */
  parametersFor?: (resources: ModuleResources) => OperationalParameters,
  /**
   * Receives the activated agent so composition can hand other channels the
   * same instance (one turn lifecycle, concurrency limit and shutdown).
   */
  publish?: (
    resources: ModuleResources,
    agent: CorporateAgent | undefined,
  ) => void,
  /**
   * Current permissions and data scopes of an authenticated principal, from
   * identity. Without it (isolated tests, external issuers) the token scopes
   * apply without data restriction.
   */
  accessFor?: (resources: ModuleResources) => AccessResolver | undefined,
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
      const access = accessFor?.(resources);
      // Without composition parameters (isolated tests) the installation
      // defaults apply; composition always supplies them.
      const parameters = parametersFor?.(resources);
      const agent =
        injected ??
        (resources.database
          ? new CorporateAgent(
              new AgentRepository(resources.database),
              config.openaiApiKey
                ? createAgentPlanner(
                    createOpenAiModel(
                      config,
                      parameters
                        ? () => parameters.get("ai.model")
                        : config.openaiModel,
                    ),
                    capabilities,
                  )
                : undefined,
              capabilities,
              {
                conversation:
                  config.openaiApiKey && config.agentMode === "conversational"
                    ? createOpenAiConversationModel(
                        config,
                        parameters
                          ? () => parameters.get("ai.model")
                          : config.openaiModel,
                      )
                    : undefined,
                traceLevel: parameters
                  ? () => parameters.get("ai.traceLevel")
                  : config.aiTrace,
              },
            )
          : undefined);
      const configured = Boolean(agent && (injected || config.openaiApiKey));
      publish?.(resources, configured ? agent : undefined);
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
              // Content tracing, which an owner may enable at any time outside
              // production, writes with each turn outcome; refuse to start
              // against a schema without its table.
              await resources.database!
                .$queryRaw`SELECT turn_id, conversation_id, captured_at, trace FROM agent_turn_traces LIMIT 0`;
              // The model and trace level are read for every turn.
              if (parameters)
                await resources.database!
                  .$queryRaw`SELECT key, value, version, updated_by, updated_at FROM operational_parameters LIMIT 0`;
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
                    capabilities.flatMap((item) => [
                      item.permission,
                      ...Object.values(item.sourcePermissions ?? {}).map(
                        (info) => info.permission,
                      ),
                    ]),
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
              // Access is computed now from trusted identity state, so a
              // revoked or narrowed grant applies to the next request.
              const current = access ? await access(principal.id) : undefined;
              if (current === null) {
                const failure = respond(
                  "AUTHENTICATION_REQUIRED",
                  request.id,
                  currentTraceId(),
                );
                await reply.code(failure.status).send(failure.body);
                return;
              }
              actors.set(
                request,
                current
                  ? {
                      id: principal.id,
                      permissions: current.permissions,
                      scopes: current.scopes,
                    }
                  : { id: principal.id, permissions: principal.scopes },
              );
            };
            const report = (
              error: unknown,
              request: FastifyRequest,
              turnId: string,
            ): string => agentFailureCode(error, request.log, turnId);
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
                  capabilities: capabilities
                    .filter(
                      (item) =>
                        config.agentMode !== "legacy" ||
                        item.legacyRouting !== false,
                    )
                    .map(({ id, title, description, examples }) => ({
                      id,
                      title,
                      description,
                      examples: [...examples],
                    })),
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
                        turn.reply &&
                        !canReadReply(
                          turn.reply,
                          actor.permissions,
                          capabilities,
                          actor.scopes,
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
            scope.post<{ Params: { conversationId: string }; Body: unknown }>(
              uploadAttachmentOperation.url,
              {
                schema: uploadAttachmentOperation.schema,
                onRequest: authenticate,
                bodyLimit: 140000,
                preValidation: async (request, reply) => {
                  if (!Value.Check(uploadAttachmentSchema, request.body))
                    await handle(request, reply, () =>
                      Promise.reject(
                        new AgentFailure("AGENT_ATTACHMENT_INVALID"),
                      ),
                    );
                },
                config: {
                  rateLimit: {
                    max: 8,
                    timeWindow: "1 minute",
                    keyGenerator: (request) =>
                      actors.get(request)?.id ?? request.ip,
                  },
                },
              },
              (request, reply) =>
                handle(request, reply, () =>
                  requireAgent().repository.attach(
                    actors.get(request)!.id,
                    request.params.conversationId,
                    request.body,
                  ),
                ),
            );
            scope.delete<{
              Params: { conversationId: string; attachmentId: string };
            }>(
              deleteAttachmentOperation.url,
              {
                schema: deleteAttachmentOperation.schema,
                onRequest: authenticate,
              },
              (request, reply) =>
                handle(request, reply, async () => {
                  await requireAgent().repository.removeAttachment(
                    actors.get(request)!.id,
                    request.params.conversationId,
                    request.params.attachmentId,
                  );
                  return { deleted: true as const };
                }),
            );
            scope.patch<{
              Params: { conversationId: string };
              Body: PresentationPreferences;
            }>(
              setPreferencesOperation.url,
              {
                schema: setPreferencesOperation.schema,
                onRequest: authenticate,
                preValidation: async (request, reply) => {
                  if (!Value.Check(presentationPreferencesSchema, request.body))
                    await handle(request, reply, () =>
                      Promise.reject(
                        new AgentFailure("AGENT_REQUEST_CONFLICT"),
                      ),
                    );
                },
              },
              (request, reply) =>
                handle(request, reply, () =>
                  requireAgent().repository.preferences(
                    actors.get(request)!.id,
                    request.params.conversationId,
                    request.body,
                  ),
                ),
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
