import { describe, expect, it } from "vitest";
import type { TSchema } from "typebox";
import {
  ModelFailure,
  type StructuredModel,
  type StructuredRequest,
} from "../src/ai/model.js";
import { SalesFailure } from "../src/features/sales/errors.js";
import { parseDataset, type LoadedCase } from "./dataset.js";
import { interpretation, salesRoute } from "./fixtures.js";
import type { EvalSubject } from "./harness.js";
import { runEvaluation } from "./report.js";
import {
  candidateFromSimulation,
  simulate,
  synthesizeCandidates,
  type SimulationGoal,
} from "./synthetic.js";

/** A structured model that returns queued tool arguments or failures. */
function fakeModel(outputs: unknown[]): StructuredModel & {
  requests: StructuredRequest<TSchema>[];
} {
  const requests: StructuredRequest<TSchema>[] = [];
  return {
    provider: "fake",
    model: "fake-model",
    requests,
    invoke: (request) => {
      requests.push(request);
      const next = outputs.shift();
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve({
        value: next as never,
        invocation: {
          provider: "fake",
          model: "fake-model",
          latencyMs: 1,
          inputTokens: 10,
          outputTokens: 5,
        },
      });
    },
  };
}

/** A subject reading every message by a fixed rule. */
const subject = (
  read: (message: string) => ReturnType<typeof interpretation>,
): EvalSubject => {
  let message = "";
  return {
    id: "rule",
    metadata: {},
    applicable: () => null,
    interpreter: () => ({ interpret: () => Promise.resolve(read(message)) }),
    router: () => ({
      route: (input) => {
        message = input.message;
        return Promise.resolve(salesRoute);
      },
    }),
  };
};
const goal: SimulationGoal = {
  id: "goal/apple-september",
  description: "Vendas de maçã em setembro.",
  style: "terse",
  today: "2026-10-05",
  target: {
    productSearch: "maçã",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    metric: "net_value",
    groupBy: "total",
    comparison: "none",
  },
};
const perfect = subject((message) =>
  message.includes("maçã")
    ? interpretation({ measure: "net_value", filters: { product: "maçã" } })
    : interpretation({
        relation: "answer_pending",
        period: { kind: "month", month: 9 },
      }),
);

describe("goal-driven simulation", () => {
  it("decides success from the executed query, not the simulator", async () => {
    const simulator = fakeModel([
      { message: "Quanto vendi de maçã?", done: false },
      { message: "Setembro", done: false },
    ]);
    const result = await simulate(simulator, perfect, goal);
    expect(result).toMatchObject({
      passed: true,
      inconclusive: false,
      turns: 2,
      finalQuery: goal.target,
    });
    expect(result.transcript[0].reply).toBe(
      "Qual período você quer consultar?",
    );
    // The simulator sees the assistant's replies as the other party.
    expect(simulator.requests[1].messages.at(-1)).toEqual({
      role: "user",
      content: "Qual período você quer consultar?",
    });
  });
  it("turns a failed goal into an unreviewed candidate", async () => {
    const forgetful = subject(() =>
      interpretation({ period: { kind: "month", month: 9 } }),
    );
    const result = await simulate(
      fakeModel([
        { message: "Vendas em setembro", done: false },
        { message: "Deixa para lá, obrigado.", done: true },
      ]),
      forgetful,
      goal,
    );
    expect(result).toMatchObject({
      passed: false,
      reason: "final query differs from the goal",
    });
    const candidate = candidateFromSimulation(result);
    expect(candidate).toMatchObject({
      status: "candidate",
      source: "simulation",
      provenance: { reviewed: false },
      turns: [{ expect: { kind: "answer", query: goal.target } }],
    });
    expect(() =>
      parseDataset("candidate.json", {
        version: 1,
        description: "Simulation",
        cases: [candidate],
      }),
    ).not.toThrow();
  });
  it("marks a simulator outage inconclusive", async () => {
    const result = await simulate(
      fakeModel([new ModelFailure("provider")]),
      perfect,
      goal,
    );
    expect(result).toMatchObject({
      passed: false,
      inconclusive: true,
      reason: "provider unavailable",
    });
  });
});

describe("synthetic candidates", () => {
  it("produces only unreviewed candidates with converted expectations", async () => {
    const generator = fakeModel([
      {
        cases: [
          {
            title: "Pergunta incompleta",
            turns: [
              {
                user: "Quanto vendi de pera?",
                expectKind: "clarification",
                expectProduct: null,
                expectStartDate: null,
                expectEndDate: null,
                expectMetric: null,
                expectGroupBy: null,
                expectComparison: null,
              },
              {
                user: "Ontem",
                expectKind: "answer",
                expectProduct: "pera",
                expectStartDate: "2026-10-04",
                expectEndDate: "2026-10-04",
                expectMetric: "net_value",
                expectGroupBy: null,
                expectComparison: null,
              },
            ],
          },
        ],
      },
    ]);
    const [candidate] = await synthesizeCandidates(generator, {
      count: 1,
      focus: "clarification",
      today: "2026-10-05",
      examples: [],
    });
    expect(candidate).toMatchObject({
      status: "candidate",
      source: "synthetic",
      provenance: { reviewed: false, model: "fake:fake-model" },
      turns: [
        { expect: { kind: "clarification" } },
        {
          expect: {
            kind: "answer",
            query: {
              productSearch: "pera",
              startDate: "2026-10-04",
              endDate: "2026-10-04",
              metric: "net_value",
            },
          },
        },
      ],
    });
    expect(candidate.turns[0].expect).not.toHaveProperty("query");
  });
});

describe("transient provider failures", () => {
  it("retries a case only for provider outages and records the attempts", async () => {
    let calls = 0;
    const flaky: EvalSubject = {
      ...perfect,
      interpreter: (script) => ({
        interpret: (...args) => {
          calls++;
          if (calls === 1)
            return Promise.reject(
              new SalesFailure(
                "SALES_PROVIDER_UNAVAILABLE",
                new ModelFailure("provider"),
              ),
            );
          return perfect.interpreter(script).interpret(...args);
        },
      }),
    };
    const evalCase: LoadedCase = {
      id: "retry/sample",
      title: "Retry",
      status: "active",
      source: "curated",
      tags: [],
      today: "2026-10-05",
      file: "inline.json",
      turns: [
        { user: "Quanto vendi de maçã?", expect: { kind: "clarification" } },
        // Fails as a consequence when the first turn hits the outage.
        { user: "Setembro", expect: { kind: "answer" } },
      ],
    };
    const report = await runEvaluation(flaky, [evalCase], {
      datasets: [],
      retries: 1,
    });
    expect(report.cases[0]).toMatchObject({ outcome: "passed", attempts: 2 });
    expect(report.summary.retriedCases).toBe(1);
    const unretried = await runEvaluation(
      {
        ...perfect,
        interpreter: () => ({
          interpret: () => Promise.reject(new Error("defect")),
        }),
      },
      [evalCase],
      { datasets: [], retries: 3 },
    );
    expect(unretried.cases[0]).toMatchObject({
      outcome: "failed",
      attempts: 1,
    });
  });
});
