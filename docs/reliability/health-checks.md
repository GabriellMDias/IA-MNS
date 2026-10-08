# Health Checks

This policy owns startup, liveness, readiness, and diagnostic-health semantics. Probes answer narrow operational questions; [metrics](metrics.md), [alerts](alerting.md), synthetic monitoring, and full diagnostics serve different purposes. The application owns dependency criticality; shared mechanisms or an orchestrator must not infer it automatically.

## Current API contract

The implemented [health contracts](../../apps/api/src/health-contracts.ts), [handlers](../../apps/api/src/app.ts), and [lifecycle](../../apps/api/src/lifecycle.ts) define three endpoints with `200`/`503` and minimal `{ "status": "ok" | "unavailable" }` responses:

| Endpoint | Current behavior |
| --- | --- |
| `/health/startup` | Unavailable while lifecycle is `starting`; successful after leaving that phase |
| `/health/live` | Successful until lifecycle reaches `stopped`; does not query PostgreSQL |
| `/health/ready` | Successful only in `ready`, plus the feature's database check when configured; dependency failure or a 500 ms wait deadline makes it unavailable |

In production the container healthcheck runs `dist/cli/health-probe.js`, which asks `/health/ready` on loopback (over HTTPS when the internal TLS listener is configured); Docker does not restart an unhealthy container, which matches the readiness semantics below, and `ia-mns-deploy` waits for it before a release is considered started ([ADR-0031](../adr/0031-deploy-on-one-ubuntu-host-with-docker-compose-and-a-release-tool.md)). When the API serves the web build at one origin, the same three endpoints also answer under `/api/health/*`, the path the browser contract uses; orchestration keeps the root paths ([ADR-0029](../adr/0029-serve-the-web-and-api-from-one-origin-behind-restricted-trusted-proxies.md)).

[Bootstrap](../../apps/api/src/main.ts) validates configuration, checks configured database connectivity, listens, then marks ready. Shutdown begins drain before closing HTTP and resources. Ordinary requests during draining/stopped receive a safe unavailable response. The readiness wait deadline does not itself cancel the underlying database operation. The current handler verifies connectivity, not full schema compatibility or every business capability.

Health paths/status/schema are implemented contracts, not deferred choices. Orchestrator probe frequency/thresholds, deployed routing, diagnostics authorization, uptime/synthetic monitors, and recovery objectives remain deployment-specific. Global response logging/instrumentation currently includes health traffic; the noise guidance below is an intended improvement, not existing exclusion behavior.

## Liveness

Liveness asks whether the process can make progress and whether restarting has a reasonable chance of repair. Prefer cheap process-local evidence such as irrecoverable state or inability to serve the handler. A remote database, cache, broker, identity, or provider outage normally does not justify restarting otherwise healthy replicas. Dependency-coupled liveness can amplify shared outages, startup load, and loss of evidence.

Use runtime/platform controls where adequate instead of fragile custom memory/disk/event-loop thresholds without evidence. High load or memory pressure is not automatically death; rate limiting/backpressure may remain safe. Serverless/client runtimes need appropriate initialization/reachability behavior, not forced container-style endpoints.

## Readiness

Readiness asks whether this runtime can safely accept its expected work now. Failure normally removes new traffic/job claiming without terminating the process. Consider required initialization/configuration, truly critical dependencies/resources, and draining. A process can be live and unready while a dependency recovers.

Classify dependencies by actual application responsibility. Optional email/analytics/cache failure may permit degraded operation; a broker can be critical for a worker without being critical to a read API. A nominally optional cache can become critical if fallback overloads the database, so use tested behavior. Do not map every circuit breaker, dependency outage, or individual module to whole-process unready automatically.

Define “degraded” explicitly if used. Independent read/write capabilities may justify scoped routing, separate runtimes, or bounded degraded responses when real requirements demand it; do not create dozens of probes preemptively. Health aggregation for a dashboard is not orchestration health authority. Readiness is minimum work-acceptance evidence, not complete correctness, SLO compliance, or a customer-specific domain validation.

## Startup check and shutdown

Startup distinguishes legitimate initialization time from failure. Bound initialization and fail visibly when it cannot finish. Invalid required configuration generally needs fast failure, while recoverable dependency outages may allow a process to wait/recover if designed to do so. Permanently bad credentials must become observable configuration defects rather than indefinite restart loops. Validate expensive deterministic configuration/schema compatibility at an appropriate boundary rather than repeating full inspection per probe.

A runtime known to be incompatible with its database schema must not serve unsafe work; the current API connectivity probe does not establish that guarantee. Readiness must precede deployment success, not process creation alone.

On shutdown/maintenance, become unready, stop new work, drain in-flight operations within the allowed window, then terminate. A draining process can remain live. Workers must stop claiming and follow their queue's safe completion/release semantics. Do not use liveness failure simply to take an instance out of traffic. Deployment rollback/failure decisions must follow actual release policy and compatibility.

## Probe safety and dependency cost

Checks must be read-only, cheap, deterministic, and bounded. Never create/delete business records, send messages/email, charge payments, or mutate providers as a routine probe. Avoid data-dependent/random sample rows, full scans/joins, migration replay, schema diffs, all-system tests, and full integrity validation. Cheap connectivity/constant queries should use runtime credentials where practical so an administrator's success does not hide runtime permission failure.

Do not poll every third party on every probe. Provider checks can consume quotas, cost, and availability; observed error/latency/circuit state may be better evidence. Readiness can remain valid when the service safely queues, retries later, degrades, or returns bounded dependency failures. Long integrity checks belong to separate monitoring unless a discovered defect makes work unsafe.

Each dependency wait needs a short timeout, with total latency comfortably inside the caller's budget. Parallel independent checks can help but must remain resource-bounded. Account for replica count × frequency, concurrent checks, lingering work after wait deadlines, and recovery thundering herds. Probe cost should not scale with user/table/history size. Define success/failure thresholds or hysteresis only when needed to balance responsiveness and flapping; cached health introduces explicit staleness/recovery delay.

Keep health handlers simple and responsive during partial degradation. Basic transport/security/correlation middleware may apply; avoid expensive business orchestration or authorization where unnecessary. If saturation prevents safe new work, readiness needs a deliberate decision coordinated with timeouts/retries/backpressure, not a generic restart rule.

## Output, monitoring, and security

Machine probes need deterministic minimal state and matching transport status. Detailed diagnostics are a separate authorized surface with stable logical dependency names, not raw hostnames/IPs, configuration, topology, credentials, stack traces, or exceptions. An unauthenticated minimal probe must not become an account/tenant/session inspection endpoint. Network isolation can support probe access but never authorizes a public diagnostic dump.

Probe response schemas and behavior are compatibility contracts for load balancers, orchestrators, deployers, and monitors. Coordinate changes with consumers. Public correlation IDs are optional and must remain safe. Prefer state-transition evidence over a log/error issue per poll; suppress/sample routine successes and avoid repeated warnings during known outages. Trace health sparingly and use underlying dependency signals where possible.

Probe failures alone do not determine incident urgency: assess duration, replicas, traffic, error rate, and actual capability. One failed replica may recover automatically; all unready replicas can indicate a shared dependency or bad release. Uptime checks answer external DNS/TLS/routing/reachability; synthetic transactions use isolated data and separate safety controls to test real workflows. Neither replaces readiness.

## Health check testing and review

Test actual startup, required-dependency failure, optional degradation where supported, liveness independence, invalid configuration, bounded wait, drain/new-work rejection, safe response shape, and critical recovery transitions. Complex caching/hysteresis needs transition coverage. Do not use production business records as probe fixtures.

Before changing a check, identify consumer/owner, exact question, expected recovery action, dependency criticality, safe work during outage, runtime identity, full-scale cost, timeout/cancellation semantics, response security, compatibility, and tests. Add a real runbook only for known repeatable failures. Consult [validation](../validation.md) and the runtime README for available checks; hosting integrations remain out of scope until selected.
