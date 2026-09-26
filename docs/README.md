# Documentation Task Index

Choose the route relevant to the change. Policy pages provide section links for focused reading; related policies apply when the change crosses their boundaries. The repository has the Approval Request server, PostgreSQL persistence, generated SDK, and web workflow. [Selected technologies](architecture/technology-decisions.md) are not proof of [implemented commands](validation.md).

## Architecture and implementation

| Task | Authoritative policy |
| --- | --- |
| Execute or track implementation phases | [Living implementation plan](implementation-plan.md) |
| Reproduce development setup, local execution, and the validation gate | [Development setup](setup.md) |
| Run the living API/data/component portal and understand its architecture | [Portal setup](setup.md#living-documentation-portal), [living documentation](architecture/living-documentation.md) |
| Review accepted reference vertical-slice capabilities and limitations | [Phase 9 acceptance](foundation-acceptance.md) |
| Resolve owner decisions, external access, or other human prerequisites | [Human-action checklist](human-actions.md) |
| Understand the reference feature's business rules and acceptance scenarios | [Approval Request](domains/approval-request.md) |
| Implement the reference feature's persistence, concurrency, access, and list contracts | [Approval Request implementation conventions](domains/approval-request-implementation.md) |
| Evaluate architectural tradeoffs or exceptions | [Principles](architecture/principles.md) |
| Find selected technology decisions | [Technology decisions](architecture/technology-decisions.md) |
| Place code or create an application/package | [Repository structure](architecture/repository-structure.md), [application boundaries](architecture/application-boundaries.md) |
| Add imports or shared dependencies | [Dependency rules](architecture/dependency-rules.md) |
| Model failures and translate boundaries | [Error handling](architecture/error-handling.md) |
| Add configuration | [Configuration](architecture/configuration.md) |
| Choose test coverage and execution layers | [Testing strategy](architecture/testing-strategy.md), [validation availability](validation.md) |
| Change independently deployed or persisted contracts | [Versioning and compatibility](architecture/versioning-and-compatibility.md) |
| Handle delivery, retries, and external side effects | [Delivery and side effects](architecture/delivery-and-side-effects.md) |
| Implement CI or dependency automation | [Continuous integration](architecture/continuous-integration.md) |
| Build the first API or regenerate derived references | [Backend execution and generated artifacts](architecture/backend-execution-and-generated-artifacts.md) |
| Run or extend the current API feature | [API runtime](../apps/api/README.md), [API-local instructions](../apps/api/AGENTS.md), [generated OpenAPI](generated/api/openapi.json) |
| Run or extend the web workflow or generated SDK | [Web workflow](../apps/web/README.md), [web-local instructions](../apps/web/AGENTS.md), [SDK source](../packages/sdk/src/index.ts) |
| Change the SDK public surface or generated types | [SDK package guide](../packages/sdk/README.md), [SDK-local instructions](../packages/sdk/AGENTS.md) |
| Trace the reference feature through business rules, contracts, data, errors, tests, and telemetry | [Foundation acceptance map](foundation-acceptance.md#reference-feature-evidence-map) |

## APIs and data

| Task | Authoritative policy |
| --- | --- |
| Design an operation or generate a client | [API principles](api/principles.md) |
| Expose an error | [API error contract](api/error-contract.md) |
| Evolve, deprecate, or retire an API contract | [API versioning](api/versioning.md) |
| Model persistent data and ownership | [Database principles](database/principles.md) |
| Change durable schema or migration history | [Migrations](database/migrations.md) |
| Establish release status, test upgrades, or plan application/database recovery | [Release and evolution workflow](database/release-evolution.md) |
| Document or generate database reference | [Schema documentation](database/schema-documentation.md) |
| Inspect the migrated Approval Request schema | [Generated database reference](generated/database/approval-requests.md) |
| Find the current machine-readable API contract and public errors | [OpenAPI 3.1](generated/api/openapi.json), [generated error registry](generated/api/errors.md) |
| Find the generated frontend component reference | [Web component reference](generated/components/web.md), [component-owned metadata](../apps/web/src/components.docs.json) |
| Protect atomicity or concurrent writes | [Transactions and concurrency](database/transactions-and-concurrency.md) |

## Reliability

| Task | Authoritative policy |
| --- | --- |
| Select or integrate diagnostic signals | [Observability](reliability/observability.md) |
| Add structured events | [Logging](reliability/logging.md) |
| Instrument causal execution and propagation | [Tracing](reliability/tracing.md) |
| Add measurements and bounded dimensions | [Metrics](reliability/metrics.md) |
| Capture and group unexpected failures | [Error reporting](reliability/error-reporting.md) |
| Change startup, liveness, readiness, or shutdown | [Health checks](reliability/health-checks.md) |
| Create actionable alerts | [Alerting](reliability/alerting.md) |

## Security and operations

| Task | Authoritative policy |
| --- | --- |
| Classify, expose, copy, or export data | [Data classification](security/data-classification.md) |
| Capture telemetry fields or payloads | [Telemetry redaction](security/telemetry-redaction.md) |
| Introduce, deliver, rotate, or revoke credentials | [Secrets management](security/secrets-management.md) |
| Verify identity or manage authentication state | [Authentication](security/authentication.md) |
| Enforce capabilities and tenant/resource isolation | [Authorization](security/authorization.md) |
| Access production or perform privileged actions | [Production access](security/production-access.md) |
| Retain, delete, restore, or propagate deletion | [Data retention](security/data-retention.md) |
| Contain an incident and verify recovery | [Incident response](security/incident-response.md) |
| Follow or author an operational procedure | [Runbook index](runbooks/README.md), [authoring](runbooks/authoring.md), [template](runbooks/template.md) |

## Decisions and documentation

- [ADR index](adr/README.md): significant decisions and their rationale; status belongs to each ADR.
- [ADR authoring](adr/authoring.md) and [template](adr/template.md): proposals, acceptance, historical integrity, and supersession.
- [Contributing](contributing.md): change workflow, documentation ownership, canonical sources, maintenance, and review.
- [Global agent instructions](../AGENTS.md): invariants, command availability, and conditional routes.

Current policies describe current architectural expectations. ADRs preserve decision history; [setup](setup.md) and [release evolution](database/release-evolution.md) describe real procedures. Generated references exist for the current API, configuration, errors, database, and web components. The portal renders these sources in the existing web application. No production runbook exists without a selected environment.
