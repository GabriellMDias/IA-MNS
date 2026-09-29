# Error Reporting

This policy owns unexpected-failure capture, diagnostic context, grouping, and issue triage. [Error handling](../architecture/error-handling.md) owns application failure semantics; the [public error contract](../api/error-contract.md) owns responses. Error tracking complements logs, traces, and metrics; it is neither an audit ledger nor a business analytics store.

## Current implementation and accepted direction

[ADR-0010](../adr/0010-establish-observability-logging-tracing-metrics-and-error-reporting-strategy.md) establishes central error handling, Pino logs, and OpenTelemetry correlation as the foundation. A dedicated error-reporting provider is optional and deployment-specific. No global tracker, provider SDK, source-map upload pipeline, browser crash integration, or issue-routing service is implemented. These capabilities must follow real application needs; do not add a generic provider abstraction without an application responsibility.

The API [error boundary](../../apps/api/src/app.ts) reports one `unhandled_request_error` with a stable error ID and [bounded safe diagnostics](../../apps/api/src/error-diagnostics.ts), then returns a safe [`INTERNAL_ERROR` envelope](../../apps/api/src/errors.ts). Only allowlisted error types/codes and repository-owned frame locations are retained; raw messages, arbitrary stacks, and cause objects are excluded. Authentication infrastructure failure receives a safe 503 and `authentication_unavailable` diagnostic. [Startup](../../apps/api/src/main.ts) catches configuration, initialization, connection, and listen failures, attempts bounded cleanup, and emits a fixed safe fallback record if the logger does not yet exist. [Observability](observability.md) owns current correlation and release context.

## Expected vs unexpected

Classification is semantic, not determined by an exception type or HTTP status.

| Failure | Reporting treatment |
| --- | --- |
| Modeled validation, invalid credentials, permission denial, not-found, rate limit, domain rejection, or optimistic concurrency conflict | Normal error contract; useful aggregate metrics, safe operational/security logs, and required audit events. Do not create tracker issues by default. |
| Missing required internal state, broken invariant, programming defect, unexpected provider shape, or authentication subsystem crash | Unexpected: surface safe diagnostic evidence at the owning boundary. |
| Provider business decline | Expected provider/domain outcome; distinguish it from provider availability failure. |
| Dependency outage or exhausted retries | Operational failure; report the logical failed operation where appropriate, not an issue per retry. |
| Transient failure/deadlock recovered by retry | Prefer attempt/outcome metrics, traces, and bounded warnings. Repeated or unrecoverable failures must remain visible. |
| Client offline state, cancelled navigation, unsupported extension, or external script failure | Classify against product behavior and ownership; use deliberate noise filters rather than treating every event as an application defect. |

A specific security or operational requirement may justify capturing an otherwise expected outcome; document the reason and bounded scope. Sampling does not replace correct classification.

## Report once

Each execution model needs an authoritative final boundary: HTTP handler, job runner, consumer wrapper, scheduler, CLI entry point, or client error boundary. Capture an unexpected failure once there. Intermediate layers may translate, wrap, enrich, and preserve cause without duplicate capture. If a catch intentionally consumes an unexpected failure, that layer owns reporting or another explicit way to surface it. Never silently lose it.

Prefer the actual exception or an equivalent safe structured representation over a generic string. Preserve meaningful type, internal-safe message, stack, cause chain, stable code, and diagnostic metadata where supported and permitted. Sanitization must precede export; preserving a cause never authorizes recursively serializing arbitrary exception attachments. SDK/ORM/database errors can contain credentials, request/response bodies, query values, or connection details.

Fatal startup/process failures should produce a safe diagnostic where possible even if the tracker cannot initialize. Uncaught failures that leave process state unsafe require safe termination; capture does not make continued execution safe. Fatal and short-lived processes may need a bounded best-effort flush, never indefinite shutdown waiting. Follow [lifecycle and error handling](../architecture/error-handling.md).

Client error boundaries, when introduced, should capture unexpected rendering/runtime errors, show safe fallback UI, and preserve useful correlation. Recovery must be intentional and must not conceal persistent broken state. Framework boundaries do not capture every browser rejection, resource failure, native crash, or hang; choose platform-specific coverage only where required.

## Public vs internal error

Keep public messages/codes separate from internal diagnostic evidence. Internal stacks and provider details must not leak through responses. An opaque `errorId` can connect a support reference to an occurrence, logs, and trace; it never grants telemetry access. Support staff and AI investigators need the same authorization as any other production investigator.

Capture the producing service/application, environment, deployed release, and semantic operation. Release identity must identify the actual artifact, remain correlatable after rollback, and not be confused with API, SDK, or database version. Production and non-production must be distinguishable. Meaningful tracker regression analysis requires release metadata.

Include active trace/span and request correlation where available, preferably through infrastructure rather than manual copying. Follow [logging's correlation convention](logging.md#current-implementation-and-contract); public API field names are a separate contract. Request IDs remain useful when tracing is sampled. Background work can add safe job/event identity, type/consumer, and attempt, never the entire payload. Stable error codes and bounded semantic categories may help investigation; arbitrary messages are not error codes.

## Context and capture safety

[Telemetry redaction](../security/telemetry-redaction.md) and [data classification](../security/data-classification.md) govern every field, including automatic SDK capture. Use minimum explicit safe projections. If context cannot be sanitized confidently, drop it. Never intentionally send `RESTRICTED` data; provider-side filters are defense in depth.

- Indexed tags must be stable, bounded, and safe, such as service/environment/operation/code/provider. High-cardinality request, trace, user, resource, and job IDs belong in permitted non-indexed context when provider indexing costs warrant it. Context still needs size/nesting limits and a diagnostic purpose.
- Prefer opaque actor/tenant IDs to names, email, phone, or tenant metadata. Extra personal data requires an explicit approved need. Anonymous session IDs require safe semantics and bounded retention. Device/OS/app/locale metadata should be minimized; unnecessary IP collection and precise geolocation should be disabled/minimized. Do not indiscriminately collect desktop paths, usernames, or machine names.
- Do not attach complete requests, responses, user/domain/ORM objects, configuration, provider payloads, user content, or application state. Automatic request capture must omit bodies, authorization, cookies, and query values by default; response-body capture is disabled by default. Environment capture is disabled: only explicitly allowlisted safe configuration metadata may be attached.
- Never construct exception messages containing credentials or connection strings. Keep dynamic IDs out of message text where a safe separate field provides the same diagnostic value and better grouping.
- Breadcrumb buffers must be bounded and represent recent safe navigation, interaction categories, dependency calls, or state transitions. Review automatic console/network/DOM capture before use. Prefer method, normalized route, status, and duration; exclude typed content, payloads, credentials, sensitive query strings, and unnecessary resource IDs.
- Attachments are disabled or used only with particular caution; never upload arbitrary diagnostics automatically. Screenshots require explicit classification, consent, access, and redaction rules. Session replay requires privacy/security review and is not a default. Automatic stack-frame local-variable capture is disabled unless a safe mechanism is proven.

Production tracker access follows [least privilege](../security/production-access.md), including vendor support access. [Retention and deletion](../security/data-retention.md) apply to providers storing personal data. A suspected telemetry leak follows [incident response](../security/incident-response.md): contain collection, determine affected events/providers, rotate exposed secrets where applicable, remove accessible leaked data where possible, fix the source, and add regression protection.

## Grouping and fingerprint checklist

Group occurrences by the underlying defect. Prefer provider defaults until evidence shows over-grouping of different causes or under-grouping of one defect. Ordinary deployments/line shifts should not unnecessarily split one issue. Dynamic identifiers, generated paths, and arbitrary provider messages can make grouping unstable.

Before adding a custom fingerprint, identify the defect, occurrences that belong together, failures that must remain separate, and how behavior will be validated. Values must be stable, bounded, semantic, and non-sensitive: category, operation, stable provider code, or exception class may fit. Request/user/resource IDs, email, and raw messages must not be fingerprint inputs. Give material custom grouping logic an owner and tests; avoid manual fingerprints on every error.

Deliberate filters can remove known non-actionable extension/environment/cancellation noise. Prefer stable evidence over fragile message substrings. Significant ignore rules need a reason, owner, scope, and reviewability; do not broadly ignore an exception class without understanding other failures it represents. Earlier filtering reduces privacy risk/cost but must not hide important defects.

## Source map checklist

Build transformations must not make required production diagnostics unusable. When source maps, native symbols, or mapping files are needed:

1. Generate them reproducibly and associate them with the exact deployed artifact, release/build, and platform. Incorrect maps are misleading.
2. Define trusted storage/upload and access explicitly. Do not accidentally publish application source because a tracker needs it.
3. Make upload/missing-artifact failures visible in release validation when diagnostics depend on them.
4. Verify useful stack resolution against the actual artifact; include bounded shutdown/flush behavior for short-lived crash reporting where applicable.

Native crash/hang/ANR and mobile/desktop symbolication pipelines remain conditional on selected platforms. Introducing them does not permit unrestricted device or environment capture.

## Volume and provider failure

Bound buffers, event sizes, export waits, CPU/memory/network use, and provider quotas. A failure storm must not amplify the application outage. Rate limiting, local/collector deduplication, or sampling can preserve issue existence, representative context, and frequency estimates where possible; give critical or rare failures higher retention priority. Understand provider event, attachment, indexing, and retention limits and degrade safely when reached.

Capture should normally be buffered, bounded, and non-blocking. An unavailable exporter must not normally fail business operations. Emit bounded fallback logs/metrics for capture loss or export failure without recursively reporting the tracker's own failure through itself. Development may use an isolated integration but must not trigger production incidents; ordinary test exceptions belong in CI, with test exporters or isolated environments for integration verification.

## Ownership, triage, and review

Important error groups should have an identifiable application/domain/integration owner. Routing can use reliable source/service/operation metadata; avoid brittle incidental stack-frame rules or complexity unsupported by team structure. Prioritize impact, affected operations, data integrity/security, release correlation, reproducibility, criticality, frequency, and regression status. A single corruption or boundary failure can be critical; high occurrence count or HTTP status alone does not determine severity.

Resolved tracker status is not proof of a fix. Preserve release-aware regression detection where supported, add a regression test for confirmed bugs whenever practical, and connect important issues to corrections, tests, incidents, and runbooks. Durable architectural/incident conclusions belong in the repository, not only external issue comments. Recurring high-impact failures warrant investigation/recovery guidance.

[Alerting](alerting.md) owns notification policy: actionable new issues, regressions, volume changes, fatal crashes, or critical workflow failures may notify; do not alert on every captured occurrence. Metrics express rates, traces causal execution, logs operational evidence, and trackers grouped defects. Audit records must not depend on tracker sampling, retention, or grouping.

Before adding capture, verify semantic classification, authoritative boundary, duplicate risk, preserved safe cause, release/environment/correlation, minimal classified context, grouping/volume, owner, and test strategy. Verify safety with synthetic failures/secrets and isolated capture. Do not claim provider, source-map, or deployment checks exist until implemented; available checks are listed in [validation](../validation.md).
