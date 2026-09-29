import { Type } from "typebox";
import { errorEnvelopeSchema } from "../../errors.js";

const uuid = Type.String({
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
});
const title = Type.String({ minLength: 1, maxLength: 200, pattern: ".*\\S.*" });
const description = Type.Union([
  Type.String({ minLength: 1, maxLength: 2000, pattern: ".*\\S.*" }),
  Type.Null(),
]);
const reason = Type.String({
  minLength: 1,
  maxLength: 2000,
  pattern: ".*\\S.*",
});
const version = Type.Integer({ minimum: 1 });
const params = Type.Object({ id: uuid }, { additionalProperties: false });
const expectedVersion = Type.Object(
  { expectedVersion: version },
  { additionalProperties: false },
);
const headers = Type.Object({
  "idempotency-key": Type.String({
    minLength: 1,
    maxLength: 200,
    pattern: "^[A-Za-z0-9._~-]+$",
  }),
});

export const requestSchema = Type.Object(
  {
    id: uuid,
    creatorId: uuid,
    title,
    description,
    status: Type.Union([
      Type.Literal("DRAFT"),
      Type.Literal("SUBMITTED"),
      Type.Literal("APPROVED"),
      Type.Literal("REJECTED"),
      Type.Literal("CANCELLED"),
    ]),
    version,
    rejectionReason: Type.Union([reason, Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export const pageSchema = Type.Object(
  {
    items: Type.Array(requestSchema),
    nextCursor: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);

const commonErrors = {
  400: errorEnvelopeSchema,
  401: errorEnvelopeSchema,
  429: errorEnvelopeSchema,
  500: errorEnvelopeSchema,
  503: errorEnvelopeSchema,
};
const readErrors = { ...commonErrors, 404: errorEnvelopeSchema };
const mutationErrors = {
  ...readErrors,
  403: errorEnvelopeSchema,
  409: errorEnvelopeSchema,
};

export const approvalOperations = [
  {
    method: "POST",
    url: "/approval-requests",
    operationId: "createApprovalRequest",
    description:
      "Create a draft owned by the authenticated requester. A repeated idempotency key may safely replay the same creation, but cannot be reused for different input.",
    schema: {
      headers,
      body: Type.Object(
        { title, description: Type.Optional(description) },
        { additionalProperties: false },
      ),
      response: {
        201: requestSchema,
        409: errorEnvelopeSchema,
        ...commonErrors,
      },
    },
    expectedErrors: [
      "VALIDATION_FAILED",
      "AUTHENTICATION_REQUIRED",
      "IDEMPOTENCY_KEY_REUSED",
      "RATE_LIMITED",
    ],
  },
  {
    method: "GET",
    url: "/approval-requests",
    operationId: "listApprovalRequests",
    description:
      "List requests visible to the authenticated principal. The mine scope shows owned requests; reviewable requires review capability and excludes requests owned by the reviewer.",
    schema: {
      querystring: Type.Object(
        {
          scope: Type.Optional(
            Type.Union([Type.Literal("mine"), Type.Literal("reviewable")]),
          ),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
        },
        { additionalProperties: false },
      ),
      response: { 200: pageSchema, 403: errorEnvelopeSchema, ...commonErrors },
    },
    expectedErrors: [
      "VALIDATION_FAILED",
      "AUTHENTICATION_REQUIRED",
      "PERMISSION_DENIED",
      "RATE_LIMITED",
    ],
  },
  {
    method: "GET",
    url: "/approval-requests/:id",
    operationId: "getApprovalRequest",
    description:
      "Read one request when the principal owns it or has review access to a submitted request.",
    schema: { params, response: { 200: requestSchema, ...readErrors } },
    expectedErrors: [
      "VALIDATION_FAILED",
      "AUTHENTICATION_REQUIRED",
      "RESOURCE_NOT_FOUND",
      "RATE_LIMITED",
    ],
  },
  {
    method: "PUT",
    url: "/approval-requests/:id/draft",
    operationId: "editApprovalRequestDraft",
    description:
      "Edit an owned draft. The expected version prevents a stale write from overwriting newer data or a state transition.",
    schema: {
      params,
      body: Type.Object(
        {
          expectedVersion: version,
          title,
          description: Type.Optional(description),
        },
        { additionalProperties: false },
      ),
      response: { 200: requestSchema, ...mutationErrors },
    },
    expectedErrors: [
      "VALIDATION_FAILED",
      "AUTHENTICATION_REQUIRED",
      "RESOURCE_NOT_FOUND",
      "APPROVAL_REQUEST_INVALID_STATE",
      "RESOURCE_VERSION_CONFLICT",
      "RATE_LIMITED",
    ],
  },
  {
    method: "POST",
    url: "/approval-requests/:id/submit",
    operationId: "submitApprovalRequest",
    description:
      "Submit an owned draft for review when its version still matches. A submitted request cannot be edited as a draft.",
    schema: {
      params,
      body: expectedVersion,
      response: { 200: requestSchema, ...mutationErrors },
    },
    expectedErrors: [
      "VALIDATION_FAILED",
      "AUTHENTICATION_REQUIRED",
      "RESOURCE_NOT_FOUND",
      "APPROVAL_REQUEST_INVALID_STATE",
      "RESOURCE_VERSION_CONFLICT",
      "RATE_LIMITED",
    ],
  },
  {
    method: "POST",
    url: "/approval-requests/:id/approve",
    operationId: "approveApprovalRequest",
    description:
      "Approve a submitted request as a reviewer other than its owner. The expected version protects competing decisions.",
    schema: {
      params,
      body: expectedVersion,
      response: { 200: requestSchema, ...mutationErrors },
    },
    expectedErrors: [
      "VALIDATION_FAILED",
      "AUTHENTICATION_REQUIRED",
      "PERMISSION_DENIED",
      "RESOURCE_NOT_FOUND",
      "APPROVAL_REQUEST_INVALID_STATE",
      "RESOURCE_VERSION_CONFLICT",
      "RATE_LIMITED",
    ],
  },
  {
    method: "POST",
    url: "/approval-requests/:id/reject",
    operationId: "rejectApprovalRequest",
    description:
      "Reject a submitted request as a reviewer other than its owner, recording the required reason. The expected version protects competing decisions.",
    schema: {
      params,
      body: Type.Object(
        { expectedVersion: version, reason },
        { additionalProperties: false },
      ),
      response: { 200: requestSchema, ...mutationErrors },
    },
    expectedErrors: [
      "VALIDATION_FAILED",
      "AUTHENTICATION_REQUIRED",
      "PERMISSION_DENIED",
      "RESOURCE_NOT_FOUND",
      "APPROVAL_REQUEST_INVALID_STATE",
      "RESOURCE_VERSION_CONFLICT",
      "RATE_LIMITED",
    ],
  },
  {
    method: "POST",
    url: "/approval-requests/:id/cancel",
    operationId: "cancelApprovalRequest",
    description:
      "Cancel an owned draft or submitted request when its version still matches. A terminal request cannot be cancelled.",
    schema: {
      params,
      body: expectedVersion,
      response: { 200: requestSchema, ...mutationErrors },
    },
    expectedErrors: [
      "VALIDATION_FAILED",
      "AUTHENTICATION_REQUIRED",
      "RESOURCE_NOT_FOUND",
      "APPROVAL_REQUEST_INVALID_STATE",
      "RESOURCE_VERSION_CONFLICT",
      "RATE_LIMITED",
    ],
  },
] as const;
