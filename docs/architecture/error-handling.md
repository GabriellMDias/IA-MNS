# Error Handling

[Documentation index](../README.md) · [API error contract](../api/error-contract.md) · [Error reporting](../reliability/error-reporting.md)

This page owns failure semantics and translation between layers. [ADR-0007](../adr/0007-establish-api-contract-openapi-sdk-and-configuration-schema-strategy.md) governs executable contracts and [ADR-0010](../adr/0010-establish-observability-logging-tracing-metrics-and-error-reporting-strategy.md) diagnostic signals. Separate what happened, what the caller may know, what the user sees, and what trusted diagnostics need.

## Error Categories

| Category | Meaning and handling |
| --- | --- |
| Validation | Input shape or constraints are invalid. Return stable, safe caller-actionable semantics; structured field details require a public schema. |
| Domain | A valid request violates a business rule/state. Describe business meaning rather than a database/provider failure. |
| Authentication | Identity cannot be established. Avoid unnecessary credential/account-existence disclosure. |
| Authorization | An actor lacks permission. Enforce at the trusted boundary and avoid exposing protected resource information. |
| Not found | A resource cannot be resolved. Security policy may require indistinguishable not-found/denied behavior. |
| Conflict | State, uniqueness, idempotency, or concurrent version prevents the action. Map to the intended business condition. |
| Rate limit | A threshold is exceeded. Expose useful retry guidance where safe without revealing anti-abuse internals. |
| External dependency/infrastructure | A provider, database, queue, filesystem, network, or runtime fails. Translate at its boundary according to operation semantics. |
| Unexpected internal | A defect, broken invariant, unmodeled response, or unexpected dependency failure. Capture once, correlate, and return a safe generic result. |

These categories classify meaning, not guaranteed retry safety or operational severity. The same provider can produce a business rejection, transient outage, or internal credential/configuration incident.

## Expected vs Unexpected Failures

Expected failures are modeled outcomes such as invalid input, missing access, or an invalid transition. They should not automatically receive the severity/alerting of an unexpected exception. Unexpected failures need diagnostic telemetry and, when the operating environment supplies it, centralized error reporting.

Catch only where the boundary can recover, translate, enrich, retry safely, compensate, or report. Otherwise propagate to its owner. Never turn every failure into “not found,” swallow exceptions as `null`, or claim success when a required effect failed. Assertions detect impossible internal states; they do not replace validation of external input.

## Error Contract

The API already has a canonical [`errorRegistry`, envelope schema, and safe builder](../../apps/api/src/errors.ts), with a [generated reference](../generated/api/errors.md). [API error policy](../api/error-contract.md) owns serialization, status mapping, and operation metadata. Add codes there rather than inventing a parallel format. The current envelope contains code, safe message, required request ID, and optional trace/error IDs; it has no arbitrary details property.

Stable public codes are machine-readable, normally uppercase, English, owned by the relevant capability, and independent of localization. Consumers branch on codes rather than message text, class names, SQLSTATE, ORM codes, or provider exceptions. HTTP status expresses protocol-level meaning and may cover several distinct application errors; domain logic must not depend on HTTP status.

Choose public granularity according to meaningful consumer actions. Avoid both one generic error for every domain outcome and a permanent code for every internal branch. Public details, if added, need explicit safe schemas. Human messages can evolve or be localized and should explain the problem/action without internal jargon, filesystem paths, SQL, hostnames, or stack traces. Never reuse a code for a different meaning; renaming, removing, or changing consumed codes requires [compatibility review](versioning-and-compatibility.md).

## Translation and Ownership

Domain behavior owns business failures; application services own operation outcomes; adapters own technical failures; transport owns protocol mapping; clients own presentation; observability owns diagnostic capture. Expose concepts appropriate to each consumer.

Preserve an original cause internally where useful and supported, subject to privacy/redaction. A known unique constraint may mean an idempotency conflict, whereas a foreign-key failure may indicate a defect. Translate from demonstrated semantics, not a blanket mapping of all driver failures. Keep internal provider/database classifications distinct from the smaller public surface. Enrich with safe structured context without unpredictably mutating shared error objects.

Retryability depends on the operation, not just error type. Preserve [unknown outcomes](delivery-and-side-effects.md#unknown-outcome), where a timed-out mutation may already have succeeded. Follow [delivery policy](delivery-and-side-effects.md) for retry ownership, idempotency, partial effects, reconciliation, and compensation. Transaction failures must abort required atomic work; a catch must not accidentally commit partial state. Compensation is domain behavior, not generic exception handling.

## Correlation Identifiers

A request ID identifies a boundary request; a trace ID identifies causal distributed execution; an error ID identifies an occurrence/report. Event/job IDs serve their own durable work identities. Preserve appropriate correlation rather than treating them as interchangeable. Safe support references must not encode sensitive data.

Use one authoritative unexpected-error reporting point; lower layers can preserve/enrich context without logging the same exception again. Safe structured diagnostics may include operation, bounded category, request/trace/error ID, attempt, duration, environment, and release. Actor/entity identifiers require classification approval. [Logging](../reliability/logging.md), [tracing](../reliability/tracing.md), and [redaction](../security/telemetry-redaction.md) own capture rules.

Never intentionally emit credentials, tokens, authorization headers, payment secrets, or other prohibited data in errors, logs, breadcrumbs, traces, or metrics. Do not attach personal data merely because it could help debugging. Stack traces/causes may contain sensitive values; trusted capture still requires filtering. Development may expose additional detail only when explicitly safe, while preserving business semantics. The current API uses allowlisted diagnostics rather than arbitrary exception messages/stacks.

## Runtime and Client Boundaries

Each executable needs an appropriate final boundary for unexpected failures: HTTP handler, worker handler, process handling, or UI boundary as applicable. It captures/correlates failures, provides a safe result where possible, and prevents silent failure; it does not replace explicit handling of expected outcomes. If required initialization fails or process state is unsafe, fail startup or terminate under the runtime's [lifecycle policy](../reliability/health-checks.md) rather than continue partially functional without an explicit degraded mode.

Job/event consumers must distinguish invalid contracts, business rejection, duplicates, transient dependency failures, poison messages, and consumer defects. Retain safe job/trace/attempt context and bound retries so repeated failures are visible.

Clients interpret stable contracts and present user-correctable failures locally: field feedback, sign-in, denied access, or conflict recovery as appropriate. Unexpected crashes need a safe global experience and risk-appropriate reporting with release/correlation context. Do not display raw backend diagnostics. Support should be able to investigate with safe reference, release, and time rather than relying only on screenshots.

A centralized error-reporting provider and baseline browser instrumentation are not selected by this page. Where reporting is introduced, retain safe grouping, release/environment/trace correlation, and source-map/symbolication capability. Diagnostic artifacts require controlled access; source maps need not be public. Metrics use bounded categories, and [alerts](../reliability/alerting.md) address actionable impact rather than every expected rejection. Formal SLOs/error budgets require operational needs, not merely the presence of telemetry.

## Testing Errors

Verify classification, public codes, schema/status/headers, validation/authentication/authorization behavior, provider/persistence translation, safe serialization, and absence of sensitive data at meaningful boundaries. Exercise unexpected failures as well as expected outcomes. Test correlation, redaction, authoritative reporting, and avoidance of duplicate capture when relevant.

Error-handling bug fixes should add regression protection when practical, especially false success, leaked SQL/stacks, concealed outages, or resource-existence disclosure. Generated-reference checks prove the registry's current representation, not every semantic/security property; review and behavior tests remain necessary. Development-tool diagnostics should identify the failed rule/location and corrective route without dumping sensitive input.
