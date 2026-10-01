# Database Principles

[Task index](../README.md) · [Migrations](migrations.md) · [Schema documentation](schema-documentation.md) · [Transactions](transactions-and-concurrency.md)

This policy owns durable data design and persistence boundaries. [ADR-0005](../adr/0005-select-postgresql-as-the-primary-database.md) selects PostgreSQL and [ADR-0006](../adr/0006-select-prisma-orm-for-database-access-and-migrations.md) selects Prisma ORM/Migrate. Both are implemented as shared API infrastructure that modules use for their own tables; hosting, production topology, and backup procedures depend on actual deployment requirements.

## Sources and implementation boundary

| Concern | Authority |
| --- | --- |
| Structures Prisma can express | [Authored Prisma schema folder](../../apps/api/prisma/schema/schema.prisma): shared configuration plus one model file per module |
| Reviewed database evolution | Committed SQL migrations in `apps/api/prisma/migrations/` under [migration policy](migrations.md) |
| Complete physical schema, including custom SQL | PostgreSQL after applying the committed migrations |
| Object meaning, owner, classification, lifecycle | Schema-adjacent metadata in `apps/api/prisma/metadata/`, one file per module, under [schema documentation](schema-documentation.md) |
| Least-privilege runtime access | Module grants in `apps/api/prisma/runtime-grants/`, applied to the restricted runtime role in disposable databases |
| Navigable current reference | [Generated database reference](../generated/database/schema.md), derived from migrated PostgreSQL plus metadata |
| Feature writes and queries | A module's Prisma adapter behind its own persistence capabilities, using the shared [database client](../../apps/api/src/database.ts) |

Prisma is infrastructure. Its generated records are not automatically domain entities, public contracts, UI models, or events. Use Prisma Client where clear and efficient, and TypedSQL or explicit parameterized SQL for operations better expressed that way. Do not discard valuable PostgreSQL-native constraints, indexes, views, extensions, or types merely for ORM purity or hypothetical portability. Keep specialized access inside persistence adapters and document custom behavior.

## Database Ownership

Every application-owned object needs identifiable architectural ownership; every table must have a primary domain/capability owner. That owner defines meaning, invariants, allowed readers/writers, and evolution. A shared physical database or shared database package does not grant shared mutation authority.

Cross-domain reads create coupling and need intentional semantics; repeated access may justify a capability interface or projection. Cross-domain writes should invoke the owning capability unless the architecture explicitly assigns another writer. Database access itself is a scoped capability, not permission to query everything. Browser, mobile, and desktop clients must not receive direct database credentials by default; direct access needs an explicit architecture/security model.

## Constraints

Protect durable invariants as close to the data as practical. Application validation provides useful feedback; PostgreSQL constraints and atomic writes provide the final guarantee under concurrency. Use `NOT NULL`, uniqueness, primary/foreign keys, checks, or exclusion constraints where they express the invariant clearly. Application-only uniqueness checks cannot prevent races.

Nullability must represent real absence, unknown, unassigned, or inapplicable semantics, not implementation convenience. Use foreign keys for durable referential integrity where architecture permits them, and choose update/delete actions deliberately: `CASCADE`, `RESTRICT`, or `SET NULL` is a lifecycle decision. Rich workflows belong in domain/application logic rather than unreadable SQL constraints. Multiple layers may protect the same invariant for different purposes without independently duplicating complex business rules.

## Data Types

Choose types for meaning: explicit states instead of invalid boolean combinations, exact numeric representations for precision-sensitive values, and structured columns for stable fields requiring constraints, indexing, classification, and querying. Avoid undocumented sentinel values. Enums and custom types have schema-evolution implications.

Document units, precision, scale, rounding, and currency relationships where relevant. Floating point is unsuitable by default for exact monetary amounts. Distinguish calendar dates, wall-clock times, instants, durations, and time zones. Add lifecycle timestamps only when useful and define who advances them. `updated_at` is neither an audit history nor automatically a reliable concurrency/ordering token.

JSON is a deliberate flexible representation, not a substitute for schema design. Persisted JSON and free-form metadata still require validation, classification, redaction, migration, and compatibility rules. Large binaries need a decision considering access patterns, transaction requirements, backup, retention, and cost; if stored externally, database ownership/reference and object lifecycle must remain consistent.

## Identifiers

Define identity scope and distinguish internal primary keys, public resource IDs, provider IDs, natural business keys, and idempotency keys. Stable primary keys are preferred; use mutable natural keys only with understood consequences. Public and storage identity may coincide deliberately but should not be coupled accidentally. Generated IDs must not encode sensitive information or serve as authorization.

Each module's implementation conventions record its identifier and timestamp choices, such as immutable UUIDs and database-clock timestamps. One module's choices do not force every domain to use identical semantics.

## Query Design

Retrieve the fields needed by the caller, with explicit projections where they improve clarity, performance, or security. Read models may differ from write models. Bound collections under [API policy](../api/principles.md#pagination) and parameterize untrusted values in SQL. ORM convenience must not hide material N+1 query costs.

Create indexes for demonstrated query, ordering, or integrity requirements. Review existing indexes, composite-column order, specialized/partial behavior, write/storage cost, and creation impact. Uniqueness indexes enforce semantics as well as performance. Do not index every column or remove apparently redundant indexes without query evidence. Use safe query plans, timing, and query-count investigation before adding caches or speculative optimization.

Normalize for integrity and ownership; denormalize when actual read/performance needs justify synchronization cost. Every persisted projection, counter, cached aggregate, search index, or materialized view needs a canonical source, update/refresh mechanism, staleness expectation, recovery/rebuild strategy, and owner. Caches must not become the only copy of critical durable truth.

## Database-native behavior

Views, materialized views, functions, procedures, generated columns, and triggers are architectural behavior and part of migration/compatibility review. Explain purpose and consumers, important expressions, transaction assumptions, activation, writes, and cascading/recursive effects. Undocumented application-owned triggers or state-changing procedures are prohibited. Database notifications do not automatically become the application event architecture.

Use additional stores, CQRS, event sourcing, separate databases/services, or analytical isolation only when requirements justify their consistency, operations, and recovery cost. A modular monolith may share one physical database while preserving logical ownership. Reporting should not erase ownership boundaries, and financial ledger requirements need their own domain design rather than mutable balances by default.

## Access, classification, and lifecycle

Use machine-readable [classification](../security/data-classification.md) near the schema. Sensitive fields require proportionate controls for projections, grants, telemetry, backups, exports, replicas, and support access. Read-only access can still disclose data. Encryption at rest does not lower classification; field encryption requires explicit key-management, search, rotation, migration, and recovery design. Password hashes remain restricted. Do not put infrastructure secrets in ordinary business tables for convenience.

Separate runtime and migration credentials when privileges differ; the current runtime uses `ORION_DATABASE_URL`, and only the Prisma CLI receives `ORION_MIGRATION_DATABASE_URL`. See the [API runtime guide](../../apps/api/README.md#configuration-and-database-access) for the implemented restricted role. [Secrets management](../security/secrets-management.md) and [production access](../security/production-access.md) govern operational access. Significant administrative access should be attributable; database tools must not become silent authorization bypasses.

[Data retention](../security/data-retention.md) owns deletion, soft-delete justification, archival, copies, backup/recovery, and audit lifecycle. Replicas inherit data controls and may return stale reads. If business audit history is required, model it explicitly; ordinary logs and modification timestamps do not provide authoritative auditability. Development/test seeds must be synthetic and distinct from production bootstrap/reference-data evolution.

## Runtime reliability

Connection pools are finite resources; size them against actual application concurrency, database limits, replicas, and deployment scale. Saturation needs evidence, not reflexively larger pools. Bound query waits and propagate cancellation where supported and safe. Observe latency, pool wait, transaction failure, lock contention/deadlocks, timeouts, migration duration, and replica lag where relevant.

Follow [redaction](../security/telemetry-redaction.md): raw SQL and parameters may disclose sensitive data. Translate known constraint failures to owned semantic errors, preserve unexpected failures as safe observable internal errors, and do not expose database implementation details publicly. [Health policy](../reliability/health-checks.md) distinguishes database-dependent readiness from process liveness.

## Schema Evolution

Use [migrations](migrations.md) for every durable schema transition and verify release status before editing history. Released or uncertain history is immutable until verified; schema diffs alone cannot establish migration intent. Keep current schema/metadata/reference coherent without requiring readers to reconstruct current meaning from old migrations.

Choose descriptive, consistent table/column/relationship/constraint/index names using the current schema as the local pattern. Deprecated objects and temporary compatibility fields need explicit purpose and removal conditions. Manual production schema drift is a defect; emergency changes must be recorded and reconciled. Reviewed, scoped, auditable data fixes may use controlled scripts rather than permanent migration history when they repair only one environment.

## New Table Checklist

Before creating or changing durable structures:

1. Inspect current schema, metadata, owning domain, access boundaries, migrations/release status, consumers, and tests. Do not guess missing non-obvious semantics.
2. Identify the persisted concept, canonical versus derived status, reader/writer authority, identifiers, lifecycle/retention, classification, and required columns.
3. For each field, define type, null/default/unit meaning, source, public-contract impact, existing-row population, constraints, and index needs.
4. For each constraint/index/native feature, explain its invariant/query purpose, existing-data compatibility, concurrency, locking/write cost, failure mapping, and discovery route.
5. Design migration, rollback or forward recovery, transaction/concurrency boundaries, and operational evidence proportional to risk. Data being unused by current code does not prove it is disposable.
6. Update [canonical schema documentation](schema-documentation.md) and generate references. Test important constraints, atomic failure, concurrent races, and migrations against real PostgreSQL. Mocks or sequential tests alone cannot prove those guarantees.

Current [validation](../validation.md) covers fresh migrations, PostgreSQL integration, reference completeness/freshness for supported object types, release-history integrity, and import boundaries. Real released upgrade paths and deployment-specific drift/recovery checks require actual supported environments; do not claim them from a fresh-install test.
