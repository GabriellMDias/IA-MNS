# AI Interpretation Architecture

[Documentation index](../README.md) · [ADR-0024](../adr/0024-interpret-analytics-through-structured-state-and-evaluate-ai-behavior.md) · [AI evaluation](ai-evaluation.md) · [Corporate agent](../domains/corporate-agent.md) · [Sales capability](../domains/sales-chat.md)

This page owns how IA-MNS turns a Portuguese message into a bounded analytical query: the division of work between model and application, the structured conversation state, the analytical plan, validation layers, the model port and AI tracing. [Sales semantics](../domains/sales-chat.md) own what the figures mean; the [agent](../domains/corporate-agent.md) owns conversations, persistence and progress.

## Implemented today and not implemented

Implemented: structured sales conversation state (context version 2), deterministic relation normalization and merging, filter grounding, named period expressions resolved by the application, a catalog-derived analytical vocabulary with one dimension (product), pending-request routing, the structured-model port with an OpenAI adapter, metadata and content AI tracing, and the [evaluation framework](ai-evaluation.md).

Not implemented: dimensions other than product (customer/partner, company, project, salesperson, product group), several measures in one query, week or quarter period forms (weeks are counted in days; other periods use explicit ranges), other model providers, expiry of unanswered requests, AI traces for the legacy `/sales/chat` endpoint, and any automatic prompt, code or deployment change. Any of these requires its own reviewed change.

## Division of work

| Concern | Model | Application |
| --- | --- | --- |
| Choose a capability or social intent | Router proposes an allowlisted intent or catalog id | Validates the id, checks permission, applies the pending-request rule |
| Read a sales message | Interpreter reports decision, relation and what the message states | Validates schema and consistency, never trusts relation blindly |
| Keep earlier values | Never | Holds active and pending analyses; merges deterministically |
| Decide what is missing | May flag genuine ambiguity | Computes missing required slots and asks |
| Dates | Names a period form; computes dates only for explicit ranges | Resolves forms against the Sao Paulo date; refuses unstarted periods; bounds length |
| Constraints | Proposes filters from catalog dimensions | Requires each new filter to be written by the user |
| Execution and answers | Never | Compiles a fixed parameterized query; computes and writes every figure and message |

Each model call is one forced, strict tool call with a schema derived from the application. The provider receives user messages, application-authored replies (clarification and unavailable messages), filter-only descriptions of earlier answers and the structured state; never result rows, figures, response prose with numbers, credentials or schema details.

## Turn pipeline

1. The agent loads its own context (last capability, capability awaiting an answer) and the capability contexts of the conversation.
2. The router receives the message, the recent transcript with application replies (an answer is shared only as "answer delivered") and the pending request. If it returns `unavailable` while a permitted capability awaits an answer, the message goes to that capability, whose boundary rejects unsupported requests itself. Social intents are respected.
3. The sales capability loads its state, upgrading version 1 contexts. It also receives the turn's source selection from the interface; nothing in the model's output can change it.
4. The interpreter returns an interpretation; the adapter rejects schema violations and inconsistent combinations (for example a clarification without a category or a filter action without text).
5. The state machine (`advance` in [`conversation-state.ts`](../../apps/api/src/features/sales/conversation-state.ts)) normalizes the relation, grounds filters, merges, checks completeness, resolves the period and compiles the query, or returns a clarification or rejection.
6. Only an executed plan reaches a database, and only the adapters of the selected sources that support its measure run ([sources](../domains/sales-chat.md#sources)). The plan is the same for every source; results, answers and suggestions stay deterministic and per source. A source or company name in the message only adds an application-authored notice, and a source name the model placed in a filter is dropped (`source_named_as_product`).
7. The exchange is appended to the transcript; the capability returns its new state and what it awaits; the agent stores both with the turn and records the trace.

A failed turn changes neither state nor transcript.

## Structured conversation state

Sales context version 2 ([schema](../../apps/api/src/features/sales/conversation-state.ts)):

| Field | Meaning |
| --- | --- |
| `active` | The last executed plan and its compiled query; the base of refinements. |
| `pending` | An unanswered request: the partial plan (`draft`), what it awaits (`awaiting`, for example `period`) and the clarification asked. |
| `transcript` | Up to 12 recent sales exchanges: user text and the application's reply text, or a filter-only description of an answer. |

The agent context `_agent` (version 2) records the last capability and `pending: { capabilityId, awaiting }`. Social turns do not change capability contexts, so a pending request survives "obrigado" and similar interjections. A pending request ends when it is completed, when a new analysis starts, or when another request replaces it; unsupported requests leave it open.

### Relation normalization

The model's relation is a proposal. The application applies it against the state it holds:

| Model relation | State | Applied |
| --- | --- | --- |
| `answer_pending` | no pending request | `refine` if an active analysis exists, else `new` |
| `refine` | pending request | `answer_pending` (the open question is the focus) |
| `new` | pending request, and the message supplies an awaited slot while every other stated value restates the request | `answer_pending` |
| `refine` | no active analysis and no pending request | context clarification |

The third rule is general slot filling: a message that only answers what was asked, or restates the request with the answer, completes it; a message that changes the product or another value starts a new analysis. Each normalization is recorded as an issue code (`pending_absent`, `refine_applied_to_pending`, `new_completes_pending`, `refine_without_context`).

### Merge, grounding and completeness

- The base is the pending draft, the active plan or an empty draft. Stated values replace; a filter `clear` removes; unstated values are retained. A new analysis retains nothing, so earlier filters cannot leak.
- A filter value set by the message must appear, as a contiguous accent- and case-insensitive word sequence, in the current or an earlier user message of the transcript. Common Portuguese plural forms map to their singular (`maçãs`, `pães`, `limões`). An ungrounded filter is dropped and the user is asked for the product (`ungrounded_product`).
- `period` is the only required slot; measure, grouping and comparison default to net value, total and none, as documented in the [sales semantics](../domains/sales-chat.md#interpretation-and-computation). A model clarification is honored only for ambiguity the fields cannot express.

## Analytical plan

[`analysis.ts`](../../apps/api/src/features/sales/analysis.ts) defines the plan independently of wording and SQL:

- `salesCatalog`: measures (`net_value`, `quantity`, `weight`), dimensions (`product`), groupings (`total`, `month`, `product`), comparisons (`none`, `previous_year`, `previous_period`) and defaults. Interpretation schemas are generated from these values; a test keeps them identical.
- `AnalysisSpec` (complete plan) and `AnalysisDraft` (partial plan): measure, dimension filters, period expression, grouping, comparison.
- `compileAnalysis` resolves the period and maps the plan to the existing `SalesQuery`, which `validateQuery` and the reconciled [query](../../apps/api/src/features/sales/query.ts) execute unchanged.

### Period expressions

[`period.ts`](../../apps/api/src/features/sales/period.ts) resolves named forms against the Sao Paulo business date:

| Form | Meaning |
| --- | --- |
| `current` day/month/year | today, month to date, year to date |
| `previous` day/month/year | yesterday, previous complete month or year |
| `last` day + count | N dates including today (or ending yesterday when the current day is excluded) |
| `last` month + count | N completed months before the current one, or N months including the current one to date |
| `month` + month (+ year) | that month; without a year, its latest non-future occurrence; the current month runs to date |
| `year` + year | that calendar year; the current year runs to date |
| `range` | explicit inclusive dates |

A started period is clamped to today. A period that has not started, an invalid date, one before 2000 or one longer than 366 days becomes a period clarification (the length limit has its own message). Comparisons are derived by the existing domain rules.

### Adding a dimension

A future dimension (for example salesperson) requires, in one reviewed change: the business definition and ERP columns with owner confirmation, reconciled query support and bindings, a catalog entry, its filter grounding rule if it differs from a description phrase, execution validation, renderer and answer changes if needed, curated evaluation cases and documentation. The interpretation schema, state, merge, transcript and evaluation framework need no structural change. Until then the model cannot express that filter, and requests for it are rejected as unsupported.

## Validation layers

1. Provider boundary: exactly one call of the expected tool, completed status, JSON that satisfies the generated schema.
2. Semantic consistency of the interpretation.
3. State normalization, grounding and completeness.
4. Period resolution and `validateQuery` bounds (dates, length, comparison period, description length).
5. Oracle result shape and scope checks and result limits ([sales capability](../domains/sales-chat.md)).

Any failure in layers 1–2 is `SALES_PROVIDER_UNAVAILABLE` or `AGENT_PROVIDER_UNAVAILABLE`; layers 3–4 produce clarifications or `SALES_QUERY_INVALID`; nothing partially executes.

## Model port

[`src/ai/model.ts`](../../apps/api/src/ai/model.ts) defines `StructuredModel.invoke(request)`: instructions, messages, one strict tool, an output budget. It returns schema-valid output plus `ModelInvocation` metadata (provider, model, latency, token counts). [`openai.ts`](../../apps/api/src/ai/openai.ts) implements it with the Responses API, `store:false`, forced tool choice, no parallel calls, no retries and a 20-second request timeout for interactive turns (offline tooling may pass a longer one). The router and interpreter instructions carry version identifiers (`agentRouterVersion`, `salesInterpreterVersion`) recorded in traces and evaluation reports; change the identifier whenever instructions change. Another provider would implement the same interface; none is integrated.

## AI tracing and observability

`IA_MNS_AI_TRACE` ([configuration reference](../generated/configuration/api.md)) is explicit:

| Level | Captured | Destination |
| --- | --- | --- |
| `off` | Nothing beyond existing failure diagnostics | — |
| `metadata` (default) | Route intent and capability, override, interpretation decision and relation, applied relation, issue codes, missing slots, period form, outcome, clarification category, unsupported reason, prompt versions, model, latency, token counts, result row count | One `ai_turn_traced` structured log event per agent turn |
| `content` | Metadata plus the interpretation, sales state before and after, the agent context before, the business date and the executed query filters | `agent_turn_traces`, written with the turn outcome |

Metadata never includes user text, filter values, dates, figures or provider payloads; tests assert this with synthetic confidential markers. Content traces are CONFIDENTIAL, never contain result rows or answer prose, are bounded to 256 KB (content omitted, not truncated, beyond that) and are deleted with their turn or conversation. The runtime role can only insert and read them. Production refuses `content` until [PH-09](../project/human-actions.md#ph-09) approves retention and access; the API checks the table at startup only at that level. The [telemetry redaction](../security/telemetry-redaction.md) policy continues to govern logs and spans.

Reproduction path: enable `content` locally, reproduce the conversation, then run `pnpm eval capture --turn <turn-id>` ([evaluation](ai-evaluation.md#from-trace-to-regression-case)).

## Verification

`apps/api/test/sales-analysis.test.ts` covers period forms, plurals and grounding, catalog/schema identity, every relation normalization, retention and leakage, unqueryable periods and context upgrades. `agent-turn.test.ts` covers pending routing, the override rule, figure-free router transcripts and trace redaction. `agent.test.ts` verifies content traces on migrated PostgreSQL with the restricted role, cascade deletion, metadata-only logs and capture. `sales-providers.test.ts` covers the strict OpenAI boundary through the port. The [curated evaluation dataset](ai-evaluation.md) replays reference model readings through the whole pipeline in `pnpm test`.
