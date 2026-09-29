# ADR-0006: Select Prisma ORM for Database Access and Migrations

**Status:** accepted

**Date:** 2026-09-13

## Context

Orion requires a database access and schema-evolution strategy after selecting PostgreSQL as its primary relational database.

The selected approach must support applications ranging from small systems to large, long-lived business applications with complex transactional behavior, substantial schemas, specialized queries, and PostgreSQL-specific capabilities.

The persistence tooling should support:

- strong TypeScript integration;
- statically typed database access;
- an explicit and readable persistence schema;
- safe database evolution;
- reviewable SQL migrations;
- deterministic local development and CI;
- production-safe migration workflows;
- explicit transactions;
- complex relational queries;
- direct SQL when ORM abstractions are insufficient;
- PostgreSQL-specific capabilities when they provide concrete value;
- integration with optional PostgreSQL extensions such as pgvector;
- generated database documentation;
- clear separation between persistence models and domain, application, API, and UI models.

Orion's database migration policy already distinguishes between unreleased development history and released database history.

Unreleased migrations may be refined, regenerated, consolidated, or removed when requirements change.

Released migrations are immutable.

The selected migration tooling must support this policy without making generated migrations opaque or preventing SQL from being reviewed and adjusted before release.

Orion also does not require every PostgreSQL feature to be representable through the database-access abstraction.

Large systems may require:

- complex joins;
- common table expressions;
- window functions;
- reporting queries;
- bulk operations;
- specialized indexes;
- database constraints;
- views;
- triggers;
- PostgreSQL extensions;
- vector similarity queries;
- other PostgreSQL-specific features.

The persistence strategy must therefore provide an escape path to explicit SQL rather than forcing all database behavior through ORM abstractions.

## Decision

Orion will use **Prisma ORM as its primary database-access and persistence tooling for PostgreSQL applications**.

The initial Orion baseline will use the supported **Prisma ORM 7 release line**.

Prisma ORM 8 will not be adopted as the initial baseline. It may be evaluated after its stable general-availability release and after compatibility, migration, operational, and feature requirements have been assessed.

A compatible future upgrade from Prisma ORM 7 to Prisma ORM 8 or another Prisma major version does not require a new ADR when Prisma retains the architectural responsibilities defined here.

The exact Prisma versions will be pinned mechanically through the package-management strategy established by ADR-0002.

### Architectural boundary

Prisma is a **persistence infrastructure concern**.

The intended dependency direction is:

```text
domain
    ↑
application
    ↑
persistence ports
    ↑
Prisma persistence adapters
    ↓
PostgreSQL
```

Domain code must not depend on Prisma.

Application code should remain independent from Prisma-specific APIs and generated persistence types except where an explicitly scoped infrastructure concern requires otherwise.

Prisma-generated records and types are persistence representations.

They are not domain entities, application models, API contracts, or UI models.

The architectural distinction remains:

```text
Prisma persistence models
    !=
domain entities
    !=
application models
    !=
API contracts
    !=
UI models
```

Persistence adapters are responsible for translating between database representations and framework-independent application or domain representations where such translation is necessary.

This rule does not require ceremonial mapping layers for every trivial projection.

The purpose is to preserve responsibility boundaries rather than introduce abstraction for its own sake.

### Prisma Schema Language

Prisma Schema Language will be the primary authored representation for database structures that Prisma can represent appropriately.

The Prisma schema should clearly describe ordinary persistence concerns such as:

- tables and models;
- columns and scalar types;
- nullability;
- identifiers;
- relations;
- uniqueness;
- indexes supported by the selected Prisma version;
- supported database-native types;
- other schema properties that Prisma can represent reliably.

The Prisma schema is not considered a complete representation of every possible PostgreSQL capability.

PostgreSQL-specific structures that cannot be represented correctly through Prisma must not be omitted merely to preserve ORM purity.

### Canonical database representations

Orion will distinguish between three related database representations.

#### Authored persistence model

```text
Prisma schema
    → primary authored representation
      for database structures Prisma can represent
```

#### Released database evolution

```text
versioned SQL migrations
    → authoritative history of transitions
      between released database states
```

#### Complete current physical schema

```text
fully migrated PostgreSQL database
    → authoritative complete physical schema
```

The complete migrated PostgreSQL schema is authoritative for physical database structures because it may contain features not completely represented by Prisma Schema Language.

These may include PostgreSQL extensions, specialized constraints, indexes, views, triggers, custom types, or other database-native behavior.

Generated database reference documentation should therefore ultimately be derived from or validated against an actually migrated PostgreSQL schema rather than relying exclusively on the Prisma schema.

### Database access

Prisma Client will be the default database-access mechanism for persistence operations that it represents clearly and efficiently.

Typical examples include:

- ordinary creates, reads, updates, and deletes;
- relational queries;
- filtering;
- ordering;
- pagination;
- projections;
- common transactional persistence operations.

Prisma Client should not be forced onto queries for which explicit SQL provides a materially clearer, safer, or more efficient implementation.

For specialized or complex database operations, Orion may use **TypedSQL or explicit parameterized SQL**.

Examples may include:

- complex reporting queries;
- common table expressions;
- advanced aggregations;
- window functions;
- specialized PostgreSQL functionality;
- performance-sensitive queries;
- vector similarity operations;
- operations unsupported or poorly represented by Prisma Client.

The choice between Prisma Client and explicit SQL should be based on clarity, correctness, maintainability, type safety where practical, and demonstrated database behavior rather than a requirement that every query use the ORM abstraction.

Explicit SQL must remain parameterized where external values are involved and must follow Orion's security and database policies.

### Migration tooling

Orion will use **Prisma Migrate** as its primary migration-generation and deployment tooling.

Database evolution will be represented through version-controlled SQL migration files.

The normal development flow is:

```text
change persistence schema
    ↓
generate migration
    ↓
inspect generated SQL
    ↓
adjust SQL when necessary
    ↓
validate migration
    ↓
commit schema and migration
```

Generated migrations must be reviewed before they become part of released migration history.

Generated SQL is not assumed to be operationally safe merely because it was produced by Prisma.

Migrations involving large tables, backfills, constraint changes, destructive operations, compatibility periods, or zero-downtime requirements may require manually edited or multi-step SQL migrations.

Orion's existing migration policy remains authoritative:

```text
released migration history
    → immutable

unreleased development migration history
    → refinable
```

Before release, migrations may be regenerated, consolidated, reordered, or removed when doing so produces a smaller coherent migration history and no durable environment depends on the previous history.

After a migration reaches an environment whose migration history is considered durable, changes must be represented by new migrations.

### `db push`

`prisma db push` will **not be part of Orion's canonical database-evolution workflow** for durable application development.

The normal Orion development path will use versioned migrations from the beginning.

`db push` may be used only in explicitly disposable experimentation or tooling contexts where migration history is intentionally irrelevant.

It must not be used to evolve production, staging, shared durable development environments, or other databases whose migration history must remain reproducible.

### PostgreSQL-specific features

Orion will not restrict PostgreSQL usage to the subset of features representable by Prisma.

When a required PostgreSQL feature is unsupported or incompletely represented by Prisma Schema Language, the feature may be implemented through a reviewed custom SQL migration.

Examples may include:

- PostgreSQL extensions;
- specialized constraints;
- specialized indexes;
- triggers;
- views;
- database functions;
- custom database types;
- other PostgreSQL-native capabilities.

Such SQL becomes part of the versioned migration history and therefore part of the canonical database evolution.

### pgvector

The optional pgvector capability established by ADR-0005 will be supported through this persistence strategy.

When an application requires pgvector and the selected Prisma version does not completely represent the required vector functionality, Orion may use:

```text
custom SQL migrations
    +
Prisma unsupported database representations where appropriate
    +
TypedSQL or explicit parameterized SQL
```

for vector storage and similarity queries.

The inability of the ORM to represent a specialized PostgreSQL capability is not sufficient reason to avoid a database feature that otherwise provides clear architectural value.

Vector-specific persistence operations should remain isolated within appropriate persistence or retrieval adapters.

### Transactions

Prisma transaction mechanisms may be used where they provide the transactional behavior required by the application.

Transaction boundaries are an application and database-correctness concern, not an ORM convenience concern.

Business operations requiring atomic persistence must define appropriate transaction boundaries according to Orion's transaction and concurrency policy.

If a required PostgreSQL transaction behavior cannot be expressed adequately through the selected Prisma API, a more explicit database-access mechanism may be used within the persistence boundary.

### Schema documentation

Generated database documentation must represent the database that applications actually depend on.

The intended flow is:

```text
Prisma schema
    +
versioned SQL migrations
    ↓
migrated PostgreSQL database
    ↓
schema introspection
    ↓
generated database reference
```

This prevents generated documentation from silently omitting database behavior introduced through custom SQL migrations.

The generated reference remains derived documentation and must not become an independently edited source of truth.

## Rationale

Prisma ORM provides a strong combination of TypeScript integration, schema readability, migration tooling, generated type-safe database access, introspection, and development tooling.

This combination aligns particularly well with Orion's AI-first goal.

A Prisma schema provides a compact and structured representation of persistence relationships that can be efficiently inspected by both human contributors and AI agents.

Important persistence properties such as relations, identifiers, nullability, uniqueness, and database types can be discovered without reverse-engineering database access code.

Prisma Client also provides a highly readable database API for common persistence operations.

For ordinary relational workloads this reduces repetitive database-access code while preserving strong TypeScript inference.

The integrated relationship between schema definition, generated database client, migrations, and introspection also reduces the number of independent tools that Orion needs to standardize.

This is valuable for a reusable engineering foundation intended to support many future projects.

Prisma is not selected because Orion intends to hide SQL.

Orion treats SQL and PostgreSQL behavior as important engineering concerns.

The persistence strategy therefore deliberately preserves explicit SQL as a first-class escape path.

This becomes increasingly important in large systems where reporting, performance-sensitive operations, PostgreSQL-specific features, or specialized persistence workloads may exceed the useful abstraction boundary of an ORM.

The intended model is:

```text
common persistence operations
    → Prisma Client

specialized database operations
    → TypedSQL or explicit SQL
```

rather than:

```text
every database operation
    → ORM regardless of suitability
```

This prevents the ORM from becoming an architectural constraint.

The decision also preserves PostgreSQL as the authoritative persistence platform.

Prisma is tooling around PostgreSQL, not a replacement for understanding PostgreSQL.

This distinction is important for transaction behavior, indexing, query planning, locking, migrations, constraints, performance, and production investigation.

Prisma Migrate aligns with Orion's migration philosophy because it produces version-controlled SQL migrations that can be inspected and customized.

This allows Orion to retain both the productivity of declarative schema evolution and the operational control required for safe production changes.

The Prisma schema alone cannot necessarily represent every physical PostgreSQL capability an Orion application may require.

Treating an actually migrated PostgreSQL database as the authority for the complete physical schema resolves this limitation without abandoning Prisma's useful authored schema model.

The resulting model is:

```text
Prisma schema
    → convenient authored persistence model

SQL migrations
    → explicit released evolution

migrated PostgreSQL
    → complete physical truth
```

This also provides a stronger foundation for generated database documentation.

Prisma ORM 7 is selected as the initial baseline because Orion should begin from a stable production-oriented release rather than making a foundational dependency on an in-transition major release.

A future Prisma major release may provide significant improvements and can be adopted once its production behavior and compatibility are sufficiently established.

The project owner also has existing Prisma experience.

For a reusable foundation maintained and repeatedly applied across future projects, existing operational and development familiarity provides real value.

It reduces learning cost, improves the ability to review generated migrations and persistence behavior, and lowers the risk associated with creating repository conventions around an unfamiliar persistence tool.

## Alternatives Considered

### Drizzle ORM

Drizzle provides a strongly typed TypeScript-oriented persistence model with close alignment to SQL and PostgreSQL.

Its schema model, migration tooling, SQL visibility, and support for PostgreSQL-specific capabilities make it a strong candidate for Orion.

It also provides particularly direct ergonomics for some PostgreSQL extensions and specialized data types.

Drizzle was not selected because Prisma provides a stronger overall fit for Orion's current priorities around integrated tooling, concise schema readability, generated client ergonomics, introspection, migration workflow, and existing maintainer experience.

The difference is not based on Drizzle being unsuitable for large systems.

Drizzle would be a technically valid persistence strategy.

Prisma was selected because its complete development workflow currently provides greater value for Orion while explicit SQL remains available for cases where Prisma's abstraction is insufficient.

### Kysely

Kysely provides a type-safe SQL query builder with a design that remains close to SQL.

It gives applications substantial control over queries and is particularly attractive for systems that prefer SQL-centric persistence with minimal ORM abstraction.

It was not selected because Orion would need to assemble more of the surrounding schema-definition, migration, introspection, and developer-tooling workflow independently.

Kysely's lower abstraction level is valuable for SQL-heavy systems but does not provide enough additional value to outweigh Prisma's more integrated persistence workflow as Orion's default.

Kysely-like SQL-oriented access patterns remain conceptually available through TypedSQL or explicit SQL when specialized queries require them.

### SQL-Only Database Access

Orion could use PostgreSQL directly through a low-level driver and maintain all schema and query behavior in SQL.

This would maximize visibility into database behavior and minimize ORM abstraction.

It was not selected because it would require substantially more manual TypeScript typing, persistence plumbing, migration conventions, and tooling for common application operations.

For applications that span a wide range of sizes, the additional implementation burden is not justified when Prisma can cover common persistence operations while preserving explicit SQL for specialized cases.

### Prisma Schema as the Complete Database Source of Truth

Orion could treat `schema.prisma` as the complete canonical definition of the database.

This would provide a particularly simple source-of-truth model.

It was not selected because Orion explicitly permits PostgreSQL capabilities that may not be completely representable by the selected Prisma version.

Treating the Prisma schema as complete physical truth could cause extensions, specialized constraints, indexes, views, triggers, custom types, or other migration-defined structures to disappear from database documentation or architectural understanding.

Orion therefore distinguishes between the authored Prisma model and the complete migrated PostgreSQL schema.

### `db push` as the Normal Development Workflow

Prisma can synchronize schema changes directly to a database without maintaining normal migration history.

This can make early prototyping fast.

It was not selected as Orion's canonical workflow because Orion requires database transitions to become explicit, reviewable, reproducible migration artifacts.

Using versioned migrations from ordinary development onward also reduces differences between development and durable deployment workflows.

`db push` remains available only for intentionally disposable contexts.

## Consequences

### Positive

- Orion receives a strongly typed persistence API aligned with TypeScript.
- Prisma Schema Language provides a concise, machine-readable representation of ordinary persistence structures.
- Humans and AI agents can inspect models and relationships without reconstructing them from database-access code.
- Prisma Client reduces repetitive persistence code for common relational operations.
- Prisma Migrate provides an integrated schema-evolution workflow.
- SQL migration files remain visible, version-controlled, reviewable, and customizable.
- Orion's released-versus-unreleased migration policy remains fully applicable.
- PostgreSQL-native capabilities are not prohibited merely because Prisma cannot represent them completely.
- TypedSQL and explicit SQL provide an escape path for advanced and performance-sensitive queries.
- pgvector can coexist with Prisma through custom migrations and specialized queries.
- Persistence models remain separated from domain, application, API, and UI models.
- The complete migrated PostgreSQL schema can drive accurate generated database documentation.
- Existing Prisma familiarity reduces implementation and operational learning cost.
- The architecture remains appropriate for both simple CRUD applications and large SQL-intensive business systems.

### Negative

- Prisma introduces an additional abstraction over PostgreSQL whose behavior must be understood.
- Generated Prisma types can create accidental architectural coupling if imported outside persistence boundaries.
- Some PostgreSQL capabilities may require manually customized SQL migrations.
- Specialized queries may require TypedSQL or explicit SQL in addition to Prisma Client.
- The Prisma schema may not describe the complete physical database by itself.
- Database documentation requires introspection of a migrated PostgreSQL instance to represent custom migration behavior completely.
- ORM-generated queries still require performance monitoring and query-plan analysis in large systems.
- Major Prisma upgrades may require significant compatibility evaluation.
- Applications using unsupported PostgreSQL types may lose some Prisma Client ergonomics for those fields.
- Maintaining both Prisma abstractions and explicit SQL requires contributors to understand when each approach is appropriate.

### Operational or Migration Impact

Orion does not currently have an established persistence implementation that must be migrated.

The initial PostgreSQL persistence layer will therefore be implemented directly using Prisma ORM.

Repository tooling must pin compatible Prisma ORM 7 packages explicitly rather than relying on unversioned CLI resolution.

Persistence implementation must remain within the infrastructure boundary established by Orion's dependency rules.

The repository must introduce Prisma schema files and version-controlled migration artifacts only when actual database content exists.

Migration deployment to durable environments must use committed migration history.

`prisma db push` must not be used as a substitute for versioned migration deployment in durable environments.

Custom PostgreSQL features must be included in version-controlled migrations rather than applied manually to production databases.

Applications using pgvector must include the extension and associated database structures in their migration history.

Development and integration-test databases should be created from the same migration history used to create production-compatible schemas.

Database reference generation should inspect a fully migrated PostgreSQL schema so that custom SQL features are included.

Routine compatible Prisma upgrades do not require a new ADR when they preserve this persistence architecture.

Upgrading to Prisma ORM 8 or another future major release requires an explicit compatibility review but does not require a new ADR unless the upgrade materially changes the responsibilities or architecture established here.

Replacing Prisma as Orion's primary database-access and migration strategy would be an architectural change and should supersede this ADR.

## References

Related ADR: [ADR-0001: Select TypeScript and Node.js as the Primary Language and Runtime](0001-select-typescript-and-nodejs-as-primary-language-and-runtime.md)

Related ADR: [ADR-0002: Select pnpm for Package and Workspace Management](0002-select-pnpm-for-package-and-workspace-management.md)

Related ADR: [ADR-0003: Establish Repository Validation and Architecture Enforcement](0003-establish-repository-validation-and-architecture-enforcement.md)

Related ADR: [ADR-0005: Select PostgreSQL as the Primary Database](0005-select-postgresql-as-the-primary-database.md)

Related policy: [principles](../architecture/principles.md)

Related policy: [application boundaries](../architecture/application-boundaries.md)

Related policy: [dependency rules](../architecture/dependency-rules.md)

Related policy: [principles](../database/principles.md)

Related policy: [migrations](../database/migrations.md)

Related policy: [schema documentation](../database/schema-documentation.md)

Related policy: [transactions and concurrency](../database/transactions-and-concurrency.md)

External reference: Prisma ORM release-status documentation.

External reference: Prisma Migrate documentation.

External reference: Prisma PostgreSQL extensions documentation.
