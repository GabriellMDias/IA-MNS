import { Type, type Static } from "typebox";
import type { ApiOperation } from "../../module.js";
import { errorEnvelopeSchema } from "../../errors.js";
import {
  resultSchema,
  salesAnswerSchema,
  sourceSelectionSchema,
} from "../sales/contracts.js";
const object = { additionalProperties: false };
const textOrNull = Type.Union([Type.String(), Type.Null()]);
const replyKindSchema = Type.Union([
  Type.Literal("conversation"),
  Type.Literal("answer"),
  Type.Literal("clarification"),
  Type.Literal("unavailable"),
]);
const replyMessageSchema = Type.String({ maxLength: 10000 });
const suggestionsSchema = Type.Array(Type.String({ maxLength: 2000 }), {
  maxItems: 3,
});
export const agentReplySchema = Type.Object(
  {
    kind: replyKindSchema,
    message: replyMessageSchema,
    capabilityId: textOrNull,
    result: Type.Union([salesAnswerSchema, Type.Null()]),
    suggestions: suggestionsSchema,
  },
  object,
);
/** Version 2: sales results are per-source answers. */
export const storedReplySchema = Type.Object(
  { version: Type.Literal(2), payload: agentReplySchema },
  object,
);
/**
 * Version 1 replies held one Sankhya result and were written before the
 * source selector existed. They are read and upgraded, never written.
 */
export const storedReplyV1Schema = Type.Object(
  {
    version: Type.Literal(1),
    payload: Type.Object(
      {
        kind: replyKindSchema,
        message: replyMessageSchema,
        capabilityId: textOrNull,
        result: Type.Union([resultSchema, Type.Null()]),
        suggestions: suggestionsSchema,
      },
      object,
    ),
  },
  object,
);
export const eventSchema = Type.Object(
  {
    stage: Type.Union([
      Type.Literal("thinking"),
      Type.Literal("interpreting_sales"),
      Type.Literal("querying_sales"),
      Type.Literal("organizing"),
    ]),
    message: Type.String(),
    at: Type.String({ format: "date-time" }),
  },
  object,
);
export const turnSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    requestId: Type.String({ format: "uuid" }),
    sequence: Type.Integer({ minimum: 1 }),
    question: Type.String(),
    source: sourceSelectionSchema,
    state: Type.Union([
      Type.Literal("running"),
      Type.Literal("completed"),
      Type.Literal("failed"),
      Type.Literal("interrupted"),
    ]),
    reply: Type.Union([agentReplySchema, Type.Null()]),
    events: Type.Array(eventSchema, { maxItems: 20 }),
    failureCode: textOrNull,
    createdAt: Type.String({ format: "date-time" }),
    finishedAt: textOrNull,
  },
  object,
);
export type TurnView = Static<typeof turnSchema>;
export const conversationSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    title: Type.String(),
    pinned: Type.Boolean(),
    archived: Type.Boolean(),
    updatedAt: Type.String({ format: "date-time" }),
  },
  object,
);
export const detailSchema = Type.Object(
  {
    conversation: conversationSchema,
    turns: Type.Array(turnSchema, { maxItems: 40 }),
    olderThan: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  },
  object,
);
const errors = {
  400: errorEnvelopeSchema,
  401: errorEnvelopeSchema,
  403: errorEnvelopeSchema,
  404: errorEnvelopeSchema,
  409: errorEnvelopeSchema,
  429: errorEnvelopeSchema,
  500: errorEnvelopeSchema,
  503: errorEnvelopeSchema,
};
export const conversationScopeSchema = Type.Union([
  Type.Literal("active"),
  Type.Literal("pinned"),
  Type.Literal("archived"),
  Type.Literal("all"),
]);
export type ConversationScope = Static<typeof conversationScopeSchema>;
export const conversationPatchSchema = Type.Object(
  {
    title: Type.Optional(
      Type.String({ minLength: 1, maxLength: 100, pattern: "\\S" }),
    ),
    pinned: Type.Optional(Type.Boolean()),
    archived: Type.Optional(Type.Boolean()),
  },
  { ...object, minProperties: 1 },
);
export type ConversationPatch = Static<typeof conversationPatchSchema>;
const params = Type.Object(
  { conversationId: Type.String({ format: "uuid" }) },
  object,
);
function operation(
  method: ApiOperation["method"],
  url: string,
  operationId: string,
  description: string,
  schema: ApiOperation["schema"],
  authenticated = true,
): ApiOperation {
  return {
    method,
    url,
    operationId,
    description,
    schema,
    ...(authenticated ? { authentication: "bearer" as const } : {}),
  };
}
export const agentStatusOperation = operation(
  "GET",
  "/agent/status",
  "getAgentStatus",
  "Agent availability and implemented capability catalog. No credentials or conversation data.",
  {
    response: {
      200: Type.Object(
        {
          configured: Type.Boolean(),
          accessMode: Type.Union([
            Type.Literal("local"),
            Type.Literal("token"),
            Type.Literal("unavailable"),
          ]),
          capabilities: Type.Array(
            Type.Object(
              {
                id: Type.String(),
                title: Type.String(),
                description: Type.String(),
                examples: Type.Array(Type.String()),
              },
              object,
            ),
          ),
        },
        object,
      ),
    },
  },
  false,
);
export const createConversationOperation = operation(
  "POST",
  "/agent/conversations",
  "createAgentConversation",
  "Create an actor-owned persistent conversation. No ERP operation.",
  {
    body: Type.Object({}, object),
    response: { 201: conversationSchema, ...errors },
  },
);
export const listConversationsOperation = operation(
  "GET",
  "/agent/conversations",
  "listAgentConversations",
  "List the actor's conversations, favorites first then newest, using an opaque bounded cursor. Scope defaults to active; pinned and archived views preserve owned history.",
  {
    querystring: Type.Object(
      {
        cursor: Type.Optional(Type.String({ maxLength: 1000 })),
        scope: Type.Optional(conversationScopeSchema),
      },
      object,
    ),
    response: {
      200: Type.Object(
        {
          items: Type.Array(conversationSchema, { maxItems: 30 }),
          nextCursor: textOrNull,
        },
        object,
      ),
      ...errors,
    },
  },
);
export const getConversationOperation = operation(
  "GET",
  "/agent/conversations/:conversationId",
  "getAgentConversation",
  "Read up to 40 turns, including actual progress and stored outcomes. beforeSequence retrieves older turns. Expired execution leases become interrupted and are never automatically rerun.",
  {
    params,
    querystring: Type.Object(
      { beforeSequence: Type.Optional(Type.Integer({ minimum: 1 })) },
      object,
    ),
    response: { 200: detailSchema, ...errors },
  },
);
export const updateConversationOperation = operation(
  "PATCH",
  "/agent/conversations/:conversationId",
  "updateAgentConversation",
  "Set an owned inactive conversation title, favorite or archive state. Explicit assignments are idempotent; archive preserves history and context.",
  {
    params,
    body: conversationPatchSchema,
    response: { 200: conversationSchema, ...errors },
  },
);
export const searchConversationsOperation = operation(
  "POST",
  "/agent/conversations/search",
  "searchAgentConversations",
  "Read owner-scoped titles and sent questions using a bounded case-insensitive literal substring. Search and its filter-bound cursor stay in the request body, not URLs. No provider execution.",
  {
    body: Type.Object(
      {
        query: Type.String({ minLength: 2, maxLength: 100, pattern: "\\S" }),
        cursor: Type.Optional(Type.String({ maxLength: 1000 })),
      },
      object,
    ),
    response: {
      200: Type.Object(
        {
          items: Type.Array(conversationSchema, { maxItems: 30 }),
          nextCursor: textOrNull,
        },
        object,
      ),
      ...errors,
    },
  },
);
export const deleteConversationOperation = operation(
  "DELETE",
  "/agent/conversations/:conversationId",
  "deleteAgentConversation",
  "Hard-delete an owned inactive conversation and all its turns/context. Does not erase external provider copies or backups.",
  {
    params,
    response: {
      200: Type.Object({ deleted: Type.Literal(true) }, object),
      ...errors,
    },
  },
);
export const submitTurnOperation = operation(
  "POST",
  "/agent/conversations/:conversationId/turns",
  "submitAgentTurn",
  "Persist and accept one bounded turn. source is the sales source selected in the interface (default sankhya); the message never changes it. Replay the same requestId, message and source to recover an unknown acceptance outcome; never repeat provider execution. Poll conversation detail for actual progress and outcome. Requires the selected capability permission at execution.",
  {
    params,
    body: Type.Object(
      {
        message: Type.String({ minLength: 1, maxLength: 2000, pattern: "\\S" }),
        requestId: Type.String({ format: "uuid" }),
        source: Type.Optional(sourceSelectionSchema),
      },
      object,
    ),
    response: { 202: turnSchema, ...errors },
  },
);
export const agentOperations = [
  agentStatusOperation,
  createConversationOperation,
  listConversationsOperation,
  getConversationOperation,
  updateConversationOperation,
  searchConversationsOperation,
  deleteConversationOperation,
  submitTurnOperation,
];
