# API Principles

[Documentation index](../README.md) · [Validation availability](../validation.md)

Governing decisions: [ADR-0004](../adr/0004-select-fastify-as-the-backend-http-framework.md), [ADR-0007](../adr/0007-establish-api-contract-openapi-sdk-and-configuration-schema-strategy.md). Accepted choices are distinct from implemented tooling.

## Read for this change

- [Canonical API Contract](#canonical-api-contract)
- [Validation](#validation)
- [Pagination](#pagination)
- [Idempotency](#idempotency)
- [Authentication](#authentication)
- [New API Operation Checklist](#new-api-operation-checklist)

Related policy: [error contract](error-contract.md), [versioning](versioning.md), [authentication](../security/authentication.md), [authorization](../security/authorization.md), [delivery and side effects](../architecture/delivery-and-side-effects.md).

## Purpose

This document defines the API design principles used by Orion.

Its goals are to ensure that APIs are:

- explicit;
- stable where compatibility matters;
- secure;
- predictable;
- validated;
- observable;
- independent from persistence implementation;
- understandable by humans and AI agents;
- suitable for machine-readable contracts and generated clients;
- evolvable without unnecessary breaking changes.

An API is an application boundary.

It exposes capabilities to consumers.

It must not be treated as a direct serialization of internal implementation.

This document is technology-agnostic.

Fastify, HTTP/JSON, TypeBox, generated OpenAPI, and the thin SDK are implemented for the reference feature under ADR-0004 and ADR-0007. Gateways and other explicitly deferred mechanisms remain application decisions. [Living documentation](../architecture/living-documentation.md) owns the human-facing presentation of the existing machine-readable contract.

This document complements:

- [docs/architecture/application-boundaries.md](../architecture/application-boundaries.md);
- [docs/architecture/dependency-rules.md](../architecture/dependency-rules.md);
- [docs/architecture/error-handling.md](../architecture/error-handling.md);
- [docs/architecture/versioning-and-compatibility.md](../architecture/versioning-and-compatibility.md);
- [docs/security/authentication.md](../security/authentication.md);
- [docs/security/authorization.md](../security/authorization.md);
- [docs/database/principles.md](../database/principles.md);
- [docs/architecture/testing-strategy.md](../architecture/testing-strategy.md).

---

## Core Principle

An API exposes application capabilities through explicit contracts.

The intended model is:

```text
external input
    ↓
transport boundary
    ↓
validation
    ↓
authentication / authorization
    ↓
application operation
    ↓
domain / persistence / integrations
    ↓
explicit response contract
```

The API contract should remain distinct from:

```text
database schema
ORM model
domain entity
internal service interface
UI model
```

These representations may overlap when their semantics genuinely match.

They should not be assumed identical by default.

---

## API as a Contract

An API contract defines what a consumer may rely on.

Potential contract elements include:

```text
operation
route or method
request shape
response shape
error shape
authentication requirements
authorization semantics
idempotency behavior
pagination behavior
compatibility guarantees
```

Once external consumers depend on these elements, changing them may require compatibility planning.

---

## API Ownership

Every API operation should have identifiable ownership.

Ownership should answer:

```text
Which domain or capability owns this operation?

Where is its business behavior implemented?

Who may change its semantics?

Which contract is canonical?
```

The HTTP framework or transport package does not own business semantics.

---

## Transport Is an Adapter

HTTP, RPC, WebSocket, GraphQL, or another protocol is a delivery mechanism.

Transport code should primarily handle concerns such as:

```text
routing
serialization
input validation
authentication integration
authorization integration
request correlation
protocol status mapping
headers
response serialization
```

Business rules should not depend unnecessarily on transport concepts.

---

## HTTP Is Not the Domain

Domain logic should not depend on:

```text
HTTP status codes
HTTP headers
request objects
response objects
framework decorators
```

unless the behavior itself is transport-specific.

Prefer:

```text
transport
    ↓
application operation
    ↓
domain
```

rather than:

```text
domain
    ↓
HTTP framework
```

---

## Operation-Oriented Design

API design should begin from meaningful application capabilities.

Ask:

```text
What is the consumer trying to accomplish?
```

not merely:

```text
Which database table exists?
```

For example:

```text
cancel order
```

may be a clearer capability than exposing arbitrary updates to an `orders` row.

---

## Resource-Oriented Design

Resource-oriented APIs are useful when the domain naturally exposes resources.

Examples may include:

```text
users
orders
invoices
documents
```

Resources should represent application concepts rather than tables by default.

---

## Commands and Actions

Not every operation maps cleanly to generic CRUD.

Examples include:

```text
cancel order
approve invoice
resend invitation
rotate credential
publish document
```

Explicit actions may be clearer than generic update endpoints when behavior carries important semantics.

---

## Avoid CRUD by Reflex

Do not automatically create:

```text
create
read
update
delete
```

for every persisted entity.

Ask whether each operation represents a real supported capability.

A database table is not automatically an API resource.

---

## Generic Update Endpoints

Generic update contracts such as:

```text
PATCH /users/{id}
{
    ...arbitrary fields
}
```

can create security and domain problems.

They may accidentally expose:

```text
role
permission
tenant
status
security settings
internal fields
```

Prefer explicit update contracts for meaningful responsibilities.

---

## Mass Assignment

API implementations must not blindly map external objects into persistence models.

Avoid:

```text
database.update(request.body)
```

External input should be explicitly validated and mapped.

This helps prevent mass-assignment vulnerabilities.

---

## Contract-First Thinking

API behavior should have an explicit contract before internal implementation details become externally visible.

This does not require a strict specification-first development workflow.

It requires deliberate boundary design.

---

## Canonical API Contract

[ADR-0007](../adr/0007-establish-api-contract-openapi-sdk-and-configuration-schema-strategy.md#canonical-contract-schemas) selects wire-oriented TypeBox 1.x schemas plus route metadata, Fastify validation/serialization, generated OpenAPI (3.1.x initially), stable unique `operationId` values, and openapi-typescript with openapi-fetch for the default thin TypeScript client. Generated artifacts remain derived; client-side successful-response revalidation is not enabled automatically. Internal domain types need not become TypeBox schemas.

The current API maintains executable TypeBox contracts and route metadata; [OpenAPI 3.1](../generated/api/openapi.json) is generated from them and checked for drift.

Potential technologies may include:

```text
OpenAPI
JSON Schema
typed schema definitions
RPC schema
```

The specific representation is deferred.

The key principle is:

```text
one canonical contract
    ↓
validation
documentation
client generation
tests
```

where practical.

---

## Contract Duplication

Avoid separately maintaining:

```text
runtime validator
TypeScript interface
OpenAPI schema
SDK type
documentation table
```

when these can derive from one canonical definition.

Duplicated contract definitions drift.

---

## Request Contracts

Every external input should have an explicit request contract.

The contract should define, where relevant:

```text
fields
types
required fields
optional fields
constraints
formats
nested structures
allowed values
```

Unknown fields should have deliberate behavior.

---

## Response Contracts

Responses should be deliberately shaped.

Do not serialize internal objects automatically.

Prefer:

```text
application result
    ↓
response mapping
    ↓
public contract
```

This prevents accidental exposure of internal fields.

---

## Persistence Models Are Not API Contracts

Avoid:

```text
return ormUser
```

when the ORM object contains fields such as:

```text
passwordHash
internalFlags
deletedAt
providerMetadata
```

Even if sensitive fields are excluded today, direct coupling creates future risk.

---

## Domain Models Are Not Automatically API Contracts

Domain entities may contain:

```text
behavior
internal state
invariants
implementation-specific representation
```

A public contract should expose only what consumers require.

---

## Internal Models May Change Faster

Keeping external contracts separate allows internal refactoring without forcing API changes.

For example:

```text
database normalization
domain refactor
ORM replacement
```

should not automatically break consumers.

---

## Input Is Untrusted

All external input must be treated as untrusted.

This includes:

```text
request body
query parameters
path parameters
headers
cookies
webhook payloads
uploaded files
client-provided identifiers
```

Validation occurs at trusted boundaries.

---

## Validation

Validation should verify that input satisfies the transport contract before application logic relies on it.

Potential checks include:

```text
type
required fields
length
format
allowed values
structural relationships
```

Validation does not replace domain rules.

---

## Contract Validation vs Domain Validation

Contract validation answers:

```text
Is this input structurally acceptable?
```

Domain validation answers:

```text
Is this operation valid according to business rules?
```

For example:

```text
quantity must be integer > 0
```

may be contract validation.

```text
ordered quantity exceeds available allocation
```

may be a domain rule.

---

## Authorization Is Not Validation

A request can be structurally valid and still unauthorized.

These concerns must remain distinct.

---

## Normalization

Input normalization may be appropriate at boundaries.

Examples:

```text
trim controlled textual identifiers
normalize case where semantics require it
canonicalize known formats
```

Normalization must reflect domain semantics.

Do not silently modify user content merely for convenience.

---

## Unknown Fields

Contract behavior for unknown fields should be deliberate.

Possible strategies include:

```text
reject
ignore
preserve
```

Rejecting unknown fields can catch client mistakes.

Ignoring them may improve forward compatibility in some contracts.

The choice should be consistent with compatibility requirements.

---

## Required vs Optional

A field being optional should have meaningful semantics.

Avoid making fields optional merely to simplify evolution.

Optional may mean:

```text
consumer may omit value
```

which is different from:

```text
consumer sends null
```

These semantics should remain explicit.

---

## Missing vs Null

Contracts should distinguish missing values and explicit null values where the distinction matters.

For example:

```text
field omitted
    → do not change value

field = null
    → clear value
```

may be valid for an update contract.

Do not let framework defaults define this semantics accidentally.

---

## String Length

Text input should use explicit reasonable limits where practical.

Unbounded strings may create:

```text
storage issues
logging issues
abuse opportunities
unexpected downstream behavior
```

Limits should follow product requirements rather than arbitrary tiny values.

---

## Numeric Bounds

Numeric fields should define meaningful ranges.

Examples:

```text
quantity > 0
percentage between 0 and 100
page size <= maximum
```

Database constraints may additionally protect durable state.

---

## Enumeration Values

Bounded contract values should use explicit enums or equivalent schemas.

Avoid arbitrary strings when only a fixed set is valid.

---

## Date and Time Contracts

API date/time formats should have explicit semantics.

Distinguish:

```text
absolute instant
calendar date
local time
timezone
duration
```

Serialization should be standardized once the concrete contract technology is selected.

---

## Money Contracts

Monetary values require explicit:

```text
amount semantics
currency
precision
```

Avoid ambiguous floating-point contracts for exact financial amounts.

---

## Identifiers

Public identifiers should have stable semantics.

Do not expose database identifiers accidentally simply because they are available.

A resource ID should represent the API resource identity expected by consumers.

---

## Opaque Identifiers

Opaque identifiers are generally useful because consumers should not infer internal structure.

An identifier should not encode sensitive data.

Opaque identifiers still require authorization.

---

## Client-Generated Identifiers

Some APIs may allow clients to generate identifiers.

This can be useful for:

```text
offline creation
idempotency
distributed creation
```

Such behavior should be intentional.

---

## Idempotency

Operations vulnerable to duplicate submission or uncertain outcomes may require idempotency.

Examples include:

```text
payment creation
order submission
external side-effecting operation
```

Idempotency semantics should follow:

- [docs/database/transactions-and-concurrency.md](../database/transactions-and-concurrency.md)

---

## HTTP Method Idempotency

Protocol-level method semantics may guide API design.

However, Orion should reason about actual side effects rather than method names alone.

An implementation of an ostensibly idempotent operation can still violate idempotency.

---

## Idempotency Keys

Where idempotency keys are supported, the API contract should define:

```text
where the key is provided
scope
reuse behavior
retention expectations
different-payload behavior
```

Consumers should not need to guess.

---

## Repeated Requests

The API should define the result of repeating important operations.

Possible semantics include:

```text
same logical result
already-completed result
conflict
```

The choice should match domain behavior.

---

## Optimistic Concurrency

Public update APIs may support optimistic concurrency when consumers must avoid overwriting newer state.

Potential mechanisms include:

```text
version
ETag
conditional request
```

The exact protocol is deferred.

---

## Stale Updates

When optimistic concurrency is used, stale updates should fail with stable conflict semantics.

Consumers should be able to distinguish:

```text
invalid input
```

from:

```text
resource changed since you read it
```

---

## Authentication

Protected API operations must derive identity through the trusted authentication architecture defined in:

- [docs/security/authentication.md](../security/authentication.md)

Authentication requirements should be part of the API contract.

---

## Authorization

Protected operations must apply authorization defined by:

- [docs/security/authorization.md](../security/authorization.md)

A consumer cannot authorize itself by sending:

```text
role
permission
userId
tenantId
```

without trusted verification.

---

## Anonymous APIs

Public endpoints should be explicitly public.

Anonymous behavior must not result from accidentally missing authentication enforcement.

---

## Sensitive APIs

Operations involving:

```text
credentials
personal data
security settings
financial data
administration
```

may require stronger authentication or authorization.

The contract should make security requirements discoverable where practical.

---

## Tenant Context

Multi-tenant APIs must treat tenant selection as an authorization concern.

A path such as:

```text
/tenants/{tenantId}/orders
```

does not prove the caller belongs to the tenant.

---

## Request Context

Transport infrastructure may construct safe context such as:

```text
principal
requestId
traceId
tenant context
locale
```

Application operations should receive only the context they require.

---

## Correlation

API requests should participate in observability correlation.

Potential identifiers include:

```text
requestId
traceId
errorId
```

These should follow:

- [docs/reliability/observability.md](../reliability/observability.md)

---

## Error Contract

API errors must use stable structured semantics.

They should follow:

- [docs/architecture/error-handling.md](../architecture/error-handling.md)

and the future:

- [docs/api/error-contract.md](error-contract.md)

Consumers should rely on stable error codes rather than parsing messages.

---

## HTTP Status Codes

For HTTP APIs, status codes should represent broad protocol semantics.

Examples may include:

```text
200 / 201
400
401
403
404
409
429
500
502 / 503
```

The exact mapping will be defined in the error contract.

Status code alone should not carry all application semantics.

---

## Public Error Messages

Error messages are for humans.

They must be:

```text
safe
understandable
non-sensitive
```

Clients must not depend on exact message text for application logic.

---

## Error Details

Structured error details may provide safe machine-readable context.

For example:

```text
field validation issues
conflict version
retry information
```

Detail schemas must be explicit.

Avoid arbitrary internal data in public errors.

---

## Internal Errors

Unexpected internal errors should not expose:

```text
stack traces
SQL
provider payloads
internal hostnames
credentials
```

The public contract should provide a safe generic error plus correlation identifiers where appropriate.

---

## Not Found vs Permission Denied

Some protected resources may intentionally return equivalent not-found behavior to unauthorized callers.

This avoids leaking resource existence.

The choice should follow authorization and information-disclosure requirements.

---

## Collection APIs

Collection operations should define behavior for:

```text
pagination
filtering
sorting
search
empty results
```

rather than allowing framework defaults to become accidental contracts.

---

## Pagination

Large collections should use bounded pagination.

Unbounded endpoints such as:

```text
GET /users
    → every user ever created
```

do not scale safely.

---

## Page Size

Pagination should define:

```text
default size
maximum size
```

The values should be based on actual payload and performance characteristics.

---

## Offset Pagination

Offset-based pagination may be appropriate for:

```text
small collections
administrative views
stable low-volume data
```

It can become inefficient or inconsistent for large changing datasets.

---

## Cursor Pagination

Cursor-based pagination may be preferable for large or frequently changing collections.

A cursor should be treated as an opaque API value.

Consumers should not depend on its internal representation.

---

## Cursor Security

Cursors should not expose sensitive internal data unnecessarily.

If a cursor contains serialized state, integrity protection or opaque encoding may be required.

---

## Stable Ordering

Pagination requires a deterministic ordering.

For example:

```text
createdAt DESC, id DESC
```

may provide stable tie-breaking.

Ordering semantics should be explicit.

---

## Filtering

Supported filters should be explicit.

Avoid accepting arbitrary database field names as public filters.

A filter contract is an API decision, not an ORM passthrough.

---

## Filter Validation

Filter values must be validated.

Unknown filter operators or fields should have deliberate behavior.

---

## Sorting

Supported sort fields should be allowlisted.

Avoid:

```text
ORDER BY <untrusted client string>
```

or generic persistence exposure.

Sorting is both a contract and security concern.

---

## Search

Search semantics should be explicit.

A search endpoint should define whether behavior means:

```text
exact matching
prefix matching
full-text search
fuzzy search
```

Consumers should not rely on accidental database implementation.

---

## Query Complexity

APIs allowing highly flexible queries can create operational risk.

Complexity should be bounded through mechanisms appropriate to the chosen API style.

Do not expose arbitrary query capabilities merely because a framework supports them.

---

## Response Size

Responses should be reasonably bounded.

Large responses affect:

```text
latency
memory
network cost
client performance
```

Pagination, projections, or specialized export flows may be appropriate.

---

## Sparse Fieldsets

Allowing consumers to select fields can reduce payload size.

It also increases contract complexity.

Introduce only if actual consumers benefit.

---

## Includes and Expansions

APIs may optionally support including related resources.

This must be bounded.

Avoid query patterns where a client can request arbitrary deep relationship expansion.

---

## N+1 API Behavior

API design should consider persistence cost.

A convenient endpoint that causes hundreds of database queries is still poor design.

Observability and integration testing should make expensive patterns discoverable.

---

## Command Responses

Action-style operations should return information useful to the consumer.

Possible responses include:

```text
updated resource
operation result
accepted job
no content
```

The choice should match semantics.

---

## Asynchronous Operations

Some API operations may not complete synchronously.

Potential pattern:

```text
request
    ↓
operation accepted
    ↓
job executes
    ↓
consumer checks status / receives event
```

The contract must distinguish:

```text
accepted
```

from:

```text
completed
```

---

## Long-Running Operations

Long-running operations may require a resource representing operation state.

Conceptually:

```text
operationId
status
result
failure
```

Do not hold an HTTP request open indefinitely merely because work exists.

---

## Request Timeouts

API operations should fit within meaningful runtime timeout expectations.

Work that cannot reliably complete within the request lifecycle may require asynchronous execution.

---

## Cancellation

Transport cancellation may indicate the caller no longer wants the result.

It does not necessarily mean durable work should or can be rolled back.

Cancellation semantics should be explicit for long-running operations.

---

## File Uploads

File-upload APIs require explicit contracts for:

```text
maximum size
allowed media types
ownership
processing state
security scanning where required
```

File contents must not be captured in telemetry.

---

## File Downloads

Download authorization must be enforced even when storage uses pre-signed or delegated URLs.

Temporary access mechanisms should have bounded scope and lifetime.

---

## Pre-Signed URLs

If external object storage uses pre-signed URLs, these URLs may grant temporary access and should be treated accordingly.

They should not be logged indiscriminately.

---

## Webhooks

Outbound webhook contracts are external APIs.

They require:

```text
schema
authentication
retry policy
delivery semantics
versioning
```

Receiving systems may depend on them for long periods.

---

## Inbound Webhooks

Inbound provider webhooks are untrusted external inputs until authenticated and validated.

Processing should account for:

```text
duplicate delivery
out-of-order delivery
replay
invalid payload
```

---

## Webhook Acknowledgement

Webhook handlers should generally acknowledge according to provider requirements.

Long processing may need to be decoupled from the initial HTTP request.

---

## Webhook Retries

Providers may retry delivery automatically.

Handlers should understand and document duplicate semantics.

---

## Events vs APIs

Synchronous API contracts and asynchronous event contracts serve different purposes.

An event communicates that something happened.

An API request asks for something to happen or be retrieved.

Do not treat them as interchangeable.

---

## API and Event Model Separation

An API response schema should not automatically become an event schema.

They may evolve under different compatibility requirements.

---

## SDKs

Client SDKs should derive from canonical contracts where practical.

Generated SDKs are replaceable representations.

They are not the source of truth.

---

## SDK Boundaries

SDKs may contain:

```text
transport client
request/response types
authentication integration hooks
error decoding
```

They should not contain backend-only business logic or persistence concerns.

---

## Generated SDK Code

Generated SDK code should be clearly identified.

Manual edits should be prohibited unless the generator explicitly supports protected extension points.

---

## SDK Compatibility

SDK versioning may differ from API versioning.

A new SDK release does not automatically imply a new API version.

---

## Browser SDKs

Client SDKs intended for browsers must not contain server-only secrets or privileged configuration.

---

## Mobile SDKs

Mobile clients may remain deployed long after a backend release.

Backend compatibility must account for lagging mobile versions where applicable.

---

## API Documentation

Public and internal API documentation should derive from canonical contracts where practical.

Generated documentation may include:

```text
operations
request schemas
response schemas
error schemas
authentication requirements
examples
```

---

## Documentation Examples

Examples should use synthetic data.

They must not contain:

```text
real credentials
production identifiers
real personal data
```

---

## Examples Are Part of Developer Experience

Good examples should show realistic usage without becoming separate sources of truth.

They should be validated against the canonical contract where tooling supports it.

---

## Machine-Readable Documentation

Machine-readable contracts are essential for Orion's AI-first goals.

An AI agent should be able to inspect the API without reverse engineering controller implementations.

---

## AI-Friendly API Navigation

The desired workflow is:

```text
operation
    ↓
canonical API contract
    ↓
application owner
    ↓
authorization policy
    ↓
implementation
    ↓
tests
```

---

## Public vs Internal APIs

Not every API requires the same compatibility guarantees.

Potential categories include:

```text
public external API
partner API
internal service API
application backend API
local development API
```

Compatibility expectations should be explicit.

---

## Internal Does Not Mean Unimportant

Internal APIs can still have many consumers.

An internal API should not be changed recklessly merely because it is not public.

The real question is:

```text
Which consumers depend on this contract?
```

---

## Consumer Inventory

For important APIs, it should be possible to identify major consumers.

Examples:

```text
web
mobile
desktop
external partner
worker
```

This informs compatibility decisions.

---

## Backward Compatibility

Changes should preserve existing consumer behavior when compatibility is required.

Potentially compatible changes may include:

```text
add optional response field
add optional request field
add new operation
```

depending on consumer behavior and serialization technology.

---

## Potentially Breaking Changes

Breaking changes may include:

```text
remove field
rename field
change field type
make optional field required
change error code semantics
change pagination behavior
change authorization requirements
```

Some additions can also be breaking if clients reject unknown values.

Compatibility must be evaluated, not assumed.

---

## Enum Expansion

Adding a new enum value may break clients that assume exhaustive known values.

This is especially relevant for generated clients and mobile applications.

Enum compatibility strategy should be explicit.

---

## Versioning

API versioning should be introduced only when compatibility cannot be preserved reasonably.

Do not create version numbers preemptively for every internal refactor.

Detailed rules belong in:

- [docs/api/versioning.md](versioning.md)

---

## Compatibility Before Versioning

Prefer compatible evolution when practical.

Versioning creates:

```text
parallel contracts
migration burden
documentation complexity
testing complexity
support cost
```

A new version should pay for that complexity.

---

## Deprecation

Breaking behavior should normally have a deprecation path when consumers cannot migrate atomically.

A deprecation should define:

```text
what is deprecated
replacement
timeline or removal condition
affected consumers
```

---

## Deprecated Fields

Deprecated fields should remain functional according to the compatibility promise until removal.

Marking a field deprecated while silently changing its meaning is not safe evolution.

---

## Mobile Compatibility

Mobile applications may remain in use for months after release.

APIs consumed by mobile clients may therefore require longer compatibility windows than web clients deployed together with the backend.

---

## Web Compatibility

A web application deployed atomically with the backend may allow a tighter compatibility model.

This should still be deliberate.

---

## Rolling Backend Compatibility

During rolling deployment, two backend versions may coexist.

Internal calls, events, and database usage may need temporary compatibility even if external clients update immediately.

---

## API Deprecation Telemetry

Deprecated contract usage may be observable.

This can help determine when legacy behavior is safe to remove.

Telemetry must avoid sensitive request content.

---

## API Change Review

API changes should be reviewed for:

```text
contract impact
consumer impact
security
authorization
compatibility
error semantics
observability
documentation
```

---

## Request Body Compatibility

Adding required request fields is generally breaking for existing consumers.

Prefer optional introduction followed by coordinated migration when necessary.

---

## Response Compatibility

Removing or renaming response fields is generally breaking.

Changing field meaning without changing shape may be even more dangerous because consumers may continue operating incorrectly.

---

## Semantic Compatibility

Compatibility is not only structural.

For example:

```text
status = "completed"
```

changing meaning from:

```text
payment completed
```

to:

```text
shipping completed
```

is a breaking semantic change even if the type remains `string`.

---

## Error Compatibility

Stable public error codes are part of the API contract.

Do not:

```text
reuse old error code for different meaning
```

or remove widely consumed error codes without compatibility planning.

---

## Authorization Compatibility

Changing an operation from:

```text
ordinary user allowed
```

to:

```text
administrator only
```

is a behavior change.

It may be necessary for security, but it should still be treated as contract-impacting.

---

## Security Fixes and Compatibility

Security may require immediate breaking changes.

Compatibility does not override security.

When a contract is unsafe, protection takes priority.

The change should still be documented and communicated appropriately.

---

## Rate Limiting

APIs exposed to abuse or expensive workloads may require rate limiting.

Rate limits should be based on:

```text
risk
resource cost
provider constraints
product policy
```

not arbitrary defaults.

---

## Rate-Limit Contract

When clients are expected to respond programmatically, the API should expose bounded stable retry information where appropriate.

Internal anti-abuse details should remain private.

---

## Quotas

Product quotas and technical rate limits are different concepts.

For example:

```text
100 exports per subscription month
```

is a product entitlement.

```text
10 requests per second
```

may be technical protection.

Do not conflate them.

---

## Abuse Resistance

Public APIs should consider:

```text
brute force
enumeration
resource exhaustion
large payloads
expensive queries
```

Controls should be proportional to exposure.

---

## Payload Limits

Transport infrastructure should enforce reasonable maximum payload sizes.

Different operations may have different limits.

Large file uploads should use dedicated handling.

---

## Timeout Policy

API handlers and outbound dependencies should have bounded execution.

Timeouts should produce predictable error semantics.

They must not cause unsafe automatic retries of non-idempotent operations.

---

## Retry Guidance for Consumers

The API contract should make retryability discoverable where relevant.

Consumers should not blindly retry every `5xx` response or timeout.

Idempotency and unknown outcomes matter.

---

## Cache Semantics

Some API responses may be cacheable.

Caching policy should consider:

```text
authentication
authorization
tenant
data freshness
privacy
```

Protected responses must not accidentally become public cache entries.

---

## Conditional Requests

HTTP conditional mechanisms such as ETags may eventually support:

```text
caching
optimistic concurrency
bandwidth reduction
```

They should be introduced only where useful.

---

## Localization

Stable machine-readable API semantics should remain language-independent.

Error codes should not change by locale.

Human-readable messages may be localized by:

```text
client
backend
```

depending on product architecture.

---

## API Language

Repository API identifiers and canonical descriptions should be written in English.

Product-visible localized content is a separate concern.

---

## Boolean Fields

Boolean names should express positive semantics where practical.

Prefer:

```text
isActive
```

over:

```text
isNotInactive
```

Avoid double-negative contracts.

---

## Contract Naming

Names should reflect domain semantics.

Prefer:

```text
cancellationReason
```

over:

```text
value2
```

Public names often survive longer than internal implementations.

Choose carefully.

---

## Abbreviations

Avoid unclear abbreviations in public contracts.

Established domain abbreviations may be appropriate.

Consistency matters.

---

## Request and Response Symmetry

Request and response models do not need to be symmetrical.

For example:

```text
CreateUserRequest
```

may not contain server-generated fields returned by:

```text
UserResponse
```

Do not force one model to serve both directions.

---

## Create vs Update Contracts

Create and update operations often require different schemas.

For example:

```text
email required on create
email optional on update
```

Separate contracts may be clearer than one overly optional universal schema.

---

## Read Models

Different views of the same concept may have distinct contracts.

Examples:

```text
OrderSummary
OrderDetails
OrderAdminView
```

This may improve security and payload efficiency.

Avoid excessive model proliferation without real semantic differences.

---

## Administrative APIs

Administrative APIs may expose different capabilities and response fields from ordinary user APIs.

Their stronger privilege requirements should remain explicit.

Do not merely add hidden query parameters that unlock admin behavior.

---

## Internal Debug APIs

Debug or diagnostic endpoints must not become accidental production backdoors.

If they exist, they require:

```text
authentication
authorization
safe output
environment controls
```

as appropriate.

---

## Health APIs

Health endpoints are operational contracts.

They should follow the reliability health-check policy.

They must not expose:

```text
secrets
raw configuration
internal stack traces
```

---

## Metrics APIs

Operational metrics endpoints, if exposed, require access controls appropriate to infrastructure.

They are not necessarily public product APIs.

---

## API Gateway

A gateway may eventually provide:

```text
routing
TLS termination
rate limiting
authentication support
```

A gateway does not own application authorization or business semantics by default.

---

## BFF

A Backend for Frontend may be introduced when a specific client has materially distinct composition requirements.

It is not an Orion default.

A BFF should not merely duplicate the primary backend with a different folder name.

---

## GraphQL

GraphQL may be appropriate for some consumer-driven query models.

It introduces concerns such as:

```text
query complexity
authorization at field/resolver boundaries
N+1 behavior
schema compatibility
```

Orion does not choose GraphQL by default.

---

## RPC

RPC may be appropriate for strongly typed internal operation-oriented communication.

It still requires:

```text
explicit contracts
compatibility
authentication
authorization
error semantics
```

Transport choice does not remove API design responsibilities.

---

## REST

REST-style HTTP APIs may be appropriate for resource and action-oriented capabilities.

Orion does not require strict architectural purity around REST terminology.

Clarity and stable semantics matter more than stylistic dogma.

---

## WebSocket APIs

Persistent bidirectional connections introduce:

```text
connection authentication
reauthorization
message contracts
backpressure
reconnection
ordering
```

They should be introduced only when real-time requirements justify them.

---

## Streaming APIs

Streaming responses or requests require explicit:

```text
lifecycle
cancellation
partial failure
backpressure
```

semantics.

Do not model streaming as ordinary request/response behavior accidentally.

---

## API Observability

API telemetry should expose safe operational information such as:

```text
route template
method
status
duration
requestId
traceId
error code
```

It should follow:

- [docs/reliability/observability.md](../reliability/observability.md)
- [docs/security/telemetry-redaction.md](../security/telemetry-redaction.md)

---

## Route Templates

Telemetry should prefer:

```text
/orders/{orderId}
```

over:

```text
/orders/ord_01J...
```

to reduce cardinality and sensitive identifier exposure.

---

## Request Logging

API infrastructure must not log complete request bodies by default.

Headers, cookies, query strings, and bodies may contain sensitive information.

---

## Response Logging

Complete response payloads should not be logged by default.

Responses may contain confidential data.

---

## API Metrics

Useful metrics may include:

```text
request rate
error rate
latency
rate-limit decisions
payload size distributions
```

Labels must remain bounded.

---

## Error Metrics

Prefer stable error codes or categories over arbitrary error messages as metric labels.

---

## API Traces

Important API operations should integrate with distributed tracing.

Trace context should propagate through supported outbound calls and async boundaries.

---

## API Tests

API testing should follow:

- [docs/architecture/testing-strategy.md](../architecture/testing-strategy.md)

Tests should verify relevant combinations of:

```text
validation
authentication
authorization
contract
error mapping
application behavior
```

---

## Contract Tests

Canonical API schemas should be validated against implementation.

Generated SDKs and documentation should derive from or be validated against the same source.

---

## Integration Tests

Transport integration tests should use the real request/response boundary where protocol behavior matters.

Examples include:

```text
status codes
headers
serialization
authentication middleware
```

---

## Authorization Tests

Protected operations should verify denial paths through the API boundary.

A policy unit test alone does not prove the endpoint applies the policy correctly.

---

## Validation Tests

Important validation behavior should verify:

```text
missing fields
invalid values
unknown fields
nested errors
```

according to contract semantics.

---

## Error Contract Tests

Stable errors should be tested for:

```text
code
safe message
status
details schema
correlation identifiers
```

where relevant.

---

## Compatibility Tests

When an API has compatibility commitments, tests should preserve them.

Examples may include:

```text
previous mobile client contract
deprecated field still accepted
old enum consumer compatibility
```

---

## Generated Contract Validation

CI checks the current API, generated OpenAPI, SDK, and error documentation for drift. It must continue to detect when:

```text
implementation
canonical contract
generated SDK
generated documentation
```

drift from one another.

---

## API Schema Review

Contract changes should be visible in pull requests.

A generated semantic API diff may eventually identify:

```text
field added
field removed
required status changed
enum changed
operation removed
```

This can improve compatibility review.

---

## Breaking-Change Detection

Tooling may eventually fail CI for unapproved breaking contract changes.

The exact mechanism depends on the chosen schema system.

---

## API Security Testing

Security-sensitive APIs should test:

```text
unauthorized access
cross-tenant access
mass assignment
oversized payload
invalid identifiers
restricted-field exposure
```

according to risk.

---

## API Examples Testing

Documentation examples may eventually be tested or generated from schemas.

Examples that do not conform to current contracts should be detected.

---

## Contract Ownership

The API owns its current canonical TypeBox contracts. A shared `packages/contracts` package remains conditional on actual cross-application ownership, not a prerequisite for the [Living Documentation Portal](../architecture/living-documentation.md).

---

## Contract Package Boundaries

A contract package should not depend on:

```text
database
ORM
backend framework
server secrets
UI implementation
```

It may depend on stable schema/validation primitives as needed.

---

## Server Implementation

The backend implementation may depend on canonical contracts.

Canonical contracts should not depend on backend implementation.

---

## Client Implementation

Clients may depend on:

```text
contracts
generated SDK
```

They must not depend on:

```text
server internals
database types
private application services
```

---

## API Contract Registry

As Orion matures, important contracts should be discoverable from a central machine-readable index.

Potential metadata may include:

```text
operation
owner
stability
authentication
authorization capability
request schema
response schema
errors
```

The exact format is deferred.

---

## API Operation Metadata

Conceptually:

```text
operation: orders.cancel
owner: orders
authentication: required
authorization: orders.cancel
idempotent: true
```

could support:

```text
documentation
testing
SDK generation
AI navigation
architecture checks
```

if the selected stack supports it cleanly.

---

## AI Agent Requirements

Before adding or changing an API operation, an AI agent should inspect:

```text
existing contract
operation owner
authentication requirements
authorization policy
error semantics
consumer impact
compatibility requirements
tests
```

---

## AI Must Not Expose Internal Models

An AI agent must not solve API implementation by directly serializing ORM or domain objects unless the contract explicitly defines that representation.

---

## AI and Breaking Changes

Before modifying a consumed contract, an AI agent should determine:

```text
which consumers exist
whether compatibility is promised
whether change can be additive
whether versioning is required
```

It should not introduce a new API version automatically.

---

## AI and Validation

An AI agent should use canonical request schemas rather than duplicate validation manually where the architecture supports shared schemas.

---

## AI and Authorization

An AI agent must not infer that authentication alone is sufficient for protected operations.

It should identify the authorization capability required by the operation.

---

## AI and Error Codes

An AI agent should reuse canonical registered error codes where semantics already exist.

It must not create near-duplicate error codes casually.

---

## AI and Pagination

An AI agent must not create unbounded collection endpoints for potentially large datasets.

It should evaluate pagination and maximum result size.

---

## AI and Idempotency

Before implementing a non-idempotent state-changing endpoint, an AI agent should consider:

```text
duplicate submission
client retry
timeout ambiguity
```

---

## AI and Documentation

API contract changes should update canonical machine-readable definitions so generated documentation remains current.

Manual generated-file edits are prohibited.

---

## New API Operation Checklist

Before introducing a new API operation, answer:

1. Which capability does the operation expose?
2. Which domain owns it?
3. Who consumes it?
4. Is authentication required?
5. Which authorization policy applies?
6. What is the request contract?
7. What is the response contract?
8. Which stable errors may occur?
9. Is the operation idempotent?
10. What happens if the request is repeated?
11. Is optimistic concurrency required?
12. What data classification is involved?
13. Does the operation require pagination or bounds?
14. Is the operation synchronous or asynchronous?
15. What compatibility commitment exists?
16. How will it be observed?
17. How will it be tested?
18. How will it be documented?

If these questions cannot be answered, the operation design is incomplete.

---

## New Field Checklist

Before adding an API field, answer:

1. What does the field mean?
2. Who owns its semantics?
3. Is it request, response, or both?
4. Is it required?
5. Can it be null?
6. What does omission mean?
7. What is its classification?
8. Is it safe for this consumer?
9. Is it stable enough to become a contract?
10. Could it be derived instead?
11. How does adding it affect existing clients?
12. How will it be documented?

---

## API Breaking-Change Checklist

Before introducing a breaking change, answer:

1. Which consumers are affected?
2. Why can compatible evolution not solve the problem?
3. Is the change required for security or correctness?
4. Can a deprecation period be provided?
5. Is a new API version required?
6. How will old and new contracts coexist?
7. How will usage of the old contract be measured?
8. What is the removal condition?
9. Which tests protect compatibility?
10. How will the change be communicated?

---

## Collection Endpoint Checklist

Before exposing a collection, answer:

1. Can the collection grow without bound?
2. What is the default page size?
3. What is the maximum page size?
4. What ordering is guaranteed?
5. Which filters are supported?
6. Which sorting options are supported?
7. Is cursor or offset pagination appropriate?
8. How is authorization applied across the collection?
9. Could counts or filters leak protected data?
10. What query cost does the contract allow?

---

## Common Anti-Patterns

The following patterns are prohibited or strongly discouraged.

---

### Database Table Equals API Resource by Default

Avoid.

---

### ORM Object Serialized Directly

Avoid.

---

### Request Body Passed Directly to Persistence

Prohibited.

---

### Generic Mass Update

Avoid for security- or domain-sensitive resources.

---

### Client-Provided Role Trusted

Prohibited.

---

### Client-Provided Tenant Trusted Without Authorization

Prohibited.

---

### Error Message Parsing as Contract

Prohibited.

---

### Raw Database Error as API Error

Prohibited.

---

### Stack Trace in Public Response

Prohibited.

---

### Unbounded Collection Endpoint

Avoid.

---

### Arbitrary Sort Field Passed to Database

Prohibited.

---

### Arbitrary Filter Passthrough

Avoid.

---

### Token in URL

Avoid except when an explicit protocol requires a short-lived capability.

---

### Full Request/Response Logging

Prohibited by default.

---

### New API Version for Every Breaking Internal Refactor

Avoid.

---

### Silent Semantic Change

Prohibited when consumers rely on existing meaning.

---

### Feature Flag Used as Authorization

Prohibited.

---

### Client SDK as Canonical Contract

Avoid.

SDKs should derive from canonical contracts.

---

### Generated Contract Documentation Edited Manually

Prohibited.

---

## Initial API Policy

Until stack-specific implementation exists, Orion adopts the following requirements:

1. APIs are explicit application boundaries.
2. API contracts must remain distinct from persistence models by default.
3. External input is untrusted and must be validated.
4. Contract validation, domain validation, authentication, and authorization are separate concerns.
5. Request and response schemas should be explicit.
6. Server implementations must not mass-assign untrusted request data into persistence models.
7. Public errors must use stable machine-readable semantics.
8. Clients must not depend on human-readable error messages for logic.
9. Authentication and authorization requirements must be explicit for protected operations.
10. Collection endpoints must be bounded where datasets may grow.
11. Filters and sorting must use explicit supported contracts rather than arbitrary persistence passthrough.
12. Important non-idempotent operations must consider duplicate submission and retry behavior.
13. API evolution must consider actual consumers and compatibility requirements.
14. Versioning should be introduced only when compatible evolution is insufficient.
15. API documentation and SDKs should derive from canonical contracts where practical.
16. Generated SDKs and documentation are not sources of truth.
17. Client applications must not depend on server internals or database types.
18. API telemetry must use bounded, sanitized, low-cardinality metadata.
19. Important API behavior must be protected by contract, integration, authorization, and compatibility tests where appropriate.
20. API contracts should become machine-readable and mechanically validated wherever practical.

---

## Remaining Implementation Decisions

The accepted choices are linked above. These remaining details are intentionally deferred:

```text
pagination convention
cursor format
idempotency-key convention
API documentation tooling
rate-limiting implementation
API gateway
BFF strategy
```

These choices should follow actual application requirements and selected technology stack.

Significant choices should be captured through ADRs.

---

## Future Documentation

This document should be complemented by:

- [docs/api/error-contract.md](error-contract.md)
- [docs/api/versioning.md](versioning.md)
- [docs/architecture/versioning-and-compatibility.md](../architecture/versioning-and-compatibility.md)
- [docs/reliability/logging.md](../reliability/logging.md)
- [docs/reliability/tracing.md](../reliability/tracing.md)
- [docs/security/data-retention.md](../security/data-retention.md)

Implementation-specific API documentation should derive from canonical contracts rather than redefining them manually.

---

## Summary

An API exposes application capabilities through explicit contracts.

The intended boundary is:

```text
untrusted consumer
        ↓
explicit contract
        ↓
validation
        ↓
authentication
        ↓
authorization
        ↓
application capability
        ↓
explicit response contract
```

Orion prefers:

```text
capabilities over database exposure

explicit contracts over implicit serialization

validation over assumptions

stable error codes over message parsing

bounded collections over unbounded queries

compatible evolution over premature versioning

generated SDKs over manually duplicated clients

machine-readable contracts over prose-only APIs
```

An ORM model is not automatically an API contract.

A structurally valid request is not automatically an authorized request.

An authenticated actor is not automatically allowed to perform an operation.

A successful internal refactor should not automatically become an external breaking change.

The API should protect consumers from internal implementation details while exposing stable, intentional application behavior.
