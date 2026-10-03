import type { ErrorDefinition } from "../../errors.js";
export const agentErrors = {
  AGENT_CONVERSATION_ARCHIVED: {
    status: 409,
    category: "conflict",
    retryable: false,
    message: "Restore the archived conversation before submitting a new turn.",
  },
  AGENT_NOT_CONFIGURED: {
    status: 503,
    category: "availability",
    retryable: false,
    message: "The agent is not configured.",
  },
  AGENT_CONVERSATION_NOT_FOUND: {
    status: 404,
    category: "not_found",
    retryable: false,
    message: "The conversation was not found.",
  },
  AGENT_CONVERSATION_BUSY: {
    status: 409,
    category: "conflict",
    retryable: true,
    message: "The conversation has an active turn.",
  },
  AGENT_REQUEST_CONFLICT: {
    status: 409,
    category: "conflict",
    retryable: false,
    message: "This request identifier has different content.",
  },
  AGENT_ACCESS_DENIED: {
    status: 403,
    category: "authorization",
    retryable: false,
    message: "This capability is not permitted.",
  },
  AGENT_PROVIDER_UNAVAILABLE: {
    status: 503,
    category: "availability",
    retryable: true,
    message: "The agent provider is unavailable.",
  },
} as const satisfies Record<string, ErrorDefinition>;
export type AgentErrorCode = keyof typeof agentErrors;
export class AgentFailure extends Error {
  readonly code: AgentErrorCode;
  constructor(code: AgentErrorCode, cause?: unknown) {
    super(code, { cause });
    this.code = code;
  }
}
