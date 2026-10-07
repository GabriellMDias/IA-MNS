# ADR-0027: Select the Sales Source in the Interface and Read Each Source Separately

**Status:** accepted
**Date:** 2026-10-07

## Context

The sales capability ([ADR-0018](0018-bound-natural-language-sales-to-a-read-only-query-capability.md)) read only the MNS sales in Sankhya (Oracle). The group's other company, Pilar da Terra, records its sales in VRMaster, a PostgreSQL database on the same network. On 2026-10-06 the owner asked for VRMaster as a second source and decided, as recorded in the implementation plan, that the agent would ask "Sankhya or VRMaster?" whenever a question did not name the system. On 2026-10-07 the owner supplied the VRMaster sales reference SQL (a PDT Connect dashboard query over `venda` with its fiscal, mercadológico, cost-center and buyer joins and a store parameter) and a dedicated read-only VRMaster account, and replaced the conversational question with a product decision: the main interface offers a selector with exactly `MNS (Sankhya)`, `Pilar da Terra (VR Master)` and `Tudo`.

The two sources have different schemas, semantics and measures. Sankhya's monetary measure is `VLRLIQUIDO` with its own exclusions; VRMaster's is `valortotal`. Sankhya groups quantities by ERP unit and computes weight; the VRMaster reference identifies the packaging type and has no reviewed weight. Their figures belong to different companies and have no reviewed common meaning.

## Decision

- **The person chooses the source in the interface; the model never does.** The agent interface shows a native selector beside the message box with `MNS (Sankhya)` (default), `Pilar da Terra (VR Master)` and `Tudo`. Each turn submission carries the explicit choice (`sankhya`, `vrmaster` or `all`). The message text never selects, adds or removes a source: the interpreter ignores source and company names, a source name the model places in a filter is dropped, and when the text names another source the reply says so and still uses the selection. The conversational "Sankhya or VRMaster?" question decided on 2026-10-06 is withdrawn and was never implemented.
- **The selection is application state, not a preference.** The web keeps it in memory for the open application, across conversations, and starts at `MNS (Sankhya)` after a reload; it is not stored in the browser or on the server as a preference. The API records the selection with each turn as part of the request: a replay of the same request with another source is a conflict, and history shows which source each sales question used.
- **One read port, one adapter per source.** The application layer receives the selection and runs the adapters it names behind the source-neutral `SalesReader` port. The Oracle adapter knows only the Sankhya reference SQL; the PostgreSQL adapter knows only the VRMaster reference SQL. They share database-agnostic pieces with a shared meaning (the read port, the scope check of aggregate rows and the literal product-phrase matching), not SQL or connections.
- **`Tudo` is orchestration, never a third database or a combined figure.** Both adapters run the same analysis plan in parallel. The answer has one section per source with its provenance, status and own result, and states that values are not summed. If one source fails, the answer keeps the other source's result and reports the failure; the turn fails only when every source fails. With a single selected source, a failure fails the turn as before.
- **VRMaster follows ADR-0018's guarantees through node-postgres.** Fixed reviewed SQL with every reference join preserved, schema-qualified tables, bound values only, enum-selected fragments, `REPEATABLE READ READ ONLY` transactions that are always rolled back, statement, lock and idle timeouts, a small pool, cancellation by ending the connection, and the existing bounds (366 days, 500 rows, 100 products). The reference store parameter is omitted because every store counts: its inner join to `loja` already admits exactly the sales of existing stores. Measures are the sum of `valortotal` and the sum of `quantidade` per packaging type; weight is reported as unavailable for VRMaster.
- **One permission covers both sources.** `sales:read` grants the sales capability whatever the source; a per-source permission would be a later decision.

## Rationale

An explicit selector removes a model decision with business impact: no wording can make the agent read another company's data, the person always sees which source answered, and there is no extra clarification turn. Keeping the analysis plan source-independent lets a person change the selector and continue the same analysis.

Separate adapters keep each source's reviewed semantics intact. A unified SQL or a summed total would invent a cross-company meaning that nobody reviewed and that would differ in measure, exclusions and units. Reporting a failed source beside a valid one keeps useful information without hiding the outage; failing a single-source turn keeps the earlier, well-tested failure behavior.

Recording the source with the turn makes idempotent replay exact and history truthful. node-postgres was already a dependency of the API (database tooling) and supports the required transaction control without an ORM over a foreign schema.

## Alternatives Considered

### Ask the person which system when the question does not name it

The owner's decision of 2026-10-06. It adds a turn to most questions, depends on the model noticing the omission, and lets a wording choose the database. Replaced by the selector.

### Let the model choose the source from the message

It turns a business-impacting choice into an unreviewed model output and conflicts with the selector being the authority.

### One unified query or a combined total for `Tudo`

The sources are different databases with different meanings; a combined figure would need a product definition that does not exist.

### Store the selection as a durable preference

Not the existing pattern for interface state other than the theme, and a remembered source could silently apply to a later question. The owner asked not to persist it unless that were already the pattern.

## Consequences

### Positive

- The queried source is explicit in the request, the stored turn, the answer and the interface.
- Each source keeps its reviewed SQL and semantics; a source can be added behind the same port.
- A failure of one source no longer hides the other source's answer in `Tudo`.

### Negative

- Two adapters, two connection configurations and two reconciliations to maintain.
- VRMaster has no weight measure and labels quantities by packaging-type identifier, because the packaging-type table is not part of the reference SQL or of the account's grants.
- Every holder of `sales:read`, including people granted it automatically through a Sankhya link, can read both companies' sales.
- The VRMaster server offers no TLS; until it does, its connection runs with an explicit `VRMASTER_DB_SSL_MODE=disable` that sends credentials and sales data unencrypted on that network.

### Operational or Migration Impact

- Additive migration `202610070001_agent_turn_source`: `agent_turns.source` with a constant default `sankhya`, which is what every earlier turn used.
- Stored replies are version 2 (one section per source); version 1 replies are upgraded when read and never written.
- The turn submission accepts an optional `source` (default `sankhya`, the earlier behavior); the conversation detail returns `source` and the per-source result. Web and API change together.
- VRMaster is optional configuration (`VRMASTER_DB_*`); without it, selecting the VRMaster source reports it as not configured.

## References

- [Sales chat domain](../domains/sales-chat.md)
- [Corporate agent](../domains/corporate-agent.md)
- [AI interpretation](../architecture/ai-interpretation.md)
- [ADR-0018](0018-bound-natural-language-sales-to-a-read-only-query-capability.md), [ADR-0019](0019-compose-a-corporate-agent-with-durable-conversations.md), [ADR-0024](0024-interpret-analytics-through-structured-state-and-evaluate-ai-behavior.md)
- [Implementation plan](../project/implementation-plan.md#current-work) (PJ-28) and [human actions](../project/human-actions.md#ph-18) (PH-18, PH-19, PH-20)
