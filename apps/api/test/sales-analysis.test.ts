import { describe, expect, it } from "vitest";
import {
  comparisonSchema,
  dimensionSchema,
  groundedIn,
  groupingSchema,
  measureSchema,
  salesCatalog,
} from "../src/features/sales/analysis.js";
import {
  advance,
  emptySalesState,
  loadSalesState,
  type SalesConversationState,
} from "../src/features/sales/conversation-state.js";
import { resolvePeriod, periodKind } from "../src/features/sales/period.js";
import { interpretation, period } from "../evals/fixtures.js";

const today = "2026-10-05";
describe("period resolution", () => {
  it.each([
    [{ kind: "current", unit: "day" }, "2026-10-05", "2026-10-05"],
    [{ kind: "current", unit: "month" }, "2026-10-01", "2026-10-05"],
    [{ kind: "current", unit: "year" }, "2026-01-01", "2026-10-05"],
    [{ kind: "previous", unit: "day" }, "2026-10-04", "2026-10-04"],
    [{ kind: "previous", unit: "month" }, "2026-09-01", "2026-09-30"],
    [{ kind: "previous", unit: "year" }, "2025-01-01", "2025-12-31"],
    [{ kind: "last", unit: "day", count: 30 }, "2026-09-06", "2026-10-05"],
    [
      { kind: "last", unit: "day", count: 7, includeCurrent: false },
      "2026-09-28",
      "2026-10-04",
    ],
    [{ kind: "last", unit: "month", count: 3 }, "2026-07-01", "2026-09-30"],
    [
      { kind: "last", unit: "month", count: 3, includeCurrent: true },
      "2026-08-01",
      "2026-10-05",
    ],
    [{ kind: "month", month: 9 }, "2026-09-01", "2026-09-30"],
    [{ kind: "month", month: 10 }, "2026-10-01", "2026-10-05"],
    // A month after the current one without a year is its latest past occurrence.
    [{ kind: "month", month: 12 }, "2025-12-01", "2025-12-31"],
    [{ kind: "month", month: 2, year: 2024 }, "2024-02-01", "2024-02-29"],
    [{ kind: "year", year: 2025 }, "2025-01-01", "2025-12-31"],
    [
      { kind: "range", startDate: "2026-08-10", endDate: "2026-08-20" },
      "2026-08-10",
      "2026-08-20",
    ],
  ] as const)("resolves %j", (fixture, startDate, endDate) => {
    expect(resolvePeriod(period(fixture), today)).toMatchObject({
      ok: true,
      startDate,
      endDate,
    });
  });
  it("crosses year boundaries for relative months", () => {
    expect(
      resolvePeriod(
        period({ kind: "last", unit: "month", count: 2 }),
        "2026-01-15",
      ),
    ).toMatchObject({ startDate: "2025-11-01", endDate: "2025-12-31" });
    expect(
      resolvePeriod(period({ kind: "previous", unit: "month" }), "2026-01-15"),
    ).toMatchObject({ startDate: "2025-12-01", endDate: "2025-12-31" });
  });
  it("clamps a started period to today and rejects unqueryable periods", () => {
    expect(
      resolvePeriod(
        period({
          kind: "range",
          startDate: "2026-10-01",
          endDate: "2026-10-31",
        }),
        today,
      ),
    ).toEqual({
      ok: true,
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      clamped: true,
    });
    for (const [fixture, issue] of [
      [{ kind: "month", month: 11, year: 2026 }, "future"],
      [{ kind: "year", year: 2027 }, "future"],
      [{ kind: "last", unit: "month", count: 24 }, "too_long"],
      [
        { kind: "range", startDate: "1999-12-01", endDate: "1999-12-31" },
        "too_early",
      ],
      [
        { kind: "range", startDate: "2026-02-30", endDate: "2026-03-01" },
        "invalid",
      ],
      [
        { kind: "range", startDate: "2026-09-10", endDate: "2026-09-01" },
        "invalid",
      ],
      [{ kind: "last", unit: "year", count: 1 }, "invalid"],
      [{ kind: "current" }, "incomplete"],
      [{ kind: "month" }, "incomplete"],
    ] as const)
      expect(resolvePeriod(period(fixture), today)).toEqual({
        ok: false,
        issue,
      });
  });
  it("labels expression forms without values", () => {
    expect(periodKind(period({ kind: "last", unit: "month", count: 3 }))).toBe(
      "last_month",
    );
    expect(periodKind(period({ kind: "month", month: 9, year: 2025 }))).toBe(
      "month",
    );
  });
});

describe("analytical vocabulary", () => {
  it("keeps interpretation schemas identical to the implemented catalog", () => {
    const values = (schema: { anyOf: { const: string }[] }) =>
      schema.anyOf.map((item) => item.const);
    expect(values(measureSchema)).toEqual(salesCatalog.measures);
    expect(values(dimensionSchema)).toEqual(salesCatalog.dimensions);
    expect(values(groupingSchema)).toEqual(salesCatalog.groupings);
    expect(values(comparisonSchema)).toEqual(salesCatalog.comparisons);
  });
  it.each([
    ["maçã", "Quanto vendi de maçãs ontem?"],
    ["pão", "E os pães?"],
    ["pão francês", "pães franceses no mês passado"],
    ["limão", "venda de LIMÕES"],
    ["abacaxi", "abacaxis em setembro"],
    ["farinha de trigo", "Quanto saiu de farinha de trigo?"],
  ])("grounds %s in %s", (phrase, text) => {
    expect(groundedIn(phrase, [text])).toBe(true);
  });
  it.each([
    ["pera", "Quanto vendi no mês passado?"],
    ["maçã gala", "maçã fuji em setembro"],
    ["trigo farinha", "farinha de trigo"],
    ["   ", "qualquer texto"],
  ])("does not ground %s in %s", (phrase, text) => {
    expect(groundedIn(phrase, [text])).toBe(false);
  });
});

const askedForPeriod: SalesConversationState = {
  ...emptySalesState,
  pending: {
    draft: {
      measure: "net_value",
      filters: [{ dimension: "product", text: "maçã" }],
      period: null,
      groupBy: null,
      comparison: null,
    },
    awaiting: ["period"],
    clarification: "period",
  },
  transcript: [
    {
      user: "Quanto vendi de maçã?",
      reply: "clarification",
      text: "Qual período você quer consultar?",
    },
  ],
};
const answeredApples: SalesConversationState = {
  version: 2,
  active: {
    spec: {
      measure: "net_value",
      filters: [{ dimension: "product", text: "maçã" }],
      period: period({ kind: "last", unit: "month", count: 3 }),
      groupBy: "month",
      comparison: "none",
    },
    query: {
      productSearch: "maçã",
      startDate: "2026-07-01",
      endDate: "2026-09-30",
      metric: "net_value",
      groupBy: "month",
      comparison: "none",
    },
  },
  pending: null,
  transcript: [
    {
      user: "Quanto vendi de maçã nos últimos 3 meses?",
      reply: "answer",
      text: "summary",
    },
  ],
};

describe("conversation state transitions", () => {
  it("asks for a missing period and keeps what was understood", () => {
    const step = advance(
      emptySalesState,
      interpretation({ measure: "net_value", filters: { product: "maçã" } }),
      "Quanto vendi de maçã?",
      today,
    );
    expect(step.kind).toBe("clarify");
    expect(step.state.pending).toEqual(askedForPeriod.pending);
    expect(step.notes.missing).toEqual(["period"]);
  });
  it.each([
    ["answer_pending", []],
    ["new", ["new_completes_pending"]],
    ["refine", ["refine_applied_to_pending"]],
  ] as const)(
    "completes the pending request from a period-only %s reading",
    (relation, issues) => {
      const step = advance(
        askedForPeriod,
        interpretation({ relation, period: { kind: "month", month: 9 } }),
        "Setembro",
        today,
      );
      expect(step.kind).toBe("execute");
      if (step.kind !== "execute") return;
      expect(step.query).toEqual({
        productSearch: "maçã",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        metric: "net_value",
        groupBy: "total",
        comparison: "none",
      });
      expect(step.notes.issues).toEqual(issues);
      expect(step.state.pending).toBeNull();
      expect(step.state.active?.query).toEqual(step.query);
    },
  );
  it("treats a restated measure with the awaited period as the answer", () => {
    const step = advance(
      askedForPeriod,
      interpretation({
        measure: "net_value",
        period: { kind: "previous", unit: "month" },
      }),
      "Quanto vendi no mês passado?",
      today,
    );
    expect(step.kind === "execute" && step.query.productSearch).toBe("maçã");
  });
  it("starts a new analysis when the message changes what was requested", () => {
    const otherProduct = advance(
      askedForPeriod,
      interpretation({
        filters: { product: "banana" },
        period: { kind: "previous", unit: "day" },
      }),
      "Na verdade, quanto vendi de banana ontem?",
      today,
    );
    expect(otherProduct.kind === "execute" && otherProduct.query).toMatchObject(
      { productSearch: "banana", startDate: "2026-10-04" },
    );
    const allProducts = advance(
      askedForPeriod,
      interpretation({
        filters: { product: null },
        period: { kind: "previous", unit: "day" },
      }),
      "Quero o total de todos os produtos de ontem",
      today,
    );
    expect(
      allProducts.kind === "execute" && allProducts.query.productSearch,
    ).toBeNull();
  });
  it("updates the pending request when the reply adds information but no period", () => {
    const step = advance(
      askedForPeriod,
      interpretation({ relation: "answer_pending", measure: "quantity" }),
      "Em quantidade",
      today,
    );
    expect(step.kind).toBe("clarify");
    expect(step.state.pending?.draft).toMatchObject({
      measure: "quantity",
      filters: [{ dimension: "product", text: "maçã" }],
    });
  });
  it("refines the active analysis and retains unstated filters", () => {
    const step = advance(
      answeredApples,
      interpretation({ relation: "refine", comparison: "previous_year" }),
      "E comparado ao ano passado?",
      today,
    );
    expect(step.kind === "execute" && step.query).toEqual({
      ...answeredApples.active!.query,
      comparison: "previous_year",
    });
  });
  it("never carries retained filters into a new analysis", () => {
    const step = advance(
      answeredApples,
      interpretation({
        measure: "net_value",
        period: { kind: "current", unit: "month" },
      }),
      "Qual foi o valor líquido vendido neste mês?",
      today,
    );
    expect(step.kind === "execute" && step.query.productSearch).toBeNull();
  });
  it("grounds a filter in earlier user messages but rejects invented ones", () => {
    const earlier = advance(
      answeredApples,
      interpretation({
        filters: { product: "maçã" },
        period: { kind: "previous", unit: "month" },
      }),
      "E no mês passado, só desse produto?",
      today,
    );
    expect(earlier.kind).toBe("execute");
    const invented = advance(
      answeredApples,
      interpretation({
        relation: "refine",
        filters: { product: "pera" },
      }),
      "E no mês passado?",
      today,
    );
    expect(invented.kind === "clarify" && invented.clarification).toBe(
      "product",
    );
    expect(invented.notes.issues).toContain("ungrounded_product");
    expect(invented.state.pending?.draft.filters).toEqual(
      answeredApples.active!.spec.filters,
    );
  });
  it("turns unqueryable periods into period questions", () => {
    const future = advance(
      emptySalesState,
      interpretation({ period: { kind: "year", year: 2027 } }),
      "Vendas de 2027",
      today,
    );
    expect(future.kind === "clarify" && future.clarification).toBe("period");
    expect(future.notes.issues).toEqual(["period_future"]);
    const long = advance(
      emptySalesState,
      interpretation({ period: { kind: "last", unit: "month", count: 24 } }),
      "Vendas dos últimos 24 meses",
      today,
    );
    expect(long.kind === "clarify" && long.clarification).toBe("period_limit");
    expect(long.state.pending?.draft.period).toBeNull();
  });
  it("asks for context when there is nothing to refine", () => {
    const step = advance(
      emptySalesState,
      interpretation({ relation: "refine", comparison: "previous_year" }),
      "E no ano passado?",
      today,
    );
    expect(step.kind === "clarify" && step.clarification).toBe("context");
  });
  it("keeps state unchanged for unsupported requests and model clarifications", () => {
    const unsupported = advance(
      askedForPeriod,
      interpretation({
        decision: "unsupported",
        unsupportedReason: "dimension",
      }),
      "E por cliente?",
      today,
    );
    expect(unsupported.state).toBe(askedForPeriod);
    const ambiguous = advance(
      emptySalesState,
      interpretation({ decision: "clarify", clarification: "ambiguous" }),
      "Quanto vendi daquilo?",
      today,
    );
    expect(
      ambiguous.kind === "clarify" && ambiguous.state.pending?.awaiting,
    ).toEqual(["details", "period"]);
  });
});

describe("saved context", () => {
  const history = [
    {
      question: "Vendas de maçã em julho",
      reply: {
        kind: "answer",
        message: "Valor líquido vendido: R$ 10,00",
        result: {
          query: {
            productSearch: "maçã",
            startDate: "2026-07-01",
            endDate: "2026-07-31",
            metric: "net_value",
            groupBy: "total",
            comparison: "none",
          },
        },
      },
    },
  ];
  it("upgrades version 1 filters and transcript without figures", () => {
    const state = loadSalesState(
      {
        version: 1,
        lastQuery: history[0].reply.result.query,
        questions: ["Vendas de maçã em julho", "E por mês?"],
        clarifications: ["", "Qual período você quer consultar?"],
      },
      [],
    );
    expect(state.active?.query).toEqual(history[0].reply.result.query);
    expect(state.active?.spec.period).toMatchObject({
      kind: "range",
      startDate: "2026-07-01",
    });
    expect(state.pending).toBeNull();
    expect(state.transcript.map((item) => item.reply)).toEqual([
      "answer",
      "clarification",
    ]);
  });
  it("derives a transcript from history when no context exists", () => {
    const state = loadSalesState(null, history);
    expect(state.transcript[0].text).toContain('product="maçã"');
    expect(JSON.stringify(state)).not.toContain("R$");
  });
  it("rejects malformed or unknown context versions", () => {
    for (const saved of [
      { version: 3 },
      { version: 2, active: null },
      { version: 1, lastQuery: { productSearch: "x" } },
      { version: 1, lastQuery: null, questions: [1] },
      "context",
    ])
      expect(() => loadSalesState(saved, [])).toThrow();
  });
});
