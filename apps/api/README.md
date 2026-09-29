# Orion API Runtime

[Setup](../../docs/setup.md) · [Feature rules](../../docs/domains/approval-request.md) · [Implementation conventions](../../docs/domains/approval-request-implementation.md) · [OpenAPI](../../docs/generated/api/openapi.json) · [Validation](../../docs/validation.md)

The Fastify API exposes health routes and the authenticated Approval Request feature, persisted in PostgreSQL through Prisma. The [web workflow](../web/README.md) consumes its generated API contract through `@orion/sdk`. The API verifies access tokens; it does not implement login, passwords, refresh tokens, or provider-specific sessions.

## Find the owning implementation

| Concern | Source |
| --- | --- |
| Configuration and process composition | [`src/config.ts`](src/config.ts), [`src/main.ts`](src/main.ts) |
| HTTP boundary, lifecycle, and failures | [`src/app.ts`](src/app.ts), [`src/lifecycle.ts`](src/lifecycle.ts), [`src/errors.ts`](src/errors.ts) |
| Feature rules and application operations | [`domain.ts`](src/features/approval-requests/domain.ts), [`service.ts`](src/features/approval-requests/service.ts) |
| Wire contract, routes, and token verification | [`contracts.ts`](src/features/approval-requests/contracts.ts), [`routes.ts`](src/features/approval-requests/routes.ts), [`authentication.ts`](src/features/approval-requests/authentication.ts) |
| Persistence and schema meaning | [`prisma-repository.ts`](src/features/approval-requests/prisma-repository.ts), [`schema.prisma`](prisma/schema.prisma), [`schema-metadata.json`](prisma/schema-metadata.json) |
| Generated references | [`generate-references.ts`](scripts/generate-references.ts), [`database-reference.ts`](scripts/database-reference.ts) |
| Real PostgreSQL boundary tests | [`approval-integration.test.ts`](test/approval-integration.test.ts) |

## Local commands

Use [setup](../../docs/setup.md) for the frozen install, generated Prisma client, environment loading, containers, and startup order. `pnpm dev:approval` starts the complete disposable local workflow with synthetic identities. For separate API development, `pnpm --filter @orion/api dev` loads the ignored root `.env.local` when present; `start` runs emitted code and expects its process environment without loading that file.

From the repository root:

| Purpose | Command |
| --- | --- |
| Generate ignored Prisma client | `pnpm --filter @orion/api db:generate` |
| Apply committed migrations to the configured database | `pnpm --filter @orion/api db:migrate:deploy` |
| Check API behavior/types | `pnpm --filter @orion/api test` and `pnpm --filter @orion/api typecheck` |
| Emit/start API | `pnpm --filter @orion/api build`, then `pnpm --filter @orion/api start` |
| Intentionally regenerate tracked API/database/configuration/error references | `pnpm --filter @orion/api references:write` |
| Check current API/database/SDK references without editing them | `pnpm references:check` |

Tests and reference generation use fresh migrated Testcontainers PostgreSQL, so a compatible container runtime must be reachable. Follow the [artifact workflow](../../docs/architecture/backend-execution-and-generated-artifacts.md) for downstream SDK/portal generation after source changes. The root `pnpm validate` also checks emitted builds, real-process recovery, and browser behavior; a focused package check alone does not replace it.

## Configuration and database access

[`config.ts`](src/config.ts) is the sole runtime environment parser; the [generated configuration reference](../../docs/generated/configuration/api.md) owns the setting catalog. `ORION_ENV` is always required. Development/test may run health-only with no feature settings. Enabling the feature requires all four together: `ORION_DATABASE_URL`, `ORION_TOKEN_ISSUER`, `ORION_TOKEN_AUDIENCE`, and `ORION_TOKEN_JWKS_URL`; production requires them.

`ORION_DATABASE_URL` is the restricted runtime credential. Only the Prisma CLI reads `ORION_MIGRATION_DATABASE_URL`, supplied separately for migration commands; the CLI does not automatically load the API's root `.env.local`. Keep both out of tracked files and do not leave the migration credential in the runtime environment.

The runtime role needs `USAGE` on the application schema, `SELECT`/`INSERT` on `approval_requests`, and column-level `UPDATE` only for `title`, `description`, `status`, `version`, `rejection_reason`, and `updated_at`. It needs no DDL or `DELETE` grant and cannot alter immutable ID, creator, creation intent, or creation timestamp. The [database fixture](scripts/migrated-database.ts) provisions separate migration/runtime roles, and integration tests verify denied operations.

The [release workflow](../../docs/database/release-evolution.md) owns durable migration recording. No durable release is currently recorded; an empty registry is not permission to rewrite unverified history.

## Identity and contract

The [token adapter](src/features/approval-requests/authentication.ts) accepts verified `at+jwt` tokens signed with RS256 or ES256 by the configured issuer for the configured audience. It validates expiration and requires nonempty `sub`, valid issuance/expiry timing, a stable `orion_principal_id` UUID, `orion_actor_type=human`, and a string `scope`. The space-delimited `approval:review` scope becomes the application review capability. Stored ownership must survive provider changes; request bodies cannot grant owner identity or capability.

A concrete provider must supply that trusted claim mapping under [H-07](../../docs/human-actions.md#h-07); none is selected or provisioned. Tests use synthetic principals and signed tokens from a local JWKS server. [Feature authorization](../../docs/domains/approval-request.md#identity-and-authorization-boundary) owns requester/reviewer/self-review rules.

[Executable contracts](src/features/approval-requests/contracts.ts) own the eight feature operations, stable operation IDs, typed inputs/outputs, and expected failures. Create requires `Idempotency-Key`; edits/transitions require `expectedVersion`. The [implementation conventions](../../docs/domains/approval-request-implementation.md) own replay, reconciliation, pagination, and state semantics. The [OpenAPI reference](../../docs/generated/api/openapi.json) includes health and feature operations; the [error reference](../../docs/generated/api/errors.md) derives from the API registry.

## Request protection

Approval Request routes share a process-local, source-IP limit of 120 requests per minute. The `onRequest` limiter runs before token verification/database access; health probes are outside it. Exhaustion returns `429 RATE_LIMITED` in the public envelope and a bounded `Retry-After` in seconds. This is resource protection, not a product quota.

The limiter uses the direct peer address; trusted proxies are not configured. A future multi-replica or reverse-proxy deployment must define shared/edge limiting and trusted client-IP handling before promising fleet-wide or per-user limits. Current local protection provides neither guarantee.

## Lifecycle and diagnostics

`main.ts` validates configuration, initializes Pino/OpenTelemetry, then dynamically imports Fastify/application infrastructure before listening. Preserve that order for instrumented infrastructure. Incoming W3C trace context propagates; each request receives a fresh server-generated `x-request-id`. Errors follow the [public envelope](../../docs/api/error-contract.md).

Startup reports initialization, liveness reports process-local health, and readiness becomes unavailable while draining or when the required database is unavailable. The database is probed before readiness and through a bounded readiness check. SIGINT/SIGTERM trigger bounded HTTP, database, and telemetry shutdown.

Logs and exported spans/metric dimensions use allowlisted operational fields. The runtime does not log payloads, raw URLs, headers, configuration objects, or arbitrary exception messages. Unexpected failures produce one sanitized diagnostic occurrence. [Recovery conventions](../../docs/domains/approval-request-implementation.md#failure-recovery-and-retry-ownership) explain why readiness failure or a lost response cannot prove that a prior write failed.
