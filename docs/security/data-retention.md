# Data Retention

This policy owns data lifecycle, retention, deletion, archival, and recovery requirements. [Classification](data-classification.md) determines sensitivity; domain owners define purpose and meaning. Deployment-specific schedules, legal durations, provider lifecycle rules, legal-hold tooling, and recovery objectives have not been selected here. Undefined retention is a visible design gap, not permission to keep data forever.

## Data lifecycle

Schema and product design must consider creation, updates, active use, retention, deletion/anonymization/archival, derived copies, and backups. Collect only necessary data before deciding how long to keep it. Retain for an identified product, security, legal, or operational purpose; a new use requires review. More sensitive data needs stronger justification, tighter access, and shorter retention where possible.

Retention and disposition are a contract: why data exists, who owns it, what begins/ends retention, what happens afterward, and how copies converge. Do not invent a universal duration or legal obligation. Indefinite retention needs explicit justification such as a durable ledger or permanent product artifact, not missing cleanup. Cancellation or another domain state does not imply an undocumented deletion rule.

## Retention policy metadata

For important datasets, document category, owner, classification, purpose, canonical source, trigger, justified duration or lifecycle condition, whether limits are minimum/maximum, disposition, derived systems/providers, backup behavior, and monitoring. Keep policy meaning at its owner and reference it from canonical schemas; avoid copying the whole policy onto every table. A generated data inventory/registry can help when real consumers justify one, but this document does not claim such governance tooling exists.

Triggers may be creation, last activity, account/contract termination, incident closure, export generation, job completion, or credential expiration. State them unambiguously. Changes need rationale, affected scope, retroactivity, treatment of existing older data, copy/provider changes, and migration/cleanup plans. Shortening retention can affect recovery, support, analytics, and obligations; extending it increases privacy, security, and cost exposure.

## Deletion and soft delete

Hard deletion removes active records; other systems may still retain copies until their documented convergence/expiry. Soft deletion retains the row and is not a privacy deletion. Use it only for concrete restore, audit, or lifecycle needs, with deliberate query filtering, authorization, uniqueness, restore window, and eventual hard-delete/anonymization/archive behavior. Do not add `deletedAt` to every table by default.

Archival changes storage/access, not classification or deletion obligations; define queryability, security, recovery, and later disposition. Tombstones should retain only the minimum required to represent nonexistence or distributed consistency. Anonymization must address reasonable re-identification; renaming a user while keeping email/IP/external IDs is insufficient. Pseudonymization, hashes, and small/precise aggregates can remain personal data.

Preserve referential integrity and intentional ownership through cascade, restrict, nulling, anonymized references, or tombstones. Account deletion must not automatically cascade through unrelated business history. Account, organization, and shared-content deletion need distinct domain semantics: revoke credentials, remove private profiles/content, preserve organization-owned or legally required records, and retain only necessary historical attribution. Audit purpose does not justify retaining unrelated sensitive content. Intentional orphan records need documented meaning and lifecycle.

## Data classes and copies

| Data | Lifecycle requirements |
| --- | --- |
| Credentials and identity | Remove obsolete hashes and expired/revoked sessions when no longer needed; define refresh rotation/replay retention. Invalidate used/revoked recovery credentials immediately without retaining secret history. Current authorization state and audit history are separate datasets. |
| Audit/security/financial records | Define purpose-specific retention and integrity independently. Financial/legal durations come from actual obligations; security/fraud evidence needs separate justification from analytics. Prefer provider-owned/tokenized payment credentials. |
| User content and objects | Include original objects, versions, incomplete multipart uploads, staging, thumbnails/previews, converted media, and derived files. Derivatives normally follow the source unless a separate purpose justifies another lifecycle. |
| Caches and search | Identify canonical source, rebuildability, expiration, and deletion/invalidation propagation. A cache is not permanent storage; use explicit invalidation when TTL exceeds acceptable deletion delay. |
| Client storage | Include local databases/files/offline caches and operating-system backups. Logout must define credential/sensitive cache removal without assuming all non-sensitive offline product data must be erased. |
| Logs/traces/errors/metrics | Separate diagnostics, audit/security, debug data, raw high-resolution records, and long-term aggregates. Match diagnostic/SLO/capacity/regression value, privacy, and cost. Traces are not permanent execution history. Temporary verbose diagnostics need expiration. |
| Exports/reports/support bundles | Define both access-link lifetime and underlying-file deletion; expiring a URL does not delete the file. Minimize fields, authorize and protect delivery, and avoid indefinite personal-workstation/shared-folder/email copies. |
| Temporary/job artifacts | Clean after success, failure, and cancellation where practical; incomplete uploads and scratch files must not persist by omission. |
| Queues/events/DLQs/replay archives | Include expected processing delay, retries, dead-letter and replay windows, and privacy. Minimize payloads. A DLQ is not a permanent archive; event sourcing is not a default and requires resolving immutable-history/deletion conflicts. |
| Analytics/warehouses/data lakes | Distinguish raw events, identifiable derived records, and aggregates. Every dataset has ownership and lifecycle; analytical copies are not exempt from deletion. |
| AI datasets/embeddings/prompts | Training/evaluation/retrieval use is not authorized by ordinary collection. Define policy before ingestion, including provider retention/training and deletion limits. Source deletion may require vector/embedding removal; investigation transcripts inherit included sensitivity. |

## Deletion is a distributed workflow

Inventory meaningful copies in primary stores, caches, search, object derivatives, analytics, exports, replicas, and providers. For asynchronous deletion define convergence expectations, retries, reconciliation, failure monitoring, and completion evidence. Prefer idempotent operations; after timeout inspect actual state rather than blindly repeating an unsafe action. Partial failure must remain visible and retryable, not silently marked complete.

Use the same inventory for applicable access, correction, portability, and deletion requests. Determine high-risk completion evidence from actual obligations. Provider evaluation must address stored fields, default/configurable retention, per-record deletion, backup/subprocessor behavior, and compatibility with Orion's policy. Offboarding may require export, deletion confirmation, and credential revocation. Deleting Orion's primary record does not automatically delete provider copies.

## Cleanup and verification

Retention jobs should be bounded, idempotent, observable, and safely retryable. Use batches and efficient indexed expiry selection when workloads justify them; avoid unbounded destructive transactions that create locks, replication pressure, or long rollbacks. Expiration fields represent lifecycle meaning. Storage TTL must not silently bypass required audit, domain effects, or derived deletion.

Observe failures, overdue age, backlog, and backup-expiry failures when relevant; alerts must reflect real obligations or risk. Log safe scope, count, duration, result, and bounded reason categories rather than deleted contents. Required deletion audit records capture actor/system, operation, scope, time, and result without preserving the sensitive payload.

Manual/bulk production deletion follows [production access](production-access.md) and a real [runbook](../runbooks/authoring.md): use purpose-built workflows, scope previews, appropriate authorization, batching, verification, and recovery planning. Tests should cover expiry selection, filtering, propagation, idempotency, partial failure, and restoration semantics where applicable.

## Backups, restore, and deletion replay

Backups inherit source classification and need encryption, access control, retention/expiry, and restore tests. Choose frequency/generations against actual Recovery Point Objective (acceptable loss) and Recovery Time Objective (restoration time), cost, and obligations; do not invent strict objectives prematurely or keep backups forever because storage is cheap.

Deleted live data may remain until backup expiry. Document that limit and never promise immediate total deletion when old copies remain. Restoration may reintroduce deleted/expired records or credentials: reconcile current lifecycle state and reapply applicable deletions, retention changes, and revocations. A minimal durable deletion ledger may be justified. Restore tests must verify usable recovery and retention correctness, not merely backup creation success.

Backups must not bypass ordinary access controls. Snapshots, offline/cross-region copies, migration/forensic/restore-test copies, and detached or lagging replicas need explicit scope, owner, access, and expiry. Production snapshots are not default development data; any authorized copy needs minimization/anonymization, restricted access, and bounded retention.

## Non-production and collaboration

Preview environments and their storage should expire when their purpose ends. Synthetic isolated test databases need cleanup; CI logs/reports/screenshots/artifacts, development logs, and tool/AI caches need appropriate lifetimes. Retention cannot make secret-bearing artifacts safe.

Git, documentation, issues, pull requests, and chat are durable surfaces, not stores for production samples, exports, or customer records. Use sanitized references. Incident records can retain useful learning without copying raw sensitive evidence; minimize/redact screenshots. Follow [incident response](incident-response.md) for leaked sensitive data rather than waiting for ordinary expiration.

## Holds and exceptions

Applicable legal minimums and maximums must be identified from actual jurisdiction/product requirements; a minimum does not justify indefinite retention. Legal holds suspend deletion only for authorized, scoped records/categories and need authority, start, review, release, and auditability. After release, resume normal retention and remove already-expired data as required.

Security/incident or other exceptions need data scope, purpose, owner, authority, duration/review, affected backups/providers, and disposition at expiry. They must not default to permanence or a system-wide hold. This policy does not select legal-hold tooling or grant authority for operational actions.

## New persistent data checklist

Before adding a field, record, file, event, or provider copy, identify purpose, owner, classification, canonical source, trigger/duration/disposition, derived copies, backup/restore effect, deletion propagation, partial-failure detection, and tests. Before soft delete, explain why hard deletion is insufficient and how filtering, uniqueness, restoration, and eventual removal work. Surface unknown product/operational requirements explicitly; do not silently substitute “forever” or promise unavailable deletion/recovery capabilities.
