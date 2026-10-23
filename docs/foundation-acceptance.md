# Development Foundation Acceptance Report

[Implementation plan](implementation-plan.md#phase-11) · [Development setup](setup.md) · [Human actions](human-actions.md) · [Validation](validation.md)

This report assesses the Approval Request reference feature against Phase 9 and the completed living-documentation foundation against Phase 11. It does not certify a production deployment, select an identity provider, create historical release obligations, or replace the governing policies and ADRs.

The evidence below was produced for the Orion foundation repository at the recorded dates, commits, and pull requests. This report stays in the foundation and is removed during clean-project initialization. Every project must reproduce validation, CI, and external settings in its own repository; older inherited copies are historical evidence only. See [project derivation](project-derivation.md).

## Reference feature evidence map

| Concern | Canonical owner and executable evidence |
| --- | --- |
| Business behavior, actors, states, and denial scenarios | [Approval Request specification](domains/approval-request.md); [domain rules](../apps/api/src/features/approval-requests/domain.ts) and [domain tests](../apps/api/test/approval-requests/domain.test.ts). |
| Application operations, retries, and concurrency | [Implementation conventions](domains/approval-request-implementation.md), [application service](../apps/api/src/features/approval-requests/service.ts), [restricted PostgreSQL adapter](../apps/api/src/features/approval-requests/prisma-repository.ts), and [integration/failure tests](../apps/api/test/approval-requests/integration.test.ts). |
| Durable data and ownership | [Prisma models](../apps/api/prisma/schema/approval-requests.prisma), [reviewed migration](../apps/api/prisma/migrations/20260924000000_approval_requests/migration.sql), [schema-adjacent meaning](../apps/api/prisma/metadata/approval-requests.json), and [generated migrated-PostgreSQL reference](generated/database/schema.md). [Migration evolution](database/release-evolution.md) governs a real durable release boundary. |
| API and client contract | [TypeBox operations](../apps/api/src/features/approval-requests/contracts.ts) and [routes](../apps/api/src/features/approval-requests/routes.ts) generate [OpenAPI 3.1](generated/api/openapi.json) and [SDK types/client](../packages/sdk/README.md). The SDK exposes one thin public surface; the web app imports it, not API implementation. |
| Authentication, authorization, and errors | [Provider-independent token adapter](../apps/api/src/authentication.ts), domain ownership/capability checks, [public error source](../apps/api/src/errors.ts), [generated error codes](generated/api/errors.md), and migrated-PostgreSQL HTTP tests for anonymous, non-owner, self-review, stale, and invalid-state denials. |
| Browser workflow | [Web guide](../apps/web/README.md), [web API boundary](../apps/web/src/approval-requests/api.ts), [browser component tests](../apps/web/test/components.browser.test.tsx), and [Playwright owner/reviewer journeys](../apps/web/test/e2e/approval-requests/workflow.spec.ts). |
| Configuration, telemetry, and lifecycle | [Typed API configuration](../apps/api/src/config.ts) and [generated reference](generated/configuration/api.md); [Pino](../apps/api/src/logging.ts), [OpenTelemetry](../apps/api/src/telemetry.ts), [health/lifecycle](../apps/api/src/lifecycle.ts), and [redaction](../apps/api/test/telemetry.test.ts), [correlation](../apps/api/test/app.test.ts), [readiness](../apps/api/test/approval-requests/integration.test.ts), and [shutdown](../apps/api/test/lifecycle.test.ts) tests. |
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
| Authentication failure diagnostics | Resolved in [JWT verification](../apps/api/src/authentication.ts) with safe unavailable-versus-invalid classification and regression tests. |
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

This dated evidence covers automated and disposable local derivation scenarios and the merged implementation. The subsequent real GitHub-backed exercise is recorded below. Neither is production certification or deployment readiness, and Phase 12 remains unstarted.

## GitHub-backed derivation first-push defect

On 2026-09-30, the real `Orion-Derivation-Test` acceptance exercise used Orion `v1.1.0`, whose immutable foundation commit is `d31ca7ddfc3632d46af09db43580004f69b728d9`. Its [first push run](https://github.com/GabriellMDias/Orion-Derivation-Test/actions/runs/36781503697) on sandbox commit `bf543b885cd509c2703191988aaf98c77f8371d3` failed `pnpm validate` at `pnpm release:check`, causing the required gate to fail. The inspected log shows `ORION_RELEASE_BASE_REF=0000000000000000000000000000000000000000` from `github.event.before` and `git rev-parse --verify 0000000000000000000000000000000000000000^{commit}` failing with `fatal: Needed a single revision`. This was a foundation validation defect exposed by real GitHub acceptance; the earlier disposable local derivation gates did not cover that event boundary.

The correction belongs in the shared [release-history validator](../tooling/validate/release-history.ts), which interprets only the exact forty-zero sentinel as an absent comparison base. The workflow continues passing event bases unchanged. The [release-history policy](database/release-evolution.md#record-the-first-durable-migration-boundary) still requires a real comparison commit for a nonempty registry and preserves append-only entries, complete released migration sets, and SQL checksums.

Regression coverage in [the tooling suite](../tooling/validate/release-history.test.ts) exercises the actual CLI environment boundary with inherited Git history, first-push validation of empty and malformed registries, rejection of nonempty registries without a real base, real bases with empty or absent registries, invalid/unavailable/non-commit bases, unchanged and appended releases, and rejection of edited, removed, or reordered entries. Existing released-SQL and line-ending coverage remains enabled.

**Local verification (2026-09-30):** Frozen installation, all eight release-history tests, `pnpm release:check` with both the exact zero-SHA sentinel and a real `origin/main` SHA, documentation/link/freshness checks, and `git diff --check` passed. Full `pnpm validate` passed with `ORION_RELEASE_BASE_REF=0000000000000000000000000000000000000000`, including all 19 derivation tests, real PostgreSQL/reference checks, API and web tests, builds, process smokes, and all 19 Playwright journeys. The new regressions reproduced the sentinel resolution failure before the code correction. This is local first-push environment reproduction; the dedicated Orion PR must verify its own remote CI, and the sandbox's failed run has not been rerun or repaired here.

[RH1](implementation-plan.md#maintaining-this-plan) records completion of the foundation correction. It is a compatible PATCH candidate expected to become `v1.1.1`, not a new release in this change. `v1.1.0` remains the release that exposed the defect. The sandbox is unchanged, and a derived-project upgrade and real GitHub reverification remain separate follow-up work.

## Foundation release history

`v1.0.0` represents the completed reusable Orion foundation: agent-neutral repository instructions, Living Documentation, validation/CI/security foundations, the Approval Request reference slice, project derivation with preserved Git ancestry, recorded provenance, and guarded baseline upgrades. It marks the foundation state accepted before the first real GitHub-backed sandbox derivation exercise. It does not certify production deployment, activate Phase 12, select a production identity provider, establish product-specific readiness, or promise conflict-free upgrades. The real GitHub-backed derivation and subsequent upgrade exercise remain acceptance and reverification activities.

The Apache-2.0 licensing change from PR #18 was merged without creating `v1.0.1`; that version does not exist. `v1.1.0` identifies the merged PR #19 revision and was used as the baseline for the real GitHub-backed `Orion-Derivation-Test`. That exercise exposed the [first-push release-history defect](#github-backed-derivation-first-push-defect). Its compatible validation correction was merged through [PR #20](https://github.com/GabriellMDias/Orion/pull/20); `v1.1.1` identifies its merge commit `b2b087037070a228810f3186a6ae92d8a1ca4557`. The [implementation plan](implementation-plan.md#maintaining-this-plan) tracks the correction and separate upgrade follow-up. The existing tags remain immutable. A candidate is not a released version until its deliberate release point is tagged.

This history moved here from the [versioning policy](versioning.md), which now contains only policy shared with derived projects.

## Clean project baseline

The owner directed on 2026-09-30 that a newly derived project start as a clean product base without Orion's reference implementation or development history and with its own identity ([ADR-0017](adr/0017-start-derived-projects-from-a-clean-foundation-baseline.md), [derivation guide](project-derivation.md)). Plan tasks CB1–CB5 track the work.

| Area | Change |
| --- | --- |
| API | Shared runtime separated from the reference: [module contract](../apps/api/src/module.ts), [composition file](../apps/api/src/modules.ts), shared [errors](../apps/api/src/errors.ts) and [public registry](../apps/api/src/error-registry.ts), [database client](../apps/api/src/database.ts), [access-token verifier](../apps/api/src/authentication.ts), and a [service name](../apps/api/src/service-identity.ts) derived from the package. Configuration requires a database or token settings only for composed modules that need them. |
| Database | Prisma schema folder with per-module model, metadata, and runtime-grant files; the database reference is `docs/generated/database/schema.md` and supports zero tables. |
| Web | Shell, home, and module navigation separated from the reference workflow; [composition file](../apps/web/src/modules.tsx); project name from the manifest in titles, shell, and portal; brand assets renamed to repository-owned `brand-mark.svg` and `brand-touch-icon.png`. |
| Tests | Reference tests and browser journeys moved under per-module directories; shared tests and journeys cover the shell and portal without the reference. |
| Derivation | [`.orion/derivation.json`](../.orion/derivation.json), manifest schema version 2 with `packageScope`, foundation-only removal, project-owned templates, workspace scope rename, regeneration, `pnpm orion:prune`, and isolation/cleanliness checks in `pnpm orion:check`; a dependency rule keeps shared API code from importing feature modules. |
| Documentation | Shared documentation no longer links to or describes foundation-only files; foundation history stays in Orion-only files. |

Evidence is recorded under CB4 and CB5 in the [implementation plan](implementation-plan.md#maintaining-this-plan).

## End-to-end derivation validation

On 2026-10-01 the derivation flow was validated end to end, following the commands in the [derivation guide](project-derivation.md) as a user runs them. A disposable folder at the repository root, excluded only through the local `.git/info/exclude`, held the project, a teammate clone, and an Orion maintainer clone. Because the branch was not yet on GitHub, `github.com` URLs were resolved with a session-only Git `url.<base>.insteadOf` setting to local bare repositories: a stand-in for `GabriellMDias/Orion` whose `main` was the commit under test, with Orion's tags, and an empty stand-in for the new product repository. The configured remote URLs stayed the real GitHub URLs, which the provenance checks inspect. Nothing in the project was edited by hand; every project file came from initialization, the documented upgrade commands, or the generators.

The test project was named `Pedido Fácil` (repository `git@github.com:GabriellMDias/pedido-facil.git`), exercising a non-ASCII name and the derived package scope `@pedido-facil`.

| Step | Commands | Result in the final cycle |
| --- | --- | --- |
| Clone and install | `git clone https://github.com/GabriellMDias/Orion.git pedido-facil`, `pnpm install --frozen-lockfile` | Full history; `origin` recorded as the canonical URL |
| Dry run | `pnpm orion:init-project --name "Pedido Fácil" --repository …` | Preconditions passed; listed actions; worktree unchanged |
| Initialization | the same command with `--apply` | Commit `Initialize Pedido Fácil from Orion 0dfdc69eb19d` whose parent is the Orion commit; clean worktree |
| Inspection | 44 read-only checks | All passed: the 15 foundation-only paths, the Orion plan, human actions, acceptance report, domain documents, migrations, metadata, and grants are absent; Approval Request is named only in ADR-0012/0014/0017, the derivation guide and contract, and their generated portal copies; no Orion history markers in shared documents; README, plan (PJ-01–PJ-05), and human actions (PH-01–PH-06) are the project's own with no unresolved placeholders; packages `pedido-facil` and `@pedido-facil/{api,web,sdk}`, no `@orion/` references in code or configuration, OpenAPI title `Pedido Fácil API`, portal title `Pedido Fácil Living Documentation`, telemetry service `pedido-facil-api`, neutral brand mark; manifest schema 2 with equal initialization and baseline commits; `origin` is the product repository; `orion-upstream` is fetch-only, tag-free, untracked, and refuses pushes; no modules, no tables |
| Project gate | `pnpm validate` | Passed: 93 cruised modules, 83 Markdown files, 26 derivation tests, 87 portal pages, 95 Vitest tests, smoke, 13 browser journeys; built page title `Pedido Fácil` |
| Publication (PH-01) | create the empty repository, `git push -u origin main` | `origin/main` equals the initialization commit |
| Teammate | `git clone`, `pnpm orion:check`, `pnpm orion:upstream`, `git fetch orion-upstream`, `pnpm orion:status` | Valid before and after configuring the foundation remote; push to `orion-upstream` refused |
| Foundation upgrade | an Orion maintainer commit changing a shared document, the reference implementation and Orion plan, adding a foundation-only test and a shared file importing `@orion/sdk`, with regenerated portal data | Published as `83be01d` on the stand-in |
| Upgrade merge | `git fetch orion-upstream`, `git switch -c orion-upgrade/…`, `git merge --no-ff …`, `pnpm orion:prune` | Four conflicts; prune resolved the two foundation-only ones, removed the added foundation-only test, renamed the new import to `@pedido-facil/sdk`, and left the two generated-portal conflicts for regeneration |
| Regeneration | step 5 generators, staging generated output, `pnpm orion:prune` again | No unresolved files; `pnpm validate` passed again |
| Baseline and merge | `pnpm orion:record-baseline …`, commit, push, merge with a merge commit | Baseline `83be01d`; initialization commit preserved; `pnpm orion:check` passed on `main` and in the teammate clone after pulling |

Earlier cycles found these defects, corrected in Orion before the final cycle: the portal header linked to the reference workflow's list scope; the generated portal manifest and the CI workflow carried Orion titles; shared policies named the system Orion; reference-only styling and an Orion release and phase narrative remained in shared files; the derivation test fixture used reference names; the large-portal generator test assumed Orion's documentation size; and the guide did not say how to resolve conflicts in generated output. The `ORION_*` variables, `orion_*` claims and database roles, the `Orion required gate` check, the portal's Orion baseline badge, and provenance references remain by design ([ADR-0017](adr/0017-start-derived-projects-from-a-clean-foundation-baseline.md)).

Orion's own format, lint, and documentation checks scan the working tree, so they report the disposable project while it exists; the folder and its exclusion line were removed before Orion's gate ran. Disposable logs and scripts were not committed.

## Documentation and Component Release Readiness

[Versioning policy](versioning.md) · [Project upgrades](project-derivation.md#upgrade-to-a-newer-orion-revision) · [Implementation status](implementation-plan.md#maintaining-this-plan)

Review date: 2026-10-23. Scope: Orion's uncommitted documentation isolation and component-catalog candidate based on `53bcc705a9f68f01aa1bbea3a0f4df4a009577ea`. No actual derived repository, deployment, remote branch, tag or GitHub Release is changed. Disposable rehearsal commits are evidence only and must never become a recorded production baseline.

### Implemented changes and review findings

- The complete engineering catalog, references, search, navigation and synthetic previews remain in development and in repository sources for agents. Default production builds remove the portal import tree, styles, pages, search assets and internal downloads. Artifact/browser tests also reject accidental product imports of the catalog, metadata and generated references.
- Internal builds require explicit selection and an acknowledgement of full-artifact hosting access controls. This supplies no authentication; an authorized host must protect direct assets/downloads and caches. Product help and public API documentation require separately approved source inventories and application-owned presentation. There is no automatic public publisher or public portal mode.
- The small native reference set is Button, TextField and the existing ErrorNotice. Categories, owner, reuse scope, props, states, accessibility, source links and code/live examples are generated from root or feature-owned metadata. Product styling uses inherited semantic tokens. Feature behavior stays in features; private components do not all need documentation.
- Root and web agent instructions route to one component policy and require inspecting existing UI before creating equivalents. No dependency, theme provider, workspace package, API/database change or manifest schema change was introduced.
- Final review fixed type-only export discovery, undocumented destructured shared exports, duplicate active navigation, the static-example outline label, and isolation-test assumptions about product help/home layouts. Artifact checks include the internal manifest and approved product help at `/docs`. Policy preserves explicit synthetic feature previews in products. Upgrade guidance preserves project-owned files even after conflict-free Git merges. Existing checks protect legacy metadata, local re-exports, deleted/ignored sources and the generated renderer discriminator.

### Validation evidence

Disposable rehearsals passed with Node.js 24.13.0, pnpm 11.25.0, Chromium and Testcontainers. A working-tree candidate was committed only in an isolated temporary foundation mirror; canonical Git URLs were rewritten to that local mirror through process-scoped Git configuration. No real remote writes, release tags or project changes were made.

| Boundary | Evidence on 2026-10-23 |
| --- | --- |
| Fresh derivation | Actual `orion:init-project` dry run and application, frozen install, regeneration and full `pnpm validate`: 21 generator tests, 26 derivation tests, 32 shared API tests, 63 web unit tests, 5 browser component tests and 19 E2E journeys. A later clean initialization with the final 15-path contract passed provenance/docs/freshness and artifact/browser isolation without `.env.local`. |
| Upgrade from v2.0.0 | Actual merge, prune, source resolution, regeneration, full derived gate and `orion:record-baseline`. Eleven existing product-owned files stayed byte-identical after deliberate ownership resolution; custom component/category metadata and product docs remained discoverable. Browser checks retained a real `/product` route, action, badge, theme and brand while internal `/docs` stayed absent in production. |
| Upgrade from v1.1.1 | Actual legacy initialization, schema 1 to 2 migration, source/composition port, prune, full derived gate, baseline recording and the same product browser checks. Seven product source/asset/docs files stayed byte-identical; the product route moved into the new composition seam. Both fixtures ended clean with the verified baseline as an ancestor; provenance, freshness and product browser checks passed after baseline recording. The synthetic legacy reference was unadopted and had no durable releases; existing refusal tests cover recorded migrations, not actual product migration history. |
| Human/agent discovery | Legacy and feature metadata, source/re-export checks, static/live examples and navigation regression tests; desktop/mobile screenshot inspection. Read-only normalization of actual IA-MNS/Teluni metadata passed, as detailed below. |
| Orion final gate | Final isolated `pnpm validate` passed: 21 generator tests, 26 derivation tests, 54 API tests, 63 web unit tests, 6 browser component tests, 2 artifact/browser tests and 31 E2E journeys. Formatting, lint, types, architecture, docs/agents, environment/release checks, generated references, build/bundle and both process smokes passed. One earlier concurrent attempt passed 30/31 E2E journeys; its saved trace shows `net::ERR_NETWORK_CHANGED` on three bootstrap modules before the portal loaded. The complete isolated rerun passed with no retry, timeout change or weakened assertion. |

Local diagnostic logs are retained under ignored `node_modules/.cache/orion-documentation-validation/`: `final-isolated-validate.log`, `final-reviewed-validate.log`, `final-rehearsal-setup.log`, `final-rehearsal-upgrades.log`, `final-navigation-e2e.log` and `final-network-change-trace.zip`. Final plan/report edits were regenerated and checked for documentation, agent, provenance, formatting and diff consistency. These are local evidence, not release artifacts or remote CI. Remote checks on the actual eventual release commit and real hosting controls remain separate.

### Compatibility and migration

Recommend **`v3.0.0`** under [foundation compatibility policy](versioning.md#compatibility-meaning). The canonical remote's latest annotated tag was verified read-only as `v2.0.0`, targeting the base SHA above. Removing previously available production `/docs` and its downloadable assets intentionally changes an established distribution behavior and requires deliberate migration. Optional component/catalog improvements alone would be MINOR; ordinary merge conflicts alone do not justify MAJOR. The tag remains the only release-number source; do not bump private package versions or add a VERSION file.

Existing development routes, generator commands, legacy metadata shape, ErrorNotice props, source references, SDK and database contracts remain supported. New metadata fields have additive defaults; named uppercase runtime exports in the curated shared entry point require metadata. Inspect newly discovered feature metadata for valid source/export links and unique IDs; keep product-specific examples and categories. Type-only exports are exempt.

Adopters must rebuild a default product artifact, remove stale internal assets through their deployment procedure, and replace product links that relied on the portal with separately approved product/public documentation. Intentional internal deployments must use the explicit internal build and verify the selected host's access controls. Review customized Vite and shell code when merging; preserve product composition, UI, identity, styling tokens and documentation rather than replacing them with Orion templates.

Schema version 2 projects require no provenance/schema migration. Schema version 1 projects must additionally follow [the existing migration](project-derivation.md#migrate-a-project-from-schema-version-1): preserve any product-adopted reference behavior and immutable released migrations before pruning.

Read-only inspection of the actual IA-MNS and Teluni sources on 2026-10-23 found both at manifest schema 2 with initialization and baseline `53bcc705a9f68f01aa1bbea3a0f4df4a009577ea` (v2.0.0), and the same 15-path derivation contract as Orion. Neither needs the legacy schema migration on that evidence. Their metadata normalizes with the new generator without writes: IA-MNS has seven shared and five feature-specific entries, including existing feature metadata/registered previews; Teluni has the existing ErrorNotice entry. No build, generation, validation gate, Git mutation or deployment was run in either product.

IA-MNS already owns Button, TextField and other controls. Preserve their actual props, examples, styling and behavior rather than replacing them with Orion's reference implementations. Its Vite config, shell, home, component source/metadata, module composition and styles differ from v2.0.0. Teluni customizes Vite, shell, module composition and styles. Merge isolation into those files deliberately; retain product previews, metadata extension fields and documentation. Recheck this inventory and each product's migration registry, release state and complete validation when its upgrade is authorized; these read-only checks do not certify either product's runtime or deployment.

### Proposed release notes

**Orion v3.0.0 — internal documentation isolation and reusable React components**

- Breaking distribution change: default production builds exclude the internal Living Documentation portal and all generated engineering assets. Development documentation remains complete. Rebuild and retire stale published assets; migrate end-user documentation to approved product/public sources.
- Explicit internal builds support protected internal deployments; the host remains responsible for authentication and authorization of every page, asset and download.
- Add native Button/TextField references and evolve the existing ErrorNotice, semantic styling hooks, inspect-before-implementing guidance, category navigation, ownership/reuse metadata, source references and safe examples.
- Preserve legacy component metadata and add feature-owned discovery with proportional export/reference validation. Expand generator, browser and production-artifact regression coverage.
- Include compatible security corrections for Markdown parsing, Vite, Fastify and Vitest, plus patched URI/IP parsing, source-map and test HTTP dependencies. Remove the obsolete Vite release-age exception; retain existing supply-chain checks and explicit dependency pins.
- Retain SHA-based provenance and reviewed merge upgrades. No new dependencies, database/SDK migration or manifest schema change. Node.js 24.13.0 and pnpm 11.25.0 remain the documented toolchain.

The publisher must add the exact released commit SHA and links to [documentation migration](architecture/living-documentation.md#existing-project-migration), [component practices](architecture/web-components.md) and [project upgrades](project-derivation.md#upgrade-to-a-newer-orion-revision). Local validation does not certify a production deployment.

### Publishing steps after authorization

These steps govern publication after owner authorization. The [publication record](#authorized-publication) distinguishes the completed review from the subsequent authorized release run.

1. Commit the reviewed source and regenerated output on a release-preparation branch, open a PR into Orion `main`, and obtain the required review and CI results on its exact head. Review the entire candidate diff, including newly added files. Do not publish from a dirty checkout or disposable rehearsal commit.
2. After the owner merges that PR, use a clean canonical Orion clone. Fetch `main` and tags, check out the intended merge commit, and verify that it contains the reviewed changes and that the required push/PR gates apply to that revision. Record its full SHA and CI links. Recheck that no newer release has superseded this recommendation.
3. With Node.js 24.13.0, pnpm 11.25.0, Chromium and a Testcontainers-compatible runtime, run the following in PowerShell. Stop on any failure, dirty output or existing version; do not move a published tag.

```powershell
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true # PowerShell 7.3+
git fetch origin main --tags
if (git status --porcelain) { throw 'Release checkout must be clean' }
$releaseCommit = '<approved full merged commit SHA>'
git switch --detach $releaseCommit
git merge-base --is-ancestor $releaseCommit origin/main
git show --no-patch --format=fuller $releaseCommit
if (git tag --list v3.0.0) { throw 'Release tag already exists' }
# Confirm this exact SHA is the reviewed release point with passing remote gates.
pnpm install --frozen-lockfile
pnpm validate
if ($LASTEXITCODE -ne 0) { throw 'Release validation failed' }
if (git status --porcelain) { throw 'Validation changed tracked files' }
# Only after owner authorization and verified remote gates:
git tag -a v3.0.0 $releaseCommit -m 'Orion v3.0.0: documentation isolation and component catalog'
git rev-parse 'v3.0.0^{commit}'
git push origin refs/tags/v3.0.0
# Save the notes above, exact SHA and documentation links to a reviewed notes file.
gh release create v3.0.0 --repo GabriellMDias/Orion --verify-tag --title 'Orion v3.0.0' --notes-file 'C:\path\reviewed-notes.md'
```

4. Verify the remote annotated tag resolves to the recorded SHA and the GitHub Release describes that same revision. Record the tag/Release/CI links in Orion's acceptance history and plan. No production deployment is implied.

### Subsequent IA-MNS and Teluni upgrades

Upgrade each project separately, only after explicit authorization, using its own clean checkout and plan. Do not run initialization or blindly apply Orion's project templates to an existing product.

1. In IA-MNS, then independently in Teluni, refresh the read-only inventory above: applicable instructions, manifests/provenance, retained features/previews, product/public documentation sources, customized shell/Vite/UI, release registry and deployment assets. Preserve IA-MNS's existing controls and feature examples; do not add duplicate Button/TextField implementations. Commit or preserve unrelated work first. Configure the verified fetch-only upstream with `pnpm orion:upstream`; fetch and inspect status. Resolve `v3.0.0` to its full SHA in the canonical Orion clone; the project's upstream intentionally does not fetch tags.
2. In the product checkout, run the commands below, replacing the value with that verified SHA. Review the diff from the recorded baseline before merging. If schema version 1 is present, perform the linked migration before pruning; product-adopted behavior and released migrations must be retained. Stop for uncertain migration/release status rather than deleting history.

```powershell
pnpm orion:upstream
git fetch orion-upstream
pnpm orion:status
$orionCommit = '<verified full v3.0.0 commit SHA>'
$baseline = (Get-Content .orion/project.json -Raw | ConvertFrom-Json).foundation.baselineCommit
git log --oneline "$baseline..$orionCommit"
git diff $baseline $orionCommit
git switch -c codex/orion-v3-upgrade
$projectCommit = (git rev-parse HEAD).Trim()
git merge --no-ff --no-commit $orionCommit
# Resolve manifest/contract/package conflicts first; migrate schema 1 if needed.
pnpm orion:prune
# Preserve project-owned README, module composition, branding, plans and actions.
# Check all projectFiles, including automatic merges. For each existing owned path:
# git restore --source=$projectCommit --staged --worktree -- <path>
# For schema 1's new composition seams, port product behavior rather than restoring an absent path.
# Merge shared source/policies; preserve product components, metadata, themes and docs.
pnpm install --frozen-lockfile
pnpm db:generate
pnpm -C apps/api references:write
pnpm -C packages/sdk generate
pnpm docs:references:write
git add -A apps/web/src/generated docs/generated packages/sdk/src/generated
# Resolve/stage remaining source conflicts, then rerun prune until none remain.
pnpm orion:prune
pnpm validate
# Also run the product's existing release, migration, ACL and critical-flow gates.
# Inspect production artifact exclusion and protected-internal hosting if applicable.
git commit -m 'Merge Orion v3.0.0 foundation changes'
# Worktree must be clean; this fetches and verifies the canonical main ancestry.
pnpm orion:record-baseline $orionCommit
git add .orion/project.json
git commit -m 'Record Orion v3.0.0 baseline'
pnpm validate
pnpm orion:check
pnpm orion:status
```

3. Update the project's plan and migration/deployment notes, including stale-asset removal and any `/docs` link migration. Review the full diff and open its upgrade PR only when authorized. Require the project's CI on the exact head; use a merge commit when subsequently authorized to merge. Squash/rebase would discard the required upstream ancestry. Recheck baseline ancestry after merge. Schedule deployment and any protected internal documentation artifact separately under that project's authority.

### Remaining release conditions

The documentation/component review is complete. The subsequent [dependency review](#pre-release-dependency-review) adds outstanding security prerequisites to publication. Owner review/commit/PR submission, remote CI on the actual candidate, merge and release publication remain unperformed under [H-16](human-actions.md#h-16). Real internal hosting verification is conditional [H-15](human-actions.md#h-15). IA-MNS/Teluni changes, upgrade execution and deployments require separate authorization; refresh their inventory and migration/release review at that time. Passing disposable fixtures and read-only metadata checks do not certify either real product.

### Pre-release dependency review

Review date: 2026-10-23. [Renovate PR #23](https://github.com/GabriellMDias/Orion/pull/23), head `c2aed9071f205a3a669570c890135da68dc22d42`, changes only the root manifest and lockfile: `markdown-it` 15.0.2 to 15.0.3, its `argparse` dependency 3.0.2 to 3.0.3, and registry deprecation annotations for three unchanged OpenTelemetry packages. Validate, Orion required gate, Dependency review, CodeQL and GitGuardian checks passed on the PR. These remote results cover the v2.0.0 base, not the uncommitted documentation/component candidate.

Recommendation: include the reviewed security patch before publishing v3.0.0; do not close or dismiss the PR. The current renderer and documentation validator use `html: false`, reducing exposure to [the inline HTML advisory](https://github.com/advisories/GHSA-vfgh-jcmw-g37q), but the same patch also fixes [high-severity reference-definition parsing](https://github.com/advisories/GHSA-gfr2-rv44-r23c) under default options. Repository-authored Markdown processed during generation is not a public request-time Markdown endpoint. The patch also tightens reference-label/title parsing, so generated-reference freshness and link validation remain necessary.

In a disposable clone containing the local documentation/component changes plus the exact PR patch, frozen installation passed, all 21 generator tests passed, generated references remained current, and documentation validation passed (90 Markdown files, 1517 local links, 18 ADR records). The original checkout's dependency installation and running manual-test services were preserved. This evidence does not validate the still-pending Vite correction or replace checks on the eventual merged candidate.

The combined `pnpm validate` run passed static checks, types, architecture, release/provenance rules, 26 derivation tests, generated checks and documentation isolation, then stopped on one API transport test exceeding its unchanged 5000 ms timeout (53/54 passed). Repeating `pnpm test` without source or timeout changes passed all 54 API, 63 web unit and 6 browser component tests; subsequent `pnpm build`, `pnpm smoke` and `pnpm test:e2e` passed, including all 31 E2E journeys. Thus the gate's stages passed across the initial run and continuation, rather than one uninterrupted successful `pnpm validate`. Logs are retained locally under `node_modules/.cache/orion-documentation-validation/renovate-review.log` and the disposable review directory. The initial timeout remains evidence for final-candidate validation; no assertion is made that its cause was established.

The live Dependabot inventory additionally reports Vite 8.3.1 affected by [Windows path validation](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [Windows percent escaping](https://github.com/advisories/GHSA-698v-4r3x-3vcv) and [editor flag interpretation](https://github.com/advisories/GHSA-r825-w8mm-5pxw). These concern the development editor integration, not emitted static product assets. Update to Vite 8.3.4 (the patched 8.3 line begins at 8.3.3), review its lockfile and rerun the full gate before release. The ten open alert records represent five advisories reported against both manifests and lockfile, not ten distinct defects. Passing PR checks do not clear unrelated, pre-existing alerts.

Keep [Dependency Dashboard #2](https://github.com/GabriellMDias/Orion/issues/2) open as the Renovate control panel. Do not select the bulk approval/retry boxes. Review routine updates in their existing schedule; handle TypeScript 7, pnpm 12, Ubuntu 26 and the OpenTelemetry major/replacement as separate compatibility work. The `sdk-trace-base` deprecation needs a coordinated telemetry migration and validation, rather than an isolated package rename. No automerge or policy change is needed.

Publication order: after owner authorization, merge PR #23 through its required checks; prepare the focused Vite security correction; reconcile both with the documentation/component candidate and regenerate references; require frozen installation, full local validation, security-alert reinspection and remote checks on the exact final candidate before following the publishing steps above. These compatible patches do not change the v3.0.0 recommendation driven by documentation distribution. No PR merge, dashboard edit, alert dismissal, push, tag, release or derived-project change is performed by this review.

### Authorized publication

The owner subsequently authorized the complete GitHub CLI release process on 2026-10-23. Actual derived-project upgrades and deployments remain outside that authorization. Renovate [PR #23](https://github.com/GabriellMDias/Orion/pull/23) was merged as `7dce4c8cfe4b69341007c1350e8a7ef6e852893e`, [PR #24](https://github.com/GabriellMDias/Orion/pull/24) as `05d56ab093f7b2be3cff23ec4cd8f4547627bbf4`, and [PR #25](https://github.com/GabriellMDias/Orion/pull/25) as `60213f2d611a1f691a704b99a66d4697f29631b1`, each after all required PR checks passed. The Dependency Dashboard remains open with bulk/major approvals unchanged.

The refreshed GitHub advisory inventory expanded after the first merge. The combined candidate pins markdown-it 15.0.3, Fastify 5.12.6, Vite 8.3.4 and the Vitest cohort 5.0.5. Existing dependency ranges resolve undici 8.12.3, ip-address 10.7.4, fast-uri 3.1.9/4.2.3 and source-map-js 1.2.2. No new override or dependency family is needed. The obsolete `vite@8.3.1` release-age exception is removed. Frozen installation and `pnpm audit --json` passed with zero reported vulnerabilities; npm and GitHub advisory inventories are checked separately because their timing/coverage differ. Earlier inventory counts above are dated review evidence, not the final candidate's outstanding-alert count.

Combined local validation, release PR, immutable annotated tag and GitHub Release remain in progress. The final release must identify the reviewed merged SHA and link its actual CI evidence. No database migration, API contract, SDK contract, provenance schema or derived repository changes are introduced by these compatible security patches.
