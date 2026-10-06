import {
  evaluateCase,
  failureCategories,
  type CheckResult,
  type FailureCategory,
} from "./checks.js";
import type { EvalCase, LoadedCase } from "./dataset.js";
import {
  observeCase,
  type EvalSubject,
  type TurnObservation,
} from "./harness.js";

export type CaseResult = {
  id: string;
  title: string;
  file: string;
  status: EvalCase["status"];
  source: EvalCase["source"];
  tags: string[];
  outcome: "passed" | "failed" | "skipped";
  /** Executions of the case; above one only after transient provider failures. */
  attempts: number;
  skipReason: string | null;
  checks: CheckResult[];
  turns: TurnObservation[];
};

export type Summary = {
  cases: { total: number; passed: number; failed: number; skipped: number };
  passRate: number | null;
  turns: { evaluated: number; passed: number; passRate: number | null };
  checks: { total: number; passed: number };
  byCheck: Record<string, { total: number; passed: number; accuracy: number }>;
  failuresByCategory: Record<FailureCategory, number>;
  clarification: {
    expected: number;
    asked: number;
    correct: number;
    precision: number | null;
    recall: number | null;
  };
  /** Executed queries carrying a filter the expectation did not allow. */
  unintendedConstraintRate: number | null;
  errors: number;
  /** Cases that needed a retry after a transient provider failure. */
  retriedCases: number;
  latencyMs: { p50: number; p95: number; max: number } | null;
  tokens: { input: number; output: number } | null;
};

export type RunReport = {
  version: 1;
  run: {
    startedAt: string;
    finishedAt: string;
    subject: { id: string; metadata: Readonly<Record<string, string>> };
    revision: string | null;
    datasets: { file: string; description: string }[];
    selection: Readonly<Record<string, unknown>>;
  };
  /** Gating summary over active cases only. */
  summary: Summary;
  /** Unreviewed candidates and quarantined cases, never mixed into the gate. */
  nonGating: Summary;
  cases: CaseResult[];
};

const ratio = (part: number, whole: number) =>
  whole === 0 ? null : Math.round((part / whole) * 10000) / 10000;

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))
  ];
}

export function summarize(results: readonly CaseResult[]): Summary {
  const evaluated = results.filter((item) => item.outcome !== "skipped");
  const checks = evaluated.flatMap((item) => item.checks);
  const byCheck: Summary["byCheck"] = {};
  for (const check of checks) {
    const name = check.check.startsWith("state.") ? "state" : check.check;
    const entry = (byCheck[name] ??= { total: 0, passed: 0, accuracy: 0 });
    entry.total++;
    if (check.passed) entry.passed++;
    entry.accuracy = ratio(entry.passed, entry.total) ?? 0;
  }
  const failuresByCategory = Object.fromEntries(
    failureCategories.map((category) => [category, 0]),
  ) as Record<FailureCategory, number>;
  for (const check of checks)
    if (check.category) failuresByCategory[check.category]++;
  let turnsEvaluated = 0;
  let turnsPassed = 0;
  let expectedClarifications = 0;
  let askedClarifications = 0;
  let correctClarifications = 0;
  let constrained = 0;
  let unintended = 0;
  const latencies: number[] = [];
  let input = 0;
  let output = 0;
  let metered = false;
  for (const item of evaluated)
    item.turns.forEach((turn, index) => {
      latencies.push(turn.latencyMs);
      for (const call of turn.invocations) {
        if (call.inputTokens !== null || call.outputTokens !== null)
          metered = true;
        input += call.inputTokens ?? 0;
        output += call.outputTokens ?? 0;
      }
      const own = item.checks.filter((check) => check.turn === index);
      if (own.length === 0) return;
      turnsEvaluated++;
      if (own.every((check) => check.passed)) turnsPassed++;
      const kind = own.find((check) => check.check === "kind");
      if (kind) {
        const expected = kind.expected === "clarification";
        const asked = turn.reply?.kind === "clarification";
        if (expected) expectedClarifications++;
        if (asked) askedClarifications++;
        if (expected && asked) correctClarifications++;
      }
      const product = own.find((check) => check.check === "query.product");
      if (product) {
        constrained++;
        if (product.category === "filter_unexpected") unintended++;
      }
    });
  const passed = evaluated.filter((item) => item.outcome === "passed").length;
  return {
    cases: {
      total: results.length,
      passed,
      failed: evaluated.length - passed,
      skipped: results.length - evaluated.length,
    },
    passRate: ratio(passed, evaluated.length),
    turns: {
      evaluated: turnsEvaluated,
      passed: turnsPassed,
      passRate: ratio(turnsPassed, turnsEvaluated),
    },
    checks: {
      total: checks.length,
      passed: checks.filter((check) => check.passed).length,
    },
    byCheck,
    failuresByCategory,
    clarification: {
      expected: expectedClarifications,
      asked: askedClarifications,
      correct: correctClarifications,
      precision: ratio(correctClarifications, askedClarifications),
      recall: ratio(correctClarifications, expectedClarifications),
    },
    unintendedConstraintRate: ratio(unintended, constrained),
    errors: failuresByCategory.execution_error,
    retriedCases: evaluated.filter((item) => item.attempts > 1).length,
    latencyMs: latencies.length
      ? {
          p50: percentile(latencies, 0.5),
          p95: percentile(latencies, 0.95),
          max: Math.max(...latencies),
        }
      : null,
    tokens: metered ? { input, output } : null,
  };
}

export async function evaluate(
  subject: EvalSubject,
  evalCase: LoadedCase,
): Promise<CaseResult> {
  const base = {
    id: evalCase.id,
    title: evalCase.title,
    file: evalCase.file,
    status: evalCase.status,
    source: evalCase.source,
    tags: evalCase.tags,
  };
  const reason = subject.applicable(evalCase);
  if (reason)
    return {
      ...base,
      outcome: "skipped",
      attempts: 0,
      skipReason: reason,
      checks: [],
      turns: [],
    };
  const turns = await observeCase(subject, evalCase);
  const checks = evaluateCase(evalCase, turns);
  return {
    ...base,
    outcome: checks.every((check) => check.passed) ? "passed" : "failed",
    attempts: 1,
    skipReason: null,
    checks,
    turns,
  };
}

export async function runEvaluation(
  subject: EvalSubject,
  cases: readonly LoadedCase[],
  options: {
    datasets: { file: string; description: string }[];
    selection?: Readonly<Record<string, unknown>>;
    revision?: string | null;
    concurrency?: number;
    /** Re-runs of a case whose only failures are transient provider errors. */
    retries?: number;
    onCase?: (result: CaseResult) => void;
  },
): Promise<RunReport> {
  // Production never retries chargeable provider calls; evaluation may, so
  // provider outages do not masquerade as interpretation quality.
  // Later turns of a conversation depend on earlier ones, so the earliest
  // failing turn decides whether the case failed for a transient reason.
  const transient = (result: CaseResult) => {
    const failed = result.checks.filter((check) => !check.passed);
    const first = Math.min(...failed.map((check) => check.turn));
    return failed.some((check) => {
      const detail = (check.actual as { detail?: unknown } | null)?.detail;
      return (
        check.turn === first &&
        check.category === "execution_error" &&
        typeof detail === "string" &&
        detail.startsWith("provider")
      );
    });
  };
  const startedAt = new Date().toISOString();
  const results: CaseResult[] = new Array<CaseResult>(cases.length);
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const index = next++;
      let result = await evaluate(subject, cases[index]);
      for (
        let attempt = 2;
        attempt <= 1 + (options.retries ?? 0) && transient(result);
        attempt++
      )
        result = {
          ...(await evaluate(subject, cases[index])),
          attempts: attempt,
        };
      results[index] = result;
      options.onCase?.(result);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, options.concurrency ?? 1) }, worker),
  );
  return {
    version: 1,
    run: {
      startedAt,
      finishedAt: new Date().toISOString(),
      subject: { id: subject.id, metadata: subject.metadata },
      revision: options.revision ?? null,
      datasets: options.datasets,
      selection: options.selection ?? {},
    },
    summary: summarize(results.filter((item) => item.status === "active")),
    nonGating: summarize(results.filter((item) => item.status !== "active")),
    cases: results,
  };
}

export type Comparison = {
  base: RunReport["run"];
  head: RunReport["run"];
  fixed: string[];
  regressed: string[];
  stillFailing: string[];
  added: string[];
  removed: string[];
  deltas: Record<string, number | null>;
};

/** Before/after comparison by case id and aggregate metric (gating cases only). */
export function compareReports(base: RunReport, head: RunReport): Comparison {
  const gating = (report: RunReport) =>
    new Map(
      report.cases
        .filter(
          (item) => item.status === "active" && item.outcome !== "skipped",
        )
        .map((item) => [item.id, item.outcome]),
    );
  const before = gating(base);
  const after = gating(head);
  const fixed: string[] = [];
  const regressed: string[] = [];
  const stillFailing: string[] = [];
  for (const [id, outcome] of after) {
    const prior = before.get(id);
    if (prior === "failed" && outcome === "passed") fixed.push(id);
    if (prior === "passed" && outcome === "failed") regressed.push(id);
    if (prior === "failed" && outcome === "failed") stillFailing.push(id);
  }
  const delta = (left: number | null, right: number | null) =>
    left === null || right === null
      ? null
      : Math.round((right - left) * 10000) / 10000;
  const deltas: Record<string, number | null> = {
    passRate: delta(base.summary.passRate, head.summary.passRate),
    turnPassRate: delta(
      base.summary.turns.passRate,
      head.summary.turns.passRate,
    ),
    clarificationPrecision: delta(
      base.summary.clarification.precision,
      head.summary.clarification.precision,
    ),
    clarificationRecall: delta(
      base.summary.clarification.recall,
      head.summary.clarification.recall,
    ),
    unintendedConstraintRate: delta(
      base.summary.unintendedConstraintRate,
      head.summary.unintendedConstraintRate,
    ),
    latencyP50: delta(
      base.summary.latencyMs?.p50 ?? null,
      head.summary.latencyMs?.p50 ?? null,
    ),
  };
  for (const category of failureCategories)
    deltas[`failures.${category}`] =
      head.summary.failuresByCategory[category] -
      base.summary.failuresByCategory[category];
  return {
    base: base.run,
    head: head.run,
    fixed: fixed.sort(),
    regressed: regressed.sort(),
    stillFailing: stillFailing.sort(),
    added: [...after.keys()].filter((id) => !before.has(id)).sort(),
    removed: [...before.keys()].filter((id) => !after.has(id)).sort(),
    deltas,
  };
}

const percent = (value: number | null) =>
  value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;

export function formatSummary(report: RunReport): string {
  const { summary } = report;
  const lines = [
    `Subject: ${report.run.subject.id} ${JSON.stringify(report.run.subject.metadata)}`,
    `Revision: ${report.run.revision ?? "unknown"}`,
    `Cases: ${summary.cases.passed}/${summary.cases.total - summary.cases.skipped} passed (${percent(summary.passRate)}), ${summary.cases.skipped} skipped`,
    `Turns: ${summary.turns.passed}/${summary.turns.evaluated} passed (${percent(summary.turns.passRate)})`,
    `Clarification precision ${percent(summary.clarification.precision)}, recall ${percent(summary.clarification.recall)}`,
    `Unintended constraint rate: ${percent(summary.unintendedConstraintRate)}`,
    `Execution errors: ${summary.errors}; cases retried after transient provider errors: ${summary.retriedCases}`,
    ...(summary.latencyMs
      ? [
          `Turn latency p50 ${summary.latencyMs.p50} ms, p95 ${summary.latencyMs.p95} ms`,
        ]
      : []),
    ...(summary.tokens
      ? [
          `Tokens: ${summary.tokens.input} input, ${summary.tokens.output} output`,
        ]
      : []),
    `Accuracy by check: ${Object.entries(summary.byCheck)
      .map(([name, entry]) => `${name} ${percent(entry.accuracy)}`)
      .join(", ")}`,
  ];
  const failures = Object.entries(summary.failuresByCategory).filter(
    ([, count]) => count > 0,
  );
  if (failures.length)
    lines.push(
      `Failures by category: ${failures.map(([name, count]) => `${name}=${count}`).join(", ")}`,
    );
  for (const item of report.cases.filter((entry) => entry.outcome === "failed"))
    for (const check of item.checks.filter((entry) => !entry.passed))
      lines.push(
        `  FAIL ${item.status === "active" ? "" : `[${item.status}] `}${item.id} turn ${check.turn + 1} ${check.check} (${check.category}): expected ${JSON.stringify(check.expected)}, got ${JSON.stringify(check.actual)}`,
      );
  if (report.nonGating.cases.total)
    lines.push(
      `Non-gating (candidate/quarantined): ${report.nonGating.cases.passed}/${report.nonGating.cases.total - report.nonGating.cases.skipped} passed`,
    );
  return lines.join("\n");
}

export function formatComparison(comparison: Comparison): string {
  return [
    `Base: ${comparison.base.subject.id} @ ${comparison.base.revision ?? "unknown"} ${JSON.stringify(comparison.base.subject.metadata)}`,
    `Head: ${comparison.head.subject.id} @ ${comparison.head.revision ?? "unknown"} ${JSON.stringify(comparison.head.subject.metadata)}`,
    `Fixed (${comparison.fixed.length}): ${comparison.fixed.join(", ") || "none"}`,
    `Regressed (${comparison.regressed.length}): ${comparison.regressed.join(", ") || "none"}`,
    `Still failing (${comparison.stillFailing.length}): ${comparison.stillFailing.join(", ") || "none"}`,
    `Added: ${comparison.added.join(", ") || "none"}; removed: ${comparison.removed.join(", ") || "none"}`,
    `Deltas: ${
      Object.entries(comparison.deltas)
        .filter(([, value]) => value !== null && value !== 0)
        .map(([name, value]) => `${name} ${value! > 0 ? "+" : ""}${value}`)
        .join(", ") || "none"
    }`,
  ].join("\n");
}
