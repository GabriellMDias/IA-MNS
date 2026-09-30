# Orion Implementation Plan

[Documentation index](README.md) · [Human-action checklist](human-actions.md) · [Validation availability](validation.md)

## Purpose and current baseline

This is Orion's living execution plan. It tracks implementation progress of the Orion foundation repository; it does not replace current architectural policy or accepted ADRs. Preserve accepted decisions, rationale, exceptions, and technology responsibilities.

In a project derived from Orion, this plan is inherited foundation history: its statuses and evidence describe the Orion repository, not the project. The project's current plan is `docs/project/implementation-plan.md`, created by [project derivation](project-derivation.md).

Orion now contains documentation, a pnpm workspace, local validation tooling and CI, plus the Approval Request API, PostgreSQL persistence, generated OpenAPI/client, web reference workflow, and project-derivation tooling. `pnpm validate` runs the checks listed in [validation](validation.md). A concrete identity provider and production deployment remain conditional future work. The phase tables below retain stable task IDs, current deliverables, and conditional obligations. Git preserves implementation chronology.

The foundation includes a complete reference feature—persistence, domain/application behavior, API contracts, generated client, web UI, tests, and telemetry—and [living documentation](architecture/living-documentation.md) for its API, database/data dictionary, and frontend components. Human navigation must coexist with AI-readable canonical and generated artifacts. Phases 9-11 are complete; use the acceptance report for evidence and the current maintenance table for active work. Deployment-specific operation is conditional Phase 12. A particular business product and production environment have not been defined.

The [README](../README.md), [principles](architecture/principles.md), [technology map](architecture/technology-decisions.md), and [accepted ADRs](adr/README.md) govern implementation. Later accepted decisions resolve older deferred wording; genuine conflicts must be surfaced rather than silently bypassed. The sequence below is an execution plan, not a new architectural decision.

## Maintaining this plan

The final foundation audit is complete locally, including a full clean-checkout gate. The owner reported H-12 manual browser acceptance complete on 2026-09-29; automated validation is recorded independently in the [acceptance report](foundation-acceptance.md#final-foundation-audit). A submitted PR must satisfy its own required CI gate before merge. Deployment-specific Phase 12 remains excluded.

| Task | Scope | Status | Evidence / dependency |
| --- | --- | --- | --- |
| L1 | Review portal architecture and implement local document catalog, detail pages, hierarchy, and search. | completed | [Portal architecture](architecture/living-documentation.md): generated local Markdown, hierarchical collections, lazy detail assets and scoped worker search within the existing React/Vite app. |
| L2 | Improve API, data dictionary, component experience and safe interactive route exploration. | completed | Generated contract/schema detail pages, local component examples and an explicit, bounded same-origin API explorer; browser acceptance is tracked separately in L4. |
| L3 | Verify generation, security, clean setup, non-browser checks and available CI evidence. | completed | [Current review evidence](foundation-acceptance.md#living-documentation-portal-review): reproducible generation, installation, build, and security checks passed; the 2026-09-29 local full gate also passed. Remote CI requires its own evidence. |
| L4 | Verify final browser navigation, responsive layout, accessibility, previews and API exploration. | completed | Owner reported manual browser acceptance complete on 2026-09-29 under [H-12](human-actions.md#h-12). This is human-observed acceptance; automated suite evidence is tracked separately. |

Final foundation audit (2026-09-29): architecture, backend, persistence, frontend, generated references, security, developer workflow, documentation, and CI have been reviewed and actionable local gaps closed. The [acceptance report](foundation-acceptance.md#final-foundation-audit) records the fixes, full local gate, and clean-checkout evidence. PR/remote CI is verified separately before integration.

Completed maintenance: comprehensive documentation review (2026-09-26–27). Deployment-specific Phase 12 remains excluded and unstarted.

| Task | Scope | Status | Evidence / dependency |
| --- | --- | --- | --- |
| D1 | Review every file under `docs/`, every repository `AGENTS.md`, and every repository `README.md`. | completed | All 79 scoped files reviewed, including generated references and all seven instruction files and seven READMEs. [Review evidence](foundation-acceptance.md#documentation-maintenance-review). |
| D2 | Improve navigation, ownership, clarity, current truth, and context efficiency while preserving requirements and accepted decisions. | completed | 66 Markdown files improved; canonical task/source routes and focused policies replace repeated guidance and stale history. Generated sources/output and accepted ADR substance remain intact. |
| D3 | Verify semantic preservation, links, full validation, and the final diff; reconcile human actions. | completed | Frozen install, `pnpm validate`, final documentation/reference checks, and diff review passed. Semantic cross-review completed; all 12 ADR bodies and 85 original task IDs/statuses preserved. No human action required. |

The documentation review's [implementation concerns](foundation-acceptance.md#implementation-concerns-identified-during-review) were subsequently addressed in the final foundation audit. New database object kinds still need deliberate generator support before adoption; deployed operational choices remain conditional Phase 12 work. No human action is needed for the current foundation audit.

Agent portability and project derivation (2026-09-29): Orion's instructions become agent-neutral, and real projects can be derived from Orion with recorded provenance and reviewable upgrades. The implementation is complete and merged. Commit identity remains the provenance source; the [foundation versioning policy](versioning.md) defines human-readable stable release tags without changing derivation mechanics. The next activity after the first tag is an owner-observed derivation exercise in a separate real GitHub repository, which is acceptance reverification rather than unfinished implementation. Deployment-specific Phase 12 remains excluded and unstarted.

| Task | Scope | Status | Evidence / dependency |
| --- | --- | --- | --- |
| AP1 | Verify how current Codex, Claude Code, and Gemini CLI discover repository instructions; generalize agent-specific normative wording. | completed | [Verified behavior](architecture/agent-instructions.md#tool-specific-compatibility). Codex-specific obligations in this plan and the [checklist](human-actions.md#maintaining-this-checklist) now apply to any contributor or agent; no other normative agent-specific wording was found. |
| AP2 | Keep `AGENTS.md` canonical, add only necessary thin adapters, and enforce the rule. | completed | [ADR-0013](adr/0013-keep-agents-md-as-the-agent-neutral-instruction-source.md), [`.gemini/settings.json`](../.gemini/settings.json), `pnpm agents:check` and `pnpm agents:test`. No `CLAUDE.md` or `GEMINI.md` is needed. |
| PD1 | Decide the derivation model and machine-readable provenance record. | completed | [ADR-0014](adr/0014-derive-projects-from-orion-through-git-ancestry-with-recorded-provenance.md) and [`.orion/project.json`](../.orion/project.json); portal source links derive from the manifest. |
| PD2 | Implement guarded project initialization: protected upstream, project identity, project-owned plan and human actions, and the Approval Request disposition. | completed | [Project derivation](project-derivation.md#start-a-new-project), `tooling/project/`, and `pnpm orion:test` against disposable local Git repositories. |
| PD3 | Implement provenance inspection, upstream configuration, baseline recording, and validation for reviewable upgrades. | completed | [Upgrade workflow](project-derivation.md#upgrade-to-a-newer-orion-revision); `pnpm orion:check` runs in `pnpm validate` and enforces the [remote rules](project-derivation.md#remote-rules) while allowing fork or mirror origins. Project human action PH-02 keeps merge commits available for upgrade pull requests. |
| PD4 | Exercise initialization from a pristine clone and validate both Orion and the derived checkout. | completed | [Acceptance evidence](foundation-acceptance.md#agent-portability-and-project-derivation): full gates passed in Orion and in a freshly initialized project; the upgrade merge, baseline recording, and teammate upstream setup were exercised. |
| PD5 | Submit the change for review and verify the required remote CI gate. | completed | [PR #15](https://github.com/GabriellMDias/Orion/pull/15) ([H-13](human-actions.md#h-13)). Review hardened the change: one CodeQL test-code alert and five Codex P2 findings, covering branch tracking of `orion-upstream`, explicit ports, repository path case, every `origin` URL before initialization, and foundation-remote verification before recording a baseline. All were fixed with regression tests and answered in their review threads. A third Codex review could not run because the review quota was exhausted, so it is not evidence; the owner reviewed the final code against the five findings instead. On final head `601587c` the [required gate](https://github.com/GabriellMDias/Orion/actions/runs/36637414096), Validate, Dependency review, CodeQL (no new alerts), both Analyze jobs, and GitGuardian passed. Merged into `main` by merge commit `01f4da03d3ab1f9de02d7a3f4e0cc885c7d09f29`. |
| V1 | Define stable Orion foundation version names and compatibility meaning before the GitHub-backed derivation exercise. | completed | [Versioning policy](versioning.md) and [ADR-0015](adr/0015-name-stable-orion-foundation-revisions-with-semantic-tags.md) keep Git SHA provenance and commit-based upgrades; this change creates no tag or release. Local documentation and full-gate evidence is recorded in the policy PR. Review, CI, merge, and tag creation remain subsequent release steps. |

Every contributor or coding agent performing implementation work must maintain this document and the [human-action checklist](human-actions.md) throughout implementation, within the user's authorized scope.

1. Before implementation, inspect actual repository state, the relevant phase, its prerequisites, governing policy, and linked human actions. Do not treat a planned capability or unchecked action as available.
2. Mark a task `in progress` when work actually starts. Update statuses when evidence, scope, dependencies, or blockers change, and before each handoff or completion report.
3. Record task-level progress in the tables below. Add finer tasks with stable IDs when needed; do not hide unfinished subtasks inside a completed row.
4. Record concise evidence in active task rows or the phase's `Current evidence` section: implementation paths, validation commands/results, review references, or a linked decision. Keep task-specific exceptions and unavailable or failing checks linked to the affected task. Do not store secret values or sensitive output.
5. A phase becomes `completed` only when its tasks, deliverables, applicable acceptance criteria, and required human actions are satisfied with evidence. A partial implementation or unavailable required check is not completion.
6. When human intervention is necessary, add or update an action with an ID, exact need, dependency, safe input instructions, and verification method. Link it from the affected task, mark that task `blocked`, and tell the user what is needed. Continue independent authorized work where possible.
7. A future prerequisite is `pending`, not automatically `blocked`. A phase may remain `in progress` while some tasks are blocked; use phase status `blocked` when no meaningful remaining work can proceed. Keep task-level blockers visible either way.
8. When scope or sequencing changes, use `changed`, explain why and what replaces the work, and link supporting decisions. Then give active replacement work its own status. Keep a concise record below; Git preserves detailed history. Do not delete unresolved obligations to make the plan look complete.
9. Update command availability, current documentation, generated artifacts, and the checklist in the same coherent change where applicable. Do not change ADR status merely to record implementation progress.

| Status | Meaning |
| --- | --- |
| `pending` | Not started; includes conditional work whose trigger has not occurred. |
| `in progress` | Work has started and is incomplete. |
| `completed` | Applicable deliverables and acceptance criteria are satisfied with evidence. |
| `blocked` | The identified work cannot proceed without a recorded dependency, decision, access, or correction. |
| `changed` | Scope, applicability, or sequencing was explicitly revised; reason and replacement/disposition are recorded. |

## Constraints throughout implementation

- Retain the accepted stack and its version/upgrade qualifications: TypeScript/ESM, Node.js LTS, pnpm, Fastify, PostgreSQL, Prisma 7, TypeBox, generated OpenAPI, openapi-typescript/openapi-fetch, React/Vite/TanStack, the accepted testing stack, OpenTelemetry/Pino, GitHub Actions, and Renovate. Exact compatible versions belong in tooling; incompatibilities require explicit resolution rather than silent substitution.
- Add dependencies, directories, packages, and validation capabilities only when they serve real implemented responsibilities. Illustrative trees are not a scaffold checklist.
- Deliver tests, security controls, telemetry, and documentation with the behavior they protect. Later hardening phases extend that baseline rather than excuse omissions.
- Preserve domain/application independence from transport and persistence implementation; share code only for shared meaning.
- Keep generated artifacts reproducible and subordinate to canonical sources. Reviewed SQL migrations retain their separate release-history rules.
- Keep root `AGENTS.md` concise. Add local instructions only for implemented areas with distinct needs.
- Require non-mutating `pnpm validate` for substantial changes, using the same capabilities locally and in CI. Never represent absent tests or generators as passing checks.
- Each phase leaves a coherent usable state. Split phases into small changes that preserve the checks and capabilities already delivered.

## Phase status

This table owns phase-level status; the tables within each phase own task-level status. Human-action IDs link to the separate checklist, which owns their details and completion evidence.

| Phase | Objective | Status | Dependencies | Current evidence or blocker |
| --- | --- | --- | --- | --- |
| [1](#phase-1) | Reproducible workspace and local validation | completed | None | See [current evidence](#phase-1). |
| [2](#phase-2) | CI and dependency security | completed | 1 | See [current evidence](#phase-2). |
| [3](#phase-3) | Reference feature and immediate decisions | completed | 1-2; discovery may begin earlier | See [current evidence](#phase-3). |
| [4](#phase-4) | Observable API runtime | completed | 1-3 | See [current evidence](#phase-4). |
| [5](#phase-5) | Secure persistence-backed API feature | completed | 3-4 and CI | See [current evidence](#phase-5). |
| [6](#phase-6) | Generated client and complete web workflow | completed | 5 | See [current evidence](#phase-6). |
| [7](#phase-7) | Failure recovery, concurrency, and data lifecycle | completed | 5-6 | See [current evidence](#phase-7). |
| [8](#phase-8) | Safe evolution and reproducible artifacts | completed | 5-7; actual baselines where applicable | See [current evidence](#phase-8). |
| [9](#phase-9) | Reference vertical-slice acceptance and contributor handoff | completed | 1-8 | See [current evidence](#phase-9). |
| [10](#phase-10) | Documentation architecture, simplification, and developer setup | completed | 9 | See [current evidence](#phase-10). |
| [11](#phase-11) | Living Documentation Portal | completed | 10 | See [current evidence](#phase-11). |
| [12](#phase-12) | Deployment-specific operationalization | pending | 11 and concrete deployment requirements | Conditional; no deployment selected. |

## Phase 1

### Reproducible workspace and local validation

**Scope:** Turn the documentation foundation into a working, verifiable development environment.

**Current evidence:** [Workspace manifests](../package.json), [setup](setup.md), and [validation](validation.md) own current commands and prerequisites.

| Task | Current deliverable or conditional disposition | Status |
| --- | --- | --- |
| P1.1 | Establish pnpm workspace configuration, a committed shared lockfile, mechanically pinned Node.js/pnpm versions, and compatible tool versions. | completed |
| P1.2 | Configure strict TypeScript and ESM for actual repository tooling. | completed |
| P1.3 | Implement Prettier checks, ESLint Flat Config with typescript-eslint, `tsc`, and dependency-cruiser. | completed |
| P1.4 | Introduce `pnpm validate` with independently runnable checks; keep formatting and automatic fixes separate. | completed |
| P1.5 | Add documentation link/anchor validation and useful checks for existing ADR metadata. | completed |
| P1.6 | Enforce applicable dependency rules and expand them as applications and packages appear. | completed |
| P1.7 | Document installation, prerequisites, real commands, and actionable diagnostics; update availability statements. | completed |

**Dependencies:** None. Request host administration only if inspection demonstrates it is needed; see [H-06](human-actions.md#h-06).

**Validation/acceptance criteria:**

- A clean checkout can install from the frozen lockfile and execute all implemented checks.
- Validation leaves tracked source files unchanged.
- Representative formatting, type, link, and dependency violations fail with useful diagnostics.
- First-party package dependencies resolve explicitly through `workspace:` where applicable.
- Documentation distinguishes available checks from future capabilities.

**Governing sources:** [Validation](validation.md), [dependency rules](architecture/dependency-rules.md), ADRs 0001-0003 in the [ADR index](adr/README.md).

## Phase 2

### CI and dependency security

**Scope:** Make repository validation an enforceable delivery gate.

**Current evidence:** [CI workflow](../.github/workflows/ci.yml), [Renovate configuration](../renovate.json), and [CI policy](architecture/continuous-integration.md) define current behavior. Dated platform verification belongs to [H-01](human-actions.md#h-01), [H-02](human-actions.md#h-02), and [H-03](human-actions.md#h-03).

| Task | Current deliverable or conditional disposition | Status |
| --- | --- | --- |
| P2.1 | Add GitHub Actions validation for pull requests, the primary branch, and manual execution. | completed |
| P2.2 | Consume repository-pinned toolchain versions, frozen installation, and repository commands rather than CI-only correctness logic. | completed |
| P2.3 | Expose a stable aggregate required check that fails when required work fails or does not complete. | completed |
| P2.4 | Pin external actions to immutable SHAs, minimize permissions, and isolate untrusted PR execution from privileged credentials. | completed |
| P2.5 | Configure Renovate with its dashboard, weekly routine updates, coherent groups, visible major upgrades, and automerge disabled initially; do not delay security remediation to the routine window. | completed |
| P2.6 | Configure and verify branch protection and supported GitHub security capabilities; record entitlement limitations. | completed |
| P2.7 | Bound diagnostic artifact retention and cancel superseded PR runs where appropriate. | completed |

**Dependencies:** Phase 1. External administration is tracked separately from repository changes.

**Validation/acceptance criteria:**

- The same revision passes equivalent local and CI validation.
- A failing required job cannot produce a successful aggregate gate.
- Cache misses remain reproducible.
- PR validation requires no production credentials.
- Dependency review blocks newly introduced high/critical vulnerabilities where available, subject to reviewed exceptions.
- External settings are verified; workflow files alone do not count as branch protection.

**Governing source:** [ADR-0011](adr/0011-establish-continuous-integration-dependency-automation-and-supply-chain-security-strategy.md).

## Phase 3

### Define the reference feature and immediate implementation details

**Scope:** Establish concrete behavior before creating business models or security assumptions.

**Current evidence:** [Business rules](domains/approval-request.md), [implementation conventions](domains/approval-request-implementation.md), and [execution/artifact conventions](architecture/backend-execution-and-generated-artifacts.md) record the H-04/H-05 decisions and accepted implementation boundaries.

| Task | Current deliverable or conditional disposition | Status |
| --- | --- | --- |
| P3.1 | Select the reference feature with the project owner; orders/payments in existing examples are not product requirements. | completed |
| P3.2 | Define actors, use cases, ownership, invariants, state transitions, expected failures, side effects, and acceptance scenarios. | completed |
| P3.3 | Specify data classifications/lifecycle and determine required authentication, authorization, tenancy, audit history, and integrations. | completed |
| P3.4 | Resolve feature placement, identifiers, timestamps, transaction ownership, schema metadata, API errors, and pagination where applicable. | completed |
| P3.5 | Decide backend development/build execution and generated-artifact storage conventions. | completed |
| P3.6 | Record significant new architectural choices through the ADR process; keep ordinary conventions near their owners. | completed |

**Dependencies:** Phases 1-2; requirements discovery may begin earlier. Owner inputs do not block independent foundation tooling work.

**Validation/acceptance criteria:**

- Every planned business behavior traces to a stated requirement.
- Protected and anonymous operations are explicitly distinguished.
- Required security choices are resolved before protected operations are exposed.
- No invented tenancy, permissions model, retention duration, authentication provider, or deployment target.
- The feature can be delivered incrementally without speculative infrastructure.

**Governing sources:** [Principles](architecture/principles.md), [authentication](security/authentication.md), [authorization](security/authorization.md), [classification](security/data-classification.md), [retention](security/data-retention.md).

## Phase 4

### Observable API runtime

**Scope:** Establish a runnable backend with correct lifecycle and boundary behavior.

**Current evidence:** [API guide](../apps/api/README.md), API configuration/lifecycle/telemetry tests, and [process smoke](../apps/api/scripts/smoke.mjs) cover bootstrap, health, redaction, correlation, bounded shutdown, and exporter failure.

| Task | Current deliverable or conditional disposition | Status |
| --- | --- | --- |
| P4.1 | Create `apps/api` with an explicit composition root and Fastify transport boundary. | completed |
| P4.2 | Implement TypeBox bootstrap configuration with explicit parsing, validation, safe defaults, immutable typed values, and centralized environment access. | completed |
| P4.3 | Separate server-only configuration from client-eligible values. | completed |
| P4.4 | Initialize Pino/OpenTelemetry before instrumented infrastructure, with preferred Fastify instrumentation, W3C propagation, and configurable OTLP export. | completed |
| P4.5 | Implement centralized redaction and request/log/trace correlation. | completed |
| P4.6 | Establish the public error envelope and a small canonical registry for errors actually used. | completed |
| P4.7 | Implement distinct startup, liveness, readiness, and bounded shutdown behavior. | completed |
| P4.8 | Add configuration, HTTP-boundary, error, lifecycle, and telemetry tests. | completed |

**Dependencies:** Phases 1-3. [H-07](human-actions.md#h-07) applies only if a selected external integration actually requires provisioning; local telemetry verification must not depend on a purchased vendor.

**Validation/acceptance criteria:**

- Invalid required configuration fails before accepting work.
- Health responses disclose no secrets or internal diagnostics.
- Shutdown stops accepting work and attempts bounded cleanup/telemetry flushing.
- Unexpected errors produce safe public responses and one authoritative diagnostic capture.
- Correlation remains isolated between concurrent requests.
- Telemetry export failure does not normally fail business operations.
- Fastify request injection exercises real validation and serialization.

**Governing sources:** [Configuration](architecture/configuration.md), [error contract](api/error-contract.md), [health checks](reliability/health-checks.md), [ADR-0010](adr/0010-establish-observability-logging-tracing-metrics-and-error-reporting-strategy.md).

## Phase 5

### First secure, persistence-backed API feature

**Scope:** Deliver the first useful backend capability across its complete server-side path.

**Current evidence:** [Reference evidence map](foundation-acceptance.md#reference-feature-evidence-map) links implemented domain, persistence, HTTP, JWT authorization, rate limiting, metadata and real PostgreSQL tests. [ADR-0012](adr/0012-verify-jwt-access-tokens-at-the-first-api-boundary.md) governs identity verification; H-07 remains conditional.

| Task | Current deliverable or conditional disposition | Status |
| --- | --- | --- |
| P5.1 | Implement selected domain rules and application operations in cohesive feature boundaries. | completed |
| P5.2 | Introduce PostgreSQL/Prisma 7 for actual durable data, reviewed migrations, constraints, explicit transactions, and persistence adapters. | completed |
| P5.3 | Separate runtime and migration credentials. | completed |
| P5.4 | Implement required identity verification and authorization before exposing protected operations; test with synthetic identities. | completed |
| P5.5 | Define TypeBox requests/responses, unique stable operation IDs, expected errors, and deliberate transport mappings. | completed |
| P5.6 | Generate OpenAPI 3.1.x from executable contracts and route metadata. | completed |
| P5.7 | Document every application-owned table/column, including ownership, relevant classification, units, null semantics, and lifecycle. | completed |
| P5.8 | Generate physical database reference from migrated PostgreSQL, accounting for custom SQL. | completed |
| P5.9 | Add Vitest unit and integration tests using Testcontainers, real PostgreSQL, committed migrations, and Fastify injection. | completed |

**Dependencies:** Phases 3-4 and continuing CI enforcement.

**Validation/acceptance criteria:**

- Committed migrations reproducibly create a fresh database.
- The feature works through HTTP and persists correctly.
- Invalid requests, domain rejection, missing resources, and conflicts have explicit semantics.
- Required authorization allow/deny paths pass, including resource/tenant isolation where applicable.
- Constraints and concurrent writes protect intended invariants.
- Prisma/Fastify types do not leak into domain behavior or public contracts.
- Missing schema descriptions and stale generated references fail validation.

**Governing sources:** [Database policy](database/principles.md), [schema documentation](database/schema-documentation.md), [transactions](database/transactions-and-concurrency.md), [API policy](api/principles.md), ADRs 0005-0007 and 0009 in the [ADR index](adr/README.md).

## Phase 6

### Generated client and complete web reference workflow

**Scope:** Complete the reference feature through a real browser experience.

**Current evidence:** [SDK guide](../packages/sdk/README.md), [web guide](../apps/web/README.md), component tests, and [browser journeys](../apps/web/test/e2e/approval.spec.ts) cover the actual API/database workflow and client boundaries. No concrete provider login flow is implemented.

| Task | Current deliverable or conditional disposition | Status |
| --- | --- | --- |
| P6.1 | Generate client types from OpenAPI with openapi-typescript and compose the thin openapi-fetch client. | completed |
| P6.2 | Preserve structured errors and unknown safe error codes without importing backend implementation. | completed |
| P6.3 | Create `apps/web` with React 19.x, Vite 8.x, React Compiler where compatible, TanStack Router, and TanStack Query. | completed |
| P6.4 | Assign server state to Query, navigation/shareable state to Router, and interaction state to React. | completed |
| P6.5 | Implement loading, empty, success, validation, denied, conflict, and failure states for the reference workflow. | completed |
| P6.6 | Integrate the selected authentication flow when required. | completed |
| P6.7 | Address keyboard interaction, focus, accessibility, and client-safe configuration. | completed |
| P6.8 | Add real-browser component/feature tests and critical full-stack Playwright journeys. | completed |

**Dependencies:** Phase 5.

**Validation/acceptance criteria:**

- Chromium completes the critical journey through the actual API and PostgreSQL.
- Refresh/navigation preserve URL-owned state.
- Mutations update or invalidate cached state correctly.
- UI visibility is never the only authorization control.
- Browser bundles contain no server-only dependencies or secrets.
- Client contracts regenerate without manual changes.
- Browser-dependent tests use real browser behavior; pure logic stays in cheaper Node tests.

**Governing sources:** [ADR-0007](adr/0007-establish-api-contract-openapi-sdk-and-configuration-schema-strategy.md), [ADR-0008](adr/0008-select-react-vite-and-tanstack-for-web-applications.md), [testing strategy](architecture/testing-strategy.md).

## Phase 7

### Failure recovery, concurrency, and data lifecycle

**Scope:** Prove the completed feature behaves safely under realistic failures. This extends controls already delivered, rather than deferring basic correctness.

**Current evidence:** [Failure tests](../apps/api/test/approval-failure.test.ts), [restart smoke](../apps/api/scripts/feature-smoke.ts), and [retry ownership](domains/approval-request-implementation.md#failure-recovery-and-retry-ownership) cover unknown outcomes, replay, rollback, conflicts and safe diagnostics. Conditional tasks retain their dispositions below.

| Task | Current deliverable or conditional disposition | Status |
| --- | --- | --- |
| P7.1 | Exercise concurrent operations, stale updates, duplicate submissions, timeouts, dependency failures, and process interruption. | completed |
| P7.2 | Define retry ownership/limits and unknown-outcome handling; add durable idempotency only where semantics require it. | completed |
| P7.3 | Implement required retention/deletion behavior, including existing derived copies and partial-failure recovery. Not applicable to the approved reference feature: [H-04](human-actions.md#h-04) defines no automatic deletion or retention duration, and no persisted derived copy exists. Production retention/disposal policy remains conditional under [H-09](human-actions.md#h-09); no deletion workflow can be specified without that requirement. | changed |
| P7.4 | Implement dedicated audit persistence if authoritative business audit history is required. Not applicable: [H-04](human-actions.md#h-04) explicitly defines no authoritative business-audit persistence requirement. Operational diagnostics are not an audit trail. | changed |
| P7.5 | Review automatic instrumentation, redaction, bounded metrics, and expected/unexpected failure classification. | completed |
| P7.6 | Add outbox/inbox, reconciliation, compensation, or workers only if the feature has corresponding durable delivery requirements. Not applicable: [H-04](human-actions.md#h-04) defines no external effect or integration; no delivery pipeline, external atomicity claim, or compensating action exists. | changed |

**Dependencies:** Phases 5-6. External prerequisites go through [H-07](human-actions.md#h-07) only when activated by actual requirements.

**Validation/acceptance criteria:**

- Duplicate/concurrent requests cannot create prohibited effects.
- Retries cannot silently multiply across layers.
- Timeouts are not treated as proof that an operation did nothing.
- Atomic operations roll back correctly; external effects are not falsely described as transactionally reversible.
- Applicable deletion workflows are repeatable and observable; partial completion is not reported as success.
- Redaction tests cover logs, traces, errors, and diagnostic artifacts.
- No unsupported exactly-once guarantees.

**Governing sources:** [Delivery and side effects](architecture/delivery-and-side-effects.md), [transactions](database/transactions-and-concurrency.md), [retention](security/data-retention.md), [redaction](security/telemetry-redaction.md).

## Phase 8

### Safe evolution and reproducible artifacts

**Scope:** Demonstrate that Orion can evolve safely beyond its initial implementation.

**Current evidence:** [Release registry](../apps/api/prisma/release-history.json), [guard and fixture tests](../tooling/validate/release-history.test.ts), and [evolution procedure](database/release-evolution.md) protect durable history and reproducible references. An empty registry does not prove there is no unlisted persistent environment.

| Task | Current deliverable or conditional disposition | Status |
| --- | --- | --- |
| P8.1 | Establish durable migration release-status detection before the first persistent release. | completed |
| P8.2 | Protect released migration history while preserving safe refinement of unreleased history. | completed |
| P8.3 | Test fresh installation and upgrades from actual supported released baselines once they exist. Fresh migrations pass `pnpm references:check`, migrated-PostgreSQL tests, and the emitted-process smoke. Historical upgrade tests are not applicable yet: no actual released baseline or supported old/new combination is evidenced. [H-08](human-actions.md#h-08) will activate them; no synthetic baseline was created. | changed |
| P8.4 | Introduce released API baselines and compatibility checks when independently evolving consumers require them. Conditional: no independently released API/consumer or supported historical contract is evidenced. Current OpenAPI/SDK regeneration remains checked; [H-08](human-actions.md#h-08) activates a real baseline when needed. | changed |
| P8.5 | Review structural/semantic compatibility of errors, authorization, ordering, pagination, defaults, and side effects. | completed |
| P8.6 | Verify generators/builds from clean canonical inputs; document safe application rollback versus database forward recovery. | completed |
| P8.7 | Define removal conditions for real temporary compatibility paths. Conditional: no temporary compatibility shim, deprecated endpoint, dual-write, or retained old payload exists. [Evolution workflow](database/release-evolution.md#review-api-and-temporary-compatibility) states what a future real path must record before removal. | changed |

**Dependencies:** Phases 5-7; historical checks require genuine baselines. Record conditional tasks as changed with a justified deferral when no released boundary exists, rather than falsely completed.

**Validation/acceptance criteria:**

- Released migration edits are detected when a released baseline exists.
- Supported upgrades preserve required data and application compatibility.
- Breaking contracts are detected where mechanically expressible and receive semantic review.
- Regeneration reveals drift without silently fixing tracked files during validation.
- Old/new compatibility tests cover actual supported combinations.
- Unreleased work is not burdened with unnecessary permanent versioning.

**Governing sources:** [Migrations](database/migrations.md), [compatibility](architecture/versioning-and-compatibility.md), [API versioning](api/versioning.md).

## Phase 9

### Reference vertical-slice acceptance and contributor handoff

**Scope:** Accept the implemented reference vertical slice and its contributor handoff against the Phase 9 criteria.

**Current evidence:** [Reference acceptance](foundation-acceptance.md#phase-9-acceptance-checks) owns acceptance evidence and limitations; the [source map](foundation-acceptance.md#reference-feature-evidence-map) is the route to reusable implementation patterns.

| Task | Current deliverable or conditional disposition | Status |
| --- | --- | --- |
| P9.1 | Exercise clean-environment onboarding: install, configure, initialize data, run apps, validate, regenerate, and build. | completed |
| P9.2 | Verify the reference feature demonstrates established patterns without becoming a generic framework. | completed |
| P9.3 | Review public APIs, ownership, dependency enforcement, and local documentation. | completed |
| P9.4 | Keep root instructions concise and add scoped instructions only for distinct implemented obligations. | completed |
| P9.5 | Complete navigation among feature behavior, contracts, schema, errors, tests, telemetry, and real procedures. | completed |
| P9.6 | Reconcile implementation availability and stale references without changing architectural decisions. | completed |
| P9.7 | Review remaining gaps against applicable policies and produce an evidence-backed acceptance report. | completed |

**Dependencies:** Phases 1-8, including applicable external prerequisites. Conditional future work is not automatically required for foundation acceptance.

**Validation/acceptance criteria:**

- A contributor reproduces the complete workflow using repository instructions.
- Full `pnpm validate` passes locally and through the required CI gate.
- Generated artifacts are current; builds/tests are reproducible.
- Architectural violations, important denial paths, and sensitive-data leaks have appropriate mechanical protection.
- Required Phase 9 reference-vertical-slice capabilities are implemented and conditional capabilities explicitly identified; portal acceptance is tracked separately in completed Phase 11.
- No speculative package, mandatory external vendor, or undocumented setup step is needed.

**Governing sources:** [Contributing](contributing.md), [principles](architecture/principles.md), [repository structure](architecture/repository-structure.md), [runbook authoring](runbooks/authoring.md).

## Phase 10

### Documentation architecture, simplification, and developer setup

**Scope:** Make current requirements and setup easy to find and reason about, and define the canonical-to-generated documentation flow before building the portal.

**Current evidence:** [Setup](setup.md) owns environment loading, regeneration, and the disposable `pnpm dev:approval` workflow; `.env.example` is schema-checked. [Living-documentation architecture](architecture/living-documentation.md) owns canonical-to-generated responsibilities.

| Task | Current deliverable or conditional disposition | Status |
| --- | --- | --- |
| P10.1 | Audit the full documentation tree for current scope, navigation, stale wording, duplicate onboarding, and overly verbose policy. Preserve normative meaning and accepted ADR rationale. | completed |
| P10.2 | Establish one canonical `docs/setup.md` and a safe `.env.example` checked against configuration schema/reference metadata; document actual API/web/migration loading boundaries. | completed |
| P10.3 | Simplify and reconnect policy and index pages where this reduces local context without hiding ownership, constraints, or conditional requirements. | completed |
| P10.4 | Specify living-documentation ownership, generation, navigation, safety, freshness, and acceptance for API, data dictionary, and components. | completed |
| P10.5 | Align plan, human actions, and validation with the intended foundation scope; run the full applicable gate and review the final documentation diff. | completed |

**Dependencies:** Phase 9 reference vertical slice and current canonical/generated sources. No external owner action or deployed environment is required.

**Validation/acceptance criteria:**

- A new contributor can find setup, current policies, generated API/data references, and the portal boundary from the README and task index.
- Setup commands load configuration as documented; `.env.example` contains no credentials and fails validation on drift from the API configuration reference.
- Documentation links/anchors and normative requirements remain intact; accepted ADR decisions and rationale are unchanged.
- `pnpm validate` passes locally and in the Phase 10 PR; the existing portal remains consistent with its canonical sources.

**Governing sources:** [Contributing](contributing.md), [configuration](architecture/configuration.md), [schema documentation](database/schema-documentation.md), [API principles](api/principles.md), and [living documentation](architecture/living-documentation.md).

## Phase 11

### Living Documentation Portal

**Scope:** Deliver the human-facing, navigable living documentation required by Orion's foundation while retaining reproducible AI-readable artifacts.

**Current evidence:** [Foundation acceptance](foundation-acceptance.md#phase-11-foundation-acceptance) owns portal source, generation, clean-checkout preview, browser and CI evidence. Foundation completion does not activate Phase 12.

| Task | Current deliverable or conditional disposition | Status |
| --- | --- | --- |
| P11.1 | Choose the smallest coherent portal/component-documentation implementation within existing application/package boundaries; record a new ADR only if the ADR policy requires one. | completed |
| P11.2 | Render the current TypeBox/OpenAPI operations, schemas, authentication, and stable public errors from canonical/generated API sources. | completed |
| P11.3 | Render the migrated PostgreSQL structure and schema-adjacent data dictionary, including ownership, classification, null semantics, lifecycle, and constraints as recorded. | completed |
| P11.4 | Add component-owned examples/metadata and a generated AI-readable component reference for real web components; show states, accessibility, and usage in the human interface. | completed |
| P11.5 | Provide clear navigation and links among API, data, components, domain policy, and canonical artifacts; make the portal reachable from the README and docs index. | completed |
| P11.6 | Add deterministic generation/freshness, missing-metadata, link, and sensitive-content checks to the shared local/CI validation path; document regeneration commands. | completed |
| P11.7 | Exercise a clean setup, portal build/serve, browser navigation and representative pages, accessibility at the relevant UI boundary, generated-artifact drift failures, and the full gate; report acceptance evidence. | completed |

**Dependencies:** Phase 10 and the implemented API, database, and web reference feature. A concrete identity provider or production deployment is not required to document current behavior.

**Validation/acceptance criteria:**

- Humans can navigate the API, database/data dictionary, and frontend components in a working local interface, with links to their canonical and AI-readable sources.
- No page invents business semantics or exposes real secrets/data; API and database pages reflect current generated artifacts, and component pages reflect actual source/examples.
- Generated representations are reproducible from documented inputs, and `pnpm validate`/CI fail on stale output or missing required metadata.
- Clean-checkout setup, portal build/serve, representative browser flows, and full validation pass with evidence. The foundation is complete only after these criteria pass.

**Governing sources:** [Living documentation](architecture/living-documentation.md), [API principles](api/principles.md), [schema documentation](database/schema-documentation.md), [contributing](contributing.md), and [validation](validation.md).

## Phase 12

### Deployment-specific operationalization

**Objective:** Make an Orion application operable in a selected real environment. **Not started.** This phase is conditional on concrete requirements and authorized scope; the documentation review does not activate it.

| Task | Main work | Status | Evidence / dependency |
| --- | --- | --- | --- |
| P12.1 | Establish hosting, release model, supported consumers, workload, service/recovery objectives, and operational owners. | pending | [H-09](human-actions.md#h-09). |
| P12.2 | Select deployment-specific secrets, identity, database hosting, telemetry storage, and access mechanisms. | pending | [H-09](human-actions.md#h-09), [H-10](human-actions.md#h-10). |
| P12.3 | Introduce deployment definitions/CD after requirements exist; configure migrations, rollout order, readiness/draining, release identity, and recovery. | pending | [H-10](human-actions.md#h-10) for unavailable external administration. |
| P12.4 | Establish backups, retention, deletion-after-restore handling, and access separation. | pending | [H-09](human-actions.md#h-09), [H-10](human-actions.md#h-10). |
| P12.5 | Add dashboards and actionable alerts grounded in real service objectives or operational limits. | pending | [H-09](human-actions.md#h-09), [H-10](human-actions.md#h-10). |
| P12.6 | Create real runbooks for implemented failures, deployment/migration recovery, credential exposure, and restore. | pending | Not started. |
| P12.7 | Exercise staging deployment, restore, credential rotation, failure response, and the critical user journey. | pending | Environment/access prerequisites from [H-10](human-actions.md#h-10). |
| P12.8 | Resolve licensing before distribution where necessary; no license has been selected. | pending | [H-11](human-actions.md#h-11). |

**Expected deliverables:** Environment-specific infrastructure, release procedures/automation, access configuration, dashboards/alerts, exercised runbooks, and release evidence.

**Dependencies:** The completed development foundation through Phase 11 plus explicit product, deployment, and organizational requirements. A future deployment is not a prerequisite for foundation completion.

**Validation/acceptance criteria:**

- The exact release artifact passes validation and deployment smoke tests.
- Deployment/migration identities follow least privilege; supported privileged automation prefers short-lived identity.
- Backup restoration proves service/data recovery, including relevant deletions and revocations.
- Alerts have owners, justified thresholds, safe context, and actionable responses.
- Tested procedures identify access, preconditions, verification, and stop conditions.
- Application/data evidence proves recovery, not merely successful commands or cleared alerts.
- Production readiness does not depend on unresolved operational requirements.

**Usable state:** An operational application in its selected environment, with evidence supporting its actual release and recovery requirements.

**Governing sources:** [Production access](security/production-access.md), [secrets](security/secrets-management.md), [retention](security/data-retention.md), [alerting](reliability/alerting.md), [incident response](security/incident-response.md), [runbook authoring](runbooks/authoring.md).

## Conditional capabilities

This plan does not automatically add mobile/desktop apps, microservices, queues, caches, search infrastructure, pgvector, object storage, SSR, a global state library, browser telemetry, an observability vendor, or advanced monorepo orchestration. Each enters only when a real requirement activates its documented policy. Testcontainers does not select an application deployment platform.

AI-first engineering does not require a product AI runtime. If AI application capabilities are introduced, they must use authorized application boundaries and explicit delegation. Add tasks and human actions for actual provider requirements at that time.

## Progress and plan changes

Current task statuses and conditional dispositions above own progress. Git preserves detailed editing history; the [acceptance report](foundation-acceptance.md) retains durable acceptance evidence. Do not remove unresolved tasks or activation conditions when consolidating completed work.
