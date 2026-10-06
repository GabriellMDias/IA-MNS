# ADR-0024: Interpret Analytics through Structured State and Evaluate AI Behavior

**Status:** accepted
**Date:** 2026-10-05
**Extends:** [ADR-0018](0018-bound-natural-language-sales-to-a-read-only-query-capability.md) (how a question becomes a bounded query) and [ADR-0019](0019-compose-a-corporate-agent-with-durable-conversations.md) (what capability context holds and how routing sees it). Their controlled execution, deterministic answers, durable conversations and grounded replies remain valid.

## Context

Sales interpretation asked the model to produce the complete query, including computed dates, from raw recent questions plus the last successful query. A clarification turn stored no structured record of what had been understood or what was missing, and the router saw only user questions, not the clarification it was answering. A reply such as "Este mês" after "Qual período você quer consultar?" therefore depended on two model calls reconstructing intent from text; in practice the pending sales request was sometimes lost. Nothing measured interpretation quality: tests covered provider boundaries and deterministic calculations, not multi-turn behavior, and no trace allowed a failure to be reproduced.

The owner requested, on 2026-10-05, a foundation for reliable, extensible and systematically improvable AI-assisted analytics: structured conversation state, an analytical plan between language and execution, an evaluation framework with regression datasets, synthetic scenarios that are never trusted blindly, and explicit, configurable AI tracing. The request excluded self-modifying systems, fine-tuning, new providers, new ERP semantics and a large ML platform, and delegated the design.

## Decision

Accepted under that delegation after reviewing the agent, sales capability, Orion boundaries, telemetry redaction and migration policies.

1. **The model reports a change; the application owns state.** Sales interpretation returns a strict structured *interpretation*: a decision (analyze, clarify, unsupported), the relation of the message to the conversation (new, refine, answer a pending request), and only what the current message states — measure, catalog-dimension filters, a named period expression, grouping and comparison. Deterministic code normalizes the relation against the state it actually holds, merges the change, applies defaults, checks completeness, grounds filters in user text, resolves periods against the Sao Paulo business date and compiles the result into the existing bounded `SalesQuery`. Missing required information produces an application-authored clarification and a *pending request*.
2. **Structured conversation state is versioned capability context.** Sales context version 2 holds the last executed plan and query, the pending request (known slots, awaited slots, question asked) and a bounded transcript of user questions with application-authored replies; answers appear only as filter descriptions. Version 1 contexts upgrade on read. The agent's own context records which capability awaits an answer; the router receives it together with the application's earlier replies, and a message the router cannot place while a capability waits is offered to that capability, whose boundary rejects unsupported requests.
3. **An analytical plan with a catalog-derived vocabulary.** Measures, filterable dimensions, groupings and comparisons are declared in one catalog from which interpretation schemas derive. Only entries that compile to the reconciled reference query exist; new dimensions are added together with their reviewed query support.
4. **A provider-neutral structured-model port.** One interface performs a forced strict tool call and returns validated output with safe invocation metadata (model, latency, tokens). The OpenAI Responses adapter keeps `store:false`, no automatic retries and the existing timeouts. No other provider is integrated.
5. **Explicit AI tracing levels.** `IA_MNS_AI_TRACE` selects `off`, `metadata` (default: allowlisted decisions, normalization and guard codes, period form, prompt versions, timings and token counts in one structured log event per turn, never user text, filter values or results) or `content` (also the confidential interpretation, state before/after and executed filters, stored in `agent_turn_traces` in the turn-completion transaction and deleted with the conversation). Content capture is refused in production until the shared retention and access policy approves it.
6. **Evaluation as versioned TypeScript tooling beside the API.** Curated datasets of multi-turn cases with structured expectations, deterministic checks with failure categories and aggregate metrics, reports that compare runs, replay of reference model readings inside the ordinary test gate, opt-in runs against the live model, capture of traced conversations as candidates, and model-assisted synthetic generation and goal-driven simulation whose output is always an unreviewed, non-gating candidate. Success is decided by deterministic checks; no model judges correctness.

## Rationale

Dialogue-state tracking with deterministic merging addresses the failure class rather than its example: whatever the wording of an answer, the request it completes is held by the application, so retention no longer depends on a model copying earlier values. Normalization rules (a refinement while a request is pending applies to that request; a "new" reading that supplies only awaited or restated slots completes it) tolerate the model mistakes observed in practice and are themselves tested. Moving calendar arithmetic out of the model makes period interpretation exact and testable; a range form keeps any explicit period expressible. Grounding rejects filters the user never wrote, a class of silently wrong answers that schema validation cannot detect. Deriving schemas from a catalog lets partner, company, project, salesperson or product-group analysis grow by vocabulary and reconciled query support instead of handcrafted flows.

The structured-model port removes duplicated provider handling from the router and interpreter, gives one place for invocation metadata, and lets evaluation run the same code against other models or prompt versions; it adds no vendor abstraction beyond that responsibility. Trace content shares the turn's lifecycle so deletion and future retention apply to it automatically, rather than creating a second copy of confidential data in files or a telemetry backend.

TypeScript keeps evaluation on the real pipeline: datasets replay the same orchestration, state machine and compiler the API runs. Python would require reimplementing or remotely invoking that pipeline for no capability the evaluation needs; dataset and report formats are JSON, so other tools can analyze them later.

The costs are a second model-facing contract to maintain, deterministic rules that encode dialogue policy and need evaluation when they change, a new optional table, and live evaluations that consume provider quota. Curated expectations are human judgments and can be wrong; the live evaluation of 2026-10-05 corrected one such expectation.

## Alternatives Considered

### Add prompt rules for clarification answers

Rejected: accumulating instructions for each observed wording keeps retention dependent on the model and cannot be verified deterministically.

### Ask the model for the complete query each turn with richer history

Rejected as the primary mechanism: it is the design that lost pending requests. History is still provided, but the state, not the model, is the source of retained values.

### LLM-as-a-judge as the evaluation oracle

Deferred: every evaluated output is structured, so deterministic checks are stronger and cheaper. A judge could later triage synthetic candidates or assess prose, isolated from deterministic results; it would never decide pass or fail alone.

### Python evaluation stack or an external evaluation platform

Rejected for now: no concrete advantage outweighs a second runtime and a pipeline reimplementation. Revisit if analysis needs exceed JSON reports.

### Traces in logs, files or a telemetry backend

Rejected for content: logs and telemetry must stay free of confidential payloads, and files would escape conversation deletion. Metadata-level traces do use structured logs.

## Consequences

### Positive

- Pending requests survive bare answers, interjections and recorded faulty model readings; known failures become permanent regression cases.
- Period interpretation, retention and filter grounding are deterministic and covered by the ordinary test gate.
- Quality is measurable per check and category and comparable across revisions, models and prompt versions.
- Traced failures can be reproduced and turned into candidate cases without copying confidential data into the repository.

### Negative

- Interpretation and router instructions, normalization rules and the catalog must evolve together and be re-evaluated.
- Live evaluation and synthetic tooling need a provider key and consume quota; provider outages surface as inconclusive results.
- Curated datasets need review discipline: candidates must be corrected and anonymized before promotion.

### Operational or Migration Impact

- Additive migration `202610050001_agent_turn_traces`; the runtime role may only insert and read traces, and cascade deletion removes them. The API checks the table at startup only at the content level.
- Version 1 sales contexts upgrade on read; an unanswered version 1 clarification is not resumed.
- Production refuses content tracing until [PH-09](../project/human-actions.md#ph-09) defines retention and access for it. Evaluation never writes to the ERP and uses synthetic rows.

## References

- [AI interpretation architecture](../architecture/ai-interpretation.md)
- [AI evaluation](../architecture/ai-evaluation.md)
- [Corporate agent](../domains/corporate-agent.md), [sales capability](../domains/sales-chat.md)
- [Telemetry redaction](../security/telemetry-redaction.md), [migrations](../database/migrations.md)
