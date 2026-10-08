# Alerting

This policy owns actionable alert conditions, severity, ownership, notification, and rule maintenance. [Metrics](metrics.md) owns measurement semantics; [incident response](../security/incident-response.md) owns incidents; [runbooks](../runbooks/README.md) own executable procedures. Alerts direct human or automated attention to a condition requiring action, rather than notifying merely because a signal exists.

## Current scope

[ADR-0010](../adr/0010-establish-observability-logging-tracing-metrics-and-error-reporting-strategy.md) leaves the observability backend and deployment alerting infrastructure application-specific. The API has runtime telemetry and health checks. The production host tooling exposes verifiable failure signals: `ia-mns-deploy status` exits non-zero when the API is unhealthy, the last daily backup is older than 26 hours or the last restore verification is older than 8 days, and failed deployments, backups and restore verifications run an optional notifier (`IA_MNS_ALERT_COMMAND`) ([ADR-0031](../adr/0031-deploy-on-one-ubuntu-host-with-docker-compose-and-a-release-tool.md)). The alert channel is an open owner decision; there are no paging provider, on-call schedule, service objectives, or alert-as-code validation. This policy establishes constraints for introducing them; it does not authorize or start deployment work.

Provider, severity taxonomy, channels/escalation, SLO tooling and burn-rate thresholds, ownership metadata, maintenance windows, and rollback integration must follow actual team structure, topology, service expectations, and operational tooling. Significant architectural choices require an ADR. Do not invent deployment thresholds or missing capabilities to fill documentation.

## Alert severity and response

Use a small consistent severity model whose levels determine response time, channel, and escalation. Severity reflects impact and urgency, not alarming wording or one HTTP error. The following is conceptual guidance, not a selected severity taxonomy or response-time commitment.

| Impact | Appropriate response |
| --- | --- |
| Major outage, data integrity/security risk, critical workflow unavailable, widespread failure without recovery | May require immediate paging. |
| Substantial degradation, increasing failure rate, important dependency failure, or backlog threatening objectives | Prompt action; page only when it cannot safely wait. |
| Limited degradation with workaround or actionable capacity trend | Business-hours notification or owned work item may fit. |
| Noncritical trend, deprecation use, or an isolated automatically recovered instance | Dashboard/periodic review; avoid competing with urgent alerts. |

Paging is for a reliable condition requiring action before the next normal working period, with an authorized recipient who can mitigate it. Safe automatic recovery may eliminate the need to page. Critical unacknowledged alerts need an escalation path; broadcasting to everyone is not ownership. Email suits slower risks; critical incidents must not rely only on easily missed chat notifications.

Production and non-production must be distinguishable. Staging may notify development/release owners; local development should not generate operational alerts, and ordinary test failures should fail CI rather than page production responders.

## Symptom-based alerting

Prefer evidence of user/service impact: valid requests failing, latency objectives violated, work missing deadlines, or a critical operation unavailable. Cause metrics support investigation. Preventive cause alerts are appropriate when a known risk, meaningful response window, and effective action can prevent impact, such as full storage, expiring certificates, recovery-threatening replication lag, or an undrainable queue.

An alert must answer what action follows. If none is required, use a dashboard, metric, log, periodic review, or ticket as appropriate. Before adding a signal, inspect existing symptom alerts for the same incident. Do not page separately on every error, restart, unready replica, retry, short circuit-breaker transition, or arbitrary resource percentage.

Prefer safe, understood, verifiable automatic recovery; notify when it fails, repeats excessively, threatens capacity/redundancy, or leaves meaningful impact. Unique/stateful instances and data-risk failures may justify instance-level alerts even when stateless replicated services use service-level aggregation.

## Alert ownership and context

Every alert must identify an owner able and authorized to act. Ownership can follow service, domain, application, or infrastructure responsibility. Shared dependency failures need coordinated response across infrastructure and affected application owners, not independent competing investigations.

Use stable semantic names describing the condition; keep volatile thresholds in configuration. Names, ownership, severity, service, environment, and signal type should be machine-readable where tooling supports it. Do not group alerts primarily by arbitrary message text or use high-cardinality personal data in queries.

A concise notification should explain impact, duration, current value versus threshold/objective, release when relevant, owner, and first investigation step. Link directly to useful dashboards/runbooks and safe trace/error references where available. Investigators should be able to connect the condition to affected service/release, metrics, error groups, traces, and recovery guidance.

Notifications must contain only safe operational context. Chat/paging access may be broader than production telemetry: keep detailed evidence in authorized systems, and never include credentials, raw payloads, personal data, or restricted identifiers. Follow [telemetry redaction](../security/telemetry-redaction.md) and [production access](../security/production-access.md), including for AI investigation.

Acknowledgement assigns response ownership; it does not resolve the condition. Alert resolution means the triggering condition cleared, not that the root cause is permanently fixed or the incident is closed. [Incident response](../security/incident-response.md) determines proportional coordination and closure based on impact, duration, data/security risk, and involved owners. Incidents may arise without an automated alert, and not every alert becomes an incident.

## Thresholds, windows, and missing data

Thresholds require evidence: real service expectations/SLOs, capacity/safe limits, deadlines, known operational requirements, or an appropriate historical baseline. Never invent arbitrary availability percentages or round resource thresholds. Dynamic/anomaly rules add false-positive risk; use them when simpler rules cannot express the condition effectively.

Persistence windows, hysteresis, and aggregation can reduce flapping. Choose duration from time-to-impact; corruption, all replicas unavailable, or security breach indicators may require immediate action. Slow risks should allow useful remediation lead time. A pending period is a deliberate delay, not a universal requirement. Recovery thresholds/notifications should represent actual improvement.

Define missing-data semantics explicitly: no traffic, dead service, failed exporter, and renamed metric are different states. Absence must not silently equal healthy zero. Observability pipeline impairment can justify an alert when diagnostic capability is materially lost; avoid one page per backend hiccup. Telemetry failure should not normally break business operations, but prolonged blindness can require intervention.

## SLO-based alerting

When meaningful SLOs exist, prefer user-impact measurements from accurate SLIs. Define eligible/successful requests or events and distinguish technical failures from expected client/business outcomes. An incorrect denominator makes the alert misleading.

An error budget is the permitted failure allowance over the objective window. Burn rate describes consumption relative to the rate that would exhaust that allowance over the window: a rate of one follows that planned rate. Fast burn over short windows may require paging; slower sustained burn may justify less urgent work. Short and longer confirmation windows can reduce transient false positives. Select formulas, thresholds, windows, and slow-burn coverage only against actual objectives and validate behavior.

Infrastructure alerts can coexist with SLO alerts when they detect distinct preventive risks. A service objective should not be fabricated to justify an existing metric threshold.

## Choosing the signal

| Surface | Decision rule |
| --- | --- |
| Error rate | Use a meaningful denominator and enough traffic. Low-volume services may need minimum counts, longer windows, or absolute failure conditions. Expected business declines are not availability failures. |
| Latency | Prefer distributions or objective thresholds to averages alone; tail percentiles such as p99 can be unstable at low volume. |
| Queue | Combine age, arrival/processing throughput, drain capacity, deadlines, and backlog. Depth alone does not establish impact. Dead letters matter when important work has exhausted recovery; one malformed noncritical item may not page. |
| Dependency | Measure the application's observed impact; a provider status page is supporting context. Coordinate shared-provider incidents. |
| Database | Consider sustained latency, deadlock surges, unavailability, recovery-threatening lag, or pool saturation causing waits/timeouts/failures. Do not alert on every slow-query fingerprint prematurely. |
| CPU/memory | Use demonstrated saturation, latency, lost headroom, unexpected growth, eviction/restart, or known failure limits. High healthy utilization alone is insufficient. |
| Storage, certificates, expiring secrets | Give enough preventive lead time. Prefer automated renewal/rotation where safe rather than relying only on notifications. |
| Backups/restore | Distinguish one retryable attempt from recovery objectives at risk. Successful backup creation does not establish recoverability; restore verification can have separate signals. |
| Migration | Production failure must immediately become visible to deployment systems. Human paging depends on release state, impact, and safe recovery. |
| Readiness/liveness | Assess ready capacity, redundancy, duration, traffic, and restart loops. A healthy pool should usually recover one stateless replica automatically. |
| Error tracker | New actionable issues, regressions, fatal crashes, or frequency changes may matter. Unsupported client-extension noise does not deserve the same response as a critical backend workflow failure. |
| Security/audit | Security-specific detection/escalation follows incident policy. Recording a privileged action does not automatically require notification; suspicious or policy-significant conditions may. |
| Quota/cost | For quotas consider consumption, growth, and time until reset. Reliable trends can support preventive work; budget notifications are not automatically reliability incidents. |

## Deduplication, maintenance, and deployment

Aggregate identical replica failures into the service condition. A primary symptom can page while related dependency signals remain supporting context. Parent-condition suppression must not hide unrelated independent failures.

Maintenance suppression must be explicit, owned, scoped, and time-bounded. Do not permanently mute alerts or disable all alerting during every deployment; releases are when regressions often appear. Suppress only known expected behavior for its actual window, and correlate alerts with recent deployment/release annotations where practical.

Canary comparison and automated rollback remain deployment capabilities, not foundation defaults. Any automation needs high-confidence signals, clear rollback safety, bounded execution, and auditability. Never attach noisy alerts to destructive automated actions. Canary error/latency/critical-success comparisons must follow an actual release policy.

## Rule lifecycle and noisy alert review

Prefer version-controlled, reviewed, reproducible rules where tooling supports them. Provider-side manual rules may be acceptable during early experimentation; long-term critical detection should be reproducible from repository-controlled configuration. Review critical changes like production code.

Validate query syntax, metric/label existence, expressions, metadata, and runbook links with available tools. Critical rules need meaningful healthy/unhealthy/recovery evidence through query fixtures, rule tests, or safe staging simulation. Document unavailable checks rather than claiming verification.

High-severity alerts should have useful runbooks when practical. Prioritize recurring high-impact gaps. A runbook should identify actual signals/queries, common causes, safe mitigation, verification, and escalation rather than merely saying "check logs". Follow [runbook authoring](../runbooks/authoring.md); a runbook does not grant operational authority.

Treat chronic noise as a defect. Review signal, threshold, duration, flapping, expected behavior, ownership, automatic recovery, duplicate coverage, severity/channel, and whether automation or a root-cause fix removes recurring manual work. Raising thresholds, permanent muting, or deletion without understanding the signal is not a fix. Before removing an established alert, identify its original purpose, replacement coverage, and dependent runbooks.

As operational needs grow, assess pages per incident, false positives, alerts with no action, acknowledgement time, and repeated noise. Measurements should guide improvements rather than create another alert stream.

## New alert checklist

Before creating or changing an alert, establish:

1. The condition, actual impact/risk, required action, urgency, and authorized owner.
2. A stable reliable signal, meaningful denominator/missing-data semantics, justified threshold, persistence/recovery behavior, and representative tests.
3. Whether safe recovery, an existing symptom alert, aggregation, or a work item better addresses the condition.
4. Safe concise context, correct environment/channel/escalation, and useful investigation/runbook links.
5. For paging: why action cannot wait, whether the recipient can mitigate it, and how duplicate pages and unacknowledged incidents are handled.
6. For SLO/resource alerts: real objective/eligible population or safe capacity/deadline, expected impact, and sufficient lead time for the response.

An alert is not ready if its impact, action, ownership, or threshold justification cannot be explained. Available repository checks are listed in [validation](../validation.md); deployment-specific alert tooling remains conditional.
