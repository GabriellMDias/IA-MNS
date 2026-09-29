# API Principles

[Task index](../README.md) · [Error contract](error-contract.md) · [Compatibility](versioning.md) · [Validation](../validation.md)

This policy owns API boundary design. [ADR-0004](../adr/0004-select-fastify-as-the-backend-http-framework.md) selects Fastify; [ADR-0007](../adr/0007-establish-api-contract-openapi-sdk-and-configuration-schema-strategy.md) selects executable TypeBox wire contracts, generated OpenAPI, and the thin TypeScript SDK. These are implemented. Feature-specific behavior belongs to the [Approval Request specification](../domains/approval-request.md) and [implementation conventions](../domains/approval-request-implementation.md).

## Locate the authoritative source

| Task | Start here |
| --- | --- |
| Change an operation, request, response, or expected error | [Feature TypeBox contracts](../../apps/api/src/features/approval-requests/contracts.ts), then the owning application operation and tests |
| Inspect health contracts | [Health schemas](../../apps/api/src/health-contracts.ts) and [health policy](../reliability/health-checks.md) |
| Inspect the interoperable API | [Generated OpenAPI](../generated/api/openapi.json); author changes in executable contracts |
| Change a public error | [Error registry and envelope](../../apps/api/src/errors.ts) and [error policy](error-contract.md) |
| Change a consumer | [SDK public surface](../../packages/sdk/README.md) and [web guide](../../apps/web/README.md) |
| Regenerate derived artifacts | [Artifact workflow](../architecture/backend-execution-and-generated-artifacts.md) |

## Ownership and transport boundaries

An API exposes an owned application capability, not an arbitrary database table. Each operation needs a clear domain owner, consumer, and canonical contract. Resources and explicit commands are both appropriate when they express real behavior; do not generate CRUD or generic updates for every persisted entity.

Transport adapters own routing, request validation, authentication integration, safe request context, protocol/error mapping, and response serialization. Application operations and domain rules should not depend on HTTP objects, headers, status codes, or framework APIs unless the behavior itself is transport-specific. Pass only the trusted context an operation needs.

Persistence records, domain entities, API payloads, events, and UI models have distinct responsibilities. Reuse a representation only when its semantics genuinely match. Explicitly map allowed inputs and outputs: never pass an untrusted body directly to persistence or serialize internal objects merely because they are available. This prevents mass assignment and accidental disclosure while allowing internal refactoring without consumer breakage.

## Canonical API Contract

Maintain wire-oriented TypeBox schemas and route metadata as the authored source. Fastify uses them for validation and serialization; generated OpenAPI 3.1 describes the interoperable boundary; `openapi-typescript` and `openapi-fetch` provide the default typed client. Every exposed operation must have a stable, unique `operationId`.

Define request/response shapes, constraints, authentication, expected errors, and non-structural semantics deliberately before exposing behavior. Do not separately maintain equivalent runtime validators, TypeScript interfaces, OpenAPI schemas, SDK types, or reference tables. Generated artifacts are reproducible representations and must not be hand-edited. Ordinary internal types need not become TypeBox schemas.

The API owns its contracts. Extract a shared contract package only for genuine shared ownership. Such a package must not depend on persistence, backend framework implementation, server secrets, or UI code. First-party consumers use the generated SDK and must not import server implementations or database types. The SDK may provide transport, types, credential hooks, and error decoding; it must not own backend business authorization or persistence. Successful-response runtime revalidation is not automatic; introduce it only for a demonstrated trust or reliability requirement.

## Validation

Treat bodies, query/path parameters, headers, cookies, uploads, webhooks, and client identifiers as untrusted. Validate structural input at the trusted boundary before application logic relies on it. Structural validation, domain validity, authentication, and authorization remain separate checks.

For each field, define meaning, required/optional status, omission versus explicit `null`, type, format, bounds, allowed values, classification, and exposure. Normalize only when domain semantics require it; do not silently modify user content for convenience. Unknown-field behavior must be deliberate and compatible with the consumer contract. Separate create, replacement, partial-update, summary, detail, and privileged schemas where their semantics differ instead of building one universally optional model.

Use meaningful text and numeric limits based on product needs and resource cost. Bounded states should use explicit enums; consider extensibility under [versioning](versioning.md). Distinguish instants, calendar dates, local times, time zones, and durations. Money requires currency, units, and precision; exact financial amounts must not rely on ambiguous floating-point representations. Use clear English names and canonical descriptions, positive boolean semantics where practical, and established domain terminology. Product localization does not change machine identifiers.

## Identifiers

Public identifiers represent stable resource identity. They may coincide with storage keys when that is an intentional contract, but must not expose sensitive structure or grant authority. Treat opaque identifiers as opaque. Client-generated IDs are allowed only when explicitly designed for an actual offline, distributed, or idempotency need. Changing storage must not accidentally change public identity.

## Authentication

Protected operations derive identity and capabilities from the [trusted authentication boundary](../security/authentication.md) and enforce [authorization](../security/authorization.md) on the server. Caller-supplied roles, owner IDs, permissions, tenant IDs, feature flags, or UI visibility cannot grant access. A tenant path alone does not establish membership. Public operations must be explicitly public; administrative/debug capabilities require deliberate privilege, output, and environment controls.

Make operation security requirements discoverable. Apply stronger controls where credentials, personal data, finances, or administration require them. Hidden resources may deliberately share not-found semantics with absent resources; preserve and test the disclosure policy. Keep bearer credentials out of URLs except for an explicitly designed protocol requiring a short-lived capability. Gateway authentication never replaces application authorization.

## Pagination

Potentially growing collections must be bounded. Define default/maximum page sizes, deterministic ordering with a tie-breaker, empty results, supported filters, sorting, and search semantics. Apply authorization before pagination; counts, filters, and related-resource expansion must not reveal inaccessible data.

Choose offset or cursor pagination according to dataset size, change frequency, query cost, and consumer needs. Cursors are opaque inputs, not authorization evidence; validate their scope and contents and protect sensitive state or integrity where needed. Document membership changes between pages instead of implying a snapshot guarantee.

Allowlist filter operators and sort fields. Never pass arbitrary client fields or sort expressions to SQL/ORM queries. Bound flexible queries, related-resource depth, response size, and export work; add sparse fields or expansions only when consumers benefit. Inspect query behavior for material N+1 costs. The [current feature conventions](../domains/approval-request-implementation.md#read-and-list-contracts) own its concrete cursor and page-size choices.

## Idempotency

For state-changing operations, consider duplicate submission, concurrent execution, timeout ambiguity, and response loss. HTTP method names alone do not prove idempotency. Where supported, specify key location, scope, intent matching, reuse/different-payload behavior, retention, and replay result. Distinguish a replay from a conflicting new action.

Updates that must protect a previously observed state need a deliberate concurrency protocol, such as a version precondition. Stale writes should produce a stable conflict rather than silently overwrite newer state. Approval Request uses `Idempotency-Key` for creation and `expectedVersion` for edits/transitions; see its [mutation contract](../domains/approval-request-implementation.md#mutations-concurrency-and-transactions). Durable implementation requirements belong to [transactions](../database/transactions-and-concurrency.md) and [delivery](../architecture/delivery-and-side-effects.md).

Errors use the [public error contract](error-contract.md). Consumers branch on stable codes, never message text, and must not blindly retry timeouts or all `5xx` responses. Retry safety depends on operation semantics and whether the outcome is known.

## Resource protection and operational behavior

Bound request payloads, handler/dependency execution, and costly queries according to exposure. Technical rate limits protect resources; product quotas express entitlements and require separate semantics. Where clients need retry guidance, expose safe bounded metadata while keeping anti-abuse internals private. The [API runtime guide](../../apps/api/README.md#request-protection) describes the implemented process-local limiter and its deployment limits.

Cache policy must consider authentication, authorization, tenant scope, freshness, and privacy; protected results must not become public cache entries. Conditional requests and ETags are optional mechanisms, not foundation requirements. Health and metrics endpoints are operational contracts with appropriate exposure and safe output; they must not reveal secrets, raw configuration, or stack traces.

[Observability](../reliability/observability.md) and [redaction](../security/telemetry-redaction.md) own telemetry rules. Use stable operation identities, route templates, method/status/duration, safe correlation, and bounded error categories. Do not log full requests/responses, raw URLs, credentials, or arbitrary exceptions. Propagate tracing through supported outbound and asynchronous boundaries without introducing high-cardinality labels.

## Additional delivery modes

These requirements apply **if the capability is introduced**; they do not imply implementations exist.

| Capability | Required design |
| --- | --- |
| Long-running or asynchronous operation | Distinguish accepted from completed; define status/result/failure retrieval and cancellation. Do not hold a request open indefinitely. Transport cancellation does not prove durable rollback. |
| Upload/download | Define size/media limits, ownership, processing state, required scanning, and authorization. Delegated or pre-signed URLs need bounded scope/lifetime and must not be logged as harmless text. File content is excluded from telemetry. |
| Webhook | Define schema, authentication, acknowledgement, retry/delivery behavior, and compatibility. Validate inbound signatures/input and handle replay, duplicates, and out-of-order delivery. Decouple long work where provider acknowledgement requires it. |
| Events | An event states that something happened; it is not interchangeable with an API command. Do not reuse response schemas automatically across independently evolving event contracts. |
| WebSocket/streaming | Define authentication/reauthorization, message contracts, lifecycle, ordering, reconnection, backpressure, cancellation, and partial failure. |
| Gateway/BFF/GraphQL/RPC | Introduce only for demonstrated requirements. Preserve owned contracts and security; account for GraphQL complexity/N+1 and resolver authorization. A BFF must serve a distinct composition need. REST terminology is not a reason for unnecessary design constraints. |

## Compatibility and documentation

Identify actual consumers and how independently they deploy. Follow [API versioning](versioning.md) for structural, semantic, authorization, error, ordering, retry, and side-effect changes. Prefer compatible evolution over new versions, and keep deprecated behavior functional until its removal conditions are satisfied. Internal consumers can have real compatibility commitments; mobile/desktop consumers can lag.

Generate reference facts from canonical contracts and maintain authored explanations for intent the schema cannot express. Use synthetic examples that conform to current contracts. The [Living Documentation Portal](../architecture/living-documentation.md) presents generated facts without becoming another source. A contributor should navigate operation → contract → application owner → authorization → implementation → tests without reverse engineering framework code.

## New API Operation Checklist

Before adding or changing an operation:

1. Identify the capability, owner, actual consumers, and compatibility commitments; reuse existing patterns and semantic errors.
2. Define input/output field meaning, bounds, classification, omission/null behavior, stable operation identity, authentication, authorization, and expected failures.
3. Specify duplicate/concurrent/retry behavior, synchronous versus asynchronous completion, external effects, and pagination/query cost where applicable.
4. Implement explicit mapping at the boundary and test validation, serialization, statuses/headers, authentication, denials, hidden resources, and relevant domain behavior through the real HTTP boundary. A policy unit test alone does not prove endpoint enforcement.
5. Test security risks proportionally, including mass assignment, oversized inputs, restricted fields, and cross-tenant access where applicable. Preserve actual consumer compatibility commitments.
6. Regenerate OpenAPI, SDK, and affected references; run [validation](../validation.md). Current drift checks prove alignment with current sources, not historical consumer compatibility. Review the semantic change as well as the generated diff.
