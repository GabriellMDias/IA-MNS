import type { TSchema } from "typebox";
import type { ModelInvocation, ModelMessage } from "./model.js";

/** A server-owned tool contract; authorization remains the executor's concern. */
export type ConversationTool = Readonly<{
  name: string;
  description: string;
  parameters: TSchema;
}>;

/**
 * An opaque, ephemeral provider continuation. Never persist, serialize, log, or
 * accept it from a client. Scripted models may use any object as their handle.
 */
export type ConversationContinuation = object;

export type ConversationToolCall = Readonly<{
  id: string;
  name: string;
  arguments: Readonly<Record<string, unknown>>;
}>;

export type ConversationToolOutput = Readonly<{
  callId: string;
  /** Only an authorized, minimized projection prepared by the server. */
  output: string;
  /** Validated inline operational image; never a remote URL or provider file id. */
  image?: { mediaType: "image/png" | "image/jpeg"; data: string };
}>;

export type ConversationRequest = Readonly<{
  instructions: string;
  /** The bounded initial transcript. Continuations do not append it again. */
  messages: readonly ModelMessage[];
  tools: readonly ConversationTool[];
  maxOutputTokens: number;
  /** A final answer may contain arbitrary prose within a strict evidence contract. */
  responseFormat?: Readonly<{ name: string; schema: TSchema }>;
  continuation?: Readonly<{
    state: ConversationContinuation;
    outputs: readonly ConversationToolOutput[];
  }>;
}>;

export type ConversationResult =
  | Readonly<{
      kind: "message";
      text: string;
      /** Schema-validated JSON when responseFormat is set; otherwise null. */
      value: unknown;
      invocation: ModelInvocation;
    }>
  | Readonly<{
      kind: "tool_calls";
      calls: readonly ConversationToolCall[];
      continuation: ConversationContinuation;
      invocation: ModelInvocation;
    }>;

/**
 * One bounded reasoning step. The application owns the tool loop, permissions,
 * evidence validation, total turn budget and the user-visible response.
 */
export interface ConversationModel {
  readonly provider: string;
  readonly model: string;
  invoke(
    this: void,
    request: ConversationRequest,
    signal: AbortSignal,
  ): Promise<ConversationResult>;
}
