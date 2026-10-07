import type { ModelInvocation } from "../src/ai/model.js";
import type { TraceValue } from "../src/ai/trace.js";
import { parseServerConfig } from "../src/config.js";
import { runAgentTurn } from "../src/features/agent/application.js";
import type {
  AgentCapability,
  AgentReply,
} from "../src/features/agent/capabilities.js";
import { AgentFailure } from "../src/features/agent/errors.js";
import type { AgentPlanner } from "../src/features/agent/planner.js";
import { TurnTrace } from "../src/features/agent/trace.js";
import { SalesChat } from "../src/features/sales/application.js";
import { createSalesCapability } from "../src/features/sales/capability.js";
import type { SalesConversationState } from "../src/features/sales/conversation-state.js";
import {
  comparisonQuery,
  type SalesData,
  type SalesQuery,
} from "../src/features/sales/domain.js";
import { SalesFailure } from "../src/features/sales/errors.js";
import type { SalesInterpreter } from "../src/features/sales/interpreter.js";
import type { SalesReader } from "../src/features/sales/reader.js";
import type { SalesSource } from "../src/features/sales/sources.js";
import { ModelFailure } from "../src/ai/model.js";
import type { EvalCase, EvalTurn } from "./dataset.js";

/** Gives a scripted subject the turn being executed. */
export type Script = Readonly<{ turn: () => EvalTurn }>;

/**
 * The implementation under evaluation: routing and interpretation. Execution,
 * state and validation are always the real application code.
 */
export interface EvalSubject {
  readonly id: string;
  readonly metadata: Readonly<Record<string, string>>;
  /** A reason the subject cannot run the case, or null. */
  applicable(this: void, evalCase: EvalCase): string | null;
  interpreter(this: void, script: Script): SalesInterpreter;
  router(
    this: void,
    capabilities: readonly AgentCapability[],
    script: Script,
  ): AgentPlanner;
}

export type TurnObservation = {
  user: string;
  /** Capability id or conversational intent actually used. */
  route: string | null;
  reply: Pick<AgentReply, "kind" | "message"> | null;
  query: SalesQuery | null;
  /** Sources the turn queried, in order. */
  sources: SalesSource[];
  sourceNotice: boolean;
  salesState: SalesConversationState | null;
  notes: Record<string, Record<string, TraceValue>>;
  invocations: (ModelInvocation & { stage: string })[];
  error: { code: string; detail: string | null } | null;
  latencyMs: number;
};

const config = parseServerConfig({ ORION_ENV: "test" });
const actor = { id: "evaluation", permissions: new Set(["sales:read"]) };

/** Shape-valid synthetic rows: evaluation measures interpretation, not ERP figures. */
function syntheticData(query: SalesQuery): SalesData {
  const unit =
    query.metric === "net_value"
      ? "BRL"
      : query.metric === "weight"
        ? "PESOLIQ"
        : "UN";
  const months: string[] = [];
  const cursor = new Date(`${query.startDate.slice(0, 7)}-01T00:00:00Z`);
  while (cursor.toISOString().slice(0, 7) <= query.endDate.slice(0, 7)) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return {
    rows:
      query.groupBy === "month"
        ? months.map((period) => ({
            period,
            product: null,
            unit,
            value: "100",
          }))
        : [
            {
              period: "total",
              product:
                query.groupBy === "product" ? "1 - PRODUTO SINTETICO" : null,
              unit,
              value: "100",
            },
          ],
    products:
      query.productSearch === null
        ? []
        : [{ code: "1", description: "PRODUTO SINTETICO" }],
    missingWeight: false,
  };
}

// Local evaluation diagnostics over synthetic input: the failure reason and
// a provider status or error name, never request content.
function failure(error: unknown): { code: string; detail: string | null } {
  const cause = error instanceof Error ? error.cause : undefined;
  const status =
    cause instanceof ModelFailure && cause.cause instanceof Error
      ? (cause.cause as { status?: unknown }).status
      : undefined;
  const provider =
    cause instanceof ModelFailure && cause.cause instanceof Error
      ? [typeof status === "number" ? String(status) : null, cause.cause.name]
          .filter(Boolean)
          .join(" ")
      : null;
  const reason =
    cause instanceof ModelFailure
      ? [cause.reason, provider].filter(Boolean).join(": ")
      : cause instanceof Error
        ? cause.message.slice(0, 200)
        : null;
  if (error instanceof SalesFailure || error instanceof AgentFailure)
    return { code: error.code, detail: reason };
  return {
    code: "INTERNAL_ERROR",
    detail: error instanceof Error ? error.message.slice(0, 200) : null,
  };
}

export type Session = Readonly<{
  send(this: void, turn: EvalTurn): Promise<TurnObservation>;
  close(this: void): Promise<void>;
}>;

/**
 * A conversation with the subject through the real agent orchestration and
 * sales state machine. Failed turns leave history and contexts unchanged, as
 * in production.
 */
export function openSession(
  subject: EvalSubject,
  setting: Pick<EvalCase, "today" | "context">,
): Session {
  let current: EvalTurn | undefined;
  const script: Script = {
    turn: () => {
      if (!current) throw new Error("No turn in progress");
      return current;
    },
  };
  const executed: SalesQuery[] = [];
  const queried: SalesSource[] = [];
  const reader = (source: SalesSource): SalesReader => ({
    read: (query) => {
      executed.push(query);
      queried.push(source);
      const comparison = comparisonQuery(query);
      return Promise.resolve({
        current: syntheticData(query),
        previous: comparison ? syntheticData(comparison) : null,
      });
    },
    close: () => Promise.resolve(),
  });
  const sales = createSalesCapability(
    config,
    new SalesChat(
      subject.interpreter(script),
      { sankhya: reader("sankhya"), vrmaster: reader("vrmaster") },
      undefined,
      // Noon in Sao Paulo on the business date.
      () => new Date(`${setting.today}T15:00:00Z`),
    ),
  );
  const router = subject.router([sales], script);
  let contexts: Record<string, unknown> = structuredClone(
    setting.context ?? {},
  );
  const history: { question: string; reply: AgentReply }[] = [];
  return {
    async send(turn) {
      current = turn;
      const trace = new TurnTrace("content");
      const before = executed.length;
      const sourcesBefore = queried.length;
      const started = performance.now();
      let observation: Omit<
        TurnObservation,
        "route" | "notes" | "invocations" | "latencyMs" | "sourceNotice"
      >;
      try {
        const result = await runAgentTurn(router, [sales], {
          actor,
          message: turn.user,
          history: [...history],
          contexts,
          signal: AbortSignal.timeout(90000),
          progress: () => Promise.resolve(),
          trace,
          source: turn.source ?? "sankhya",
        });
        contexts = result.contexts;
        history.push({ question: turn.user, reply: result.reply });
        observation = {
          user: turn.user,
          reply: { kind: result.reply.kind, message: result.reply.message },
          query: executed[before] ?? null,
          sources: queried.slice(sourcesBefore),
          salesState: (contexts.sales as SalesConversationState) ?? null,
          error: null,
        };
      } catch (error) {
        observation = {
          user: turn.user,
          reply: null,
          query: null,
          sources: queried.slice(sourcesBefore),
          salesState: (contexts.sales as SalesConversationState) ?? null,
          error: failure(error),
        };
      } finally {
        current = undefined;
      }
      const metadata = trace.metadata({
        kind: observation.reply?.kind ?? "failed",
        capabilityId: null,
        failureCode: observation.error?.code ?? null,
      });
      const agent = metadata.notes.agent;
      return {
        ...observation,
        sourceNotice: metadata.notes.sales?.sourceNotice === true,
        route:
          typeof agent?.capabilityId === "string"
            ? agent.capabilityId
            : typeof agent?.intent === "string"
              ? agent.intent
              : null,
        notes: metadata.notes,
        invocations: [...metadata.invocations],
        latencyMs: Math.round(performance.now() - started),
      };
    },
    close: () => sales.close(),
  };
}

/** Plays every turn of a case in one session. */
export async function observeCase(
  subject: EvalSubject,
  evalCase: EvalCase,
): Promise<TurnObservation[]> {
  const session = openSession(subject, evalCase);
  try {
    const observations: TurnObservation[] = [];
    for (const turn of evalCase.turns)
      observations.push(await session.send(turn));
    return observations;
  } finally {
    await session.close();
  }
}
