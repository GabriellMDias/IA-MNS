# Logging

This policy owns structured operational log events, levels, correlation, and reporting boundaries. [Observability](observability.md) explains signal selection; [redaction](../security/telemetry-redaction.md) owns what may be captured. Logs are diagnostic evidence, not an authoritative audit ledger, business database, analytics warehouse, or substitute for metrics/traces/error reporting.

## Current implementation and contract

[ADR-0010](../adr/0010-establish-observability-logging-tracing-metrics-and-error-reporting-strategy.md) selects Pino production JSON logs and centralized `request_id`, `trace_id`, `span_id` correlation, with `trace_flags` when useful. Local pretty output is permitted. Public API field naming remains a separate contract.

The API [logger](../../apps/api/src/logging.ts) emits JSON with service, environment, release identifier, redaction, and active `trace_id`/`span_id` where available. Fastify supplies `request_id` in request-scoped logs. The [request/error boundary](../../apps/api/src/app.ts) reports safe status and diagnostics without request bodies or URLs, and suppresses successful health-request logs. Existing underscore-separated messages such as `http_request` are current event names; the examples below explain semantics, not replacement names to adopt silently.

## Event and field design

Use stable semantic event names plus explicit fields, optionally with a concise English message. Names should survive ordinary refactoring rather than describe private methods. Existing event names, fields, units, and meanings consumed by alerts/dashboards/runbooks are operational contracts; do not rename them casually. Human sentence text is not a query contract. Prefer standard conventions where suitable and avoid several spellings for one concept.

Common context includes producer, environment, release when available, operation, bounded result, explicit duration unit, and relevant request/trace/span/error/job/event IDs. Actor and resource owner must not share an ambiguous field meaning. Do not redefine reserved platform fields. Logs can support justified high-cardinality IDs better than metrics, but classification, search/index cost, and access still apply.

Cross-cutting infrastructure owns logger creation, serialization, redaction, context, and transport; application owners choose useful event meaning/fields. Inject a logger or use safe scoped runtime context/child loggers rather than unrestricted mutable globals. Enrich shared fields centrally where practical. Context from one request/job must never reach another, including pooled or asynchronous execution. Typed critical-event helpers may help but do not require a custom type for every trivial log.

## Logging levels

| Pino level | Meaning |
| --- | --- |
| `trace` | Rare detailed diagnostics; disabled in normal production, safe even if enabled |
| `debug` | Investigation detail too verbose for routine production; normal diagnosability must not depend on it |
| `info` | Meaningful normal operation/lifecycle, not every successful function call |
| `warn` | Unexpected degradation, retry, fallback, or deprecated use worth investigation if frequent |
| `error` | Unexpected failed operation or terminal failure needing investigation |
| `fatal` | Process cannot continue safely; termination is normally expected |

Severity follows operational meaning, not HTTP status, exception existence, monetary value, or business importance. Expected validation, missing resources, invalid credentials, permission denials, normal duplicate delivery, and business rejections do not automatically warrant warnings/errors. They can contribute to aggregate or security signals where justified. Avoid level inflation.

## Reporting boundaries

Report an unexpected failure once at an explicit authoritative boundary, with safe context and correlation. Intermediate layers may enrich/translate/rethrow without logging identical failure again. Adapter and caller must agree who reports; a dedicated error tracker does not require duplicate stacks at every layer. Follow [error reporting](error-reporting.md) and [error handling](../architecture/error-handling.md).

Useful boundaries include request completion, job lifecycle/outcome, significant dependency interactions, process startup/shutdown, and the unexpected-error handler. Completion logs usually provide more value than separate request-start logs; justify both before doubling volume. Expected client errors should not generate stacks. Important jobs/messages need stable identity, type/consumer, attempt, duration, outcome, and safe retry/terminal-failure evidence; never log whole payloads.

Capture safe dependency name/operation/duration/result/reason where useful, keeping provider codes distinct from the API's public codes. Database diagnostics favor normalized operations, latency, and conflict categories, not rows. [Migration logs](../database/migrations.md) should identify migration/release/environment and start/completion/duration/result without secrets. Lifecycle logs should make readiness, shutdown, drain, and startup failure understandable.

## Safe content and volume

Emit explicit allowlisted projections, not entire requests/responses, ORM/domain objects, collections, configuration, environments, SQL parameters, or exception payloads. Do not embed sensitive runtime values in arbitrary interpolated messages. Credentials are prohibited even in debug/development modes; protected headers/query strings, filenames, IP/device/location/user content, and provider data require the [redaction policy](../security/telemetry-redaction.md). Trusted internal stacks require safe authoritative handling and must not be returned publicly.

Bound event size, field lengths, collection summaries, nesting, and line structure. Truncation is not secret removal; hashing is not automatic anonymization. Avoid uncontrolled multiline messages and arbitrary console output in runtime application code now that a canonical logger exists; tooling scripts can have different output requirements. Remove temporary debugging output before completion.

Successful health checks and frequent polling should generally be suppressed, reduced, or sampled; failures/state changes may matter. High-volume success logs require demonstrated value. Do not blindly sample errors, security, migration, or rare events where complete visibility matters. Deterministic request/trace sampling can preserve correlation when appropriate. Logs must not be the sole source of important numeric metrics when dedicated measurements fit, nor duplicate every trace span or canonical business event.

Dynamic production verbosity, if introduced, must be authorized, bounded in time/scope, auditable where appropriate, and safe. It must not disable redaction, dump payloads/environment, or expose stacks. Temporary incident diagnostics need an owner/removal plan. Collection, storage, indexing, retention, and sampling remain deployment concerns; do not make an unavailable backend a business dependency.

## Testing and review

Test redaction, correlation/isolation, security-sensitive logging, and meaningful operational event contracts using captured/in-memory output rather than requiring a production vendor. Use synthetic secrets and assert absence as well as safe evidence presence. Do not test every ordinary message or wording edit. Quiet successful tests should surface relevant captured diagnostics when failures occur.

Before adding an event/field, identify its operational question, owner, stable meaning, level, required fields/classification, units/vocabulary, volume/bounds, existing equivalent signal, duplicate-report risk, automatic context opportunity, and tests. When evidence is missing, choose the smallest useful log, span, metric, error context, or runbook change. Future schema/static enforcement should follow real value; current checks are listed in [validation](../validation.md).
