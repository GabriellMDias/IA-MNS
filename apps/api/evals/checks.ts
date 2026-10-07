import { normalizedText } from "../src/features/sales/analysis.js";
import type { SalesConversationState } from "../src/features/sales/conversation-state.js";
import type { EvalCase, StateExpectation, TurnExpectation } from "./dataset.js";
import type { TurnObservation } from "./harness.js";

/** Why a check failed; stable names aggregate across runs and datasets. */
export const failureCategories = [
  "routing",
  "missed_clarification",
  "unexpected_clarification",
  "wrong_clarification",
  "missed_unsupported",
  "unexpected_unsupported",
  "reply_kind",
  "period",
  "filter_missing",
  "filter_unexpected",
  "filter_value",
  "measure",
  "grouping",
  "comparison",
  "context_retention",
  "source",
  "execution_error",
] as const;
export type FailureCategory = (typeof failureCategories)[number];

export type CheckResult = Readonly<{
  turn: number;
  check: string;
  passed: boolean;
  category: FailureCategory | null;
  expected: unknown;
  actual: unknown;
}>;

const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
const text = (value: string | null | undefined) =>
  value === null || value === undefined ? null : normalizedText(value);

function kindCategory(expected: string, actual: string): FailureCategory {
  if (expected === "clarification" && actual === "answer")
    return "missed_clarification";
  if (expected === "answer" && actual === "clarification")
    return "unexpected_clarification";
  if (expected === "unavailable" && actual !== "conversation")
    return "missed_unsupported";
  if (actual === "unavailable") return "unexpected_unsupported";
  return "reply_kind";
}

/** Product filter: absent, missing, unexpected or different (accent/case-insensitive). */
function filterCheck(
  turn: number,
  check: string,
  expected: string | null,
  actual: string | null,
): CheckResult {
  const passed = text(expected) === text(actual);
  return {
    turn,
    check,
    passed,
    category: passed
      ? null
      : expected === null
        ? "filter_unexpected"
        : actual === null
          ? "filter_missing"
          : "filter_value",
    expected,
    actual,
  };
}

function stateChecks(
  turn: number,
  expected: StateExpectation,
  state: SalesConversationState | null,
): CheckResult[] {
  const results: CheckResult[] = [];
  const check = (name: string, want: unknown, got: unknown): void => {
    results.push({
      turn,
      check: `state.${name}`,
      passed: same(want, got),
      category: same(want, got) ? null : "context_retention",
      expected: want,
      actual: got,
    });
  };
  const product = (filters: readonly { dimension: string; text: string }[]) =>
    filters.find((item) => item.dimension === "product")?.text ?? null;
  for (const scope of ["pending", "active"] as const) {
    const want = expected[scope];
    if (want === undefined) continue;
    const got = state?.[scope] ?? null;
    if (want === null || got === null) {
      check(
        scope,
        want === null ? null : "present",
        got === null ? null : "present",
      );
      continue;
    }
    const analysis = "draft" in got ? got.draft : got.spec;
    if ("awaiting" in want && want.awaiting !== undefined)
      check(
        `${scope}.awaiting`,
        [...want.awaiting].sort(),
        "awaiting" in got ? [...got.awaiting].sort() : null,
      );
    if (want.measure !== undefined)
      check(`${scope}.measure`, want.measure, analysis.measure);
    if (want.filters?.product !== undefined)
      check(
        `${scope}.product`,
        text(want.filters.product),
        text(product(analysis.filters)),
      );
    if ("groupBy" in want && want.groupBy !== undefined)
      check(`${scope}.groupBy`, want.groupBy, analysis.groupBy);
    if ("comparison" in want && want.comparison !== undefined)
      check(`${scope}.comparison`, want.comparison, analysis.comparison);
  }
  return results;
}

export function evaluateTurn(
  turn: number,
  expected: TurnExpectation | undefined,
  observed: TurnObservation,
): CheckResult[] {
  if (!expected) return [];
  if (observed.error)
    return [
      {
        turn,
        check: "execution",
        passed: false,
        category: "execution_error",
        expected: "completed",
        actual: observed.error,
      },
    ];
  const results: CheckResult[] = [];
  const actualKind = observed.reply?.kind ?? null;
  if (expected.route !== undefined)
    results.push({
      turn,
      check: "route",
      passed: expected.route === observed.route,
      category: expected.route === observed.route ? null : "routing",
      expected: expected.route,
      actual: observed.route,
    });
  let kindFailed = false;
  if (expected.kind !== undefined) {
    const passed = expected.kind === actualKind;
    kindFailed = !passed;
    results.push({
      turn,
      check: "kind",
      passed,
      category: passed ? null : kindCategory(expected.kind, actualKind ?? ""),
      expected: expected.kind,
      actual: actualKind,
    });
  }
  if (expected.clarification !== undefined && actualKind === "clarification") {
    const actual = observed.salesState?.pending?.clarification ?? null;
    results.push({
      turn,
      check: "clarification",
      passed: actual === expected.clarification,
      category:
        actual === expected.clarification ? null : "wrong_clarification",
      expected: expected.clarification,
      actual,
    });
  }
  if (expected.sources !== undefined)
    results.push({
      turn,
      check: "sources",
      passed: same(expected.sources, observed.sources),
      category: same(expected.sources, observed.sources) ? null : "source",
      expected: expected.sources,
      actual: observed.sources,
    });
  if (expected.sourceNotice !== undefined)
    results.push({
      turn,
      check: "sourceNotice",
      passed: expected.sourceNotice === observed.sourceNotice,
      category:
        expected.sourceNotice === observed.sourceNotice ? null : "source",
      expected: expected.sourceNotice,
      actual: observed.sourceNotice,
    });
  const want = expected.query;
  if (want) {
    const query = observed.query;
    if (!query) {
      if (!kindFailed)
        results.push({
          turn,
          check: "query",
          passed: false,
          category: kindCategory("answer", actualKind ?? ""),
          expected: "executed",
          actual: null,
        });
    } else {
      if (want.startDate !== undefined || want.endDate !== undefined) {
        const expectedPeriod = [
          want.startDate ?? query.startDate,
          want.endDate ?? query.endDate,
        ];
        const actualPeriod = [query.startDate, query.endDate];
        results.push({
          turn,
          check: "query.period",
          passed: same(expectedPeriod, actualPeriod),
          category: same(expectedPeriod, actualPeriod) ? null : "period",
          expected: expectedPeriod.join(".."),
          actual: actualPeriod.join(".."),
        });
      }
      if (want.productSearch !== undefined || !expected.allowExtraFilters)
        results.push(
          filterCheck(
            turn,
            "query.product",
            want.productSearch ?? null,
            query.productSearch,
          ),
        );
      for (const [field, category] of [
        ["metric", "measure"],
        ["groupBy", "grouping"],
        ["comparison", "comparison"],
      ] as const) {
        if (want[field] === undefined) continue;
        results.push({
          turn,
          check: `query.${field}`,
          passed: want[field] === query[field],
          category: want[field] === query[field] ? null : category,
          expected: want[field],
          actual: query[field],
        });
      }
    }
  }
  if (expected.state)
    results.push(...stateChecks(turn, expected.state, observed.salesState));
  return results;
}

export function evaluateCase(
  evalCase: EvalCase,
  observations: readonly TurnObservation[],
): CheckResult[] {
  return observations.flatMap((observed, index) =>
    evaluateTurn(index, evalCase.turns[index]?.expect, observed),
  );
}
