# Observability

This policy owns the observability model and signal ownership. Production-relevant behavior must be explainable from structured, safe, correlated evidence. Use this page to choose the right signal; detailed requirements live with its owner rather than being repeated across policies.

## Current implementation and accepted direction

[ADR-0010](../adr/0010-establish-observability-logging-tracing-metrics-and-error-reporting-strategy.md) selects server-side OpenTelemetry traces/metrics, W3C Trace Context, OTLP, and Pino JSON logs. A Collector is preferred when deployment complexity justifies it; direct compatible OTLP export remains valid. No global backend/vendor is selected. The OpenTelemetry Logs SDK and browser instrumentation are not initial defaults, and a dedicated error-reporting provider is optional.

The API [initializes telemetry before Fastify/application composition](../../apps/api/src/main.ts), with [Pino redaction](../../apps/api/src/logging.ts), [HTTP instrumentation and allowlisted OTLP export](../../apps/api/src/telemetry.ts), and [health/error boundaries](../../apps/api/src/app.ts). See the [runtime guide](../../apps/api/README.md) and [validation inventory](../validation.md) for current configuration and evidence.

The current API logs centralized `request_id`, `trace_id`, and `span_id` where available, carries a configured release identifier, and initializes HTTP, Fastify, and Prisma instrumentation before application composition. Successful health responses are suppressed from request logs. Trace export removes arbitrary attributes, event details, URLs, SQL text, and status messages; it does not provide full database diagnostics. A production Collector, backend, dashboards, alert owners/thresholds, retention durations, and service objectives remain deployment-specific; policy presence is not evidence they exist.

## Observability signals

| Question | Owner | Scope |
| --- | --- | --- |
| What happened to a particular operation? | [Logging](logging.md) | Discrete semantic events with safe structured context |
| Where did time/failure propagate? | [Tracing](tracing.md) | Causal spans, links, dependency timing, context propagation |
| How often, how slow, how saturated? | [Metrics](metrics.md) | Aggregate numerical behavior and trends with bounded dimensions |
| Which unexpected failures recur? | [Error reporting](error-reporting.md) | Authoritative failure capture, classification, grouping, and correlation |
| Can the process run or receive work? | [Health checks](health-checks.md) | Startup, liveness, readiness, dependency diagnostics |
| Does a responder need to act? | [Alerting](alerting.md) | Actionable conditions, ownership, routing, and investigation context |
| What data can be collected? | [Telemetry redaction](../security/telemetry-redaction.md) | Classification, allowlists, sanitization, and leakage handling |

Operational telemetry is not authoritative business audit history, domain events, or an analytics warehouse. Those have distinct ownership and integrity, persistence, delivery, authorization, and retention guarantees. Do not duplicate every span as a log or report one exception independently at every layer.

## Telemetry correlation

Preserve request/trace correlation across supported boundaries where practical. A request ID identifies an application-boundary request; a trace ID identifies causal execution; a span ID identifies work within that trace; an error ID identifies a failure report. Jobs, events, and workflows have their own stable identities for retries, deduplication, and replay; do not substitute one ID for another merely because both are unique.

Support references must be safe opaque values. Anonymous workflows must remain diagnosable without fake users. Actor/tenant/resource identifiers may appear only when justified and classified; clear/update user context when identity changes. Context must not leak between requests, jobs, or tenants.

Use consistent service/application and environment identities. Deployed release/source revision and operational changes should be correlatable when that release process exists, including after rollback. Logs, spans, errors, and selected metrics should use consistent semantic operation names and established standard conventions where appropriate; never use high-cardinality correlation IDs as routine metric dimensions.

## Instrumentation ownership and coverage

The owner of an operation owns its semantic telemetry. Transport supplies request context, application operations supply meaning/outcome, adapters supply dependency behavior, and cross-cutting infrastructure supplies logger setup, redaction, tracing, and common runtime fields. Share mechanisms only when meaning is shared; do not create generic packages or wrappers merely to hide a vendor. Keep provider SDK coupling at integration boundaries.

Instrument meaningful boundaries rather than every function. Automatic HTTP/database/runtime instrumentation supplies technical visibility but cannot infer business success. Critical workflows may fail semantically while infrastructure appears healthy. Useful coverage, when the corresponding capability exists, includes:

- Remote calls: provider/operation, latency, outcome, timeout, fallback, and retries.
- Database: query/transaction latency, pool saturation, deadlocks, timeouts, and migration outcome without raw values.
- Queues/jobs: publish/consume/progress, waiting age, execution duration, attempts, duplicate handling, dead-letter growth, terminal failure, and originating correlation.
- Caches: justified hit/miss, latency, eviction, and errors; do not build instrumentation before the cache exists.
- Lifecycle/releases: startup/shutdown, deployments/rollbacks, migrations, and important safe configuration/flag state.

Client observability is requirement-driven and must account for privacy, offline delivery, network/battery/overhead, application/OS version, and safe device metadata. Source maps/native symbols can support trusted diagnostics without being public. Do not capture local usernames/paths, user input, or server secrets blindly.

## Safety, cost, and pipeline failure

Telemetry is production data. [Redaction](../security/telemetry-redaction.md), [classification](../security/data-classification.md), [retention](../security/data-retention.md), and [production access](../security/production-access.md) govern both human and AI investigation. Use minimum required allowlisted fields and never intentionally collect restricted secrets, even for emergency debugging. New providers are data-processing boundaries.

Normally telemetry failure must not fail unrelated business operations. An explicit regulatory/security audit requirement can create a different guarantee and must be designed as such. Bound buffers, CPU/memory/network overhead, export timeouts, and dropping behavior; make loss/export failures diagnosable without recursive telemetry storms. Sampling and cost controls must preserve useful evidence for critical, rare, and unexpected failures rather than indiscriminately suppressing it.

Development must support useful local diagnostics without the full production stack while preserving production semantics and redaction. Missing essential evidence and excessive noisy collection are both defects. Add the smallest signal that answers a real question.

## Investigation and testing observability

A useful investigation can move from safe user reference or alert to service/error group, trace, logs, dependency, release, source, and regression test. Use evidence to distinguish facts from hypotheses. Authorized AI tooling follows the same access rules; it is not a reason to collect more sensitive data. Convert confirmed defects into reproduction/regression tests where practical and use runtime evidence to verify recovery.

Test high-value contracts such as correlation generation/propagation/isolation, authoritative error ownership, redaction before export, meaningful events, and available release metadata. Avoid vendor-specific business-test coupling or assertions for every trivial message/span. Consult [validation](../validation.md) before claiming static checks or remote tests exist.

Dashboards should answer concrete service/workflow questions, not display every available metric. Alerts require action and real evidence-based thresholds; runbooks should reference stable signals and actual queries once tooling exists. Provider deployments, thresholds, retention, and service objectives must be determined by real operational requirements rather than invented to fill this documentation.
