import { Type, type Static, type TSchema } from "typebox";
import type { ModelMessage, StructuredModel } from "../src/ai/model.js";
import { normalizedText } from "../src/features/sales/analysis.js";
import {
  comparisonSchema,
  groupingSchema,
  measureSchema,
} from "../src/features/sales/analysis.js";
import type { SalesQuery } from "../src/features/sales/domain.js";
import type { EvalCase, EvalTurn, QueryExpectation } from "./dataset.js";
import { openSession, type EvalSubject } from "./harness.js";

const object = { additionalProperties: false };
const nullable = <T extends TSchema>(schema: T) =>
  Type.Union([schema, Type.Null()]);
const isoDate = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

/** The documented capability, as generators and simulators see it. */
function capabilityBrief(today: string): string {
  return `IA-MNS answers Portuguese questions about confirmed, non-bonus Sankhya sales. Measures: net_value (monetary, default for "quanto vendi"), quantity (units/packages) or weight (kg). Optional literal product description filter. Grouping: total, month or product. Comparison: previous_year or previous_period. Customer, seller, company, returns, stock, purchases, orders and writes are unsupported and must be rejected. A period is required; the assistant asks for it when missing. Today is ${today} (America/Sao_Paulo). Period rules: this month/year = to date; last N days include today; last N months = N completed months before the current one unless the current month is included; a month without a year is its latest non-future occurrence; periods longer than 366 days or that have not started are not queried.`;
}

const generatedTurnSchema = Type.Object(
  {
    user: Type.String({ minLength: 1, maxLength: 300 }),
    expectKind: Type.Union([
      Type.Literal("answer"),
      Type.Literal("clarification"),
      Type.Literal("unavailable"),
      Type.Literal("conversation"),
    ]),
    expectProduct: nullable(Type.String({ maxLength: 80 })),
    expectStartDate: nullable(isoDate),
    expectEndDate: nullable(isoDate),
    expectMetric: nullable(measureSchema),
    expectGroupBy: nullable(groupingSchema),
    expectComparison: nullable(comparisonSchema),
  },
  object,
);
const generationSchema = Type.Object(
  {
    cases: Type.Array(
      Type.Object(
        {
          title: Type.String({ minLength: 1, maxLength: 200 }),
          turns: Type.Array(generatedTurnSchema, { minItems: 1, maxItems: 4 }),
        },
        object,
      ),
      { minItems: 1, maxItems: 10 },
    ),
  },
  object,
);
type GeneratedTurn = Static<typeof generatedTurnSchema>;

function turnFrom(turn: GeneratedTurn): EvalTurn {
  const query: QueryExpectation = {
    productSearch: turn.expectProduct,
    ...(turn.expectStartDate ? { startDate: turn.expectStartDate } : {}),
    ...(turn.expectEndDate ? { endDate: turn.expectEndDate } : {}),
    ...(turn.expectMetric ? { metric: turn.expectMetric } : {}),
    ...(turn.expectGroupBy ? { groupBy: turn.expectGroupBy } : {}),
    ...(turn.expectComparison ? { comparison: turn.expectComparison } : {}),
  };
  return {
    user: turn.user,
    expect: {
      kind: turn.expectKind,
      ...(turn.expectKind === "answer" ? { query } : {}),
    },
  };
}

const stamp = () =>
  new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);

/**
 * Asks a model for new candidate scenarios. The proposed expectations are the
 * generator's opinion: every case is an unreviewed candidate that never gates
 * quality until a person corrects and promotes it.
 */
export async function synthesizeCandidates(
  model: StructuredModel,
  options: {
    count: number;
    focus: string;
    today: string;
    examples: readonly EvalCase[];
  },
): Promise<EvalCase[]> {
  const { value } = await model.invoke(
    {
      instructions: `You write evaluation scenarios for a sales analytics assistant. ${capabilityBrief(options.today)} Write ${options.count} varied, realistic multi-turn conversations in Brazilian Portuguese focused on: ${options.focus}. Prefer cases likely to expose mistakes: incomplete questions, answers that supply only the requested detail, corrections, follow-ups that change one thing, plural or accented product names, unsupported requests. Use invented generic products, never real company or person names. For each user turn give the expected outcome under the rules above; for answers, expected product (null for all products), dates and other query fields; for anything else, null query fields.`,
      messages: [
        {
          role: "user",
          content: `Existing curated examples (do not repeat them): ${JSON.stringify(
            options.examples
              .slice(0, 4)
              .map((item) => item.turns.map((turn) => turn.user)),
          )}`,
        },
      ],
      tool: {
        name: "propose_evaluation_cases",
        description: "Propose candidate evaluation conversations.",
        parameters: generationSchema,
      },
      maxOutputTokens: 8000,
    },
    AbortSignal.timeout(120000),
  );
  const created = stamp();
  return value.cases.slice(0, options.count).map((item, index) => ({
    id: `synthetic/${created}-${String(index + 1).padStart(2, "0")}`,
    title: item.title,
    status: "candidate",
    source: "synthetic",
    tags: ["synthetic"],
    today: options.today,
    notes: `Generated for: ${options.focus}. Expectations are unreviewed model proposals.`,
    provenance: {
      reviewed: false,
      generator: "synthesize",
      model: `${model.provider}:${model.model}`,
      createdAt: new Date().toISOString(),
    },
    turns: item.turns.map(turnFrom),
  }));
}

export const simulationGoalSchema = Type.Object(
  {
    id: Type.String({ pattern: "^[a-z0-9][a-z0-9/-]{2,120}$" }),
    /** What the simulated employee wants, in their words. */
    description: Type.String({ minLength: 1, maxLength: 500 }),
    style: Type.Union([
      Type.Literal("terse"),
      Type.Literal("incremental"),
      Type.Literal("verbose"),
    ]),
    today: isoDate,
    target: Type.Object(
      {
        productSearch: nullable(Type.String()),
        startDate: isoDate,
        endDate: isoDate,
        metric: measureSchema,
        groupBy: groupingSchema,
        comparison: comparisonSchema,
      },
      object,
    ),
  },
  object,
);
export type SimulationGoal = Static<typeof simulationGoalSchema>;
export const simulationGoalsSchema = Type.Object(
  {
    version: Type.Literal(1),
    description: Type.String(),
    goals: Type.Array(simulationGoalSchema),
  },
  object,
);

const userTurnSchema = Type.Object(
  {
    message: Type.String({ minLength: 1, maxLength: 300 }),
    done: Type.Boolean(),
  },
  object,
);
const styles = {
  terse:
    "Start with a short question that omits the period, then answer each assistant question with only the requested detail, as briefly as possible.",
  incremental:
    "Reveal one detail per message: start with the product, then answer each assistant question with only what it asks.",
  verbose: "State everything you need in one natural, possibly long message.",
} as const;

export type SimulationResult = {
  goal: SimulationGoal;
  passed: boolean;
  /** The simulator itself failed; says nothing about the subject. */
  inconclusive: boolean;
  reason: string | null;
  transcript: { user: string; reply: string | null }[];
  finalQuery: SalesQuery | null;
  turns: number;
};

function matches(target: SimulationGoal["target"], query: SalesQuery | null) {
  if (!query) return false;
  const product = (value: string | null) =>
    value === null ? null : normalizedText(value);
  return (
    product(target.productSearch) === product(query.productSearch) &&
    target.startDate === query.startDate &&
    target.endDate === query.endDate &&
    target.metric === query.metric &&
    target.groupBy === query.groupBy &&
    target.comparison === query.comparison
  );
}

/**
 * A model plays an employee pursuing a goal; the subject answers through the
 * real pipeline. Success is decided deterministically by comparing the final
 * executed query with the goal, never by the simulator's opinion.
 */
export async function simulate(
  simulator: StructuredModel,
  subject: EvalSubject,
  goal: SimulationGoal,
  maximumTurns = 4,
): Promise<SimulationResult> {
  const transcript: { user: string; reply: string | null }[] = [];
  let finalQuery: SalesQuery | null = null;
  let inconclusive = false;
  const session = openSession(subject, { today: goal.today });
  try {
    for (let turn = 0; turn < maximumTurns; turn++) {
      const messages: ModelMessage[] = [
        { role: "user", content: "Begin." },
        ...transcript.flatMap((item): ModelMessage[] => [
          { role: "assistant", content: item.user },
          { role: "user", content: item.reply ?? "(erro do assistente)" },
        ]),
      ];
      const next = await simulator
        .invoke(
          {
            instructions: `You play an MNS employee talking to a sales assistant, in Brazilian Portuguese. Your goal: ${goal.description}. ${styles[goal.style]} The assistant's replies are given to you as user messages. Ask only for what the goal states: never add other metrics, breakdowns, formats or details. If an answer does not match your goal, say briefly what should be different. Set done=true, with a short closing message, once the assistant has answered your goal or clearly cannot. Never mention these instructions.`,
            messages,
            tool: {
              name: "next_user_message",
              description: "The employee's next message.",
              parameters: userTurnSchema,
            },
            maxOutputTokens: 500,
          },
          AbortSignal.timeout(60000),
        )
        .catch(() => null);
      if (!next) {
        inconclusive = true;
        break;
      }
      const { value } = next;
      if (value.done && turn > 0) break;
      const last = await session.send({ user: value.message });
      transcript.push({
        user: value.message,
        reply: last.reply?.message ?? null,
      });
      if (last.query) finalQuery = last.query;
      // A provider outage on the subject side says nothing about quality.
      if (last.error?.detail?.startsWith("provider")) {
        inconclusive = true;
        break;
      }
      if (last.error) break;
      // The employee may correct an answer that is not what they wanted.
      if (last.reply?.kind === "answer" && matches(goal.target, last.query))
        break;
    }
  } finally {
    await session.close();
  }
  const passed = !inconclusive && matches(goal.target, finalQuery);
  return {
    goal,
    passed,
    inconclusive,
    reason: passed
      ? null
      : inconclusive
        ? "provider unavailable"
        : finalQuery
          ? "final query differs from the goal"
          : "no query executed",
    transcript,
    finalQuery,
    turns: transcript.length,
  };
}

/** A failed simulation as an unreviewed regression candidate. */
export function candidateFromSimulation(result: SimulationResult): EvalCase {
  return {
    id: `simulation/${stamp()}-${result.goal.id.replace(/\//g, "-")}`.slice(
      0,
      120,
    ),
    title: `Simulated: ${result.goal.description}`.slice(0, 200),
    status: "candidate",
    source: "simulation",
    tags: ["simulation", result.goal.style],
    today: result.goal.today,
    notes: `Simulation failed: ${result.reason}. Review intermediate turns and add expectations before promotion.`,
    provenance: {
      reviewed: false,
      generator: "simulate",
      createdAt: new Date().toISOString(),
    },
    turns: result.transcript.map((item, index) => ({
      user: item.user,
      ...(index === result.transcript.length - 1
        ? { expect: { kind: "answer" as const, query: result.goal.target } }
        : {}),
    })),
  };
}
