# Database Schema Documentation

[Documentation index](../README.md) · [Validation availability](../validation.md)

Governing decisions: [ADR-0006](../adr/0006-select-prisma-orm-for-database-access-and-migrations.md). Accepted choices are distinct from implemented tooling.

## Read for this change

- [Table Documentation](#table-documentation)
- [Column Documentation](#column-documentation)
- [Generated Reference](#generated-reference)
- [Schema Documentation Requirements](#schema-documentation-requirements)
- [Database Documentation](#database-documentation)

## Purpose

This document defines the documentation policy for application-owned database structures in Orion.

Its goals are to ensure that database semantics are:

- explicit;
- discoverable;
- close to the canonical schema;
- understandable without reverse engineering application code;
- suitable for generated documentation;
- useful to humans and AI agents;
- consistent with data-classification and ownership rules;
- protected against documentation drift.

The database schema is a durable application contract.

Its documentation must explain not only what structures exist, but what those structures mean.

This document is technology-agnostic.

ADR-0006 establishes the fully migrated PostgreSQL schema as the complete physical reference. The semantic metadata format, comment mechanism, generator, and output format remain implementation decisions.

For the first application-owned table, [schema-adjacent metadata](../../apps/api/prisma/schema-metadata.json) supplies semantics and the [generated Approval Request reference](../generated/database/approval-requests.md) combines it with a freshly migrated PostgreSQL catalog. `pnpm references:check` fails on missing or stale table, column, enum, constraint, or index metadata and on generated-reference drift. Broader database documentation mechanisms remain requirement-driven.

This document complements:

- [docs/database/principles.md](principles.md);
- [docs/database/migrations.md](migrations.md);
- [docs/database/transactions-and-concurrency.md](transactions-and-concurrency.md);
- [docs/security/data-classification.md](../security/data-classification.md);
- [docs/architecture/principles.md](../architecture/principles.md).

---

## Core Principle

Database structure should explain itself as much as practical from canonical machine-readable sources.

The desired model is:

```text
canonical database schema
        +
schema metadata
        ↓
generated database reference
        +
authored architectural explanation
```

The schema should describe facts.

Authored documentation should explain intent, rationale, and broader behavior.

Do not manually duplicate information that can reliably be generated.

---

## Documentation Is Part of the Schema

A database object is incomplete when its purpose cannot be determined reliably.

For application-owned structures, documentation is part of implementation.

This applies to:

```text
tables
columns
constraints
indexes
views
materialized views
functions
procedures
triggers
generated columns
database enums
domains
```

where supported by the selected database.

---

## Canonical Documentation

Orion should maintain one canonical source for each database fact.

For example:

```text
column name
column type
nullability
default
constraint
```

should come from the schema itself.

Do not separately maintain these structural facts in prose when tooling can derive them.

---

## Structural vs Semantic Documentation

Database documentation contains two broad classes of information.

### Structural Information

Structural information can usually be derived automatically.

Examples:

```text
table name
column name
type
nullability
default
primary key
foreign key
unique constraint
index
```

### Semantic Information

Semantic information usually requires explicit metadata or authored explanation.

Examples:

```text
why the table exists
which domain owns it
what a column means
what null means
what unit is used
whether the data is sensitive
why an index exists
what a trigger changes
```

Both are necessary.

---

## Machine-Readable First

When semantic information can be represented safely and clearly in the canonical schema, prefer machine-readable metadata.

Conceptually:

```text
table: orders
owner: orders
description: Customer purchase order.

column: total_amount
description: Total monetary amount in minor currency units.
classification: CONFIDENTIAL
unit: minor_currency_unit
```

The exact syntax is intentionally deferred.

---

## Authored Documentation

Not every database concept belongs inside schema metadata.

Authored documentation should explain topics such as:

```text
aggregate ownership
cross-domain dependencies
complex lifecycle
migration strategy
transaction model
retention rationale
historical compatibility
```

Schema comments should not become long architectural essays.

---

## Documentation Layers

Orion should eventually support three layers of database documentation:

```text
schema metadata
    → canonical object-level meaning

generated database reference
    → navigable current schema documentation

authored database/domain docs
    → architecture, rationale, lifecycle, operational behavior
```

Each layer has a different responsibility.

---

## Application-Owned Objects

This policy applies to application-owned database objects.

It does not require Orion to document every internal object created by:

```text
database engine
ORM
migration tool
extension
hosting platform
```

unless those objects materially affect application architecture or operations.

---

## Ownership Metadata

Every application-owned database object should have identifiable ownership where practical.

At minimum, every application-owned table should have an owner.

Conceptually:

```text
owner: orders
```

or:

```text
owner: identity
```

Ownership refers to architectural responsibility, not database account ownership.

---

## Ownership Meaning

Database ownership should answer:

```text
Which domain defines this data?

Which module may change its semantics?

Where should a contributor look for related business behavior?

Who is responsible for schema evolution?
```

Ownership should remain stable enough to support navigation.

---

## Table Documentation

Every application-owned table must have canonical documentation.

A table description should explain:

```text
what durable concept the table represents
which domain owns it
important lifecycle semantics
```

It should not merely repeat the table name.

Bad:

```text
orders

Stores orders.
```

Better:

```text
Stores customer purchase orders and their current durable lifecycle state.
Owned by the Orders domain.
```

---

## Table Purpose

A contributor should be able to determine why a table exists without tracing every query that uses it.

The table description should distinguish, when relevant, whether the table represents:

```text
domain state
relationship
projection
audit history
integration state
operational state
reference data
```

---

## Table Lifecycle

Non-obvious table lifecycle should be documented.

Examples include:

```text
rows are immutable after creation

rows are deleted when parent is deleted

rows are retained for audit

table is rebuilt from canonical source

records expire automatically
```

---

## Table Source of Truth

If a table is derived rather than canonical, that must be explicit.

Examples:

```text
search projection
cached aggregate
reporting projection
materialized data
```

The documentation should identify the canonical source.

---

## Column Documentation

Every application-owned column must have canonical documentation.

The level of detail may vary.

Simple columns may require only concise descriptions.

Complex columns may require additional metadata.

---

## Column Meaning

A column description should explain semantic meaning.

Bad:

```text
status

The status.
```

Better:

```text
Current lifecycle state of the order.
```

If the state values have non-obvious semantics, those should also be documented.

---

## Null Semantics

Nullable columns should document what `NULL` means when the meaning is not obvious.

Possible meanings include:

```text
not yet assigned
not applicable
unknown
removed
not collected
```

These are not equivalent.

---

## Default Semantics

Non-obvious defaults should explain their purpose.

For example:

```text
retry_count defaults to 0 because a newly created job has not yet been attempted.
```

Do not duplicate obvious database-generated defaults unnecessarily.

---

## Units

Columns representing quantities should document units when the unit is not completely clear from the type and name.

Examples:

```text
milliseconds
seconds
bytes
grams
minor currency units
percentage points
basis points
```

Ambiguous numeric data is a documentation defect.

---

## Money

Monetary fields should document:

```text
currency relationship
storage unit
precision expectations
```

For example:

```text
amount_minor

Monetary amount expressed in the smallest unit of the associated currency.
```

---

## Date and Time Semantics

Temporal columns should document their semantic meaning.

For example:

```text
scheduled_at

Absolute instant at which the job becomes eligible for processing.
```

This is more useful than:

```text
Job scheduled timestamp.
```

When local timezone semantics matter, document them explicitly.

---

## Identifiers

Identifier columns should document what they identify.

Distinguish:

```text
internal primary key
public resource identifier
external provider identifier
idempotency key
business reference number
```

Do not assume `_id` communicates all relevant semantics.

---

## External Identifiers

Columns storing external-provider identifiers should document:

```text
which provider owns the identifier
whether it is unique
whether it may change
whether it is safe for public exposure
```

where relevant.

---

## Sensitive Data Classification

Columns containing sensitive information should eventually expose machine-readable classification.

Conceptually:

```text
classification: PUBLIC
classification: INTERNAL
classification: CONFIDENTIAL
classification: RESTRICTED
```

Classification semantics are defined in:

- [docs/security/data-classification.md](../security/data-classification.md)

---

## Personal Data Metadata

Where useful, columns may additionally identify categories such as:

```text
personal data
authentication data
financial data
user-generated content
```

The exact metadata model will be selected later.

Avoid metadata complexity that cannot be maintained reliably.

---

## Telemetry Policy Metadata

Future schema metadata may optionally indicate whether a field is appropriate for telemetry.

Conceptually:

```text
telemetry: prohibited
```

or:

```text
telemetry: identifier-only
```

This may integrate with:

- [docs/security/telemetry-redaction.md](../security/telemetry-redaction.md)

Such metadata should be introduced only when it can be enforced consistently.

---

## Primary Keys

Primary keys are normally structurally discoverable.

Additional documentation is required when key semantics are non-obvious.

For example:

```text
The identifier is generated before persistence and is safe to expose publicly.
```

or:

```text
Internal storage identifier. Must not be used as the external resource identifier.
```

---

## Foreign Keys

Foreign-key relationships should be visible in generated documentation.

Non-obvious relationship semantics should be documented.

For example:

```text
created_by_user_id

Identifies the user who originally created the order.
This relationship is historical and does not represent current ownership.
```

The foreign key alone cannot communicate that distinction.

---

## Relationship Semantics

A relationship may represent:

```text
ownership
membership
creator
approver
current assignment
historical attribution
```

These semantics should be documented when not obvious.

---

## Delete Behavior

Important foreign-key delete behavior should be discoverable.

Examples include:

```text
CASCADE
RESTRICT
SET NULL
```

Generated documentation should display the actual database behavior where possible.

If the reason is non-obvious, explain it.

---

## Constraints

Important constraints should have discoverable purpose.

Structural facts can be generated.

Semantic rationale may require metadata.

Examples include:

```text
order_total_non_negative
```

or:

```text
only_one_active_subscription_per_account
```

A meaningful constraint name can provide useful documentation itself.

---

## Check Constraints

A check constraint should be understandable from:

```text
constraint name
expression
description when necessary
```

Complex expressions should explain the invariant they protect.

Do not require contributors to interpret complicated SQL to discover business meaning.

---

## Unique Constraints

Unique constraints protecting a business invariant should document that invariant when not obvious.

Example:

```text
Ensures that one provider event is processed at most once.
```

This communicates more than the column list alone.

---

## Constraint Error Semantics

When an application translates a constraint violation into a stable error code, that relationship may be documented close to persistence or error-contract code.

It should not be manually duplicated in many places.

Future tooling may link constraints to error semantics.

---

## Index Documentation

Indexes should be included in generated structural documentation.

Not every index requires a prose explanation.

A description is appropriate when the reason is not obvious.

---

## Index Purpose

A significant index should be traceable to:

```text
query pattern
ordering requirement
constraint
operational requirement
```

Example:

```text
Supports worker lookup for pending jobs ordered by scheduled_at.
```

---

## Specialized Indexes

Partial, functional, full-text, vector, or other specialized indexes should document:

```text
why the index exists
which query pattern depends on it
any important consistency or maintenance implications
```

when those facts are not obvious.

---

## Redundant Indexes

Generated documentation may eventually help identify apparently overlapping indexes.

Tooling must not remove indexes automatically solely from structural similarity.

Actual query behavior matters.

---

## Views

Every application-owned view must document:

```text
purpose
owner
source tables
whether it is canonical or derived
expected consumers
```

when appropriate.

---

## View Stability

If a view acts as a stable internal reporting or integration interface, that should be documented.

Changing its columns may then have compatibility implications.

---

## Views Are Read Models

A view should not automatically become a public domain model.

It represents a database read projection.

Its architectural role should remain explicit.

---

## Materialized Views

Every application-owned materialized view must document:

```text
purpose
canonical source
refresh mechanism
refresh frequency
staleness expectation
owner
```

Without these facts, consumers cannot reason about freshness.

---

## Materialized View Staleness

A materialized view is not necessarily current.

Documentation should answer:

```text
How stale may this data be?

When is it refreshed?

What happens if refresh fails?
```

when relevant.

---

## Functions

Every application-owned database function must document its purpose.

Documentation should include important behavior such as:

```text
input semantics
output semantics
side effects
security implications
transaction assumptions
```

where not obvious from the signature.

---

## Pure Database Functions

A pure calculation function may require little documentation beyond its purpose and units.

A function that writes state requires substantially more explanation.

---

## Procedures

Every application-owned procedure should document:

```text
what operation it performs
which data it modifies
transaction expectations
important failure behavior
```

Procedures can hide significant behavior from ordinary application code.

Their documentation is mandatory.

---

## Triggers

Every application-owned trigger must document:

```text
which event activates it
which table or operation causes it
what it changes
why the behavior belongs in the database
```

Triggers are a common source of hidden side effects.

Orion requires them to be highly discoverable.

---

## Trigger Example

Documentation should make a flow such as:

```text
INSERT orders
    ↓
trigger
    ↓
insert order_audit
```

discoverable without runtime debugging.

---

## Trigger Timing

Where relevant, document whether a trigger executes:

```text
before
after
instead of
```

the triggering operation.

Generated structural documentation may provide this automatically.

---

## Trigger Recursion and Cascades

If triggers can cause other trigger execution or cascading database behavior, that behavior must be clearly documented.

Hidden recursion is unacceptable.

---

## Generated Columns

Generated columns should document semantic purpose when the expression alone is insufficient.

Generated documentation should display the expression where safe and useful.

---

## Database Enums

Database enums should document the semantic meaning of each value when values are not self-explanatory.

For example:

```text
pending
    Order exists but payment has not been confirmed.

confirmed
    Required payment has been confirmed.
```

Do not duplicate obvious meanings unnecessarily.

---

## Enum Evolution

If enum values have compatibility or migration constraints, that belongs in database implementation or migration documentation rather than ordinary field descriptions.

---

## Domains and Custom Types

Database domains or custom types should document:

```text
semantic purpose
validation rules
unit
ownership
```

where relevant.

Shared types should not become generic dumping grounds.

---

## Sequences

Application-owned sequences should document their purpose when not obvious.

For example:

```text
Generates human-facing invoice numbers.
```

Do not confuse a sequence with a guarantee of gapless numbering.

---

## Partitioned Tables

If table partitioning is introduced, documentation should explain:

```text
partition key
purpose
retention implications
query implications
operational ownership
```

Partitioning is an implementation detail with operational consequences.

---

## Table Inheritance

If supported and used, inheritance relationships must be documented explicitly.

Such database-specific features should never rely solely on tribal knowledge.

---

## Row-Level Security

If row-level security is introduced, every relevant policy must be documented.

Documentation should identify:

```text
protected table
policy purpose
actor or role scope
operations covered
interaction with application authorization
```

RLS is a security boundary and requires strong discoverability.

---

## Database Roles and Grants

Application-level schema reference does not need to list every infrastructure-generated database role by default.

However, significant application database roles may eventually require documentation, especially:

```text
runtime role
migration role
read-only operational role
analytics role
```

This belongs partly to security and production-access documentation.

---

## Database Extensions

If database extensions are required, documentation should explain:

```text
why the extension is required
which schema capabilities depend on it
operational implications
```

The dependency should be discoverable during environment setup.

---

## Canonical Metadata Location

The preferred long-term model is for object-level descriptions to live in or near the canonical schema.

Possible mechanisms may include:

```text
database-native COMMENT
ORM schema metadata
schema DSL annotations
adjacent machine-readable metadata
```

The exact mechanism will depend on the selected stack.

---

## Database-Native Comments

Database-native comments are attractive because they:

```text
travel with the schema
can be introspected
can support generated documentation
remain close to database objects
```

They should be preferred when tooling supports them cleanly.

---

## Limitations of Database Comments

Database-native comments may not represent every metadata category cleanly.

For example:

```text
owner
classification
unit
telemetry policy
```

may require structured metadata beyond free-form text.

Do not encode complex machine-readable policy by parsing arbitrary prose.

---

## Structured Metadata

Where automated enforcement depends on metadata, use structured representation.

Avoid conventions such as:

```text
"CONFIDENTIAL; LOG:NO; OWNER:users"
```

inside free-form comments if the tooling must parse them.

Prefer explicit fields.

---

## Metadata Duplication

Do not define ownership or classification in several independent metadata systems.

The desired model is:

```text
one canonical metadata source
        ↓
generated / validated representations
```

---

## Description Style

Descriptions should be concise and semantic.

Prefer:

```text
Identifier of the tenant that owns the order.
```

over:

```text
This column stores the ID of the tenant.
```

Avoid filler language.

---

## Descriptions Should Explain Meaning

A good description answers:

```text
What does this represent?

What important semantic detail is not obvious?
```

It should not merely translate the identifier into a sentence.

---

## Avoid Implementation History in Current Descriptions

Current schema documentation should explain current truth.

Avoid:

```text
This column was added because the old implementation...
```

unless historical context is necessary to understand current behavior.

Historical rationale belongs in:

```text
Git
ADR
migration
```

as appropriate.

---

## Examples in Schema Documentation

Examples may be useful when semantics are difficult to understand.

Examples must use synthetic data.

Never embed real production values.

---

## Sensitive Examples

Descriptions of sensitive columns should explain semantics without showing realistic credentials or personal data unnecessarily.

For example:

```text
Password verification hash.
```

is sufficient.

Do not include an example hash copied from production.

---

## Generated Reference

The current [generated Markdown reference](../generated/database/approval-requests.md) contains the migrated Approval Request schema and its semantic metadata. The [Living Documentation Portal](../architecture/living-documentation.md) presents it as navigable human documentation while preserving the AI-readable generated file. Portal page layout is an implementation detail, not a second schema source.

---

## Generated Documentation Is Not Canonical

Generated documentation is a representation.

The canonical schema and metadata remain authoritative.

Do not manually edit generated database reference files.

---

## Generated Table Reference

A generated table page can include:

```text
description
owner
columns
types
nullability
defaults
classification
primary key
foreign keys
constraints
indexes
relationships
```

where metadata exists.

---

## Generated Relationship Diagrams

Schema tooling may generate relationship diagrams.

Diagrams are useful navigation aids.

They do not replace textual semantics.

A relationship line cannot explain:

```text
historical creator
current owner
optional membership
```

without metadata.

---

## Entity-Relationship Diagrams

ER diagrams should be generated from the actual schema where practical.

Manually maintained diagrams are vulnerable to drift.

Authored diagrams may still be appropriate when they intentionally simplify or aggregate concepts.

---

## Simplified Domain Diagrams

A domain-focused diagram may omit infrastructure tables intentionally.

Such a diagram is explanatory, not canonical structural truth.

It should be clearly distinguished from generated schema diagrams.

---

## Documentation Index

Generated database documentation should provide navigation by:

```text
object type
domain owner
relationship
classification where appropriate
```

This helps both human and AI exploration.

---

## Searchability

Database documentation should be searchable by:

```text
table name
column name
domain concept
description
```

when the documentation system supports it.

---

## AI Readability

Generated documentation should prefer structured text formats that AI agents can inspect reliably.

Human visual presentation is useful.

Machine-readable structure remains essential.

---

## Schema Manifest

Orion may eventually generate a machine-readable schema manifest.

Conceptually:

```text
database-schema.json
```

or equivalent.

It may contain:

```text
objects
relationships
metadata
classifications
```

This could support tooling and AI navigation.

The canonical source should still remain the actual schema definition.

---

## Current Schema vs Migration History

Generated database documentation describes:

```text
current database truth
```

Migration history describes:

```text
how released databases reached that truth
```

Do not force users to read migrations to understand the current schema.

---

## Documentation and Migrations

When a migration changes schema semantics, corresponding canonical metadata must change in the same work.

For example:

```text
add column
    +
add description
    +
add classification where required
```

A schema change without documentation is incomplete.

---

## Migration-Specific Comments

Some migration rationale is temporary or historical.

It should remain in the migration or related ADR rather than polluting current schema descriptions.

Example:

```text
This two-stage migration exists to preserve rolling deployment compatibility.
```

That is migration documentation, not necessarily table documentation.

---

## Documentation and Ownership Changes

If ownership of a table or object moves between domains, update canonical ownership metadata.

Such a move may indicate a meaningful architectural change.

An ADR may be appropriate if the boundary changes significantly.

---

## Documentation and Renames

A rename should update current descriptions to reflect current meaning.

Avoid retaining obsolete terminology unless backward compatibility requires it.

---

## Documentation and Deprecated Objects

Deprecated schema objects should be identifiable.

Potential metadata may include:

```text
deprecated: true
replacement: new_column
```

where useful.

Do not retain deprecated metadata forever after the object is removed.

---

## Documentation and Data Retention

Tables with special retention or deletion semantics should reference the relevant policy or document.

Avoid encoding long retention policy prose directly into every column description.

---

## Documentation and Authorization

Database documentation may identify data ownership or sensitivity.

It should not attempt to duplicate the complete application authorization policy.

For example:

```text
Contains tenant-owned invoices.
```

is appropriate.

A full permission matrix belongs in authorization documentation.

---

## Documentation and Business Rules

A table description may mention durable invariants.

Complex domain behavior belongs in domain documentation or code.

Avoid turning the database reference into the only location where business rules are explained.

---

## Domain Documentation Links

Generated table references may eventually link to domain documentation.

Conceptually:

```text
Owner: Orders

See:
docs/domains/orders/
```

when domain documentation exists.

---

## API Documentation Links

A database object should not be assumed to map directly to an API resource.

Generated documentation should avoid inventing such links unless canonical metadata defines the relationship.

---

## Code Navigation

Future tooling may link schema objects to:

```text
repository implementations
queries
repositories
domain owners
```

This can significantly improve AI and human navigation.

Such links should derive from reliable metadata or code analysis.

---

## Schema Documentation Completeness

The current reference generator validates required metadata for application-owned tables, columns, enums, constraints, and indexes against freshly migrated PostgreSQL. Extend that check when new object types or semantics are introduced.

Potential requirements include:

```text
every application-owned table has description and owner

every application-owned column has description

sensitive columns have classification

every trigger has purpose

every view has purpose
```

---

## Completeness Is Not Verbosity

A requirement that every column has documentation does not imply every description should be long.

For example:

```text
created_at

Creation time of the record.
```

may be sufficient when semantics are conventional and consistent.

The goal is completeness of meaning, not word count.

---

## Conventional Fields

Repeated conventional fields may use concise standardized descriptions.

Potential examples:

```text
created_at
updated_at
version
```

If semantics differ in one table, that difference must be explicit.

---

## Generated Standard Descriptions

Some structural conventions may eventually allow generated descriptions.

Use this only where semantics are truly standardized.

Do not generate misleading prose merely to satisfy completeness checks.

---

## Missing Meaning Is Better Detected Than Invented

If tooling cannot determine semantic meaning reliably, it should require authored metadata.

It should not invent a description such as:

```text
customer_id is the customer ID.
```

and pretend the schema is documented.

---

## Documentation Validation

CI validates the current database documentation through `pnpm references:check` and the portal's derived view through `pnpm docs:references:check`.

Potential checks include:

```text
missing descriptions
missing owners
missing classifications
stale generated docs
invalid references
duplicate metadata
```

---

## Generated Documentation Drift

A canonical validation workflow may regenerate database docs and compare results.

If generated files are committed, CI should detect stale output.

If generated dynamically, CI should verify generation succeeds.

---

## Schema Drift and Documentation Drift

Schema drift and documentation drift are related but distinct.

```text
schema drift
    → database differs from repository schema

documentation drift
    → generated/reference docs differ from canonical schema metadata
```

Both are defects.

---

## Documentation Build Failure

If canonical schema metadata cannot generate valid documentation, the change should fail validation once this tooling exists.

Documentation generation is part of the database build pipeline.

---

## Database Documentation in Pull Requests

Schema-changing pull requests should make documentation impact visible.

Ideally reviewers should be able to inspect:

```text
schema diff
migration
generated documentation diff
```

together.

---

## Schema Diff Review

A schema diff is especially useful for reviewing:

```text
nullability changes
constraint changes
relationship changes
classification changes
```

Tooling should make these changes clear where possible.

---

## Classification Diff

Changes such as:

```text
INTERNAL → CONFIDENTIAL
```

or:

```text
CONFIDENTIAL → PUBLIC
```

are security-significant.

A future schema-review tool should make classification changes prominent.

---

## Documentation Review

Reviewers should ask:

```text
Does this description explain semantics?

Is ownership correct?

Is null meaning clear?

Is classification correct?

Does a hidden side effect exist?

Can this information be derived instead of duplicated?
```

---

## AI Agent Requirements

Before modifying an application-owned database object, an AI agent should inspect:

```text
current schema
object description
owner
classification
constraints
relationships
migration history
```

where available.

---

## AI and Missing Documentation

An AI agent must not guess non-obvious database semantics when documentation is missing.

It should infer only when evidence in code and schema is strong.

If a change depends on uncertain semantics, that uncertainty is itself a documentation defect.

---

## AI and New Columns

When adding a column, an AI agent should provide:

```text
description
null semantics where applicable
classification
ownership through table/domain
unit where applicable
```

as part of the schema change.

---

## AI and Sensitive Data

If a new column appears to contain:

```text
personal data
credentials
financial data
private content
```

an AI agent should evaluate classification before treating the schema change as complete.

---

## AI and Generated Documentation

AI agents should not manually modify generated database documentation.

They should modify canonical schema metadata and regenerate.

---

## AI and Schema Navigation

The desired AI workflow is:

```text
domain concept
    ↓
schema owner
    ↓
table documentation
    ↓
columns / constraints / relationships
    ↓
queries / persistence code
    ↓
migration history when needed
```

This reduces speculative code generation.

---

## Documentation Metadata Checklist

For every application-owned table, determine:

1. What is its purpose?
2. Which domain owns it?
3. Is it canonical or derived?
4. Does it have unusual lifecycle semantics?
5. Does it contain sensitive data?
6. Does it require links to broader documentation?

---

## Column Documentation Checklist

For every application-owned column, determine:

1. What does the value mean?
2. Is the type sufficient to communicate the semantics?
3. What does `NULL` mean, if allowed?
4. Is there a unit?
5. Is it derived?
6. Is it public or internal identifier data?
7. What is its data classification?
8. Does it contain personal or restricted data?
9. Does it have a non-obvious default?
10. Does it need additional prose?

---

## Constraint Documentation Checklist

For each significant constraint, determine:

1. Which invariant does it protect?
2. Is the purpose obvious from its name and expression?
3. Does violation map to an application-level error?
4. Is the constraint domain-significant?
5. Does it require additional description?

---

## Index Documentation Checklist

For each significant index, determine:

1. Which query or invariant requires it?
2. Is the purpose obvious structurally?
3. Is it specialized or partial?
4. Does it have operational implications?
5. Should its reason be documented explicitly?

---

## View Documentation Checklist

For every application-owned view, determine:

1. What does it represent?
2. Which domain owns it?
3. Which tables are canonical sources?
4. Who consumes it?
5. Is it a compatibility boundary?
6. Can its data be stale?

---

## Trigger Documentation Checklist

For every application-owned trigger, determine:

1. What event activates it?
2. What state does it change?
3. Why is a trigger appropriate?
4. Can it invoke further hidden behavior?
5. How is it tested?
6. How can a contributor discover the side effect?

---

## Function and Procedure Checklist

For every application-owned function or procedure, determine:

1. What does it do?
2. Is it read-only or state-changing?
3. Which domain owns it?
4. What are its inputs and outputs?
5. What side effects occur?
6. What transaction assumptions exist?
7. Which application code depends on it?

---

## Common Anti-Patterns

The following patterns are prohibited or strongly discouraged.

---

### Table Without Owner

Avoid.

---

### Table Description Repeats Table Name

```text
users

Stores users.
```

Avoid.

---

### Column Description Repeats Identifier

```text
email

User email.
```

Avoid when additional semantics matter.

---

### Undocumented Null Meaning

Avoid for non-obvious nullable fields.

---

### Undocumented Unit

Avoid for ambiguous quantities.

---

### Sensitive Field Without Classification

Avoid once classification metadata is implemented.

---

### Undocumented Trigger

Prohibited.

---

### Undocumented Procedure With Side Effects

Prohibited.

---

### Manually Maintained Structural Reference

Avoid when it can be generated from schema.

---

### Generated Documentation Edited by Hand

Prohibited.

---

### Architecture Rationale Hidden Only in Schema Comment

Avoid.

Use ADR or authored documentation for significant rationale.

---

### Business Rules Hidden Only in Database Reference

Avoid.

Domain rules should remain discoverable from domain ownership.

---

### Parsing Security Policy From Free-Form Comments

Avoid.

Use structured metadata where enforcement depends on it.

---

### Documentation Generated From Naming Alone

Avoid when semantic meaning cannot be inferred safely.

---

## Schema Documentation Requirements

The current PostgreSQL/Prisma implementation follows these requirements. Apply them to new application-owned objects as they appear:

1. Every application-owned table requires canonical documentation.
2. Every application-owned column requires canonical documentation.
3. Every application-owned table must have identifiable domain ownership.
4. Structural database facts should be generated from the canonical schema where practical.
5. Semantic descriptions should live close to the canonical schema where practical.
6. Nullable fields should document non-obvious null semantics.
7. Quantitative fields should document units when ambiguous.
8. Fields need schema-adjacent machine-readable classification; strengthen controls for newly sensitive classes according to security policy.
9. Every application-owned view and materialized view requires documented purpose.
10. Every application-owned function and procedure requires documented purpose.
11. Every application-owned trigger requires documented activation and side effects.
12. Non-obvious constraints and indexes should document their purpose.
13. Generated database documentation must not be edited manually.
14. Current schema documentation must describe current truth rather than development history.
15. Migration history must not be required to understand current database semantics.
16. Complex architectural rationale should live in authored docs or ADRs rather than schema comments alone.
17. Database documentation examples must use synthetic data.
18. Schema changes and corresponding semantic documentation should change together.
19. Missing application-owned object documentation must fail repository validation where the current generator covers that object type; extend coverage with new types.
20. Database documentation should be optimized for both human navigation and machine-readable AI investigation.

---

## Remaining Implementation Decisions

The current [schema metadata](../../apps/api/prisma/schema-metadata.json), Markdown [generated output](../generated/database/approval-requests.md), PostgreSQL-backed generator, output location, and completeness checks are implemented. The remaining optional mechanisms depend on real needs:

```text
database-native comment strategy
schema manifest format
ER diagram tooling
code-to-schema linking
```

These choices should follow the selected database engine, ORM or query tooling, and documentation stack.

Significant decisions should be captured through ADRs.

---

## Related Documentation

The [current generated reference](../generated/database/approval-requests.md) and [Approval Request business specification](../domains/approval-request.md) complement this policy. [Living documentation](../architecture/living-documentation.md) defines the navigable human presentation.

Implementation-specific database documentation should reference this policy rather than redefine documentation requirements independently.

---

## Summary

Database documentation exists to make durable state understandable.

The intended model is:

```text
canonical schema
    +
structured semantic metadata
        ↓
generated current database reference
        +
authored architectural documentation
```

Orion prefers:

```text
canonical metadata over duplicated prose

generated structure over manually maintained reference

semantic descriptions over restating names

explicit ownership over anonymous tables

machine-readable classification over hidden sensitivity

discoverable side effects over undocumented triggers
```

A contributor should not need to reverse engineer application code to understand what a table represents.

An AI agent should not need to guess what a column means.

A migration should not be the only documentation for current schema semantics.

The database should be able to explain its structure, ownership, and important behavior from canonical sources.


## Database Documentation

Every application-owned table and column should have canonical documentation.

Documentation should explain semantics that are not obvious from the name and type.

This includes:

```text
purpose
ownership
meaning
classification where relevant
important constraints
relationships
```

---

## Table Documentation

Each table should document:

```text
purpose
owner
important lifecycle behavior
important relationships
```

Documentation should not merely restate the table name.

---

## Column Documentation

Every column should have canonical documentation appropriate to its semantics.

A trivial field may need only a concise description.

A complex field may require:

```text
units
state meaning
classification
null semantics
source
```

---

## Database Objects Beyond Tables

Every application-owned:

```text
view
materialized view
function
procedure
trigger
```

should document its purpose and behavior.

These objects often contain non-obvious logic.

---

## Database-Native Comments

Where useful, database-native comments or schema metadata should be considered a canonical source for database documentation.

This can keep documentation close to the schema and allow generated references.

The exact mechanism depends on tooling.

---

## Generated Database Documentation

The desired long-term model is:

```text
canonical schema metadata
        ↓
documentation generator
        ↓
docs/generated/database/
```

Generated documentation should not be edited manually.

---

## Authored Database Documentation

Authored documentation should explain concepts that cannot be inferred reliably from schema metadata.

Examples include:

```text
ownership rationale
complex lifecycle
transaction strategy
cross-domain access
migration constraints
```

---

## Documentation Drift

Database documentation that does not match the schema is harmful.

Where practical, CI should validate generated documentation against the canonical schema.

---

## Database Introspection

AI agents can inspect current database structure through the migrated schema, schema metadata, and generated Markdown. The navigable human interface does not replace those sources.

The intended investigation flow is:

```text
business concept
    ↓
domain documentation
    ↓
table
    ↓
columns / constraints / relationships
    ↓
migration history
```

---
