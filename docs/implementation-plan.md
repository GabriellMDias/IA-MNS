# Orion Implementation Plan

[Documentation index](README.md) · [Human-action checklist](human-actions.md) · [Validation availability](validation.md)

## Purpose and current baseline

This is Orion's living execution plan. It tracks implementation progress; it does not replace current architectural policy or accepted ADRs. Preserve accepted decisions, rationale, exceptions, and technology responsibilities.

Orion now contains documentation, a pnpm workspace, local validation tooling and CI, plus the Approval Request API, PostgreSQL persistence, generated OpenAPI/client, and web reference workflow. `pnpm validate` runs the checks listed in [validation](validation.md). A concrete identity provider and production deployment remain conditional future work. The phase tables below record the implementation history and current status.

The foundation includes a complete reference feature—persistence, domain/application behavior, API contracts, generated client, web UI, tests, and telemetry—and [living documentation](architecture/living-documentation.md) for its API, database/data dictionary, and frontend components. Human navigation must coexist with AI-readable canonical and generated artifacts. Phase 9 accepted the implemented reference vertical slice; Phases 10 and 11 finish the foundation's documentation and developer experience. Deployment-specific operation is conditional Phase 12. A particular business product and production environment have not been defined.

The [README](../README.md), [principles](architecture/principles.md), [technology map](architecture/technology-decisions.md), and [accepted ADRs](adr/README.md) govern implementation. Later accepted decisions resolve older deferred wording; genuine conflicts must be surfaced rather than silently bypassed. The sequence below is an execution plan, not a new architectural decision.

## Maintaining this plan

Codex must maintain this document and the [human-action checklist](human-actions.md) throughout implementation, within the user's authorized scope.

1. Before implementation, inspect actual repository state, the relevant phase, its prerequisites, governing policy, and linked human actions. Do not treat a planned capability or unchecked action as available.
2. Mark a task `in progress` when work actually starts. Update statuses when evidence, scope, dependencies, or blockers change, and before each handoff or completion report.
3. Record task-level progress in the tables below. Add finer tasks with stable IDs when needed; do not hide unfinished subtasks inside a completed row.
4. Record concise evidence in the final column: implementation paths, validation commands/results, review references, or a linked decision. Record unavailable or failing checks explicitly. Do not store secret values or sensitive output.
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
- Once implemented, require non-mutating `pnpm validate` for substantial changes, using the same capabilities locally and in CI. Never represent absent tests or generators as passing checks.
- Each phase leaves a coherent usable state. Split phases into small changes that preserve the checks and capabilities already delivered.

## Phase status

This table owns phase-level status; the tables within each phase own task-level status. Human-action IDs link to the separate checklist, which owns their details and completion evidence.

| Phase | Objective | Status | Dependencies | Current evidence or blocker |
| --- | --- | --- | --- | --- |
| [1](#phase-1) | Reproducible workspace and local validation | completed | None | Frozen install and `pnpm validate` pass; validation changed zero source files. |
| [2](#phase-2) | CI and dependency security | completed | 1 | [H-01](human-actions.md#h-01), [H-02](human-actions.md#h-02), and [H-03](human-actions.md#h-03) are complete. On [PR #3 CI run #6](https://github.com/GabriellMDias/Orion/actions/runs/36009789640), validation, Dependency Review with `DEPENDENCY_REVIEW_ENABLED=true`, and the aggregate gate all passed. All applicable Phase 2 acceptance criteria are satisfied. |
| [3](#phase-3) | Reference feature and immediate decisions | completed | 1-2; discovery may begin earlier | [Business specification](domains/approval-request.md), [feature implementation conventions](domains/approval-request-implementation.md), and [build/artifact workflow](architecture/backend-execution-and-generated-artifacts.md) resolve P3.1-P3.6; H-04/H-05 complete. No new ADR required under [authoring criteria](adr/authoring.md#when-a-decision-needs-an-adr). |
| [4](#phase-4) | Observable API runtime | completed | 1-3 | `apps/api` runtime, local instructions, generated configuration/error references, 17 tests, emitted-process smoke, and `pnpm validate` pass; [Phase 4 evidence](#phase-4). No new human action required. |
| [5](#phase-5) | Secure persistence-backed API feature | completed | 3-4 and CI | The server, database, authorization, generated references, 36 tests, and feature-level HTTP rate limit pass locally and in [PR #6 CI run #6](https://github.com/GabriellMDias/Orion/actions/runs/36062703543). The [CodeQL check](https://github.com/GabriellMDias/Orion/runs/107845374602) reports no new alerts with zero annotations after the fix. H-06 needs no host action; H-07 remains conditional. |
| [6](#phase-6) | Generated client and complete web workflow | completed | 5 | Generated SDK and web workflow pass local and [PR #7 CI](https://github.com/GabriellMDias/Orion/actions/runs/36071532760); [Phase 6 evidence](#phase-6). H-07 remains conditional. |
| [7](#phase-7) | Failure recovery, concurrency, and data lifecycle | completed | 5-6 | Failure and restart behavior pass local and [PR #8 CI](https://github.com/GabriellMDias/Orion/actions/runs/36083980169); [Phase 7 evidence](#phase-7). Conditional and non-applicable work is recorded there. |
| [8](#phase-8) | Safe evolution and reproducible artifacts | completed | 5-7; actual baselines where applicable | Release-aware migration guard and clean-clone validation pass local and [PR #9 CI](https://github.com/GabriellMDias/Orion/actions/runs/36087095948); [Phase 8 evidence](#phase-8). Historical baselines and H-08 remain conditional. |
| [9](#phase-9) | Reference vertical-slice acceptance and contributor handoff | completed | 1-8 | [Acceptance report](foundation-acceptance.md), clean-checkout onboarding, local full gate, and [PR #10 CI run #33](https://github.com/GabriellMDias/Orion/actions/runs/36120843908) satisfy Phase 9 criteria. |
| [10](#phase-10) | Documentation architecture, simplification, and developer setup | completed | 9 | Canonical [setup](setup.md), [living-documentation boundary](architecture/living-documentation.md), policy/index review, schema-checked `.env.example`, local full gate, and [PR #11 CI run #36](https://github.com/GabriellMDias/Orion/actions/runs/36135591982) satisfy Phase 10 criteria. |
| [11](#phase-11) | Living Documentation Portal | completed | 10 | Public `/docs` portal, AI-readable component reference, local full gate, clean-checkout preview, and [PR #13 CI run #42](https://github.com/GabriellMDias/Orion/actions/runs/36179651470) satisfy the foundation criteria. |
| [12](#phase-12) | Deployment-specific operationalization | pending | 11 and concrete deployment requirements | Conditional; no deployment selected. |

## Phase 1

### Reproducible workspace and local validation

**Objective:** Turn the documentation foundation into a working, verifiable development environment.

| Task | Main work | Status | Evidence / dependency |
| --- | --- | --- | --- |
| P1.1 | Establish pnpm workspace configuration, a committed shared lockfile, mechanically pinned Node.js/pnpm versions, and compatible tool versions. | completed | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.node-version`, and `.npmrc`; `pnpm install --frozen-lockfile` passed. No first-party package dependency exists yet. |
| P1.2 | Configure strict TypeScript and ESM for actual repository tooling. | completed | `tsconfig.json` and ESM root manifest; Node 24 executes `tooling/validate/docs.ts`; `pnpm typecheck` passed. |
| P1.3 | Implement Prettier checks, ESLint Flat Config with typescript-eslint, `tsc`, and dependency-cruiser. | completed | `eslint.config.mjs`, `.dependency-cruiser.mjs`, and root scripts; individual checks passed. Deliberate formatting and type errors failed with file/line diagnostics. |
| P1.4 | Introduce `pnpm validate` with independently runnable checks; keep formatting and automatic fixes separate. | completed | `pnpm validate` passed; SHA-256 comparison of tracked and untracked source files found zero changes. `pnpm format` is a separate write command. |
| P1.5 | Add documentation link/anchor validation and useful checks for existing ADR metadata. | completed | `tooling/validate/docs.ts`; `pnpm docs:check` passed for 60 Markdown files, 949 local links, and 11 ADRs. A temporary missing-link probe failed as expected. |
| P1.6 | Enforce applicable dependency rules and expand them as applications and packages appear. | completed | dependency-cruiser rejects tested cross-app, package-to-app, client-to-server, and runtime-to-infra imports. Extend package/public API rules when those packages exist. |
| P1.7 | Document installation, prerequisites, real commands, and actionable diagnostics; update availability statements. | completed | [Validation](validation.md), root README/AGENTS, documentation index, and technology map now describe implemented commands and absent future checks. [H-06](human-actions.md#h-06) records that no Phase 1 host action was required. |

**Expected deliverables:** Root manifests/configuration, lockfile, focused tooling under `tooling/`, working validation commands, and current onboarding/validation documentation. No placeholder applications or empty package catalog.

**Dependencies:** None. Request host administration only if inspection demonstrates it is needed; see [H-06](human-actions.md#h-06).

**Validation/acceptance criteria:**

- A clean checkout can install from the frozen lockfile and execute all implemented checks.
- Validation leaves tracked source files unchanged.
- Representative formatting, type, link, and dependency violations fail with useful diagnostics.
- First-party package dependencies resolve explicitly through `workspace:` where applicable.
- Documentation distinguishes available checks from future capabilities.

**Usable state:** A reproducible development and documentation-validation environment.

**Governing sources:** [Validation](validation.md), [dependency rules](architecture/dependency-rules.md), ADRs 0001-0003 in the [ADR index](adr/README.md).

## Phase 2

### CI and dependency security

**Objective:** Make repository validation an enforceable delivery gate.

| Task | Main work | Status | Evidence / dependency |
| --- | --- | --- | --- |
| P2.1 | Add GitHub Actions validation for pull requests, the primary branch, and manual execution. | completed | `.github/workflows/ci.yml` declares all triggers; [PR run #1](https://github.com/GabriellMDias/Orion/actions/runs/35983764305) passed. `main` push and manual triggers are configured but await their event. |
| P2.2 | Consume repository-pinned toolchain versions, frozen installation, and repository commands rather than CI-only correctness logic. | completed | `pnpm/setup` reads `packageManager` and `.node-version`, installs from the frozen lockfile, and invokes `pnpm validate`; [PR run #1](https://github.com/GabriellMDias/Orion/actions/runs/35983764305) logged a pnpm store cache miss, completed the install, and passed validation. Cache state is not part of correctness. |
| P2.3 | Expose a stable aggregate required check that fails when required work fails or does not complete. | completed | `Orion required gate` passed in [PR run #1](https://github.com/GabriellMDias/Orion/actions/runs/35983764305); six local executions of its exact shell body confirmed failures/cancellations and enabled failed/skipped dependency reviews return nonzero. `always()` prevents dependency failure from skipping the gate. The active required-check enforcement is verified in [H-02](human-actions.md#h-02). |
| P2.4 | Pin external actions to immutable SHAs, minimize permissions, and isolate untrusted PR execution from privileged credentials. | completed | Full action SHAs verified against upstream tags; workflow has read-only contents, no privileged PR event or production secret, and the gate has no token permission. `actionlint` passes. |
| P2.5 | Configure Renovate with its dashboard, weekly routine updates, coherent groups, visible major upgrades, and automerge disabled initially; do not delay security remediation to the routine window. | completed | `renovate.json` passes official strict validation. Bot-authored [Dependency Dashboard issue #2](https://github.com/GabriellMDias/Orion/issues/2) detects committed dependencies, shows majors pending approval and routine updates awaiting schedule; [H-01](human-actions.md#h-01) is verified. No update PR has appeared yet. |
| P2.6 | Configure and verify branch protection and supported GitHub security capabilities; record entitlement limitations. | completed | H-02 and H-03 are verified. The active `Protect main` ruleset requires PRs and `Orion required gate`, blocks deletion and force pushes, and has no bypass actors. CodeQL default setup is configured; secret scanning and push protection are enabled; dependency graph and vulnerability alerts are available; Actions variable `DEPENDENCY_REVIEW_ENABLED=true`. Dependency Review executed with `fail-on-severity: high` and passed on [PR #3 CI run #6](https://github.com/GabriellMDias/Orion/actions/runs/36009789640). |
| P2.7 | Bound diagnostic artifact retention and cancel superseded PR runs where appropriate. | completed | Workflow cancels superseded runs for the same PR but not primary-branch runs. It uploads no diagnostic artifacts at this stage, so no retention window is currently needed; future uploads must set bounded retention. |

**Expected deliverables:** CI workflows, Renovate configuration, an operational required check, and documented repository settings.

**Dependencies:** Phase 1. External administration is tracked separately from repository changes.

**Validation/acceptance criteria:**

- The same revision passes equivalent local and CI validation.
- A failing required job cannot produce a successful aggregate gate.
- Cache misses remain reproducible.
- PR validation requires no production credentials.
- Dependency review blocks newly introduced high/critical vulnerabilities where available, subject to reviewed exceptions.
- External settings are verified; workflow files alone do not count as branch protection.

**Usable state:** A protected development workflow with controlled dependency maintenance.

**Governing source:** [ADR-0011](adr/0011-establish-continuous-integration-dependency-automation-and-supply-chain-security-strategy.md).

## Phase 3

### Define the reference feature and immediate implementation details

**Objective:** Establish concrete behavior before creating business models or security assumptions.

| Task | Main work | Status | Evidence / dependency |
| --- | --- | --- | --- |
| P3.1 | Select the reference feature with the project owner; orders/payments in existing examples are not product requirements. | completed | Owner selected [Approval Request](domains/approval-request.md); [H-04](human-actions.md#h-04). |
| P3.2 | Define actors, use cases, ownership, invariants, state transitions, expected failures, side effects, and acceptance scenarios. | completed | Canonical [business specification and acceptance scenarios](domains/approval-request.md); H-05 now specifies enforceable ownership and review rules. |
| P3.3 | Specify data classifications/lifecycle and determine required authentication, authorization, tenancy, audit history, and integrations. | completed | [Data and lifecycle](domains/approval-request.md#data-ownership-classification-and-lifecycle), [side-effect boundary](domains/approval-request.md#side-effect-boundary), and [identity and authorization](domains/approval-request.md#identity-and-authorization-boundary) record the H-04/H-05 decisions. No concrete identity provider is selected; future provisioning is conditional [H-07](human-actions.md#h-07). |
| P3.4 | Resolve feature placement, identifiers, timestamps, transaction ownership, schema metadata, API errors, and pagination where applicable. | completed | [Feature implementation conventions](domains/approval-request-implementation.md) cover placement, identity/time, versioned writes, transaction ownership, create idempotency, authorized cursor lists, error mapping, and database metadata. |
| P3.5 | Decide backend development/build execution and generated-artifact storage conventions. | completed | [Backend execution and generated artifacts](architecture/backend-execution-and-generated-artifacts.md) specifies `tsx` development, `tsc` emit/Node runtime, single-source generated outputs, commit/ignore rules, and non-mutating drift checks; Phase 4 implemented the API commands and configuration/error reference checks. |
| P3.6 | Record significant new architectural choices through the ADR process; keep ordinary conventions near their owners. | completed | [ADR authoring criteria](adr/authoring.md#when-a-decision-needs-an-adr) assessed: ADR-0001/0002/0004/0006/0007 and existing policies already establish runtime, workspace, transport, persistence, and contract/generation boundaries. P3.4 feature-local choices and P3.5 reversible execution/output conventions implement those decisions without changing cross-system ownership or technology; no new ADR is required. |

**Expected deliverables:** A bounded feature specification, acceptance scenarios, dependency/ownership map, and explicit decisions needed by later phases.

**Dependencies:** Phases 1-2; requirements discovery may begin earlier. Owner inputs do not block independent foundation tooling work.

**Validation/acceptance criteria:**

- Every planned business behavior traces to a stated requirement.
- Protected and anonymous operations are explicitly distinguished.
- Required security choices are resolved before protected operations are exposed.
- No invented tenancy, permissions model, retention duration, authentication provider, or deployment target.
- The feature can be delivered incrementally without speculative infrastructure.

**Completion evidence (2026-09-24):** [H-04](human-actions.md#h-04) and [H-05](human-actions.md#h-05) own the project decisions; the [business specification](domains/approval-request.md) traces every planned operation, state change, failure, concurrency case, and access denial to those inputs. The [feature implementation design](domains/approval-request-implementation.md) distinguishes protected operations from the absence of anonymous business operations and gives later phases explicit persistence, contract, and test boundaries. [Execution/artifact conventions](architecture/backend-execution-and-generated-artifacts.md) use existing accepted directions without adding infrastructure. A concrete identity provider, tenancy, legal retention duration, and deployment target were not invented. Application, API, database, authentication, and web code remain unimplemented; Phase 4 may start from this validated decision baseline. `pnpm validate` passed for this documentation change.

**Usable state:** A validated repository with an executable backlog and clear decision gates.

**Governing sources:** [Principles](architecture/principles.md), [authentication](security/authentication.md), [authorization](security/authorization.md), [classification](security/data-classification.md), [retention](security/data-retention.md).

## Phase 4

### Observable API runtime

**Objective:** Establish a runnable backend with correct lifecycle and boundary behavior.

| Task | Main work | Status | Evidence / dependency |
| --- | --- | --- | --- |
| P4.1 | Create `apps/api` with an explicit composition root and Fastify transport boundary. | completed | `apps/api/src/main.ts` composes the runtime; `src/app.ts` owns Fastify hooks/routes and uses TypeBox provider. Emitted Node ESM starts in the smoke check. |
| P4.2 | Implement TypeBox bootstrap configuration with explicit parsing, validation, safe defaults, immutable typed values, and centralized environment access. | completed | `src/config.ts` validates a frozen configuration; invalid `ORION_ENV` fails before listening in emitted-process smoke. Configuration tests cover parsing and malformed inputs. |
| P4.3 | Separate server-only configuration from client-eligible values. | completed | `clientConfigFrom` currently exposes no values; configuration metadata and [generated reference](generated/configuration/api.md) mark all values server-only. |
| P4.4 | Initialize Pino/OpenTelemetry before instrumented infrastructure, with preferred Fastify instrumentation, W3C propagation, and configurable OTLP export. | completed | `main.ts` initializes telemetry before dynamic Fastify import; `src/telemetry.ts` configures HTTP/Fastify instrumentation, W3C propagation, sampling, and optional OTLP HTTP traces/metrics. Real HTTP smoke verifies inbound trace IDs and collector delivery attempt. |
| P4.5 | Implement centralized redaction and request/log/trace correlation. | completed | `src/logging.ts` Pino paths and safe field logging, `src/telemetry.ts` span/metric allowlists, and generated request IDs. Tests and real HTTP smoke verify redaction and correlation across concurrent requests. |
| P4.6 | Establish the public error envelope and a small canonical registry for errors actually used. | completed | `src/errors.ts` owns foundational codes/envelope; [generated registry](generated/api/errors.md) has a non-mutating freshness check. Fastify tests verify validation, missing route, and unexpected error responses. |
| P4.7 | Implement distinct startup, liveness, readiness, and bounded shutdown behavior. | completed | `src/lifecycle.ts` and three health endpoints cover state transitions; tests verify draining rejects work, liveness remains distinct, and HTTP/telemetry cleanup has a deadline. |
| P4.8 | Add configuration, HTTP-boundary, error, lifecycle, and telemetry tests. | completed | Vitest covers configuration, actual Fastify injection validation/serialization, error capture, lifecycle, logging, and span redaction; emitted-process smoke covers startup, W3C propagation, failed OTLP export, and continued readiness. `pnpm validate` passes. |

**Expected deliverables:** Runnable API foundation, safe health endpoints, typed configuration, foundational errors, telemetry integration, generated configuration/error references where applicable, and useful API-local instructions.

**Dependencies:** Phases 1-3. [H-07](human-actions.md#h-07) applies only if a selected external integration actually requires provisioning; local telemetry verification must not depend on a purchased vendor.

**Validation/acceptance criteria:**

- Invalid required configuration fails before accepting work.
- Health responses disclose no secrets or internal diagnostics.
- Shutdown stops accepting work and attempts bounded cleanup/telemetry flushing.
- Unexpected errors produce safe public responses and one authoritative diagnostic capture.
- Correlation remains isolated between concurrent requests.
- Telemetry export failure does not normally fail business operations.
- Fastify request injection exercises real validation and serialization.

**Completion evidence (2026-09-24):** `pnpm install --frozen-lockfile` and `pnpm validate` passed locally on Node.js 24.13.0 / pnpm 11.25.0. Validation includes formatting, typed ESLint, typecheck, dependency boundaries, documentation links/anchors, generated-reference drift, 17 Vitest tests, emitted ESM build, and real-process smoke. The smoke check rejects invalid bootstrap configuration, verifies W3C trace/request/log correlation for concurrent HTTP requests, observes an OTLP trace export rejected by a local HTTP 503 collector, and confirms readiness remains healthy afterward. Tests verify health contains only safe status, an unexpected failure produces one diagnostic with a safe public envelope, and draining/bounded cleanup behavior. No paid collector or other human action was needed; [H-07](human-actions.md#h-07) remains conditional. At Phase 4 completion, Phase 5 had not started.

**Usable state:** A locally runnable, observable API with safe lifecycle behavior.

**Governing sources:** [Configuration](architecture/configuration.md), [error contract](api/error-contract.md), [health checks](reliability/health-checks.md), [ADR-0010](adr/0010-establish-observability-logging-tracing-metrics-and-error-reporting-strategy.md).

## Phase 5

### First secure, persistence-backed API feature

**Objective:** Deliver the first useful backend capability across its complete server-side path.

| Task | Main work | Status | Evidence / dependency |
| --- | --- | --- | --- |
| P5.1 | Implement selected domain rules and application operations in cohesive feature boundaries. | completed | Pure state/access rules and application operations live under `apps/api/src/features/approval-requests/`; unit and HTTP tests cover all operations. |
| P5.2 | Introduce PostgreSQL/Prisma 7 for actual durable data, reviewed migrations, constraints, explicit transactions, and persistence adapters. | completed | Reviewed migration, schema, adapter, PostgreSQL constraints, atomic create/CAS writes, and migrated-container tests pass. Scoped patched Prisma dependencies pass [PR #6 CI run #4](https://github.com/GabriellMDias/Orion/actions/runs/36055772654) Dependency Review. |
| P5.3 | Separate runtime and migration credentials. | completed | `ORION_DATABASE_URL` is runtime-only; `ORION_MIGRATION_DATABASE_URL` is CLI-only. Testcontainers uses distinct migration and restricted runtime roles and proves DDL/immutable-column denial. |
| P5.4 | Implement required identity verification and authorization before exposing protected operations; test with synthetic identities. | completed | Verified JWT bearer boundary, stable human principal mapping, owner/review capability/self-review rules, and synthetic signed-token tests; [ADR-0012](adr/0012-verify-jwt-access-tokens-at-the-first-api-boundary.md). [H-07](human-actions.md#h-07) remains conditional. |
| P5.5 | Define TypeBox requests/responses, unique stable operation IDs, expected errors, and deliberate transport mappings. | completed | Eight feature contracts share route metadata, stable IDs, error declarations, and the central registry. Feature routes return `429 RATE_LIMITED` with `Retry-After` after the IP bucket is exhausted; generated OpenAPI declares it. Injection tests cover 400/401/403/404/409/429 outcomes. |
| P5.6 | Generate OpenAPI 3.1.x from executable contracts and route metadata. | completed | [Generated OpenAPI](generated/api/openapi.json) includes health and feature routes; `references:check` detects drift and duplicate/undeclared metadata. |
| P5.7 | Document every application-owned table/column, including ownership, relevant classification, units, null semantics, and lifecycle. | completed | [Schema-adjacent metadata](../apps/api/prisma/schema-metadata.json) covers the table, all columns, enum, constraints, and indexes. |
| P5.8 | Generate physical database reference from migrated PostgreSQL, accounting for custom SQL. | completed | [Generated reference](generated/database/approval-requests.md) introspects a fresh migrated PostgreSQL; metadata coverage and output drift fail validation. |
| P5.9 | Add Vitest unit and integration tests using Testcontainers, real PostgreSQL, committed migrations, and Fastify injection. | completed | 36 tests and emitted-process feature smoke pass locally and in [PR #6 CI run #6](https://github.com/GabriellMDias/Orion/actions/runs/36062703543). Coverage includes auth denials, concurrent writes, schema permissions, and a deterministic limit test proving pre-auth rejection, ignored spoofed forwarding headers, and health isolation. |

**Expected deliverables:** Functional backend reference feature, migration history, persistence implementation, generated API/database references, domain documentation, and meaningful integration coverage.

**Dependencies:** Phases 3-4 and continuing CI enforcement.

**Validation/acceptance criteria:**

- Committed migrations reproducibly create a fresh database.
- The feature works through HTTP and persists correctly.
- Invalid requests, domain rejection, missing resources, and conflicts have explicit semantics.
- Required authorization allow/deny paths pass, including resource/tenant isolation where applicable.
- Constraints and concurrent writes protect intended invariants.
- Prisma/Fastify types do not leak into domain behavior or public contracts.
- Missing schema descriptions and stale generated references fail validation.

**Completion evidence (2026-09-24):** `pnpm install --frozen-lockfile` and `pnpm validate` passed locally on Node.js 24.13.0 / pnpm 11.25.0. The gate generated the ignored Prisma client, checked format/lint/types/import boundaries/docs, recreated the migrated PostgreSQL reference, ran 36 Vitest tests against Testcontainers, built emitted ESM, and passed both foundation and signed-token/migrated-database real-process smokes. [PR #6 CI run #6](https://github.com/GabriellMDias/Orion/actions/runs/36062703543) passed Validate, Dependency Review with `DEPENDENCY_REVIEW_ENABLED=true`, and `Orion required gate` on Ubuntu. A prior [CodeQL check](https://github.com/GabriellMDias/Orion/runs/107823560259) reported one new high-severity alert for missing rate limiting; the post-fix [CodeQL check](https://github.com/GabriellMDias/Orion/runs/107845374602) reports no new alerts and zero annotations, with the feature route limiter enforced before authentication and database work. The migration was applied on fresh PostgreSQL; the runtime test role has no DDL, delete, or immutable-column update privilege. The API enforces human identity, owner/reviewer scope, self-review denial, state rules, version CAS, and create-key uniqueness. [H-06](human-actions.md#h-06) required no host intervention; [H-07](human-actions.md#h-07) remains conditional because no provider was selected. No tenant applies to this feature. The web application and generated frontend client remain Phase 6 work.

**Usable state:** A secure, documented backend feature usable through its HTTP contract.

**Governing sources:** [Database policy](database/principles.md), [schema documentation](database/schema-documentation.md), [transactions](database/transactions-and-concurrency.md), [API policy](api/principles.md), ADRs 0005-0007 and 0009 in the [ADR index](adr/README.md).

## Phase 6

### Generated client and complete web reference workflow

**Objective:** Complete the reference feature through a real browser experience.

| Task | Main work | Status | Evidence / dependency |
| --- | --- | --- | --- |
| P6.1 | Generate client types from OpenAPI with openapi-typescript and compose the thin openapi-fetch client. | completed | `packages/sdk` generates from committed OpenAPI; deterministic `references:check` passes. |
| P6.2 | Preserve structured errors and unknown safe error codes without importing backend implementation. | completed | Web API adapter retains status/code/request ID, uses safe fallback for unknown codes; Node test passes; architecture check finds no cross-application import. |
| P6.3 | Create `apps/web` with React 19.x, Vite 8.x, React Compiler where compatible, TanStack Router, and TanStack Query. | completed | Pinned workspace dependencies, Vite build with React Compiler, typed Router/Query application. |
| P6.4 | Assign server state to Query, navigation/shareable state to Router, and interaction state to React. | completed | Query keys/invalidation own API state; route path and validated scope/cursor own URL state; forms/credential handoff use React state. |
| P6.5 | Implement loading, empty, success, validation, denied, conflict, and failure states for the reference workflow. | completed | List/detail/forms expose each state, including accessible reload after conflict; API remains the authority. Browser and E2E cases exercise representative states. |
| P6.6 | Integrate the selected authentication flow when required. | completed | H-05 bearer boundary is consumed through an in-memory token handoff; synthetic signed identities exercise it end to end. No concrete provider is selected, so [H-07](human-actions.md#h-07) stays conditional. |
| P6.7 | Address keyboard interaction, focus, accessibility, and client-safe configuration. | completed | Native labeled forms/buttons, live status/alert regions, visible keyboard focus, responsive layout, and TypeBox-validated same-origin public API path. Browser keyboard test passes. |
| P6.8 | Add real-browser component/feature tests and critical full-stack Playwright journeys. | completed | Two Vitest Browser Mode component tests and two Playwright Chromium journeys pass through migrated Testcontainers PostgreSQL, emitted API, and web app; aggregate `pnpm validate` passed locally and in [PR #7 CI run #23](https://github.com/GabriellMDias/Orion/actions/runs/36071532760). |

**Expected deliverables:** Generated client integration, working web application, complete reference workflow, production builds, and browser/E2E checks.

**Dependencies:** Phase 5.

**Validation/acceptance criteria:**

- Chromium completes the critical journey through the actual API and PostgreSQL.
- Refresh/navigation preserve URL-owned state.
- Mutations update or invalidate cached state correctly.
- UI visibility is never the only authorization control.
- Browser bundles contain no server-only dependencies or secrets.
- Client contracts regenerate without manual changes.
- Browser-dependent tests use real browser behavior; pure logic stays in cheaper Node tests.

**Completion evidence (2026-09-24):** `pnpm install --frozen-lockfile` and `pnpm validate` passed locally on Node.js 24.13.0 / pnpm 11.25.0. The gate checked formatting, lint, strict types, import boundaries, 71 Markdown files/1097 links/12 ADRs, API/database/SDK reference freshness, 36 API Vitest tests, one web Node error-boundary test, two real-browser component tests, emitted API and Vite builds, the browser bundle for known server-only markers, both API smokes, and two Playwright Chromium journeys against freshly migrated PostgreSQL with signed synthetic principals. The browser journeys prove create/edit/submit, self-review denial, reviewer approval, stale-version conflict, URL scope/detail preservation across refresh, Query list invalidation, and the documented loss of reviewer access after a decision. [PR #7 CI run #23](https://github.com/GabriellMDias/Orion/actions/runs/36071532760) passed Validate (including Chromium/system-library installation and the same `pnpm validate`), Dependency Review, and `Orion required gate` on Ubuntu. The [CodeQL check](https://github.com/GabriellMDias/Orion/runs/107873534523) reports no new alerts in the changed code with zero annotations. [H-06](human-actions.md#h-06) required no host intervention; [H-07](human-actions.md#h-07) remains conditional.

**Usable state:** The complete database-to-browser reference feature.

**Governing sources:** [ADR-0007](adr/0007-establish-api-contract-openapi-sdk-and-configuration-schema-strategy.md), [ADR-0008](adr/0008-select-react-vite-and-tanstack-for-web-applications.md), [testing strategy](architecture/testing-strategy.md).

## Phase 7

### Failure recovery, concurrency, and data lifecycle

**Objective:** Prove the completed feature behaves safely under realistic failures. This extends controls already delivered, rather than deferring basic correctness.

| Task | Main work | Status | Evidence / dependency |
| --- | --- | --- | --- |
| P7.1 | Exercise concurrent operations, stale updates, duplicate submissions, timeouts, dependency failures, and process interruption. | completed | Migrated-PostgreSQL tests cover concurrent/repeated/stale writes, a caller deadline after commit, and failed-statement rollback; the emitted-process smoke verifies recovery after forced API termination and restart. |
| P7.2 | Define retry ownership/limits and unknown-outcome handling; add durable idempotency only where semantics require it. | completed | [Feature recovery contract](domains/approval-request-implementation.md#failure-recovery-and-retry-ownership), owner-scoped durable create replay, version conflicts for other writes, explicit zero automatic web retries, and operation-specific unknown-outcome guidance with unit tests. |
| P7.3 | Implement required retention/deletion behavior, including existing derived copies and partial-failure recovery. | changed | Not applicable to the approved reference feature: [H-04](human-actions.md#h-04) defines no automatic deletion or retention duration, and no persisted derived copy exists. Production retention/disposal policy remains conditional under [H-09](human-actions.md#h-09); no deletion workflow can be specified without that requirement. |
| P7.4 | Implement dedicated audit persistence if authoritative business audit history is required. | changed | Not applicable: [H-04](human-actions.md#h-04) explicitly defines no authoritative business-audit persistence requirement. Operational diagnostics are not an audit trail. |
| P7.5 | Review automatic instrumentation, redaction, bounded metrics, and expected/unexpected failure classification. | completed | Pino/OTel allowlists and bounded metric labels reviewed; new HTTP failure test asserts one unexpected diagnostic and excludes exception text, credentials, request content, and resource ID from logs/response. Existing span test excludes URLs, headers, exception events, and links. Expected conflict stays a safe `409` without a new diagnostic. |
| P7.6 | Add outbox/inbox, reconciliation, compensation, or workers only if the feature has corresponding durable delivery requirements. | changed | Not applicable: [H-04](human-actions.md#h-04) defines no external effect or integration; no delivery pipeline, external atomicity claim, or compensating action exists. |

**Expected deliverables:** Tested failure semantics, applicable lifecycle/recovery mechanisms, safe telemetry, and documented limitations.

**Dependencies:** Phases 5-6. External prerequisites go through [H-07](human-actions.md#h-07) only when activated by actual requirements.

**Validation/acceptance criteria:**

- Duplicate/concurrent requests cannot create prohibited effects.
- Retries cannot silently multiply across layers.
- Timeouts are not treated as proof that an operation did nothing.
- Atomic operations roll back correctly; external effects are not falsely described as transactionally reversible.
- Applicable deletion workflows are repeatable and observable; partial completion is not reported as success.
- Redaction tests cover logs, traces, errors, and diagnostic artifacts.
- No unsupported exactly-once guarantees.

**Completion evidence (2026-09-24):** `pnpm install --frozen-lockfile` and `pnpm validate` passed locally on Node.js 24.13.0 / pnpm 11.25.0. The gate passed format, lint, strict types, dependency boundaries, documentation links, API/database/SDK reference freshness, 40 API Vitest tests (including real migrated PostgreSQL), two web unit tests, two browser component tests, API/web builds and bundle check, foundation and forced-restart feature smokes, and two Playwright Chromium journeys through the real API and database. The new failure tests prove a committed creation survives a caller deadline and replays under its original key, a constraint failure rolls back the full conditional write, an unexpected adapter failure results in one safe diagnostic and one write attempt, and an expected stale conflict does not create an unexpected-error diagnostic. The forced restart proves committed state and idempotency identity survive process interruption. [PR #8 CI run #26](https://github.com/GabriellMDias/Orion/actions/runs/36083980169) passed Validate (the same `pnpm validate` on Ubuntu), Dependency Review, and `Orion required gate`. The [CodeQL check](https://github.com/GabriellMDias/Orion/runs/107911781650) passed with no new alerts in the changed code and zero annotations. The [feature recovery contract](domains/approval-request-implementation.md#failure-recovery-and-retry-ownership) records retry ownership and limits; P7.3, P7.4, and P7.6 are explicitly not applicable to current [H-04](human-actions.md#h-04) requirements. Production retention policy remains conditional under [H-09](human-actions.md#h-09), and [H-07](human-actions.md#h-07) remains conditional. Phase 7 is complete.

**Usable state:** A reference feature with explicit, verified failure and lifecycle behavior.

**Governing sources:** [Delivery and side effects](architecture/delivery-and-side-effects.md), [transactions](database/transactions-and-concurrency.md), [retention](security/data-retention.md), [redaction](security/telemetry-redaction.md).

## Phase 8

### Safe evolution and reproducible artifacts

**Objective:** Demonstrate that Orion can evolve safely beyond its initial implementation.

| Task | Main work | Status | Evidence / dependency |
| --- | --- | --- | --- |
| P8.1 | Establish durable migration release-status detection before the first persistent release. | completed | Empty [durable-release registry](../apps/api/prisma/release-history.json), [recording workflow](database/release-evolution.md#record-the-first-durable-migration-boundary), and checksum command are ready. [H-08](human-actions.md#h-08) remains conditional for real environment/applied-history evidence; zero entries do not certify no private environment. |
| P8.2 | Protect released migration history while preserving safe refinement of unreleased history. | completed | `pnpm release:check` validates recorded commits, complete migration sets, normalized SQL hashes, and append-only records against a Git base. Fixture tests reject released SQL/registry edits and allow unrecorded SQL refinement. CI fetches full history and supplies its actual base commit. No existing migration was edited. |
| P8.3 | Test fresh installation and upgrades from actual supported released baselines once they exist. | changed | Fresh migrations pass `pnpm references:check`, migrated-PostgreSQL tests, and the emitted-process smoke. Historical upgrade tests are not applicable yet: no actual released baseline or supported old/new combination is evidenced. [H-08](human-actions.md#h-08) will activate them; no synthetic baseline was created. |
| P8.4 | Introduce released API baselines and compatibility checks when independently evolving consumers require them. | changed | Conditional: no independently released API/consumer or supported historical contract is evidenced. Current OpenAPI/SDK regeneration remains checked; [H-08](human-actions.md#h-08) activates a real baseline when needed. |
| P8.5 | Review structural/semantic compatibility of errors, authorization, ordering, pagination, defaults, and side effects. | completed | [Current contract review](database/release-evolution.md#review-api-and-temporary-compatibility) traces these concerns to TypeBox/OpenAPI/SDK, error registry, domain/access rules, pagination, and recovery tests. Historical semantic compatibility awaits a real released consumer. |
| P8.6 | Verify generators/builds from clean canonical inputs; document safe application rollback versus database forward recovery. | completed | A fresh Git clone passed frozen install, migrated-PostgreSQL/API/SDK reference checks, emitted API and Vite builds, and bundle check. An intentional OpenAPI edit made `references:check` fail without changing the edited file. Cross-platform CRLF/LF comparison was corrected after the initial clean-clone failure. [Evolution workflow](database/release-evolution.md#validate-schema-changes) distinguishes compatible application rollback from forward database correction and data restoration. |
| P8.7 | Define removal conditions for real temporary compatibility paths. | changed | Conditional: no temporary compatibility shim, deprecated endpoint, dual-write, or retained old payload exists. [Evolution workflow](database/release-evolution.md#review-api-and-temporary-compatibility) states what a future real path must record before removal. |

**Expected deliverables:** Migration/contract evolution checks, applicable baseline evidence, reproducible generation/build commands, and concrete evolution procedures.

**Dependencies:** Phases 5-7; historical checks require genuine baselines. Record conditional tasks as changed with a justified deferral when no released boundary exists, rather than falsely completed.

**Validation/acceptance criteria:**

- Released migration edits are detected when a released baseline exists.
- Supported upgrades preserve required data and application compatibility.
- Breaking contracts are detected where mechanically expressible and receive semantic review.
- Regeneration reveals drift without silently fixing tracked files during validation.
- Old/new compatibility tests cover actual supported combinations.
- Unreleased work is not burdened with unnecessary permanent versioning.

**Completion evidence (2026-09-24):** A clean Git clone passed `pnpm install --frozen-lockfile` and the full `pnpm validate` gate, including the migration-release guard and its two fixture tests, fresh migrated-PostgreSQL reference generation, 40 API tests, web unit and component tests, API/web builds, process smokes, and two Chromium journeys. A deliberate OpenAPI edit failed `references:check` without modifying the artifact. [PR #9 CI run #29](https://github.com/GabriellMDias/Orion/actions/runs/36087095948) passed Validate, Dependency Review, and `Orion required gate`; [CodeQL](https://github.com/GabriellMDias/Orion/runs/107921398303) reported no new alerts in changed code. The release guard detects edits to recorded migrations and release-registry history, while the empty registry and [H-08](human-actions.md#h-08) defer historical upgrade and API-baseline checks until real durable releases or independent consumers exist. No migration history or API version was invented. P8.3, P8.4, and P8.7 are conditional as recorded above. Phase 8 is complete; Phase 9 has not started.

**Usable state:** A foundation with a reproducible and explicit evolution path.

**Governing sources:** [Migrations](database/migrations.md), [compatibility](architecture/versioning-and-compatibility.md), [API versioning](api/versioning.md).

## Phase 9

### Reference vertical-slice acceptance and contributor handoff

**Objective:** Accept the implemented reference vertical slice and its contributor handoff against the Phase 9 criteria.

| Task | Main work | Status | Evidence / dependency |
| --- | --- | --- | --- |
| P9.1 | Exercise clean-environment onboarding: install, configure, initialize data, run apps, validate, regenerate, and build. | completed | [Setup](setup.md) was exercised in a clean checkout: frozen install, Prisma/Chromium setup, API readiness and Vite proxy, disposable migrated PostgreSQL/reference generation, SDK generation with no tracked diff, builds, and full `pnpm validate`. |
| P9.2 | Verify the reference feature demonstrates established patterns without becoming a generic framework. | completed | [Acceptance map](foundation-acceptance.md#reference-feature-evidence-map) traces domain, service, adapter, contracts, SDK, web, tests, and telemetry. Only the thin SDK is shared; no generic domain/database framework was added. |
| P9.3 | Review public APIs, ownership, dependency enforcement, and local documentation. | completed | [SDK public API](../packages/sdk/README.md) is documented; API owns its schema/contracts, web consumes SDK, and `pnpm architecture` found zero violations across 55 modules/58 dependencies. Existing API/web guides remain local owners. |
| P9.4 | Keep root instructions concise and add scoped instructions only for distinct implemented obligations. | completed | Root `AGENTS.md` remains focused; API, web, and docs instructions were reviewed, and [SDK-local instructions](../packages/sdk/AGENTS.md) now cover its distinct generated-client/public-surface obligations. |
| P9.5 | Complete navigation among feature behavior, contracts, schema, errors, tests, telemetry, and real procedures. | completed | The [documentation task index](README.md) routes to the [acceptance evidence map](foundation-acceptance.md#reference-feature-evidence-map), onboarding, generated references, tests, telemetry, and the real migration-evolution procedure. Link validation passed. |
| P9.6 | Reconcile implementation availability and stale references without changing architectural decisions. | completed | Root README, task index, contributor/error/configuration/observability routes, feature docs, and human-action introduction now describe implemented capabilities and conditional future work. ADRs and policy decisions were unchanged. |
| P9.7 | Review remaining gaps against applicable policies and produce an evidence-backed acceptance report. | completed | [Acceptance report](foundation-acceptance.md) maps each criterion, canonical owner, mechanical protection, and conditional H-06–H-11. Local full gate and [PR #10 required CI gate](https://github.com/GabriellMDias/Orion/actions/runs/36120843908) passed. |

**Expected deliverables:** Executable reference vertical slice, complete validation gate for implemented responsibilities, contributor handoff, and Phase 9 acceptance evidence.

**Dependencies:** Phases 1-8, including applicable external prerequisites. Conditional future work is not automatically required for foundation acceptance.

**Validation/acceptance criteria:**

- A contributor reproduces the complete workflow using repository instructions.
- Full `pnpm validate` passes locally and through the required CI gate.
- Generated artifacts are current; builds/tests are reproducible.
- Architectural violations, important denial paths, and sensitive-data leaks have appropriate mechanical protection.
- Required Phase 9 reference-vertical-slice capabilities are implemented and conditional capabilities explicitly identified; the living documentation portal remains Phase 11 work.
- No speculative package, mandatory external vendor, or undocumented setup step is needed.

**Completion evidence (2026-09-25):** A fresh checkout of the Phase 8 tree passed frozen installation, Prisma generation, Chromium installation, API readiness and Vite proxy requests, migrated-PostgreSQL API/database reference regeneration, SDK regeneration with zero tracked diff, and full `pnpm validate`. The Phase 9 branch then passed full `pnpm validate` locally: formatting, lint, strict types, dependency rules, 76 Markdown files/1242 links/12 ADRs, release-history and generated-reference checks, 40 API tests, two web unit and two browser component tests, API/web builds and bundle screening, both process smokes, and two Playwright Chromium journeys. [PR #10 CI run #33](https://github.com/GabriellMDias/Orion/actions/runs/36120843908) passed Validate, Dependency Review, and `Orion required gate`; the [CodeQL PR check](https://github.com/GabriellMDias/Orion/runs/108025860595) reported no new alerts in changed code. [Phase 9 acceptance](foundation-acceptance.md) records the feature map and limits. Phase 9 is complete; the living documentation portal is planned in Phase 11.

**Usable state:** A validated and usable reference vertical slice. This does not imply the living documentation portal or production deployment exists.

**Governing sources:** [Contributing](contributing.md), [principles](architecture/principles.md), [repository structure](architecture/repository-structure.md), [runbook authoring](runbooks/authoring.md).

## Phase 10

### Documentation architecture, simplification, and developer setup

**Objective:** Make current requirements and setup easy to find and reason about, and define the canonical-to-generated documentation flow before building the portal.

| Task | Main work | Status | Evidence / dependency |
| --- | --- | --- | --- |
| P10.1 | Audit the full documentation tree for current scope, navigation, stale wording, duplicate onboarding, and overly verbose policy. Preserve normative meaning and accepted ADR rationale. | completed | Inventoried all 68 pre-change `docs/*.md` files, reviewed their heading routes, scanned current-policy stale claims and repeated paragraphs, and ran the repository link/reachability checker. No ADR content changed. |
| P10.2 | Establish one canonical `docs/setup.md` and a safe `.env.example` checked against configuration schema/reference metadata; document actual API/web/migration loading boundaries. | completed | [Setup](setup.md) is the sole onboarding owner. `.env.example` derives its names/defaults from API metadata verified against the TypeBox schema; `pnpm env:example:check` passes. The copied ignored `.env.local` started `pnpm --filter @orion/api dev`; readiness returned `200 {"status":"ok"}`. `pnpm dev:approval` runs the real web/API/database flow with memory-only synthetic signed identities. Three browser journeys verify the handoff and an origin-less denial; manual API and web fault injection verified diagnostic exits and resource cleanup. Full `pnpm validate` passed. Phase 11 remains untouched and H-07 conditional. |
| P10.3 | Simplify and reconnect policy and index pages where this reduces local context without hiding ownership, constraints, or conditional requirements. | completed | Root [README](../README.md), [task index](README.md), [principles](architecture/principles.md), and affected API/database/configuration/reliability policies now route to current owners; all 50 principles and their anchors remain while repeated exposition was condensed. |
| P10.4 | Specify living-documentation ownership, generation, navigation, safety, freshness, and acceptance for API, data dictionary, and components. | completed | [Living documentation](architecture/living-documentation.md) maps canonical sources, derived artifacts, safety, navigation, and checks; Phase 11 lists implementation and browser/CI acceptance tasks without selecting portal technology. |
| P10.5 | Align plan, human actions, and validation with the intended foundation scope; run the full applicable gate and review the final documentation diff. | completed | Phase 12 owns H-09–H-11; no new human action is required. Local full `pnpm validate` passed after Codex started the existing Docker engine. [PR #11 CI run #36](https://github.com/GabriellMDias/Orion/actions/runs/36135591982) passed Validate, Dependency Review, and `Orion required gate`. Final diff has no unrelated or generated-artifact changes. |

**Expected deliverables:** One setup route, mechanically checked safe environment example, simpler discoverable current documentation, living-documentation architecture, and an executable Phase 11 plan.

**Dependencies:** Phase 9 reference vertical slice and current canonical/generated sources. No external owner action or deployed environment is required.

**Validation/acceptance criteria:**

- A new contributor can find setup, current policies, generated API/data references, and the future portal boundary from the README and task index.
- Setup commands load configuration as documented; `.env.example` contains no credentials and fails validation on drift from the API configuration reference.
- Documentation links/anchors and normative requirements remain intact; accepted ADR decisions and rationale are unchanged.
- `pnpm validate` passes locally and in the Phase 10 PR; no Phase 11 portal implementation is claimed.

**Completion evidence (2026-09-25):** The copied ignored `.env.local` started the API through its documented development command and readiness returned `200 {"status":"ok"}`. The full local gate passed formatting, lint, strict types, dependency boundaries, 77 Markdown files/1326 local links/12 ADRs, environment-example and release-history checks, API/database/SDK reference freshness, 40 API tests, two web unit and two browser component tests, API/web builds and bundle screening, two process smokes, and two Chromium journeys. [PR #11 CI run #36](https://github.com/GabriellMDias/Orion/actions/runs/36135591982) passed all three repository jobs. No ADR was required because this phase records existing documentation intent and ordinary setup conventions without selecting a new architecture or portal technology. H-06 remained conditional: Docker Desktop was initially stopped, then started by Codex without host intervention.

**Usable state:** The existing application remains usable, with a simpler canonical documentation and setup path ready for portal implementation.

**Governing sources:** [Contributing](contributing.md), [configuration](architecture/configuration.md), [schema documentation](database/schema-documentation.md), [API principles](api/principles.md), and [living documentation](architecture/living-documentation.md).

## Phase 11

### Living Documentation Portal

**Objective:** Deliver the human-facing, navigable living documentation required by Orion's foundation while retaining reproducible AI-readable artifacts.

| Task | Main work | Status | Evidence / dependency |
| --- | --- | --- | --- |
| P11.1 | Choose the smallest coherent portal/component-documentation implementation within existing application/package boundaries; record a new ADR only if the ADR policy requires one. | completed | Public `/docs` route in existing React/Vite web app uses no new dependency or boundary. ADR policy review found no significant new architectural decision. |
| P11.2 | Render the current TypeBox/OpenAPI operations, schemas, authentication, and stable public errors from canonical/generated API sources. | completed | Generator derives 11 operations, nested request/response fields, declared bearer security, statuses, error envelope, and registered codes from committed OpenAPI/error reference. |
| P11.3 | Render the migrated PostgreSQL structure and schema-adjacent data dictionary, including ownership, classification, null semantics, lifecycle, and constraints as recorded. | completed | Portal derives the table, columns, constraints/indexes, and enum from the migrated-database Markdown; `references:check` verifies physical and semantic source freshness. |
| P11.4 | Add component-owned examples/metadata and a generated AI-readable component reference for real web components; show states, accessibility, and usage in the human interface. | completed | `components.docs.json` covers both exported web components; generated `docs/generated/components/web.md`; live synthetic previews and browser checks. |
| P11.5 | Provide clear navigation and links among API, data, components, domain policy, and canonical artifacts; make the portal reachable from the README and docs index. | completed | Sidebar/operation navigation, local AI-readable artifact links, canonical source/policy links, README/index/setup routes, Playwright navigation test. |
| P11.6 | Add deterministic generation/freshness, missing-metadata, link, and sensitive-content checks to the shared local/CI validation path; document regeneration commands. | completed | `docs:references:write/check` and `docs:check` run in `pnpm validate`; deliberate stale artifact, missing metadata, and token-pattern mutations all failed and were restored. Setup documents regeneration. |
| P11.7 | Exercise a clean setup, portal build/serve, browser navigation and representative pages, accessibility at the relevant UI boundary, generated-artifact drift failures, and the full gate; report acceptance evidence. | completed | Local `pnpm validate` passed (40 API, 2 web unit, 2 browser component, 5 Playwright tests). Separate clean worktree passed frozen install, generation with no diff, Vite production build/preview, browser page and all four reference assets. Deliberate stale/metadata/token-pattern changes failed checks and were restored. [PR #13 CI run #42](https://github.com/GabriellMDias/Orion/actions/runs/36179651470) passed Validate, Dependency Review, and Orion required gate. |

**Expected deliverables:** Navigable Living Documentation Portal, generated API/data/component references, documented ownership and regeneration, and browser/CI acceptance evidence.

**Dependencies:** Phase 10 and the implemented API, database, and web reference feature. A concrete identity provider or production deployment is not required to document current behavior.

**Validation/acceptance criteria:**

- Humans can navigate the API, database/data dictionary, and frontend components in a working local interface, with links to their canonical and AI-readable sources.
- No page invents business semantics or exposes real secrets/data; API and database pages reflect current generated artifacts, and component pages reflect actual source/examples.
- Generated representations are reproducible from documented inputs, and `pnpm validate`/CI fail on stale output or missing required metadata.
- Clean-checkout setup, portal build/serve, representative browser flows, and full validation pass with evidence. The foundation is complete only after these criteria pass.

**Completion evidence:** P11.1–P11.7 and every criterion above are satisfied by the linked source, generated references, local/clean-checkout checks, and PR CI run. The development foundation is complete; conditional deployment-specific Phase 12 has not started.

**Usable state:** The complete development foundation, including a navigable living documentation interface and machine-readable references, without requiring a deployed product.

**Governing sources:** [Living documentation](architecture/living-documentation.md), [API principles](api/principles.md), [schema documentation](database/schema-documentation.md), [contributing](contributing.md), and [validation](validation.md).

## Phase 12

### Deployment-specific operationalization

**Objective:** Make an Orion application operable in a selected real environment. This phase is conditional on concrete requirements and authorized scope.

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

Keep this section concise. Task evidence above owns current progress; Git owns detailed editing history. Record significant scope changes, conditional deferrals, and decision references here.

| Entry | Change | Evidence / effect |
| --- | --- | --- |
| Phase 1 | Added pinned pnpm/TypeScript/ESM tooling and non-mutating local validation. | Frozen installation and aggregate validation pass; deliberate formatting, type, link, and boundary violations fail. |
