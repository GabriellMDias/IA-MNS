# IA-MNS Human Actions

[Project plan](implementation-plan.md) · [Project derivation](../project-derivation.md) · [Secrets policy](../security/secrets-management.md)

## Purpose and current state

This checklist records IA-MNS's prerequisites that require a project-owner decision, a human-controlled account action, an unavailable privilege, or securely supplied external configuration. Every contributor or coding agent performing implementation work must maintain it and must never silently skip work because human intervention is needed.

IA-MNS (https://github.com/GabriellMDias/IA-MNS) was initialized from Orion (https://github.com/GabriellMDias/Orion). Repository settings verified for Orion do not apply to this repository; PH-01 to PH-04 record this repository's own publication, protection, Renovate, and security settings, verified through the GitHub API on 2026-10-03. The repository is public and its own work is licensed under Apache-2.0 (PH-06). Open items concern the dedicated ERP reader, shared-deployment lifecycle and identity, and the first durable release. Conditional needs such as an identity provider, durable releases, or a deployment environment become new actions when their trigger occurs.

## Maintaining this checklist

1. Inspect existing decisions, access, tools, configuration, and prior authorization before requesting human intervention. Complete authorized automation and all useful preparation first.
2. Keep one stable `PH-NN` ID per coherent action; never reuse or renumber IDs. Split broad items into independently verifiable actions as they become concrete, and add newly discovered actions immediately.
3. Every action retains its ID, checkbox, owner, status, dependency, and evidence. Active or conditional requests also need the exact action, reason, non-secret configuration names, and verification method. Use `pending`, `in progress`, `completed`, `blocked`, or `changed` consistently with the [plan](implementation-plan.md#maintaining-this-plan).
4. Before asking the user, provide a concrete request: the exact setting or decision, prepared options where appropriate, why automation cannot finish it, affected task IDs, and how completion will be checked.
5. If an action blocks work now, mark the dependent plan task `blocked`, link this entry, and surface the request to the user. Continue independent authorized work.
6. Use `[x]` and `completed` only after verification, recording safe evidence and the verification date. If direct verification is unavailable, record the limitation rather than claiming success.
7. Reopen an action with `[ ]` if later evidence invalidates completion, access expires, or configuration changes, and record why.
8. A conditional item that becomes unnecessary remains `[ ]` with status `changed`, an explicit reason, and its future trigger or replacement.

## Safe configuration handoff

- Record configuration names, required scopes, environment, purpose, non-secret resource identifiers, and secure destination. Never record passwords, tokens, API keys, connection strings containing credentials, private keys, or complete environment dumps here, in the plan, in chat, or in tracked example files.
- Name only implemented configuration keys and link the [generated configuration reference](../generated/configuration/api.md); do not invent variable names in advance.
- Humans place secrets directly into the selected protected secret store or an explicitly documented ignored local file. Contributors verify presence and authorized behavior without printing secret contents.
- Use synthetic local and test data and ephemeral credentials where possible. Production secrets must not be prerequisites for ordinary development or CI.

## PH-01

- [x] **Create IA-MNS's repository and publish the initialized default branch.**

**Status:** completed. **Owner:** project owner or repository administrator.
**Dependency / trigger:** [PJ-01](implementation-plan.md#current-work); required before this repository has its own pull requests, CI runs, or settings.
**Request and reason:** Create an empty repository at https://github.com/GabriellMDias/IA-MNS without a generated README, license, or ignore file, then run `git push -u origin main`. Initialization configured `origin` locally but never creates remote repositories or pushes.
**Configuration:** none. Do not embed credentials in remote URLs.
**Verification:** `git ls-remote origin main` returns the local `main` commit, and `pnpm orion:check` passes in a fresh clone.
**Evidence / blocker:** Verified 2026-10-03. `git ls-remote origin` returns `4839482d85ff1b087e407f68e23702e649aede72` for `refs/heads/main` and `HEAD`, the local initialization commit. GitHub reports a public repository with default branch `main`. The push CI run [36878872646](https://github.com/GabriellMDias/IA-MNS/actions/runs/36878872646) passed `Validate` and `Orion required gate` on 2026-10-01. In a fresh clone with `orion-upstream` added as a fetch-only remote, `pnpm orion:check` reported valid provenance. On Windows, a fresh clone into a deeply nested directory needed `core.longpaths=true` because some generated portal paths are long.

## PH-02

- [ ] **Require pull requests and the CI gate on this repository's default branch, and keep merge commits available.**

**Status:** in progress. **Owner:** repository administrator.
**Dependency / trigger:** PH-01; [PJ-01](implementation-plan.md#current-work).
**Request and reason:** Protect `main`: require pull requests and the `Orion required gate` status check, block force pushes and deletion, and review bypass actors. Keep merge commits allowed and do not require linear history on `main`, because Orion upgrade pull requests must be merged with a merge commit to preserve upstream ancestry ([upgrade workflow](../project-derivation.md#upgrade-to-a-newer-orion-revision)). Branch protection is repository administration that local automation cannot perform.
**Configuration:** none beyond the repository ruleset and merge settings.
**Verification:** Read the effective rules for `main` and confirm the required check name matches [CI](../../.github/workflows/ci.yml) and that no linear-history requirement applies; confirm merge commits are allowed; a successful required-gate run appears on a pull request.
**Evidence / blocker:** Settings verified 2026-10-03. The active repository ruleset `Protect main` (ID 24431097) targets the default branch with no bypass actors and enforces: deletion protection, non-fast-forward (force-push) protection, pull requests (zero required approvals, merge/squash/rebase allowed), and the required status check `Orion required gate` from GitHub Actions. The check name matches the CI job name. Branches are not required to be up to date before merge. The effective rules for `main` contain no linear-history rule, no classic branch protection exists, and the repository allows merge commits. The owner may separately decide whether to require approving reviews; this is not needed to complete this action. Remaining evidence: a successful required-gate run on the first pull request.

## PH-03

- [x] **Enable Renovate for this repository.**

**Status:** completed. **Owner:** repository administrator.
**Dependency / trigger:** PH-01.
**Request and reason:** Grant the Renovate GitHub App access to https://github.com/GabriellMDias/IA-MNS so the committed [configuration](../../renovate.json) runs. App installation is an account action.
**Configuration:** none; no personal token is required.
**Verification:** Renovate opens this repository's Dependency Dashboard reflecting the committed dependencies and schedule.
**Evidence / blocker:** Verified 2026-10-03. The Renovate app opened [Dependency Dashboard #1](https://github.com/GabriellMDias/IA-MNS/issues/1) at 20:56 UTC. It lists dependencies detected from the committed manifests (including the CI workflow and `.node-version`), updates awaiting the committed schedule, and major updates pending approval. Renovate opened no pull requests. The dashboard reflects the default branch; dependencies added by unmerged work appear after merge.

## PH-04

- [ ] **Enable and verify applicable GitHub security controls.**

**Status:** in progress. **Owner:** repository administrator.
**Dependency / trigger:** PH-01.
**Request and reason:** Enable available code scanning, secret scanning and push protection, dependency graph, and vulnerability alerts, and set the Actions variable `DEPENDENCY_REVIEW_ENABLED=true` so the dependency-review job runs. Record entitlement limits for this repository's visibility and plan.
**Configuration:** Actions variable `DEPENDENCY_REVIEW_ENABLED` (non-secret).
**Verification:** Inspect effective security settings and a pull-request run in which dependency review executed and the aggregate gate passed.
**Evidence / blocker:** Settings verified 2026-10-03 for this public repository, where these features carry no extra entitlement. Enabled:

- secret scanning with push protection;
- Dependabot vulnerability alerts;
- the dependency graph (its SBOM endpoint lists the default branch's packages);
- CodeQL default setup for Actions and JavaScript/TypeScript, with the default query suite and a weekly schedule. The setup run [37153481169](https://github.com/GabriellMDias/IA-MNS/actions/runs/37153481169) succeeded.

The Actions variable `DEPENDENCY_REVIEW_ENABLED` is `true`. Disabled: Dependabot security updates, which is consistent with Renovate owning updates ([CI policy](../architecture/continuous-integration.md)). Also disabled are optional non-provider secret patterns, validity checks, and private vulnerability reporting. Remaining evidence: a pull-request run in which `Dependency review` executes and the required gate passes.

## PH-05

- [x] **Define the product scope and acceptance criteria.**

**Status:** completed. **Owner:** project owner.
**Dependency / trigger:** [PJ-02](implementation-plan.md#current-work); required before product modules are implemented.
**Request and reason:** Describe the product, actors, first capabilities, data classification, identity and authorization needs, and acceptance scenarios. Agents must not invent product requirements.
**Configuration:** none.
**Verification:** Requirements are recorded in the repository and linked from the project plan.
**Evidence / blocker:** Owner initially supplied the focused Portuguese sales-chat scope and reference SQL on 2026-10-01; [requirements and acceptance](../domains/sales-chat.md) record the initial decision. On 2026-10-01 the owner expanded the product direction to the [corporate agent](../domains/corporate-agent.md), retaining sales as the only implemented business capability.

## PH-06

- [x] **Determine the product license before distribution requires it.**

**Status:** completed. **Owner:** project owner, with legal input when needed.
**Dependency / trigger:** Publication or distribution of IA-MNS.
**Request and reason:** Choose the license, copyright holder, and distribution model for IA-MNS's own work. Agents must not choose legal policy by assumption. Material inherited from Orion is Apache-2.0, which does not decide IA-MNS's license.
**Configuration:** none.
**Verification:** License files, the README, and publication metadata match the recorded decision.
**Evidence / blocker:** On 2026-10-03 the owner chose the Apache License 2.0 for IA-MNS and confirmed that the repository stays public; [ADR-0021](../adr/0021-license-ia-mns-under-apache-2-0.md) records the decision. The unmodified root [LICENSE](../../LICENSE) already contains the canonical terms, the [README](../../README.md#license) states the decision, and GitHub detects the repository license as `apache-2.0`. Packages remain `private` and unpublished, so no package license metadata was added. The owner named no copyright holder, so no `NOTICE` file or copyright statement was added. Add one if the owner provides a holder; it is not required to close this action. Dependency-license enforcement remains a separate future policy under [ADR-0011](../adr/0011-establish-continuous-integration-dependency-automation-and-supply-chain-security-strategy.md#license-policy).

## PH-07

- [x] **Select the dedicated IA-MNS OpenAI project and securely provision its project key.**

**Status:** completed. **Owner:** project owner / OpenAI Platform administrator.
**Dependency / trigger:** [PJ-06](implementation-plan.md#current-work); required for live interpretation, not synthetic tests.
**Request and reason:** The owner configured a key manually and explicitly authorized reusing it on 2026-10-01, superseding the previous request for a new key and its incomplete picker/destination flow. No new key was created or rotated by the agent.
**Configuration:** OPENAI_API_KEY, optional OPENAI_MODEL; ignored root .env.local, never browser or tracked source. Minimum application capability: model Responses requests.
**Verification:** Safe presence check and actual strict Responses interpretation with the configured key/model succeeded; ten live-language HTTP scenarios passed through the real application. [Live evidence](live-sales-verification.md).
**Evidence / blocker:** Authenticated live interpretation passed on 2026-10-01. Account ownership, project attribution, billing, and retention policy remain owner controls; successful requests do not independently attest those settings. Oracle grants/units remain PH-08.

## PH-08

- [ ] **Supply read-only Sankhya configuration and reconcile live sales results.**

**Status:** blocked. **Owner:** project owner and ERP DBA.
**Dependency / trigger:** [PJ-06](implementation-plan.md#current-work); the owner explicitly reserved credential entry.
**Request and reason:** Credentials are present and real queries now execute, but the supplied account has seven broad write privileges. Provide a dedicated CREATE SESSION / SELECT-only Oracle reader; do not grant ANY TABLE, DML, DDL, or procedure execution. Preserve table/synonym resolution for TGFCAB, TGFTOP, TGFVEN, TGFITE, TGFPAR, TGFPRO, TGFGRU, TSIEMP, TCSPRJ, TGFVAR, AD_MOTIVODEV, and AD_RESULTADO_LOTE. Confirm BRL currency and the ERP's weight unit. No grants or other ERP state were changed during verification.
**Configuration:** `SANKHYA_DB_USER`, `SANKHYA_DB_PASSWORD`, `SANKHYA_DB_CONNECT_STRING`; optional `SANKHYA_ORACLE_CLIENT_LIB_DIR` only if installed Oracle Client libraries are needed. `IA_MNS_LOCAL_ACCESS=true` is limited to private local development; shared access instead needs the existing issuer/audience/JWKS settings and sales:read scope.
**Verification:** Run the acceptance examples and [reconciliation cases](../domains/sales-chat.md#local-execution-and-external-verification), compare totals with the supplied SQL using equivalent full-day date bounds, and verify write grants are absent. Never test writes against the ERP.
**Evidence / blocker:** On 2026-10-01, Oracle 12.1.0.2 connectivity and nine structured-query reconciliations succeeded in READ ONLY snapshots. Isolated Client 19.32 was checksum-verified and the ignored local library setting updated; Client 11.2/DPI-1050 and Thin/NJS-116 were incompatible. SESSION_PRIVS confirmed seven broad write privileges. Complete-record fetching showed an intermittent difference with small native fetch batches; database-side MINUS found no differences, and a complete bounded fetch matched all 46 fields. The adapter uses the bounded-fetch workaround; the precise legacy driver/server cause still needs DBA investigation. The later live-language acceptance and original-SQL reconciliation passed with the manually configured key. The DBA's dedicated reader account and the owner's confirmation of currency/weight units remain outstanding; no change was reported on 2026-10-03.

## PH-09

- [ ] **Define lifecycle and operational controls before shared use of persistent conversations.**

**Status:** pending (conditional on shared deployment). **Owner:** project owner.
**Dependency / trigger:** PJ-05; PostgreSQL local history introduced by PJ-09 is explicitly authorized.
**Request and reason:** Before shared deployment, choose conversation retention/deletion duration, provider data policy, backup/restore requirements and permitted operators. Local history currently persists until its owner explicitly deletes it; no automatic expiry or backup promise is made. Select real employee authentication/permission mapping at that point, not in this task.
**Configuration:** Existing ORION_DATABASE_URL and verifier settings; no new secret or provider is required for local operation.
**Verification:** Approved lifecycle controls, recovery evidence and deployment-specific identity exist before sharing confidential history.
**Evidence / blocker:** Local Docker volume, restricted runtime grants and explicit cascade deletion implemented on 2026-10-01; shared-operation policy remains intentionally undecided. As of 2026-10-03, employee identity, authentication, and authorization mapping are still under discussion and no identity provider has been selected; repository publication did not trigger shared deployment.

## PH-10

- [ ] **Record the first durable migration boundary before publishing a durable release.**

**Status:** pending (conditional on durable release publication). **Owner:** project owner/release maintainer.
**Dependency / trigger:** PJ-01/PJ-05 and the repository's [release workflow](../database/release-evolution.md).
**Request and reason:** Commit the reviewed migration/application baseline and record its immutable commit/checksums in release-history.json when establishing a supported persistent environment. The local conversation migration has been applied; treat its SQL as immutable now. Do not edit applied history because the registry currently has no recorded release. Committing the migrations in the first pull request does not record a release.
**Configuration:** none.
**Verification:** Release-history validation and supported upgrade evidence reference the actual committed baseline.
**Evidence / blocker:** Two additive local agent migrations have been applied, including conversation organization on 2026-10-02. On 2026-10-03 they were first committed for review in the initial project pull request; no release-history entry, release tag, or remote release was created.

## New action template

Allocate a new stable `PH-NN`; do not reuse existing IDs. Link it from the blocked or conditional plan task.

```markdown
## PH-NN

- [ ] **Concrete human action.**

**Status:** pending. **Owner:** actual person or responsible role.
**Dependency / trigger:** Linked task; whether it blocks current work.
**Request and reason:** Exact need, completed preparation, and why authorized automation cannot finish it.
**Configuration:** Exact non-secret names, minimum scopes and secure destination; never secret values. Use "none" if no configuration is needed.
**Verification:** Observable checks required before completion.
**Evidence / blocker:** Dated safe evidence, outstanding limit, or changed applicability.
```
