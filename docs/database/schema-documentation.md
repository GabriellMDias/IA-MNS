# Database Schema Documentation

[Task index](../README.md) · [Database principles](principles.md) · [Generated reference](../generated/database/approval-requests.md) · [Living documentation](../architecture/living-documentation.md)

This policy owns documentation of application-owned database structures. [ADR-0006](../adr/0006-select-prisma-orm-for-database-access-and-migrations.md) makes fully migrated PostgreSQL the complete physical authority, including custom SQL absent from Prisma Schema Language. Document meaning next to the schema and generate structure; readers should not reconstruct current semantics from migration history or reverse engineer queries.

## Canonical sources and current tooling

| Information | Source |
| --- | --- |
| Authored representable model | [Prisma schema](../../apps/api/prisma/schema.prisma) |
| Physical names, types, nullability, defaults, constraints, indexes, enum values | PostgreSQL migrated from committed SQL |
| Meaning, ownership, classification, lifecycle, null/unit semantics, object purpose | [Schema-adjacent metadata](../../apps/api/prisma/schema-metadata.json) |
| Generated textual presentation | [Database reference](../generated/database/approval-requests.md), produced by the [catalog-backed generator](../../apps/api/scripts/database-reference.ts) |
| Cross-file domain behavior and rationale | [Approval Request specification](../domains/approval-request.md), implementation conventions, policies, and ADRs |

The current metadata uses `tables` and `enums`; table metadata contains owner, description, classification, lifecycle, column metadata, and constraint/index purposes. Structural facts are introspected, not independently copied into JSON. Database-native comments, diagrams, broader manifests, and code-to-schema links remain optional future mechanisms, not alternative canonical sources already in use.

## Database Documentation

Every application-owned table and column requires canonical documentation, and each table requires an architectural domain owner. Document additional application-owned objects as they appear. Engine/ORM/extension/hosting internals need documentation only when material to application architecture or operations; architectural ownership is distinct from the database role that owns an object.

Keep one source for each fact. Machine-readable policy must use structured metadata rather than parsing free-form comments. Use English, concise semantic descriptions, and synthetic examples. A name repeated as a sentence is insufficient when meaning is unclear; conventional fields may use short standardized descriptions when semantics truly match. Never invent descriptions solely to satisfy completeness checks.

Current descriptions explain current truth. Migration-specific safety stages belong in migration comments or runbooks; significant rationale belongs in ADRs; complex business/authorization/retention policy belongs to its owner and is linked rather than copied into every column. Preserve deprecated-object purpose and replacement while it exists, and remove stale metadata when the object is removed. Ownership changes require metadata updates and may signal an ADR-level boundary change.

## Table Documentation

Explain the durable concept, owning domain, allowed role in the architecture, and important lifecycle/relationships. Distinguish canonical domain state, relationships, projections, audit, integration, operational, and reference data. A derived table must identify its canonical source and regeneration/freshness expectations. Link broader lifecycle or domain rules when needed instead of writing a second policy in metadata.

## Column Documentation

Document meaning and classification for every column, plus the following when relevant:

| Concern | Required meaning |
| --- | --- |
| Null/default | Whether null means absent, unknown, unassigned, inapplicable, or removed; explain non-obvious defaults without duplicating structural facts |
| Quantity/money | Unit, precision/rounding expectations, currency relationship; avoid ambiguous numeric values |
| Time | Instant versus local/calendar semantics, authoritative clock/update behavior, time zone where relevant, and whether it is informational or a concurrency token |
| Identity | Internal/public/provider/business/idempotency purpose, scope, stability, public exposure; provider identifiers need provider ownership and lifecycle |
| State/derived data | Non-obvious state values, source, calculation/update behavior, immutability or lifecycle constraints |
| Sensitive content | Machine-readable [classification](../security/data-classification.md), and category/control metadata only when useful and maintainable |

The current generator requires `nullMeaning` for every nullable column. Additional telemetry metadata may be introduced only when consistently enforceable; classification does not itself authorize telemetry export.

## Constraints, relationships, and indexes

Generate physical definitions and actual referential actions where covered. Explain the invariant protected by non-obvious checks/uniqueness, significant query/order patterns, and specialized/partial index maintenance implications. Relationships must distinguish owner, creator, approver, membership, assignment, or historical attribution when structure cannot explain the distinction. Cascading deletion and nulling deserve explicit lifecycle rationale.

Keep constraint-to-public-error translation discoverable near persistence/error code without duplicating mappings across prose. Primary-key semantics still need explanation when non-obvious. Do not infer an API resource relation from a table name, or remove similar-looking indexes without workload evidence.

## Other application-owned objects

These requirements apply when the object exists; extend generation/validation with its introduction.

| Object | Documentation required |
| --- | --- |
| View | Purpose, owner, sources, derived/canonical role, consumers, and any stable reporting/integration contract |
| Materialized view | View meaning plus refresh mechanism/frequency, staleness, failure and recovery behavior |
| Function/procedure | Purpose, input/output meaning, units, read/write effects, modified data, transaction/security assumptions, and significant failures |
| Trigger | Activation event/table, timing, effects, reason for database placement, recursive/cascading behavior, and tests; hidden effects are prohibited |
| Generated column | Semantic purpose and expression where safe/useful |
| Enum/domain/custom type | Semantic values, purpose, constraints, units, ownership; migration constraints belong in evolution guidance |
| Sequence | Purpose and allocation meaning; ordinary sequences do not promise gapless numbering |
| Partition/inheritance | Key/relationship, purpose, query/retention consequences, and operational owner |
| Row-level security policy | Protected table, actor/role scope, covered operations, and interaction with application authorization |
| Significant role/grant | Runtime, migration, or operational privileges and responsible security/operations guidance |
| Extension | Why required, dependent capabilities, setup and operational implications |

## Generated Reference

`pnpm --filter @orion/api references:write` intentionally regenerates current API/database/configuration/error references using a freshly migrated disposable PostgreSQL. `pnpm references:check` checks freshness without editing tracked files; `pnpm docs:references:check` checks the portal's derived representation. See [artifact workflow](../architecture/backend-execution-and-generated-artifacts.md) for the complete order and [validation](../validation.md) for requirements.

The current database generator covers ordinary application tables in `public`, their columns, primary and other constraints, indexes, and enums; it excludes Prisma's migration table. It compares Prisma-representable structure to the freshly migrated database and rejects unmodeled application-owned object kinds rather than silently omitting them. It is still not a universal PostgreSQL catalog export: new schemas, partitioned tables, views, triggers, functions, RLS, or other object kinds require deliberate generator coverage and metadata before adoption.

For covered objects it checks exact names, stale/missing entries, required owner/descriptions/lifecycle, valid table/column classifications, nullable-column meaning, object purposes, enum descriptions, and generated drift. Units and broader business semantics still require review. Schema drift in a deployed database and reference drift from repository sources are separate defects; this disposable-database check does not inspect deployments.

Generated files are read-only representations. Change schema/metadata or generator sources and regenerate; never patch output to hide drift. The portal adds human navigation without becoming another schema source. Keep structured text searchable by domain/object/field meaning for agents. Generated diagrams, if added, should reflect actual schema; authored simplified diagrams must be clearly explanatory rather than canonical. Reliable metadata, not guesses, should drive links to code, domain, or API.

## Schema Documentation Requirements

Before handing off a schema change:

1. Inspect the current physical/authored schema, metadata, ownership, classification, constraints, relationships, domain rules, and migration release status. Escalate uncertain non-obvious meaning as a documentation defect rather than guessing.
2. Update object/column meaning, classification, null/unit/lifecycle semantics, native side effects, and ownership with the schema change. Give newly sensitive fields explicit review.
3. Extend metadata and generator coverage for newly introduced object kinds; missing documentation must fail validation wherever that coverage exists.
4. Regenerate the current reference and portal data. Review schema, SQL, metadata, and reference diffs together, especially nullability, constraints, relationships, and classification changes.
5. Verify links/navigation, current terminology, test evidence, and that structural facts are derived rather than maintained independently. Generation proves covered consistency, not semantic correctness.
