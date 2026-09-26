# Repository Structure

[Documentation index](../README.md) · [Validation availability](../validation.md)

Governing decisions: [ADR-0002](../adr/0002-select-pnpm-for-package-and-workspace-management.md), [ADR-0003](../adr/0003-establish-repository-validation-and-architecture-enforcement.md). Accepted choices are distinct from implemented tooling.

## Read for this change

- [High-Level Structure](#high-level-structure)
- [`apps/`](#apps)
- [`packages/`](#packages)
- [Creating a New Application](#creating-a-new-application)
- [Creating a New Package](#creating-a-new-package)
- [Local Agent Instructions](#local-agent-instructions)

## Purpose

This document defines the intended high-level structure of the Orion monorepo.

Its goals are to make repository navigation predictable, establish clear ownership boundaries, reduce accidental coupling, and provide a structure that can be understood consistently by both humans and AI agents.

This document defines responsibilities and dependency expectations.

It does not define technology-specific implementation details unless those details become architectural decisions documented elsewhere.

The repository structure may evolve, but changes to its fundamental organization should be deliberate and documented.

---

## Design Goals

The repository structure should optimize for:

- predictable navigation;
- clear ownership;
- local reasoning;
- explicit dependencies;
- reusable shared capabilities;
- discoverable documentation;
- mechanical architecture enforcement;
- efficient AI-agent context discovery;
- independent application evolution;
- minimal unnecessary coupling.

A contributor should be able to infer where new code belongs from its responsibility.

If the correct location for a new capability is unclear, that ambiguity should be treated as an architectural signal rather than solved by placing the code arbitrarily.

---

## High-Level Structure

The intended repository structure is:

```text
.
├── AGENTS.md
├── README.md
│
├── apps/
├── packages/
├── docs/
├── tooling/
├── infra/
│
└── .github/
```

Additional root-level files may exist for workspace configuration, dependency management, formatting, linting, builds, containers, environment configuration, or other repository-wide concerns.

Root-level additions should represent repository-wide concerns rather than application-specific implementation.

---

## Root

The repository root contains the entry points required to understand and operate the monorepo as a whole.

Examples include:

```text
AGENTS.md
README.md
workspace configuration
dependency manifests
formatting configuration
linting configuration
build configuration
container configuration
repository-wide scripts
```

The root should remain intentionally small.

Application-specific code should not be placed directly at the repository root.

Shared application code should normally belong under `packages/`.

Repository tooling should normally belong under `tooling/`.

Infrastructure definitions should normally belong under `infra/`.

Architecture and operational knowledge should normally belong under `docs/`.

---

## `apps/`

`apps/` contains independently executable or deployable application entry points.

Examples may include:

```text
apps/
├── api/
├── web/
├── mobile/
├── desktop/
├── worker/
└── cli/
```

Not all of these applications are required to exist.

Applications should be introduced only when there is a concrete need.

An application represents a runtime boundary, delivery surface, or independently meaningful executable product.

Examples include:

- an HTTP API;
- a browser application;
- a mobile application;
- a desktop application;
- a background worker;
- a command-line application.

---

### Application Ownership

An application owns implementation that is specific to that runtime or delivery surface.

For example, a web application may own:

```text
routing
pages
browser-specific behavior
application composition
web-specific state
web-specific UI
web-specific telemetry initialization
```

An API application may own:

```text
HTTP transport
request lifecycle
application composition
middleware
transport-level authentication integration
API-specific dependency wiring
```

An application should not become the default location for code that has broader reusable meaning.

Reusable behavior should move into an appropriate package when there is a real shared responsibility.

---

### Application Independence

Each application should remain understandable as an application boundary.

An application should clearly expose:

- its purpose;
- its entry point;
- its configuration;
- its runtime dependencies;
- its external integrations;
- its development workflow;
- its build workflow;
- its deployment expectations;
- its relevant documentation.

Application-specific instructions may be defined through:

```text
apps/<application>/AGENTS.md
```

These instructions supplement the repository-level [AGENTS.md](../../AGENTS.md).

---

### Application-to-Application Dependencies

Applications must not depend directly on the internal implementation of other applications.

For example:

```text
INVALID

apps/web/
    ↓ imports
apps/api/src/internal-service
```

Applications communicate through explicit contracts or shared packages.

Prefer:

```text
apps/web/
    ↓
packages/contracts/

apps/api/
    ↓
packages/contracts/
```

or, at runtime:

```text
Web application
      ↓
published API contract
      ↓
API application
```

An application must not become a shared library.

If multiple applications require the same implementation, that implementation should be evaluated for extraction into a package with explicit ownership.

---

## `packages/`

`packages/` contains reusable capabilities with explicit responsibilities.

Packages exist to define meaningful shared boundaries.

They must not become a dumping ground for miscellaneous code.

Potential packages may include:

```text
packages/
├── domain/
├── contracts/
├── database/
├── sdk/
├── observability/
├── config/
├── testing/
└── ui/
```

This list is illustrative.

Packages should be created only when their responsibility is understood.

---

### Package Requirements

Every package should have a clear answer to the following questions:

- What responsibility does this package own?
- Who is allowed to depend on it?
- What may this package depend on?
- Which APIs are public?
- Which implementation details are private?
- Is the package runtime-specific or platform-independent?

If those questions cannot be answered clearly, the package boundary is probably premature or incorrectly defined.

---

### Package Public APIs

Other parts of the repository should depend on a package through its intentional public API.

Consumers should not reach into arbitrary internal paths.

Prefer:

```text
package
├── public API
└── internal implementation
```

over:

```text
consumer
    ↓
package/internal/arbitrary/file
```

The project tooling should eventually enforce package boundaries where practical.

---

### Package Granularity

Packages should represent cohesive responsibilities.

Do not create a package for every small utility.

Do not create large packages containing unrelated concerns.

Both extremes reduce local reasoning.

A package boundary is justified when it provides meaningful ownership, reuse, dependency control, or architectural separation.

---

## Intended Shared Package Responsibilities

The following responsibilities are expected to be useful as Orion evolves.

Their exact existence and implementation must be decided incrementally.

---

### `packages/domain/`

Contains platform-independent domain concepts and business behavior that are meaningfully shared.

Potential responsibilities include:

```text
entities
value objects
domain rules
domain state transitions
domain errors
domain services
domain-level invariants
```

It should avoid unnecessary dependencies on:

```text
HTTP
UI frameworks
database clients
telemetry vendors
filesystem APIs
platform-specific runtimes
```

The domain package should not become a mandatory location for every business function.

Domain logic may remain within a bounded feature or application when broader sharing would provide no benefit.

---

### `packages/contracts/`

Contains canonical contracts shared across application boundaries.

Potential responsibilities include:

```text
request schemas
response schemas
event schemas
shared identifiers
transport-safe enums
validation schemas
public error contracts
```

The package should help prevent independently redefining the same external contract in multiple applications.

Contracts should remain focused on communication boundaries.

Internal implementation models should not automatically become public contracts.

---

### `packages/database/`

Contains shared database infrastructure and canonical persistence definitions when appropriate.

Potential responsibilities include:

```text
database schema
migrations
database client configuration
database documentation metadata
shared persistence primitives
database test utilities
```

Application-specific persistence behavior may live elsewhere when that provides clearer ownership.

The database package must not become a path through which every application can access every table without architectural boundaries.

Direct database access remains subject to application architecture.

---

### `packages/sdk/`

Contains generated or maintained clients for accessing Orion APIs or other explicit service boundaries.

Where practical, SDKs should be derived from canonical contracts.

Generated SDK code must not become the authoritative API definition.

The canonical contract remains the source of truth.

---

### `packages/observability/`

Contains shared observability conventions and integration primitives.

Potential responsibilities include:

```text
structured logging
trace propagation
correlation identifiers
metrics primitives
error reporting interfaces
telemetry context
redaction utilities
```

Vendor-specific integrations should be isolated behind clearly owned infrastructure when doing so provides meaningful portability or consistency.

Applications should use shared observability conventions instead of inventing incompatible telemetry formats.

---

### `packages/config/`

Contains shared configuration validation and configuration-related primitives where appropriate.

Potential responsibilities include:

```text
configuration schemas
environment validation
shared configuration types
configuration loading conventions
```

It must not centralize unrelated application configuration merely for convenience.

Applications remain responsible for configuration that belongs exclusively to them.

---

### `packages/testing/`

Contains testing infrastructure that has genuine repository-wide value.

Potential responsibilities include:

```text
test factories
shared fixtures
integration test infrastructure
test database utilities
custom assertions
test environment helpers
```

Application behavior tests should normally remain close to the code they protect.

This package exists for reusable testing infrastructure, not as a centralized home for all tests.

---

### `packages/ui/`

May contain reusable presentation primitives when multiple compatible applications genuinely share them.

Potential responsibilities include:

```text
design tokens
common components
shared accessibility primitives
theming primitives
icons
```

Cross-platform UI sharing should not be forced.

A web component and a mobile component that happen to look similar do not automatically belong in the same abstraction.

---

## Feature Organization

Within applications and packages, Orion should prefer organization around meaningful features or domains when practical.

For example:

```text
users/
orders/
payments/
notifications/
```

rather than organizing the entire system exclusively around technical categories such as:

```text
controllers/
services/
repositories/
models/
utils/
```

Technical layers may still exist inside a feature.

For example:

```text
orders/
├── application/
├── domain/
├── infrastructure/
├── transport/
└── tests/
```

The exact internal structure will be defined separately once the application architecture is selected.

The objective is to keep related behavior close enough that a contributor can reason about a feature without navigating unrelated areas of the repository.

---

## `docs/`

`docs/` contains repository knowledge that cannot be represented adequately through implementation alone.

Expected structure:

```text
docs/
├── architecture/
├── domains/
├── adr/
├── database/
├── api/
├── reliability/
├── security/
├── runbooks/
└── generated/
```

Documentation ownership is defined by subject matter rather than application ownership alone.

---

### `docs/architecture/`

Contains durable architecture documentation.

Examples include:

```text
principles.md
repository-structure.md
application-boundaries.md
dependency-rules.md
error-handling.md
```

Architecture documentation describes the current architectural model.

Historical architectural reasoning belongs in ADRs.

---

### `docs/domains/`

Contains business-domain knowledge.

Examples may include:

```text
users.md
orders.md
payments.md
subscriptions.md
```

Domain documentation should explain information such as:

```text
business terminology
business rules
state transitions
invariants
important workflows
domain-specific failure conditions
```

It should not duplicate implementation details unnecessarily.

---

### `docs/adr/`

Contains Architecture Decision Records.

ADRs preserve significant architectural reasoning.

Each ADR should represent an identifiable architectural decision rather than general documentation.

The repository should eventually define a standard ADR format and naming convention.

---

### `docs/database/`

Contains authored documentation related to database architecture and behavior.

Examples include:

```text
database conventions
migration policy
data ownership
transaction strategy
persistence architecture
database-specific design decisions
```

Generated schema references belong under `docs/generated/`.

---

### `docs/api/`

Contains authored API architecture and design documentation.

Examples include:

```text
API conventions
versioning strategy
pagination rules
error contract
authentication conventions
compatibility policy
```

Generated endpoint references should normally come from canonical machine-readable contracts.

---

### `docs/reliability/`

Contains reliability and observability architecture.

Potential topics include:

```text
logging
tracing
metrics
error tracking
health checks
correlation
retry policy
timeouts
resilience
```

---

### `docs/security/`

Contains security architecture and repository-wide security requirements.

Potential topics include:

```text
authentication
authorization
secret management
data classification
telemetry redaction
trust boundaries
security testing
```

Security-sensitive implementation details should be documented carefully without exposing credentials or operational secrets.

---

### `docs/runbooks/`

Contains operational procedures for diagnosing and recovering from known operational conditions.

A runbook should describe actionable operational procedures.

Examples include:

```text
database unavailable
queue backlog
external provider outage
failed deployment
high error rate
migration failure
```

Runbooks should be useful to both humans and AI-assisted operational investigation.

---

### `docs/generated/`

Contains documentation generated from canonical machine-readable sources.

Examples may include:

```text
database schema reference
entity relationship diagrams
OpenAPI reference
SDK references
configuration references
component catalogs
```

Files under this directory must not be edited manually unless explicitly designed otherwise. API, database, error, configuration, and component references exist now; [living documentation](living-documentation.md) presents them in the navigable portal. The generation process must be reproducible.

---

## `tooling/`

`tooling/` contains repository-owned development tooling.

Examples may include:

```text
tooling/
├── lint/
├── generators/
├── docs/
├── scripts/
└── architecture/
```

This directory is intended for tooling that supports development of Orion itself.

Examples include:

```text
custom lint rules
architecture validation
documentation generation
code generators
repository checks
workspace automation
release tooling
```

Tooling should provide clear errors and deterministic behavior.

Reusable application runtime behavior does not belong under `tooling/`.

---

## `infra/`

`infra/` contains declarative infrastructure required to build, deploy, or operate Orion applications.

Potential responsibilities include:

```text
cloud infrastructure
container orchestration
deployment definitions
network configuration
managed services
infrastructure-as-code
observability infrastructure
```

The directory should describe infrastructure rather than contain ordinary application business logic.

Infrastructure should be introduced incrementally according to actual application requirements.

The existence of `infra/` does not imply that Orion requires complex infrastructure.

---

## `.github/`

`.github/` contains GitHub-specific repository automation and metadata.

Potential responsibilities include:

```text
.github/
├── workflows/
├── ISSUE_TEMPLATE/
├── PULL_REQUEST_TEMPLATE.md
└── CODEOWNERS
```

GitHub Actions may eventually provide:

```text
validation
tests
builds
documentation checks
security checks
release automation
deployment workflows
```

CI should call the same canonical repository workflows used locally whenever practical rather than duplicating their logic in GitHub-specific scripts.

---

## Dependency Direction

The high-level dependency model should generally follow:

```text
                    ┌───────────────┐
                    │     apps      │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │   packages    │
                    └───────────────┘
```

Applications may depend on shared packages.

Shared packages must not depend on application implementation.

Therefore:

```text
VALID

apps/api
    ↓
packages/contracts
```

but:

```text
INVALID

packages/contracts
    ↓
apps/api
```

Dependencies between packages require more specific rules and will be defined as package responsibilities become concrete.

Circular dependencies are not acceptable architectural boundaries.

---

## Runtime Dependencies vs Development Dependencies

Runtime architecture and repository tooling are separate concerns.

Application runtime code may depend on runtime packages.

Repository tooling may inspect applications and packages.

Runtime code should not depend on repository tooling.

For example:

```text
VALID

tooling/architecture
    ↓ inspects
apps/api
```

but:

```text
INVALID

apps/api
    ↓ runtime import
tooling/architecture
```

The same principle applies to generated documentation tooling and repository scripts.

---

## Infrastructure Dependencies

Application code should not import infrastructure-as-code definitions.

Infrastructure may reference application deployment artifacts or configuration requirements, but infrastructure definitions should remain operational concerns.

Prefer:

```text
application
    ↓ produces
deployable artifact

infrastructure
    ↓ deploys
artifact
```

rather than coupling application business logic to infrastructure implementation.

---

## Documentation Dependencies

Documentation may reference implementation.

Implementation should not require parsing human-authored documentation to function correctly.

If application behavior requires machine-readable configuration or rules, those rules should exist in a canonical machine-readable source.

Documentation may then be generated from or reference that source.

Prefer:

```text
schema
   ↓
application behavior
   ↓
generated documentation
```

over:

```text
Markdown document
   ↓ parsed at runtime
application behavior
```

unless documentation itself is intentionally part of the product data model.

---

## Generated Code

Generated code should have an identifiable location and canonical source.

Generated files should not be mixed indistinguishably with authored code.

When practical, generated directories should be clearly named or marked.

Examples include:

```text
generated/
__generated__/
docs/generated/
```

The exact convention may differ by tool.

Generated code must follow the repository's generated-file policy.

---

## Tests

Tests should generally live close to the behavior they protect.

Prefer:

```text
feature/
├── implementation
└── tests
```

or an equivalent colocated convention supported by the selected technology.

Repository-wide integration or system tests may require dedicated locations.

Testing structure should distinguish between:

```text
unit behavior
integration behavior
contract behavior
system behavior
end-to-end behavior
```

without forcing all test types into one centralized directory.

The exact testing topology will be defined after the initial technology stack is selected.

---

## Database Ownership

The presence of a shared database package does not imply unrestricted database access.

Database ownership must follow application and domain boundaries.

A shared schema may exist while access remains constrained.

For example:

```text
API Orders module
      ↓
Orders persistence boundary
      ↓
Orders-owned database structures
```

rather than:

```text
Any module
      ↓
Any table
```

As the system evolves, database ownership rules should become mechanically enforceable where practical.

---

## Cross-Cutting Concerns

Cross-cutting concerns should normally be implemented through intentional shared packages or infrastructure rather than independently inside every application.

Examples include:

```text
observability
configuration
authentication primitives
error conventions
testing infrastructure
contract validation
security utilities
```

However, centralization alone is not a justification for abstraction.

A shared implementation should exist only when the semantics are genuinely shared.

---

## Utility Code

Avoid generic dumping grounds such as:

```text
utils/
helpers/
common/
shared/
misc/
```

without clearly defined ownership.

Small utility modules may exist locally when their responsibility is clear.

If code is broadly reusable, give it a meaningful home based on what it does rather than labeling it merely as "shared".

Prefer:

```text
packages/observability/
packages/contracts/
packages/config/
```

over:

```text
packages/common/
```

when the narrower responsibility is known.

---

## Internal Code

Applications and packages may contain internal implementation that must not become part of their public interface.

Internal directories or module boundaries may be used to communicate this intent.

Consumers must not bypass the public API merely because an internal implementation is technically importable.

Repository tooling should eventually enforce these boundaries where practical.

---

## Naming

Directory and package names should describe responsibilities rather than implementation accidents.

Prefer names based on:

```text
domain
capability
application
contract
infrastructure responsibility
```

Avoid names whose meaning depends on tribal knowledge.

Names should remain understandable without requiring historical context.

All repository names use English.

---

## Creating a New Application

A new application should be introduced only when there is a concrete runtime or delivery requirement.

Before creating a new application, determine:

```text
its responsibility
why existing applications cannot own it
its runtime boundary
its dependencies
its deployment model
its configuration model
its observability requirements
```

A significant new application boundary may require an ADR.

---

## Creating a New Package

Before creating a package, verify that:

```text
the responsibility is cohesive;
the boundary has real architectural value;
the code does not naturally belong to an existing package;
the expected consumers are understood;
the allowed dependencies are understood;
the package is not merely hiding premature abstraction.
```

A package should make the dependency graph easier to understand.

If creating the package makes ownership less clear, the boundary should be reconsidered.

---

## Moving Code Into Shared Packages

Code should not be moved into a shared package merely because a second consumer appears.

Before extracting shared code, determine whether the consumers share the same semantic concept or only similar implementation.

Prefer duplicated simple code over a shared abstraction with conflicting responsibilities.

Extraction becomes appropriate when shared ownership is intentional and stable enough to justify coupling.

---

## Repository Growth

The repository should grow incrementally.

Do not create empty directories merely to mirror the intended final structure.

For example, if Orion does not yet contain a mobile application, there is no need to create:

```text
apps/mobile/
```

solely because it appears in architectural diagrams.

Architecture documentation may describe future intended categories without pretending they already exist.

The physical repository must represent the current system.

---

## Local Agent Instructions

Nested `AGENTS.md` files may be introduced when an area requires instructions more specific than the repository-wide rules.

Examples may eventually include:

```text
apps/api/AGENTS.md
apps/web/AGENTS.md
packages/database/AGENTS.md
tooling/AGENTS.md
```

Nested instructions should contain local rules.

They should not unnecessarily duplicate the root [AGENTS.md](../../AGENTS.md).

The closest applicable `AGENTS.md` defines the most specific instructions for that area while remaining compatible with higher-level repository rules. The existing documentation scopes are [documentation](../AGENTS.md), [ADRs](../adr/AGENTS.md), and [runbooks](../runbooks/AGENTS.md). Application/package scopes should be added only when those areas exist and need local instructions.

---

## Intended Evolution

The initial repository should remain significantly smaller than the full conceptual structure described here.

Directories and packages should be introduced as responsibilities become real.

A likely early structure is:

```text
.
├── AGENTS.md
├── README.md
│
├── docs/
│   └── architecture/
│       ├── principles.md
│       └── repository-structure.md
│
└── .github/
```

As architectural decisions are made, additional areas may be introduced deliberately:

```text
apps/
packages/
tooling/
infra/
```

The architecture should lead repository growth.

Repository growth should not define architecture accidentally.

---

## Enforcement

Important repository boundaries should eventually be enforced mechanically.

Potential enforcement includes:

```text
applications cannot import other application internals;
shared packages cannot depend on applications;
internal package modules cannot be imported externally;
forbidden dependency directions fail validation;
circular package dependencies fail validation;
generated files cannot be manually changed without regeneration;
architecture validation runs in CI.
```

The exact mechanism will depend on the selected technology stack.

The architectural rule should be defined before selecting the enforcement tool.

---

## Summary

The Orion repository is organized around four primary concerns:

```text
apps/
    executable products and runtime boundaries

packages/
    reusable capabilities and explicit shared boundaries

docs/
    architectural, domain, operational, and generated knowledge

tooling/
    development and repository automation

infra/
    deployment and operational infrastructure
```

The intended dependency direction is:

```text
apps
  ↓
packages
```

with tooling and infrastructure operating around application code rather than becoming dependencies of business logic.

The structure exists to make ownership explicit.

New directories, applications, and packages should appear because a responsibility requires them, not because a template anticipated them.
