# Approval Request Implementation Conventions

[Business specification](approval-request.md) · [API runtime](../../apps/api/README.md) · [Web workflow](../../apps/web/README.md) · [Artifact workflow](../architecture/backend-execution-and-generated-artifacts.md)

This document owns implementation conventions for the reference feature. The business specification owns actors, invariants, and transitions; executable sources own wire and physical details. The API, PostgreSQL schema, generated references, SDK, and web workflow exist. A concrete identity provider remains unselected.

## Placement and ownership

| Responsibility | Current source |
| --- | --- |
| Framework-independent rules and access decisions | [`domain.ts`](../../apps/api/src/features/approval-requests/domain.ts) |
| Application operations, persistence port, intent fingerprint, cursor | [`service.ts`](../../apps/api/src/features/approval-requests/service.ts) |
| PostgreSQL writes and authorized read predicates | [`prisma-repository.ts`](../../apps/api/src/features/approval-requests/prisma-repository.ts) |
| TypeBox contracts, routes/defaults, token adapter | [`contracts.ts`](../../apps/api/src/features/approval-requests/contracts.ts), [`routes.ts`](../../apps/api/src/features/approval-requests/routes.ts), [`authentication.ts`](../../apps/api/src/features/approval-requests/authentication.ts) |
| Authored schema and meaning | [`schema.prisma`](../../apps/api/prisma/schema.prisma), [`schema-metadata.json`](../../apps/api/prisma/schema-metadata.json) |
| Real-database verification | [`approval-integration.test.ts`](../../apps/api/test/approval-integration.test.ts) |

The API composition root wires the feature. Fastify and token verification remain at transport/infrastructure boundaries; domain/application behavior depends on neither Fastify nor Prisma. The feature owns table meaning and writes. Other applications consume its API rather than importing internals or accessing the table directly. Follow [application boundaries](../architecture/application-boundaries.md), [dependency rules](../architecture/dependency-rules.md), and ADRs [0004](../adr/0004-select-fastify-as-the-backend-http-framework.md), [0006](../adr/0006-select-prisma-orm-for-database-access-and-migrations.md), and [0007](../adr/0007-establish-api-contract-openapi-sdk-and-configuration-schema-strategy.md).

`apps/api/prisma/` remains the schema/migration owner until genuine multi-application ownership exists. Do not create generic domain/contracts/database packages for one backend consumer. `packages/sdk` provides the thin generated boundary used by `apps/web`; these responsibilities do not require a ceremonial file-per-layer scaffold.

## Identity, identifiers, and time

- The backend generates one immutable random UUID for each new request, serving as both primary key and public resource ID. Clients cannot choose it; it carries no permission. A future storage change must preserve the public identity under [API](../api/principles.md#identifiers) and [database](../database/principles.md#identifiers) policies.
- The trusted boundary supplies a stable provider-independent principal UUID. Creation stores it as immutable `creatorId`, the sole owner relation. Request bodies cannot supply ownership/capability, and provider migration must preserve stored ownership. There is no tenant or administrator override.
- PostgreSQL owns creation/update time in `timestamptz`; API serialization is UTC RFC 3339. Successful writes advance `updatedAt` in the same statement, using database time and at least a millisecond beyond the previous value. Browser/ORM convenience clocks are not authoritative. Timestamps are informational, not concurrency tokens or a complete audit trail; no additional lifecycle timestamp is currently required.

The [API token adapter guide](../../apps/api/README.md#identity-and-contract) describes trusted claim mapping. Application/domain code receives principal/capability meaning, not provider-specific claims.

## Mutations, concurrency, and transactions

Persist `version=1` on creation and increment exactly once per successful edit/transition. Reads return it; every edit, submit, approve, reject, and cancel request supplies its observed positive integer `expectedVersion`. Never silently retry stale intent against a newer version.

Each write is an atomic PostgreSQL statement. Conditional mutations include ID, expected version, source state, and owner/non-owner relation in the `UPDATE` predicate; the trusted review capability is checked by application code. Authorization and input/state checks precede the write. A losing conditional update returns a version conflict, never silently overwrites the winner. An earlier read alone cannot enforce the invariant.

Creation commits the request, owner-scoped opaque `Idempotency-Key`, and canonical title/description intent fingerprint together under a unique owner/key constraint. A repeated owner/key with identical intent returns the same request's current state; different intent conflicts. A uniqueness collision is followed by a read to classify replay/conflict, not another insert attempt. The key follows the request's eventual retention disposition and does not establish a global idempotency service.

Other mutations use version preconditions rather than durable replay. Repeating a committed action with the old version conflicts; no request acquires multiple terminal outcomes or a reason inconsistent with its state. State, version, rejection reason, and update time commit together. No transaction spans identity-provider calls or external effects, and there is no default audit/outbox write. [Transaction](../database/transactions-and-concurrency.md) and [delivery](../architecture/delivery-and-side-effects.md) policies govern any extension.

## Read and list contracts

Owners can get their requests in every state. A non-owner reviewer can get currently `SUBMITTED` requests; completed decisions leave that review view. A reviewer sees their own requests through owner access but cannot self-review. Broader reviewer history requires an explicit business/access decision.

List scope is `mine` by default or `reviewable` with trusted review capability. The latter selects non-owner `SUBMITTED` requests. Apply authorization in the database query before pagination; there is no unrestricted list. Each scope uses opaque cursors ordered by `createdAt DESC, id DESC`, default page size 20, maximum 100. Routes own defaults and TypeBox owns request bounds.

Cursors are bound to scope and principal, validated on every request, and never accepted as authorization evidence. Current access predicates still apply on every page. Inserts/state changes can change membership; cursors provide no snapshot guarantee. No arbitrary sort, search, or ORM-field filter exists. Follow [pagination policy](../api/principles.md#pagination) if this contract evolves.

## API failures and canonical metadata

The [error registry](../../apps/api/src/errors.ts) owns messages/statuses and [TypeBox contracts](../../apps/api/src/features/approval-requests/contracts.ts) own wire declarations. Feature-specific classification is:

| Condition | Public code |
| --- | --- |
| Missing, expired, or invalid token | `AUTHENTICATION_REQUIRED` |
| Missing review capability, self-review, or unauthorized `reviewable` scope | `PERMISSION_DENIED` |
| Absent/inaccessible ID or non-owner use of owner-only mutation | `RESOURCE_NOT_FOUND` |
| Invalid input, unusable rejection reason, invalid cursor/version/key | `VALIDATION_FAILED` |
| Authorized action from an invalid/terminal state | `APPROVAL_REQUEST_INVALID_STATE` |
| Authorized stale write or losing conditional update | `RESOURCE_VERSION_CONFLICT` |
| Creation key reused for different intent | `IDEMPOTENCY_KEY_REUSED` |

Authentication/authorization precede disclosure of resource state/version. Hidden and absent reads share not-found semantics. If both the observed version and state are obsolete, the current service checks version before transition validity. Messages are safe explanatory copy, not machine contracts. Do not expose Prisma/SQLSTATE/provider internals. Cross-cutting limiting, availability, and unexpected failures follow the [API error contract](../api/error-contract.md); exact status/response shapes are in [generated errors](../generated/api/errors.md) and [OpenAPI](../generated/api/openapi.json).

Schema-adjacent metadata owns table/column meaning, `INTERNAL` classification, null/clock/unit semantics, and constraint/index purpose. It identifies immutable creator/creation intent, rejection reason present only in `REJECTED`, and version increments. Prisma owns representable authored structure; reviewed SQL covers PostgreSQL details; the fully migrated database owns complete physical truth. [Schema documentation policy](../database/schema-documentation.md) owns generation coverage and completeness requirements. Never maintain the derived reference manually.

## Current contract

The executable contract requires nonblank `title` up to 200 characters. Optional `description` is `null`/omitted or nonblank supporting text up to 2,000 characters. A draft edit replaces both fields; omitting `description` clears it. Rejection requires nonblank `reason` up to 2,000 characters. These are existing limits, not additional states. Exact wire details remain in TypeBox/OpenAPI.

Migration commands use `ORION_MIGRATION_DATABASE_URL`; runtime uses the separate restricted `ORION_DATABASE_URL`. The [API runtime guide](../../apps/api/README.md#configuration-and-database-access) owns grants and setup; do not duplicate credentials or runtime configuration parsing inside this feature.

## Verification

Real migrated-PostgreSQL tests cover the authorization matrix with synthetic principals, HTTP failure mappings, create replay/conflict and concurrent creation, authorized cursor ordering, conditional races, stale/invalid transitions, repeat submission, failed-statement rollback, and a caller deadline after committed creation. The emitted-process smoke interrupts the API after a committed decision and verifies recovery/replay after restart.

The generated SDK and web workflow add browser coverage of the owner/reviewer journey, stale mutation, and recovery guidance. See [validation](../validation.md) for commands and prerequisites. These tests prove the exercised boundaries, not a selected provider, deployment rollout, external side effect, or universal exactly-once guarantee.

## Failure recovery and retry ownership

The API, adapter, SDK, and web mutations do not automatically retry state changes; the web query client also disables automatic read retries. A caller may deliberately request again, but a transport failure cannot prove the database did not commit. The adapter's only creation-recovery read follows a unique-key collision; it does not reissue the insert or conditional update.

| Operation/outcome | Safe recovery |
| --- | --- |
| Creation response lost | Reuse the same authenticated owner's key and exact intent to obtain the same durable request, including after restart. Different intent under that key conflicts. |
| Original creation key lost | Inspect the authorized list before creating a new intent. A new key can create another request. |
| Edit/transition timeout, disconnect, or unexpected failure | Fetch current state/version and reconcile before a new action. Blind reuse of a committed version conflicts; the conflict alone does not identify which caller won. |
| Known validation, authorization, state/version, or rate-limit failure | Interpret the stable code and operation-specific guidance. Readiness failure does not prove a previous write failed. |

The web UI provides unknown-outcome guidance and detail reload. Unexpected dependency exceptions produce one safe internal-error diagnostic, without raw exception content. No operation has an external effect to compensate or call transactionally reversible.

No deletion worker, audit table, outbox/inbox, compensation, or derived-copy reconciliation is required by the current feature. This does not authorize indefinite retention: actual production disposal/retention remains conditional under [H-09](../human-actions.md#h-09) and [retention policy](../security/data-retention.md). Durable data resides in PostgreSQL; browser query data is transient and cleared with token changes. Logs/traces/errors/metrics retain only allowlisted operational fields under [redaction policy](../security/telemetry-redaction.md), not request content or credentials.
