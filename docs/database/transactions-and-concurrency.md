# Transactions and Concurrency

[Task index](../README.md) · [Database principles](principles.md) · [Delivery and side effects](../architecture/delivery-and-side-effects.md) · [Testing](../architecture/testing-strategy.md)

This policy owns database atomicity, isolation, conditional writes, locks, and transaction retries. Cross-system delivery, idempotency, message claiming, retry ownership, and reconciliation belong to [delivery policy](../architecture/delivery-and-side-effects.md). [ADR-0006](../adr/0006-select-prisma-orm-for-database-access-and-migrations.md) permits appropriate Prisma or explicit SQL transaction mechanisms; [ADR-0009](../adr/0009-establish-testing-strategy-and-tooling.md) requires real-database verification where its semantics matter.

The implemented [Approval Request conventions](../domains/approval-request-implementation.md#mutations-concurrency-and-transactions) use atomic PostgreSQL creation/conditional writes, owner-scoped durable create replay, and integer version preconditions. The runtime does not automatically retry writes. Do not treat these as deferred feature choices or infer that outboxes, distributed locks, or generic transaction infrastructure already exist.

## Transactions

Assume concurrent requests, processes, retries, workers, and deployment overlap unless the architecture proves exclusive ownership. Sequential code does not imply sequential execution across the system. Identify the durable invariant, which changes must become visible together, relevant competing actors, and failure/recovery semantics before choosing a mechanism.

Transactions protect all-or-nothing state within their actual database boundary. They must remain as short as practical and should not automatically surround every HTTP request or every repository method. Splitting dependent writes into independently committed methods can destroy atomicity; wrapping remote work in a transaction can hold locks without providing distributed rollback.

## Application-Level Transaction Ownership

The application operation owns the complete consistency requirement; domain logic stays independent of SQL/Prisma transaction APIs. Persistence infrastructure must make scope and participating connection/context discoverable. Repositories in one atomic operation must use the same transaction rather than silently opening independent connections or escaping context.

Nested transaction calls may mean savepoints rather than independent transactions; understand actual library/database semantics. Use savepoints, Unit of Work, implicit async-local context, or transaction hooks only when they add concrete value and remain predictable/testable. Hooks need explicit retry, rollback, and crash semantics. An after-commit callback is best effort unless required work is durably recorded under [delivery policy](../architecture/delivery-and-side-effects.md#after-commit-work).

External calls generally stay outside database transactions. Rollback cannot unsend mail, reverse an accepted provider mutation, remove an uploaded file reliably, or retract a published message. Never place unsafe non-idempotent external effects in transparently retried blocks. A payment provider's “transaction” is not a shared database transaction.

## Isolation Levels

Choose isolation and conflict mechanisms for actual invariants, not framework defaults or labels. PostgreSQL's real behavior matters; names shared with other databases need not imply identical guarantees. Consider relevant anomalies: dirty/non-repeatable reads, phantoms, lost updates, and write skew. The default is not a universal guarantee; serializable execution can still abort and require bounded safe retry.

A read/snapshot may become stale immediately after commit. Read-committed work still needs constraints or conditional updates where read-then-write would race; stronger isolation carries contention, resource, and throughput costs. Do not weaken correctness because of speculative performance concerns, or select the strongest isolation without considering its actual benefit.

## Check-Then-Act Race

Application checks can become stale before a write. Protect uniqueness with database constraints even when a precheck improves feedback. Prefer atomic counter updates, conditional decrements/state transitions, reservations, or other native atomic operations to unprotected read–calculate–write sequences.

For example, updating only where ID, expected version, valid source state, and protected ownership still match lets PostgreSQL arbitrate competing writes. Inspect affected-row count and safely classify failure; zero rows alone does not prove which precondition failed. Authorization checks must not leak hidden state while classifying a conflict.

## Optimistic concurrency

Use a deliberate expected version/state when stale writes must be rejected. Increment a dedicated version exactly once per successful mutation and return meaningful conflict semantics. Reload/reconciliation versus safe retry depends on the domain; do not silently rebase a user's stale intent onto a newer version.

Timestamps are concurrency tokens only with proven precision and update semantics; explicit versions are often clearer. Wall-clock timestamps across machines do not guarantee total order. Use database time, sequences, or logical versions when correctness requires ordering.

## Locks and reservations

Pessimistic row locks can serialize high-conflict short work. Cover the smallest meaningful resource, bound waits, and use deterministic multi-resource lock ordering to reduce deadlocks. Locks consume connections and can cause blocking/latency; measure their cost. Advisory locks require explicit ownership, timeout, and failure semantics.

Distributed locks are not a default. First consider constraints, conditional writes, versions, row locks, queue ownership, or a single logical writer. Expiring leases can leave a stale worker running after another acquires the lease; high-risk protocols may need fencing tokens or equivalent enforcement. A lease alone does not prove exclusivity.

Business reservations such as seat holds are durable domain state with expiry/renewal/release/claim races; do not implement minutes-long business holds as long-lived database locks. Concurrent numbering needs safe allocation, never `MAX(number) + 1`. Sequences may contain gaps; a gapless requirement is a stronger business decision with concurrency cost.

## Deadlock Retry

Deadlocks and serialization failures are recognized conflict modes, not evidence of corruption. Repeated deadlocks or lock timeouts may indicate poor access ordering, contention, or defects and must remain observable. Distinguish lock contention from database unavailability and domain/constraint failures.

Retry only classified transient failures for an operation safe to repeat, with bounded attempts/time and appropriate backoff/jitter based on evidence. Do not retry permanent constraint/query/schema failures blindly. Expected transient retries need useful telemetry without becoming duplicate incident reports.

## Database Retry Boundary

Retry the complete logical transaction, including its reads and business assumptions, not only the last failed statement. Everything in that boundary can execute again. Inspect driver, repository, service, SDK, proxy, and caller policies to avoid multiplying retries; normally one layer owns retries for a failure.

A timeout/cancellation or lost connection during commit may mean the operation committed and the response was lost. Propagate cancellation where supported and safe, clean up transactions reliably, and preserve unknown outcomes when relevant. Idempotency, state lookup, or reconciliation must resolve retry safety; a transient connection failure does not prove a write did not occur. Follow [feature recovery](../domains/approval-request-implementation.md#failure-recovery-and-retry-ownership) for current behavior and [delivery retry rules](../architecture/delivery-and-side-effects.md) for broader workflows.

## Authorization, audit, and derived reads

For database-dependent authorization, define the consistency point between permission/ownership checks and the protected write. Immediate revocation requirements may affect transaction, token, and cache design; a distant precheck is insufficient when those semantics require freshness. Do not invent immediate revocation guarantees from short-lived tokens alone.

When a required audit record and business change share a database boundary, they may need to commit atomically. External audit/event delivery requires durable intent and recovery; diagnostic logs are not authoritative business audit. Publish no event implying durable state before commit, and do not rely on unrecorded post-commit publication where delivery is required.

Read replicas, caches, projections, and materialized views introduce staleness. Define whether an operation requires read-your-writes, its acceptable delay, canonical source, update/invalidation, repair, and failure behavior. “Eventually consistent” requires a process that actually repairs divergence. Cache stampede mitigations or single-writer/partitioned processing are optional responses to real load, not defaults; partition order does not imply global order.

Database plus object storage needs partial-failure design such as temporary upload/finalization, orphan cleanup, and reconciliation. Distributed workflows must define convergence, compensation, or safe manual intervention rather than pretend to share one atomic commit. Do not claim exactly-once effects without end-to-end evidence.

## Performance, observability, and repair

Batch sizes affect transaction duration, lock scope, failure granularity, and memory. Large updates may need batching under [migration policy](migrations.md#backfills). Investigate hot rows/indexes, contention, and retry patterns with evidence before redesigning consistency.

Use stable semantic operation names and bounded safe telemetry for latency, conflict/retry counts, lock waits, deadlocks, attempts, and final outcomes where useful. Trace meaningful latency/failure boundaries rather than every trivial query. Never dump rows or sensitive query values during conflict diagnostics; follow [redaction](../security/telemetry-redaction.md).

Repair by retry, reconciliation, or intervention must be part of the design. Rare states requiring manual action must be detectable, diagnosable, and safe to repair through a concrete runbook. Separate high-risk audit requirements from diagnostic logging. Production signals can reveal duplicates, stuck work, and failed reconciliation that tests cannot exhaustively predict.

## Testing and verification

Use real PostgreSQL for guarantees involving rollback, constraints, isolation, and locks. Sequential mocks cannot prove concurrent safety. Coordinate competing operations explicitly where practical rather than sleeping and hoping they overlap; avoid deadlock tests tied to undocumented scheduler timing.

Verify relevant cases: mid-operation failure leaves no partial state; concurrent uniqueness/create claims produce one consistent result; stale versions conflict; competing transitions cannot both win; retry limits and complete-transaction restart behave safely; process interruption and response loss preserve documented recovery. The [delivery test requirements](../architecture/delivery-and-side-effects.md#verification) cover duplicate delivery, idempotency, external failure, and reconciliation when introduced. Testing and review remain necessary even where static checks can help.

## New Transaction Checklist

Before implementing or changing a state-changing operation:

1. Identify the invariant, owner, participating writes, concurrency sources, duplicate possibility, and applicable authorization/audit consistency.
2. Choose constraints, atomic writes, versioning, isolation, locks, or explicit reservations proportionally; explain scope and maximum duration.
3. Determine conflict/error semantics, full retry boundary and owner, transient categories, attempt/time bounds, and safety of every repeated action.
4. Resolve halfway failure, external-success/database-failure, commit ambiguity, lost response, and crash windows without unsupported rollback or exactly-once claims.
5. Add deterministic integration evidence, safe operational signals, and recovery/repair guidance. Update the owning domain and generated contract/metadata when behavior changes.
