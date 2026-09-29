# ADR-0001: Select TypeScript and Node.js as the Primary Language and Runtime

**Status:** accepted

**Date:** 2026-09-12

## Context

Orion requires a primary programming language and runtime before repository tooling, backend infrastructure, shared contracts, validation workflows, and application foundations can be implemented consistently.

The choice affects more than the backend. Orion is intended to be a reusable engineering foundation for future projects and may contain backend applications, web applications, shared packages, contracts, engineering tooling, and eventually other application types.

Projects built on Orion may vary substantially in size, lifetime, and operational requirements. The foundation must remain appropriate for small and simple applications while also providing sufficient architectural headroom for large, long-lived business systems with significant codebases, data volumes, integration surfaces, concurrent usage, and operational complexity.

The selected primary language and runtime should therefore support both low initial complexity and incremental growth. A project should not be forced to replace its primary technology solely because its codebase, workload, or user base grows. At the same time, Orion should not introduce distributed-system complexity or specialized technologies before concrete requirements justify them.

The primary language and runtime should support the following priorities:

- strong static analysis and type safety;
- explicit and machine-readable contracts;
- effective tooling and automation;
- maintainable monorepo workflows;
- mature production use;
- broad testing and observability support;
- predictable dependency management;
- good interoperability with web technologies;
- horizontal scalability for common application workloads;
- support for long-lived and evolving codebases;
- low unnecessary context switching between repository areas;
- effective use by both human contributors and AI agents;
- reasonable reversibility when specialized requirements justify another technology.

Using a common language across multiple repository areas can reduce the number of independent toolchains and conventions contributors must understand. However, a common language must not erase architectural boundaries or cause persistence models, domain models, API contracts, and UI models to become interchangeable.

Orion also requires runtime validation at trust boundaries. TypeScript's static types are erased at runtime and therefore cannot, by themselves, validate external input, configuration, API payloads, persisted data, or responses from external systems.

The primary language is not required to be the only language used by Orion. Specialized components may use another language or runtime when their requirements justify the additional operational and architectural cost.

## Decision

Orion will use **TypeScript as its primary programming language** and **Node.js as its primary server-side and engineering-tooling runtime**.

New first-party TypeScript code will use **ECMAScript Modules (ESM)** as the default module system.

The repository will use a supported **Node.js LTS release line** for production applications, CI, local development, and engineering tooling unless a narrower context explicitly requires otherwise.

At the time of this decision, the initial baseline is:

```text
TypeScript 6.x
Node.js 24 LTS
ECMAScript Modules
```

Exact patch versions and compatible toolchain versions will be pinned mechanically by repository tooling rather than by this ADR.

TypeScript will be used with strict static checking as a repository default. Exceptions must be explicit and justified by a concrete compatibility or implementation requirement.

TypeScript types alone will not be treated as sufficient validation for untrusted or external data. Runtime validation mechanisms will be selected separately for trust boundaries such as APIs, configuration, external integrations, and other inputs.

Using TypeScript across repository areas does not authorize arbitrary sharing of implementation models.

In particular:

```text
persistence records
    !=
domain entities
    !=
API contracts
    !=
UI models
```

Shared packages must continue to represent genuine shared responsibilities and must obey Orion's dependency and application-boundary rules.

Applications built on Orion should favor architectures that can scale incrementally without requiring premature distribution. Node.js applications may scale horizontally where appropriate, while specialized workloads may be separated when their technical or operational characteristics justify doing so.

Other languages and runtimes may be introduced when a concrete requirement materially justifies them. Such adoption must not occur solely for preference or novelty and may require a separate ADR when it has architectural consequences.

## Rationale

TypeScript and Node.js provide the strongest overall fit for Orion's expected combination of backend applications, web applications, shared contracts, engineering tooling, and monorepo infrastructure.

A TypeScript-centered repository allows substantial parts of the system to use a common type system, compiler toolchain, package ecosystem, testing ecosystem, and dependency model. This reduces the number of unrelated conventions that contributors and AI agents must understand while moving through the repository.

This is particularly valuable for Orion because the repository itself is intended to provide a unified engineering context. The benefit becomes more significant as projects grow: explicit and consistent conventions reduce the amount of repository-specific knowledge that humans and AI agents must reconstruct before making safe changes.

TypeScript also supports Orion's preference for explicit contracts and mechanical validation. Static types can represent internal compile-time expectations, while complementary runtime schemas can represent external boundaries and potentially drive generated artifacts such as JSON Schema, OpenAPI descriptions, and client SDKs.

Node.js provides a mature production runtime with an established LTS lifecycle, broad infrastructure support, strong observability and testing ecosystems, and direct compatibility with the JavaScript and TypeScript package ecosystem.

The combination is suitable for a broad range of application sizes. Small applications can begin with relatively little runtime and tooling complexity, while larger applications can evolve through modularization, horizontal scaling, background processing, caching, queues, database scaling strategies, and, when justified, independently deployable components.

The selected technology therefore does not require Orion to adopt a more operationally complex baseline stack merely in anticipation of future scale.

The ability to scale a system is not determined solely by its programming language or runtime. Large systems also depend on application boundaries, data architecture, concurrency strategies, infrastructure, observability, deployment topology, and operational practices. Orion's architecture must allow these capabilities to evolve independently as requirements become concrete.

Node.js is particularly well suited to common I/O-oriented application workloads such as HTTP APIs, database access, external integrations, asynchronous workflows, and network services. Horizontal scaling can increase application capacity without requiring the application to abandon its primary runtime solely because usage grows.

Selecting an LTS release line rather than the newest Current release prioritizes production stability and predictable maintenance over early access to runtime features.

ESM is selected as the default module system because it is the standard JavaScript module model and is the forward-looking default for new TypeScript and Node.js code. Standardizing new first-party code on one module system also avoids maintaining unnecessary parallel CommonJS and ESM conventions inside Orion.

The selection is not without costs.

TypeScript's type system does not provide runtime data validation and does not eliminate JavaScript runtime semantics. Orion must therefore explicitly validate data at trust boundaries and cannot rely on compile-time types as a security or data-integrity mechanism.

The JavaScript package ecosystem is also large and highly granular. This provides substantial capability but increases dependency and software-supply-chain exposure. Orion will need disciplined dependency selection, version management, security validation, and controls around third-party package behavior.

Using one language across applications can also make inappropriate coupling deceptively easy. A backend type being technically importable by a web application does not mean that it represents an appropriate shared contract. Orion's package boundaries, dependency rules, and architecture validation must prevent language homogeneity from weakening responsibility boundaries.

Node.js is not optimal for every possible workload. Components dominated by CPU-intensive processing, specialized systems programming, platform-native development, machine learning, or other requirements may be better implemented using another language or runtime.

Large systems may therefore eventually become polyglot where the benefits materially outweigh the additional complexity. Such evolution should occur at explicit architectural boundaries rather than by introducing multiple primary technologies preemptively.

The decision therefore establishes TypeScript and Node.js as Orion's **primary** technology, not its exclusive technology.

## Alternatives Considered

### C# and .NET

C# and .NET provide excellent static typing, mature tooling, strong runtime performance, a comprehensive standard ecosystem, long-term support releases, and a highly capable backend and application platform.

They would be strong candidates if Orion were primarily a backend or enterprise server platform and would remain technically capable of supporting large business systems.

They were not selected as the primary Orion technology because much of the expected repository will also operate in the JavaScript ecosystem, particularly web applications, frontend tooling, generated clients, and repository automation.

Using C# for the primary backend while TypeScript remains necessary for significant frontend and tooling responsibilities would introduce an additional primary language, build system, package ecosystem, and set of repository conventions.

That separation may be worthwhile for a specific product or specialized workload, but it does not currently provide enough benefit to justify the additional baseline complexity for Orion.

### Go

Go provides a simple language and toolchain, strong compilation and deployment characteristics, good runtime efficiency, fast builds, straightforward concurrency primitives, and a strong fit for network services and infrastructure software.

It would be a strong candidate for independently deployable services, infrastructure components, or workloads where its runtime and deployment characteristics provide material benefits.

It was not selected as Orion's primary language because it provides less unification across the expected backend, web, contract, and repository-tooling responsibilities.

Adopting Go as the primary backend technology would still require a substantial TypeScript ecosystem for web applications and related tooling, creating two primary development environments before a concrete requirement justifies that separation.

Go may still be introduced later for specialized components when its benefits outweigh the additional platform boundary.

### Kotlin and the JVM

Kotlin and the JVM provide a strong type system, a mature runtime ecosystem, excellent backend capabilities, broad Java interoperability, and mature production tooling.

They would be appropriate for large systems where JVM ecosystem integration, organizational requirements, or specific Kotlin and JVM capabilities provide material value.

They were not selected as Orion's primary technology because they would introduce a separate primary runtime, build ecosystem, and dependency model while TypeScript would remain necessary for major web-oriented repository responsibilities.

The additional platform boundary is not currently justified by a requirement that outweighs the benefits of a more unified initial toolchain.

## Consequences

### Positive

- Backend applications, web applications, engineering tooling, contracts, and many shared packages can use a common primary language.
- Contributors and AI agents have fewer unrelated language and tooling conventions to understand across the repository.
- Static typing can be applied consistently across large portions of the monorepo.
- TypeScript integrates naturally with web technologies and the broader JavaScript ecosystem.
- Shared contract tooling can use the same language as many producers and consumers while preserving explicit architectural boundaries.
- Node.js provides a mature production runtime with an LTS lifecycle and broad platform support.
- A single primary runtime simplifies initial local development, CI, testing, and repository automation.
- ESM establishes one forward-looking module convention for new first-party code.
- The same primary language and runtime can support projects across a wide range of sizes without requiring a more complex baseline technology merely in anticipation of future scale.
- Common application workloads can scale horizontally without requiring a change of primary runtime solely because usage increases.
- Large applications can evolve incrementally through modularization and explicit architectural boundaries rather than requiring premature distribution.
- The decision remains reversible for specialized components because TypeScript and Node.js are primary rather than mandatory technologies for every future workload.

### Negative

- TypeScript types do not exist at runtime, so external and untrusted data requires separate runtime validation.
- TypeScript does not provide the same degree of compile-time enforcement or runtime guarantees as some alternatives.
- JavaScript runtime semantics remain relevant even when code is written in TypeScript.
- The breadth and granularity of the JavaScript dependency ecosystem create meaningful software-supply-chain and dependency-management risks.
- Dependency selection and upgrades require active maintenance and security controls.
- ESM interoperability with legacy CommonJS packages may occasionally require compatibility handling.
- A shared language makes accidental architectural coupling easier unless package and dependency boundaries are mechanically enforced.
- Node.js may be unsuitable for some CPU-intensive, systems-level, platform-native, machine-learning, or otherwise specialized workloads.
- Very large systems may eventually require multiple runtimes, increasing operational complexity when those requirements become justified.
- Maintaining a supported Node.js LTS line requires periodic runtime upgrades.

### Operational or Migration Impact

Orion does not currently contain an established application runtime that must be migrated, so this decision does not require an application or data migration.

Repository implementation must establish a mechanically pinned and reproducible TypeScript and Node.js toolchain for local development and CI.

Production applications must use a supported Node.js LTS line unless a specific application has an explicitly documented reason to use another supported runtime policy.

Applications that require additional capacity should normally be able to scale Node.js application instances horizontally before introducing a different primary runtime solely for capacity reasons.

Specialized workloads may adopt a different language or runtime when profiling, operational requirements, platform constraints, or other concrete evidence demonstrates a material benefit.

Routine patch and supported-LTS upgrades do not require a new ADR when they preserve the architectural decision described here.

A future change away from TypeScript and Node.js as Orion's primary language and runtime would be an architectural change and should supersede this ADR.

## References

Related policy: [principles](../architecture/principles.md)

Related policy: [repository structure](../architecture/repository-structure.md)

Related policy: [application boundaries](../architecture/application-boundaries.md)

Related policy: [dependency rules](../architecture/dependency-rules.md)

Related policy: [versioning and compatibility](../architecture/versioning-and-compatibility.md)
