# ADR-0019: Compose a Corporate Agent with Durable Conversations

**Status:** accepted
**Date:** 2026-10-01
**Extended by:** [ADR-0020](0020-bound-temporary-device-testing-to-an-authenticated-development-proxy.md) for explicit authenticated temporary phone testing; ordinary loopback development and production controls remain valid. [ADR-0024](0024-interpret-analytics-through-structured-state-and-evaluate-ai-behavior.md) for structured capability conversation state, pending-request routing and AI tracing.
**Supersedes:** [ADR-0018](0018-bound-natural-language-sales-to-a-read-only-query-capability.md), only the sales-specific product identity and temporary conversation decision. Controlled sales execution and deterministic financial answers remain valid.

## Context

The owner defines IA-MNS as MNS's corporate AI agent and delegates implementation choices. Sales is the first implemented business capability, not the identity of the product. Users need grounded social interaction, observable task progress, and conversations that survive application/API restarts. Orion already selects PostgreSQL, Prisma, composable modules, TypeBox and TanStack.

## Decision

Accepted after reviewing Orion's module/persistence policies under the owner's explicit delegation of design choices on 2026-10-01.

Compose an agent application module and a registry of implemented capability descriptors/executors. The agent routes a bounded conversational intent or one registered capability; permission and execution checks remain server-side. General instructions describe routing, while each capability owns interpretation, tools, business invariants and versioned context. Application-authored social/capability responses and deterministic sales answers prevent model prose from introducing unsupported functionality or financial facts.

Persist owner-scoped conversations and turns in PostgreSQL using reviewed additive migrations and a restricted runtime role. Store bounded result snapshots, typed progress events and versioned capability context. Accept one turn at a time under a database row lock and a bounded lease. A client request UUID supports acceptance replay, never provider retries. Work is process-local and bounded; expired execution is interrupted rather than resumed. Poll persisted progress through the generated SDK instead of introducing streaming transport or a workflow engine.

Keep the existing sales endpoints for compatibility with the first MVP; the product exclusively uses the durable agent endpoints. No persistent legacy history can be migrated because the prior transcript was browser/process memory. Support explicit hard deletion; local history otherwise remains until the owner deletes it. Shared deployment requires a defined retention/provider/backup policy. Do not implement new business domains, external writes, production identity, autonomous loops, vectors or generic workflow machinery.

## Rationale

Explicit capability registration grows without rewriting general routing policy, while preserving each domain's authority. Durable context contains filters, not financial prose. PostgreSQL constraints, locks and acceptance identifiers address races and unknown delivery. Short polling uses the existing SDK and works after reload; it trades small read traffic and roughly one-second progress latency for a simpler contract.

## Alternatives Considered

### Free-form assistant with arbitrary tools or SQL

Rejected because grounded numbers and bounded execution are existing guarantees. The current registry selects only implemented execution code.

### Streaming responses and durable workflow engine

Deferred: one bounded read capability does not require autonomous loops or resumable external actions. Progress in PostgreSQL provides recovery without another transport.

### In-memory history or browser persistence

Rejected because restart durability and future capability context require a canonical server-owned store. Credentials and confidential transcripts remain out of browser storage.

## Consequences

### Positive

- Product identity and conversation are separate from sales semantics.
- History, outcomes and per-capability filters survive restart.
- Progress describes real operations and no speculative functionality is advertised.

### Negative

- Local PostgreSQL becomes required for the product conversation flow.
- Sales interpretation uses a routing request followed by capability planning.
- Stored result snapshots need lifecycle controls and are historical, not refreshed ERP data.

### Operational or Migration Impact

New tables are additive and application-owned. Docker binds only loopback, persists a named volume, and uses separate migration/runtime credentials. No ERP changes occur. The local provisioning helper applies migrations/grants without dumping credentials or deleting volumes. An interrupted execution is visible after its 120-second lease expires and is never automatically repeated.

## References

- [Corporate agent](../domains/corporate-agent.md)
- [Database principles](../database/principles.md)
- [Transactions](../database/transactions-and-concurrency.md)
- [Sales capability](../domains/sales-chat.md)
