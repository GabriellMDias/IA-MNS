import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { querySchema } from "./contracts.js";
import type { SalesQuery } from "./domain.js";
import {
  applyChange,
  compileAnalysis,
  completeDraft,
  conflictingSlots,
  describeAnalysis,
  draftSchema,
  emptyDraft,
  groundedIn,
  missingSlots,
  providedSlots,
  specFromQuery,
  specSchema,
  type AnalysisDraft,
  type AnalysisSpec,
  type Slot,
} from "./analysis.js";
import { changeOf, type Interpretation } from "./interpretation.js";
import { periodKind } from "./period.js";

const object = { additionalProperties: false };

/** Application-authored question categories; the text lives in the application. */
export const clarificationSchema = Type.Union([
  Type.Literal("period"),
  Type.Literal("period_limit"),
  Type.Literal("product"),
  Type.Literal("measure"),
  Type.Literal("comparison"),
  Type.Literal("ambiguous"),
  Type.Literal("context"),
]);
export type Clarification = Static<typeof clarificationSchema>;

const exchangeSchema = Type.Object(
  {
    user: Type.String({ maxLength: 2000 }),
    reply: Type.Union([
      Type.Literal("answer"),
      Type.Literal("clarification"),
      Type.Literal("unsupported"),
    ]),
    // Clarification/unsupported: the application-authored message. Answer: a
    // filter-only analysis description, never figures or response prose.
    text: Type.String({ maxLength: 2000 }),
  },
  object,
);
export type Exchange = Static<typeof exchangeSchema>;

/**
 * Version 2 sales conversation state. `active` is the last executed plan,
 * `pending` an unanswered request with what is already known and what it
 * awaits, and `transcript` the bounded recent sales exchanges.
 */
export const salesStateSchema = Type.Object(
  {
    version: Type.Literal(2),
    active: Type.Union([
      Type.Object({ spec: specSchema, query: querySchema }, object),
      Type.Null(),
    ]),
    pending: Type.Union([
      Type.Object(
        {
          draft: draftSchema,
          awaiting: Type.Array(Type.String({ maxLength: 40 }), {
            maxItems: 8,
          }),
          clarification: clarificationSchema,
        },
        object,
      ),
      Type.Null(),
    ]),
    transcript: Type.Array(exchangeSchema, { maxItems: 12 }),
  },
  object,
);
export type SalesConversationState = Static<typeof salesStateSchema>;
export const emptySalesState: SalesConversationState = {
  version: 2,
  active: null,
  pending: null,
  transcript: [],
};

type HistoryTurn = {
  question: string;
  reply: { kind: string; message: string; result: unknown };
};
const answered = "Análise respondida.";
function exchangeFromHistory(turn: HistoryTurn): Exchange {
  const query = (turn.reply.result as { query?: unknown } | null)?.query;
  return {
    user: turn.question.slice(0, 2000),
    ...(turn.reply.kind === "answer"
      ? {
          reply: "answer" as const,
          text: Value.Check(querySchema, query)
            ? describeAnalysis(specFromQuery(query), query)
            : answered,
        }
      : {
          reply:
            turn.reply.kind === "clarification"
              ? ("clarification" as const)
              : ("unsupported" as const),
          text: turn.reply.message.slice(0, 2000),
        }),
  };
}

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 12 &&
  value.every((item) => typeof item === "string" && item.length <= 2000);

/**
 * Loads saved sales context. Version 1 (last query plus question and
 * clarification lists) upgrades to version 2; its unanswered clarification
 * cannot be resumed because version 1 never stored what was understood.
 */
export function loadSalesState(
  saved: unknown,
  history: readonly HistoryTurn[],
): SalesConversationState {
  const fromHistory = () => history.slice(-12).map(exchangeFromHistory);
  if (saved === null || saved === undefined)
    return { ...emptySalesState, transcript: fromHistory() };
  const candidate = saved as Record<string, unknown>;
  if (typeof saved === "object" && candidate.version === 2) {
    if (!Value.Check(salesStateSchema, saved))
      throw new Error("Invalid sales conversation context");
    return saved;
  }
  if (typeof saved !== "object" || candidate.version !== 1)
    throw new Error("Unsupported sales conversation context");
  const lastQuery = candidate.lastQuery ?? null;
  if (lastQuery !== null && !Value.Check(querySchema, lastQuery))
    throw new Error("Unsupported sales conversation context");
  const { questions, clarifications } = candidate;
  if (
    (questions !== undefined && !strings(questions)) ||
    (clarifications !== undefined && !strings(clarifications))
  )
    throw new Error("Invalid sales question context");
  const transcript = strings(questions)
    ? questions.map((user, index): Exchange =>
        strings(clarifications) && clarifications[index]
          ? { user, reply: "clarification", text: clarifications[index] }
          : { user, reply: "answer", text: answered },
      )
    : fromHistory();
  return {
    version: 2,
    active: lastQuery
      ? { spec: specFromQuery(lastQuery), query: lastQuery }
      : null,
    pending: null,
    transcript,
  };
}

export function recordExchange(
  state: SalesConversationState,
  exchange: Exchange,
): SalesConversationState {
  return {
    ...state,
    transcript: [...state.transcript, exchange].slice(-12),
  };
}

export type Relation = Interpretation["relation"];
export type AdvanceNotes = Readonly<{
  /** Relation actually applied after deterministic normalization. */
  relation: Relation;
  /** Content-free codes for normalizations, rejections and guards applied. */
  issues: readonly string[];
  missing: readonly Slot[];
  periodKind: string | null;
}>;
export type Advance = Readonly<
  | {
      kind: "execute";
      spec: AnalysisSpec;
      query: SalesQuery;
      state: SalesConversationState;
      notes: AdvanceNotes;
    }
  | {
      kind: "clarify";
      clarification: Clarification;
      state: SalesConversationState;
      notes: AdvanceNotes;
    }
  | { kind: "unsupported"; state: SalesConversationState; notes: AdvanceNotes }
>;

const awaitedBy: Readonly<Record<Clarification, string>> = {
  period: "period",
  period_limit: "period",
  product: "product",
  measure: "measure",
  comparison: "comparison",
  ambiguous: "details",
  context: "details",
};

/**
 * Applies one interpretation to the conversation state. The model reports
 * what the message states and how it relates to the state; this function
 * owns retention, completeness, grounding and period resolution, so a reply
 * that only supplies a missing value completes the request it answers.
 */
export function advance(
  state: SalesConversationState,
  interpretation: Interpretation,
  message: string,
  today: string,
): Advance {
  const issues: string[] = [];
  const change = changeOf(interpretation);
  const notes = (
    relation: Relation,
    missing: readonly Slot[] = [],
    period = change.period,
  ): AdvanceNotes => ({
    relation,
    issues,
    missing,
    periodKind: period ? periodKind(period) : null,
  });
  let relation = interpretation.relation;
  if (interpretation.decision === "unsupported")
    return { kind: "unsupported", state, notes: notes(relation) };

  // Normalize the relation against the state the application actually holds.
  const { pending, active } = state;
  if (relation === "answer_pending" && !pending) {
    relation = active ? "refine" : "new";
    issues.push("pending_absent");
  }
  if (relation === "refine" && pending) {
    relation = "answer_pending";
    issues.push("refine_applied_to_pending");
  }
  if (relation === "new" && pending) {
    const provided = providedSlots(change);
    const conflicts = conflictingSlots(pending.draft, change);
    if (
      provided.some((slot) => pending.awaiting.includes(slot)) &&
      conflicts.every((slot) => pending.awaiting.includes(slot))
    ) {
      relation = "answer_pending";
      issues.push("new_completes_pending");
    }
  }

  const ask = (
    clarification: Clarification,
    draft: AnalysisDraft,
    missing: readonly Slot[],
    extra: readonly string[] = [],
  ): Advance => ({
    kind: "clarify",
    clarification,
    state: {
      ...state,
      pending: {
        draft,
        awaiting: [
          ...new Set([awaitedBy[clarification], ...missing, ...extra]),
        ].slice(0, 8),
        clarification,
      },
    },
    notes: notes(relation, missing, draft.period),
  });

  if (relation === "refine" && !active) {
    issues.push("refine_without_context");
    const draft = applyChange(emptyDraft, change);
    return ask("context", draft, missingSlots(draft));
  }
  const base: AnalysisDraft =
    relation === "answer_pending"
      ? pending!.draft
      : relation === "refine"
        ? active!.spec
        : emptyDraft;

  // A filter value must be written by the user; retained values were
  // grounded when they entered the state.
  const evidence = [message, ...state.transcript.map((item) => item.user)];
  const ungrounded = change.filters
    .filter(
      (filter) =>
        filter.action === "set" &&
        filter.text !== null &&
        !groundedIn(filter.text, evidence),
    )
    .map((filter) => filter.dimension);
  for (const dimension of ungrounded) issues.push(`ungrounded_${dimension}`);
  const draft = applyChange(base, {
    ...change,
    filters: change.filters.filter(
      (filter) => !ungrounded.includes(filter.dimension),
    ),
  });
  const missing = missingSlots(draft);

  if (interpretation.decision === "clarify")
    return ask(interpretation.clarification!, draft, missing, ungrounded);
  if (ungrounded.length > 0) return ask(ungrounded[0], draft, missing);
  if (missing.length > 0)
    return ask(missing[0] as Clarification, draft, missing);

  const spec = completeDraft(draft)!;
  const compiled = compileAnalysis(spec, today);
  if (!compiled.ok) {
    issues.push(`period_${compiled.issue}`);
    return ask(
      compiled.issue === "too_long" ? "period_limit" : "period",
      { ...draft, period: null },
      ["period"],
    );
  }
  if (compiled.clamped) issues.push("period_clamped_to_today");
  return {
    kind: "execute",
    spec,
    query: compiled.query,
    state: { ...state, active: { spec, query: compiled.query }, pending: null },
    notes: notes(relation, [], spec.period),
  };
}
