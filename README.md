# Orion

Orion is an AI-first engineering foundation for applications maintained collaboratively by humans and AI agents. The repository connects architecture, contracts, schemas, implementation, tests, and operational knowledge. Its local Living Documentation Portal connects searchable local guides, architecture, and decisions with generated API, database/data-dictionary, and component references and a bounded API explorer. AI-readable canonical sources remain available.

Its purpose is a reusable engineering environment that remains understandable as applications evolve: explicit boundaries, meaningful shared code, reproducible validation, observable production behavior, and safe database evolution. It is not a collection of unrelated libraries or an attempt to abstract every technology and eliminate all duplication.

## Current state

Orion provides a composable API runtime, PostgreSQL support, generated SDK, web shell, pnpm workspace, CI, and generated API/database/component references. Its Approval Request module is the executable reference implementation across all of them, composed only in Orion's own [`apps/api/src/modules.ts`](apps/api/src/modules.ts) and [`apps/web/src/modules.tsx`](apps/web/src/modules.tsx). The [Living Documentation Portal](apps/web/README.md#living-documentation-portal) runs locally at `/docs` in the web app. The [acceptance report](docs/foundation-acceptance.md#phase-11-foundation-acceptance) records foundation acceptance; its [review concerns](docs/foundation-acceptance.md#implementation-concerns-identified-during-review) distinguish implementation gaps from conditional future work. A concrete authentication provider and production environment have not been selected. Consult [CI status](docs/architecture/continuous-integration.md) for remote execution and repository-setting availability.

This repository is the canonical upstream foundation. Real projects start from a clone of it through [project derivation](docs/project-derivation.md), which removes the reference implementation and Orion's development history, applies the project's identity, records provenance in [`.orion/project.json`](.orion/project.json), and keeps later Orion upgrades reviewable. The [living plan](docs/implementation-plan.md) and [human actions](docs/human-actions.md) track Orion's own work.

## Start here

| Task | Entry point |
| --- | --- |
| Find the policy for a change | [Documentation task index](docs/README.md) |
| Understand contributor and agent obligations | [Global instructions](AGENTS.md), [contributing workflow](docs/contributing.md), [agent tool compatibility](docs/architecture/agent-instructions.md) |
| Understand architecture and code placement | [Principles](docs/architecture/principles.md), [repository structure](docs/architecture/repository-structure.md) |
| Find a selected technology or its rationale | [Technology map](docs/architecture/technology-decisions.md), [ADR index](docs/adr/README.md) |
| Determine available verification | [Validation](docs/validation.md) |
| Reproduce the local workflow | [Development setup](docs/setup.md) |
| Explore local guides, architecture, API routes, data, and components | [Portal setup](docs/setup.md#living-documentation-portal), [living documentation architecture](docs/architecture/living-documentation.md), [AI-readable references](docs/README.md#apis-and-data) |
| Find implementation examples and acceptance evidence | [Reference feature source map](docs/foundation-acceptance.md#reference-feature-evidence-map), [foundation acceptance](docs/foundation-acceptance.md) |
| Find outstanding work or required owner decisions | The plan and human actions linked from [Current state](#current-state) |
| Start a project from Orion, inspect provenance, or adopt a newer Orion revision | [Project derivation](docs/project-derivation.md) |
| Identify a foundation release and its compatibility meaning | [Foundation versioning](docs/versioning.md), [Orion tags](https://github.com/GabriellMDias/Orion/tags) |
| Create an operational procedure | [Runbooks](docs/runbooks/README.md) |

Accepted architecture and implemented capability are different states. Consult the [technology map](docs/architecture/technology-decisions.md) for selected directions and deliberately deferred choices, and [validation availability](docs/validation.md) for current checks. With Node.js 24.13.0 and pnpm 11.25.0, follow the canonical [development setup](docs/setup.md) for installation, local environment loading, execution, and the full gate. See the [API runtime](apps/api/README.md) and [web workflow](apps/web/README.md) for application-specific behavior.

Directory trees in architecture documents describe intended responsibilities, not proof that those directories exist. The physical repository takes precedence over illustrations. English is the canonical repository language; product localization is separate.

Read the relevant route rather than the whole documentation tree. Current policy explains what applies now; ADRs preserve why significant decisions were made; current generated references derive from executable contracts and schema metadata.

## Foundation direction

Orion organizes applications and cohesive shared capabilities in a monorepo. Logical modularity and local reasoning come before premature distribution. A shared abstraction must have a genuine semantic responsibility.

The reference implementation connects database, persistence, application/domain behavior, API contract, SDK, UI, tests, telemetry, and documentation as executable architectural guidance. Prefer those proven examples over inventing competing patterns. Deployment-specific operation remains conditional on concrete requirements; Orion's [Phase 12](docs/implementation-plan.md#phase-12) describes that work.

Architecture should be explicit and mechanically enforced where practical. Authored documentation preserves meaning and rationale that cannot be generated; derived structural facts should not be maintained as independent copies. See [architectural principles](docs/architecture/principles.md) for decision priorities, exceptions, and the detailed policies behind these goals.

## License

Orion source is licensed under the [Apache License 2.0](LICENSE).
