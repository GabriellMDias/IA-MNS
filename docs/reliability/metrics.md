# Metrics

This policy owns aggregate measurements, units, dimensions, cardinality, and measurement semantics. Use [logs](logging.md), [traces](tracing.md), or [error reports](error-reporting.md) to investigate individual requests/resources. A custom metric must answer a recurring numerical operational question rather than measure every available value.

## Current implementation

[ADR-0010](../adr/0010-establish-observability-logging-tracing-metrics-and-error-reporting-strategy.md) selects OpenTelemetry metrics and OTLP. The API [telemetry configuration](../../apps/api/src/telemetry.ts) installs a periodic OTLP metric reader when an endpoint is configured and an attribute allowlist for all instruments. No metric reader is configured without that endpoint. HTTP/framework instrumentation supplies the current baseline; these settings do not imply a custom metric registry, production dashboard, SLO, or backend exists.

New dimensions must survive the actual allowlist and preserve its security/cardinality guarantees. Inspect existing instrumentation before adding custom HTTP, database, process, messaging, or resource measurements. Prefer authoritative standard/platform metrics over duplicate custom implementations. Backend, retention, resolution, histogram tuning, dashboards, SLOs, and formal budgets remain requirement-driven decisions.

## Metric types and units

| Type | Meaning | Design constraints |
| --- | --- | --- |
| Counter | Cumulative events/items, normally increasing | Let the backend handle process-reset/rate semantics. Persist only if the meaning explicitly requires durable state. Distinguish logical outcomes from attempts. |
| Gauge | Current/recent value that may rise or fall, such as backlog or active connections | Identify its authoritative source and local/global scope. Multiple replicas must not ambiguously report one global value. |
| Histogram | Distribution of durations/sizes | Prefer to averages or min/max alone, which conceal tail behavior/frequency. Choose buckets and percentiles against real workload ranges. |

Local summary/quantile instruments require deliberate multi-instance aggregation and cost evaluation; histograms often aggregate more usefully. Units must be explicit and consistent with the selected standard: avoid mixing equivalent durations across ms/seconds without reason or ambiguous byte/count units. Define timing start/end and whether a duration includes queue wait, retries, or user-visible completion.

Use primitive counts/distributions and let the backend derive rates, ratios, percentages, and rolling windows where it can do so correctly. Do not implement competing application aggregation or custom temporality. Metrics are observational; business correctness must not depend on their delivery.

## Dimensions and cardinality

Names describe stable quantities and must not contain runtime identifiers. Dimensions need bounded vocabularies and a concrete grouping/filtering question. Estimate worst-case series multiplication, not just label count: five methods × twenty routes × six statuses can produce six hundred series before another dimension is added. Bound label count, possible values, and total series where relevant; formal budgets should follow scale.

Do not use user/resource/request/trace/error/job IDs, email, IP, raw URLs, SQL statements, or arbitrary error/exception messages as metric labels. Use route templates, bounded operations/providers/job types, result/status categories, and justified bounded error codes. Query values are not default dimensions. Tenant-specific analysis needs a separate explicit bounded justification; do not assume current tenant count remains small. Normalize client versions according to a support model when needed, and evaluate release-label retention/cardinality before broad use.

A bounded field can still be sensitive, and a numeric value such as an account balance is not automatically operational telemetry. Apply [classification](../security/data-classification.md) before cardinality and [redaction](../security/telemetry-redaction.md) to all values/labels; restricted values and personal-data lookup do not belong in metrics. Prefer designs that cannot identify a person from a series. Do not attach every feature flag or user experiment context to every metric.

## Measurement ownership and accuracy

Emit at the authoritative outcome boundary. A metric must measure what its name claims without ambiguous increments or double counting by controller, service, and repository. Distinguish traffic, attempts, logical operations, retries, duplicates, final outcomes, event publication/delivery/processing, and deduplication. A repeated idempotent request can count as traffic without counting a durable business outcome again. Completion counters must not increment before completion is known.

Counters must remain monotonic for their lifecycle; current state uses a gauge. Prefer bounded attempt classes unless the number of attempts is explicitly small. Safe error categories should distinguish expected business/client rejection from technical failures when reliability analysis depends on that distinction. A `4xx` is not inherently a service failure; an unexpected `5xx` generally is. Specific authentication/denial spikes can still be security or product signals without labeling by actor.

Metrics should generally observe the full population even when traces are sampled. Do not randomly sample counters unless the mathematics remains explicitly correct. Define semantics of missing, delayed, or dropped measurements: zero events, no series, a dead service, failed collector, and broken query are different states.

## Useful coverage

Choose signals for actual runtime responsibilities; RED (rate/errors/duration), USE (utilization/saturation/errors), and traffic/errors/latency/saturation are heuristics, not mandatory inventories.

- Requests/dependencies: count, latency distribution, bounded outcome, timeout/retry categories, and provider behavior as the application observes it.
- Database/pools: meaningful query/transaction latency/failures/retries, deadlocks, active/idle/waiting connections, acquisition timeouts; never raw SQL labels.
- Queues/workers: throughput, depth, oldest-message age, execution duration, retries, in-flight work, terminal failure, and dead-letter growth. Depth alone says little without capacity and age.
- Cache/storage: justified hit/miss/error counts, durations, and bytes. Derive ratios from counts rather than separate incompatible calculations.
- Runtime/deployment/migrations: use existing process/platform instruments; deploy/rollback signals may come from CI, and significant backfills may need processed/failed/remaining/batch-duration evidence.
- Critical business workflows: justified operational outcomes can reveal semantic outages, but analytics, experiments, financial reporting, and per-customer values belong to their own systems.

Do not create a binary health metric if existing underlying signals answer the question better. [Health checks](health-checks.md) own probe semantics.

## Dashboards, SLOs, and alerting

Important dashboards need an owner and recurring operational use. Organize around actual service/dependency/workflow topology and show deployment changes where practical. Avoid panels merely because measurements exist.

An SLI measures service behavior; an SLO sets a target/window; an SLA is an external/contractual commitment. Define meaningful user requirements before objectives or error budgets. Explicitly state eligible events, success/failure, client-caused exclusions, all-instance coverage, retry denominators, and missing-data behavior. Do not invent “three nines” or arbitrary windows. Error-budget burn alerts require real objectives and belong to [alerting](alerting.md).

Critical alert/SLO metrics need stable definitions, reliable emission, and stronger compatibility/testing than exploratory measurements. A panel can still render while silently measuring the wrong thing after a semantic change. Names, units, and dimensions are operational contracts: migrate dashboards/alerts before renaming or removal, and never silently change meaning under the same name.

## Pipeline, cost, and access

Metric export failure must normally not fail business work. Use low-overhead aggregated/batched export, bounded buffers, and no synchronous network call per measurement. Monitor export failures, dropped measurements, saturation, and collector health with bounded non-recursive diagnostics. Cardinality consumes application CPU/memory before backend billing and can breach provider series/ingestion/attribute quotas.

Choose retention/resolution/downsampling against investigation, capacity, SLO windows, privacy, and cost. Second-level precision or indefinite full-resolution history is not universally useful. Aggregate topology/business-volume signals can remain confidential; [production access](../security/production-access.md) and [retention](../security/data-retention.md) still apply.

## Metric registry and testing

Document important custom metric name, type, unit, exact meaning/emission point, owner, required dimensions/allowed values, cardinality expectations, consumers, and removal condition. Reuse instrumentation metadata; introduce a separate machine-readable registry only if it adds value. Remove unused metrics deliberately and keep consumer references current.

Test critical cardinality, units, single authoritative increments, outcomes/retries, safe labels, and SLI eligibility where practical using test readers/exporters. Isolate state so tests are order-independent. Do not unit-test every automatic runtime metric or require a production provider. Local collection may be optional while instrumentation paths remain exercised.

Before adding a metric/dimension, identify user/operational question, existing standard signal, type/unit, authority, allowed values/worst-case multiplication, sensitivity, consumer compatibility, evidence tests, and lifecycle. If the question concerns one specific record, use another signal. Check [validation](../validation.md) for actual enforcement; future naming/cardinality/schema checks are not existing guarantees.
