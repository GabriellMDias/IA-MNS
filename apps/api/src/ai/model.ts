import type { Static, TSchema } from "typebox";

/**
 * One message of the bounded conversation sent to a model. User content is
 * untrusted data; assistant content is application-authored text only.
 */
export type ModelMessage = Readonly<{
  role: "user" | "assistant";
  content: string;
}>;

/** A request that must be answered by exactly one call of one strict tool. */
export type StructuredRequest<T extends TSchema> = Readonly<{
  instructions: string;
  messages: readonly ModelMessage[];
  tool: Readonly<{ name: string; description: string; parameters: T }>;
  maxOutputTokens: number;
}>;

/** Safe invocation metadata: never prompt, message or output content. */
export type ModelInvocation = Readonly<{
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}>;

export type StructuredResult<T extends TSchema> = Readonly<{
  value: Static<T>;
  invocation: ModelInvocation;
}>;

/**
 * Provider-neutral structured interpretation. Implementations return only
 * output that satisfies the tool schema; callers still apply their own
 * semantic validation before trusting it.
 */
export interface StructuredModel {
  readonly provider: string;
  readonly model: string;
  invoke<T extends TSchema>(
    this: void,
    request: StructuredRequest<T>,
    signal: AbortSignal,
  ): Promise<StructuredResult<T>>;
}

/** Why a provider exchange produced no trustworthy structured output. */
export type ModelFailureReason = "provider" | "incomplete" | "invalid_output";

export class ModelFailure extends Error {
  readonly reason: ModelFailureReason;
  constructor(reason: ModelFailureReason, cause?: unknown) {
    super(`MODEL_${reason.toUpperCase()}`, { cause });
    this.reason = reason;
  }
}
