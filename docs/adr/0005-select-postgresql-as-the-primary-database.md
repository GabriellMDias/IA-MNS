# ADR-0005: Select PostgreSQL as the Primary Database

**Status:** accepted

**Date:** 2026-09-13

## Context

Orion requires a primary database technology before the persistence strategy, migration tooling, schema canonical source, integration-testing infrastructure, and initial backend persistence implementation can be selected consistently.

The database must support applications with substantially different sizes and operational requirements, ranging from small applications to large, long-lived business systems with complex transactional workflows, significant data volumes, concurrent usage, reporting requirements, and extensive integration surfaces.

Orion favors relational integrity, explicit schemas, safe evolution, transactional correctness, mature operational behavior, and infrastructure that can scale incrementally without introducing distributed complexity before it is justified.

The primary database should therefore support:

- ACID transactions;
- relational constraints;
- foreign keys and referential integrity;
- indexes and query optimization;
- concurrency control;
- complex transactional workflows;
- structured relational data;
- semi-structured data where appropriate;
- safe schema evolution;
- mature backup and recovery tooling;
- production observability;
- broad managed-service availability;
- horizontal application scaling;
- large and long-lived schemas;
- integration with TypeScript and Node.js tooling;
- reliable local and automated testing;
- predictable operational behavior.

The database technology should not require applications to introduce additional infrastructure solely in anticipation of hypothetical future scale.

At the same time, Orion is intended to support AI-enabled applications.

Some future applications may require capabilities such as:

- embeddings;
- semantic search;
- similarity search;
- retrieval-augmented generation;
- document retrieval;
- product similarity;
- related-case retrieval;
- semantic knowledge search.

These workloads require vector storage and similarity-search capabilities but do not justify making a dedicated vector database mandatory for every Orion application.

Vector retrieval must also remain distinct from structured access to transactional business data.

A chatbot or AI agent that needs to query business information should not be given unrestricted database access merely because the database contains the relevant information.

## Decision

Orion will use **PostgreSQL as its primary relational database**.

PostgreSQL will be the default persistence platform for applications that require durable relational storage unless a concrete application requirement justifies another database technology.

PostgreSQL will be treated as an application infrastructure concern.

Domain and application code must remain independent from PostgreSQL-specific APIs and persistence representations where practical.

The architectural distinction remains:

```text
database records
    !=
domain entities
    !=
application models
    !=
API contracts
```

The persistence strategy, database-access library, ORM or query-builder choice, migration implementation, and schema canonical source will be selected separately.

This ADR does not select those mechanisms.

### Relational data as the default model

Orion applications should use relational modeling when the data represents structured business state with relationships, constraints, invariants, and transactional behavior.

Database constraints should be used where they provide reliable enforcement of data integrity.

Application validation does not replace database integrity constraints when the invariant can and should be enforced by the database.

PostgreSQL features should be adopted according to concrete data requirements rather than abstracting all database behavior behind the lowest common denominator of multiple database engines.

At the same time, unnecessary PostgreSQL-specific coupling should be avoided when it does not provide meaningful value.

### PostgreSQL extensions

Applications may enable PostgreSQL extensions when an extension provides a concrete capability required by that application.

Extensions are not automatically part of the Orion baseline merely because they may be useful in some future system.

An application that depends on an extension must treat support for that extension as part of its deployment requirements.

### Vector storage and semantic retrieval

When an Orion application requires vector embeddings, vector similarity search, or semantic retrieval, **pgvector will be the preferred initial vector-storage and similarity-search approach when the workload can be appropriately served by PostgreSQL**.

`pgvector` will **not** be enabled by default for applications that do not require vector capabilities.

The intended default progression is:

```text
application requires semantic/vector retrieval
    ↓
evaluate PostgreSQL + pgvector
    ↓
use pgvector when requirements are satisfied
    ↓
measure real workload
    ↓
introduce specialized vector infrastructure only if justified
```

A dedicated vector database will not be introduced solely in anticipation of future AI workloads.

A specialized vector or search system may be selected later when demonstrated requirements involving scale, latency, indexing capabilities, isolation, operational behavior, or other constraints materially justify the additional infrastructure.

### AI access to application data

The presence of PostgreSQL or pgvector does not authorize AI systems to access the database directly without application controls.

The preferred model for structured business data is:

```text
AI agent
    ↓
authorized application tool
    ↓
application layer
    ↓
authorization and business rules
    ↓
persistence layer
    ↓
PostgreSQL
```

For semantic retrieval:

```text
AI agent
    ↓
authorized retrieval capability
    ↓
application layer
    ↓
vector search
    ↓
PostgreSQL + pgvector
```

AI systems should not receive unrestricted arbitrary SQL access to production databases by default.

Application-level authorization, tenant isolation, data classification, auditing, and business invariants remain authoritative.

The broader AI integration architecture, including model providers, tool calling, prompt-injection controls, retrieval architecture, embeddings, and AI-specific authorization, will be defined separately when concrete implementation requirements exist.

### Database versioning

The exact PostgreSQL version will be selected and pinned by deployment and repository tooling rather than by this ADR.

Production environments should use supported PostgreSQL releases appropriate for the selected deployment platform.

Routine supported PostgreSQL upgrades do not require a new ADR when they preserve the architectural decision established here.

## Rationale

PostgreSQL provides the strongest overall fit for Orion's expected range of applications.

It combines mature relational capabilities, transactional guarantees, strong data-integrity mechanisms, sophisticated indexing and query planning, extensibility, broad infrastructure support, and long-term operational maturity.

These characteristics are particularly important for the type of systems Orion may eventually support, including large business applications in which financial, operational, inventory, customer, authorization, and integration data must remain consistent.

A primary database should not merely persist objects.

It must provide a trustworthy data-integrity boundary.

PostgreSQL supports this through mechanisms including:

```text
transactions
constraints
foreign keys
unique constraints
indexes
isolation
locking
transactional DDL where applicable
```

This aligns with Orion's preference for correctness and data integrity over convenience.

PostgreSQL also provides sufficient flexibility for applications that contain both traditional relational data and selected semi-structured data without requiring a second database merely because some records contain flexible attributes.

Its broad ecosystem and availability across local, self-hosted, and managed environments also reduce deployment lock-in.

PostgreSQL is suitable for small projects without requiring complex infrastructure, while retaining substantial operational headroom for larger applications.

This supports Orion's objective of:

```text
low initial complexity
    +
incremental scalability
    +
long-term production maturity
```

rather than selecting one database for small systems and another preemptively for large systems.

The selection does not imply that every scaling concern should be solved inside one PostgreSQL instance indefinitely.

Large systems may eventually require read replicas, partitioning, specialized analytical infrastructure, search infrastructure, distributed workloads, or other data technologies.

Those capabilities should be introduced in response to demonstrated requirements rather than as baseline Orion dependencies.

### AI and vector workloads

pgvector is particularly attractive for Orion because it can add vector search to the same database already responsible for relational application data.

For many applications, this avoids immediately introducing a second data platform solely for embeddings.

The resulting architecture can remain comparatively simple:

```text
PostgreSQL
├── relational business data
└── vector data where required
```

This can reduce:

- operational infrastructure;
- backup complexity;
- deployment complexity;
- additional security boundaries;
- consistency concerns;
- additional vendor dependencies.

It also allows vector search to coexist with ordinary relational filtering and application data.

However, vector similarity search and relational querying solve different problems.

For example:

```text
"Find support cases semantically similar to this description."
    → vector retrieval may be appropriate
```

while:

```text
"Calculate revenue by branch for the last quarter."
    → relational query or application operation is appropriate
```

Orion should therefore not model all data access through embeddings merely because an AI interface exists.

Structured application tools remain preferable for structured business operations and reporting.

The choice of pgvector as the preferred initial vector capability also preserves Orion's principle that complexity must justify itself.

If PostgreSQL can satisfy the vector workload, introducing a dedicated vector database would create an additional operational system without demonstrated value.

If PostgreSQL later becomes insufficient for a specific workload, a specialized system can be evaluated with real performance and capability requirements available.

## Alternatives Considered

### MySQL

MySQL is a mature and widely deployed relational database with broad ecosystem and managed-service support.

It is capable of supporting many small and large production applications.

It was not selected because PostgreSQL provides a stronger overall fit for Orion's expected emphasis on advanced relational modeling, extensibility, complex querying, rich database capabilities, and potential vector functionality within the primary database.

Selecting MySQL would not provide a material simplicity or operational advantage sufficient to outweigh PostgreSQL's broader fit with Orion's expected application patterns.

### Microsoft SQL Server

SQL Server provides a mature relational platform with strong transactional capabilities, tooling, enterprise features, and production support.

It would be a strong option in environments already centered on the Microsoft ecosystem.

It was not selected because Orion is intended to remain broadly deployable across different infrastructure environments and has selected TypeScript and Node.js rather than a Microsoft-centered application platform.

PostgreSQL provides a stronger default combination of portability, ecosystem compatibility, open deployment options, and extensibility for Orion.

### SQLite

SQLite provides extremely low operational complexity and is an excellent database for embedded applications, local tooling, prototypes, tests, and applications whose concurrency and deployment requirements fit its architecture.

It was not selected as Orion's primary application database because Orion must support large multi-user server applications with significant concurrent access, operational requirements, and long-lived relational datasets.

SQLite may still be used by individual tools or applications where its characteristics are appropriate.

### Dedicated Vector Database as a Baseline Dependency

A specialized vector database could be included in the Orion foundation to support future AI and semantic-search features.

This was not selected because most Orion applications will not necessarily require vector retrieval.

Making such infrastructure mandatory would increase operational, deployment, security, and development complexity before a corresponding requirement exists.

PostgreSQL with optional pgvector provides a simpler initial architecture for applications whose vector workloads can be served adequately by the primary database.

Dedicated vector infrastructure remains an available future option when concrete scale or capability requirements justify it.

### Non-Relational Database as the Primary Store

Document, key-value, wide-column, or other non-relational databases may provide significant advantages for specific data models and workloads.

They were not selected as Orion's default because the expected application portfolio includes business systems where relationships, transactions, referential integrity, and structured constraints are central concerns.

Using a non-relational database as the universal default would weaken the natural representation and enforcement of those requirements.

Specialized non-relational databases may still be introduced for concrete workloads when their benefits materially justify another persistence technology.

## Consequences

### Positive

- Orion receives a mature relational database suitable for both small and large applications.
- Strong transactional guarantees support complex business workflows.
- Database constraints can provide an additional integrity boundary beyond application validation.
- PostgreSQL supports rich relational queries and indexing strategies.
- The same primary database can remain viable across substantial application growth.
- PostgreSQL is broadly available across local, self-hosted, cloud, and managed environments.
- Orion does not require multiple persistence technologies merely to anticipate future scale.
- PostgreSQL's extensibility allows specialized capabilities to be introduced without immediately replacing the primary database.
- pgvector provides an incremental path to embeddings and semantic search when an application requires them.
- AI-enabled applications can support semantic retrieval without automatically introducing a dedicated vector database.
- Relational and vector queries can coexist within the same database when this is operationally appropriate.
- Vector infrastructure remains optional for applications that do not need it.
- The architecture preserves a path to specialized data stores when demonstrated workloads justify them.

### Negative

- PostgreSQL introduces a server database that must be operated locally, in CI, and in production where persistence is required.
- Correct database design still requires explicit attention to indexes, transactions, locking, isolation, query plans, connection management, and migrations.
- PostgreSQL-specific features can increase database portability costs when used extensively.
- Extensions such as pgvector create additional deployment compatibility requirements for applications that depend on them.
- Keeping vector and transactional workloads in the same database can create resource contention at sufficiently large scale.
- pgvector may not be the optimal solution for every large or specialized vector-search workload.
- A future application may still require another database technology, increasing system complexity when such requirements emerge.
- Supporting AI access safely requires application-level tooling and authorization rather than simply exposing database queries to the model.

### Operational or Migration Impact

Orion does not currently have an established production database that must be migrated.

The initial persistence implementation will therefore target PostgreSQL directly.

Development and automated testing environments that exercise real persistence behavior should use PostgreSQL-compatible infrastructure rather than relying on a different database engine whose behavior may diverge from production.

The database-access and migration tooling selected later must support PostgreSQL as the canonical database target.

Applications requiring pgvector must explicitly declare the extension as part of their database and deployment requirements.

Applications that do not require vector functionality should not enable pgvector solely because Orion supports it.

Migration history involving PostgreSQL extensions must follow Orion's existing migration policy:

```text
unreleased migration history
    → refinable

released migration history
    → immutable
```

Enabling, upgrading, or removing an extension in a released environment must therefore be represented through controlled database evolution.

Routine PostgreSQL upgrades do not require a new ADR when they preserve this architectural decision.

Introducing a specialized database for a particular workload does not necessarily supersede this ADR if PostgreSQL remains Orion's primary relational database.

Replacing PostgreSQL as Orion's primary database would be an architectural change and should supersede this ADR.

## References

Related ADR: [ADR-0001: Select TypeScript and Node.js as the Primary Language and Runtime](0001-select-typescript-and-nodejs-as-primary-language-and-runtime.md)

Related ADR: [ADR-0004: Select Fastify as the Backend HTTP Framework](0004-select-fastify-as-the-backend-http-framework.md)

Related policy: [principles](../architecture/principles.md)

Related policy: [application boundaries](../architecture/application-boundaries.md)

Related policy: [principles](../database/principles.md)

Related policy: [migrations](../database/migrations.md)

Related policy: [schema documentation](../database/schema-documentation.md)

Related policy: [transactions and concurrency](../database/transactions-and-concurrency.md)

Related policy: [data classification](../security/data-classification.md)

Related policy: [data retention](../security/data-retention.md)

Related policy: [production access](../security/production-access.md)
