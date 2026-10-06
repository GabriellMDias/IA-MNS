# IA-MNS

IA-MNS is MNS's corporate AI agent, built on the [Orion](https://github.com/GabriellMDias/Orion) engineering foundation. It provides a Portuguese conversation workspace with persistent history. Business capabilities plug into an explicit registry: the agent routes each request to an implemented capability and never presents planned ones as available. Sales consultation in Sankhya is the first and currently only business capability. [Corporate agent](docs/domains/corporate-agent.md) owns the product direction; [sales semantics](docs/domains/sales-chat.md) retain the business guarantees.

## Current state

This repository was initialized on 2026-10-01 from Orion commit `53bcc705a9f68f01aa1bbea3a0f4df4a009577ea`. It retains the foundation's architecture, policies, tooling, CI, generated references, and [Living Documentation Portal](apps/web/README.md#living-documentation-portal). It composes the corporate agent and sales modules, PostgreSQL conversation persistence, grounded social responses, actual execution progress, and light/dark themes. Existing deterministic sales results and read-only Oracle access remain in place. Sales interpretation keeps structured conversation state, so answers to clarification questions complete the pending request; curated multi-turn evaluation cases gate every change, and live-model evaluation, trace capture and synthetic scenarios are opt-in tools ([AI interpretation](docs/architecture/ai-interpretation.md), [AI evaluation](docs/architecture/ai-evaluation.md)). [Local setup](docs/setup.md#corporate-agent-and-local-postgresql) provisions Docker PostgreSQL and starts the application. Live OpenAI/Oracle interpretation and original-SQL reconciliation passed on 2026-10-01 using the existing owner-authorized key; [verification](docs/project/live-sales-verification.md) records the earlier provider repair. IA-MNS has its own identity ([identity](docs/domains/identity.md)): one Person per individual, reachable through an IA-MNS account (password and authenticator app), PDT Connect or Sankhya, with the same conversations and permissions whether opened directly or embedded in PDT Connect or the Sankhya Om. People who use PDT Connect or Sankhya get their profile automatically at first access; there is no public account creation, and owners create and associate everyone else. The PDT connector awaits a homologation installation, and Sankhya sign-in awaits the Om security hardening and identity add-on; production refuses Sankhya sign-in until approved. A dedicated SELECT-only Oracle account, unit confirmation, production deployment and shared-deployment lifecycle remain owner actions. No new ERP domains or actions are implemented. The repository is published at https://github.com/GabriellMDias/IA-MNS. Its `main` branch requires pull requests and the `Orion required gate` check, Renovate is enabled, and the applicable GitHub security controls are on.

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

IA-MNS is licensed under the [Apache License 2.0](LICENSE), which covers both the project's own work and the material inherited from Orion. [ADR-0021](docs/adr/0021-license-ia-mns-under-apache-2-0.md) records the decision. The repository is public. Never commit credentials, local configuration, or confidential business data.
