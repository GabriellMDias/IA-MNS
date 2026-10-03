import { Type } from "typebox";
import { errorEnvelopeSchema } from "../../errors.js";
import type { ApiOperation } from "../../module.js";

const object = { additionalProperties: false };
const nullableText = Type.Union([Type.String(), Type.Null()]);
export const querySchema = Type.Object(
  {
    productSearch: nullableText,
    startDate: Type.String(),
    endDate: Type.String(),
    metric: Type.Union([
      Type.Literal("net_value"),
      Type.Literal("quantity"),
      Type.Literal("weight"),
    ]),
    groupBy: Type.Union([
      Type.Literal("month"),
      Type.Literal("product"),
      Type.Literal("total"),
    ]),
    comparison: Type.Union([
      Type.Literal("none"),
      Type.Literal("previous_year"),
      Type.Literal("previous_period"),
    ]),
  },
  object,
);
const rowSchema = Type.Object(
  {
    period: Type.String(),
    product: nullableText,
    unit: Type.String(),
    value: Type.String(),
  },
  object,
);
export const resultSchema = Type.Object(
  {
    query: querySchema,
    rows: Type.Array(rowSchema),
    products: Type.Array(
      Type.Object({ code: Type.String(), description: Type.String() }, object),
    ),
    totals: Type.Array(
      Type.Object(
        {
          unit: Type.String(),
          value: Type.String(),
          previousValue: nullableText,
          changePercent: nullableText,
        },
        object,
      ),
    ),
    comparison: Type.Union([
      Type.Object(
        {
          startDate: Type.String(),
          endDate: Type.String(),
          rows: Type.Array(rowSchema),
        },
        object,
      ),
      Type.Null(),
    ]),
    warnings: Type.Array(Type.String()),
  },
  object,
);
export const requestSchema = Type.Object(
  {
    message: Type.String({ minLength: 1, maxLength: 2000 }),
    conversationId: Type.Optional(Type.String({ format: "uuid" })),
  },
  object,
);
export const replySchema = Type.Object(
  {
    conversationId: Type.String({ format: "uuid" }),
    kind: Type.Union([
      Type.Literal("answer"),
      Type.Literal("clarification"),
      Type.Literal("unsupported"),
    ]),
    message: Type.String(),
    result: Type.Union([resultSchema, Type.Null()]),
    suggestions: Type.Array(Type.String(), { maxItems: 3 }),
  },
  object,
);
export const statusSchema = Type.Object(
  {
    configured: Type.Boolean(),
    accessMode: Type.Union([
      Type.Literal("local"),
      Type.Literal("token"),
      Type.Literal("unavailable"),
    ]),
  },
  object,
);
const responses = {
  400: errorEnvelopeSchema,
  401: errorEnvelopeSchema,
  403: errorEnvelopeSchema,
  409: errorEnvelopeSchema,
  410: errorEnvelopeSchema,
  429: errorEnvelopeSchema,
  500: errorEnvelopeSchema,
  503: errorEnvelopeSchema,
};
export const statusOperation = {
  method: "GET",
  url: "/sales/status",
  operationId: "getSalesStatus",
  description:
    "Returns configuration presence and the required access mode; contains no credentials or sales data.",
  schema: { response: { 200: statusSchema } },
} as const satisfies ApiOperation;
export const chatOperation = {
  method: "POST",
  url: "/sales/chat",
  operationId: "askSalesQuestion",
  authentication: "bearer",
  description:
    "Interprets a Portuguese sales question and executes a fixed read-only sales query. Context is actor-owned, in memory, expires after 30 minutes idle and is limited to 12 questions. Local development access is explicitly restricted to loopback. Requires sales:read otherwise.",
  schema: { body: requestSchema, response: { 200: replySchema, ...responses } },
  expectedErrors: [
    "AUTHENTICATION_REQUIRED",
    "SALES_ACCESS_DENIED",
    "SALES_NOT_CONFIGURED",
    "SALES_PROVIDER_UNAVAILABLE",
    "SALES_QUERY_INVALID",
    "SALES_RESULT_TOO_LARGE",
    "SALES_CONVERSATION_EXPIRED",
    "SALES_CONVERSATION_BUSY",
    "RATE_LIMITED",
  ],
} as const satisfies ApiOperation;
export const deleteOperation = {
  method: "DELETE",
  url: "/sales/conversations/:conversationId",
  operationId: "forgetSalesConversation",
  authentication: "bearer",
  description:
    "Discards the caller's in-memory conversation context. Does not change ERP data.",
  schema: {
    params: Type.Object(
      { conversationId: Type.String({ format: "uuid" }) },
      object,
    ),
    response: {
      200: Type.Object({ forgotten: Type.Literal(true) }, object),
      ...responses,
    },
  },
  expectedErrors: [
    "AUTHENTICATION_REQUIRED",
    "SALES_ACCESS_DENIED",
    "SALES_CONVERSATION_EXPIRED",
    "SALES_CONVERSATION_BUSY",
  ],
} as const satisfies ApiOperation;
