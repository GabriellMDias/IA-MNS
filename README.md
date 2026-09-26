# Orion

Orion is an AI-first engineering foundation for applications maintained collaboratively by humans and AI agents. The repository is the shared source of truth for architecture, contracts, schemas, implementation, tests, and operational knowledge. The intended foundation includes living, generated API, database/data-dictionary, and frontend-component documentation in a navigable human interface, alongside AI-readable canonical and generated artifacts.

Its purpose is a reusable engineering environment that remains understandable as applications evolve: explicit boundaries, meaningful shared code, reproducible validation, observable production behavior, and safe database evolution. It is not a collection of unrelated libraries or an attempt to abstract every technology and eliminate all duplication.

## Current state

Orion's development foundation is complete: a validated Approval Request reference slice across the API, PostgreSQL, generated SDK, and web application, with a pnpm workspace, CI, and generated API/database/component references. The [Living Documentation Portal](apps/web/README.md#living-documentation-portal) runs locally at `/docs` in the web app; the [acceptance report](docs/foundation-acceptance.md#phase-11-foundation-acceptance) records the evidence. A concrete authentication provider and production environment have not been selected. Consult the [CI status](docs/architecture/continuous-integration.md) for remote execution and repository-setting availability.

Accepted architecture and implemented capability are different states. Consult the [technology map](docs/architecture/technology-decisions.md) for selected directions and deliberately deferred choices, and [validation availability](docs/validation.md) for current checks. With Node.js 24.13.0 and pnpm 11.25.0, follow the canonical [development setup](docs/setup.md) for installation, local environment loading, execution, and the full gate. See the [API runtime](apps/api/README.md) and [web workflow](apps/web/README.md) for application-specific behavior.

Directory trees in architecture documents describe intended responsibilities, not proof that those directories exist. The physical repository takes precedence over illustrations. English is the canonical repository language; product localization is separate.

## Start here

| Task | Entry point |
| --- | --- |
| Find the policy for a change | [Documentation task index](docs/README.md) |
| Understand contributor and agent obligations | [Global instructions](AGENTS.md), [contributing workflow](docs/contributing.md) |
| Understand architecture and code placement | [Principles](docs/architecture/principles.md), [repository structure](docs/architecture/repository-structure.md) |
| Find a selected technology or its rationale | [Technology map](docs/architecture/technology-decisions.md), [ADR index](docs/adr/README.md) |
| Determine available verification | [Validation](docs/validation.md) |
| Reproduce the local workflow | [Development setup](docs/setup.md) |
| Explore API, database, and component documentation | [Portal setup](docs/setup.md#living-documentation-portal), [living documentation architecture](docs/architecture/living-documentation.md), [AI-readable references](docs/README.md#apis-and-data) |
| Review reference vertical-slice acceptance evidence | [Phase 9 acceptance](docs/foundation-acceptance.md) |
| Create an operational procedure | [Runbooks](docs/runbooks/README.md) |

Read the relevant route rather than the whole documentation tree. Current policy explains what applies now; ADRs preserve why significant decisions were made; current generated references derive from executable contracts and schema metadata.

## Foundation direction

Orion is intended to become a monorepo of applications and cohesive shared capabilities. Logical modularity and local reasoning come before premature distribution. A shared abstraction must have a genuine semantic responsibility.

The implemented reference feature connects database, persistence, application/domain behavior, API contract, SDK, UI, tests, telemetry, and documentation as executable architectural guidance. The foundation also requires a navigable living documentation interface built from canonical/generated API, data, and component sources. Future contributors should prefer proven repository examples over inventing competing patterns. Deployment-specific operation remains conditional on concrete requirements in [Phase 12](docs/implementation-plan.md#phase-12).

Architecture should be explicit and mechanically enforced where practical. Authored documentation preserves meaning and rationale that cannot be generated; derived structural facts should not be maintained as independent copies. See [architectural principles](docs/architecture/principles.md) for decision priorities, exceptions, and the detailed policies behind these goals.

## License

No license has been selected yet.
