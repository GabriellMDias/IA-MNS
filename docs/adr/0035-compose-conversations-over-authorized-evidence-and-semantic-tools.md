# ADR-0035: Compose Conversations over Authorized Evidence and Semantic Tools

**Status:** accepted
**Date:** 2026-10-13
**Supersedes:** [ADR-0018](0018-bound-natural-language-sales-to-a-read-only-query-capability.md), [ADR-0019](0019-compose-a-corporate-agent-with-durable-conversations.md) and [ADR-0024](0024-interpret-analytics-through-structured-state-and-evaluate-ai-behavior.md), only their fixed-response routing and blanket figure-free model-context restrictions. Domain semantics, authorization, read-only execution, deterministic calculations and durable history remain accepted.

## Context

The capability router deliberately prevented free-form answers and withheld numerical results from the model. As a result, a request to summarize an already completed sales query could become an unsupported new query. The owner authorized implementation of the autonomy proposal, delegated incremental technical decisions, and approved necessary business-data transmission to OpenAI on 2026-10-12. Personal-data and deployment prerequisites remain category-specific.

This record accepts that explicitly approved direction after implementation review of the provider, evidence, authorization and semantic-query boundaries; acceptance does not claim completed rollout or corporate legal verification.

## Decision

Use one bounded Responses tool loop beside the existing strict interpretation adapter. The conversational model may answer directly, retrieve owned evidence and attachments, or propose a registered analytical tool. The server validates arguments, authorization, source, work limits, evidence and final fact references. No SQL, arbitrary network, hosted execution or ERP write tool is exposed.

Compose existing sales measures with validated time/product dimensions through a structured semantic plan. Reuse the existing Product Resolver and complete product membership, reviewed sales query grain and decimal calculations. Several measures in one ERP share a read-only database snapshot; different ERPs remain separate. New business definitions still require catalog/query validation.

Permit minimized real operational evidence under the owner's approval. Preserve `store:false`, foreground processing, no automatic retries, no SDK payload logging and local authoritative history. Derived prose inherits all transmitted evidence permissions, not only cited ones. Numeric ERP claims bind to exact server facts. Metadata traces exclude confidential content; provider reasoning continuation exists only in memory for the current turn.

Keep limited owner-classified operational attachments and explicit presentation preferences within conversation lifecycle. The model cannot persist preferences, promote semantic candidates, change authorizations or rewrite business rules. Attachments are user evidence, not ERP truth; removing one invalidates dependent responses. Binary office documents, PDFs, URLs, macros and archive extraction remain unsupported; text/CSV and bounded PNG/JPEG have explicit limits.

This direction partially replaces the application-authored-response and figure-free conversational-context constraints of ADR-0018, ADR-0019 and ADR-0024. Their domain semantics, permission checks, durability, no-write boundary, deterministic arithmetic and curated-evaluation obligations remain. A `legacy` configuration provides routing rollback while the new code retains derived-reply authorization. Rolling back to an older binary that does not understand new reply fields is not supported.

## Rationale

General conversation and typed tools handle families of requests without phrase lists. A provider-neutral port and existing SDK suffice; a second agent framework or business-rule layer would add responsibility without supplying data authorization. Local evidence makes continued conversation and revocation auditable, while exact substitution limits numerical invention. Schema validation cannot prove that qualitative prose correctly interprets every fact; evaluated behavior and explicit uncertainty remain necessary.

## Alternatives Considered

### Add summary intents to the existing router

This would fix isolated phrasings while preserving the architectural restriction. It would continue to require manual routing additions for ordinary conversational abilities.

### Expose generated SQL or unrestricted database exploration

Rejected: query syntax validation would not establish business semantics, join grain, privileges or minimization. Reviewed semantic plans offer controlled combinations without granting execution authority to the model.

### Keep all values opaque to the model

Available as a narrower privacy design, but unnecessary for the owner's approved business-data scope and less useful for analysis. The implementation sends allowed facts and still substitutes their canonical representation locally.

## Consequences

### Positive

- Summaries, explanations and rewrites reuse authorized results without new ERP reads.
- Semantic composition reuses existing reconciled logic and product selection rather than duplicating it.
- Permission inheritance and attachment deletion cover derived prose and acceptance replay.

### Negative

- More provider context creates processing and retention responsibilities described in the AI data policy.
- Latency, token budgets and narrative faithfulness require measurement; no universal correctness or prompt-injection immunity is claimed.
- Image interpretation is qualitative and uncertain. Numerical image extraction and complete spreadsheet arithmetic are not validated capabilities.

### Operational or Migration Impact

- Additive version-2 reply fields and reserved conversation-context namespaces avoid a new storage system or schema migration. Older readers of these new payloads are not compatible.
- No production deployment, global ERP grants, retention-account changes or contract verification is authorized by this ADR.
- PH-30's inherited PostgreSQL DDL privilege gap remains unchanged.

## References

- [Autonomy proposal](../project/agent-autonomy-proposal.md)
- [Conversational autonomy](../architecture/conversational-autonomy.md)
- [AI data processing](../security/ai-data-processing.md)
- [ADR-0018](0018-bound-natural-language-sales-to-a-read-only-query-capability.md), [ADR-0019](0019-compose-a-corporate-agent-with-durable-conversations.md), [ADR-0024](0024-interpret-analytics-through-structured-state-and-evaluate-ai-behavior.md)
