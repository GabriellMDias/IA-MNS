# IA-MNS Human Actions

[Project plan](implementation-plan.md) · [Project derivation](../project-derivation.md) · [Secrets policy](../security/secrets-management.md)

## Purpose and current state

This checklist records IA-MNS's prerequisites that require a project-owner decision, a human-controlled account action, an unavailable privilege, or securely supplied external configuration. Every contributor or coding agent performing implementation work must maintain it and must never silently skip work because human intervention is needed.

IA-MNS (https://github.com/GabriellMDias/IA-MNS) was initialized from Orion (https://github.com/GabriellMDias/Orion). Repository settings verified for Orion do not apply to this repository; PH-01 to PH-04 record this repository's own publication, protection, Renovate, and security settings, verified through the GitHub API on 2026-10-03. The repository is public and its own work is licensed under Apache-2.0 (PH-06). Open items concern the dedicated ERP reader, shared-deployment lifecycle, the first durable release, and the external preconditions of the IA-MNS identity: Sankhya Om security hardening, PDT Connect homologation, the Om identity add-on, the automatic-grant policy and production identity deployment (PH-11 to PH-15), the terms for publishing the Sankhya add-on template (PH-17), and the production deployment decisions approved on 2026-10-07: proxy topology and hop protection, a production OpenAI key, the remaining operations, and Oracle transit protection (PH-22 to PH-25), the column grants and business confirmations that refine product lookup (PH-27, PH-28), and the completed isolation of existing administrative Discovery credentials (PH-29), inherited PostgreSQL PUBLIC DDL privileges awaiting coordinated review (PH-30), and the Meta account, dedicated number, credentials, webhook and approvals that activate the WhatsApp channel (PH-32 to PH-35), and the now-completed Runtime read of Sankhya result centers for the sales restriction by result center (PH-36), with owner UI acceptance still separate. The Sankhya add-on development environment is prepared (PH-16). Conditional needs such as an identity provider, durable releases, or a deployment environment become new actions when their trigger occurs.

Local development startup is covered by [PJ-49](implementation-plan.md#current-work): the web server reuses the configured provider origins from the root ignored `.env.local`, without a repeated shell assignment or a new human prerequisite. The existing Om installation and access requirements remain under [PH-16](#ph-16).

The My Account, Administration and conversation-material visual improvements in [PJ-50 to PJ-53](implementation-plan.md#current-work) require no new human action or external access; existing account, security and channel prerequisites still apply.

The foundation upgrade in [PJ-59](implementation-plan.md#current-work) requires review and a merge commit to retain Orion ancestry; no production deployment, ERP mutation or new credential is authorized. Future deployments must rebuild clean production artifacts and remove stale internal-documentation assets and caches. Protected internal builds require external host access control over all pages, assets and downloads as well as the existing `ORION_WEB_DOCS` runtime opt-in. Existing deployment prerequisites remain open. The [post-upgrade audit](orion-v3-post-upgrade-audit.md) introduces no new credential, privilege or production action; review of PR #13 and merge-commit integration remain the next owner action.

## Maintaining this checklist

The PR #11 corrections in [PJ-58](implementation-plan.md#current-work) need no new human-controlled account, secret or ERP access. They add the forward application migrations `202610210002_identity_whatsapp_link_generations` and `202610210003_rotate_legacy_whatsapp_generations`; deployment must apply both before the updated runtime and must not run older WhatsApp workers concurrently. Disable the channel before rolling back to an older runtime and keep it disabled there. Existing WhatsApp activation approvals remain PH-32 to PH-35.

The static feature/SQL catalog in [PJ-56](implementation-plan.md#current-work) requires no new human action or ERP access. It documents the existing catalog exposure and deployment prerequisites; it does not complete or change PH-27, PH-28 or PH-36.

The button theme-transition accessibility correction in [PJ-57](implementation-plan.md#current-work) requires no new human action, production access or ERP privilege.

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

- [x] **Require pull requests and the CI gate on this repository's default branch, and keep merge commits available.**

**Status:** completed. **Owner:** repository administrator.
**Dependency / trigger:** PH-01; [PJ-01](implementation-plan.md#current-work).
**Request and reason:** Protect `main`: require pull requests and the `Orion required gate` status check, block force pushes and deletion, and review bypass actors. Keep merge commits allowed and do not require linear history on `main`, because Orion upgrade pull requests must be merged with a merge commit to preserve upstream ancestry ([upgrade workflow](../project-derivation.md#upgrade-to-a-newer-orion-revision)). Branch protection is repository administration that local automation cannot perform.
**Configuration:** none beyond the repository ruleset and merge settings.
**Verification:** Read the effective rules for `main` and confirm the required check name matches [CI](../../.github/workflows/ci.yml) and that no linear-history requirement applies; confirm merge commits are allowed; a successful required-gate run appears on a pull request.
**Evidence / blocker:** Settings verified 2026-10-03. The active repository ruleset `Protect main` (ID 24431097) targets the default branch with no bypass actors and enforces: deletion protection, non-fast-forward (force-push) protection, pull requests (zero required approvals, merge/squash/rebase allowed), and the required status check `Orion required gate` from GitHub Actions. The check name matches the CI job name. Branches are not required to be up to date before merge. The effective rules for `main` contain no linear-history rule, no classic branch protection exists, and the repository allows merge commits. The owner may separately decide whether to require approving reviews; this is not needed to complete this action. Completed 2026-10-04: pull request #2 run [37156241037](https://github.com/GabriellMDias/IA-MNS/actions/runs/37156241037) passed `Validate` and `Orion required gate` before the merge commit `689e728`; the post-merge push run [37156472962](https://github.com/GabriellMDias/IA-MNS/actions/runs/37156472962) also passed.

## PH-03

- [x] **Enable Renovate for this repository.**

**Status:** completed. **Owner:** repository administrator.
**Dependency / trigger:** PH-01.
**Request and reason:** Grant the Renovate GitHub App access to https://github.com/GabriellMDias/IA-MNS so the committed [configuration](../../renovate.json) runs. App installation is an account action.
**Configuration:** none; no personal token is required.
**Verification:** Renovate opens this repository's Dependency Dashboard reflecting the committed dependencies and schedule.
**Evidence / blocker:** Verified 2026-10-03. The Renovate app opened [Dependency Dashboard #1](https://github.com/GabriellMDias/IA-MNS/issues/1) at 20:56 UTC. It lists dependencies detected from the committed manifests (including the CI workflow and `.node-version`), updates awaiting the committed schedule, and major updates pending approval. Renovate opened no pull requests. The dashboard reflects the default branch; dependencies added by unmerged work appear after merge.

## PH-04

- [x] **Enable and verify applicable GitHub security controls.**

**Status:** completed. **Owner:** repository administrator.
**Dependency / trigger:** PH-01.
**Request and reason:** Enable available code scanning, secret scanning and push protection, dependency graph, and vulnerability alerts, and set the Actions variable `DEPENDENCY_REVIEW_ENABLED=true` so the dependency-review job runs. Record entitlement limits for this repository's visibility and plan.
**Configuration:** Actions variable `DEPENDENCY_REVIEW_ENABLED` (non-secret).
**Verification:** Inspect effective security settings and a pull-request run in which dependency review executed and the aggregate gate passed.
**Evidence / blocker:** Settings verified 2026-10-03 for this public repository, where these features carry no extra entitlement. Enabled:

- secret scanning with push protection;
- Dependabot vulnerability alerts;
- the dependency graph (its SBOM endpoint lists the default branch's packages);
- CodeQL default setup for Actions and JavaScript/TypeScript, with the default query suite and a weekly schedule. The setup run [37153481169](https://github.com/GabriellMDias/IA-MNS/actions/runs/37153481169) succeeded.

The Actions variable `DEPENDENCY_REVIEW_ENABLED` is `true`. Disabled: Dependabot security updates, which is consistent with Renovate owning updates ([CI policy](../architecture/continuous-integration.md)). Also disabled are optional non-provider secret patterns, validity checks, and private vulnerability reporting. Completed 2026-10-04: in pull request #2 run [37156241037](https://github.com/GabriellMDias/IA-MNS/actions/runs/37156241037), `Dependency review` executed and succeeded and `Orion required gate` passed.

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
**Evidence / blocker:** Authenticated live interpretation passed on 2026-10-01. On 2026-10-05 the same key and model ran opt-in AI evaluations, synthetic candidate generation and simulations under PJ-20; only synthetic dataset text was sent. Account ownership, project attribution, billing, and retention policy remain owner controls; successful requests do not independently attest those settings. Oracle grants/units remain PH-08.

## PH-08

- [ ] **Confirm remaining Sankhya business units and complete reconciliation acceptance.**

**Status:** in progress (Runtime access completed). **Owner:** project owner and ERP business owner.
**Dependency / trigger:** PJ-06 and PJ-41; preserve the owner-managed credentials.
**Request and reason:** The existing `IA_MNS_RO` account now authenticates with `CREATE SESSION` and SELECT on the 24 required sales/product/dictionary tables, plus the limited user-directory view and private synonyms. No account/password or business-row changes were needed. The owner still must confirm BRL currency and the PESOLIQ weight unit, review the earlier legacy driver/fetch concern where relevant and finish real business acceptance. Do not label weight kilograms before confirmation.
**Configuration:** Runtime `SANKHYA_DB_USER=IA_MNS_RO`, existing password/connect/client settings; `SANKHYA_DIRECTORY_VIEW=IA_MNS_USER_DIRECTORY` was added without changing other settings. The existing administrator remains in ignored `.env.discovery`; no third account. Restart an already running API to ingest the directory setting.
**Verification:** [Runtime access verification](runtime-access-verification.md): all 24 tables readable; SELECT-only guard and metadata checks pass; 14 real product regression checks pass without AI calls; actual sales and directory adapters execute read-only SQL. Compare business reference totals and record owner confirmation separately. Never probe actual writes.
**Evidence / blocker:** Owner-authorized grants/view/synonyms applied on 2026-10-11; zero pending statements on replanning. Raw TSIUSU, disabled metadata candidates, ANY/DML/DDL/procedure grants and grant option were excluded. Historical 2026-10-01 sales reconciliation, legacy Client 19.32 workaround and later live-language evidence remain in [sales documentation](../domains/sales-chat.md#local-execution-and-external-verification). Account provisioning no longer blocks Runtime; business confirmations remain open.

## PH-09

- [ ] **Define lifecycle and operational controls before shared use of persistent conversations.**

**Status:** pending (conditional on shared deployment). **Owner:** project owner.
**Dependency / trigger:** PJ-05; PostgreSQL local history introduced by PJ-09 is explicitly authorized.
**Request and reason:** Before shared deployment, choose conversation retention/deletion duration, provider data policy, backup/restore requirements and permitted operators. Include confidential AI content traces (`agent_turn_traces`, enabled by `IA_MNS_AI_TRACE=content`): whether production may capture them, for how long, who may export them to evaluation candidates, and how they are anonymized; production refuses content tracing until this decision exists. Local history currently persists until its owner explicitly deletes it; no automatic expiry or backup promise is made. Select real employee authentication/permission mapping at that point, not in this task.
**Configuration:** Existing ORION_DATABASE_URL and verifier settings; no new secret or provider is required for local operation. `IA_MNS_AI_TRACE` (non-secret: `off`, `metadata` or `content`).
**Verification:** Approved lifecycle controls, recovery evidence and deployment-specific identity exist before sharing confidential history.
**Evidence / blocker:** Local Docker volume, restricted runtime grants and explicit cascade deletion implemented on 2026-10-01; shared-operation policy remains intentionally undecided. On 2026-10-07 [PJ-33](implementation-plan.md#current-work) implemented production backups with conservative defaults that this decision replaces: 14 daily and 10 pre-deployment backups on the host, an age-encrypted external copy when a destination is configured, a weekly restore verification, and no automatic deletion of a database replaced by a restore ([backup runbook](../runbooks/production-backup-and-restore.md)). Retention, provider data policy and permitted operators are still undecided. On 2026-10-04 the IA-MNS identity (Persons, local accounts, PDT/Sankhya links, sessions, permissions, owner administration) was implemented under PJ-15 ([identity](../domains/identity.md)); retention of identity data, sessions and audit is part of this pending policy. Shared deployment has not been triggered.

**Autonomy policy update (2026-10-12):** The owner approved necessary in-scope business data in OpenAI requests, subject to legal/corporate authority. [AI data processing](../security/ai-data-processing.md) implements that decision. PH-09 still covers retention/operators/production tracing; it is not a blanket block on nonpersonal operational analysis. Account controls, contracts and any additional personal-data categories remain PH-31.

## PH-10

- [ ] **Record the first durable migration boundary before publishing a durable release.**

**Status:** pending (conditional on durable release publication). **Owner:** project owner/release maintainer.
**Dependency / trigger:** PJ-01/PJ-05 and the repository's [release workflow](../database/release-evolution.md).
**Request and reason:** Commit the reviewed migration/application baseline and record its immutable commit/checksums in release-history.json when establishing a supported persistent environment. The local conversation migration has been applied; treat its SQL as immutable now. Do not edit applied history because the registry currently has no recorded release. Committing the migrations in the first pull request does not record a release.
**Configuration:** none.
**Verification:** Release-history validation and supported upgrade evidence reference the actual committed baseline.
**Evidence / blocker:** On 2026-10-07 [ADR-0030](../adr/0030-name-ia-mns-releases-with-product-tags-distinct-from-orion.md) fixed the sequence for the first durable release ([PJ-34](implementation-plan.md#current-work)): an `ia-mns-vX.Y.Z` tag on a `main` commit that passed CI, the artifact built from that commit with the tag as `ORION_RELEASE_ID`, its migrations applied to the production database, that database's finished and not rolled-back `_prisma_migrations` compared by name with the tagged commit's migrations and by Prisma checksum with the deployed artifact's files, and only then a reviewed release-history entry with `pnpm release:checksums <tagged SHA>` under the tag's name. Two additive local agent migrations have been applied, including conversation organization on 2026-10-02. On 2026-10-03 they were first committed for review in the initial project pull request; no release-history entry, release tag, or remote release was created. On 2026-10-05 PJ-20 added the additive `202610050001_agent_turn_traces` migration; it was verified on disposable PostgreSQL only and has not been applied to the owner's local volume.

## PH-11

- [ ] **Harden the Sankhya Om transport and session before trusting it for IA-MNS sign-in.**

**Status:** pending (blocks production approval of Sankhya sign-in, PJ-17). **Owner:** infrastructure administrator with the project owner; Sankhya support for WildFly settings.
**Dependency / trigger:** [PJ-17](implementation-plan.md#current-work); does not block the rest of the identity.
**Request and reason:** An internal read-only review on 2026-10-04 found that the current Om deployment does not yet meet the conditions below. The specific hosts, ports and observations are kept with the project owner, outside this public repository. Approve and apply, preferably at the TLS reverse proxy that Sankhya recommends:

1. HTTPS-only access with HSTS for the Om host.
2. `Secure` and `SameSite=Lax` on the Om session cookie. Use `Lax`, not `Strict`, which would break "Entrar com Sankhya".
3. Only `https://` redirects generated by the Om behind the proxy (forwarded protocol honored by WildFly, or `Location` rewriting).
4. A private or encrypted proxy-to-Om hop.
5. No direct public exposure of the Om HTTP port, after an inventory of every consumer (PDT Connect integrations, the Sankhya API Gateway, mobile apps, TVs and other integrations) moves to the HTTPS name or a private path.
6. `HttpOnly` once custom BI components that read the session cookie are adjusted and tested.
7. Session-id rotation at login.

Apply nothing without the owner's approval. Never test with real credentials over plain HTTP.

On 2026-10-06 the owner decided that IA-MNS trusts only the Om HTTPS name in production; the other current addresses of the Om (kept with the owner, outside this public repository) are not trusted, and the add-on tells people who open the Om through them to use the secure address. An internal address can be added later only if it is served over HTTPS, which would also need IA-MNS support for more than one Om origin.
**Configuration:** none in IA-MNS until approval, then `SANKHYA_SESSION_TRUST=approved` (non-secret) in production.
**Verification:** Anonymous HTTPS checks show HSTS, `Secure; SameSite=Lax` on the session cookie and only `https://` redirects, and the direct HTTP port is closed to the public. The Om proof of concept, run only through the HTTPS name, confirms the CODUSU and the frame chain.
**Evidence / blocker:** 2026-10-04 internal review (details withheld from this public repository). No infrastructure was changed.

## PH-12

- [ ] **Provide a PDT Connect homologation installation for IA-MNS sign-in and embedding.**

**Status:** pending (blocks PJ-16). **Owner:** PDT Connect owner/administrator.
**Dependency / trigger:** [PJ-16](implementation-plan.md#current-work); IA-MNS's PDT connector and the PDT IA-MNS screen are implemented and passed with a local PDT ([PJ-27](implementation-plan.md#current-work)).
**Request and reason:** In an HTTPS homologation PDT (never production):

1. Apply the identity migration.
2. Set `PDT_IDENTITY_ISSUER`.
3. Register the IA-MNS client in `PDT_IDENTITY_CLIENTS` with the redirect URI of the IA-MNS homologation `/api/identity/pdt/callback` and only the SHA-256 of a secret generated for IA-MNS.
4. Review, commit and deploy the PDT IA-MNS screen (PJ-27; uncommitted in the PDT Connect working tree), apply its migration, set the `IA_MNS_*` parameters to the IA-MNS homologation values and grant `ia-mns:acessar` to the intended users ([identity](../domains/identity.md#pdt-host-component-outside-this-repository)). If the PDT proxy sends a Content-Security-Policy, its `frame-src` must allow the IA-MNS origin.

Keep the production PDT origin and other environment addresses out of this public repository; they belong to the deployment configuration.
**Configuration:** in IA-MNS: `PDT_IDENTITY_BASE_URL`, `PDT_IDENTITY_ISSUER`, `PDT_IDENTITY_CLIENT_ID`, `PDT_IDENTITY_CLIENT_SECRET` (secret store only), `PDT_IDENTITY_REDIRECT_URI`, `PDT_EMBED_ORIGIN`; `ORION_WEB_EMBED_ANCESTORS` or the hosting equivalent.
**Verification:** In homologation:

- direct sign-in, first access and reload work;
- embedded sign-in without a new login works, including silent renewal and reload;
- revocation is followed by a 401;
- hostile framing is blocked.

Record the HTTPS evidence.
**Evidence / blocker:** Homologation URL and deployment not yet provided. On 2026-10-06 the owner authorized changes to the PDT Connect repository, and the embedded flow passed with a local PDT over HTTP ([PJ-27](implementation-plan.md#current-work)); that is not HTTPS or homologation evidence.

## PH-13

- [ ] **Select and review default user groups for PDT Connect and Sankhya before shared use.**

**Status:** pending (non-blocking for implementation). **Owner:** project owner.
**Dependency / trigger:** PJ-55; before shared use after applying migration `202610210001_identity_provider_groups`.
**Request and reason:** On 2026-10-21 the owner replaced automatic permission grants by provider link with automatic entry into a default user group after verified sign-in. Both selections start empty. In **Administração → Grupos**, create or choose the groups and review their per-source permissions and restrictions, particularly whether Sankhya users may read Pilar da Terra sales and which product permissions they receive. Then select each group in **Parâmetros → Grupo de Usuário padrão por vínculo**, or retain **Nenhum grupo**. Personal restrictions do not narrow a broader group grant. Existing memberships persist after changing or clearing a selection; remove unwanted memberships explicitly.
**Verification:** A verified login through each configured system shows the expected group, permissions and restrictions; a local login or mere stored link does not add membership. Record the chosen production groups here.
**Evidence / blocker:** The authorization model is resolved by the owner's request. The actual installation groups and grants remain owner selections; legacy automatic-grant settings no longer grant permissions ([ADR-0038](../adr/0038-join-default-user-groups-after-verified-provider-sign-in.md)).

## PH-14

- [ ] **Review and publish the IA-MNS add-on in the production Sankhya Om with production key custody.**

**Status:** pending (blocks PJ-17; PJ-24 is completed; production also depends on PH-11 and PH-17). **Owner:** project owner with the Sankhya Om administrator.
**Dependency / trigger:** [PJ-17](implementation-plan.md#current-work), after the add-on passes in the development environment ([PJ-24](implementation-plan.md#current-work)).
**Request and reason:** The add-on in [`apps/sankhya-addon`](../../apps/sankhya-addon/README.md) reads the authenticated user from the server-side Om session and signs short assertions under the [assertion contract](../domains/identity.md#sankhya-om-add-on-assertion-contract). Its menu screen frames `/embed/sankhya` and answers the bridge; the direct-URL authorize page is PJ-25. On 2026-10-06 the owner chose an Add-on Studio add-on, not BI JSP packaging ([ADR-0026](../adr/0026-host-ia-mns-in-sankhya-om-through-an-in-repository-add-on.md)); the developer-area solution and template are in place (PH-16). Before production: review the add-on, generate the production P-256 signing key pair and write the add-on host configuration (`ia-mns-addon.properties` with the production IA-MNS and Om HTTPS origins, issuer, audience and key id) in the production WildFly configuration directory, keeping the private key there, outside sources editable by ordinary BI authors and outside this repository; restrict who can publish JSP or add-ons; provide the add-on `appKey` to the build without committing it; install the add-on in the production Om; and grant the screen **IA-MNS** (resource `ia-mns.IaMns`) only to the intended users or groups in the Om access control. `om.origin` is the Om HTTPS name only (owner decision of 2026-10-06). The owner also decided to accept the shared SUP account (CODUSU 0) and consolidate it into the principal administrator's Person: restrict who knows the production SUP password, because anyone signed in as SUP will act as that administrator in IA-MNS (production still requires the administrator's second factor for administration). Agents do not publish to or change the production Om. The disposable proof-of-concept JSP outside this repository is not production code.
**Configuration:** in IA-MNS: `SANKHYA_IDENTITY_ISSUER`, `SANKHYA_IDENTITY_KEYS` (public keys only), `SANKHYA_IDENTITY_AUTHORIZE_URL`, `SANKHYA_EMBED_ORIGIN`; in the Om WildFly: `ia-mns-addon.properties` and the signing key file ([add-on guide](../../apps/sankhya-addon/README.md#how-it-works)).
**Verification:** Through the HTTPS name, test with native and Sankhya ID logins:

- the CODUSU is correct;
- assertions are bound to the nonce and single-use;
- signed-out users are refused;
- the add-on refuses requests outside the HTTPS name.
  **Evidence / blocker:** Packaging decided on 2026-10-06. The embedded add-on passed these checks in the development Om on 2026-10-06 over local HTTP with a development key ([PJ-24](implementation-plan.md#current-work)); that is not production evidence. Nothing has been installed in the production Om.

## PH-15

- [ ] **Provision production identity configuration and web hosting rules.**

**Status:** pending (conditional on shared deployment, PJ-05). **Owner:** project owner / platform operator.
**Dependency / trigger:** [PJ-05](implementation-plan.md#current-work).
**Request and reason:**

- An HTTPS IA-MNS public origin, with web and API under the same origin.
- The signing and encryption keys generated for production in the secret store, never reused from local development.
- Web hosting that sends `frame-ancestors 'none'` on every route except `/embed/pdt` and `/embed/sankhya`, which allow only their host origins.
- Running `pnpm identity:bootstrap` on the server to create the first owner, plus a second owner for recovery.
- An owner reviewing **Administração → Autenticação e segurança** before opening production: a policy relaxed for development (long sessions, remembered browsers) should return to production values; production always keeps the administrators' second factor ([ADR-0025](../adr/0025-administer-the-authentication-policy-within-fixed-safeguards.md)).
- An owner reviewing **Administração → Parâmetros** before opening production: the AI model in use (evaluated with `pnpm eval` before any change), the trace level (content tracing is refused in production), and the default user groups by provider with their permissions and restrictions ([ADR-0028](../adr/0028-administer-operational-parameters-separately-from-secrets-and-bootstrap-configuration.md)). Values saved in a development database do not travel to production; production starts from its environment defaults.
  **Configuration:** `IA_MNS_PUBLIC_ORIGIN`, `IA_MNS_IDENTITY_SIGNING_KEY`, `IA_MNS_IDENTITY_ENCRYPTION_KEY` (both secret), optional `IA_MNS_IDENTITY_AUDIENCE`.
  **Verification:** HTTPS, the `__Host-` session cookie, framing headers per path, owner bootstrap and TOTP, the reviewed authentication policy and operational parameters are verified in the deployed environment.
  **Evidence / blocker:** No deployment environment yet. On 2026-10-07 [PJ-32](implementation-plan.md#current-work) implemented the application side: the API serves the web build at one origin with per-surface framing from `PDT_EMBED_ORIGIN`/`SANKHYA_EMBED_ORIGIN`, `pnpm identity:keys` (or `dist/cli/identity-keys.js`) writes fresh keys to a new owner-only file, and `dist/cli/identity-bootstrap.js` issues the owner invitation from a build ([ADR-0029](../adr/0029-serve-the-web-and-api-from-one-origin-behind-restricted-trusted-proxies.md)). Nothing was configured in an environment. On 2026-10-07 [PJ-33](implementation-plan.md#current-work) added `ia-mns-deploy init-secrets` (generates the identity keys and database passwords in `/etc/ia-mns` without displaying them) and `ia-mns-deploy bootstrap-owner` ([host setup runbook](../runbooks/production-host-setup-and-first-deployment.md)).

## PH-16

- [x] **Prepare the Sankhya add-on development environment and the official template.**

**Status:** completed. **Owner:** project owner.
**Dependency / trigger:** [PJ-23](implementation-plan.md#current-work) and [PJ-24](implementation-plan.md#current-work); a Sankhya developer account and the solution are account actions.
**Request and reason:** Create the IA-MNS solution in the Sankhya developer area, download its add-on template, run the development database in Docker, and install and configure the development WildFly and Om as the Sankhya developer documentation describes. Place the template in `apps/sankhya-addon`.
**Configuration:** local only: `JAVA_HOME` (JDK 8); `wildfly.home` and the solution `sankhya.appKey` in the ignored `apps/sankhya-addon/local.properties` (or `WILDFLY_HOME` and `SANKHYA_ADDON_APP_KEY`) ([add-on guide](../../apps/sankhya-addon/README.md#development-environment)).
**Verification:** The template is in `apps/sankhya-addon`; the development database container and WildFly run locally.
**Evidence / blocker:** The owner reported on 2026-10-06 that the solution was created, the template downloaded, the database configured with Docker and the WildFly configured per the Sankhya developer documentation. Verified the same day: the template is in `apps/sankhya-addon` with Gradle wrapper 8.2 and the IA-MNS solution's project name and group; a `sankhyaimages/skdev-oracle:1.1.0` container was running and healthy; a JDK 8 process was listening on the WildFly HTTP and management ports; `JAVA_HOME` pointed to JDK 8. `WILDFLY_HOME` was not set in the user or machine environment, so it must be set (or supplied through the IDE) before `deployAddon`. The developer-area registration and the Om installation through WPM were not inspected directly. During PJ-24 on 2026-10-06 the development WildFly needed two development-only corrections: `placemm.ear`, marked failed by the deployment scanner's timeout during the first boot, was redeployed (the add-on requires it), and `-XX:MaxMetaspaceSize` in `bin/standalone.conf.bat` was raised from 256m to 1024m after the fully deployed Om ran out of metaspace (the previous file was kept as a backup); the owner restarted WildFly. The owner then granted the IA-MNS screen to the development user VENDEDOR in the Om access control.

## PH-17

- [ ] **Confirm the terms for publishing the Sankhya add-on template files in this public repository.**

**Status:** pending (blocks committing template-derived files; does not block local development). **Owner:** project owner, with Sankhya or legal input when needed.
**Dependency / trigger:** [PJ-24](implementation-plan.md#current-work); before the first commit of template-derived files.
**Request and reason:** The template downloaded from the Sankhya developer area carries no license statement. IA-MNS is public under Apache-2.0 ([ADR-0021](../adr/0021-license-ia-mns-under-apache-2-0.md)), so committing Sankhya-authored files publishes them under this repository. Agents must not assume redistribution rights. PJ-24 removed or replaced every template file the add-on does not need: the guide, the example Java classes, screen, dashboard, data-dictionary, database-script and parameter examples, the icon, `.gitignore`, `.editorconfig` and the build files, which were rewritten; the Gradle wrapper was regenerated from Gradle's official Apache-2.0 distribution. One Sankhya-authored file remains because the Om requires it: `apps/sankhya-addon/vc/src/main/webapp/WEB-INF/web.xml`, the Om web module descriptor (filters and servlets of the Om framework). Decide one of:

1. Obtain Sankhya's confirmation that `web.xml` may be published in a public repository, with any required notice.
2. Keep `web.xml` out of the repository and document that developers take it from the template of their Sankhya developer area.

Until this is decided, the add-on `.gitignore` excludes `web.xml`, so only IA-MNS-authored files and the official Gradle wrapper can be committed; a fresh clone then needs the template's `web.xml` to build the add-on.
**Configuration:** none.
**Verification:** The decision and any required notice are recorded here, and the committed contents of `apps/sankhya-addon` match it.
**Evidence / blocker:** Identified on 2026-10-06 while reviewing the template and narrowed the same day to `web.xml` (PJ-24). No template file has been committed; the solution `appKey` is no longer in any file Git would track.

## PH-18

- [x] **Supply the VRMaster sales reference SQL.**

**Status:** completed. **Owner:** project owner.
**Dependency / trigger:** [PJ-28](implementation-plan.md#current-work); the owner chose on 2026-10-06 to provide the reference, as for Sankhya.
**Request and reason:** Send the SQL that defines a sale in VRMaster for IA-MNS. It should make explicit: the tables and joins; the date column; the net-value expression; quantity and its unit; weight, if wanted; which stores count; how cancellations, returns and other exclusions are treated; and the product description used for search. Agents must not invent ERP business semantics; the PDT queries over `public.venda` are only a comparison point.
**Configuration:** none.
**Verification:** The SQL is received and transcribed into the VRMaster reader without changing which sales count. Its reconciliation with the real database was split into [PH-20](#ph-20) on 2026-10-07, because it needs the owner's account password.
**Evidence / blocker:** Received on 2026-10-07: the query of a PDT Connect dashboard over `venda` joined to `produto`, `loja`, the store's `fornecedor`, `produtoaliquota` for the store's state, `aliquota`, the level-1 `mercadologico`, and left joins to `centrocusto` and `comprador`, filtered by `venda.data` and a store list, with cost, tax and margin computations. The owner named the fields IA-MNS uses (`venda.id`, `id_produto`, `data`, `quantidade`, `id_loja`, `valortotal`, `produto.descricaocompleta`, `id_tipoembalagem`, `loja.descricao`) and excluded stores, cost centers, buyers, margins, costs and taxes from the scope. Transcribed the same day in `apps/api/src/features/sales/vrmaster-query.ts` with every join; every store counts ([VRMaster sales semantics](../domains/sales-chat.md#vrmaster-sales-semantics)). The supplied excerpt elided the body of its `calculos` step, which the transcription assumes derives columns only; PH-20 confirms it. Synthetic PostgreSQL tests verify the transcription's behavior, not the real figures.

## PH-19

- [ ] **Provide a dedicated read-only VRMaster PostgreSQL account for IA-MNS.**

**Status:** changed (read access verified; effective DDL restriction pending PH-30). **Owner:** project owner and VRMaster DBA.
**Dependency / trigger:** [PJ-28](implementation-plan.md#current-work); the owner chose a dedicated account on 2026-10-06. The account PDT Connect uses also runs DDL and must not be reused.
**Request and reason:** Create a login role for IA-MNS with `CONNECT` on the VRMaster database, `USAGE` on the schemas of the reference SQL and `SELECT` only on its tables, with no ownership, DDL, DML, function execution beyond what the SQL needs, or membership in broader roles. Prefer `default_transaction_read_only = on` and a statement timeout on the role. Never send the password in chat or commit it; the owner places it in the ignored root `.env.local` (development) or the secret store.
**Configuration:** `VRMASTER_DB_HOST`, `VRMASTER_DB_PORT`, `VRMASTER_DB_NAME`, `VRMASTER_DB_USER`, `VRMASTER_DB_PASSWORD` and `VRMASTER_DB_SSL_MODE` ([generated configuration reference](../generated/configuration/api.md), [setup](../setup.md#sales-chat)).
**Verification:** The owner confirms the account and its limits. Connecting with it and confirming that `SELECT` works on the reference tables while writes, DDL and other tables are refused is part of [PH-20](#ph-20), because only the owner holds the password.
**Evidence / blocker:** On 2026-10-07 the owner reported the account `ia_mns` with `CONNECT` on the VRMaster database, `USAGE` on its schema, `SELECT` only on the tables of the reference SQL (`venda`, `produto`, `loja`, `fornecedor`, `produtoaliquota`, `aliquota`, `mercadologico`, `centrocusto`, `comprador`), `default_transaction_read_only = on`, `statement_timeout = 30s` and no DDL or DML. IA-MNS has not connected with it; no password was requested or recorded. The same grants are reproduced in the adapter tests on synthetic PostgreSQL, where the transcribed SQL needs nothing more. On 2026-10-06 the VRMaster PostgreSQL port was reachable from the development machine; on 2026-10-07 the server answered the TLS request negatively ([PH-21](#ph-21)).

**Current verified limitation:** PJ-41 connected with the existing reader on 2026-10-11, verified no privileged role attributes, memberships, owned tables or writes on existing public tables, and applied PH-27. Actual database/schema CREATE and TEMP are inherited from PUBLIC. The owner explicitly requires preserving PUBLIC; PH-30 tracks coordinated restriction. The earlier owner-reported absence of DDL was not an effective-ACL verification and is superseded by this live finding.

## PH-20

- [ ] **Connect IA-MNS to the real VRMaster and reconcile the VRMaster source.**

**Status:** pending (blocks [PJ-29](implementation-plan.md#current-work)). **Owner:** project owner.
**Dependency / trigger:** [PH-18](#ph-18) and [PH-19](#ph-19); split from them on 2026-10-07. Only the owner holds the account password.
**Request and reason:** Place the `VRMASTER_DB_*` settings of the [setup](../setup.md#sales-chat) in the ignored root `.env.local` (`VRMASTER_DB_SSL_MODE=disable` while [PH-21](#ph-21) is open) and restart the API. Connected as `ia_mns`, confirm that a write and a `CREATE` are refused. Then, with the queries of [VRMaster reconciliation](vrmaster-reconciliation.md), compare for the periods and products agreed with the owner the official dashboard query run with every store against the IA-MNS reference: total value and quantity per month, per product and per packaging type, an accented product phrase and a period boundary. Finally ask IA-MNS the same questions with `Pilar da Terra (VR Master)` and `Tudo` selected. Agents never receive the password.
**Configuration:** `VRMASTER_DB_HOST`, `VRMASTER_DB_PORT`, `VRMASTER_DB_NAME`, `VRMASTER_DB_USER`, `VRMASTER_DB_PASSWORD`, `VRMASTER_DB_SSL_MODE` in the root `.env.local`.
**Verification:** Every comparison returns no difference (or each difference is explained and corrected in the reference transcription), writes and DDL are refused, and the IA-MNS answers equal the reference aggregates. Record only equal/different results and row counts, never figures, hosts or credentials, because the repository is public.
**Evidence / blocker:** Not started. The read-only queries are in [VRMaster reconciliation](vrmaster-reconciliation.md); on 2026-10-07 they ran without error on the synthetic VRMaster schema of the adapter tests, where the official and IA-MNS sales were identical. On 2026-10-11 ([PJ-35](implementation-plan.md#current-work)) IA-MNS connected to the real VRMaster as `ia_mns` with the owner's `.env.local`: `default_transaction_read_only = on`, SELECT privilege on exactly the nine reference tables. No write or `CREATE` was attempted, because the owner forbade any ERP change in that task; the sales reconciliation itself remains open.

## PH-21

- [ ] **Decide how the VRMaster connection is protected in transit.**

**Status:** pending (required before shared or production use of the VRMaster source). **Owner:** project owner and VRMaster DBA.
**Dependency / trigger:** [PJ-28](implementation-plan.md#current-work), [PJ-29](implementation-plan.md#current-work).
**Request and reason:** On 2026-10-07 the VRMaster PostgreSQL server answered the TLS request negatively, so IA-MNS can connect only with `VRMASTER_DB_SSL_MODE=disable`, which sends the `ia_mns` credentials and the sales results unencrypted on that network. Either enable TLS on the server with a certificate IA-MNS can verify (then use `verify-full`, the default), or record an explicit owner decision accepting unencrypted traffic on that network for a named environment.
**Configuration:** `VRMASTER_DB_SSL_MODE`.
**Verification:** The server accepts TLS and IA-MNS connects with `verify-full`, or the owner's dated acceptance with its scope is recorded here.
**Evidence / blocker:** Not started. The probe sent only the PostgreSQL TLS request, without credentials. Since 2026-10-11 product lookup ([PJ-35](implementation-plan.md#current-work)) uses the same connection, so product descriptions and classifications also travel unencrypted on that network until this is decided.

## PH-22

- [ ] **Confirm the reverse proxy topology and how the proxy-to-application hop is protected.**

**Status:** pending (blocks [PJ-33](implementation-plan.md#current-work) configuration and [PJ-34](implementation-plan.md#current-work)). **Owner:** infrastructure administrator with the project owner.
**Dependency / trigger:** The owner approved on 2026-10-07 a corporate TLS reverse proxy in front of IA-MNS at its public HTTPS origin; plain HTTP on the hop to the application is not assumed approved.
**Request and reason:** Confirm, keeping the concrete values with the owner and the deployment configuration, never in this public repository:

1. Where the proxy runs (the IA-MNS host or another machine) and every source address it uses towards IA-MNS, for `ORION_TRUSTED_PROXIES` and the host firewall.
2. Whether the hop stays on a private server network or must be encrypted; if encrypted, which certificate (and issuing CA) the proxy will trust for `ORION_TLS_CERT_FILE` / `ORION_TLS_KEY_FILE`.
3. That the proxy forwards every path unchanged (no prefix stripping, no cookie rewriting), appends `X-Forwarded-For`, sets `X-Forwarded-Proto: https`, sends no `X-Frame-Options` or `Content-Security-Policy` of its own (they would break `/embed/*`), does not cache `/api`, and allows a 60-second read timeout.
4. TLS, the HTTP-to-HTTPS redirect, HSTS (initial max-age and whether subdomains are included) and internal DNS for people inside the network.

**Configuration:** `ORION_TRUSTED_PROXIES`, optionally `ORION_TLS_CERT_FILE` and `ORION_TLS_KEY_FILE` ([generated configuration reference](../generated/configuration/api.md)); `IA_MNS_PUBLIC_ORIGIN`.
**Verification:** The application sees the real client address only through the listed proxy, the hop protection matches the decision, and anonymous HTTPS checks show the redirect, HSTS and per-path framing.
**Evidence / blocker:** Not started. The application side is implemented by [PJ-32](implementation-plan.md#current-work) ([ADR-0029](../adr/0029-serve-the-web-and-api-from-one-origin-behind-restricted-trusted-proxies.md)); [PJ-33](implementation-plan.md#current-work) supports both outcomes (`ORION_TRUSTED_PROXIES`, and the TLS overlay that mounts `/etc/ia-mns/tls`), and `check-config` and `status` report a plain HTTP hop and an unset trusted proxy as open production requirements.

## PH-23

- [ ] **Create a dedicated OpenAI project and key for production.**

**Status:** pending (blocks [PJ-34](implementation-plan.md#current-work)). **Owner:** project owner / OpenAI Platform administrator.
**Dependency / trigger:** Owner decision of 2026-10-07: production uses its own OpenAI project and key, never the development key of [PH-07](#ph-07).
**Request and reason:** Create the production project, its key with only the Responses capability the application uses, spending limits and the data-retention settings chosen under [PH-09](#ph-09). Place the key only in the production secret store.
**Configuration:** `OPENAI_API_KEY` (secret); optional installation default `OPENAI_MODEL`, which owners override in **Administração → Parâmetros** after evaluating a model with `pnpm eval`.
**Verification:** Presence is verified without displaying the key; a production agent turn succeeds; the development key is not present in production configuration.
**Evidence / blocker:** Not started.

## PH-24

- [ ] **Decide the remaining production operations: host port, network rules, external backup, public access, operators and alerts.**

**Status:** pending (blocks [PJ-34](implementation-plan.md#current-work); informs [PJ-33](implementation-plan.md#current-work)). **Owner:** project owner with the infrastructure administrator.
**Dependency / trigger:** Approved production plan of 2026-10-07; retention and provider data policy remain [PH-09](#ph-09).
**Request and reason:** Decide and record, without addresses or credentials in this repository:

1. Choose the host port the application is published on (only on the host's internal address, mapped to 3000 in the container) and confirm on the server that it is free.
2. Inbound rules (only the proxy reaches the application port; SSH only from administration) and outbound rules from the IA-MNS host to the Sankhya Oracle listener, the VRMaster PostgreSQL, OpenAI and PDT Connect, plus the matching allowances on those systems for the IA-MNS host.
3. The external backup destination, who holds the backup decryption key, and who runs and verifies restores.
4. Whether the public origin is reachable from the internet or only from authorized networks at the proxy.
5. The named operators with server and production database access.
6. The alert channel for an unready application, failed backups, overdue restore checks and disk usage.

**Configuration:** none in IA-MNS beyond the PJ-33 deployment settings.
**Verification:** Each decision is recorded here with its date and reflected in the PJ-33 configuration; nothing is assumed.
**Evidence / blocker:** Not started. [PJ-33](implementation-plan.md#current-work) prepared each decision as configuration: `IA_MNS_BIND_ADDRESS` and `IA_MNS_HTTP_PORT` (required, no default), `IA_MNS_BACKUP_EXTERNAL_TARGET` with `IA_MNS_BACKUP_AGE_RECIPIENT`, and `IA_MNS_ALERT_COMMAND`; `status` reports a missing external backup destination as an unmet production requirement.

## PH-25

- [ ] **Decide how the Sankhya Oracle connection is protected in transit.**

**Status:** pending (required before production use of the Sankhya source). **Owner:** project owner and ERP DBA.
**Dependency / trigger:** [PJ-34](implementation-plan.md#current-work); the equivalent decision for VRMaster is [PH-21](#ph-21).
**Request and reason:** The production IA-MNS host will read sales and, with the directory view, user names from the Sankhya Oracle database. Choose Oracle Net native encryption or TCPS that the IA-MNS Thick-mode client can use, or record an explicit owner acceptance of unencrypted traffic on a named network segment for production.
**Configuration:** `SANKHYA_DB_CONNECT_STRING` (secret); any Oracle Net client setting the decision requires belongs to the deployment, not this repository.
**Verification:** The connection is encrypted as decided, or the dated acceptance with its scope is recorded here.
**Evidence / blocker:** Not started.

## PH-26

- [ ] **Install IA-MNS on the Ubuntu host and record homologation evidence.**

**Status:** pending (blocks [PJ-34](implementation-plan.md#current-work)). **Owner:** project owner, with the infrastructure administrator for host access.
**Dependency / trigger:** [PJ-33](implementation-plan.md#current-work) (tooling ready); a merged release tagged `ia-mns-vX.Y.Z`; [PH-08](#ph-08), [PH-22](#ph-22), [PH-23](#ph-23) and [PH-24](#ph-24) for production values.
**Request and reason:** Follow the [host setup and first deployment runbook](../runbooks/production-host-setup-and-first-deployment.md) on the production host. The rehearsal proves the tooling on disposable resources only; the host's network, proxy, firewall, external systems and real configuration can only be verified there, by people with access to them. Keep the host address, domain and credentials out of this repository.
**Configuration:** the five `/etc/ia-mns/*.env` files on the host; never in this repository.
**Verification:** `ia-mns-deploy status` exits 0 on the host; the public origin serves the application through the proxy with HSTS and per-path framing; an owner signs in with a second factor; `verify-restore` succeeds; the external encrypted copy exists. Record dated, non-sensitive evidence here.
**Evidence / blocker:** Not started; nothing has been installed on the host.

## PH-27

- [x] **Grant the VRMaster reader the columns product lookup needs for status, packaging and family.**

**Status:** completed. **Owner:** project owner and VRMaster DBA.
**Dependency / trigger:** PJ-35/PJ-36; owner explicitly authorized the minimum Runtime grants in PJ-41.
**Request and reason:** Completed three column grants to existing `ia_mns`: `produtocomplemento` (id, id_produto, id_loja, id_situacaocadastro, descontinuado), `tipoembalagem` (id, descricao, descricaocompleta), and `familiaproduto` (id, descricao, id_situacaocadastro). No whole-table reads on these registrations, prices, costs, stock, writes, role changes or PUBLIC changes were granted.
**Configuration:** no credentials/settings changed for VRMaster.
**Verification:** Actual column privilege metadata, forbidden-column checks and `products:catalog`; replanning reports zero missing grants. PJ-36 must validate the three paths before exposure, independently of this completed account-access action.
**Evidence / blocker:** Applied three statements in one PostgreSQL transaction on 2026-10-11 with owner authority. [Canonical template](../../apps/api/scripts/erp-access/vrmaster-runtime.sql) and [live evidence](runtime-access-verification.md). Catalog access metadata now reflects the grants; model instructions and available product behavior are unchanged.

## PH-28

- [ ] **Confirm the business meanings product lookup could not establish from data.**

**Status:** pending (product lookup is usable; these refine it). **Owner:** project owner.
**Dependency / trigger:** [PJ-35](implementation-plan.md#current-work).
**Request and reason:** The [product lookup](../domains/product-lookup.md#limits-and-open-questions) records interpretations the data cannot decide: (1) cost centers are taken from the level-1 mercadológico section, so SECOS includes the sections named INATIVO and FEIRA INATIVO — confirm or name the sections to leave out; (2) the "fornecedor fabricante" column holds distributors and a placeholder — define what "fabricante" should mean, or keep it unavailable; (3) the operational meaning of the "pesável" flag, which fresh produce sold by KG does not carry; (4) "banana fruta" means the FLV › FRUTAS › BANANA products without chips and without raw materials — confirm this regression reference; (5) which product permissions SNK-PRD-01 or VRM-PRD-01 should be granted to the default user groups selected for PDT Connect and Sankhya (PH-13).
**Configuration:** for (5), the operational parameter of automatic grants after a catalog decision; otherwise none.
**Verification:** Each answer is recorded here with its date; the catalog, its interpretations, the regression dataset and the permission policy follow in a reviewed change.
**Evidence / blocker:** Not started.

## PH-29

- [x] **Isolate and maintain the existing ERP Administration/Discovery credentials.**

**Status:** completed. **Owner:** project owner.
**Dependency / trigger:** ADR-0033 and the owner's follow-up configuration in PJ-41.
**Request and reason:** The owner supplied both existing administrative pairs in ignored root `.env.discovery` and removed VRMaster full-access entries from `.env.local`. Both Runtime identities are separately configured as `IA_MNS_RO` / `ia_mns`. Preserve the administrative accounts and credentials; no third account or automatic rotation.
**Configuration:** Preserve all four `SANKHYA_DB_*_FULLACESS` / `VRMASTER_DB_*_FULLACESS` names. Tools prefer `.env.discovery.local` when present and otherwise read `.env.discovery`, without merging. Normal application loading never reads either file and excludes administrative keys before spawning.
**Verification:** Key presence, distinct configured Runtime identities, Git ignore and successful separately authenticated admin/Runtime connections without printing values. Credential-boundary and file-selection tests retain production refusal, missing-pair failure and no runtime fallback.
**Evidence / blocker:** Verified on 2026-10-11 with the owner-provided file. No credential value or account/password was altered; only the non-secret directory view setting was added to `.env.local`. Explicit owner authorization covered the separate provisioning tool, not ordinary Discovery. PUBLIC security remains PH-30.

## PH-30

- [ ] **Coordinate removal of inherited PostgreSQL DDL capabilities from the Runtime role.**

**Status:** pending. **Owner:** project owner and VRMaster DBA.
**Dependency / trigger:** PJ-41 live ACL audit; required before claiming effective strictly read-only Runtime access.
**Request and reason:** `ia_mns` inherits CREATE on the connected database and public schema plus TEMPORARY from PUBLIC. A direct revoke from ia_mns cannot deny that inheritance. Restricting PUBLIC affects other ERP/PDT clients and requires a coordinated review of their actual needs, explicit replacement grants and scoped owner authorization. The owner explicitly selected preserving PUBLIC and recording this dependency in the current task; do not silently revoke global access.
**Configuration:** database/schema ACLs; no credential or third-account change.
**Verification:** Inspect effective database/schema privileges, role attributes/memberships and table/column ACLs. Verify the other clients' required operations separately after an authorized coordinated change. Never probe real writes or DDL as a test.
**Evidence / blocker:** Before/after ACL inspection on 2026-10-11 confirms PUBLIC unchanged, Runtime table writes absent in public and the three CREATE/TEMP capabilities retained. `default_transaction_read_only=on`, 30-second statement limits and fixed read-only application SQL supplement controls but do not eliminate those capabilities. [Live evidence](runtime-access-verification.md).

## PH-31

- [ ] **Record corporate and legal prerequisites for additional personal-data categories and provider account claims.**

**Status:** pending, category-scoped. **Owner:** project owner and corporate privacy/legal accountable person.
**Dependency / trigger:** PJ-42 and [AI data processing](../security/ai-data-processing.md). Ordinary authorized operational sales/product analysis is allowed; only additional restricted categories remain blocked.
**Request and reason:** Confirm controller/operator roles, applicable legal basis and necessity for each additional personal-data use, LGPD transparency/rights/retention, and the applicable ANPD international-transfer mechanism. Verify actual OpenAI project sharing, contractual/DPA/subprocessor terms, retention controls and any claimed residency. The product approval alone cannot establish those legal/account facts.
**Configuration:** none changed by this task; do not claim ZDR or regional processing without account evidence.
**Verification:** Dated corporate record of the applicable category, purpose, terms and account settings; a reviewed field contract and deny-path tests before enabling it.
**Evidence / blocker:** Owner business-data scope approved on 2026-10-12. Official OpenAI data controls, LGPD and ANPD Resolution 19 checked on 2026-10-13; organization-specific contracts/settings were not inspected. Personal catalog values remain withheld from model evidence, and no individual customer/employee or sensitive-personal-data tool is exposed.

## PH-32

- [ ] **Prepare the Meta business assets for the WhatsApp channel: Business Portfolio, WhatsApp Business Account and app.**

**Status:** pending. **Owner:** project owner as Meta Business Portfolio administrator.
**Dependency / trigger:** PJ-48 (activation of the [WhatsApp channel](../domains/whatsapp-channel.md)); the implementation (PJ-47) does not depend on it and works with the local simulator.
**Request and reason:** In Meta Business Suite / Business Manager: use (or create) the MNS **Business Portfolio**, complete **business verification** with the company's legal documents (required for higher messaging limits and a verified display name), and enable two-factor authentication for its administrators. In Meta for Developers, create an app of type **Business** owned by that portfolio and add the **WhatsApp** product; this creates or connects the **WhatsApp Business Account (WABA)**. Add a payment method to the WABA (Meta charges per its current pricing; reply messages inside the 24-hour service window are what IA-MNS uses). Meta account creation, legal verification and payment cannot be automated by contributors.
**Configuration:** none in IA-MNS yet. Record, without secrets, the WhatsApp Business Account ID (later `WHATSAPP_BUSINESS_ACCOUNT_ID`) and the app ID in the owner's password vault notes.
**Verification:** Business Manager shows the portfolio as verified (or the verification request pending, with its date), the app owned by the portfolio with the WhatsApp product, and the WABA with a payment method.
**Evidence / blocker:** Requested on 2026-10-13 by the owner's WhatsApp integration request. The implementation used only synthetic Meta identifiers.

## PH-33

- [ ] **Register the dedicated corporate number on the Cloud API, with the owner present.**

**Status:** pending. **Owner:** project owner (holder of the corporate line).
**Dependency / trigger:** PH-32; blocks PJ-48. The owner asked that the definitive number never be installed or registered without them.
**Request and reason:** The number must have no WhatsApp account (it has none today) and must stay off the WhatsApp and WhatsApp Business apps afterwards. In the app's WhatsApp setup (or WhatsApp Manager → Phone numbers → Add phone number): enter the display name (it must follow Meta's display-name rules and match the business; Meta reviews it), the category and the number, then receive the **verification code by SMS or voice call** on the corporate line and confirm it. Set the number's **two-step verification PIN** and store it in the password vault. Then register the number for Cloud API use (Meta's `register` step with that PIN, done in WhatsApp Manager or by the `POST /{phone-number-id}/register` request in Meta's documentation). Until this is done, development uses the local simulator or Meta's test number from the app dashboard.
**Configuration:** the **phone number ID** shown by Meta (later `WHATSAPP_PHONE_NUMBER_ID`); not secret. The two-step PIN is a secret kept only in the vault.
**Verification:** WhatsApp Manager shows the number connected to the WABA with status _Connected_, the display name approved, and a messaging limit tier.
**Evidence / blocker:** Not started. Do not use a personal or shared number.

## PH-34

- [ ] **Issue the API credentials and configure the production webhook.**

**Status:** pending. **Owner:** project owner (Meta administrator) and the production host operator.
**Dependency / trigger:** PH-32, PH-33 and a production deployment that serves the public HTTPS origin ([PH-26](#ph-26)); blocks PJ-48.
**Request and reason:** In Business Settings → Users → **System users**, create a system user for IA-MNS (Admin only if Meta requires it for asset assignment), assign it the app and the WABA with full control of messaging, and generate a **non-expiring system-user token** with the permissions `whatsapp_business_messaging` and `whatsapp_business_management`. Read the **app secret** (App settings → Basic). Generate a random **verify token**. Place the token, app secret and verify token directly in `/etc/ia-mns/runtime.env` (never in chat, tickets or the repository) and follow the [activation runbook](../runbooks/whatsapp-channel.md#activate): configure the callback URL `https://<public origin>/api/whatsapp/webhook` with the verify token, subscribe to the **messages** field, and switch the app to **Live** mode. Webhook subscription requires the HTTPS endpoint to be reachable by Meta, which only the deployed host provides.
**Configuration:** `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (secrets), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` ([configuration reference](../generated/configuration/api.md)). The channel stays off until an owner turns on **Atendimento pelo WhatsApp** (PH-35).
**Verification:** `ia-mns-deploy check-config` passes; Meta reports the webhook verified and the log shows `whatsapp_verification_accepted`; the app is Live; a test message from an unlinked phone produces no reply.
**Evidence / blocker:** Not started.

## PH-35

- [ ] **Approve the WhatsApp processing boundary and the pilot, then link numbers and turn the channel on.**

**Status:** pending. **Owner:** project owner and the corporate privacy/legal accountable person.
**Dependency / trigger:** PH-34 and [PH-09](#ph-09) (retention); related to [PH-31](#ph-31); blocks PJ-48.
**Request and reason:** Answers with business data will transit Meta (as platform operator) and remain on the recipients' devices, outside IA-MNS control; the linked phone works as a credential without a second factor ([residual risks](../domains/whatsapp-channel.md#security-notes-and-residual-risks)). Confirm in writing that this boundary is acceptable for the current read-only sales and product capabilities, which people may use the channel and with which grants, that the provisional 30-day retention of channel metadata is acceptable until PH-09, the daily ceiling (`WHATSAPP_DAILY_LIMIT`, default 500) and the people/transparency notice required by the company's LGPD practice. Then, as owner: link the pilot numbers in **Administração → Pessoas**, set **Atendimento pelo WhatsApp** to **Ligado** in **Parâmetros**, and run the pilot checks of the runbook. Product, legal and cost acceptance cannot be decided by contributors.
**Configuration:** operational parameter `channels.whatsapp` (no secret); optionally `WHATSAPP_DAILY_LIMIT`.
**Verification:** Dated approval recorded here; the runbook's activation verification passes with a real pilot phone and is recorded in PJ-48.
**Evidence / blocker:** Not started.

## PH-36

- [x] **Authorize and apply the Runtime read of Sankhya result centers (`TSICUS`).**

**Status:** completed (Runtime access applied; owner UI acceptance remains to be exercised). **Owner:** project owner with ERP mutation authority.
**Dependency / trigger:** [PJ-54](implementation-plan.md#current-work); before an owner restricts Sankhya sales by result center (CR).
**Request and reason:** The sales restriction by _centro de resultado_ filters `TGFCAB.CODCENCUS`, which the reader already reads, but listing the centers for owners and including the centers below a selected one need `SELECT` on `TSICUS` (`CODCENCUS`, `DESCRCENCUS`, `CODCENCUSPAI`, `GRAU`, `ANALITICO`, `ATIVO`). The reviewed [Sankhya template](../../apps/api/scripts/erp-access/sankhya-runtime.sql) now adds one `SELECT` grant and one private synonym for `IA_MNS_RO`; read-only Discovery confirmed the table and its 145 centers. Applying it is an ERP privilege change, which Discovery authority does not cover ([ERP database access](../security/erp-database-access.md)). Before application, searching or granting CR values answered `IDENTITY_RESTRICTION_UNAVAILABLE` and no CR restriction could exist.
**Configuration:** none beyond the template; run `pnpm -C apps/api erp:runtime:access` to see the plan and `--apply` only with explicit authorization.
**Verification:** The planner reports zero missing statements; an owner searches result centers in **Administração → Permissões → SNK-VEN-01 → Conceder com restrições**, and a restricted sales answer cites the center.
**Evidence / blocker:** Prepared on 2026-10-20; explicitly authorized and applied on 2026-10-29. Exactly the SELECT and private synonym were missing; both were applied, all six required columns passed a zero-row Runtime read and replanning both ERPs reported zero missing statements. [Post-release verification](runtime-access-verification.md#post-release-access-verification-on-2026-10-29) records adapter/product/ACL results and limits. Owner retesting of the reported server product failure and the CR UI remains separate; this access change is not proof of that failure's cause.

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
