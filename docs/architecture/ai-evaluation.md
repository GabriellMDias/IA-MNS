# AI Evaluation

[Documentation index](../README.md) · [ADR-0024](../adr/0024-interpret-analytics-through-structured-state-and-evaluate-ai-behavior.md) · [AI interpretation](ai-interpretation.md) · [Testing strategy](testing-strategy.md) · [Validation](../validation.md)

This page owns how IA-MNS measures AI behavior: datasets, deterministic checks, metrics, reports, model-assisted scenario generation, and the path from a traced failure to a permanent regression case. The tooling lives in [`apps/api/evals/`](../../apps/api/evals/cli.ts) and runs the real agent orchestration, sales state machine and query compiler; only routing and interpretation vary between subjects. Oracle is never contacted: executed queries receive shape-valid synthetic rows, because evaluation measures interpretation, not ERP figures.

## Components

| Component | Responsibility |
| --- | --- |
| [`dataset.ts`](../../apps/api/evals/dataset.ts) | TypeBox schema and loader for dataset files; rejects malformed files, duplicate ids, curated candidates and active unreviewed cases. |
| [`fixtures.ts`](../../apps/api/evals/fixtures.ts) | Compact reference model readings (route and interpretation) used by datasets and tests. |
| [`harness.ts`](../../apps/api/evals/harness.ts) | Sessions that play turns through `runAgentTurn` with the subject's router and interpreter, recording route, reply, executed query, state, trace notes, invocations and errors. |
| [`subjects.ts`](../../apps/api/evals/subjects.ts) | `scripted` (replays each turn's fixtures) and `model` (production router and interpreter on a structured model). |
| [`checks.ts`](../../apps/api/evals/checks.ts) | Deterministic expectation checks with stable failure categories. |
| [`report.ts`](../../apps/api/evals/report.ts) | Runs, transient-failure retries, aggregate metrics, JSON reports and before/after comparison. |
| [`capture.ts`](../../apps/api/evals/capture.ts) | Converts a traced conversation into a candidate case. |
| [`synthetic.ts`](../../apps/api/evals/synthetic.ts) | Model-generated candidate cases and goal-driven user simulation. |
| [`cli.ts`](../../apps/api/evals/cli.ts) | `pnpm eval` commands. |

## Case format

A dataset file is `{ "version": 1, "description", "cases": [...] }`. Each case has a stable `id`, `title`, `status` (`active`, `candidate`, `quarantined`), `source` (`curated`, `trace`, `synthetic`, `simulation`), `tags`, the business date `today`, optional initial agent `context` (to reproduce a conversation mid-way), optional `provenance`, and up to 12 turns:

```json
{
  "user": "Este mês",
  "fixture": {
    "interpretation": {
      "relation": "answer_pending",
      "period": { "kind": "current", "unit": "month" }
    }
  },
  "expect": {
    "route": "sales",
    "kind": "answer",
    "query": {
      "productSearch": "maçã",
      "startDate": "2026-10-01",
      "endDate": "2026-10-05"
    },
    "state": { "pending": null }
  }
}
```

Expectations are optional per turn and per field:

- `route`: capability id or conversational intent.
- `kind`: `answer`, `clarification`, `unavailable` or `conversation`; `clarification` names the expected category.
- `query`: executed query fields. The product filter is always checked: an omitted `productSearch` means no product filter is allowed, unless `allowExtraFilters` is set. Products compare accent- and case-insensitively, exactly as Oracle matches; plural versus singular differs.
- `state`: retained context after the turn, such as `pending.awaiting`, pending or active product, measure, grouping or comparison.
- `sources`: the sales sources the turn queried, in order (`[]` when none ran); `sourceNotice`: whether the reply says the message names another source.

A turn may set `source` (`sankhya`, `vrmaster` or `all`) to the interface selection it is sent with; it defaults to `sankhya`.

A `fixture` is the reference model reading for that turn: usually a correct one, or a recorded faulty one the system must withstand (the `known-bug/*` cases replay the readings behind the reported clarification failure). Fixtures let the scripted subject replay the case deterministically; the model subject ignores them.

## Checks, categories and metrics

| Category | Meaning |
| --- | --- |
| `routing` | Wrong capability or intent. |
| `missed_clarification` / `unexpected_clarification` / `wrong_clarification` | Answered instead of asking, asked instead of answering, or asked for the wrong thing. |
| `missed_unsupported` / `unexpected_unsupported` / `reply_kind` | Unsupported scope answered, supported scope rejected, or another reply-kind mismatch. |
| `period` | Resolved dates differ. |
| `filter_missing` / `filter_unexpected` / `filter_value` | A required constraint was lost, an unintended constraint was added, or the value differs. |
| `measure`, `grouping`, `comparison` | Plan field differs. |
| `context_retention` | Retained state differs from the expectation. |
| `source`                                                                    | The queried sources or the source notice differ from the selection's expectation.         |
| `execution_error` | The turn failed; provider outages carry a `provider: <status>` detail. |

Reports aggregate active (gating) cases separately from candidates and quarantined cases: case and turn pass rates, accuracy per check, failures by category, clarification precision and recall, the unintended-constraint rate (executed queries with a filter the expectation did not allow), execution errors, retried cases, turn latency percentiles and token counts. `compare` lists fixed, regressed and still-failing case ids and metric deltas between two reports.

## Running evaluations

From the repository root (or `pnpm -C apps/api eval`):

| Command | Purpose |
| --- | --- |
| `pnpm -C apps/api test` | Includes [`evals.test.ts`](../../apps/api/evals/evals.test.ts): every active curated case must pass with the scripted subject, plus framework tests. Part of `pnpm validate` and CI. |
| `pnpm eval run` | Scripted run of curated cases with a summary and JSON report. |
| `pnpm eval run --subject model [--model <id>]` | Live router and interpreter (reads `OPENAI_API_KEY`, `OPENAI_MODEL` from the ignored `.env.local`). Options: `--tag`, `--case`, `--dataset`, `--include-candidates`, `--concurrency`, `--retries`, `--strict`, `--out`. |
| `pnpm eval compare <base.json> <head.json>` | Before/after comparison. |
| `pnpm eval validate` | Validates curated and local candidate files. |
| `pnpm eval capture --turn <uuid>` | Builds a candidate from a content trace (reads `ORION_DATABASE_URL`). |
| `pnpm eval synthesize --count <n> --focus <text>` | Model-generated candidates. |
| `pnpm eval simulate [--goal <id>] [--export-failures]` | Goal-driven simulated employees against the model subject. |

Model-backed commands send only synthetic dataset text to the provider, consume quota and are not part of `pnpm validate`. Production never retries chargeable calls; evaluation may re-run a case whose earliest failing turn hit a transient provider error (`--retries`, default 1 for the model subject) and records the attempts, so outages are not mistaken for interpretation quality. Reports and candidates are written to the ignored `apps/api/evals/.local/` directory.

## Regression datasets

Committed datasets live in [`apps/api/evals/datasets/curated/`](../../apps/api/evals/datasets/curated/periods.json): clarification and retained context, periods, follow-ups, scope and routing, and sources. They are synthetic Portuguese conversations with invented generic products; the repository is public, so they never contain real conversations, customers, figures or hosts. Rules:

- Active curated cases are human-reviewed and gate `pnpm test`. A curated case that cannot pass deterministically is a defect in the code or the expectation, not a reason to weaken checks.
- Expect only what the behavior requires. If either the router or the sales boundary may correctly reject a request, expect the `unavailable` reply, not a route.
- Every turn that should replay deterministically needs a fixture; a recorded faulty model reading belongs in a `known-bug/*` case whose expectation is the correct outcome.
- Quarantine (`status: quarantined`) is temporary, with a note giving the reason and removal condition.
- Change interpretation instructions together with their version identifier, and compare model runs before and after.

## From trace to regression case

1. Reproduce the failure locally with `IA_MNS_AI_TRACE=content`, or, once approved under PH-09, export an authorized trace.
2. `pnpm eval capture --turn <turn-id>` writes a candidate whose turns, initial state and expectations reproduce the observed behavior.
3. Correct the failing turn's expectation to the intended behavior, add fixtures, and rewrite every message synthetically: captured candidates contain confidential text and must never be committed as captured.
4. Move the reviewed case into a curated file with `status: active`, `source: curated` and a note naming the failure.
5. Fix the code or instructions, run `pnpm validate`, and compare live model reports before and after for the human-reviewed pull request.

## Synthetic generation and simulation

`synthesize` asks a model for varied multi-turn scenarios with proposed expectations. `simulate` lets a model play an employee pursuing a structured goal from [`simulation-goals.json`](../../apps/api/evals/datasets/simulation-goals.json) in a given style (terse, incremental, verbose), answering clarifications and correcting answers; success is decided deterministically by comparing the final executed query with the goal. A simulator or subject provider outage makes a run inconclusive, not failed.

Both produce only `candidate` cases with `provenance.reviewed: false`, which never enter gating metrics and cannot be marked active until reviewed. The first live generation on 2026-10-05 illustrated why: its proposals kept plural product phrases ("geleias de pêssego") contrary to the documented singular rule, so those "failures" were wrong expectations, not system defects.

## Model-based judging

No model judges correctness today. Every evaluated output is structured, so deterministic checks are stronger, cheaper and reproducible. A future judge could triage synthetic candidates or assess free text if the product ever authors it; it would run as a separate advisory report section, record its model and prompt version, and never decide pass or fail alone.

## Comparing prompts, models and implementations

A subject is any router and interpreter pair. `--model` selects another model of the configured provider; prompt variants are compared across revisions through their version identifiers, which reports record together with the Git revision. A new provider or implementation needs only a `StructuredModel` adapter or an `EvalSubject`; reports from different subjects compare with `pnpm eval compare`.

## Continuous-improvement workflow

| Step | Status |
| --- | --- |
| Interactions produce traces | Implemented: metadata logs by default; content traces locally on request. Production content capture awaits PH-09. |
| Traces become evaluation candidates | Implemented: `capture`. |
| Failures are detected | Implemented for curated, captured and synthetic cases; no automatic production failure detection or sampling exists. |
| Candidates become regression cases | Manual review, anonymization and promotion. |
| A developer or coding agent proposes an improvement | Manual; nothing modifies or deploys code automatically. |
| The complete suite runs | Deterministic replay in `pnpm validate`/CI; live model runs are opt-in and local. |
| Before/after quality is compared | Implemented: `compare`; reports are not stored or tracked centrally. |
| Human-reviewed pull request | Existing repository workflow. |

## Current results

On 2026-10-05 the scripted replay passed all 39 curated cases. Live runs with `gpt-6.1-sol` moved from 35/38 to 39/39 cases (60/60 turns, clarification precision and recall 100%, no unintended constraints) after one interpreter rule was restored and one wrong expectation was corrected; goal simulation reached all conclusive goals. The [implementation plan](../project/implementation-plan.md#current-work) (PJ-20) records the details. On 2026-10-07, with interpreter `sales-interpreter/2026-10-07.1` (source names are no longer filters or unsupported), the scripted replay and a live `gpt-6.1-sol` run both passed all 45 curated cases (67/67 live turns, clarification precision and recall 100%, no unintended constraints, every source check correct; one case was retried after a transient provider error). Results are a dated snapshot, not a guarantee: rerun and compare before relying on them.

## Limitations

- Curated coverage reflects today's capability: one dimension, three measures, two groupings plus total, two comparisons. Expectations encode human judgment and can be wrong.
- Live results vary between runs and models; compare several runs before concluding from small deltas.
- Synthetic rows make answers meaningless as figures; ERP reconciliation remains a separate verification.
- Reports are local files; no dashboard, scheduled run or central history exists.
