# ADR-0010: Establish Observability, Logging, Tracing, Metrics, and Error Reporting Strategy

**Status:** accepted

**Date:** 2026-09-23

## Context

Orion requires a concrete observability strategy before production-oriented backend implementation proceeds further.

The strategy must support applications ranging from small deployments to large distributed systems while preserving the ability to choose different observability backends according to product, hosting, regulatory, operational, and cost requirements.

Observability must provide enough information to understand:

- whether a system is healthy;
- what failed;
- where a failure occurred;
- how requests move through the system;
- which dependencies contributed to latency;
- how infrastructure and application behavior change over time;
- whether important operational thresholds are being approached;
- how logs from different components relate to the same request or distributed operation.

Orion has already selected Pino as the structured logging implementation for the Fastify runtime.

That decision establishes the technical logger but does not define:

- log structure;
- correlation semantics;
- redaction;
- tracing;
- metrics;
- telemetry propagation;
- sampling;
- exporting;
- error reporting;
- observability backend selection.

Orion must also avoid coupling application code to a specific monitoring vendor.

A project may eventually use systems such as Grafana, Datadog, Honeycomb, New Relic, Azure Monitor, cloud-provider-native tooling, or another compatible platform.

The application architecture should not need to change merely because the telemetry destination changes.

Observability must also remain distinct from business audit history.

Operational logs and traces are optimized for diagnostics, reliability, and performance investigation.

Audit history may require different guarantees around persistence, retention, authorization, immutability, and business semantics.

These responsibilities must not be conflated.

## Decision

Orion will use **OpenTelemetry as its primary observability standard for distributed tracing and metrics**.

Orion will continue to use **Pino as its structured application logging implementation**.

The default observability model is:

```text
traces
    → OpenTelemetry

metrics
    → OpenTelemetry

application logs
    → Pino

telemetry transport
    → OTLP

production telemetry routing
    → OpenTelemetry Collector preferred

observability backend
    → deployment-specific
```

No observability backend or SaaS vendor will be selected globally by the Orion foundation.

### Observability responsibilities

The responsibilities are intentionally separated:

```text
OpenTelemetry
├── tracing
├── metrics
├── context propagation
├── instrumentation
└── telemetry export

Pino
├── structured application logs
├── operational events
├── request logs
└── structured error logs

deployment infrastructure
├── log collection
├── telemetry routing
├── storage
├── querying
├── dashboards
└── alerting
```

An observability provider must not become a dependency of Orion domain or application architecture merely because it stores or visualizes telemetry.

### Distributed tracing

OpenTelemetry will provide Orion's distributed tracing model.

Tracing should cover important execution boundaries including, where applicable:

- inbound HTTP requests;
- Fastify request processing;
- outbound HTTP requests;
- Prisma/database operations;
- external integrations;
- background work;
- distributed service calls;
- operationally significant application operations.

The intended trace structure is conceptually:

```text
incoming HTTP request
    ↓
HTTP server span
    ↓
Fastify processing
    ↓
application operation
    ↓
database / external integration
```

Tracing is intended to represent causally related units of work rather than duplicate every function call in the application.

### Fastify instrumentation

Fastify tracing will use **`@fastify/otel`** as the preferred Fastify-specific OpenTelemetry integration.

The instrumentation must be initialized early enough to observe relevant Fastify lifecycle behavior.

Underlying HTTP instrumentation must also be configured where required for inbound and outbound trace propagation.

Fastify instrumentation remains a transport/infrastructure concern.

Domain and application code must not depend on Fastify-specific OpenTelemetry APIs.

### Prisma instrumentation

Prisma operations will use the official Prisma OpenTelemetry instrumentation where tracing is enabled.

The intended relationship is:

```text
application operation
    ↓
Prisma operation
    ↓
database query
```

allowing database activity to appear as part of the surrounding distributed trace.

Observability initialization must occur before dependencies whose instrumentation depends on load-time registration are initialized.

The expected application bootstrap sequence is therefore approximately:

```text
process start
    ↓
load and validate configuration
    ↓
initialize observability
    ↓
initialize instrumented infrastructure
    ↓
compose application
    ↓
start accepting work
```

### Automatic versus manual tracing

Orion will prefer automatic instrumentation for technical infrastructure boundaries when mature instrumentation is available.

Examples include:

- HTTP;
- Fastify;
- Prisma;
- supported outbound clients;
- other infrastructure integrations.

Manual spans should be added only when they represent operationally meaningful units of work.

Appropriate examples may include:

- important application workflows;
- expensive operations;
- long-running processing;
- significant external integration boundaries;
- operations whose duration or outcome is valuable during incident investigation.

Manual tracing must not mechanically mirror internal function structure.

The guiding rule is:

> A span should represent an operationally meaningful unit of work, not merely a function invocation.

### Trace context propagation

Orion will use **W3C Trace Context** as the default distributed trace propagation model.

Distributed calls should propagate trace context automatically through supported instrumentation wherever possible.

Trace propagation enables requests crossing multiple processes or services to remain part of the same causal trace.

Custom propagation mechanisms must not be introduced when standard trace propagation is sufficient.

### Baggage

OpenTelemetry baggage will not be part of Orion's normal golden path.

Baggage may be introduced only for an explicit distributed-context requirement.

Any baggage keys must be deliberately allowlisted.

Baggage must not contain:

- authentication credentials;
- tokens;
- secrets;
- passwords;
- private keys;
- unnecessary personal information;
- sensitive business data.

Trace context should be preferred when causal correlation alone is sufficient.

### Trace sampling

Trace sampling must be configurable by deployment.

Orion will not define one universal production sampling percentage.

Appropriate sampling depends on factors including:

- traffic volume;
- observability cost;
- backend capabilities;
- incident-response requirements;
- regulatory constraints;
- performance overhead.

Development environments may normally retain all traces when useful.

Production environments may reduce trace volume through appropriate sampling strategies.

Sampling should preserve upstream trace decisions where required for coherent distributed tracing.

More advanced strategies, including collector-side or tail-based sampling, may be introduced by deployment infrastructure without forcing business code to change.

### Metrics

OpenTelemetry will provide Orion's metrics API and SDK model.

Metrics may describe technical or operational behavior including:

- request counts;
- request duration;
- active operations;
- error counts;
- queue depth when applicable;
- processing duration;
- dependency latency;
- runtime behavior;
- resource usage where appropriately instrumented;
- application-specific operational signals.

Custom metrics must have deliberate semantics.

Metric definitions should include, where applicable:

- stable name;
- description;
- unit;
- instrument type;
- bounded attributes.

Metric names must not be created casually for short-term debugging when logs or traces are a better fit.

### Metric cardinality

Metric attributes must remain **bounded and low-cardinality**.

High-cardinality identifiers must not normally be used as metric attributes.

Examples of inappropriate metric dimensions include:

```text
user_id
customer_id
order_id
invoice_id
email
trace_id
request_id
arbitrary raw URL
```

Appropriate HTTP dimensions may include bounded values such as:

```text
HTTP method
normalized route
status code or status class
service identity
deployment environment
```

High-cardinality operational detail belongs in traces or structured logs when its collection is appropriate and permitted.

### Business metrics versus business state

Observability metrics are not authoritative business records.

For example, an `orders.created` metric may be useful operationally, but it must not become the authoritative record of how many orders the business created.

Metrics may be:

- sampled;
- aggregated;
- temporarily unavailable;
- retained for limited periods;
- transformed by telemetry infrastructure.

Authoritative business state remains in the application's persistent data model.

### Structured logging

Pino will remain Orion's default structured application logger.

Production-oriented logs must use structured JSON.

Human-readable pretty output may be enabled for local development where useful.

Application logs should prefer structured fields over encoding all machine-relevant context exclusively inside message strings.

For example, a record may contain:

```text
event
request_id
trace_id
span_id
entity identifiers when permitted
error metadata
structured operation attributes
message
```

The textual message is intended primarily for human readability.

Structured fields provide machine-queryable context.

### Log correlation

Pino logs emitted while an OpenTelemetry span is active should include trace correlation metadata.

The standard correlation fields will be:

```text
trace_id
span_id
```

and, when useful:

```text
trace_flags
```

This allows an operator to navigate conceptually from:

```text
log
    ↓
trace_id
    ↓
distributed trace
    ↓
request
    ↓
application operation
    ↓
database / integration
```

Trace correlation should be provided through instrumentation or centralized logging configuration rather than manually added at every call site.

### Request correlation

Orion will retain an independent **`request_id`** for HTTP request correlation.

`request_id`, `trace_id`, and `span_id` serve different purposes:

```text
request_id
    → identifies one HTTP request

trace_id
    → identifies one distributed trace

span_id
    → identifies one specific traced operation
```

Orion will not require `request_id` and `trace_id` to contain the same value.

Request IDs remain useful even when tracing is unavailable, disabled, sampled differently, or incomplete across an external boundary.

### Log export

Pino logs will be emitted through the application's normal process output by default.

Production deployments should normally emit structured logs through:

```text
stdout / stderr
    ↓
deployment log collection
    ↓
configured log backend
```

Application code must not require direct integration with a specific logging vendor merely to emit ordinary logs.

This preserves compatibility with containers, process supervisors, cloud platforms, orchestration systems, and local execution.

### OpenTelemetry Logs

The OpenTelemetry Logs SDK will **not be part of Orion's initial default logging path**.

Pino remains authoritative for application logging.

OpenTelemetry instrumentation may be used to enrich Pino records with active tracing context.

A future OpenTelemetry Logs integration may be introduced when its JavaScript implementation, deployment requirements, and operational value justify doing so.

Such an addition does not require replacing Pino unless the fundamental logging responsibilities established here change.

### Redaction

Sensitive-data redaction is mandatory.

Logging configuration must provide centralized protection against common sensitive values.

Logs must not capture secrets or credentials simply because those values are available in application objects.

Examples that must normally be excluded or redacted include:

- `Authorization` headers;
- cookies;
- `Set-Cookie`;
- access tokens;
- refresh tokens;
- passwords;
- API keys;
- private keys;
- database credentials;
- secret configuration values.

Raw request and response bodies must **not be logged by default**.

Bodies, query parameters, and headers can contain:

- personal data;
- financial information;
- credentials;
- confidential business information;
- protected customer data.

When a particular value is operationally necessary, it must be logged intentionally and consistently with Orion's data-classification and security policies.

### Logging errors

Unexpected errors should be recorded as structured errors rather than converted only to interpolated text.

Error logging should preserve useful technical context such as:

- error type;
- message;
- stack trace when appropriate;
- cause chain where available;
- request correlation;
- active trace correlation;
- relevant operation context that is safe to record.

Sensitive application input must not be attached indiscriminately to error records.

### Expected versus unexpected failures

Orion will distinguish expected application outcomes from unexpected operational failures.

Examples of expected outcomes may include:

- validation failure;
- not-found result;
- authorization rejection;
- business-rule rejection;
- concurrency conflict that is explicitly modeled.

Such results must not automatically be treated as production incidents merely because they map to non-success HTTP responses.

Unexpected failures may include:

- unhandled programming errors;
- unavailable required dependencies;
- unexpected database failures;
- invariant violations;
- unanticipated integration failures.

This distinction should influence:

- log level;
- tracing error status;
- external error reporting;
- alerting.

The existing Orion error-handling policy remains authoritative for application-level error semantics.

### Error reporting

Orion will not select a global external error-reporting vendor.

Unexpected errors should first participate in the standard observability model through:

```text
central error handling
    ↓
structured Pino log
    +
active OpenTelemetry trace/span context
```

An application or deployment may additionally integrate an error-reporting provider when operational requirements justify it.

Examples could include dedicated error-monitoring or APM platforms.

Such integration should occur at appropriate technical boundaries rather than introducing vendor APIs throughout domain and application code.

Orion will not create generic abstraction layers solely to hide a provider when no application responsibility requires such an abstraction.

### Fatal process failures

Fatal startup or process-level failures should be recorded where possible before process termination.

Examples include:

- failure to initialize required configuration;
- unrecoverable application initialization failure;
- uncaught exceptions that make process state unsafe.

Where practical, the process should perform best-effort telemetry flushing before termination.

The runtime or deployment platform should be responsible for restarting failed processes when restart behavior is appropriate.

A process must not continue accepting work when its state can no longer be considered reliable.

### OpenTelemetry resources

Telemetry-producing processes must identify themselves using stable OpenTelemetry resource attributes.

At minimum, deployments should provide meaningful values for concepts such as:

```text
service.name
service.version
deployment.environment.name
```

A namespace or equivalent organizational identifier may also be provided when useful.

Services must not intentionally rely on generic unidentified defaults when the deployment knows the actual service identity.

Examples of separate service identities may include:

```text
api
worker
scheduler
```

if those processes are introduced.

### Telemetry transport

**OTLP will be Orion's preferred telemetry transport protocol for OpenTelemetry signals.**

Applications should export OpenTelemetry telemetry through OTLP-compatible infrastructure rather than depend directly on a vendor-specific telemetry protocol when practical.

The intended model is:

```text
Orion process
    ↓
OpenTelemetry SDK
    ↓
OTLP
    ↓
telemetry infrastructure
```

This helps preserve backend portability.

### OpenTelemetry Collector

The **OpenTelemetry Collector is the preferred production telemetry routing and processing layer** when deployment complexity justifies it.

The conceptual architecture is:

```text
application
    ↓
OTLP
    ↓
OpenTelemetry Collector
    ↓
backend(s)
```

The Collector may provide capabilities such as:

- batching;
- routing;
- filtering;
- transformation;
- sampling;
- credential isolation;
- exporting to multiple destinations.

Orion does not require every small deployment to operate a Collector.

Direct OTLP export to a compatible backend is acceptable when it provides the simpler and appropriate deployment model.

Applications must not depend on whether telemetry reaches its final backend directly or through a Collector.

### Observability backend

No global observability backend will be selected.

Deployment-specific systems may provide:

- trace storage;
- metric storage;
- log storage;
- dashboards;
- alerting;
- querying;
- error reporting.

Backend selection depends on operational context and is not part of Orion's foundation-level architecture.

Changing the observability backend should normally be a deployment change rather than an application architecture change.

### Browser observability

OpenTelemetry browser instrumentation will not be part of Orion's initial web foundation.

The first observability baseline applies primarily to server-side Node.js processes.

Frontend observability concerns such as:

- real-user monitoring;
- browser errors;
- Core Web Vitals;
- frontend performance;
- browser tracing;
- session diagnostics;

will be evaluated when a concrete web product requires them.

Browser observability does not need to use exactly the same implementation strategy as server observability as long as resulting integration preserves appropriate correlation and security boundaries.

### Audit logging

Operational observability is explicitly separate from business audit history.

The following are not automatically an audit trail:

```text
Pino logs
OpenTelemetry traces
OpenTelemetry metrics
```

A business audit requirement such as:

```text
who changed an invoice
what changed
when it changed
why it changed
```

may require dedicated persistent application data with its own rules for:

- integrity;
- retention;
- authorization;
- immutability;
- domain semantics;
- regulatory compliance.

An application must not rely on ordinary application logs as its only source of authoritative audit history.

## Rationale

OpenTelemetry provides a vendor-neutral observability model that can represent traces, metrics, propagation, instrumentation, and telemetry export without forcing Orion applications to depend on a particular monitoring backend.

This fits Orion's goal of preserving infrastructure portability while still providing a strong production observability baseline.

Distributed tracing is particularly valuable because large systems frequently spend significant time across multiple boundaries:

```text
HTTP
application behavior
database access
external APIs
background processing
other services
```

A trace allows those operations to be investigated as one causal workflow rather than as independent log records.

Metrics complement traces by providing aggregate time-series information appropriate for:

- dashboards;
- capacity monitoring;
- latency distributions;
- request rates;
- failure rates;
- alert conditions.

Pino remains the default logging implementation because it is already integrated naturally with Fastify and provides efficient structured logging.

Keeping logging and tracing as separate but correlated responsibilities avoids making the application's log pipeline dependent on the maturity or deployment model of a specific OpenTelemetry log implementation.

The correlation model:

```text
Pino log
    +
trace_id
    +
span_id
```

provides the practical operational benefit needed from the integration without requiring application logs and traces to use the same internal API.

An independent request identifier is retained because request-level operational correlation remains useful even when distributed tracing is unavailable or incomplete.

OTLP is selected as the preferred telemetry transport because it preserves OpenTelemetry's vendor-neutral architecture between application processes and observability infrastructure.

The Collector is preferred for production systems that require centralized telemetry processing because it can move routing, transformation, batching, and backend-specific exporting out of application processes.

However, making the Collector mandatory for every application would introduce infrastructure complexity that does not always provide sufficient value.

Therefore direct OTLP export remains valid for simpler deployments.

Explicit rules around redaction and cardinality are necessary because observability systems can themselves become security, privacy, reliability, or cost risks.

Uncontrolled logging may expose sensitive information.

Unbounded metric attributes may create excessive time-series cardinality.

Excessive tracing can generate unnecessary overhead and telemetry cost.

The strategy therefore treats observability as engineered production behavior rather than unconditional collection of all available information.

No error-reporting vendor is selected because the appropriate provider depends on deployment requirements.

Orion preserves provider independence while allowing dedicated error-reporting tools to be added at technical boundaries when they provide concrete value.

Finally, keeping operational telemetry separate from audit history prevents infrastructure logs from becoming an accidental and unreliable business record.

## Alternatives Considered

### Vendor-Specific Observability SDK as the Foundation Standard

Orion could select a platform such as Datadog, New Relic, Honeycomb, or another APM provider and use its proprietary application SDK directly.

This could provide a highly integrated initial experience.

It was not selected because Orion is intended for many future applications and deployment environments.

A globally selected vendor would create unnecessary infrastructure coupling and could complicate self-hosting, regulated deployments, cost optimization, or future vendor migration.

OpenTelemetry provides a more portable instrumentation boundary.

### OpenTelemetry for Application Logging Instead of Pino

Orion could standardize all logs directly through OpenTelemetry's logging APIs and SDK.

This would conceptually unify all telemetry signals.

It was not selected as the initial approach because Pino already provides a mature and efficient structured logging implementation that integrates naturally with the selected Fastify stack.

The practical requirement is correlation between logs and traces, not necessarily one API for all telemetry.

Pino therefore remains responsible for application logging while OpenTelemetry provides trace context and observability signals.

### Direct Export from Every Application to a Specific Backend

Each Orion service could embed the exporter required by its selected observability provider.

This can be simple in small deployments.

It was not selected as the preferred production architecture because backend-specific exporters create stronger application-to-vendor coupling and duplicate routing, authentication, batching, and transformation responsibilities across processes.

Direct OTLP export remains acceptable for simple deployments, but a Collector is preferred when centralized telemetry processing provides operational value.

### Mandatory OpenTelemetry Collector

Orion could require every deployment to operate an OpenTelemetry Collector.

This would produce a uniform telemetry architecture.

It was not selected because small applications may not benefit enough from an additional deployed component.

The Collector is therefore preferred rather than mandatory.

### Fixed Production Trace Sampling Rate

Orion could establish one default production value such as 10% trace sampling.

This would simplify configuration.

It was not selected because appropriate sampling depends heavily on traffic volume, telemetry cost, backend capabilities, and incident-response requirements.

Sampling therefore remains deployment-configurable.

### Log Bodies and Complete Request Data for Maximum Diagnostics

Orion could log complete requests, responses, headers, and payloads to maximize debugging information.

It was not selected because doing so would create substantial security and privacy risk and could significantly increase storage and processing cost.

Structured observability should record intentional diagnostic context rather than indiscriminately duplicate application data.

### Global Sentry or Equivalent Error Reporting Provider

Orion could select a dedicated error-reporting service as part of the foundation.

This would provide a ready-made error monitoring experience.

It was not selected because provider requirements differ by application and deployment.

Structured logging and tracing provide the provider-neutral foundation, while a dedicated error-reporting service may be added when required.

### Logs as Business Audit History

Orion could use structured application logs to answer business audit questions.

This appears simple because many relevant operations already produce logs.

It was not selected because operational logs generally do not provide the persistence, integrity, authorization, retention, or domain guarantees required for authoritative audit history.

Audit history remains a separate application responsibility.

### Browser OpenTelemetry Instrumentation as a Baseline

Orion could instrument React applications with OpenTelemetry from the beginning to create end-to-end traces from browser interactions to database queries.

This could provide useful distributed diagnostics.

It was not selected as part of the initial baseline because browser observability has different operational, privacy, performance, and maturity considerations from server-side instrumentation.

Frontend observability will be introduced when real application requirements justify it.

## Consequences

### Positive

- Orion receives a vendor-neutral observability foundation.
- Traces and metrics use one broadly interoperable telemetry standard.
- Pino remains a focused and mature structured logging implementation.
- Logs can be correlated with distributed traces through `trace_id` and `span_id`.
- Independent request IDs remain available for straightforward request correlation.
- Fastify and Prisma can participate in distributed traces through supported instrumentation.
- Standard trace propagation allows future distributed services to preserve causal traces.
- OTLP reduces coupling between applications and observability backends.
- The OpenTelemetry Collector can centralize production telemetry concerns when needed.
- Applications can change observability vendors without rewriting domain or application behavior.
- Production logs are machine-readable structured JSON.
- Redaction requirements reduce accidental secret and sensitive-data exposure.
- Metric-cardinality rules reduce observability-system reliability and cost risks.
- Sampling remains tunable according to real deployment characteristics.
- Error-reporting providers can be introduced without becoming global foundation dependencies.
- Operational telemetry remains clearly distinct from authoritative audit history.
- Browser observability can evolve independently when real requirements become known.

### Negative

- The observability stack contains multiple complementary technologies rather than one unified telemetry API.
- Contributors must understand the distinction between logs, traces, metrics, and audit records.
- OpenTelemetry instrumentation adds runtime and configuration overhead.
- Tracing can increase CPU, memory, network, and storage consumption.
- Excessive spans can increase telemetry cost and reduce signal quality.
- Metrics require disciplined attribute design to avoid cardinality problems.
- Trace/log correlation depends on correctly propagated asynchronous context.
- A production Collector introduces another infrastructure component when deployed.
- Vendor neutrality does not eliminate backend-specific configuration in deployment infrastructure.
- Direct stdout logging relies on the execution environment to collect and persist logs appropriately.
- Redaction configuration requires maintenance as request structures and integrations evolve.
- Browser observability is not solved by the initial foundation.
- Dedicated business audit requirements will require separate application design.

### Operational or Migration Impact

Orion already selected Pino as the Fastify runtime logger, so structured logging implementation does not require replacement.

The initial observability implementation should introduce OpenTelemetry before instrumented infrastructure is initialized.

Server bootstrap should follow an ordering compatible with:

```text
configuration
    ↓
observability initialization
    ↓
instrumentation registration
    ↓
Prisma / Fastify / HTTP infrastructure
    ↓
application composition
```

Fastify instrumentation should use `@fastify/otel`.

Prisma tracing should use the supported Prisma OpenTelemetry instrumentation compatible with the repository's selected Prisma version.

HTTP instrumentation must support distributed context propagation for inbound and outbound calls.

Pino tracing correlation should inject active `trace_id` and `span_id` values centrally rather than requiring manual fields at each logging call.

Pino configuration must establish production JSON logging and centralized redaction.

The initial server-side telemetry export should support OTLP through configuration.

Production deployments may send OTLP either:

```text
application
    → Collector
    → backend
```

or, for simpler environments:

```text
application
    → compatible backend
```

without changing domain or application code.

Telemetry resource identity must be configured explicitly for each executable service.

Sampling must be externally configurable and must not require source-code changes.

Graceful shutdown should attempt to flush buffered telemetry before process termination when practical.

No OpenTelemetry Logs SDK integration, browser instrumentation, observability vendor, or external error-reporting provider is required by the initial Orion implementation.

Repository validation should verify observability configuration and architecture where such verification can be performed mechanically.

Operational dashboards, alert thresholds, telemetry retention, and backend-specific infrastructure remain deployment concerns and may be documented by application-specific runbooks.

Routine compatible upgrades to OpenTelemetry, Pino, Fastify instrumentation, Prisma instrumentation, or OTLP exporters do not require a new ADR when the responsibilities established here remain unchanged.

Selecting a particular observability backend for one deployment does not supersede this ADR.

Replacing OpenTelemetry as the observability standard, replacing Pino as the logging strategy, or materially changing the responsibility boundaries defined here would require an ADR that supersedes this decision.

## References

Related ADR: [ADR-0003: Establish Repository Validation and Architecture Enforcement](0003-establish-repository-validation-and-architecture-enforcement.md)

Related ADR: [ADR-0004: Select Fastify as the Backend HTTP Framework](0004-select-fastify-as-the-backend-http-framework.md)

Related ADR: [ADR-0006: Select Prisma ORM for Database Access and Migrations](0006-select-prisma-orm-for-database-access-and-migrations.md)

Related policy: [error handling](../architecture/error-handling.md)

Related policy: [configuration](../architecture/configuration.md)

Related policy: [logging](../reliability/logging.md)

Related policy: [observability](../reliability/observability.md)

Related policy: [data classification](../security/data-classification.md)

Related policy: [secrets management](../security/secrets-management.md)

External reference: OpenTelemetry JavaScript documentation.

External reference: OpenTelemetry specification and semantic conventions.

External reference: OpenTelemetry Protocol documentation.

External reference: OpenTelemetry Collector documentation.

External reference: `@fastify/otel` documentation.

External reference: Prisma OpenTelemetry tracing documentation.

External reference: OpenTelemetry Pino instrumentation documentation.

External reference: Pino documentation.
