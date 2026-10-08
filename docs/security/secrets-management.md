# Secrets Management

Secrets grant capabilities and are `RESTRICTED`, not ordinary configuration. This policy owns their creation, storage, delivery, rotation, revocation, and removal. [Classification](data-classification.md), [redaction](telemetry-redaction.md), [authentication](authentication.md), and [production access](production-access.md) govern related controls.

## Current implementation and scope

Canonical configuration schemas and generated metadata exist under [configuration policy](../architecture/configuration.md) and [ADR-0007](../adr/0007-establish-api-contract-openapi-sdk-and-configuration-schema-strategy.md). [Setup](../setup.md) documents current local environment loading. [ADR-0011](../adr/0011-establish-continuous-integration-dependency-automation-and-supply-chain-security-strategy.md), [CI policy](../architecture/continuous-integration.md), and [validation](../validation.md) identify configured secret-scanning checks and their availability.

IA-MNS production keeps secrets in root-only files under `/etc/ia-mns` on its single host, one file per consumer, delivered to each container as its own environment file and never as command arguments; `ia-mns-deploy init-secrets` generates database passwords and identity keys without displaying them, and `check-config` refuses a runtime file that holds the migration or administrator credential ([ADR-0031](../adr/0031-deploy-on-one-ubuntu-host-with-docker-compose-and-a-release-tool.md), [rotation runbook](../runbooks/production-secret-rotation.md)). This is a single-host store with recorded limits, not a secret-management platform; none is selected. Requirements below govern its operation and any future platform without authorizing access. Do not describe current configuration generation or CI scanning as merely hypothetical, or claim that artifact/history scanning is complete without evidence.

## Ownership and scope

Every important secret needs an owner, issuing system/source, purpose/capability, consumers, environment, privileges, rotation/revocation method, compromise impact, and deletion condition. Secret inventory/documentation contains metadata and references only, never values. Names should communicate purpose and ownership without sensitive contents; names can themselves be internal information. Public keys, client IDs, and publishable provider keys must be distinguished by their actual capability, not terminology alone.

Scope credentials by application, environment, and capability. Separate runtime from migration, database-owner, backup, analytics, and administrative identities when their responsibilities differ. Human, service, CI, and deployment actors should be distinguishable. Prefer attributable workload/short-lived identities over broadly shared static secrets where infrastructure supports them. Shared development credentials, when necessary, need limited scope, ownership, and rotation and must never be reused for production.

## Secret storage

Use established credential stores, secret managers, approved CI stores, or workload-identity facilities appropriate to the environment. Arbitrary plaintext files are not an acceptable long-term production store. Do not build a general-purpose secret manager or custom cryptographic storage without extraordinary justification. If operating encrypted storage, do not store its encryption key alongside the encrypted secrets. Protect secret-manager administration more strongly than ordinary application credentials.

Never intentionally commit secrets into any Git file, commit, branch, tag, fixture, example, generated artifact, or documentation. A private repository is not a secret store. Ignore files reduce accidents but are not the security boundary. Templates use obvious placeholders and describe where values come from. Local credential files required for tooling must stay outside source control, use restrictive permissions and environment-appropriate credentials, and be documented; prefer a secure local store where practical.

Routine local development must work without production credentials. Use local/sandbox services, synthetic credentials, or development identities. Environment variables can deliver secrets but are not a management system: process inspection, child processes, dumps, and CI can expose them. Never dump complete environments/configuration. Avoid raw secrets in command arguments, shell history, and routine clipboard workflows; minimize manual handling.

## Client applications and build boundaries

Anything delivered to browser, mobile, or desktop users can be inspected despite compilation, minification, obfuscation, packaging, or signing. Never embed server database credentials, private provider keys, signing keys, or backend tokens. User-specific credentials may exist in clients only according to [authentication storage policy](authentication.md#sessions). Clearly classify intentionally publishable provider values.

Scope CI secrets to required jobs and workflow trust. Contributed or forked code must not automatically receive privileged credentials. A test job must not inherit production deployment authority. Build secrets must not remain in binaries, source maps, generated code, package metadata, container layers/history, or build context. Supply runtime credentials through approved mechanisms; infrastructure definitions should reference secrets, not contain or print values. Review images/artifacts where tooling exists; do not assume source scanning covers them.

## Delivery, initialization, and failure

Acquire credentials near trusted application composition and inject only what each infrastructure adapter needs. Domain code should not fetch arbitrary environment/secret values. Avoid global unrestricted helpers and passing full secret-bearing configuration objects. Use established cryptographically secure generation with adequate entropy; distinct signing/encryption/authentication purposes should normally use separate keys. Password storage follows [authentication](authentication.md#password-storage).

Validate required secret availability and safe structural format during initialization; diagnostics may name a missing configuration key but never show its value. Fail startup, remain unready, or explicitly degrade only the affected optional capability according to the runtime design. A required secret must not silently become optional. Reject insecure fallback/default/placeholder credentials in production; isolated synthetic development defaults must not become production behavior.

Specify retrieval, caching, renewal, and provider-outage behavior. In-memory caching must respect rotation, revocation, lifetime, and memory exposure. Choose restart, periodic/event refresh, or dynamic credentials deliberately; avoid unnecessary per-operation dependence on a secret service. Existing processes may continue with still-valid cached credentials while new processes cannot start, but this behavior must be explicit and observable without secret values. Expiration needs reliable renewal rather than predictable outages.

## Secret rotation

Important secrets must be rotatable, and revocable where supported. Define who rotates, how a new credential is distributed, how consumers are verified, and how the old credential is revoked. Scheduled, provider-, personnel-, policy-, and incident-driven rotation have different triggers; do not invent a universal cadence.

Where supported, create the new credential, update consumers, verify use, then revoke the previous credential with a bounded overlap. A replacement alone does not neutralize a still-valid compromised value. Exposure or suspected compromise requires prompt rotation/revocation according to capability and impact. Webhook secrets need environment isolation, protocol-correct secure comparison, and rotation as well.

Keep code deployment and credential rotation separable where practical. Account for multi-version rollout, credential-format changes, and rollback compatibility: an old binary may fail after its credential is revoked. Automated rotation must preserve authorization, auditability, safe rollout/recovery, and retirement of prior credentials without creating unmanaged copies. Exercise critical rotation and recovery in suitable non-production environments before emergencies where practical.

Recovery must address lost credentials/store access, incorrect rotation, provider failure, deleted credentials, or compromised administrators without creating permanent weaker backdoors. [Production access](production-access.md) governs time-limited, exceptional break-glass access. Separation of creation/access/rotation/approval duties should match actual risk and organizational maturity.

## Use, diagnostics, and backups

Do not serialize secret-bearing objects into logs, traces, metrics, errors, breadcrumbs, audit, profiling, caches, or responses. Review provider exceptions and automatic SDK capture of headers, locals, environment, configuration, and requests. Dedicated secret wrappers may help when practical, but their default string/serialization representation must not reveal values. [Redaction policy](telemetry-redaction.md) remains authoritative.

Production debugger access is privileged. Full memory dumps are restricted artifacts needing exceptional justified collection and tightly controlled access. Support tools must not expose secrets or inherit infrastructure credentials. Administrative UIs should show configured state or rotation metadata; generated credentials may use one-time display when necessary instead of repeated retrieval.

Secret-store backups require equivalent or stronger controls. Application backups must not accidentally include secret files; database backups containing hashes, sessions, or provider tokens retain their classification. [Retention](data-retention.md) governs their lifecycle.

## Accidental source-control exposure

Treat a committed or otherwise disclosed credential as potentially compromised, even in a private repository. Identify it without redisplaying it, revoke/rotate, stop future exposure, assess copies/history/destinations and access, investigate use as needed, and add prevention. History rewriting or deleting a file/log can reduce continued exposure but never restores secrecy.

For telemetry exposure, stop collection, identify affected logs/traces/errors/exports/backups/providers, remove stored copies where possible, review access, and add regression coverage. Follow [incident response](incident-response.md); do not wait for natural retention expiry. Ordinary chats, issues, pull requests, reviews, AI prompts, and support tickets are not secret-delivery channels; any exception requires an explicitly approved secure workflow.

AI repository access does not imply raw credential access. Prefer names, schemas, safe errors, and sanitized evidence. When authorized operational actions require credentials, prefer delegated secure tools that keep values outside agent context. Human operators likewise should receive authorized capabilities under their own identity without routinely retrieving long-lived production secrets.

## Removal, audit, and enforcement

When a secret is retired, remove usage and deployment references, verify active consumers, revoke, delete from the store, and update access permissions and documentation. Investigate orphaned credentials rather than retaining unknown capabilities indefinitely. Audit creation, access, permission changes, rotation, revocation, and deletion where supported without recording values.

Use available secret scanning and consider historical scans because working-tree checks cannot see all exposure. Keep false-positive exceptions narrow and documented; do not disable scanning broadly. Configuration metadata, client/server boundaries, redaction tests, unsafe-default checks, and artifact inspection complement scanning. Credential-handling SDKs and cryptographic dependencies warrant extra scrutiny. Choose any future secret provider through an ADR considering security, availability, audit/access, rotation, platform integration, developer experience, cost, and migration.

## New secret checklist

Before introduction, identify the capability, why a secret is needed instead of workload identity, owner, source, consumers/environment, least privilege, storage/delivery, rotation/revocation, exposure detection, possible telemetry/build/client paths, and eventual removal. Record metadata through canonical configuration sources where practical. A credential without an owner and workable lifecycle is an incomplete design.
