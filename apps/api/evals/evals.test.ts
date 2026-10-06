import { describe, expect, it } from "vitest";
import {
  DatasetError,
  loadCases,
  parseDataset,
  type LoadedCase,
} from "./dataset.js";
import { scriptedSubject } from "./subjects.js";
import { compareReports, evaluate, runEvaluation } from "./report.js";

const { cases, files } = await loadCases();
const active = cases.filter((item) => item.status === "active");

describe("curated regression dataset", () => {
  it("is non-empty, reviewed and replayable", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(active.length).toBeGreaterThanOrEqual(30);
    for (const item of active) {
      expect(item.source).toBe("curated");
      expect(scriptedSubject.applicable(item)).toBeNull();
    }
  });
  it.each(active.map((item) => [item.id, item] as const))(
    "%s",
    async (_id, item) => {
      const result = await evaluate(scriptedSubject, item);
      const failures = result.checks.filter((check) => !check.passed);
      expect(failures).toEqual([]);
      expect(result.outcome).toBe("passed");
    },
  );
});

/** A copy of a curated case with one turn's fixture replaced. */
function variant(
  id: string,
  turn: number,
  fixture: NonNullable<LoadedCase["turns"][number]["fixture"]>,
): LoadedCase {
  const original = active.find((item) => item.id === id)!;
  const copy = structuredClone(original);
  copy.turns[turn].fixture = fixture;
  return copy;
}

describe("evaluation checks", () => {
  it("categorizes a lost product, a missed clarification and an invented filter", async () => {
    const lost = await evaluate(
      scriptedSubject,
      variant("follow-up/change-period", 1, {
        interpretation: {
          relation: "new",
          period: { kind: "month", month: 9 },
        },
      }),
    );
    expect(
      lost.checks.filter((check) => !check.passed).map((c) => c.category),
    ).toEqual(["filter_missing"]);
    const executed = await evaluate(
      scriptedSubject,
      variant("pending/period-answered-with-current-month", 0, {
        interpretation: {
          measure: "net_value",
          filters: { product: "maçã" },
          period: { kind: "current", unit: "month" },
        },
      }),
    );
    expect(executed.checks.find((check) => !check.passed)?.category).toBe(
      "missed_clarification",
    );
    const invented = await evaluate(
      scriptedSubject,
      variant("constraints/no-product-means-all-products", 0, {
        interpretation: {
          measure: "net_value",
          filters: { product: "valor" },
          period: { kind: "current", unit: "month" },
        },
      }),
    );
    // "valor" is written in the question, so grounding admits it: only the
    // evaluation exposes the unintended constraint.
    expect(
      invented.checks.filter((check) => !check.passed).map((c) => c.category),
    ).toEqual(["filter_unexpected"]);
  });
  it("categorizes routing, period, retained state and execution failures", async () => {
    const routed = await evaluate(
      scriptedSubject,
      variant("social/wellbeing", 0, {
        route: { intent: "greeting", capabilityId: null },
      }),
    );
    expect(routed.checks.find((check) => !check.passed)?.category).toBe(
      "routing",
    );
    const period = await evaluate(
      scriptedSubject,
      variant("period/yesterday", 0, {
        interpretation: {
          measure: "net_value",
          period: { kind: "current", unit: "day" },
        },
      }),
    );
    expect(period.checks.find((check) => !check.passed)?.category).toBe(
      "period",
    );
    const forgotten = await evaluate(
      scriptedSubject,
      variant("pending/period-answered-with-current-month", 0, {
        interpretation: { measure: "net_value" },
      }),
    );
    expect(
      forgotten.checks.filter((check) => !check.passed).map((c) => c.category),
    ).toContain("context_retention");
    const broken = await evaluate(
      scriptedSubject,
      variant("period/yesterday", 0, {}),
    );
    expect(broken.outcome).toBe("skipped");
    const crashed = await evaluate(
      { ...scriptedSubject, applicable: () => null },
      variant("period/yesterday", 0, {}),
    );
    expect(crashed.checks[0]).toMatchObject({
      check: "execution",
      category: "execution_error",
    });
  });
});

describe("reports", () => {
  it("aggregates gating metrics separately from candidates and compares runs", async () => {
    const selected = active.filter((item) =>
      [
        "pending/period-answered-with-current-month",
        "follow-up/change-period",
        "period/yesterday",
      ].includes(item.id),
    );
    const candidate: LoadedCase = {
      ...variant("follow-up/change-period", 1, {
        interpretation: {
          relation: "new",
          period: { kind: "month", month: 9 },
        },
      }),
      id: "candidate/lost-product",
      status: "candidate",
      source: "synthetic",
      provenance: { reviewed: false },
    };
    const baseline = await runEvaluation(
      scriptedSubject,
      [...selected, candidate],
      {
        datasets: files,
      },
    );
    expect(baseline.summary.cases).toEqual({
      total: 3,
      passed: 3,
      failed: 0,
      skipped: 0,
    });
    expect(baseline.summary.clarification).toMatchObject({
      expected: 1,
      asked: 1,
      precision: 1,
      recall: 1,
    });
    expect(baseline.summary.unintendedConstraintRate).toBe(0);
    expect(baseline.nonGating.cases.failed).toBe(1);
    expect(baseline.nonGating.failuresByCategory.filter_missing).toBe(1);
    const regressed = await runEvaluation(
      scriptedSubject,
      [
        variant("follow-up/change-period", 1, {
          interpretation: {
            relation: "new",
            period: { kind: "month", month: 9 },
          },
        }),
        ...selected.filter((item) => item.id !== "follow-up/change-period"),
      ],
      { datasets: files },
    );
    const comparison = compareReports(baseline, regressed);
    expect(comparison.regressed).toEqual(["follow-up/change-period"]);
    expect(comparison.deltas["failures.filter_missing"]).toBe(1);
    expect(compareReports(regressed, baseline).fixed).toEqual([
      "follow-up/change-period",
    ]);
  });
});

describe("dataset validation", () => {
  const valid = {
    version: 1,
    description: "Synthetic",
    cases: [
      {
        id: "sample/case",
        title: "Sample",
        status: "active",
        source: "curated",
        tags: [],
        today: "2026-10-05",
        turns: [{ user: "Oi" }],
      },
    ],
  };
  it("accepts a minimal dataset and rejects malformed or unreviewed ones", () => {
    expect(parseDataset("sample.json", valid).cases).toHaveLength(1);
    for (const change of [
      { id: "Invalid Id" },
      { today: "05/10/2026" },
      { turns: [] },
      { status: "candidate" },
      { source: "synthetic", provenance: { reviewed: false } },
      { turns: [{ user: "Oi", expect: { query: { sql: "x" } } }] },
    ])
      expect(() =>
        parseDataset("sample.json", {
          ...valid,
          cases: [{ ...valid.cases[0], ...change }],
        }),
      ).toThrow(DatasetError);
  });
});
