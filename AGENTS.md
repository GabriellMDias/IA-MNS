# Repository Instructions

## Global invariants

- The repository is the primary source of truth. Keep implementation, schemas, contracts, tests, documentation, and generated artifacts consistent. Do not invent undocumented behavior or treat planned directories and capabilities as implemented.
- Use English for source, identifiers, comments, documentation, commit-facing artifacts, database/API descriptions, logs, error codes, tests, scripts, and tooling, except where product localization or external data explicitly requires another language.
- Inspect relevant files and existing patterns before editing. Make the smallest coherent change, preserve unrelated work, and explain assumptions that cannot be verified. Prefer the least irreversible solution when uncertain.
- Respect architectural boundaries and accepted ADRs. Search for an existing equivalent before introducing abstractions, dependencies, or cross-layer relationships. Shared code must represent shared meaning. Report architectural conflicts rather than silently bypassing them; significant new decisions require an ADR.
- Keep one canonical source where practical. Change sources and regenerate derived artifacts instead of hand-editing generated references. Reviewed SQL migrations follow their separate authorship and release rules.
- Update tests and affected documentation when behavior changes. Never weaken validation, typing, tests, security, or observability merely to make a change pass. Verify at the appropriate boundary and report remaining errors or unavailable checks honestly.
- Treat external input as untrusted. Preserve secure defaults and server-side enforcement. Never commit or log secrets, expose internal stack traces to end users, or disable controls for convenience. Expected failures must be explicit and unexpected failures observable.
- For implementation work, follow and maintain the [living plan](docs/implementation-plan.md) and [human-action checklist](docs/human-actions.md). Update affected task/phase statuses, evidence, and dependencies as work progresses and before handoff; record and surface human blockers instead of silently skipping them. Neither document authorizes work beyond the current task.

## Commands and current state

The pnpm workspace, local validation tooling, CI configuration, Approval Request API/PostgreSQL feature, generated OpenAPI/SDK, `apps/web` reference workflow, and Living Documentation Portal exist. A concrete authentication provider has not been selected. Use Node.js 24.13.0 and pnpm 11.25.0; run `pnpm install --frozen-lockfile` to install dependencies and `pnpm validate` before considering substantial work complete. Use [setup](docs/setup.md) for local environment loading and startup. Run individual checks through the scripts in `package.json`. See [validation availability and responsibilities](docs/validation.md) and [CI status](docs/architecture/continuous-integration.md); do not claim a remote check or future capability has run without evidence.

## Conditional reading routes

Read the policies and ADRs relevant to the change; use their task links to reach the applicable sections. Do not load the entire documentation tree by default. Before editing a directory, inspect any applicable nested `AGENTS.md`; closer instructions add local requirements without removing global invariants.

| Change | Start here |
| --- | --- |
| Find current policy or selected technology | [Task index](docs/README.md), [technology map](docs/architecture/technology-decisions.md), [ADR index](docs/adr/README.md) |
| Contributor workflow, dependencies, documentation, or generated artifacts | [Contributing](docs/contributing.md) |
| Placement, applications, shared packages, or imports | [Repository structure](docs/architecture/repository-structure.md), [application boundaries](docs/architecture/application-boundaries.md), [dependency rules](docs/architecture/dependency-rules.md) |
| Database schema or migration | [Database principles](docs/database/principles.md), [migrations](docs/database/migrations.md), [schema documentation](docs/database/schema-documentation.md) |
| Concurrent writes, retries, or delivery | [Transactions](docs/database/transactions-and-concurrency.md), [delivery and side effects](docs/architecture/delivery-and-side-effects.md) |
| API or shared contract | [API principles](docs/api/principles.md), [error contract](docs/api/error-contract.md), [API versioning](docs/api/versioning.md) |
| Configuration, compatibility, tests, or CI | [Configuration](docs/architecture/configuration.md), [compatibility](docs/architecture/versioning-and-compatibility.md), [testing](docs/architecture/testing-strategy.md), [CI](docs/architecture/continuous-integration.md) |
| Telemetry or failure handling | [Observability](docs/reliability/observability.md), [error handling](docs/architecture/error-handling.md), [redaction](docs/security/telemetry-redaction.md) |
| Sensitive data, identity, permissions, production, or incidents | [Security routes](docs/README.md#security-and-operations) |
| ADRs or operational procedures | [ADR authoring](docs/adr/authoring.md), [runbook authoring](docs/runbooks/authoring.md) |

Before editing migration history, verify release status; uncertain history is immutable until verified. A runbook does not grant production authority. Finish by reviewing the diff for unintended changes and applying the [completion criteria](docs/contributing.md#change-workflow).
