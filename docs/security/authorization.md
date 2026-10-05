# Authorization

This policy owns permission decisions for application actors. [Authentication](authentication.md) establishes trusted identity; [production access](production-access.md) governs operational capabilities. Use the [task index](../README.md) for related API, database, and security policy.

## Current implementation and ownership

In IA-MNS, the identity module computes each Person's effective permissions from explicit owner grants of a composed catalog, a provider policy that may grant only read capabilities to Persons with an active link, and the internal `owner` role; it issues them as access-token scopes ([identity](../domains/identity.md#authorization), [ADR-0022](../adr/0022-own-the-ia-mns-identity-with-verified-external-links.md)). Modules still decide what each scope permits. Each module owns its concrete authorization policy in its domain rules, enforced by its application operations and scoped database queries; [Orion's reference implementation](../project-derivation.md#orions-reference-implementation) shows owner/reviewer rules this way. This is not a repository-wide role engine or multi-tenant implementation.

Protected operations must have an identifiable policy owner. Keep business-security meaning near the owning domain; common infrastructure may provide evaluation, principal types, lookup, denial semantics, and audit hooks without becoming a central switch over all domain rules. Introduce shared abstractions, a permission registry, RBAC, ABAC, ReBAC, or row-level security only when actual requirements justify them. Significant choices need an ADR.

## Default deny

Authorization asks whether this actor may perform this operation on this resource in this context. Fail closed when permission cannot be established; security-sensitive ambiguity must not broaden access. Use verified principals and trusted resource state, not client-provided roles, user IDs, ownership, tenant IDs, or capability hints.

Public operations must be intentionally public and represent anonymous actors explicitly. Authentication does not grant permission. Resource identifier possession, unpredictable IDs, hidden endpoints, feature flags, and UI visibility are not authorization controls. Feature availability, subscriptions/entitlements, and security authorization have distinct meanings even when all constrain an operation.

## Trusted enforcement boundary

Enforce authorization in trusted backend application, worker, or service code before side effects, unless an atomic architecture requires a combined decision. Every entry point to a protected operation must receive equivalent enforcement. Transport checks, authoritative application policy, and database isolation may coexist when their responsibilities differ; do not independently reimplement a rule in several layers or clients.

Clients may hide/disable actions and display safe capability hints for usability. The backend must evaluate each requested operation independently. Distinguish permission from domain validity: an actor may be permitted to cancel a resource whose current state prevents cancellation. Order checks deliberately to avoid revealing protected existence; a safe not-found result may be appropriate instead of a permission denial.

Pass minimal explicit actor, operation, resource, and relevant context into policy evaluation. Prefer predictable decisions without hidden global state or business side effects. Controlled audit/telemetry is acceptable; checking permission must not modify resources, send email, or charge payments. Load policy state explicitly and efficiently, including bulk evaluation where needed to avoid authorization N+1 queries.

## Roles, permissions, and privileged actors

Permissions represent stable business capabilities and explicit scope, not button/controller names or undocumented strings. Roles group meaningful responsibilities and must define granted permissions, scope, and who may assign them. Avoid scattered hardcoded role checks, vague global administrator shortcuts, excessive granularity, and deep/cyclic inheritance. A maintainer should be able to explain why access was granted.

Prefer narrow administrative roles when responsibilities differ. Support access must not automatically grant infrastructure, deployment, database, or secret administration. An unrestricted superuser, if required, needs strict assignment, strong authentication, auditability, limited use, and clear ownership. Impersonation must be explicit, visible, limited, and preserve both real and effective actors in audit evidence. Authorized operation of a system does not automatically authorize reading its raw secrets.

Machine, CI, integration, and AI actors need scoped capabilities, not implicit trust. Scope by service, environment, and operation where relevant. Test automation must not inherit production deployment or administration permissions. An agent's repository knowledge does not enlarge its delegated authority; repository edits, telemetry, deployment, infrastructure, and production access remain separate capabilities.

## Multi-tenant authorization

When multi-tenancy is introduced, enforce isolation explicitly. Validate requested tenant context against verified membership and target resource scope. Tenant switching is a request, not proof of membership. Matching tenant identifiers may be necessary without being sufficient. Cross-tenant access is denied by default; exceptions need explicit narrow policy.

Tenant-aware queries or database protections can add defense in depth, but they do not replace discoverable application semantics. Document and test row-level security if adopted. Model ownership and relationships explicitly rather than inferring them from unrelated fields. Use role, relationship, or attribute models only where they match domain needs.

## Reads, collections, and data exposure

Reads require authorization as well as writes. Apply it to details, lists, search, counts, aggregates, exports, and protected fields. Knowing a resource ID never proves access. Scope queries to authorized data where practical; do not load broad sensitive datasets and rely on client filtering. Use deliberate response schemas instead of serializing whole entities.

Bulk export or mutation may require stronger capability than operating on one item. Consider inference through counts, suggestions, existence checks, and error differences. Classification informs access requirements: confidential exports may need stronger policy, and restricted data access must be rare and explicit.

Caches must preserve actor/tenant/permission isolation, including response variations and HTTP/CDN policy. Protected responses must not become publicly cacheable. Field-level policy and trusted permission-introspection tools require their own justified scope and access control.

## Freshness, asynchronous work, and integrity

Define acceptable permission freshness before caching decisions or putting roles/permissions in tokens. Revocation, membership removal, and role changes must take effect within the required interval; old claims must not remain trusted indefinitely. Sensitive capabilities may require near-immediate revocation, fresh server lookup, stronger/recent authentication, or an explicit hybrid design. Temporary/delegated permissions must expire and fail closed.

For user-triggered jobs, specify whether authorization is checked at creation, execution, or both, and what happens if permission changes before execution. Workers acting as system and workers acting on behalf of users have different authority. Event consumers do not automatically inherit producer permissions; actor metadata is not an authorization bypass.

Authorization state is security-sensitive and generally at least `CONFIDENTIAL`. Preserve integrity through explicit update contracts, constraints, and transactions where appropriate. Users must not assign themselves privileges beyond their authority. Generic mass assignment must not expose role, permission, membership, or other privileged fields. Prevent both vertical escalation and access to another actor's equivalent resources.

Role/permission changes require security review, tests, and documentation. Identify persisted assignments and consumers before renaming/removing permissions or expanding roles. A persisted permission rename is a compatibility/data migration, not cosmetic editing. Transactional changes must avoid unintended intermediate access states and preserve required audit evidence.

## Errors and audit

Follow the [error contract](../api/error-contract.md) and [error-handling policy](../architecture/error-handling.md). Public denials must not expose protected resource, tenant, or policy details. Safe internal reason categories can differ from public API codes. Record only justified actor/resource identifiers and allowlisted metadata, never entire principal/resource objects.

Audit sensitive assignment changes, administrative actions, exports, impersonation, and security configuration as required. Do not log every successful check by default. Distinguish normal denials from suspicious enumeration, cross-tenant probes, or repeated privileged access attempts; security monitoring should match real requirements. [Redaction](telemetry-redaction.md) and [retention](data-retention.md) apply to diagnostics and audit records.

## Authorization testing

Both allow and deny paths must be tested. Include applicable anonymous, wrong-owner, wrong-tenant, insufficient-permission, expired-delegation, changed-permission, insufficient-assurance, and privileged-field cases. Test horizontal/vertical escalation, collection filtering, API enforcement despite modified clients, and relevant asynchronous timing. Add regression tests for authorization security bugs; property-based invariants can help when policy complexity justifies them.

Use reusable synthetic principal helpers and realistic development identities while testing ordinary and denied access. Do not disable authorization globally. Any test/development bypass must be isolated, explicitly tested, and impossible to enable accidentally in production.

## New authorization policy checklist

For a new or changed policy, identify:

1. Protected operation, owner, actor types, resource, trusted inputs, existing equivalent permissions, and scope.
2. Ownership/tenant/state/assurance requirements, role assignment authority, freshness/revocation, delegation, and denied-information exposure.
3. Confidential/restricted data impact, required audit evidence, allow/deny tests, and compatibility effects on existing actors and consumers.

Document meaning near the policy and derive references from canonical machine-readable definitions where practical. Mechanical enforcement may validate declared protected operations, known permissions, privileged contracts, and tenant scope when tooling supports it; do not claim such coverage before it exists. Repository-wide policy engines, global roles/tenants, registry formats, and AI delegation models remain requirement-driven decisions.
