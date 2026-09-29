# Human Actions for Implementation

[Implementation plan](implementation-plan.md) · [Documentation index](README.md) · [Secrets policy](security/secrets-management.md)

## Purpose and current state

This checklist records implementation prerequisites of the Orion foundation repository that require a project-owner decision, human-controlled account action, unavailable privilege, or securely supplied external configuration. Every contributor or coding agent performing implementation work must maintain it and must never silently skip work because human intervention is needed.

The actions below were requested and verified for `GabriellMDias/Orion`. In a project derived from Orion, this checklist is inherited foundation history: completed items such as H-01 to H-03 do not establish Renovate, branch protection, or security settings for the project's repository. The project's own checklist is `docs/project/human-actions.md`, created by [project derivation](project-derivation.md) with pending equivalents.

Phases 1-11 and the original development foundation are complete. The Approval Request owner decisions are recorded in H-04 and H-05; the API, database, generated SDK, web workflow, [configuration schema](../apps/api/src/config.ts), [local setup](setup.md), and [Living Documentation Portal](architecture/living-documentation.md) are implemented. The owner completed the current portal's manual browser acceptance in [H-12](#h-12); automated validation is recorded separately. Phase 12 remains unstarted. A selected identity provider or production environment is not required for the foundation. Conditional items become necessary only when their stated trigger applies; the [generated configuration reference](generated/configuration/api.md) records current API variable names.

## Maintaining this checklist

1. Inspect existing decisions, access, tools, configuration, and prior authorization before requesting human intervention. Complete authorized automation and all useful preparation first. Do not ask a human to repeat work an agent or contributor can already perform safely within scope.
2. Keep one stable ID per coherent action. As providers, environments, or owners become concrete, split broad anticipated items into independently verifiable actions and update the plan's links. Add newly discovered actions immediately; this initial list is not exhaustive.
3. Every action must retain its stable ID, checkbox, owner, status, applicability, dependency, and evidence. Active or conditional requests also need the exact action, reason, non-secret configuration names, and verification method. Completed actions may summarize the fulfilled request and link its canonical result. Use `pending`, `in progress`, `completed`, `blocked`, or `changed` consistently with the [plan](implementation-plan.md#maintaining-this-plan).
4. Before asking the user, provide a concrete request: the exact setting or decision, prepared configuration or options where appropriate, why automation cannot finish it, affected task IDs, and how completion will be checked. Do not ask for approval again when existing authorization covers the action.
5. If an action blocks work now, mark the dependent plan task `blocked`, link this entry, and explicitly surface the request to the user. Record the blocker here. Continue independent authorized work; do not mark the whole phase complete while required work remains blocked.
6. Use `[x]` and `completed` only after verification. Record safe evidence and, when completed, the verification date. For owner decisions, the recorded decision is evidence; for technical actions, test the intended access or behavior. If direct verification is unavailable, record the limitation and the remaining verification task rather than claiming success.
7. Reopen an action with `[ ]` if later evidence invalidates completion, access expires, or configuration changes. Record why and update affected plan tasks.
8. A conditional item that is unnecessary remains `[ ]` with status `changed`, an explicit not-applicable/deferred reason, and its future trigger or replacement. It is not a completed action. Update plan applicability too; do not silently remove it or let inapplicable work block foundation completion.

## Safe configuration handoff

- Record configuration names, required scopes, environment, purpose, non-secret resource identifiers, and secure destination. Never record passwords, tokens, API keys, connection strings containing credentials, private keys, or complete environment dumps here, in the plan, in chat, or in tracked example files.
- When a schema exists, replace each relevant `not defined yet` entry with the exact implemented configuration keys or `.env` names and a link to the schema/reference. Do this before requesting a value; do not invent variable names in advance.
- Humans should place secrets directly into the selected protected secret store or an explicitly documented ignored local file, where appropriate. Agents and contributors should verify presence and authorized behavior without printing secret contents. Public client identifiers must be distinguished from server-only credentials.
- Use synthetic local/test data and ephemeral credentials where possible. Production secrets must not be prerequisites for ordinary development or CI.
- Prefer delegated, short-lived identity over raw long-lived credentials where supported. Existing [production-access policy](security/production-access.md) continues to govern privileged actions; a checkbox is not blanket authorization.

External settings below were verified on the stated dates. They are evidence of completed prerequisites, not a live assertion about GitHub settings today. Reinspect them before relying on remote enforcement for a new release or changing their configuration.

## H-01

- [x] **Enable Renovate for Orion.**

**Status:** completed. **Owner:** repository administrator. **Dependency:** Phase 2, P2.5.

**Result and evidence (2026-09-24):** The owner authorized the Renovate GitHub App for `GabriellMDias/Orion`; its [bot-authored Dependency Dashboard](https://github.com/GabriellMDias/Orion/issues/2) detected the committed dependencies and expected update schedule. [Configuration](../renovate.json) passed strict validation. This establishes processing of the repository, not a guarantee about future update PRs.

**Reverification:** Inspect the app's effective repository access, dashboard/run and update PR behavior against the configuration. No application environment variable or personal token is required.

## H-02

- [x] **Require pull requests and Orion's CI gate on the default branch.**

**Status:** completed. **Owner:** repository administrator. **Dependency:** Phase 2, P2.3/P2.6.

**Result and evidence (2026-09-24):** GitHub's effective `Protect main` ruleset (ID `23941496`) applied to the default branch, required pull requests and `Orion required gate`, blocked deletion/force pushes, and had no bypass actors. The check passed in [run #3](https://github.com/GabriellMDias/Orion/actions/runs/36004323007). Effective ruleset inspection supplied the enforcement evidence; no failing test PR was created.

**Reverification:** Read effective rules and the exact required check from [CI](../.github/workflows/ci.yml); confirm branch applicability and bypass actors. Never weaken protection to test it. A workflow file alone does not enforce merges; no application environment variable is involved.

## H-03

- [x] **Enable and verify applicable GitHub security controls.**

**Status:** completed. **Owner:** repository administrator. **Dependency:** Phase 2, P2.6.

**Result and evidence (2026-09-24):** The public repository had CodeQL default setup configured, secret scanning/push protection enabled, dependency graph/vulnerability alerts available, and `DEPENDENCY_REVIEW_ENABLED=true`. [PR #3 run #6](https://github.com/GabriellMDias/Orion/actions/runs/36009789640) executed Dependency Review with the high/critical threshold and passed the aggregate gate.

**Reverification:** Inspect current effective security settings, the Actions variable, and a PR run showing the enabled review path. Record feature-specific entitlement limits. Keep Renovate as version-update owner; do not enable competing Dependabot version updates. No production secret is required.

## H-04

- [x] **Define the reference feature and business acceptance criteria.**

**Status:** completed. **Owner:** project owner. **Dependency:** Phase 3, P3.1–P3.3; feature work in Phases 5–7.

**Result and evidence (2026-09-24):** The owner selected Approval Request. The [business specification](domains/approval-request.md) owns actors, states, operations, invariants, concurrent/repeated-operation behavior, internal data classification, and acceptance scenarios. No external integration, automatic deletion, legal retention duration, or authoritative business-audit persistence is required by this reference feature. Identity is resolved in H-05. No configuration or credentials are needed.

**Reverification:** Trace changed behavior to the canonical specification and acceptance tests; ask only about genuinely missing product meaning. Illustrative examples in general policy are not requirements.

## H-05

- [x] **Resolve reference-feature identity, authorization, and tenancy.**

**Status:** completed. **Owner:** project owner. **Dependency:** Phase 3, P3.3; protected behavior in P5.4/P6.6.

**Result and evidence (2026-09-24):** The [identity/access matrix](domains/approval-request.md#identity-and-authorization-boundary) requires authenticated human actors, creator ownership, scoped owner/reviewer operations, mandatory self-review denial, no tenancy, and no admin override. The owner selected a provider-independent bearer access-token boundary; [ADR-0012](adr/0012-verify-jwt-access-tokens-at-the-first-api-boundary.md) specifies JWT verification. Provider login/session/refresh/revocation choices remain conditional H-07.

**Reverification:** Trace allow/deny tests to the matrix and token boundary. Current variable names belong to the [generated configuration reference](generated/configuration/api.md); they are implemented even though real provider values are not selected.

## H-06

- [ ] **Supply host administration only when required tooling cannot be made available autonomously.**

**Status:** changed (conditional; no current host blocker). **Owner:** developer or host administrator. **Dependency:** required local/container/browser checks in Phases 1, 5, 6 and ongoing validation.

**Trigger and request:** First inspect the host. Request only the exact missing capability when administrator privileges, virtualization, reboot, licensing acceptance, or managed policy prevents authorized automation. Follow [setup](setup.md); Testcontainers use does not select the deployment platform.

**Configuration / verification:** State the missing runtime/version, host error, and any runtime endpoint without exposing secrets. Verify executable versions, daemon access, disposable database migration/cleanup, and browser launch with the actual repository checks; an installed executable alone is insufficient.

**Evidence:** For this review Node.js 24.13.0, pnpm 11.25.0, frozen installation, and reachable Docker 28.4.0 were verified on 2026-09-26. On 2026-09-27, `pnpm validate` passed, including disposable PostgreSQL, real browser tests, builds, process-recovery smoke checks, and all five end-to-end journeys. [D3](implementation-plan.md#maintaining-this-plan) records completed review verification; no runtime setup action remains.

## H-07

- [ ] **Provision an external service only after it is selected and required.**

**Status:** changed (conditional; no concrete provider selected). **Owner:** service account owner/administrator where delegated authority is insufficient. **Dependency:** actual integration work, including P5.4/P6.6 or Phase 12.

**Trigger and request:** Prepare the integration, exact configuration contract, minimum scopes, safe destination, and verification path first. Split by provider/environment before requesting account creation, consent, billing, origins/callbacks, or scoped credentials. Local development, tests, telemetry verification, CI, and the portal need no external account.

**Configuration:** Current server-only keys are `ORION_TOKEN_ISSUER`, `ORION_TOKEN_AUDIENCE`, and `ORION_TOKEN_JWKS_URL`; see [configuration](generated/configuration/api.md). A trusted issuer must map stable `orion_principal_id`, `orion_actor_type=human`, and optional `approval:review` scope. No real issuer values, client ID, redirects, extra scopes, secure destination, or rotation owner are selected. Do not invent or commit them.

**Verification:** Validate without printing values; test bounded connectivity, token/claim mapping, intended redirects and allow/deny/revocation behavior where applicable. Record inaccessible provider settings and remaining technical verification separately.

**Current evidence:** The API verifies JWTs; the browser holds an issued token in memory. [Manual setup](setup.md#manually-exercise-approval-requests) and automated journeys use a loopback synthetic issuer and disposable database. No provider login/session/refresh workflow is claimed.

## H-08

- [ ] **Identify durable release boundaries and supported consumers when they exist.**

**Status:** changed (conditional; no durable release or independently released consumer is recorded). **Owner:** release owner/environment operator only for facts unavailable to authorized inspection. **Dependency:** P8.1/P8.3/P8.4; before refining uncertain migration history or introducing a persistent environment.

**Trigger and request:** Inspect release/deployment evidence first. Identify non-secret environment names, deployed revisions, applied migrations, supported API/client versions, and rollback/support windows. Unknown migration release status remains immutable. An empty [release registry](../apps/api/prisma/release-history.json) does not prove no private durable environment exists.

**Verification:** Correlate supplied facts with available release metadata and database migration state; record immutable baselines using [release evolution](database/release-evolution.md). Run upgrade/compatibility checks for actual supported combinations. No credentials or new environment keys are inherently required; use scoped read-only access if needed.

**Current evidence:** Repository workflows validate but do not deploy; the registry is empty and automated databases are disposable. Historical upgrade/API-baseline checks remain conditional, not falsely completed.

## H-09

- [ ] **Define deployment and operational requirements before activating Phase 12.**

**Status:** changed (conditional; Phase 12 unstarted). **Owner:** project owner and actual operational owners. **Dependency:** P12.1–P12.5; not foundation maintenance.

**Trigger and request:** For an authorized real deployment, specify hosting/environment constraints, release/distribution model, consumers/workload, service and recovery objectives, retention/disposal obligations, budget, operators, alert recipients, incident ownership, and access expectations. Orion selects none of these by default.

**Configuration / verification:** Record non-secret environment/domain/region and provider identifiers once selected, actual objectives/owners, release permissions, and retention policies. Use schema-defined configuration names. Link requirements/ADRs to deployment, alert, backup, recovery and access work; do not invent thresholds, durations, owners, or guarantees.

**Current evidence:** No deployment target or operational objectives are selected. The reference feature's absence of automatic deletion or a legal retention duration does not supply a production retention policy.

## H-10

- [ ] **Enable selected resources and operational access beyond available authority.**

**Status:** changed (conditional on H-09 and selected resources). **Owner:** account/environment administrator and operational owners. **Dependency:** P12.2–P12.7.

**Trigger and request:** After the design is concrete, prepare deployable definitions and least-privilege requirements. Split any unavailable external administration by resource/environment: accounts, DNS, secret stores, workload identities, protected environments, backup access, telemetry destinations, or notifications. Do not request hypothetical resources.

**Configuration / verification:** Supply exact non-secret IDs/endpoints/configuration names, identity scopes/trust, runtime versus migration access, backup destination, alert contacts, and access expiry. Store secrets only in the selected protected destination. Verify effective permissions, DNS/TLS where applicable, identity exchange, bounded access, staging deployment, telemetry and notifications; exercise restore/rotation/recovery under actual authorization. Granted access alone does not prove recovery passed.

**Current evidence:** Conditional; no resources selected or provisioning begun.

## H-11

- [ ] **Determine licensing before distribution requires the decision.**

**Status:** changed (conditional on distribution). **Owner:** project owner, with legal input when needed. **Dependency:** P12.8, or earlier distribution/publication requiring a license.

**Trigger and request:** Choose the repository/product license, copyright holder, distribution model, and resulting dependency-license restrictions. Agents must not choose legal/distribution policy by assumption. No environment variables or credentials are needed.

**Verification:** Match the owner's decision to license and publication metadata. Add license checks only for a concrete policy; there is no global dependency-license allowlist/denylist by default.

**Current evidence:** No license selected; this review requests no distribution. Ordinary internal foundation work is unaffected.

## H-12

- [x] **Verify the improved Living Documentation portal in a browser.**

**Status:** completed. **Owner:** project owner. **Dependency:** [L4](implementation-plan.md#maintaining-this-plan), current portal browser acceptance only.

**Result:** On 2026-09-29 the owner explicitly reported H-12 manual browser acceptance complete. The [manual browser checklist](validation.md#living-documentation-manual-browser-checks) records the scope. This is owner-observed acceptance, not an automated browser-test result or a claim that the agent independently reproduced every observation.

**Configuration:** No external account or production credentials. Use the standalone local portal for reading and the disposable `pnpm dev:approval` workflow for API execution. Its synthetic identities and database exist only for local verification; keep tokens out of evidence.

**Reverification:** Repeat the checklist after material portal changes; record the tested revision, browser/version, viewport, development and production-preview results, and any failing route or control. The current owner attestation did not include that granular log, so automated validation and future regression evidence remain separate.

**Evidence (2026-09-29):** Direct owner instruction to record completed H-12 acceptance. Existing automated browser suites remain enabled as the normal repository gate. The acceptance does not activate Phase 12 or choose a provider/deployment.

## H-13

- [ ] **Open the agent-portability and project-derivation pull request.**

**Status:** blocked. **Owner:** repository owner. **Dependency:** [PD5](implementation-plan.md#maintaining-this-plan).

**Request and reason:** The branch `feature/agent-portability-and-project-derivation` was pushed to `GabriellMDias/Orion` over the existing SSH access. Opening a pull request requires an authenticated GitHub web or API session; this environment has no GitHub CLI or token, and the agent's browser is not signed in and must not handle credentials. Open a pull request from that branch into `main` titled "Make Orion agent-neutral and add project derivation workflow", describing ADR-0013/ADR-0014 and the [acceptance evidence](foundation-acceptance.md#agent-portability-and-project-derivation). Do not merge before review and a passing required gate.

**Configuration:** none.

**Verification:** The pull request exists against `main`, and its `Orion required gate` run passes; record the run link under PD5.

**Evidence / blocker (2026-09-29):** Branch push succeeded; pull-request creation was unavailable to the agent for the reason above.

## New action template

Allocate a new stable H-number; do not reuse existing IDs. Link it from the blocked or conditional plan task.

```markdown
## H-NN

- [ ] **Concrete human action.**

**Status:** pending. **Owner:** actual person or responsible role.
**Dependency / trigger:** Linked task; whether it blocks current work.
**Request and reason:** Exact need, completed preparation, and why authorized automation cannot finish it.
**Configuration:** Exact non-secret names, minimum scopes and secure destination; never secret values. Use "none" if no configuration is needed.
**Verification:** Observable checks required before completion.
**Evidence / blocker:** Dated safe evidence, outstanding limit, or changed applicability.
```
