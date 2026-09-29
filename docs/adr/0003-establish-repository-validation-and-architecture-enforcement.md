# ADR-0003: Establish Repository Validation and Architecture Enforcement

**Status:** accepted

**Date:** 2026-09-12

## Context

Orion requires a canonical way for human contributors, AI agents, local development environments, and CI to determine whether a repository change satisfies the engineering rules currently implemented by the project.

The foundation already defines architectural boundaries, dependency rules, testing expectations, documentation responsibilities, and a preference for mechanical enforcement over conventions that exist only in prose.

As the monorepo grows, contributors must not need to reconstruct a different validation procedure for each application or package.

The repository therefore requires:

- one deterministic validation entry point;
- consistent TypeScript type checking;
- static analysis capable of using TypeScript type information where valuable;
- consistent source formatting;
- mechanical validation of dependency and architectural boundaries;
- a workflow that can expand as testing, generated artifacts, security validation, and build checks are introduced;
- equivalent validation semantics between local development and CI.

The validation workflow must also support Orion's AI-first development model.

An agent should be able to make a coherent change and execute one documented command to determine whether the repository accepts that change according to the checks currently implemented.

Validation and automatic modification are different responsibilities.

A validation command that silently rewrites source files makes it harder to determine whether a change being reviewed originated from the contributor or from the validation process itself. Orion therefore requires the canonical validation workflow to inspect repository state without intentionally rewriting source files.

Orion also requires architectural rules to become mechanically enforceable where practical.

Rules such as allowed dependency directions, forbidden cross-boundary imports, package isolation, and dependency cycles should not rely exclusively on documentation or contributor discipline.

The repository does not yet require advanced monorepo task orchestration. ADR-0002 establishes pnpm's native workspace execution as the initial mechanism for repository-wide commands.

## Decision

Orion will expose a single canonical repository validation entry point:

```text
pnpm validate
```

`pnpm validate` will be the authoritative local command for determining whether a coherent repository change satisfies the validation checks currently implemented by Orion.

The same validation capabilities must be used by CI rather than reimplemented as CI-specific logic.

The canonical validation workflow will be:

- deterministic;
- non-interactive;
- suitable for local development and automated environments;
- non-mutating with respect to tracked source files;
- composable from independently executable validation responsibilities;
- extensible as new repository capabilities are introduced.

The exact internal ordering and parallelization of checks are implementation details as long as their correctness requirements and failure semantics are preserved.

### Type checking

The **TypeScript compiler (`tsc`)** will be the authoritative mechanism for TypeScript type checking.

Linting tools will not be treated as substitutes for TypeScript compilation or type checking.

Type checking should run without intentionally modifying source files.

TypeScript project references may be introduced later when repository scale, build performance, or package relationships demonstrate sufficient value. They are not required solely because Orion uses a monorepo.

### Static analysis

Orion will use **ESLint** as its primary linting and extensible static-analysis platform.

ESLint configuration will use its modern **Flat Config** model.

TypeScript-aware linting will use **typescript-eslint**.

Where rules materially benefit from TypeScript type information, Orion will use typed linting based on the TypeScript project model, preferring Project Service-based configuration where appropriate.

Type-aware rules may cost more execution time than syntax-only linting. Orion accepts this cost when the rules provide meaningful correctness, safety, or maintainability benefits.

Lint rules should primarily enforce correctness, safety, maintainability, framework constraints, and other meaningful source-code properties.

Pure formatting concerns should normally remain the responsibility of the formatter rather than being duplicated as lint rules.

### Formatting

Orion will use **Prettier** as its source formatter for supported repository file types.

Formatting and formatting validation will remain distinct operations.

Conceptually:

```text
pnpm format
    → intentionally rewrite files

pnpm format:check
    → verify formatting without rewriting files
```

The canonical validation workflow will use formatting checks rather than automatic formatting.

Formatting configuration should remain minimal unless a concrete repository requirement justifies additional customization.

Replacing the formatter in the future does not necessarily require a new ADR if the change preserves the formatting responsibility and canonical validation model established here.

### Architecture and dependency enforcement

Orion will use **dependency-cruiser** as its initial dependency-graph and architecture-rule enforcement tool for JavaScript and TypeScript code.

Dependency rules should be encoded mechanically where dependency-cruiser or another appropriate repository mechanism can express them reliably.

These rules may include:

- forbidden dependency directions;
- forbidden imports between applications or packages;
- isolation of domain and application layers from infrastructure concerns;
- restrictions on importing application internals across boundaries;
- circular dependency detection;
- unresolved dependency detection;
- package dependency consistency;
- restrictions between production and development-only dependencies;
- other dependency-graph invariants defined by Orion architecture.

Architecture documentation remains the source of architectural intent.

Mechanical rules implement enforceable portions of that intent and must remain consistent with the authored architecture documentation.

dependency-cruiser does not define Orion's architecture. It verifies dependency properties derived from Orion's architecture.

If a future architecture rule cannot be expressed appropriately by dependency-cruiser, another focused validation mechanism may be introduced rather than weakening the architectural requirement.

### Validation composition

The initial `pnpm validate` workflow will include the checks that exist at the current repository stage.

Its initial responsibilities are expected to include:

```text
format:check
lint
typecheck
architecture
```

As Orion introduces additional capabilities, the same canonical validation workflow will expand to include relevant checks such as:

```text
unit tests
integration tests
browser tests where appropriate
generated artifact consistency
database consistency
documentation validation
security checks
build validation
```

A capability must not be represented in `pnpm validate` before the corresponding implementation actually exists.

The canonical command should therefore evolve with the repository while remaining a stable contributor-facing interface.

Individual validation responsibilities should remain independently executable where practical for development, diagnosis, and CI optimization.

For example:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm architecture
pnpm validate
```

The existence of `pnpm validate` does not prevent contributors from running narrower checks during development.

### Automatic fixes

Commands that intentionally modify source files must remain separate from validation commands.

Examples may include:

```text
pnpm format
pnpm lint:fix
```

`pnpm validate` must not intentionally invoke automatic fix operations.

Caches, compiler metadata, test artifacts, temporary files, and similar execution artifacts are not considered source modification when they are explicitly managed as generated or ignored runtime artifacts.

### Future task orchestration

ADR-0002 establishes that Orion will not initially adopt a dedicated monorepo task runner.

The validation interface defined by this ADR must not depend on that remaining true forever.

If Turborepo, Nx, or another task orchestrator is adopted in the future, repository-level commands such as:

```text
pnpm validate
```

should remain stable where practical while the internal execution mechanism changes.

This preserves a consistent interface for humans, AI agents, automation, and documentation.

## Rationale

Orion treats validation as part of the engineering architecture rather than as a loose collection of developer scripts.

A single canonical entry point gives both humans and AI agents an unambiguous answer to the question:

```text
Is this repository change acceptable according to the checks Orion currently implements?
```

This reduces hidden development knowledge and prevents validation procedures from becoming dependent on individual contributors remembering a sequence of unrelated commands.

Using the same underlying validation responsibilities locally and in CI also reduces the risk of changes passing locally while failing because CI contains undocumented or independently implemented validation logic.

The canonical validation command is intentionally non-mutating.

Validation should provide evidence about repository state rather than silently changing that state. Separating checks from fix commands improves predictability, reviewability, debugging, and AI-agent behavior.

TypeScript's compiler remains the correct authority for static type correctness. Although ESLint and typescript-eslint can perform sophisticated type-aware analysis, lint rules solve different classes of problems and should not replace compiler validation.

ESLint and typescript-eslint are selected because Orion requires an extensible static-analysis platform rather than only stylistic linting.

The project is expected to contain backend, web, testing, tooling, and other TypeScript contexts over time. An extensible rule and plugin model allows static analysis to evolve with those contexts without requiring a custom validation framework.

Typed linting is particularly relevant because some correctness rules cannot be evaluated reliably from syntax alone.

This additional analysis has a performance cost because type information must be available to the linting process. Orion accepts that tradeoff when the resulting rules materially improve correctness or maintainability.

Prettier is selected separately because formatting is a distinct responsibility from semantic static analysis.

A dedicated formatter provides consistent representation of source and documentation-oriented file types without filling ESLint configuration with formatting rules that do not contribute to code correctness.

dependency-cruiser is selected because Orion's architecture depends heavily on explicit boundaries and stable dependency direction.

Documentation can describe:

```text
domain must not depend on infrastructure
```

but a mature Orion repository should be capable of turning that statement into a validation failure when the rule is violated.

Analyzing the dependency graph separately from ordinary linting also creates a clearer responsibility model:

```text
Prettier
    → source representation

ESLint + typescript-eslint
    → source-level static analysis

tsc
    → TypeScript type correctness

dependency-cruiser
    → dependency-graph and architecture rules

pnpm validate
    → repository-level validation contract
```

This separation makes individual failures easier to understand and allows tools to evolve independently.

Orion intentionally does not add unused-code analysis, dedicated task orchestration, project references, or additional validation platforms merely because they may become useful later.

Such tools should be introduced when the repository has a demonstrated requirement that justifies their configuration, execution cost, and maintenance burden.

## Alternatives Considered

### Biome as the Unified Formatter and Linter

Biome provides integrated formatting and linting with strong performance characteristics and a growing set of TypeScript and JavaScript rules.

Using one tool for both responsibilities would reduce the number of tools in the repository and could improve validation performance.

It was not selected as Orion's initial primary linting platform because Orion places significant value on extensible static analysis, TypeScript type-aware linting, and compatibility with a broad ecosystem of framework- and domain-specific rules.

ESLint and typescript-eslint currently provide a stronger fit for those requirements.

The decision does not imply that Biome is unsuitable for Orion permanently. Formatting and linting tooling may be reevaluated if the capabilities and tradeoffs materially change.

### ESLint for Both Formatting and Static Analysis

ESLint can enforce many formatting-related rules in addition to semantic code rules.

This could reduce the need for a separate formatter.

It was not selected because mixing formatting and semantic analysis increases configuration complexity and makes lint results less focused on correctness and maintainability.

Orion prefers the clearer responsibility boundary of Prettier for formatting and ESLint for static analysis.

### ESLint Import Restrictions as the Only Architecture Enforcement

ESLint rules such as restricted imports can enforce some architectural boundaries.

They are useful for local import restrictions and may still be used when appropriate.

They were not selected as the sole architecture-enforcement mechanism because Orion needs to reason about dependency-graph properties such as cycles, package relationships, and dependency directions that are better represented by a dedicated graph-analysis tool.

dependency-cruiser provides a more direct model for these repository-wide dependency rules.

### Custom Architecture Validation Scripts

Orion could implement its own scripts to parse imports, inspect packages, and validate architecture rules.

This would provide complete control over the validation model.

It was not selected as the initial approach because maintaining a custom dependency analyzer would add substantial complexity while mature tools already solve the required graph-analysis problems.

Custom validation should be introduced only when a real Orion rule cannot be represented reliably by existing focused tooling.

### Dedicated Monorepo Task Runner

A tool such as Turborepo or Nx could orchestrate all repository validation tasks and provide caching, dependency-aware execution, and affected-project analysis.

ADR-0002 already defers this decision because Orion does not yet have sufficient repository scale or CI cost to justify an additional orchestration layer.

The validation contract established by this ADR is deliberately compatible with adopting such a tool later without changing the contributor-facing canonical command.

### TypeScript Project References from the Beginning

TypeScript project references can model package relationships and improve build and type-check performance in large TypeScript repositories.

They were not made mandatory because Orion does not yet have a sufficiently large TypeScript project graph to demonstrate that the added configuration and build semantics provide meaningful value.

They may be introduced later when repository scale or performance justifies them.

## Consequences

### Positive

- Humans and AI agents have one canonical command for complete repository validation.
- Local development and CI can rely on the same validation capabilities.
- Validation behavior is deterministic and does not intentionally rewrite tracked source files.
- TypeScript type correctness has a clear authority in `tsc`.
- Static analysis can use TypeScript type information where it provides meaningful value.
- ESLint provides a mature and extensible foundation for future backend, web, testing, and tooling rules.
- Formatting is separated cleanly from semantic static analysis.
- Architectural dependency rules can become machine-enforced rather than remaining prose-only expectations.
- Circular dependencies and other dependency-graph violations can be detected automatically.
- Individual validation responsibilities remain independently executable for faster development feedback and diagnosis.
- The validation workflow can grow as tests, generated artifacts, security checks, and build validation are introduced.
- A stable `pnpm validate` interface reduces the amount of repository-specific procedural knowledge required by AI agents.
- Future task orchestration can be introduced without necessarily changing contributor-facing commands.
- Tools have focused responsibilities and can evolve independently when their architectural role remains unchanged.

### Negative

- Orion adopts multiple validation tools rather than a single integrated toolchain.
- Contributors and maintainers must understand the boundaries between Prettier, ESLint, TypeScript, and dependency-cruiser.
- Typed ESLint rules can materially increase lint execution time compared with syntax-only linting.
- Maintaining architecture rules requires keeping dependency-cruiser configuration consistent with architectural documentation.
- Some architectural invariants may not be expressible purely through dependency-graph analysis and may require additional validation mechanisms later.
- Prettier and ESLint may occasionally require compatibility configuration to prevent overlapping responsibilities.
- Repository-wide validation may become increasingly expensive as the monorepo grows until task caching or affected-project execution is justified.
- Maintaining one canonical validation workflow requires discipline when new tools are introduced so that important checks do not exist only as undocumented standalone commands.

### Operational or Migration Impact

Orion does not currently have an established validation toolchain that must be migrated.

Repository implementation must introduce and configure:

```text
TypeScript compiler
ESLint
typescript-eslint
Prettier
dependency-cruiser
```

and expose their relevant repository-level commands through pnpm scripts.

The repository must establish:

```text
pnpm validate
```

as the canonical complete validation command.

CI, once implemented, must execute the same validation responsibilities instead of maintaining an independent repository-validation definition.

Tool versions must be pinned through the repository dependency-management mechanism established by ADR-0002.

Routine upgrades to TypeScript, ESLint, typescript-eslint, Prettier, or dependency-cruiser do not require a new ADR when they preserve the responsibilities and validation architecture established here.

Adding additional checks to `pnpm validate` as already-approved repository capabilities are implemented does not require a new ADR when the additions are consistent with this decision.

Replacing one of the primary validation mechanisms with a materially different validation architecture may require a new ADR depending on the scope and consequences of the change.

## References

Related ADR: [ADR-0001: Select TypeScript and Node.js as the Primary Language and Runtime](0001-select-typescript-and-nodejs-as-primary-language-and-runtime.md)

Related ADR: [ADR-0002: Select pnpm for Package and Workspace Management](0002-select-pnpm-for-package-and-workspace-management.md)

Related policy: [principles](../architecture/principles.md)

Related policy: [repository structure](../architecture/repository-structure.md)

Related policy: [application boundaries](../architecture/application-boundaries.md)

Related policy: [dependency rules](../architecture/dependency-rules.md)

Related policy: [testing strategy](../architecture/testing-strategy.md)

Related policy: [configuration](../architecture/configuration.md)

Related policy: [versioning and compatibility](../architecture/versioning-and-compatibility.md)
