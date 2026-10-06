import type { ModelInvocation } from "./model.js";

/**
 * Explicit AI trace capture level:
 * - off: nothing beyond ordinary failure diagnostics;
 * - metadata: allowlisted decisions, issue codes, timings and token counts,
 *   never user text, filter values or results;
 * - content: metadata plus confidential interpretation content (messages,
 *   structured conversation state and plans), never result rows or prose.
 */
export type AiTraceLevel = "off" | "metadata" | "content";
export const aiTraceLevels: readonly AiTraceLevel[] = [
  "off",
  "metadata",
  "content",
];

/** Bounded, non-confidential values: enums, codes, counts and flags. */
export type TraceValue = string | number | boolean | null | readonly string[];

/**
 * Collects the trace of one AI-assisted turn. `note` must receive only
 * allowlisted metadata; anything derived from user text belongs in
 * `content`, which recorders retain only at the content level.
 */
export interface TraceRecorder {
  invocation(this: void, stage: string, invocation: ModelInvocation): void;
  note(
    this: void,
    scope: string,
    fields: Readonly<Record<string, TraceValue>>,
  ): void;
  content(
    this: void,
    scope: string,
    fields: Readonly<Record<string, unknown>>,
  ): void;
}

export const noTrace: TraceRecorder = {
  invocation: () => undefined,
  note: () => undefined,
  content: () => undefined,
};
