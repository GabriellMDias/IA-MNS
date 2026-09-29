# Data Classification

This policy owns Orion's sensitivity model and data-handling baseline. [Redaction](telemetry-redaction.md), [retention](data-retention.md), [secrets management](secrets-management.md), and [production access](production-access.md) own their detailed controls. Classification follows data meaning and disclosure risk, not whether a tool can technically access it.

## Classification levels

| Level | Meaning and examples | Required handling |
| --- | --- | --- |
| `PUBLIC` | Intentionally approved for unrestricted disclosure: published documentation or product content | May be shared/indexed/cached; preserve integrity. Absence of secrets does not make data public. |
| `INTERNAL` | Non-public, lower-risk project/operational information | Available to authorized contributors and approved tooling; review before publication. |
| `CONFIDENTIAL` | Disclosure may cause privacy, security, business, or operational harm: personal/private customer data, private content, incident details | Need-to-know access, protected transport, appropriate storage encryption, minimized telemetry/copies, and defined retention. |
| `RESTRICTED` | Highest sensitivity: credentials, password hashes, private keys, payment credentials, highly sensitive personal data | Strict least privilege and purpose-built protection; no intentional inclusion in source control, telemetry, public errors, generated documentation, screenshots/support artifacts, or real-data test fixtures. |

These are minimum protections. Use the more restrictive reasonable level when semantics or ownership are unclear, particularly for legacy fields, provider payloads, uploads, and free-form metadata. Encryption does not reduce classification.

## Data categories

Category describes what data represents; classification describes required protection. Classify fields by meaning rather than assigning one level blindly to an entire table.

| Category | Baseline and important distinctions |
| --- | --- |
| Personal data | Normally at least `CONFIDENTIAL` unless intentionally and lawfully public. Includes linked account/device/IP/location information, not just names and email. |
| Sensitive personal data | Normally `RESTRICTED` or equivalent specialized controls. Health, biometrics, government identifiers, and other sensitive characteristics require evaluation against actual jurisdiction/product requirements. |
| Authentication | Passwords, hashes, bearer/session/refresh tokens, recovery codes, and private API keys are `RESTRICTED`; non-credential metadata can differ. Public keys/client identifiers are classified by capability, not the word “key.” |
| Authorization | Assignments, memberships, and ownership are generally `CONFIDENTIAL`; policy definitions may be internal or confidential according to risk. |
| Financial/payment | Financial records are generally at least `CONFIDENTIAL`; payment and banking credentials are `RESTRICTED`. Prefer specialized providers retaining sensitive payment credentials. |
| User content/files | Normally `CONFIDENTIAL` unless intentionally public; arbitrary content can contain restricted data. File type does not prove safety. Preview, scanning, indexing, and AI processing inherit the content's constraints. |
| Business/security/operations | Non-public business information is generally confidential. Infrastructure topology, unresolved vulnerabilities, investigations, and configuration require content-specific classification. |
| Telemetry/derived data | Inherits sensitivity of included information and inferences. A log is not automatically internal, and aggregation can increase sensitivity. |

Opaque actor/resource/tenant IDs may be used in controlled telemetry when necessary but can remain confidential if linked to private data. Generate request/trace/error/job correlation IDs without sensitive information; safe correlation IDs may be shown as support references. Do not treat all identifiers as interchangeable.

## Collection, ownership, and copies

Collect only data with a concrete product, operational, security, or legal purpose. Identify the owner of semantics, schema changes, access, retention, and incident response. Before adding a field, determine purpose, sensitivity, consumers, storage duration, telemetry eligibility, compliance implications, and whether a less sensitive representation suffices. A new use of existing data needs deliberate review.

Every copy retains its handling obligations: database dumps, exports, caches, search indexes, warehouse/analytics records, backups, generated artifacts, screenshots, chat messages, support evidence, and AI prompts. Derived profiles, risk scores, embeddings, or aggregated behavior may remain identifying. Pseudonymization and hashing do not automatically anonymize data; predictable identifiers can be enumerated. Anonymity requires that re-identification is not reasonably possible in context. Partial masking may be useful for permitted non-secret data; remove authentication secrets entirely.

Temporary storage still needs bounded access and deletion. Do not let downloaded logs, exports, local databases, scratch files, or tool caches become indefinite uncontrolled copies. Soft deletion retains data and is not a substitute for actual removal. [Retention policy](data-retention.md) covers deletion propagation and backup restoration; understand real capability before making external deletion promises.

## Access, storage, and transport

Apply least privilege to users, services, support, administrators, CI, and AI agents. Technical availability is not authorization. Routine development must not depend on unrestricted production database access. Encryption supplements access control; confidential/restricted data crossing untrusted networks must use protected transport without silent downgrade.

Choose storage, backup, device, and any field-level encryption against the threat model. Application-level encryption is justified only by meaningful added protection and must account for key rotation, search limitations, migration, recovery, and operations; significant strategy requires an ADR. Minimize sensitive local client data and use platform-protected storage for credentials as required by [authentication policy](authentication.md).

Authorize exports, minimize fields, use secure delivery, avoid unnecessary persistence, and audit where appropriate. Bulk access deserves additional scrutiny. Support access does not imply unrestricted customer/telemetry access. Email is not a safe channel for arbitrary restricted data; minimize transactional email and prefer authenticated flows where appropriate. Notifications can appear on lock screens/shared devices and must not disclose highly sensitive content without an explicit design.

## APIs, providers, and generated artifacts

Use deliberate request/response/event schemas. Do not serialize whole entities, publish complete provider payloads, or forward arbitrary JSON merely for convenience. Known important data should use explicit schemas; generic metadata needs conservative controls before logging, indexing, tracing, or provider transmission. Generated SDKs must contain only supported client contracts, never server-only restricted fields.

External providers create data-processing boundaries. Before transmission, determine required fields and purpose, security, access, retention/deletion, residency, and relevant subprocessors. Send only the needed subset. Apply this to analytics, search, webhooks, error reporting, file processing, and AI providers. A warehouse or cache does not reduce sensitivity or remove authorization requirements.

Schema comments and documentation describe semantics with fictional examples, not real customer records, credentials, production identifiers, or infrastructure addresses. Generated artifacts inherit source classification; inspect generators for unintended exposure. Configuration templates use placeholders and document the source of a value, not its secret contents. Environment variables are not automatically secure: never dump them into startup logs, build output, diagnostics, or telemetry.

## Telemetry and AI access

[Telemetry redaction](telemetry-redaction.md) governs collection: public/internal fields may be captured when useful, confidential fields only with justified minimized controls, and restricted data never intentionally. Review SDK defaults, including locals, breadcrumbs, requests, and context. Metrics should remain aggregate and avoid personal/entity-specific dimensions. Audit records have distinct integrity/access/retention requirements but must still omit credentials and unnecessary payloads.

AI tooling follows the same classification and authorization boundaries as other consumers. Approved project agents may use authorized internal repository context. Confidential data requires an authorized task and an environment approved for that data; minimize context. Restricted data must not be supplied by default: any exceptional interaction requires an explicitly designed, approved workflow with suitable controls, never incidental exposure through environment dumps or logs.

Prefer investigation through a safe error ID, sanitized metadata, traces, redacted logs, and relevant source rather than customer records and raw requests. Screenshots, replay, and diagnostic attachments are separate collection capabilities, not automatic debugging entitlements.

## Development, testing, and exposure

Use synthetic or purpose-created development, test, seed, demo, and documentation data. Tests must not contain real credentials or customer records; synthetic secrets must be clearly non-production and incapable of granting real access. Production data must not be copied to development/test by default. A justified exception should prefer synthetic reproduction, minimal extraction, redaction, or appropriately anonymized/pseudonymized data before raw copies.

CI secrets must be scoped to jobs that need them; less-trusted pull requests must not receive privileged credentials. Never commit restricted secrets, including into Git history. If a credential is exposed, deleting the current file or log does not restore secrecy: treat it as potentially compromised and follow [secrets management](secrets-management.md) and [incident response](incident-response.md) for containment, revocation/rotation, usage review, and recurrence prevention. Evaluate confidential-data exposure by scope, subjects, access, duration, and applicable notification obligations.

## Classification review and enforcement

Review classification when field meaning, boundaries, providers, telemetry, AI access, or retention changes. New restricted/personal-data collection, bulk exports, credentials, encryption strategies, or production access paths warrant security review. Use clear sensitive-field names and keep classification near canonical schema/configuration metadata where practical; [schema documentation](../database/schema-documentation.md) and [configuration](../architecture/configuration.md) describe current metadata sources.

Mechanical checks can extend protection against unsafe serialization, telemetry, generated output, secret imports, and production fixtures, but metadata is not evidence of end-to-end enforcement. Consult [validation](../validation.md) for available checks. Do not claim a universal classification/redaction engine exists or create speculative registries before their consumers and ownership are clear.
