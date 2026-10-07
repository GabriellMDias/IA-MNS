import { defineErrors } from "../../errors.js";

export const salesErrors = defineErrors({
  SALES_ACCESS_DENIED: {
    status: 403,
    message: "Sales access is not permitted.",
    category: "authorization",
    retryable: false,
  },
  SALES_NOT_CONFIGURED: {
    status: 503,
    message: "Sales providers are not configured.",
    category: "configuration",
    retryable: false,
  },
  SALES_PROVIDER_UNAVAILABLE: {
    status: 503,
    message: "The sales provider is unavailable. Try again later.",
    category: "availability",
    retryable: true,
  },
  SALES_QUERY_INVALID: {
    status: 400,
    message: "The sales query is outside the supported limits.",
    category: "validation",
    retryable: false,
  },
  SALES_RESULT_TOO_LARGE: {
    status: 400,
    message: "Narrow the product search or period.",
    category: "validation",
    retryable: false,
  },
  SALES_CONVERSATION_EXPIRED: {
    status: 410,
    message:
      "The conversation is no longer available. Start a new conversation.",
    category: "not_found",
    retryable: false,
  },
  SALES_CONVERSATION_BUSY: {
    status: 409,
    message: "A question is already being processed in this conversation.",
    category: "conflict",
    retryable: true,
  },
});

export class SalesFailure extends Error {
  readonly code: keyof typeof salesErrors;
  readonly boundary?: Readonly<
    // The model provider name is a fixed adapter identifier, never input.
    | { provider: string; stage: "interpretation" }
    | {
        provider: "oracle" | "postgresql";
        stage: "connection" | "query" | "cleanup";
      }
  >;
  constructor(
    code: keyof typeof salesErrors,
    cause?: unknown,
    boundary?: SalesFailure["boundary"],
  ) {
    super(code, { cause });
    this.code = code;
    this.boundary = boundary;
  }
}
