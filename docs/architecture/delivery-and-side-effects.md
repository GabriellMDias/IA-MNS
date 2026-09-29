# Delivery and Side Effects

[Documentation index](../README.md) · [Transactions and concurrency](../database/transactions-and-concurrency.md) · [Compatibility](versioning-and-compatibility.md)

This page owns cross-system delivery, idempotency, retry, and crash recovery. Database atomicity, isolation, constraints, locking, and transaction retries belong to [transaction policy](../database/transactions-and-concurrency.md); HTTP representation belongs to [API principles](../api/principles.md). These requirements do not select a broker or require inboxes, outboxes, sagas, or distributed locks without a concrete need.

## Idempotency

Idempotency means repeated application has no additional unintended effect, not merely an identical HTTP response. Setting a state may be naturally idempotent; incrementing a balance usually is not. Client/proxy/SDK retries and user double submission can repeat requests even when the UI disables a button. The server must protect non-repeatable operations.

When using an idempotency key, define its generator, logical operation, scope (such as actor/tenant/operation), durable storage/uniqueness, concurrent-first-attempt behavior, payload mismatch handling, replay result, and tests. In-memory deduplication cannot survive multiple instances or restarts. A uniqueness constraint is stronger than an unprotected check-then-insert. Reusing a key for a materially different intention should normally fail; a canonical request fingerprint can detect this.

A replay may return the original result or current resource state according to the operation contract. Define retention from retry windows, business risk, semantics, and storage cost under [retention policy](../security/data-retention.md). Critical idempotency guarantees must not silently expire before supported retries.

## Delivery Guarantees

At-least-once delivery permits duplicates; consumers must tolerate them. At-most-once delivery permits loss and is appropriate only if the domain accepts it. Exactly-once behavior is an end-to-end claim across delivery, durable writes, and external effects, not merely a broker setting. Claim it only with evidence for the complete workflow.

An inbox/processed-message record can deduplicate by atomically recording an event identity with its protected business effect. Producers and consumers need explicit event ownership, canonical schema, ordering, delivery, and compatibility. Webhooks may repeat, arrive concurrently, or arrive out of order.

## Outbox Pattern

When a committed change requires eventual publication, record the state change and publication intent in the same transaction/ownership boundary, then publish that durable intent. The producing capability owns event meaning; the outbox mechanism is infrastructure. Define claiming, bounded retries, ordering, failure recovery, retention, and observability; an outbox must not grow forever without policy.

An outbox can publish twice after a lost acknowledgement, so consumers may still need deduplication. Introduce inbox/outbox infrastructure only when reliability requirements justify its complexity.

### Transactions and Domain Events

Publishing before commit can expose a fact whose transaction later fails. Publishing only after commit can lose the event if the process crashes in between. Required durable events need a mechanism that covers this gap, such as transactional recording.

### After-Commit Work

An `afterCommit` callback is best effort in the current process; it does not guarantee an external effect survives a crash. Persist intent when the effect is required durably.

## Work Claiming

Shared workers must coordinate with row locks, conditional updates, queue ownership, or leases where concurrent processing would be unsafe. Leases need explicit expiration, renewal, stale-worker, and reclaim behavior; they do not make external effects safe by themselves.

Poison jobs must reach a bounded attempt limit and an identifiable failure/dead-letter/manual-recovery state. Distinguish transaction contention from business rejection. Stop accepting/claiming work during shutdown, and finish or safely release in-flight work according to queue semantics. A crash must not silently lose claimed work.

### Queue Visibility Timeout

A queue can redeliver when processing outlives its visibility timeout or lease. Account for long work, renewal, stale ownership, and duplicate execution.

### Distributed Scheduling

Define whether each instance runs a schedule or one logical execution runs globally. Schedulers do not necessarily coordinate across instances. Singleton jobs need crash-tolerant claims/ownership; overlapping runs must be explicitly allowed, forbidden, coalesced, or queued.

## Ordering and Versioned Events

Do not assume ordering without a guarantee for the relevant partition/scope. Define the ordering key, reordering tolerance, and whether stale events are ignored, reconciled, or rejected. Correctness may require sequence numbers, versions, or state checks.

### Versioned Events

An aggregate version can help detect duplicate, stale, or out-of-order events; it is not mandatory for every event. Retained event/job schemas also follow [compatibility policy](versioning-and-compatibility.md).

## Unknown Outcome

A timeout or connection loss after sending a mutation can mean failure or success with a lost response. Preserve an unknown outcome when it affects retry safety. Resolve it through idempotency, status lookup, or reconciliation rather than treating it as a known failure.

Classify effects as read-only, idempotent writes, non-idempotent writes, or external effects when that clarifies behavior; a formal type system is not required. A transient transport error alone does not make the business operation safe to repeat.

### Application Retry Boundary

Retrying a broad application operation must not repeat payments, notifications, or other external mutations unless protected by appropriate idempotency.

### Retry Ownership

Normally one layer owns retries for a given failure. Inspect driver, repository, service, SDK, proxy, and client retry behavior so nested attempts do not multiply unnoticed. Define the transient category, safe repeat conditions, bounded attempt/time budget, telemetry, and final-failure behavior.

### New Retry Checklist

Before adding retries, establish: why the failure is transient; whether the prior attempt could have succeeded; repeat safety/idempotency; existing retry owners; attempt limit; diagnostic context; and what happens after exhaustion. Retrying must not amplify an outage.

## Distributed Workflows and Recovery

A multi-system workflow must name the authority for each fact, atomic and non-atomic changes, partial failures, duplicate/retry handling, discoverable incomplete state, crash behavior, and operational recovery. Reconciliation detects and repairs divergence according to those authorities; it is a safety net, not an excuse for avoidable inconsistency.

A saga may coordinate independently committed steps through orchestration or event choreography; neither is the default. Persist long-running workflow state when needed so incomplete work is discoverable. Compensation is a new business action, not a database rollback, and may fail. Define its trigger, idempotency, retries, failure state, and manual recovery.

### Failure Windows

For important workflows, inspect crashes after a durable write, before acknowledgement, and after an external effect but before local confirmation. Cover each unacceptable loss/duplication window deliberately. Database-commit/publication and external-mutation/local-write gaps are ordinary design cases.

## Verification

### Idempotency Tests

Verify the initial effect, duplicate suppression, compatible replay result, differing-payload conflict where required, and concurrent first attempts. Consumer tests must exercise duplicate delivery and stale/reordered events when relevant.

Retry tests verify transient retry, permanent-failure rejection, bounded attempts, and no duplicate effects. High-risk workflows should exercise crash recovery, dead letters, replay, and manual recovery procedures where they exist.

### Reconciliation Tests

Create divergent external/internal states deliberately and verify the documented authority and repair behavior. Test failed compensation and incomplete workflows when those mechanisms exist.
