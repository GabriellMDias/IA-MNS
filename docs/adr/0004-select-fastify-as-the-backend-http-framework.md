# ADR-0004: Select Fastify as the Backend HTTP Framework

**Status:** accepted

**Date:** 2026-09-13

## Context

Orion requires a backend HTTP framework before the initial API application and its transport layer can be implemented consistently.

The selected framework must support projects with substantially different sizes and operational requirements, ranging from small applications to large, long-lived systems with significant traffic, domain complexity, integration surfaces, and horizontal scaling requirements.

Orion already defines its own architectural principles, application boundaries, dependency rules, validation model, and preference for explicit composition.

The backend framework should therefore provide strong HTTP infrastructure without becoming the architecture of the business system itself.

In particular, the framework should support an architecture in which:

```text
HTTP framework
    ↓
transport adapters
    ↓
application operations
    ↓
domain behavior
```

Domain and application code should remain independent from the HTTP framework wherever practical.

The framework should also align with Orion's broader priorities:

- strong runtime performance;
- low framework overhead;
- predictable production behavior;
- explicit request lifecycle;
- runtime validation and serialization capabilities;
- structured logging;
- TypeScript support;
- extensibility without requiring a framework-specific application model;
- maintainability in large codebases;
- horizontal scalability;
- effective observability integration;
- compatibility with machine-readable API contracts;
- minimal unnecessary abstraction;
- clear execution paths for both human contributors and AI agents.

The selection must not assume that a large system requires microservices or a heavyweight application framework.

Orion intends to support modular monoliths and other incrementally scalable architectures while preserving the option to extract independently deployable components when concrete requirements justify doing so.

## Decision

Orion will use **Fastify as its primary backend HTTP framework for Node.js applications**.

Fastify will be treated as a **transport and infrastructure adapter**, not as the architectural foundation of domain or application logic.

The intended dependency direction is:

```text
Fastify
    ↓
HTTP adapters
    ↓
application layer
    ↓
domain
```

Domain code must not depend on Fastify.

Application code should not depend on Fastify APIs or types except where an explicitly justified transport-specific boundary requires otherwise.

Fastify-specific concepts should remain primarily within the API application's composition root, transport adapters, plugins, hooks, and HTTP infrastructure.

Transport-specific objects such as:

```text
FastifyRequest
FastifyReply
FastifyInstance
```

must not become domain entities, application contracts, or persistence models.

HTTP adapters are responsible for translating between framework-specific transport concerns and framework-independent application inputs and outputs.

Fastify's plugin and encapsulation model may be used to organize HTTP and infrastructure concerns, but Fastify plugin boundaries will not define Orion's business-domain boundaries.

Business and architectural boundaries remain governed by Orion's packages, dependency rules, domain ownership, and application architecture.

Fastify's schema-based request validation and response serialization capabilities will be used where compatible with the API contract strategy selected separately by Orion.

The canonical schema representation, runtime schema library, API description strategy, and SDK generation approach are intentionally not selected by this ADR.

### Logging

Orion backend applications using Fastify will use **Pino as the default structured logging implementation for the HTTP runtime**, taking advantage of Fastify's native logging integration.

This decision establishes the technical logger used by the Fastify runtime but does not define Orion's complete observability policy.

The following remain governed by the existing reliability and security policies and by the future observability implementation decision:

- telemetry semantics;
- required log fields;
- correlation identifiers;
- trace and span correlation;
- sensitive-data redaction;
- log levels;
- error-reporting integration;
- telemetry export;
- retention;
- observability backend or vendor.

Application and domain code should not become unnecessarily coupled to Pino APIs merely because Pino is used by the HTTP runtime.

Logging abstractions should be introduced only where they represent a genuine application responsibility rather than as wrappers created solely to hide the selected library.

### Framework versioning

The exact Fastify and Pino versions will be pinned mechanically by repository dependency management rather than by this ADR.

Orion should use supported, production-appropriate releases compatible with the selected Node.js LTS baseline.

Routine compatible framework upgrades do not require a new ADR when they preserve the architectural responsibilities established here.

## Rationale

Fastify provides the strongest overall fit for Orion because it combines high HTTP performance with a relatively narrow architectural responsibility.

It provides routing, lifecycle hooks, plugins, request validation, response serialization, structured logging integration, and other HTTP infrastructure without requiring Orion to adopt a framework-defined application architecture.

This distinction is important.

Orion already defines how responsibilities, dependencies, domains, contracts, and composition should be structured. Selecting a framework that also imposes a comprehensive application architecture would create overlapping architectural systems that would need to remain synchronized.

Fastify allows Orion to retain the relationship:

```text
Orion
    → defines application architecture

Fastify
    → implements the HTTP boundary
```

rather than requiring the application architecture to be expressed primarily through framework concepts.

Fastify is also designed for low framework overhead and high throughput. This supports Orion's requirement to remain suitable for applications that may eventually serve substantial workloads.

Framework benchmark performance is not treated as a guarantee of complete application performance. Database design, external integrations, serialization, caching, application logic, infrastructure, and deployment topology commonly dominate real system performance.

However, when two frameworks can satisfy the architectural requirements, lower baseline HTTP overhead is still preferable.

Fastify's request validation and response serialization model is particularly compatible with Orion's preference for explicit, machine-readable contracts.

A future contract strategy can potentially provide schemas that drive:

```text
contract definition
    ↓
runtime validation
    ↓
response serialization
    ↓
API description
    ↓
generated clients
```

without requiring the HTTP framework itself to become the canonical contract source.

Fastify's response-schema capabilities are also valuable for security and correctness because transport responses can be constrained explicitly rather than serializing arbitrary internal objects.

Its plugin and encapsulation model provides sufficient structure for large backend applications while remaining narrower than a complete application-framework model.

This allows the HTTP layer to be organized by concerns and composition without making Fastify plugins equivalent to business domains.

Pino is selected as the default HTTP-runtime logger because Fastify integrates with it directly and because it provides structured logging with low overhead.

Using the framework's native logging path reduces unnecessary integration complexity.

The selection does not mean application architecture should expose Pino throughout the codebase. Logging semantics and cross-cutting observability behavior remain separate architectural concerns.

The decision accepts that Fastify provides less built-in application structure than frameworks such as NestJS.

Orion must therefore supply the conventions that NestJS would otherwise provide through modules, dependency injection, controllers, providers, guards, pipes, and interceptors.

This is an intentional tradeoff.

Those conventions are already part of Orion's responsibility as an engineering foundation, and keeping them independent from the HTTP framework reduces framework lock-in and keeps domain and application code easier to understand, test, and reuse outside HTTP contexts.

## Alternatives Considered

### NestJS with Fastify

NestJS provides a comprehensive backend application framework with modules, dependency injection, controllers, providers, guards, pipes, interceptors, exception filters, decorators, and extensive ecosystem integration.

Using NestJS with its Fastify adapter would retain much of Fastify's HTTP infrastructure while providing substantially more application structure.

NestJS is a strong option for large backend systems and was not rejected because of scalability limitations.

It was not selected because Orion already intends to define the architectural conventions that NestJS normally provides.

Adopting NestJS would introduce a second application-architecture model alongside Orion's own package boundaries, dependency graph, composition rules, and domain structure.

The repository would then need to maintain consistency between concepts such as:

```text
Orion package/domain boundaries
```

and:

```text
NestJS module/provider boundaries
```

NestJS decorators and dependency-injection semantics could also propagate into application code and increase coupling between business logic and the framework unless carefully constrained.

The additional framework machinery provides real value when the framework itself is expected to establish application conventions.

For Orion, that responsibility belongs primarily to Orion.

Fastify therefore provides the required HTTP capabilities while leaving application architecture more explicitly under Orion's control.

### Express

Express provides a mature, widely adopted, minimal HTTP framework with a large ecosystem and straightforward middleware model.

Its simplicity and familiarity make it suitable for many applications.

It was not selected because Orion would need to assemble more of its backend foundation independently, including consistent validation, serialization, structured logging integration, and other HTTP conventions.

Fastify provides these capabilities as a more cohesive framework while retaining a relatively narrow architectural responsibility.

Fastify also provides lower baseline HTTP overhead and stronger alignment with schema-driven request validation and response serialization.

For a new Orion foundation without legacy Express constraints, Express does not provide a material advantage sufficient to outweigh those differences.

### Hono

Hono provides a small, TypeScript-oriented framework built around Web Standards and supports multiple JavaScript runtimes and deployment environments.

It offers strong performance, a compact API, and considerable portability.

It was not selected because Orion has already established Node.js as its primary backend runtime.

Hono's cross-runtime portability therefore provides less architectural value for Orion than it would for a system intentionally targeting multiple JavaScript runtimes or edge platforms.

Fastify provides a more Node.js-focused backend ecosystem and stronger alignment with Orion's expected requirements around schema-based validation, response serialization, structured logging, plugin encapsulation, and long-lived server applications.

Hono may still be appropriate for a specialized future application where Web Standards portability or a different execution environment provides concrete value.

## Consequences

### Positive

- Orion backend applications receive a high-performance HTTP foundation with relatively low framework overhead.
- Fastify remains primarily an HTTP and infrastructure concern rather than defining the business architecture.
- Domain code can remain plain TypeScript without Fastify dependencies.
- Application operations can remain reusable outside HTTP execution paths.
- Framework-specific request and response objects are prevented from becoming general application models.
- The architecture remains suitable for both small APIs and large backend systems.
- Backend instances can scale horizontally without requiring a framework change solely because traffic increases.
- Fastify's schema capabilities align well with Orion's future machine-readable contract strategy.
- Explicit response serialization can improve correctness and reduce accidental exposure of internal fields.
- Fastify's plugin and encapsulation system provides organization for large transport and infrastructure layers.
- Pino provides structured HTTP logging through Fastify's native integration.
- The framework does not require Orion to adopt a framework-specific dependency-injection container.
- Execution paths remain comparatively explicit, which benefits debugging, testing, human comprehension, and AI-agent reasoning.
- The application architecture remains less coupled to the HTTP framework than it would with a more comprehensive application framework.

### Negative

- Fastify provides fewer built-in application-architecture conventions than NestJS.
- Orion must define and enforce its own composition, dependency injection, lifecycle, authorization integration, transport mapping, and application-organization conventions where necessary.
- Contributors familiar with NestJS may initially miss its modules, providers, decorators, guards, pipes, and dependency-injection container.
- Greater architectural freedom can lead to inconsistent application structure if Orion's boundaries and reference patterns are not mechanically enforced.
- Fastify plugins can be misused as business-module boundaries if their infrastructure role is not kept explicit.
- Fastify-specific APIs still create framework coupling inside the HTTP adapter layer.
- Some third-party Node.js libraries or examples may target Express or NestJS more directly.
- Schema-driven validation and serialization require discipline to remain aligned with canonical API contracts.
- Pino becomes an implementation dependency of the backend runtime even though application and domain code should remain minimally coupled to it.

### Operational or Migration Impact

Orion does not currently have an established backend HTTP implementation that must be migrated.

The initial API application will therefore be implemented directly on Fastify.

Repository architecture enforcement should prevent Fastify-specific imports from entering framework-independent layers where such dependencies are prohibited.

The backend composition root will be responsible for assembling Fastify, transport adapters, application dependencies, infrastructure implementations, and runtime concerns.

Fastify and Pino versions must be pinned using the package-management strategy established by ADR-0002.

Backend validation must participate in the canonical repository workflow established by ADR-0003.

Routine compatible upgrades of Fastify or Pino do not require a new ADR when they preserve the responsibilities and architectural boundaries described here.

Replacing Fastify as Orion's primary backend HTTP framework would be an architectural change and should supersede this ADR.

Introducing NestJS or another application framework for a specialized future application does not necessarily supersede this ADR if that application has a concrete requirement and the exception is explicitly scoped and documented.

## References

Related ADR: [ADR-0001: Select TypeScript and Node.js as the Primary Language and Runtime](0001-select-typescript-and-nodejs-as-primary-language-and-runtime.md)

Related ADR: [ADR-0002: Select pnpm for Package and Workspace Management](0002-select-pnpm-for-package-and-workspace-management.md)

Related ADR: [ADR-0003: Establish Repository Validation and Architecture Enforcement](0003-establish-repository-validation-and-architecture-enforcement.md)

Related policy: [principles](../architecture/principles.md)

Related policy: [application boundaries](../architecture/application-boundaries.md)

Related policy: [dependency rules](../architecture/dependency-rules.md)

Related policy: [error handling](../architecture/error-handling.md)

Related policy: [configuration](../architecture/configuration.md)

Related policy: [logging](../reliability/logging.md)

Related policy: [observability](../reliability/observability.md)

Related policy: [telemetry redaction](../security/telemetry-redaction.md)

Related policy: [principles](../api/principles.md)
