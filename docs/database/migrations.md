# Database Migrations

[Task index](../README.md) · [Release workflow](release-evolution.md) · [Compatibility](../architecture/versioning-and-compatibility.md) · [Schema documentation](schema-documentation.md)

This policy owns safe transitions between durable database states. [ADR-0006](../adr/0006-select-prisma-orm-for-database-access-and-migrations.md) selects reviewed SQL migrations through Prisma Migrate. The [initial SQL migration](../../apps/api/prisma/migrations/20260924000000_approval_requests/migration.sql), [release registry](../../apps/api/prisma/release-history.json), fresh PostgreSQL checks, and release-history validator exist. Deployment-specific procedures require a real environment and are not selected here.

## Released Migration

A migration is released when applied to a persistent environment whose history Orion promises to upgrade safely: production, a durable staging baseline, or a customer installation may qualify. Non-production does not necessarily mean disposable. Released SQL, transformations, identifiers, contents, and ordering are immutable; corrections require a new forward migration. Generated and handwritten migrations follow the same rule.

If release status is uncertain, treat history as immutable until verified. An empty registry means no durable release is **recorded**, not proof that no persistent consumer exists. Do not edit, delete, reorder, or squash uncertain history on that assumption. Follow [release recording](release-evolution.md#record-the-first-durable-migration-boundary) and resolve the applicable [H-08](../human-actions.md#h-08) evidence before classifying an existing migration as unreleased.

Checksum mismatches can indicate modified history or drift; do not bypass them to continue. Retain released migrations while supported creation/upgrade paths depend on them. A future baseline or history-retention change needs explicit tooling and support policy and must not silently invalidate existing installations.

## Unreleased Migration

A migration used only in genuinely disposable local, preview, or test databases is not automatically released. Verified unreleased history may be edited, regenerated, renamed, reordered, combined, or removed when the final path becomes clearer and remains safe. Git records experiments; migrations record meaningful durable transitions.

Before generating another migration, inspect whether existing unreleased work represents the same change. Do not retain create/rename/drop experiments with no lasting released meaning. The objective is the minimum number of meaningful **safe** stages, not one file per feature or the fewest files at any cost. Preserve stages required for backfills, compatibility, locking, or rollout safety.

Parallel branches require semantic reconciliation of their schema intent, dependencies, and ordering. Do not resolve migration conflicts merely by accepting both timestamped files. Use descriptive intent-based names and the existing directory convention.

## Schema Evolution

Review schema and SQL together. Prisma is the authored model for structures it can express; migrated PostgreSQL is complete physical truth, including custom SQL. Generated SQL is a proposal: inspect data loss, constraints, locks, rewrites, ordering, and compatibility before accepting it. `prisma db push` is not the durable evolution workflow; ADR-0006 permits it only for explicitly disposable experimentation/tooling.

Schema and application deployment form one compatibility system. Identify which application/schema combinations can run before, during, and after the change, including rolling coexistence and application rollback. New code must not require schema that has not been applied; old code must be removed before dropping structures it still uses. An application must not become ready against an incompatible required schema. A numeric schema version or startup version checker is not mandatory; do not claim one exists without implementation.

Use expand–migrate–contract when consumers cannot migrate atomically:

1. **Expand:** add compatible structures while old code still works.
2. **Migrate:** deploy writers/readers and backfill required data; observe and verify the transition.
3. **Contract:** remove obsolete structures only after dependent consumers/data are safe.

Temporary dual writes, fallback reads, compatibility triggers, defaults, and feature flags need a canonical source, failure/reconciliation behavior, test coverage, and removal condition. A fallback must not hide incomplete migration forever. Completion includes data verification, new code adoption, removal of old consumers, and intended compatibility cleanup, even when this spans releases.

## Review by change type

| Change | Required analysis |
| --- | --- |
| Rename table/column | Consumer and rolling-version impact; consider expansion/backfill/switch/removal instead of direct rename |
| Type conversion or narrowing | Existing-data validity, precision/truncation, rewrite/lock cost, application representation, irreversible loss |
| Required column or `NOT NULL` | Writers, existing-row population, verification that no invalid/null data remains, then enforcement |
| Default addition/removal | Existing rows versus future writes, database/application semantics, cost, and temporary compatibility purpose |
| Unique/foreign-key/check constraint | Existing duplicates/orphans/violations, repair/validation, concurrency behavior, locking, and phased validation where useful |
| Index creation/removal | Real query need, table cost, blocking/concurrent operation limits, and whether the index enforces integrity |
| Reference-data transformation | Explicit source/owner; required release transformations cannot depend on development seed scripts |
| New baseline | Evidence that existing schema corresponds to the recorded state; deterministic future creation/upgrades |

Apparently additive DDL can still lock or rewrite a large table. Safety depends on actual PostgreSQL behavior and data, not SQL length.

## Destructive Changes

Dropping/truncating structures, deleting durable data, narrowing values, or irreversible transformation requires explicit review of owner intent, retention/audit/reporting needs, every consumer, data loss, supported rollback, and recovery. Lack of code references is insufficient evidence that data is disposable. Record irreversibility rather than providing a misleading automatic reverse operation.

Application rollback, schema rollback, data restoration, and a corrective forward migration are different actions. Older application code can run only if compatible with the current schema. Recreating an empty dropped column does not recover its data; new writes may make backward migration unsafe. Prefer a reviewed forward correction for released history, and use an actual environment's backup/restore or repair procedure when required. No universal safe `down` migration is assumed.

## Backfills

A backfill is a data migration. Assess row count, runtime, locks, transaction size, retry behavior, progress, and failure recovery. Small bounded transformations may share a migration; large work may need a dedicated batched, resumable, preferably idempotent process instead of one long transaction. Repeating a batch must not corrupt data.

Deploy compatible schema, run the backfill, observe progress, verify completeness/semantics, then enforce stricter constraints. Track safe progress such as processed/remaining counts, checkpoints, batch duration, and failures. Choose batch sizes and stop conditions from evidence. A transformation needed by every upgraded database belongs in the supported release path; a one-off environment repair may belong in a controlled audited script/runbook instead.

## Execution, failure, and drift

Transaction behavior depends on PostgreSQL, the specific DDL, and Prisma execution; do not assume every migration is automatically transactional or safely retryable. Make non-transactional operations and partial-failure recovery explicit. Large transactions can hold locks, exhaust resources, and increase replication lag. Prevent incompatible concurrent migration runners using appropriate tool/platform coordination.

A failure must expose the migration, stage, rollback/partial-application state, and recovery path safely. Do not blindly rerun partially applied SQL or manually mark a failed migration successful merely to continue. Required migration failure must stop dependent rollout. Tool metadata is evidence of execution, not a substitute for understanding the physical schema.

Schema drift is a defect. Do not routinely type ad hoc production DDL, automatically overwrite unexplained drift, or leave emergency changes outside repository history. Investigate intent and data dependence, record exact intervention, reconcile migrations, and verify future paths. [Production access](../security/production-access.md) and [incident response](../security/incident-response.md) govern authority; this policy grants none.

For high-risk changes, use a concrete runbook with preconditions, execution, monitoring, abort thresholds, verification, and recovery. Observe locks, application error/latency, replication lag, and progress as relevant. If future topology includes multiple databases, tenants, shards, or customer installations, define per-instance state, rollout ordering, partial failure, and version skew; do not assume atomic fleet migration.

Migration credentials must remain separate from ordinary runtime code and limited to required privileges. Execution should be attributable to release, migration, environment, identity, time, duration, and result where available. Never embed real sensitive rows, credentials, or connection strings in SQL, examples, registry entries, or logs. Follow [redaction](../security/telemetry-redaction.md).

## Validation and release history

The current [release workflow](release-evolution.md) owns commands and evidence. `pnpm release:check` protects recorded durable commits, complete migration sets/checksums, and append-only registry history. Fresh Testcontainers PostgreSQL checks replay committed migrations and generate physical references; root `pnpm validate` includes real database tests. These do not prove an upgrade from a released database or inspect an actual deployment.

When supported released baselines exist, add upgrade tests from those real states, with permitted representative data. Verify data meaning, constraints, schema outcome, and supported application/schema combinations; do not merely assert successful SQL execution. Historical fixtures must not be changed just to pass tests. Establish the supported upgrade window with actual deployment/support requirements rather than inventing one now.

Static checks can flag risky DDL, but cannot prove lock cost, retention safety, or semantic correctness. Review schema, migration, metadata, and generated reference diffs together. Major boundary changes may need an ADR; ordinary schema evolution does not. Keep temporary transition rationale in migration comments/runbooks and current meaning in schema metadata.

## Migration review checklist

1. Verify ownership, actual release status, source/target state, and whether to refine verified unreleased work or append a new stage.
2. Review generated/custom SQL, existing data, irreversible effects, retention, constraints/indexes, lock/rewrite cost, and transaction/partial-failure behavior.
3. Identify supported old/new application combinations, rollout order, backfill strategy, temporary compatibility, recovery, and removal conditions.
4. Update schema semantics and [generated references](schema-documentation.md); test fresh creation, relevant real release upgrades, data outcomes, and critical constraints/concurrency.
5. Review risk-proportionate monitoring, abort and verification evidence, credential separation, and required human/environment decisions. Report unavailable checks explicitly.
