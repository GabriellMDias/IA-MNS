# Human Actions for Implementation

[Implementation plan](implementation-plan.md) · [Documentation index](README.md) · [Secrets policy](security/secrets-management.md)

## Purpose and current state

This checklist records implementation prerequisites that require a project-owner decision, human-controlled account action, unavailable privilege, or securely supplied external configuration. Codex must maintain it throughout implementation and must never silently skip work because human intervention is needed.

Phases 1-11 and the development foundation are complete. The Approval Request owner decisions are recorded in H-04 and H-05; the API, database, generated SDK, web workflow, [configuration schema](../apps/api/src/config.ts), [local setup](setup.md), and [Living Documentation Portal](architecture/living-documentation.md) are implemented. Phase 11 required no new human action. A selected identity provider or production environment is not required for the foundation. Conditional items become necessary only when their stated trigger applies; the [generated configuration reference](generated/configuration/api.md) records current API variable names.

## How Codex maintains this checklist

1. Inspect existing decisions, access, tools, configuration, and prior authorization before requesting human intervention. Complete authorized automation and all useful preparation first. Do not ask a human to repeat work Codex can already perform safely within scope.
2. Keep one stable ID per coherent action. As providers, environments, or owners become concrete, split broad anticipated items into independently verifiable actions and update the plan's links. Add newly discovered actions immediately; this initial list is not exhaustive.
3. Every action must retain its checkbox, required action, reason, dependent phase/tasks, required non-secret values/configuration names, and verification method. Record an owner, status, applicability, and evidence as well. Use `pending`, `in progress`, `completed`, `blocked`, or `changed` consistently with the [plan](implementation-plan.md#maintaining-this-plan).
4. Before asking the user, provide a concrete request: the exact setting or decision, prepared configuration or options where appropriate, why automation cannot finish it, affected task IDs, and how completion will be checked. Do not ask for approval again when existing authorization covers the action.
5. If an action blocks work now, mark the dependent plan task `blocked`, link this entry, and explicitly surface the request to the user. Record the blocker here. Continue independent authorized work; do not mark the whole phase complete while required work remains blocked.
6. Use `[x]` and `completed` only after verification. Record safe evidence and, when completed, the verification date. For owner decisions, the recorded decision is evidence; for technical actions, test the intended access or behavior. If direct verification is unavailable, record the limitation and the remaining verification task rather than claiming success.
7. Reopen an action with `[ ]` if later evidence invalidates completion, access expires, or configuration changes. Record why and update affected plan tasks.
8. A conditional item that is unnecessary remains `[ ]` with status `changed`, an explicit not-applicable/deferred reason, and its future trigger or replacement. It is not a completed action. Update plan applicability too; do not silently remove it or let inapplicable work block foundation completion.

## Safe configuration handoff

- Record configuration names, required scopes, environment, purpose, non-secret resource identifiers, and secure destination. Never record passwords, tokens, API keys, connection strings containing credentials, private keys, or complete environment dumps here, in the plan, in chat, or in tracked example files.
- When a schema exists, replace each relevant `not defined yet` entry with the exact implemented configuration keys or `.env` names and a link to the schema/reference. Do this before requesting a value; do not invent variable names in advance.
- Humans should place secrets directly into the selected protected secret store or an explicitly documented ignored local file, where appropriate. Codex should verify presence and authorized behavior without printing secret contents. Public client identifiers must be distinguished from server-only credentials.
- Use synthetic local/test data and ephemeral credentials where possible. Production secrets must not be prerequisites for ordinary development or CI.
- Prefer delegated, short-lived identity over raw long-lived credentials where supported. Existing [production-access policy](security/production-access.md) continues to govern privileged actions; a checkbox is not blanket authorization.

## H-01

- [x] **Enable the Renovate GitHub App for Orion.**

**Status:** completed. **Owner:** repository owner or an administrator who can authorize GitHub Apps.

**What needs to be done:** Install or authorize the Renovate GitHub App for `GabriellMDias/Orion` with repository access, if it is not already installed. Confirm its onboarding and Dependency Dashboard after `renovate.json` reaches the default branch. Existing repository access is sufficient for Codex to prepare CI and inspect settings; no new personal token is requested.

**Why:** Phase 2 needs actual workflow execution and external Renovate enablement; configuration files alone do not activate an app or confer access.

**When / dependency:** [Phase 2](implementation-plan.md#phase-2), P2.5. The app needs the committed configuration on the default branch. If it is already installed, verify behavior instead of installing it again.

**Values / configuration:** Repository `GabriellMDias/Orion`, default branch `main`, repository file `renovate.json`, Renovate GitHub App installation with access to this repository. No application `.env` variable or personal token is required.

**Codex verification:** Validate `renovate.json`, inspect the app installation or its first run, and confirm the expected onboarding/Dependency Dashboard issue and update PR behavior on the repository. Record safe URLs or IDs and any remaining external limitation.

**Evidence / verification (2026-09-24):** The owner reported authorizing the Renovate GitHub App for `GabriellMDias/Orion`. The committed `renovate.json` passed Renovate's strict configuration validator, and GitHub confirms it is present on default branch `main`. Open [Dependency Dashboard issue #2](https://github.com/GabriellMDias/Orion/issues/2) was created by `renovate[bot]` and lists dependencies detected from the committed workflow, `.node-version`, and package manifest. It shows major updates pending Dashboard approval and routine updates awaiting schedule, consistent with the repository configuration. No Renovate update PR was found at verification; inspect its contents and lockfile change when one is created. The bot-authored Dashboard and repository-specific dependency inventory verify that the integration processed this repository without requiring a readable app-installation API response.

## H-02

- [x] **Protect Orion's default branch and require its CI gate.**

**Status:** completed. **Owner:** repository owner/account administrator.

**What needs to be done:** Configure and verify an active ruleset for the default branch that requires pull requests and the `Orion required gate`, blocks branch deletion and force pushes, and has no bypass actors. Orion is now public, making repository rulesets available.

**Why:** Required validation must be enforced outside the workflow; a successful workflow definition does not prevent merging unvalidated changes.

**When / dependency:** [Phase 2](implementation-plan.md#phase-2), P2.3 and P2.6, after the aggregate check exists.

**Values / configuration:** Repository `GabriellMDias/Orion` (public); default branch `main`; ruleset `Protect main` (ID `23941496`); exact required check `Orion required gate` from `.github/workflows/ci.yml`; no bypass actors; no application `.env` variables.

**Codex verification:** Read the effective protection/ruleset settings and confirm the correct check is required on the correct branch. Use a safe test PR or platform evidence to verify a failing required check prevents normal merge; do not weaken protection to test it.

**Evidence / verification (2026-09-24):** GitHub repository metadata reports `visibility=public` and `default_branch=main`. The authenticated GitHub REST API returned active repository ruleset `Protect main` (ID `23941496`, source `GabriellMDias/Orion`) with condition `ref_name.include=["~DEFAULT_BRANCH"]`; its rules include `pull_request`, `deletion`, `non_fast_forward`, and `required_status_checks`. The required check context is `Orion required gate` from GitHub Actions, and `bypass_actors` is empty. The check is registered and passed on the current `main` commit (`3543ca4393411e914428b5224c265dff5aa50dcf`; [run #3](https://github.com/GabriellMDias/Orion/actions/runs/36004323007)). The active effective rule configuration is platform evidence that normal merges require the PR and status check; no failing test PR was created.

## H-03

- [x] **Verify Orion's enabled GitHub security features in the repository and CI.**

**Status:** completed. **Owner:** repository owner/account administrator; Codex verified effective settings and CI behavior.

**What needs to be done:** Enable applicable code and dependency security features for the public repository and verify that `DEPENDENCY_REVIEW_ENABLED=true` causes the dependency-review job to execute in PR CI. This action and verification are complete.

**Why:** Accepted supply-chain controls include platform settings that may require administrative privileges or depend on repository visibility and entitlement.

**When / dependency:** [Phase 2](implementation-plan.md#phase-2), P2.6. Code analysis becomes meaningful when supported code exists. Unavailable paid features are not mandatory architectural dependencies.

**Values / configuration:** Public repository `GabriellMDias/Orion`; Actions variable `DEPENDENCY_REVIEW_ENABLED=true`; CodeQL default setup, secret scanning, and push protection. Dependency review's accepted initial threshold is newly introduced high/critical vulnerabilities. No production secrets or application `.env` values. Do not enable competing Dependabot version updates for ecosystems managed by Renovate.

**Codex verification:** Read the repository security configuration and CodeQL default-setup API, confirm secret scanning and push-protection status and the exact Actions variable value, then inspect a PR workflow run showing Dependency Review completed successfully. For unavailable features, record feature-specific evidence and qualified applicability rather than reporting the feature enabled. Split entries if some settings remain outstanding; do not check the whole item while an applicable requirement is unresolved.

**Evidence / verification (2026-09-24):** GitHub repository metadata confirms `visibility=public` and `default_branch=main`. `GET /code-scanning/default-setup` returned HTTP 200 with `state=configured`, languages `actions,javascript,javascript-typescript,typescript`, and weekly schedule. Repository security settings report `secret_scanning=enabled` and `secret_scanning_push_protection=enabled`; `GET /secret-scanning/alerts` returned HTTP 200. `GET /actions/variables/DEPENDENCY_REVIEW_ENABLED` returned the exact value `true`. Dependency graph, Dependabot alerts, and vulnerability alerts endpoints returned HTTP 200. On [PR #3 CI run #6](https://github.com/GabriellMDias/Orion/actions/runs/36009789640), Dependency Review executed with `fail-on-severity: high`, completed successfully, and reported no newly introduced high-or-higher vulnerable packages; validation and `Orion required gate` also succeeded. This verifies the enabled workflow path and the configured severity threshold.

## H-04

- [x] **Define the reference feature and its business acceptance criteria.**

**Status:** completed. **Owner:** project owner.

**What needs to be done:** Choose the reference capability and supply its business meaning: actors, supported operations, invariants, state transitions, failures, side effects, data ownership, classification, lifecycle/retention needs, and acceptance scenarios. Codex should present bounded options or identify the specific missing decisions rather than ask the owner to design the entire implementation.

**Why:** Existing orders/payments examples are illustrative. Codex cannot invent product requirements or authoritative data-lifecycle obligations from architecture examples.

**When / dependency:** [Phase 3](implementation-plan.md#phase-3), P3.1-P3.3; dependent feature work in Phases 5-7. Independent tooling and CI work can proceed first.

**Values / configuration:** A feature name and recorded business specification; audit requirements, supported consumer/browser requirements beyond the initial baseline, integrations, and product/legal retention inputs only where relevant. No `.env` variables or credentials are needed for this decision.

**Codex verification:** Link the owner's recorded decision to the feature specification and acceptance scenarios. Check that every implemented business rule traces to the specification and explicitly list any remaining ambiguity. Do not require an additional ceremonial sign-off when the existing user instruction already supplies the decision.

**Evidence / verification (2026-09-24):** The project owner selected **Approval Request** and supplied its purpose, logical actors, five states, operations, transition constraints, rejection-reason requirement, concurrency and repeat-operation guarantees, internal data classification, persistence direction, and lack of default external integrations, legal retention duration, automatic deletion, or authoritative business-audit requirement. The canonical [feature specification](domains/approval-request.md) records these as use cases, invariants, valid/invalid transitions, expected failures, lifecycle and side-effect boundaries, and acceptance scenarios including stale/concurrent writes. [P3.1 and P3.2](implementation-plan.md#phase-3) are complete; the H-04 portion of P3.3 is recorded. Identity and access decisions were separately resolved in [H-05](#h-05). No credentials or `.env` values are needed for H-04.

## H-05

- [x] **Resolve required identity, access, and tenancy decisions for the reference feature.**

**Status:** completed. **Owner:** project owner, with identity/security administration if relevant.

**What needs to be done:** Define public versus protected operations, human/machine actors, ownership or tenancy boundaries, required permissions, and session/revocation expectations. Select an authentication boundary; select a concrete provider only if needed for later integration. Codex prepares suitable scoped choices; do not assume RBAC, ABAC, multi-tenancy, or a particular provider.

**Why:** Security policies define constraints but intentionally leave these product choices open. Protected functionality cannot be implemented safely by guessing them.

**When / dependency:** [Phase 3](implementation-plan.md#phase-3), P3.3; before P5.4 or P6.6 exposes protected behavior. If the selected feature is explicitly anonymous, record that decision and change inapplicable tasks rather than fabricate identities.

**Values / configuration:** The [feature specification](domains/approval-request.md#identity-and-authorization-boundary) records actor/capability and ownership rules, absence of tenancy, and the provider-agnostic OIDC/OAuth 2.0 bearer access-token boundary. Token expiration and validation belong to that boundary. A concrete provider, provider-specific session/refresh/revocation behavior, issuer, audience, client identifiers, redirect origins, and `.env` key names are not selected. If needed later, record exact non-secret names and track provisioning or secrets under [H-07](#h-07).

**Codex verification:** Link the recorded decision and any required ADR; trace protected operations to enforceable policies and allow/deny tests. Verify the implementation respects anonymous behavior and denied resource/tenant access where applicable.

**Evidence / verification (2026-09-24):** The project owner specified authenticated human access for every operation, no anonymous or machine actors, creator ownership, owner-scoped read/edit/submit/cancel, review capability for relevant reads and decisions, a mandatory self-review denial even when a user has both capabilities, no tenancy, and no admin override. The [canonical feature specification](domains/approval-request.md#identity-and-authorization-boundary) records the authorization matrix and [allow/deny scenarios](domains/approval-request.md#acceptance-scenarios), including invalid-state denials. The owner selected a provider-agnostic OIDC/OAuth 2.0 bearer access-token boundary and explicitly deferred a concrete provider and provider-specific session/refresh/revocation details. Synthetic-identity testing needs no external accounts; [H-07](#h-07) remains conditional for future provider provisioning. This resolves H-05's product and boundary decisions without treating a provider as selected.

## H-06

- [ ] **Perform host-level setup only if required tooling cannot be made available autonomously.**

**Status:** changed (conditional; current tooling is available). **Owner:** developer or host administrator, if needed.

**What needs to be done:** Enable or install required host capabilities when administrator privileges, virtualization settings, a reboot, licensing acceptance, or organization-managed policy prevents Codex from doing so. Inspect availability first. For PostgreSQL integration tests this may concern a Testcontainers-compatible container runtime; browser testing may require supported browser/system dependencies.

**Why:** Real infrastructure and real-browser tests need host capabilities that repository package scripts may not be able to supply.

**When / dependency:** [Phase 1](implementation-plan.md#phase-1) only if basic toolchain setup is blocked; [Phase 5](implementation-plan.md#phase-5), P5.2/P5.9, for container-based tests; Phase 6 for browser execution. This is not a decision to deploy applications in containers.

**Values / configuration:** Exact missing runtime/capability, required compatible version, host policy/error, and documented runtime endpoint configuration if applicable. No application `.env` variables are defined for this action. Codex supplies the concrete missing prerequisite after inspection.

**Codex verification:** Verify versions and runtime accessibility, then execute the relevant repository test command once implemented. Confirm ephemeral database creation, migration application, isolation/cleanup, or browser launch as appropriate. An installed executable alone is insufficient.

**Evidence / blocker (2026-09-24):** Node.js 24.13.0 and pnpm 11.25.0 are available. Codex started the existing Docker Desktop Linux engine without host administration; `docker info` reported Docker 28.4.0 and `docker run --rm postgres:16 postgres --version` succeeded (PostgreSQL 16.10). A fresh `postgres:16` container accepted connections, and `prisma migrate deploy` applied the committed Phase 5 migration. `pnpm --filter @orion/api test` passed the Testcontainers/migrated-PostgreSQL Fastify suite, including the restricted runtime role. The emitted-process feature smoke also passed using Testcontainers and signed synthetic tokens. For Phase 6, Codex installed Playwright Chromium, directly launched it, ran two Vitest Browser Mode component tests through the installed Windows Edge channel, and passed two Playwright Chromium journeys through a fresh migrated Testcontainers PostgreSQL, emitted API, and web app. [PR #7 CI run #23](https://github.com/GabriellMDias/Orion/actions/runs/36071532760) independently installed Chromium/system libraries and passed the same browser/database validation on Ubuntu. Phase 7's local `pnpm validate` again passed migrated-PostgreSQL tests, the forced API-process restart smoke, browser component tests, and Chromium journeys. No Phase 5-7 host-level human action was required.

**Phase 9 evidence (2026-09-25):** A fresh checkout installed from the frozen lockfile, generated Prisma, installed Playwright Chromium, started the API and web development servers, served health through the web proxy, regenerated API/database/SDK references without a tracked diff, and passed full `pnpm validate` with migrated PostgreSQL and browser journeys. Docker 28.4.0 was reachable. No host-level intervention is required for foundation acceptance. This checkbox remains open only for a future verified host-only need.

**Phase 10 evidence (2026-09-25):** The first local `pnpm validate` reached `references:check` while Docker Desktop was stopped, so Testcontainers could not find a runtime. Codex started the existing Docker Desktop installation, verified engine version 28.4.0 with `docker info`, and reran validation. This is a local availability issue, not a human prerequisite; H-06 remains conditional.

## H-07

- [ ] **Provision a required external service and securely supply its configuration, only when selected.**

**Status:** changed (conditional; no external provider is selected). **Owner:** service account owner or administrator, if the action cannot be delegated within existing authorization.

**What needs to be done:** For an actually required identity provider or other external integration, create/authorize the application or service, configure callback/origin settings, and create scoped credentials when necessary. Split this item by provider and environment before execution. Codex first prepares the integration, exact configuration contract, minimum scopes, and verification path.

**Why:** Account ownership, consent, billing, and credential creation may require human-controlled interfaces. No external provider or API key is required merely because this checklist mentions one.

**When / dependency:** Phases 4-7 only for selected integrations, especially P5.4/P6.6; Phase 12 for a real deployment service. Local observability, normal CI, the documentation portal, and synthetic tests must not be held behind hypothetical service accounts.

**Values / configuration:** The implemented API boundary uses server-only `ORION_TOKEN_ISSUER`, `ORION_TOKEN_AUDIENCE`, and `ORION_TOKEN_JWKS_URL`, documented in the [configuration reference](generated/configuration/api.md). No provider values, client ID, redirects, scopes beyond the approved `approval:review` capability, secret destination, or rotation owner have been selected. Record those concrete details before requesting input. Keep secret values out of this document and tracked files.

**Codex verification:** Validate configuration without printing values; perform a bounded non-destructive connectivity or authentication test and the relevant integration flow. For identity, test intended redirects and claims plus denial/revocation behavior where required. Use provider evidence if Codex cannot inspect account settings and record outstanding technical verification separately.

**Evidence / blocker (2026-09-24):** Phase 5 implements a provider-independent JWT access-token verifier configured by `ORION_TOKEN_ISSUER`, `ORION_TOKEN_AUDIENCE`, and `ORION_TOKEN_JWKS_URL`; a trusted issuer must supply stable `orion_principal_id`, `orion_actor_type=human`, and optional `approval:review` scope. Phase 6's browser reference workflow accepts an already-issued bearer token in memory and uses a local synthetic signed-token issuer for E2E tests; it does not select an identity provider, create login/session/refresh behavior, or require an external account. Phase 7 failure/recovery work adds no external integration. No concrete provider, production issuer/audience/JWKS values, or service-specific provisioning has been selected. H-07 remains conditional and does not block Phase 9 development-foundation acceptance. A future concrete provider or deployment must record its exact provisioning and stable-ID mapping here before requesting human action.

**Local workflow evidence (2026-09-25):** The [manual setup](setup.md#manually-exercise-approval-requests) runs the real JWT-verifying API with a disposable PostgreSQL and loopback synthetic issuer. Owner and reviewer tokens pass through a same-origin, no-store development route into browser memory without credential files or external accounts. Three browser journeys verify the local handoff, owner/reviewer workflow, stale conflict, and absence of URL or browser-storage persistence; an origin-less token request receives `403`. The initial HTTP checks observed anonymous `401`, owner create/submit success, self-review `403`, reviewer approval success, and stale-write `409`. Killing either the API or web process caused a diagnostic, nonzero runner exit, and cleanup of the other service and disposable database; Ctrl+C also cleaned up. The full `pnpm validate` gate passed. No external provider, account, credential, or H-07 human action is required; H-07 stays conditional.

## H-08

- [ ] **Identify durable release boundaries and support obligations when they first exist.**

**Status:** changed (conditional; no durable release or independently released consumer is evidenced). **Owner:** project/release owner or environment operator, only for facts Codex cannot verify independently.

**What needs to be done:** Identify which environments have permanent migration history and which released consumers, contracts, and rollback/support windows must remain compatible. Codex first inspects available release and deployment evidence. If there has been no release, record that fact instead of inventing historical baselines.

**Why:** Safe migration refinement and compatibility checks depend on real release state, not Git age or an assumed production deployment.

**When / dependency:** [Phase 8](implementation-plan.md#phase-8), P8.1/P8.3/P8.4; earlier if a persistent environment is introduced. Unknown migration release status remains immutable until verified.

**Values / configuration:** Non-secret environment identifiers, released revisions/tags, applied migration identifiers, actual supported API/client versions, and required rollback windows. No credentials or new `.env` variables are inherently required; obtain read-only delegated access if inspection needs it.

**Codex verification:** Correlate the owner's information with release/deployment metadata and migration state where accessible; record immutable baseline references. Run applicable migration/contract compatibility checks once implemented. Mark history-dependent work conditional when no released baseline exists.

**Evidence / blocker (2026-09-24):** The public Git repository has no tags (`git ls-remote --tags origin`), GitHub Releases, deployment records, or configured GitHub environments; `.github/workflows/ci.yml` runs validation but no deployment. Current Testcontainers databases are disposable. These observations provide no released migration or independently deployed API baseline. They do not prove that an unlisted persistent environment cannot exist, so the existing migration is not being edited and this action remains conditional before its history is refined or a first durable release is recorded. Phase 8 adds an empty [durable-release registry](../apps/api/prisma/release-history.json), a [recording and verification workflow](database/release-evolution.md), and a validation guard that checks recorded release commits, complete migration sets, SQL hashes, and append-only release entries. No release entry is fabricated. No environment identifiers, applied migration records, supported consumer versions, or rollback windows have been supplied; a real durable release or independently evolving consumer will activate the action.

## H-09

- [ ] **Define deployment and operational requirements before activating Phase 12.**

**Status:** changed (conditional on Phase 12 activation). **Owner:** project owner and actual operational owners.

**What needs to be done:** Specify the intended environment/hosting constraints, distribution/release model, workload, consumers, service objectives, recovery objectives, retention obligations, budget constraints, and responsible operators. Resolve actual alert recipients, incident ownership, and access expectations. Codex presents implementation options only after requirements are understood.

**Why:** Orion deliberately does not select a global hosting platform, CD strategy, telemetry vendor, SLO, RPO/RTO, retention duration, or organizational on-call model.

**When / dependency:** [Phase 12](implementation-plan.md#phase-12), P12.1-P12.5. This action does not block Phases 10-11 or development-foundation completion.

**Values / configuration:** Non-secret environment names, domains/regions when chosen, service/recovery objectives, supported consumers, retention policies, operational owners, release permissions, and selected provider identifiers. Current API variable names are in the [configuration reference](generated/configuration/api.md); additional deployment-specific names are not defined and must come from real schemas and tooling.

**Codex verification:** Link recorded requirements and any required ADRs; map deployment, alert, backup, recovery, and access work to those requirements. Confirm there are no invented thresholds, owners, or service guarantees before planning operational acceptance tests.

**Evidence / blocker:** Conditional; no deployment target or operational service objectives have been selected. The Phase 7 lifecycle review confirms [H-04](#h-04) did not specify automatic deletion, legal retention duration, or dedicated audit persistence for Approval Request. A concrete retention/disposal policy is still required before production use, as already covered by this action; Phase 7 does not invent a duration or create an unrequested deletion workflow.

## H-10

- [ ] **Enable selected deployment resources, identities, and operational access that Codex cannot provision within its authority.**

**Status:** changed (conditional on selected deployment resources). **Owner:** environment/account administrator and named operational owners.

**What needs to be done:** After [H-09](#h-09), create or authorize required accounts/resources, DNS or domain control, secret-store entries, deployment/workload identities, protected-environment settings, backup access, telemetry destinations, and notification integrations only where the selected design needs them. Split into concrete resource/environment actions. Codex prepares deployable definitions, least-privilege requirements, and exact settings before requesting manual steps.

**Why:** External ownership, billing, DNS control, account consent, and privileged resource grants may be outside Codex's available capabilities. Repository definitions alone cannot prove that operational access exists.

**When / dependency:** [Phase 12](implementation-plan.md#phase-12), P12.2-P12.7. Not required for ordinary development, documentation, or CI.

**Values / configuration:** Not defined yet. Populate actual resource IDs, public endpoints, configuration/secret names, OIDC trust requirements where supported, runtime versus migration identity scopes, target environments, backup destinations, alert contacts, and access expiry. Store actual secrets only in the selected secure destination; do not paste connection strings or tokens into the checklist.

**Codex verification:** Inspect effective scoped permissions and configuration; verify DNS/TLS when applicable, short-lived identity exchange, non-destructive resource access, staging deployment, telemetry delivery, and test notifications. Then exercise the planned restore/rotation/recovery procedures under their actual authorization. Record evidence per split action; access granted is not proof that deployment or recovery passed.

**Evidence / blocker:** Conditional; resources and configuration names cannot be specified before deployment choices exist.

## H-11

- [ ] **Determine repository/product licensing before distribution requires it.**

**Status:** changed (conditional on distribution requiring a license decision). **Owner:** project owner, with legal input when needed.

**What needs to be done:** Choose the intended repository/product license and distribution model, and identify any resulting dependency-license constraints. Codex may prepare implementation after the owner supplies the decision; it must not choose a legal/distribution policy by assumption.

**Why:** No license is currently selected, and accepted CI policy intentionally does not impose a global dependency-license allowlist or denylist.

**When / dependency:** [Phase 12](implementation-plan.md#phase-12), P12.8, or earlier before a distribution/publication that requires this decision. Ordinary internal foundation work need not wait.

**Values / configuration:** Chosen license/terms, copyright holder where applicable, intended distribution model, and actual dependency-license restrictions if required. No `.env` variables or credentials.

**Codex verification:** Link the recorded owner decision, verify the resulting license and package/publication metadata match it, and run relevant license checks only if a concrete policy has been established.

**Evidence / blocker:** No license selected; no distribution action is requested by this workflow setup.

## New action template

Copy this structure for each newly discovered human prerequisite. Allocate a new stable H-number; do not reuse existing IDs. Link the affected plan task to the new entry.

```markdown
## H-NN

- [ ] **Concrete human action.**

**Status:** pending. **Owner:** actual person or responsible role once known.

**What needs to be done:** Exact decision, setting, or provision; include preparation already completed by Codex and why available automation cannot finish it.

**Why:** Requirement this action satisfies.

**When / dependency:** Linked implementation phase and task IDs; activation condition and whether it blocks work now.

**Values / configuration:** Exact non-secret values, setting names, schema-defined configuration/.env keys, minimum scopes, and secure destination. Never include secret values. Use "none" when no configuration is required.

**Codex verification:** Observable checks and safe evidence needed before marking complete.

**Evidence / blocker:** Current limitation or completion evidence and verification date; record changed applicability explicitly.
```
