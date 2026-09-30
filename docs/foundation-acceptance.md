# Development Foundation Acceptance Report

[Implementation plan](implementation-plan.md#phase-11) · [Development setup](setup.md) · [Human actions](human-actions.md) · [Validation](validation.md)

This report assesses the Approval Request reference feature against Phase 9 and the completed living-documentation foundation against Phase 11. It does not certify a production deployment, select an identity provider, create historical release obligations, or replace the governing policies and ADRs.

The evidence below was produced for the Orion foundation repository at the recorded dates, commits, and pull requests. In a project derived from Orion, this report is inherited foundation history: it documents the inherited implementation's provenance, but the project must reproduce validation, CI, and external settings in its own repository. See [project derivation](project-derivation.md).

## Reference feature evidence map

| Concern | Canonical owner and executable evidence |
| --- | --- |
| Business behavior, actors, states, and denial scenarios | [Approval Request specification](domains/approval-request.md); [domain rules](../apps/api/src/features/approval-requests/domain.ts) and [domain tests](../apps/api/test/approval-domain.test.ts). |
| Application operations, retries, and concurrency | [Implementation conventions](domains/approval-request-implementation.md), [application service](../apps/api/src/features/approval-requests/service.ts), [restricted PostgreSQL adapter](../apps/api/src/features/approval-requests/prisma-repository.ts), and [integration/failure tests](../apps/api/test/approval-integration.test.ts). |
| Durable data and ownership | [Prisma schema and reviewed migration](../apps/api/prisma/schema.prisma), [schema-adjacent meaning](../apps/api/prisma/schema-metadata.json), and [generated migrated-PostgreSQL reference](generated/database/approval-requests.md). [Migration evolution](database/release-evolution.md) governs a real durable release boundary. |
| API and client contract | [TypeBox operations](../apps/api/src/features/approval-requests/contracts.ts) and [routes](../apps/api/src/features/approval-requests/routes.ts) generate [OpenAPI 3.1](generated/api/openapi.json) and [SDK types/client](../packages/sdk/README.md). The SDK exposes one thin public surface; the web app imports it, not API implementation. |
| Authentication, authorization, and errors | [Provider-independent token adapter](../apps/api/src/features/approval-requests/authentication.ts), domain ownership/capability checks, [public error source](../apps/api/src/errors.ts), [generated error codes](generated/api/errors.md), and migrated-PostgreSQL HTTP tests for anonymous, non-owner, self-review, stale, and invalid-state denials. |
| Browser workflow | [Web guide](../apps/web/README.md), [web API boundary](../apps/web/src/api.ts), [browser component tests](../apps/web/test/components.browser.test.tsx), and [Playwright owner/reviewer journeys](../apps/web/test/e2e/approval.spec.ts). |
| Configuration, telemetry, and lifecycle | [Typed API configuration](../apps/api/src/config.ts) and [generated reference](generated/configuration/api.md); [Pino](../apps/api/src/logging.ts), [OpenTelemetry](../apps/api/src/telemetry.ts), [health/lifecycle](../apps/api/src/lifecycle.ts), and [redaction](../apps/api/test/telemetry.test.ts), [correlation](../apps/api/test/app.test.ts), [readiness](../apps/api/test/approval-integration.test.ts), and [shutdown](../apps/api/test/lifecycle.test.ts) tests. |
| Repeatable procedures | [Development setup](setup.md), [API runtime guide](../apps/api/README.md), [validation commands](validation.md), and [release evolution workflow](database/release-evolution.md). [Runbook index](runbooks/README.md) explains why no environment-specific production runbook exists yet. |

## Phase 9 acceptance checks

The reference slice is accepted as a development foundation. Current reproducible checks are listed in [validation](validation.md); the following dated evidence establishes the original acceptance, not a fresh execution on every documentation edit.

| Criterion | Accepted capability and evidence |
| --- | --- |
| Contributor workflow | [Setup](setup.md) covers frozen installation, validated environment loading, health-only execution, and the full disposable feature workflow. Clean-checkout installation, API readiness, Vite proxy, migration/reference generation, and builds were exercised during foundation acceptance. |
| Reproducible data and artifacts | The [API reference generator](../apps/api/scripts/generate-references.ts) migrates disposable PostgreSQL and derives configuration/errors/OpenAPI/data references. SDK generation consumes OpenAPI; freshness checks reject drift without rewriting tracked files. No external account, seed dataset, or persistent database is needed for test journeys. |
| Validation and CI | The local full gate and [PR #10 run #33](https://github.com/GabriellMDias/Orion/actions/runs/36120843908) passed on 2026-09-25; [CodeQL](https://github.com/GabriellMDias/Orion/runs/108025860595) found no new alerts in changed code. Current command definitions and test files, rather than historical test/module counts, define the supported gate. |
| Architectural and security controls | Dependency checks and domain, HTTP, PostgreSQL, browser, and process tests protect state, access, self-review denial, CAS, idempotency, rate limiting, recovery, telemetry redaction, and client/server boundaries. These controls do not prove that every architectural violation or data leak is detectable. |
| Conditional scope | Real provider/deployment, durable release/support baselines, retention durations, external integrations, and operational owners remain conditional under [human actions](human-actions.md). They do not block the reference development workflow. |

## Boundary review and remaining limits

The backend owns its feature schema, domain/application operations, and PostgreSQL adapter. Fastify handles transport; verified identity is mapped to provider-independent concepts; the web consumes `@orion/sdk` through its public export. No generic domain, contracts, database, queue, or observability package was added merely to make this one feature reusable. The existing [API-local](../apps/api/AGENTS.md), [web-local](../apps/web/AGENTS.md), [SDK-local](../packages/sdk/AGENTS.md), and [documentation-local](AGENTS.md) instructions cover distinct obligations while the root instructions retain global invariants and commands.

The development UI accepts an already-issued token in memory and has no login flow. A real environment must resolve [H-07](human-actions.md#h-07) and the applicable deployment decisions before this becomes a production user workflow. The current process-local source-IP rate limit is not a fleet-wide or trusted-proxy guarantee. There is no released compatibility baseline for upgrade tests, no automatic deletion or legal retention duration, and no production runbook or recovery objective. Those are explicit conditional boundaries, not missing Phase 9 implementation.

The development foundation is accepted within these limits. Deployment-specific work remains conditional and unstarted in [Phase 12](implementation-plan.md#phase-12).

## Phase 11 foundation acceptance

| Criterion | Accepted capability and evidence |
| --- | --- |
| Human navigation | The public [web `/docs` route](../apps/web/src/documentation.tsx) renders current API operations, authentication/errors, migrated database semantics/structure, and live synthetic examples of the actual exported web components. It links existing AI-readable artifacts and canonical sources. |
| Single source and safe output | The [generator](../tooling/documentation/generate.mjs) derives portal data and component Markdown from generated API/database references and [owned component metadata](../apps/web/src/components.docs.json). Vite serves the existing artifacts without another tracked copy. Freshness, metadata completeness, and known-secret checks run in the gate; deliberate stale/missing/token-pattern mutations failed during acceptance. |
| Reproducible setup/preview | A separate checkout of `22d2cef` passed frozen install, generation with no tracked diff, and production build/preview. Chromium confirmed `/docs` and its four reference assets without an API or identity provider. [Setup](setup.md#living-documentation-portal) owns the current procedure. |
| Browser and CI checks | [Portal journeys](../apps/web/test/e2e/documentation.spec.ts) cover public navigation, representative content, artifacts, synthetic examples, keyboard behavior, and narrow viewport. The full local gate and [PR #13 run #42](https://github.com/GabriellMDias/Orion/actions/runs/36179651470) passed during acceptance on 2026-09-25. These are dated results, not a claim that remote CI ran for subsequent edits. |

The original foundation is complete against [Phase 11](implementation-plan.md#phase-11); completion does not activate deployment, provider, retention, or operational choices. Subsequent portal improvements have separate review evidence below.

## Living Documentation portal review

The current implementation replaces the single-page portal with local, hierarchical collections and independent API, table, component and repository-document pages. It includes all repository Markdown under `docs/` and all README/instruction files, local links and headings, scoped full-text search, API group filtering, responsive navigation, and an explicit API explorer. [Living-documentation architecture](architecture/living-documentation.md) owns the implementation boundaries and maintenance rules; [L1–L4](implementation-plan.md#maintaining-this-plan) own task status.

Canonical inputs remain Markdown, executable contracts, migrated database references and component metadata. Deterministic generation emits a lightweight manifest, per-page JSON and bounded search shards; UI navigation loads selected pages and search runs in a worker. Catalog rendering and retained search results are bounded. Total catalog size and search work still grow with content; the implementation does not claim unlimited constant-cost search. Unsupported API authentication/media/serialization stays inspectable without execution. Responses are bounded/redacted, credentials remain in memory, and mutations require explicit acknowledgement.

| Verification | Current result |
| --- | --- |
| Reproducible prerequisites, 2026-09-28 | Frozen installation passed with the pinned Node.js 24.13.0 and pnpm 11.25.0. |
| Generator publication boundaries | All 12 generator tests passed, including deterministic output, a 1,000-document inventory, search chunk boundaries and regression coverage rejecting symlink/junction output paths. |
| Types, source architecture and configuration | Type checking, source dependency rules, environment-example checks and release checks passed. Dependency analysis excludes emitted `dist` chunks, preserving source rules while avoiding false cycles after a build. |
| API, search and catalog behavior | All 40 API integration/unit tests and 44 web Node tests passed, including safe API execution/response handling, search across chunks/shards and pagination over 1,000 sibling folders. API/database/SDK freshness, both process/HTTP smoke suites and production builds/bundle checks passed. |
| Final documentation/static checks | Formatting, lint, types, architecture, documentation links/ADR metadata, environment-example checks, release integrity and its two regression tests, generated references and diff checks passed. A negative source-cycle probe still failed as required after excluding emitted bundles. |
| Clean setup, 2026-09-28 | A separate managed checkout received the working-tree source snapshot without dependencies, build caches or local environment files. Frozen installation, freshness checks before/after regeneration, production API/web builds, bundle check and post-build architecture check passed. All 289 source/output files remained byte-identical and no extra source files appeared. This verifies clean non-browser setup, not browser serving or UI acceptance. |
| Final full local gate, 2026-09-29 | `pnpm validate` passed after API, SDK, portal and documentation regeneration: 45 API tests, 58 web Node tests, two browser component tests, both built-process smoke suites, 19 Playwright journeys including five automated WCAG A/AA scans, builds, generation/drift checks, and the static/architecture gates. The clean-checkout gate is recorded below. Remote CI must be reported from its own run. |

Earlier Phase 11 and documentation-review results establish their respective baselines. An earlier portal browser attempt passed 11 of 14 tests and required selector/label corrections. The subsequent 2026-09-29 full local run passed all 19 Playwright journeys, including five automated accessibility scans; neither run substitutes for the owner's manual H-12 acceptance.

**Human-observed browser acceptance:** On 2026-09-29 the owner explicitly reported [H-12](human-actions.md#h-12) complete. The [manual browser checklist](validation.md#living-documentation-manual-browser-checks) specifies the intended scope. No browser/version, revision or route-by-route evidence was supplied, so this records the owner's acceptance without inventing individual observations. Automated browser and full-gate results are recorded separately below. Phase 12 remains excluded and unstarted.

## Final foundation audit

The 2026-09-29 audit reviewed architecture, backend, database, web, generated references, instructions, documentation, testing, security, CI, and setup against the implemented reference workflow. It found concrete gaps and closed them in the canonical source and corresponding regression checks:

| Area | Audit change and evidence |
| --- | --- |
| Authentication and diagnostics | JWT verification now distinguishes rejected credentials from JWKS infrastructure outages without disclosing tokens or provider detail. Unexpected HTTP/startup failures retain bounded safe diagnostic type, stack and cause context; public responses stay generic. Focused authentication, configuration, telemetry and built-process smoke tests cover the boundaries. |
| Observability and configuration | API configuration metadata now classifies secrets and data; a validated `ORION_RELEASE_ID` identifies local/runtime releases. Centralized request/trace/span context and Prisma instrumentation enter the telemetry pipeline before application composition. Export normalization strips SQL, values and unsafe span status/detail. Health-request log noise is suppressed. |
| Data references | Reference generation compares the authored Prisma model with a freshly migrated PostgreSQL database, documents primary keys, and fails closed on unsupported application-owned objects rather than silently omitting them. Integration tests exercise mismatch and unsupported-object rejection. |
| Client boundaries | Browser API-origin configuration rejects unsafe path/authority forms. Async mutation responses cannot navigate or repopulate cache after a credential-session change. Browser journeys cover late create/edit responses. Dependency rules now cover the flat domain module and direct server-only imports in client/SDK source; five negative/permitted architecture fixtures pass. |
| API documentation | Operation descriptions are owned beside the executable route contracts and generated into OpenAPI and local API detail pages. They explain access, state and concurrency behavior without creating a second handwritten reference. |

| Verification | 2026-09-29 result |
| --- | --- |
| Main checkout | `pnpm validate` passed after final implementation and API prose metadata, covering static checks, source architecture and five regression fixtures, documentation, deterministic references and 12 generator tests, 45 API tests, 58 web Node tests, two browser component tests, builds, both process smoke suites, and 19 Playwright journeys. Five portal pages had no automated WCAG A/AA violations in the suite. `git diff --check` passed before commit. |
| Fresh checkout | Managed worktree at `18c9a05` began without `node_modules` or local `.env` files. `pnpm install --frozen-lockfile` and the same complete `pnpm validate` passed using Node.js 24.13.0 and pnpm 11.25.0 with disposable PostgreSQL. Re-running API, SDK and portal generators in write mode left no tracked Git diff. This proves clean local setup and deterministic generation for the tested commit. |
| Human observation | Owner-reported [H-12](human-actions.md#h-12) manual browser acceptance is an attestation without a supplied route-by-route log. It is independent of the automated journeys and scans above. |
| Remote verification | The [required PR gate](architecture/continuous-integration.md) must report its own result on the submitted branch; local success is not a claim of remote CI or deployment. |

The clean run tested the source commit before this evidence-only report update. Portal output is regenerated from this report, and final branch CI validates the resulting commit. Phase 12 remains unstarted.

## Documentation maintenance review

The 2026-09-26–27 review covers 79 repository files: all 71 files under `docs/` plus the root/application/SDK guides and instructions outside it. This includes all seven `AGENTS.md` and seven `README.md` files, with overlap inside `docs/`. It evaluates source accuracy, ownership, task navigation, context efficiency, duplication, and semantic preservation. [D1–D3](implementation-plan.md#maintaining-this-plan) track completion and current validation evidence. Accepted ADR substance remains historical; generated references remain derived from their existing sources.

The review is complete. It improved 66 Markdown files, reduced the reviewed Markdown from about 243,000 to 105,000 words (57%), clarified task/source navigation and ownership, consolidated repeated policy, and replaced stale capability claims with verified implementation limits. Semantic cross-review checked requirements, rationale, exceptions, and conditional obligations. All 12 accepted ADR bodies and all 85 original plan task IDs/statuses are preserved; ADR edits only repair references. Generated artifacts, runtime code, migrations, and dependencies are unchanged.

| Verification | Result |
| --- | --- |
| Reproducible prerequisites | Frozen installation passed; Node.js 24.13.0, pnpm 11.25.0, and reachable Docker 28.4.0 verified. |
| Full local gate, 2026-09-27 | `pnpm validate` passed: formatting, lint, types, dependency rules, links/ADR metadata, environment example, release integrity and its two tests, generated references, 40 API tests, two web unit tests, two browser component tests, builds/bundle check, both smoke suites, and five end-to-end journeys. |
| Final documentation and diff | `pnpm docs:check`, `pnpm docs:references:check`, and `git diff --check` passed after final edits. The portal remains derived from 11 API operations, one table, and two components. |

These results verify that documentation-only review's local checkout. They are retained as dated evidence rather than claims about the current audit. Deployment-specific Phase 12 remains unstarted.

### Implementation concerns identified during review

| Concern | Evidence and disposition |
| --- | --- |
| Authentication failure diagnostics | Resolved in [JWT verification](../apps/api/src/features/approval-requests/authentication.ts) with safe unavailable-versus-invalid classification and regression tests. |
| Unexpected and startup failure diagnostics | Resolved at the [HTTP boundary](../apps/api/src/app.ts) and [bootstrap](../apps/api/src/main.ts), with bounded redacted diagnostics and cleanup. |
| Configuration metadata | Resolved in the [canonical API metadata](../apps/api/src/config.ts), generated reference and example validation. |
| Observability baseline | Resolved for the local API in [logging](../apps/api/src/logging.ts) and [telemetry](../apps/api/src/telemetry.ts). Deployed backends, sampling, dashboards and alert ownership remain conditional Phase 12 decisions. |
| Architecture enforcement coverage | The flat `domain.ts` and direct browser/SDK server imports now have checks and negative fixtures. Static import analysis cannot prove every possible runtime boundary, so architectural review remains necessary. |
| Database reference coverage | The generator now rejects unsupported application-owned objects and compares Prisma structure to migrated PostgreSQL. A new object kind requires deliberate support before adoption; this is not a universal catalog exporter. |
| Standalone API prose | Canonical route metadata now supplies operation descriptions in generated OpenAPI and the portal. The domain specification remains the authority for full business policy. |

The audit resolved the actionable local gaps above. Conditional deployment requirements remain in [Phase 12](implementation-plan.md#phase-12), not in this foundation acceptance.

## Agent portability and project derivation

The 2026-09-29 change makes Orion's instructions agent-neutral and adds the [project derivation](project-derivation.md) workflow under [ADR-0013](adr/0013-keep-agents-md-as-the-agent-neutral-instruction-source.md) and [ADR-0014](adr/0014-derive-projects-from-orion-through-git-ancestry-with-recorded-provenance.md). [AP1–AP2 and PD1–PD5](implementation-plan.md#maintaining-this-plan) own task status.

| Verification | 2026-09-29 result |
| --- | --- |
| Agent instruction discovery | Claude Code 2.1.284 (official documentation and this repository's own sessions), Gemini CLI 0.61.0 (its installed discovery functions executed against a disposable repository: `AGENTS.md` loads only with the adapter, including just-in-time nested files), and current Codex documentation. Details and limits are in [agent instructions](architecture/agent-instructions.md#tool-specific-compatibility). A live Gemini model session was unavailable: the installed client's account tier was refused by the service. |
| Orion full gate | `pnpm validate` passed on `2ca715c`, on `9e7b794`, on the remote-safety hardening commit `d593d7e`, on the first review fix commit `f5e7abc`, and on the final head `601587c`, which brought the derivation suite to 19 tests. The final run left the worktree clean and includes 5 agent-instruction tests, 19 derivation tests against disposable local Git repositories, 13 generator tests, 45 API tests, 58 web Node tests, two browser component tests, both process smokes, and 19 Playwright journeys. |
| Pristine-clone initialization | A fresh clone of a local bare mirror whose `main` was the change's commit, reached through the canonical `https://github.com/GabriellMDias/Orion` URL by Git URL rewriting, passed frozen installation, the documented dry run with no changes, and `pnpm orion:init-project --apply`. The result was one commit on top of Orion history, a fetch-only tag-free `orion-upstream` that refused a push while the mirror stayed unchanged, a new `origin`, and portal source links to the project repository. Documentation, agent, provenance, portal freshness, release, and environment checks passed there. |
| Derived project full gate | The first derived checkout (`2ca715c`) failed `pnpm orion:test` because two repository-level tests assumed the checkout is always the foundation; they now accept either manifest kind (`1e65f63`). A new pristine clone initialized from `1e65f63` then passed the complete `pnpm validate`: 84 Markdown files, agent and provenance checks, 10 derivation and 13 generator tests, 45 API tests, 58 web Node tests, two browser component tests, both process smokes, and 19 Playwright journeys. |
| Upgrade workflow | In the `2ca715c`-based project, after a simulated upstream commit changed `README.md` shared routes, `docs/setup.md`, and portal data, the project fetched, merged it on an upgrade branch, and resolved conflicts only in two generated portal pages by regeneration. `orion:status` reported the integrated but unrecorded commit, `orion:record-baseline` updated the manifest, and provenance, documentation, and portal checks passed. A teammate clone configured `orion-upstream` with `pnpm orion:upstream` and its push was refused. |
| Remote safety | `pnpm orion:check` rejects an `origin` whose fetch or push URL identifies the foundation (HTTPS and SSH forms), an `orion-upstream` fetching another repository, and a missing, replaced, or additional `orion-upstream` push URL; `pnpm orion:upstream` restores protection. A contributor clone whose `origin` is a project fork passes with and without `orion-upstream` and pushes product work to the fork. After PR review, it also rejects any local branch, current or not, that tracks `orion-upstream`, and `pnpm orion:upstream` removes that tracking idempotently while leaving other tracking intact. Explicit non-default HTTPS ports stay in repository identities and generated source links; non-default SSH ports are refused rather than discarded. After the second review, repository path case is significant when a URL is accepted as a repository and ignored when a URL is refused as possibly the foundation. Initialization refuses before any change when any of several `origin` URLs is not the foundation. `pnpm orion:record-baseline` refuses an unverified or absent `orion-upstream` and refetches the foundation branch first, so a descendant commit from another repository cannot be recorded even through stale refs. These cases run in `pnpm orion:test` and the generator tests; the derived pristine-clone gate above predates them. |
| Remote verification and merge | [PR #15](https://github.com/GabriellMDias/Orion/pull/15): the CodeQL test-code alert found on `d593d7e` and the five Codex P2 findings were fixed and answered in their review threads. On final head `601587c` the [required gate](https://github.com/GabriellMDias/Orion/actions/runs/36637414096), Validate, Dependency review, CodeQL (no new alerts), both Analyze jobs, and GitGuardian passed. A third automated Codex review was unavailable because the review quota was exhausted; the owner reviewed the final code against the five findings instead. The PR was merged into `main` by merge commit `01f4da03d3ab1f9de02d7a3f4e0cc885c7d09f29`, whose tree matches `601587c`. |

This evidence covers automated and disposable local derivation scenarios and the merged implementation. It does not include an owner-observed derivation of a separate, real GitHub-hosted project repository with its own settings and CI. That exercise is the next acceptance activity. It is not production certification or deployment readiness, and Phase 12 remains unstarted.
