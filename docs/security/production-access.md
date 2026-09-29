# Production Access

This policy owns privileged operational access. [Authentication](authentication.md), [authorization](authorization.md), [secrets](secrets-management.md), and [classification](data-classification.md) supply the underlying controls. [Incident response](incident-response.md) and [runbooks](../runbooks/README.md) do not expand anyone's authority.

## Scope and current availability

Production is a separate trust boundary from local development, CI, tests, staging, and previews. Routine development and maintenance should work through local/synthetic environments and sanitized observability without broad production access. Human access requires an operational purpose and the minimum capability for the necessary time.

Provider IAM, concrete operational roles, just-in-time access, approval/break-glass workflows, bastions/private networking, device trust, and session recording remain deployment-specific decisions. [ADR-0011](../adr/0011-establish-continuous-integration-dependency-automation-and-supply-chain-security-strategy.md) governs accepted CI/supply-chain direction; it does not mean production access tooling is deployed. Do not invent provider commands or begin deployment work to complete this policy.

## Identities, privilege, and access request

Use attributable identities and distinguish humans from service, CI, and deployment actors. Shared human accounts and borrowing an automation identity undermine audit/revocation and should be avoided. Match authentication strength and any recent/step-up requirement to risk. Named cloud-console access must use narrow roles; provider root/owner accounts are break-glass capabilities, not routine accounts.

Separate observation, data read/write, deployment, infrastructure, IAM/security administration, and secret administration where practical. An actor who grants privileges need not hold every resource permission. Deploying must not imply viewing raw credentials. Prefer delegated use, workload identity, temporary credentials, or controlled tooling over secret disclosure. Scope by system, resource, operation, environment, time, and classification; add region/tenant scope only where needed.

An access request should identify actor, task/reason, target environment/resource, minimum capability, duration, related incident/work item, data classification, and whether safer telemetry/read-only tools suffice. Temporary access should expire automatically where supported; standing privilege needs operational justification, narrow scope, and review. Bounded sessions/idle timeouts reduce unattended access risk; concurrency/device/session-recording controls are requirement-driven, not mandated products.

## Approval

Higher-risk capabilities may require stronger approval according to privilege, destructiveness, classification, and urgency. Read-only diagnostics and unrestricted administration do not need identical workflows. Avoid unrestricted self-approval for high-risk access where separation is practical; small teams may combine requester/approver/responder with compensating auditability, time limits, and controls.

Honor explicit delegated authority and the actual operational approval mechanism. A runbook, repository access, or technical ability is not authorization. Security-sensitive access must fail closed if permission cannot be established; access-system outage does not justify an implicit bypass.

## Break-glass access

Use break-glass only for genuine emergencies when normal mechanisms are unavailable or insufficient. Additional normal workflow steps are not an emergency. Protect emergency identities/credentials according to the selected architecture and [secrets policy](secrets-management.md); ordinary notes, chat, Git, or unapproved stores are not acceptable credential locations.

Grant only necessary privilege, make use visible promptly to appropriate operators where practical, preserve attribution/audit, limit duration, revoke afterward, and review every use. Record why it was needed, why normal access failed, scope/owner, affected credentials, notifications, and improvements. Offline emergency access requires an explicit strongly controlled design; do not fabricate one in an incident.

## Investigation and operational tools

Prefer metrics, logs, traces, error reports, safe diagnostics, and scoped read-only inspection before shells, writes, secret reveal, or administrators. Read-only still exposes confidential data and can exhaust CPU, memory, I/O, locks, or connections. Query tooling should enforce bounded results/timeouts, safe exports, and appropriate audit. Masked/field-limited views can reduce exposure; masking does not automatically declassify data. Sensitive search inputs must not be logged indiscriminately.

Purpose-built tools should expose only required capabilities, such as safe status inspection or a bounded repair. Admin APIs require strong authentication, authorization, validation, bounds, and audit even on internal networks. Internal placement is defense in depth, not authority. Prefer reviewed repository-controlled infrastructure/configuration and deployment automation where they exist. Emergency manual changes must be reconciled back into the repository afterward.

Shell/container/filesystem access can expose mounted credentials, private data, and network capabilities; do not enable SSH out of habit or make it the first debugging step. Remote debuggers can pause or mutate production and expose memory; require explicit operational justification. Profilers need low-overhead design and access control. Memory/core dumps are highly sensitive artifacts and need reviewed, restricted handling.

## Manual data changes

Direct production writes bypass validation, domain rules, authorization, audit, and delivery behavior. Prefer application-aware admin operations, reviewed repair scripts, controlled migrations, or reconciliation. Separate runtime, migration, human-read, and administrative database identities; elevated migration credentials must not become normal runtime credentials.

A repair must identify the violated invariant, affected records, desired canonical state, why ordinary workflow is insufficient, required side effects, concurrency handling, idempotency, verification, failure handling, and real rollback or forward recovery. Significant/reusable scripts should live in the repository for review/testing; retain the exact significant one-off procedure in an appropriate script, incident record, migration, or runbook. Repair tooling must not become a permanent unrestricted admin interface.

## Destructive operations

Deletes, drops, truncation, queue purges, broad revocation, signing-key changes, and restores need authorization/confirmation proportionate to their concrete risk. Confirmation does not replace permission or review. Make the environment obvious and require explicit production selection; production must never be an implicit destructive-tooling default. Prefer read-only, dry-run, non-production, and bounded scope where practical.

Meaningful dry runs should show affected scope, planned changes, and validation errors without mutation, but cannot guarantee unchanged concurrent state at execution. Batch operations need bounds, progress, pause/resume where supported, failure handling, and safe retry. Resolve uncertain outcomes by inspecting state. Verify actual final conditions and document when rollback is impossible or unsafe, with a forward-recovery path.

Backups, replicas, analytics, search, caches, and queues remain production data. Restore can overwrite state and requires explicit authorization, compatibility checks, and [retention/deletion reconciliation](data-retention.md#backups-restore-and-deletion-replay). Avoid backup downloads to personal machines. Message replay must account for duplicates, stale data, current authorization, idempotency, and provider effects; blindly releasing a backlog can cause another incident.

## Data extraction, support, and AI-executed production changes

Support should use specialized limited capabilities, not general database/secret access. Impersonation must retain the real/effective actor, reason, duration, and audit record. Configuration and feature-flag changes are production mutations; security, billing, deletion, or critical-workflow flags may need stronger controls.

Authorize exports explicitly and minimize secure storage/delivery. Production dumps are not default local-development inputs. Screenshots, query results, diagnostic bundles, crash dumps, clipboard, chat, issues, and AI prompts create copies: use safe references or sanitized/synthetic representations. Any unavoidable local artifact needs limited scope, controlled storage, and explicit deletion under [retention policy](data-retention.md).

AI access requires explicit delegated capability, least privilege, sanitized data, and attributable action where supported. Preserve human principal, agent identity, delegation, and operation. Correct code generation does not grant autonomous production write authority or a broad long-lived credential. Mutations require the same review, scope, preconditions, side-effect, retry, recovery, verification, and audit controls as human actions. Destructive actions require appropriate explicit human authorization under actual tooling; ambiguous context is not approval. Prefer integrations that keep raw secrets outside agent context.

Automation may act within explicitly authorized bounds when preconditions, safe failure behavior, and audit exist. It reduces repetitive risk rather than bypassing controls. Do not infer that temporary access should be removed solely because one command ended; follow its explicit grant/expiration lifecycle.

## Audit, revocation, and incident handling

Record who did what, to which resource, when, through which capability, and with what outcome without secrets. Audit access requests/approvals/grants/expiry/revocation and break-glass where supported. Significant manual changes should link to an appropriate incident, work item, change record, or PR. Audit integrity/retention must not depend on sampled debug logs. Session recordings themselves need classification, access, and retention controls.

Access must follow joiner/mover/leaver responsibilities, and support prompt revocation for compromise or role changes where practical. Groups should represent real duties; temporary groups should expire. Review whether standing permissions remain needed, not merely whether once approved. Monitor failed privileged access or unexpected escalation proportionately; routine authorized reads/accidental denials need not notify everyone.

Incident urgency may justify scoped temporary elevation and shortened normal timing, but preserves identity, auditability, safety, and post-change reconciliation. [Incident response](incident-response.md) governs suspected misuse, evidence, session/credential revocation, and recovery. Emergency privileges and temporary artifacts must not become permanent through neglect.

## Review checklist

For a role/tool/procedure, document real responsibility, owner, permitted/prohibited actions, scope/classification, human or machine identity, standing-versus-temporary justification, audit, expiration/revocation, and available safer paths. For production mutations, include preview, concurrency, side effects, idempotency, recovery, and verification. Add real provider-specific instructions only once infrastructure exists; policies and examples must never be mistaken for implemented access mechanisms.
