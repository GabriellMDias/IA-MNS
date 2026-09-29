# ADR-0007: Establish API Contract, OpenAPI, SDK, and Configuration Schema Strategy

**Status:** accepted

**Date:** 2026-09-23

## Context

Orion requires a consistent strategy for defining API contracts, validating external data at runtime, describing HTTP APIs, generating client integrations, and validating application configuration.

These concerns are closely related because they depend on explicit machine-readable schemas at trust boundaries.

The selected strategy must support projects ranging from small internal applications to large systems with multiple first-party clients, external integrations, mobile or desktop applications, and potentially consumers implemented in languages other than TypeScript.

The API strategy should therefore support:

- explicit and versionable contracts;
- language-independent interoperability;
- runtime request validation;
- controlled response serialization;
- strong TypeScript inference;
- generated API descriptions;
- generated client types and SDKs;
- human-readable API reference generation;
- AI-agent discoverability;
- compatibility with Fastify;
- predictable evolution as systems grow;
- support for external consumers;
- mechanical validation of generated artifacts;
- minimal duplication between authored contracts and derived representations.

Orion has already selected TypeScript as its primary language and Fastify as its primary HTTP framework.

However, the API contract must not depend on consumers sharing the same TypeScript implementation environment.

A future Orion application may expose APIs to:

- web applications;
- mobile applications;
- desktop applications;
- third-party systems;
- automation;
- AI agents;
- services written in other languages.

The contract strategy must therefore preserve an interoperable boundary independently of the implementation language.

Orion also requires runtime validation because TypeScript types do not exist at runtime.

Transport data and configuration are both trust boundaries and must be validated before being treated as valid application data.

Configuration introduces an additional concern: operating-system environment variables and other external configuration sources commonly represent values as strings even when the application expects numbers, booleans, enumerations, URLs, or other structured types.

Configuration loading must therefore distinguish raw external representation from validated runtime configuration.

## Decision

Orion will use **HTTP with JSON payloads as its primary application API style**.

API contracts will be resource-oriented where resource semantics naturally fit and operation-oriented where explicit business operations better represent application behavior.

Orion will not require strict REST purity.

For example, an explicit business operation such as:

```text
POST /orders/{orderId}/cancel
```

is acceptable when cancellation represents meaningful application behavior with its own authorization, invariants, side effects, or failure semantics.

The primary externally interoperable API description will be **OpenAPI**.

OpenAPI descriptions will be **generated from canonical executable contract schemas and route metadata**, not maintained manually as an independent source of truth.

### Canonical contract schemas

Orion will use **TypeBox 1.x as its default runtime schema system for canonical API contracts and shared trust-boundary schemas**.

Canonical transport contracts must remain representable as standard JSON-compatible schema data.

The intended relationship is:

```text
TypeBox contract
    ↓
TypeScript static type
    +
JSON Schema
    +
runtime validation
    +
response serialization metadata
    ↓
OpenAPI
```

TypeBox schemas used for external contracts must describe the **wire representation** of data rather than JavaScript-specific runtime objects.

For example:

```text
wire timestamp
    → string with date-time semantics
```

rather than:

```text
JavaScript Date object
```

The architectural distinction remains:

```text
wire representation
    !=
application representation
    !=
domain representation
    !=
persistence representation
```

TypeBox will not become the universal type system for Orion.

Ordinary internal TypeScript types may continue to represent domain and application concepts that do not require runtime schema validation.

TypeBox is primarily intended for boundaries where executable schemas provide concrete value, including:

- HTTP API contracts;
- application configuration;
- external integration payloads;
- messages or events when such infrastructure is introduced;
- other untrusted or externally supplied data.

### Fastify integration

Fastify will consume the contract schemas through its schema-based validation and serialization pipeline.

The preferred integration will use Fastify's TypeBox type-provider support.

Request schemas will provide runtime validation at the HTTP boundary.

Response schemas will define the transport representation that Fastify is allowed to serialize.

Transport handlers remain responsible for translating between API contracts and application operations.

TypeBox schemas do not become application or domain models merely because Fastify can infer their TypeScript types.

### API description

Orion will generate **OpenAPI 3.x descriptions**, with **OpenAPI 3.1.x as the initial baseline**.

The exact patch release will be determined by toolchain compatibility rather than permanently fixed by this ADR.

A future OpenAPI minor-version upgrade does not require a new ADR when it preserves the API-description strategy established here.

The generated OpenAPI description must remain reproducible from canonical repository sources.

It must never become an independently edited source of truth.

Each externally exposed API operation must define a **stable and unique `operationId`**.

For example:

```text
createCustomer
getCustomer
cancelOrder
```

Stable operation identifiers support:

- documentation;
- generated clients;
- contract analysis;
- AI discoverability;
- future tool generation;
- compatibility analysis;
- consistent identification independent of route implementation structure.

### TypeScript SDK generation

When an Orion application has a TypeScript consumer that benefits from a shared SDK, the default SDK generation strategy will use:

```text
OpenAPI
    ↓
openapi-typescript
    ↓
generated TypeScript API types
    ↓
openapi-fetch
    ↓
thin typed HTTP client
```

`openapi-typescript` will generate TypeScript representations from the generated OpenAPI contract.

`openapi-fetch` will provide the default thin typed HTTP client for TypeScript consumers.

The initial strategy intentionally favors generated types and a small generic HTTP runtime rather than generating a large application-specific client implementation.

The generated TypeScript client contract must depend on OpenAPI rather than importing server implementation types directly.

Therefore, first-party web applications should not bypass the API boundary by importing server-side contract implementations merely because both applications reside in the same monorepo.

The intended dependency flow is:

```text
authored contracts
    ↓
OpenAPI
    ↓
generated client types
    ↓
typed HTTP client
    ↓
consumer application
```

This keeps the API boundary continuously testable as a real interoperable contract.

### Other-language SDKs

Orion will not select a universal SDK generator for every programming language before concrete consumers exist.

OpenAPI will remain the language-independent SDK input.

If a future application requires a Kotlin, Swift, C#, Python, Go, or other client, an appropriate generator may be selected for that consumer.

The choice of language-specific generator is not itself an architectural change as long as OpenAPI remains the canonical interoperable API description.

### Generated artifacts

Generated OpenAPI documents, SDK types, and other derived contract artifacts must be:

- deterministic;
- reproducible;
- generated from canonical sources;
- never manually edited.

Repository validation should verify generated-artifact consistency once the corresponding artifacts exist.

Conceptually:

```text
canonical contracts
    ↓
generate OpenAPI
    ↓
generate client artifacts
    ↓
pnpm validate
    ↓
verify generated output is current
```

Whether a particular generated artifact is committed to version control or generated during build or publication is an implementation decision and may depend on how that artifact is consumed.

Regardless of storage strategy, generated artifacts must never become independent sources of truth.

### Client-side runtime validation

Generated TypeScript SDKs will provide compile-time typing by default.

They will not automatically revalidate every successful server response at runtime.

Runtime validation on clients may be introduced when a concrete trust boundary or reliability requirement justifies the additional execution and implementation cost.

The server remains responsible for validating requests and serializing responses according to its published contract.

### Configuration validation

Orion will use **TypeBox as the default schema system for application bootstrap configuration**.

External configuration sources, including environment variables, must be treated as untrusted input.

The intended configuration flow is:

```text
external configuration
    ↓
raw values
    ↓
explicit parsing / normalization
    ↓
TypeBox validation
    ↓
validated typed configuration
    ↓
application composition
```

Application code must not rely directly on arbitrary `process.env` access throughout the codebase.

Direct environment access should be restricted to the configuration-loading or bootstrap boundary.

After configuration has been parsed and validated, application components should receive typed configuration values rather than reading environment variables independently.

### Configuration parsing

External representation and runtime representation are distinct.

For example:

```text
PORT="3000"
```

must become:

```text
port: 3000
```

through explicit parsing and validation.

Boolean parsing must also be explicit.

A raw value such as:

```text
"false"
```

must not be interpreted through generic JavaScript truthiness.

Parsing rules should be deterministic, narrow, and documented.

Excessive implicit coercion should be avoided because it can hide configuration errors.

### Startup behavior

Required application configuration must be validated before the application begins accepting work.

The normal startup sequence is:

```text
process starts
    ↓
load configuration
    ↓
parse
    ↓
validate
    ↓
invalid?
  ↙       ↘
yes       no
 ↓         ↓
fail      compose application
fast          ↓
          begin serving work
```

Missing or invalid required configuration is therefore a startup failure.

Applications must not defer discovering invalid foundational configuration until the affected code path is first executed.

### Runtime configuration

Validated bootstrap configuration should be treated as **immutable during normal application execution**.

Dynamic application state such as:

- feature flags;
- tenant settings;
- remote configuration;
- user preferences;
- runtime business settings;

is a separate concern and must not be conflated with application bootstrap configuration.

### Configuration defaults

Configuration defaults are permitted when the default behavior is safe, deterministic, and appropriate across the environments where it applies.

Defaults must not silently weaken:

- security;
- authentication;
- durability;
- data integrity;
- production safety;
- observability requirements.

Sensitive or production-critical configuration should generally require explicit values when an implicit default would create ambiguity or risk.

### Configuration metadata and documentation

Configuration schemas may include metadata required to generate configuration reference documentation.

Such metadata may describe:

- logical configuration name;
- type;
- required or optional status;
- safe default;
- description;
- classification or sensitivity;
- applicable environment constraints.

The intended model is:

```text
configuration schema
    ↓
runtime validation
    +
TypeScript types
    +
generated configuration reference
```

Generated configuration documentation must never contain actual secret values.

A schema may document that a secret or restricted configuration entry exists, but secret values must not be emitted into:

- documentation;
- logs;
- traces;
- metrics;
- error reports;
- fixtures;
- generated examples containing real credentials.

Existing Orion data-classification and secrets-management policies remain authoritative.

## Rationale

HTTP with JSON and OpenAPI provides the strongest general-purpose boundary for Orion's expected application portfolio.

It is language-independent, broadly supported by infrastructure and tooling, understandable by both humans and machines, and suitable for first-party clients, third-party integrations, mobile applications, automation, and AI tooling.

This is particularly important because Orion is intended as a reusable engineering foundation rather than a single TypeScript full-stack application.

A TypeScript-only RPC model could provide superior local developer ergonomics for some applications but would reduce the independence of the external contract.

OpenAPI preserves the ability to evolve backend implementation choices without requiring consumers to share Orion's internal programming language or framework.

Orion does not require strict REST semantics because business applications contain meaningful operations that do not always map naturally to generic CRUD updates.

Allowing both resource-oriented and explicit operation-oriented endpoints keeps API contracts aligned with application behavior rather than forcing artificial resource modeling.

TypeBox is selected because Orion's contract architecture treats JSON Schema compatibility as a first-class requirement.

TypeBox creates runtime JSON Schema representations while also providing static TypeScript inference.

This directly supports Orion's preferred model:

```text
one executable schema
    ↓
multiple derived representations
```

rather than maintaining separate:

```text
TypeScript DTO
validation schema
JSON Schema
OpenAPI schema
client type
```

for the same wire contract.

TypeBox also aligns directly with Fastify's JSON Schema validation and serialization model.

This reduces translation layers between the authored contract and the infrastructure that enforces it.

The selection does not imply that TypeBox should replace normal TypeScript types inside domain and application code.

Its value is greatest at boundaries requiring runtime validation and machine-readable schema representation.

OpenAPI is generated rather than authored independently because Orion prefers derived representations whenever they can be reliably produced from canonical machine-readable sources.

Maintaining handwritten OpenAPI beside separately maintained runtime schemas would create two sources of truth that could drift.

OpenAPI also provides a stable language-independent layer for generated clients.

This allows Orion's server and first-party TypeScript applications to remain contractually separated even when they live in the same repository.

`openapi-typescript` and `openapi-fetch` are selected for the initial TypeScript client path because they preserve this separation with relatively little generated or runtime code.

The approach avoids prematurely coupling the SDK layer to frontend state-management libraries or framework-specific code generators.

Richer SDK generators may become useful later, but their additional code generation should solve a demonstrated need.

The same schema system is used for bootstrap configuration because configuration is another runtime trust boundary.

Introducing a second schema library only for environment parsing would increase repository complexity without a clear architectural benefit.

Restricting `process.env` access to the configuration boundary also improves discoverability and predictability.

Instead of every component independently interpreting external strings, configuration is parsed once into an explicit typed object before the application is composed.

Fail-fast startup behavior ensures configuration problems are detected before the application begins processing traffic or background work.

## Alternatives Considered

### tRPC as the Primary API Contract

tRPC provides excellent TypeScript developer experience and end-to-end type inference without traditional code generation.

It is particularly effective when server and consumers are all TypeScript applications that intentionally share the same type system.

It was not selected as Orion's primary API strategy because Orion must support consumers that may not use TypeScript and because the external contract should remain independent from backend implementation types.

The primary interoperability boundary would become more TypeScript-specific than Orion's long-term goals justify.

tRPC may still be introduced for a scoped internal TypeScript-only boundary when the coupling is intentional and provides a concrete benefit.

### GraphQL

GraphQL provides a strongly typed schema and allows clients to select the precise shape of data they require.

It can provide substantial value for systems with many clients requiring flexible traversal of highly connected data.

It was not selected as Orion's default because this flexibility introduces additional concerns around query complexity, resolver performance, N+1 access patterns, authorization granularity, caching, cost control, and operational observability.

Orion does not currently have a concrete requirement that justifies introducing those concerns as part of the default foundation.

GraphQL may be introduced later when demonstrated client-query requirements make its additional complexity worthwhile.

### gRPC

gRPC provides strongly typed service contracts, efficient binary communication, code generation, streaming, and strong service-to-service characteristics.

It can be appropriate for specialized internal communication or high-performance service boundaries.

It was not selected as Orion's primary general application API because HTTP/JSON with OpenAPI provides a more broadly accessible default for browsers, third-party integrations, human inspection, and heterogeneous external consumers.

gRPC may be introduced later for specialized internal communication requirements.

### Zod

Zod provides an excellent TypeScript-first runtime validation model and strong developer ergonomics.

Modern Zod versions can also generate JSON Schema, which makes Zod technically capable of participating in Orion's contract architecture.

It was not selected because Orion's canonical contract model is explicitly centered on JSON Schema-compatible wire representations.

TypeBox begins directly from JSON Schema representations while still providing TypeScript inference.

This reduces the conceptual translation between the authored contract, Fastify's validation and serialization model, and generated OpenAPI.

Zod remains appropriate for a scoped application-specific problem when a concrete integration materially benefits from it, but it is not part of Orion's default schema foundation.

### Manually Authored OpenAPI

Orion could maintain an `openapi.yaml` or equivalent document as the primary source of API contracts.

This would provide an explicitly language-independent contract from the beginning.

It was not selected because runtime validation schemas would then either need to be generated from OpenAPI or maintained separately.

Orion already requires executable server-side schemas, and maintaining independent runtime schemas and OpenAPI descriptions would create unnecessary duplication and drift risk.

Generated OpenAPI preserves language-independent interoperability without introducing another manually maintained source of truth.

### Rich Generated SDKs as the Default

Tools such as Orval, Hey API, or general-purpose OpenAPI generators can generate operation-specific functions, framework integrations, data-fetching hooks, mocks, and larger client SDKs.

These capabilities can be valuable.

They were not selected as Orion's initial TypeScript golden path because they introduce more generated runtime code and can couple API generation to frontend-framework decisions that have not yet been made.

The initial approach of generated types plus a thin typed Fetch client is smaller and more reversible.

A richer generator may be selected later if concrete client-development requirements justify it.

### Direct Server Contract Imports from First-Party Clients

Because Orion uses a TypeScript monorepo, a web application could import TypeScript types or schemas directly from the server-side contract package.

This would provide excellent compile-time ergonomics.

It was not selected as the default client integration because it would bypass the language-independent API boundary.

Generating client types from OpenAPI continuously verifies that the API remains consumable as an actual external contract and avoids recreating a TypeScript-specific RPC coupling implicitly.

### Separate Configuration Schema Library

Orion could use a different library, such as Zod or a specialized environment-validation package, for bootstrap configuration.

This may provide concise environment-variable parsing APIs.

It was not selected because TypeBox already fulfills the required runtime-schema role and introducing another schema system would add a second convention for essentially the same trust-boundary responsibility.

Explicit parsing combined with TypeBox validation provides sufficient capability while keeping the foundation more consistent.

## Consequences

### Positive

- Orion has one default schema model for API contracts and bootstrap configuration.
- Canonical API contracts are executable and machine-readable.
- TypeScript types can be derived from the same schemas used for runtime boundary validation.
- Fastify can consume the same schema representations for request validation and response serialization.
- OpenAPI is generated rather than independently maintained.
- External API contracts remain language-independent despite TypeScript being Orion's primary implementation language.
- First-party clients exercise the same external API contract that other consumers use.
- Stable `operationId` values provide durable machine-readable operation identities.
- TypeScript SDK types can be regenerated deterministically from the OpenAPI description.
- `openapi-fetch` keeps the default TypeScript client runtime small and close to Web Platform APIs.
- Other-language SDKs can be introduced without changing the server contract architecture.
- Generated artifacts can participate in the canonical `pnpm validate` workflow.
- Transport representations remain distinct from domain and persistence models.
- Configuration is validated before application startup.
- Arbitrary `process.env` access is removed from ordinary application code.
- Configuration parsing behavior becomes explicit and centralized.
- Invalid foundational configuration fails early rather than being discovered during request processing.
- Configuration reference documentation can eventually be generated from canonical metadata.
- The architecture remains compatible with AI tools that consume structured API descriptions.

### Negative

- Orion introduces TypeBox as another foundational dependency that contributors must learn.
- Developers familiar with Zod may need to adapt to a JSON Schema-oriented modeling style.
- Some JavaScript-native or transformation-oriented schema patterns are intentionally unsuitable for canonical wire contracts.
- Generating OpenAPI and SDK artifacts adds build and validation steps.
- Keeping first-party clients behind the generated OpenAPI boundary introduces more indirection than importing TypeScript types directly.
- `openapi-typescript` and `openapi-fetch` do not provide the richer generated convenience functions or framework-specific hooks available from larger SDK generators.
- Operation metadata such as descriptions and stable `operationId` values must be maintained deliberately.
- Configuration parsing requires explicit code in addition to schema definition because raw environment values commonly use string representations.
- Restricting environment access requires architectural enforcement to prevent convenience-driven direct `process.env` usage from spreading.
- OpenAPI cannot by itself express every runtime or business semantic that documentation may need, so authored API documentation remains necessary for intent and behavior not represented by the contract.

### Operational or Migration Impact

Orion does not currently have an established API contract or configuration-validation implementation that must be migrated.

The initial API implementation will therefore adopt TypeBox contracts directly.

Repository implementation must introduce compatible versions of:

```text
typebox
@fastify/type-provider-typebox
OpenAPI generation tooling
openapi-typescript
openapi-fetch
```

when the corresponding application and SDK content actually exists.

The generated OpenAPI description should initially target a supported OpenAPI 3.1.x representation.

The exact OpenAPI patch version and generator configuration must be pinned through repository tooling.

API operations must define stable unique `operationId` values before generated SDKs or external API publication rely on them.

A TypeScript SDK package should not be created until a real consumer requires it.

When created, its generated contract types must originate from OpenAPI rather than direct imports from server implementation types.

Other-language SDK generators should be selected only when corresponding consumers exist.

Repository validation must eventually detect stale generated OpenAPI or SDK artifacts once those artifacts are introduced.

Bootstrap configuration must be validated before Fastify begins listening for requests or before workers begin accepting jobs.

Applications must progressively restrict `process.env` or equivalent raw configuration access to the designated bootstrap/configuration boundary.

Sensitive configuration values must remain excluded from generated documentation, logging, telemetry, and error output according to existing Orion security policies.

Routine compatible upgrades of TypeBox, OpenAPI tooling, `openapi-typescript`, or `openapi-fetch` do not require a new ADR when they preserve the responsibilities and contract architecture established here.

Replacing TypeBox as Orion's canonical contract schema system, replacing OpenAPI as the primary interoperable API description, or materially changing the API contract architecture would require a new ADR that supersedes this decision.

## References

Related ADR: [ADR-0001: Select TypeScript and Node.js as the Primary Language and Runtime](0001-select-typescript-and-nodejs-as-primary-language-and-runtime.md)

Related ADR: [ADR-0003: Establish Repository Validation and Architecture Enforcement](0003-establish-repository-validation-and-architecture-enforcement.md)

Related ADR: [ADR-0004: Select Fastify as the Backend HTTP Framework](0004-select-fastify-as-the-backend-http-framework.md)

Related policy: [principles](../architecture/principles.md)

Related policy: [application boundaries](../architecture/application-boundaries.md)

Related policy: [dependency rules](../architecture/dependency-rules.md)

Related policy: [configuration](../architecture/configuration.md)

Related policy: [principles](../api/principles.md)

Related policy: [error contract](../api/error-contract.md)

Related policy: [versioning](../api/versioning.md)

Related policy: [data classification](../security/data-classification.md)

Related policy: [secrets management](../security/secrets-management.md)

External reference: TypeBox documentation.

External reference: Fastify Type Providers documentation.

External reference: Fastify OpenAPI ecosystem documentation.

External reference: OpenAPI Specification.

External reference: openapi-typescript and openapi-fetch documentation.
