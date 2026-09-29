# ADR-0002: Select pnpm for Package and Workspace Management

**Status:** accepted

**Date:** 2026-09-12

## Context

Orion requires a package and workspace management strategy before repository tooling, applications, shared packages, dependency rules, validation workflows, and CI can be implemented consistently.

The repository is intended to use a monorepo containing multiple applications and packages that may depend on each other. The selected tooling must therefore support both external dependencies and explicit relationships between first-party workspace packages.

Orion is also intended to serve projects with substantially different sizes. Small repositories should not require unnecessary orchestration infrastructure, while larger repositories must retain a viable path toward more advanced task scheduling, caching, affected-project detection, and CI optimization when those capabilities provide material value.

The package and workspace strategy should support the following priorities:

- deterministic dependency installation;
- explicit dependency declarations;
- predictable first-party package resolution;
- a shared dependency graph across the monorepo;
- reproducible local development and CI;
- efficient dependency storage and installation;
- practical dependency-version coordination;
- software-supply-chain controls;
- execution of commands across selected workspace projects;
- compatibility with the TypeScript and Node.js ecosystem;
- low initial repository complexity;
- incremental adoption of more advanced monorepo capabilities when justified.

Package management, workspace management, and task orchestration are related but distinct responsibilities.

A workspace manager defines which projects belong to the repository and how their package dependencies relate.

A dedicated monorepo task runner adds capabilities such as task-graph orchestration, computation caching, affected-project analysis, remote caching, or distributed execution.

Orion does not currently have enough applications, packages, or CI workload to demonstrate a need for a dedicated task orchestration layer.

## Decision

Orion will use **pnpm as its package manager** and **pnpm workspaces as its initial workspace-management mechanism**.

The repository will maintain a single workspace encompassing the Node.js and TypeScript applications, packages, and engineering tooling that belong to the Orion monorepo.

A shared pnpm lockfile will represent the resolved dependency graph for the workspace and will be committed to version control.

The exact pnpm version will be pinned mechanically by repository configuration rather than by this ADR.

First-party package dependencies within the workspace should use pnpm's `workspace:` protocol when an explicit dependency on another local workspace package is intended.

This ensures that a dependency declared as a workspace dependency resolves to the corresponding local package rather than silently falling back to a registry package with the same name.

Dependency catalogs may be used when multiple workspace projects need centrally coordinated dependency version ranges and the centralization provides clear value.

Catalogs will not be required for every dependency solely for consistency.

Orion will **not adopt a dedicated monorepo task runner initially**.

Initial cross-workspace command execution will use pnpm's native workspace, filtering, recursive execution, and package-script capabilities where sufficient.

Tools such as Turborepo, Nx, or another dedicated task orchestrator may be evaluated later if concrete repository requirements justify the additional abstraction.

Examples of requirements that may justify reconsidering this decision include:

- CI execution time becoming materially affected by unnecessary work;
- a sufficiently large application and package graph;
- repeated expensive deterministic builds or tests that would benefit from caching;
- a need for reliable affected-project analysis;
- increasingly complex dependency-aware task scheduling;
- significant benefits from remote caching or distributed task execution.

Introducing a dedicated task runner in the future should not require changing pnpm as the package manager unless an independent requirement justifies doing so.

Package scripts and repository-level developer commands should remain the stable interface where practical so that internal orchestration can evolve without unnecessarily changing contributor workflows.

## Rationale

pnpm provides the package-management and workspace capabilities Orion requires without introducing a separate monorepo platform at the beginning of the project.

Its native workspace model allows applications and shared packages to coexist within a single dependency graph while retaining independent package manifests and explicit dependencies.

pnpm's dependency model encourages packages to declare the dependencies they actually use. This aligns with Orion's preference for explicit architectural boundaries and reduces accidental reliance on undeclared dependencies that happen to be available elsewhere in the repository.

The `workspace:` protocol provides an explicit representation of first-party package relationships. This is valuable for Orion because a dependency on a local contract, configuration, testing, or other shared package should be intentional and mechanically recognizable.

A shared lockfile provides one resolved dependency state for the workspace. This improves reproducibility between contributors, AI agents, CI, and other automated environments and avoids independent dependency-resolution histories for packages that are intended to evolve within the same repository.

pnpm also provides facilities for coordinating dependency versions across a workspace, including catalogs. These can reduce unnecessary version drift when multiple packages intentionally depend on the same tool or library. However, Orion does not require all dependencies to share versions, so catalogs should be introduced where central coordination represents a genuine repository responsibility rather than as a universal abstraction.

The package manager also provides useful supply-chain controls around dependency lifecycle and build scripts. These capabilities complement Orion's security principles but do not replace dependency review, automated vulnerability analysis, lockfile review, or other software-supply-chain controls.

pnpm can execute scripts across workspace projects and filter execution to selected packages. This provides sufficient task execution for Orion's initial repository scale.

A dedicated monorepo task runner would add capabilities that may become valuable later, including task graphs, computation caching, affected-project calculation, remote caching, and CI distribution.

Those capabilities have real value in sufficiently large repositories, but they also introduce another configuration model and another layer responsible for understanding repository execution.

Orion currently has no demonstrated performance or orchestration problem that requires that layer.

Adopting a dedicated task runner preemptively would therefore violate Orion's preference for introducing complexity only when its responsibility and value are understood.

Deferring the choice also preserves better information for a future decision. If task orchestration becomes necessary, Orion can evaluate the actual problem at that time rather than selecting Turborepo, Nx, or another tool based on hypothetical future requirements.

The decision does not prevent Orion from growing into a large monorepo. It establishes pnpm as the baseline dependency and workspace layer while keeping advanced task orchestration independently replaceable and adoptable.

## Alternatives Considered

### npm Workspaces

npm provides native workspace support and is distributed with Node.js, which reduces the amount of additional tooling required to begin development.

It would be capable of supporting a basic Orion workspace.

It was not selected because pnpm provides a stronger combination of workspace-oriented capabilities, explicit local package relationships, dependency isolation, dependency-version coordination, and installation efficiency for the type of monorepo Orion intends to become.

Using npm primarily because it is bundled with Node.js would reduce one installation concern but would not provide enough architectural benefit to outweigh pnpm's monorepo-oriented capabilities.

### Yarn Workspaces

Yarn provides mature workspace functionality and additional dependency-management capabilities suitable for monorepos.

It was not selected because pnpm provides the capabilities Orion currently requires with a dependency model and workspace workflow that align well with the project's preference for explicit package relationships and relatively conventional Node.js package semantics.

Selecting Yarn would not provide a material architectural advantage for Orion sufficient to justify preferring it over pnpm.

### Dedicated Monorepo Task Runner from the Beginning

Tools such as Turborepo and Nx can provide dependency-aware task execution, caching, affected-project analysis, and CI optimizations beyond basic workspace execution.

These capabilities may become valuable as Orion grows.

They were not selected for the initial repository foundation because Orion does not yet have enough projects or expensive tasks to demonstrate a need for advanced task orchestration.

Introducing one now would add another configuration and execution layer before its benefits could be measured against actual repository behavior.

The decision is therefore deferred rather than rejected.

A dedicated task runner should be reconsidered when repository scale or CI performance provides evidence that pnpm's native task execution is no longer sufficient.

## Consequences

### Positive

- Orion uses one package manager for TypeScript and Node.js applications, packages, and engineering tooling.
- Applications and shared packages participate in a common workspace and dependency graph.
- A shared lockfile provides deterministic dependency resolution across the monorepo.
- First-party package relationships can be expressed explicitly with the `workspace:` protocol.
- Packages are encouraged to declare the dependencies they actually use.
- Dependency versions can be coordinated centrally with catalogs when doing so provides genuine value.
- Local development and CI can use the same package-management behavior.
- pnpm provides native mechanisms for selecting and executing commands across workspace packages.
- Orion avoids introducing a separate task-orchestration abstraction before it solves a demonstrated problem.
- The repository retains a straightforward migration path to Turborepo, Nx, or another task runner if future scale justifies one.
- Package management and advanced task orchestration remain separate architectural concerns.
- Stable repository-level commands can hide future changes to the underlying orchestration mechanism from contributors and AI agents where practical.

### Negative

- Contributors and execution environments must have the repository-selected pnpm version available rather than relying only on npm bundled with Node.js.
- pnpm's dependency layout and workspace semantics require contributors to understand some pnpm-specific behavior.
- Some packages or tools that implicitly assume traditional npm dependency layouts may require compatibility configuration.
- A single workspace lockfile can produce larger lockfile changes as the repository grows.
- Catalogs, workspace protocols, filtering, and other pnpm-specific capabilities increase coupling to pnpm if used extensively.
- Without a dedicated task runner, Orion initially does not receive advanced computation caching, automatic affected-project analysis, remote caching, or distributed task execution.
- Repository-wide validation may perform more work than necessary as the monorepo grows until task orchestration is reconsidered.
- Task dependencies must initially remain simple enough to be managed without a dedicated task graph.

### Operational or Migration Impact

Orion does not currently have an established package manager or application workspace that must be migrated.

Repository implementation must pin the selected pnpm version mechanically and establish the workspace configuration and shared lockfile.

Local development and CI must use the pinned package-manager version to minimize environment-specific dependency-resolution differences.

Changes to the pnpm patch or supported major version do not require a new ADR when they preserve the package and workspace strategy established here.

Adding catalogs, filters, or other pnpm-native mechanisms does not inherently require a new ADR when they remain implementation details consistent with this decision.

Introducing a dedicated monorepo task runner may require a new ADR if it establishes a significant repository-wide execution, caching, or CI abstraction.

Replacing pnpm as the package or workspace manager would be an architectural change and should supersede this ADR.

## References

Related ADR: [ADR-0001: Select TypeScript and Node.js as the Primary Language and Runtime](0001-select-typescript-and-nodejs-as-primary-language-and-runtime.md)

Related policy: [principles](../architecture/principles.md)

Related policy: [repository structure](../architecture/repository-structure.md)

Related policy: [dependency rules](../architecture/dependency-rules.md)

Related policy: [testing strategy](../architecture/testing-strategy.md)

Related policy: [versioning and compatibility](../architecture/versioning-and-compatibility.md)

External reference: pnpm documentation — workspaces, workspace protocol, catalogs, dependency management, and build-script controls.
