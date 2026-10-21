import { randomUUID } from "node:crypto";
import { errorDiagnostics } from "../../error-diagnostics.js";
import { SalesFailure } from "../sales/errors.js";
import { ProductFailure } from "../products/errors.js";
import { AgentFailure } from "./errors.js";

/** The logger method a turn failure report needs; Pino and Fastify loggers fit. */
export type FailureLogger = { error(object: object, message: string): void };

/**
 * The public code a failed turn stores. Expected failures keep their own
 * code; provider and unexpected failures also emit the one authoritative
 * sanitized `agent_execution_failed` diagnostic. Shared by every channel that
 * submits turns, so a failure is classified the same way everywhere.
 */
export function agentFailureCode(
  error: unknown,
  log: FailureLogger,
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
  if (
    error instanceof ProductFailure &&
    error.code !== "PRODUCTS_PROVIDER_UNAVAILABLE"
  )
    return error.code;
  log.error(
    {
      errorId: `err_${randomUUID()}`,
      turnId,
      ...(error instanceof SalesFailure || error instanceof ProductFailure
        ? error.boundary
        : {
            provider: error instanceof AgentFailure ? "openai" : "application",
            stage: "execution",
          }),
      diagnostic: errorDiagnostics(error),
    },
    "agent_execution_failed",
  );
  return error instanceof SalesFailure ||
    error instanceof AgentFailure ||
    error instanceof ProductFailure
    ? error.code
    : "INTERNAL_ERROR";
}
