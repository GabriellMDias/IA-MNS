# Incident Response

This policy owns coordinated response to material reliability, security, and data incidents. It defines requirements, not deployed incident tooling or authority. Paging/escalation channels, concrete roles, severity names, legal notifications, forensic storage, and exercise schedules must follow actual product, organization, jurisdiction, and infrastructure decisions. Real repeatable procedures belong in [runbooks](../runbooks/README.md).

## Declaration and ownership

An incident requires coordinated action because service behavior, trust, confidentiality, integrity, or data lifecycle may be materially violated. Reliability, security, and data classes can overlap. An isolated transient timeout, recovered job, or replaced replica is not automatically an incident; assess impact, risk, investigation, mitigation, and coordination needs.

Detection can come from [alerts](../reliability/alerting.md), error reports, support/customers, providers, operators, or integrity checks. Declare serious incidents explicitly without waiting for perfect root cause. Every active incident must have an owner. Significant incidents may divide coordination, technical response, communication, security, and scribing; small teams can combine these responsibilities without inventing organizational roles.

Record the observed signal, environment, affected service/operation/data, first known impact, scope, trend, active release, and relevant recent changes. Maintain a useful timeline with consistent absolute timestamps and important decisions/rationale. Use one authoritative status location rather than conflicting chat threads.

## Severity

Use a small consistent severity model based on user impact, scope, urgency, data classification, privilege/trust risk, and recovery complexity. Do not confuse technical difficulty or error count with severity. A single signing-key leak can be more urgent than many benign failures. Unknown scope can justify higher urgency until evidence narrows it; change severity explicitly as facts improve.

A possible future scale distinguishes critical widespread outage/active privileged compromise/severe corruption, major workflow degradation or suspected serious compromise, localized recoverable impact, and minor contained anomalies. These categories are guidance, not a selected `SEV-*` contract or response-time promise.

## Triage and containment

Determine what is failing, who is affected, whether impact is increasing, what changed, and whether security or data is at risk. Prefer scoped reversible containment where safe, but broader containment can be justified by high risk and uncertain scope. Stop active harm before perfecting diagnosis or preserving every artifact.

Containment may disable a capability, remove traffic, pause workers/writes/deletion/exports, revoke access, or isolate affected data. These are conditional options, not authorization to execute them. Establish target scope, needed privilege, data-loss/evidence risks, reversibility, success criteria, and recovery before action where practical. Preserve evidence when safe without delaying urgent containment.

Inspect deployment, migration, configuration, feature-flag, infrastructure, and provider changes as clues. Temporal correlation is not proof. Roll back only when the earlier version remains compatible and reversal is safe; irreversible database changes, data-loss risk, or incompatible old releases may require a forward fix. A temporary freeze on unrelated changes can reduce confusion but must not block necessary mitigation.

## Evidence and credentials

Use relevant logs, traces, errors, audit, deployments, configuration, provider, and access records. For important forensic artifacts preserve source, collection time, collector, and scope without unnecessary modification. Copies remain classified production data with restricted access, secure storage, and [retention](data-retention.md). Prefer authorized references over raw records in chat, issues, PRs, email, or documentation. Minimize/redact screenshots.

Disk images, database exports, memory dumps, and network captures can contain credentials and broad private data. Require scoped, authorized, bounded collection and suitable protection. Incident urgency does not suspend privacy or justify unrestricted exports, secrets in incident channels, or indefinite raw evidence retention. Authorized holds/extensions must remain scoped under retention policy.

Treat potentially exposed credentials as compromised according to risk; absence of observed abuse is not proof of safety. Follow [secrets management](secrets-management.md#secret-rotation). Depending on active harm, either revoke immediately or introduce replacement, update consumers, verify, then revoke old material. Consider dependent user/admin/service/refresh sessions, signing-key compatibility, and invalidation. Review access, permission changes, affected resources, and attacker persistence. Deleting leaked files or telemetry does not restore credential secrecy.

## Correction and recovery

Containment reduces harm; eradication removes cause or malicious persistence. Track temporary mitigations separately from permanent fixes. Correct the actual defect, vulnerable dependency, unauthorized account/grant, injected configuration, or broken lifecycle rather than declaring a feature disablement a permanent solution.

Restore normal operation only with reasonable evidence that harm is contained, critical invariants hold, and dependencies/monitoring and renewed containment options are ready. Recovery may need canaries, gradual traffic, controlled queue resume, rate limits, priority, or batching. Backlog processing must account for duplicate/stale messages, idempotency, current authorization, and provider side effects.

Distinguish provider failure from application integration defects; provider status pages are supporting evidence, not proof of application behavior. Provider compromise can require rotation, exposure assessment, disablement, and coordinated communication.

For corruption/loss, choose the smallest correct repair or restore. A production restore can overwrite current data and requires explicit authorization plus recovery-point/data-loss, schema compatibility, and retention/deletion analysis. Point-in-time recovery, if supported, still needs scoped verification and reconciliation. Follow [data retention and restoration](data-retention.md#backups-restore-and-deletion-replay) and applicable migration/compatibility policy.

## Recovery verification and incident closure

A cleared alert or successful command alone does not establish recovery. Verify affected user behavior, relevant error/latency/progress/health signals, backlog control, data counts/invariants/reconciliation, and security properties. Confirm compromised credentials are unusable, unauthorized permissions/persistence are removed, and protective controls work. High-impact recovery may need a justified observation period to detect relapse.

Close only after impact has ended, safe operation and critical recovery are verified, final scope/severity are understood, required communication is complete, evidence is safely stored, and emergency access is revoked or handled under its explicit expiry. Any unresolved cause or temporary mitigation needs owned follow-up; do not silently leave it as permanent architecture.

## Communication and authority

Share accurate, timely, audience-appropriate updates when impact/severity/scope changes, major mitigation occurs, recovery begins, or resolution is verified. State confirmed facts, working hypotheses, and open questions separately. Include affected function, impact onset, current mitigation, and required user action where appropriate without exposing secrets or unnecessary active-vulnerability detail.

Coordinate relevant responders, support, customers, partners, leadership, and security/legal stakeholders according to real need; not every incident reaches every audience. External disclosure timing and legal notification obligations depend on actual jurisdiction, data, scope, contracts, and organization. This document invents neither deadlines nor authority to send messages.

[Production access](production-access.md) still applies during incidents. Scoped temporary elevation and emergency timing do not create universal administration. Break-glass is for genuine normal-control-path failure/insufficiency and must be reviewed afterward. Reconcile emergency repository-managed configuration or infrastructure changes back into source control.

## AI assistance and automation

Authorized agents can correlate safe evidence, synthesize timelines, inspect source, find runbooks, and propose hypotheses. An incident does not grant an agent extra production authority. Keep raw secrets outside its context and prefer sanitized evidence to broad exports. Plausible AI explanations remain hypotheses until supported; never execute destructive mitigation solely because one sounds convincing. Agent recommendations/actions need the same authorization and verification as human actions.

Automation can collect safe diagnostics or perform explicit bounded actions when tested. High-impact automated containment requires confidence and acceptable false-positive risk; prefer reversibility. Repeated self-healing may expose underlying instability and should be observable. Do not introduce automated containment, arbitrary incident channels, or new operational tooling as a documentation placeholder.

## Post-incident review

Significant incidents need a durable proportional review of impact/timeline, detection, cause/contributors, response/recovery, what worked, friction, and where luck limited harm. Avoid blame and simplistic “human error” conclusions: identify why unsafe action was possible, detection delayed, and recovery hard. Blameless review still requires accountable owners and corrections.

Prioritize concrete actions by recurrence risk, impact reduction, and effort. Prefer tests, schema constraints, safer defaults/permissions, CI checks, bounded repair tools, better alerts, and tested recovery over reminders or many low-value tasks. Confirmed software defects should receive meaningful regression tests whenever practical. Add targeted safe telemetry rather than dumping payloads after an investigation gap.

Incident histories may live in the incident system; durable policy, tests, tooling, runbooks, and significant ADR decisions belong in the repository. Update recurring-response runbooks only for real repeatable conditions. Track temporary mitigation removal, detection gaps, access/redaction/retention improvements, and completion ownership.

Incident metrics may assess detection, containment, recovery, and recurrence, but must define ambiguous terms such as MTTR and not rank individuals simplistically. Averages hide distributions; incident count alone ignores severity. Exercise relevant response through safe tabletop scenarios, synthetic security cases, restore/rotation drills, or controlled failure injection as maturity permits. Untested recovery capabilities must not be assumed reliable.

## Incident response checklist

At declaration, identify owner, impact/time/environment, scope/severity, security/data risk, current trend, safe containment, evidence, relevant changes, and communication audience. For security, include affected identity/credential/boundary, continuing access/persistence, revocation and verification. For data, include affected subjects/copies, safe writes, restore/reconciliation and obligations. For reliability, include user capability, dependencies, release compatibility, backlog, and recovery evidence.

Before closure, verify service/security/data recovery, temporary-access handling, evidence retention, communication, and owned mitigation/corrective follow-up. Significant lessons must update their canonical policy or implementation rather than remaining only in incident prose.
