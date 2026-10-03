# IA-MNS

IA-MNS is MNS's corporate AI agent, built on the [Orion](https://github.com/GabriellMDias/Orion) engineering foundation. It provides a Portuguese conversation workspace with persistent history and an explicit registry of implemented capabilities. Its first business capability is controlled sales consultation in Sankhya. [Corporate agent](docs/domains/corporate-agent.md) owns the product direction; [sales semantics](docs/domains/sales-chat.md) retain the business guarantees.

## Current state

This repository was initialized on 2026-10-01 from Orion commit `53bcc705a9f68f01aa1bbea3a0f4df4a009577ea`. It retains the foundation's architecture, policies, tooling, CI, generated references, and [Living Documentation Portal](apps/web/README.md#living-documentation-portal). It composes the corporate agent and sales modules, PostgreSQL conversation persistence, grounded social responses, actual execution progress, and light/dark themes. Existing deterministic sales results and read-only Oracle access remain in place. [Local setup](docs/setup.md#corporate-agent-and-local-postgresql) provisions Docker PostgreSQL and starts the application. Live OpenAI/Oracle interpretation and original-SQL reconciliation passed on 2026-10-01 using the existing owner-authorized key; [verification](docs/project/live-sales-verification.md) records the earlier provider repair. A dedicated SELECT-only Oracle account, unit confirmation and shared-deployment lifecycle/identity controls remain owner actions. No production authentication or new ERP domains/actions are implemented.

The [corporate agent verification](docs/project/corporate-agent-verification.md) records current real-provider, persistence and gate evidence. The [project plan](docs/project/implementation-plan.md) and [project human actions](docs/project/human-actions.md) own this repository's current work and external prerequisites. The [project manifest](.orion/project.json) records the project identity, the immutable initialization commit, and the Orion baseline currently integrated. [Project derivation](docs/project-derivation.md) explains how to inspect provenance and adopt newer Orion revisions through reviewed merges.

## Start here

| Task | Entry point |
| --- | --- |
| Find the policy for a change | [Documentation task index](docs/README.md) |
| Understand contributor and agent obligations | [Global instructions](AGENTS.md), [contributing workflow](docs/contributing.md), [agent tool compatibility](docs/architecture/agent-instructions.md) |
| Understand architecture and code placement | [Principles](docs/architecture/principles.md), [repository structure](docs/architecture/repository-structure.md) |
| Add a product capability | [API modules](apps/api/README.md#modules), [web modules](apps/web/README.md#modules), [Orion's reference implementation](docs/project-derivation.md#orions-reference-implementation) |
| Find a selected technology or its rationale | [Technology map](docs/architecture/technology-decisions.md), [ADR index](docs/adr/README.md) |
| Determine available verification | [Validation](docs/validation.md) |
| Reproduce the local workflow | [Development setup](docs/setup.md) |
| Explore local guides, architecture, API routes, data, and components | [Portal setup](docs/setup.md#living-documentation-portal), [living documentation architecture](docs/architecture/living-documentation.md), [AI-readable references](docs/README.md#apis-and-data) |
| Find outstanding work or required owner decisions | The plan and human actions linked from [Current state](#current-state) |
| Inspect provenance or adopt a newer Orion revision | [Project derivation](docs/project-derivation.md) |
| Create an operational procedure | [Runbooks](docs/runbooks/README.md) |

Accepted architecture and implemented capability are different states. Consult the [technology map](docs/architecture/technology-decisions.md) for selected directions and deliberately deferred choices, and [validation availability](docs/validation.md) for current checks. With Node.js 24.13.0 and pnpm 11.25.0, follow the canonical [development setup](docs/setup.md) for installation, local environment loading, execution, and the full gate.

Directory trees in architecture documents describe intended responsibilities, not proof that those directories exist. The physical repository takes precedence over illustrations. English is the canonical repository language; product localization is separate.

## License

IA-MNS's product license has not been chosen; [PH-06](docs/project/human-actions.md#ph-06) tracks that decision. Material inherited from Orion remains available under the [Apache License 2.0](LICENSE).
