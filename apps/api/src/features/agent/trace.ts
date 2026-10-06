import type { ModelInvocation } from "../../ai/model.js";
import type {
  AiTraceLevel,
  TraceRecorder,
  TraceValue,
} from "../../ai/trace.js";

export type TurnOutcome = Readonly<{
  kind: "conversation" | "answer" | "clarification" | "unavailable" | "failed";
  capabilityId: string | null;
  failureCode: string | null;
}>;

/** Allowlisted, content-free turn trace for structured logs. */
export type TurnTraceMetadata = Readonly<{
  level: AiTraceLevel;
  durationMs: number;
  invocations: readonly (ModelInvocation & { stage: string })[];
  notes: Readonly<Record<string, Readonly<Record<string, TraceValue>>>>;
  outcome: TurnOutcome;
}>;

/** Content-level trace persisted with its turn; deleted with the conversation. */
export type TurnTraceRecord = TurnTraceMetadata &
  Readonly<{
    version: 1;
    content: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
    contentOmitted: boolean;
  }>;

const maximumRecordLength = 256000;

/**
 * Accumulates one turn's AI trace at the configured level. Metadata is always
 * bounded and content-free; content is retained only at the content level and
 * omitted, never truncated, when it exceeds the stored bound.
 */
export class TurnTrace implements TraceRecorder {
  readonly level: AiTraceLevel;
  private readonly started = performance.now();
  private readonly invocations: (ModelInvocation & { stage: string })[] = [];
  private readonly notes: Record<string, Record<string, TraceValue>> = {};
  private readonly contents: Record<string, Record<string, unknown>> = {};
  constructor(level: AiTraceLevel) {
    this.level = level;
  }
  invocation = (stage: string, invocation: ModelInvocation) => {
    if (this.invocations.length < 10)
      this.invocations.push({ stage, ...invocation });
  };
  note = (scope: string, fields: Readonly<Record<string, TraceValue>>) => {
    this.notes[scope] = { ...this.notes[scope], ...fields };
  };
  content = (scope: string, fields: Readonly<Record<string, unknown>>) => {
    if (this.level === "content")
      this.contents[scope] = { ...this.contents[scope], ...fields };
  };
  metadata(outcome: TurnOutcome): TurnTraceMetadata {
    return {
      level: this.level,
      durationMs: Math.round(performance.now() - this.started),
      invocations: [...this.invocations],
      notes: structuredClone(this.notes),
      outcome,
    };
  }
  /** The persistable record, or null below the content level. */
  record(outcome: TurnOutcome): TurnTraceRecord | null {
    if (this.level !== "content") return null;
    const record: TurnTraceRecord = {
      version: 1,
      ...this.metadata(outcome),
      content: structuredClone(this.contents),
      contentOmitted: false,
    };
    return JSON.stringify(record).length <= maximumRecordLength
      ? record
      : { ...record, content: {}, contentOmitted: true };
  }
}
