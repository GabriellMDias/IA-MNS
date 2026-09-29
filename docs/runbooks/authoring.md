# Authoring and Using Runbooks

Use the [index](README.md) and [template](template.md). Runbooks are current, repeatable operational procedures for authorized operators, not architecture explanations, ADRs, incident histories, or speculative troubleshooting notes.

## Applicability, scope, and ownership

Create a runbook for a real runtime, dependency, workflow, or recurring incident when response is non-obvious, risky, time-sensitive, or dependent on individual knowledge. Do not create hypothetical systems, commands, organizational roles, or empty index entries.

Handle one coherent condition or procedure per runbook. Use a descriptive English filename such as `<condition-or-operation>.md`; avoid generic collections of unrelated production problems. Use concrete symptom, service, dependency, error-code, alert, and operation terminology so the procedure is searchable.

Every runbook should have an identifiable owner, even across several systems. The owner maintains commands, links, permissions, safety assumptions, and recovery behavior. An active runbook represents an implemented operation in its stated environment. A deprecated one should identify its reason and replacement where relevant. Remove obsolete procedures when they no longer provide value; Git preserves history. Add lifecycle complexity only when needed.

## Required procedure information

Follow the template with sections that justify their operational value:

| Section | What the operator needs |
| --- | --- |
| Purpose and trigger | The specific condition, request, alert, or error that makes the procedure applicable |
| Symptoms and non-applicability | Observable evidence and cases where the procedure should not be used |
| Impact | Affected capabilities, scope, urgency, and data/security risk |
| Preconditions and access | Observable checks, target environment, required capabilities, and safety conditions |
| Diagnosis | Ordered low-risk inspection, expected output, and evidence-based branches |
| Mitigation/procedure | Bounded actions, consequences, warnings, and temporary measures |
| Verification | Evidence of the intended service, security, or data state |
| Rollback/recovery | Reversal prerequisites or a real forward-recovery path |
| Escalation | Stop conditions and an actual owner or escalation target when one exists |

Preconditions must be verifiable; assumptions describe environmental expectations and should be explicit when their violation changes safety. Check applicability, environment, access, current procedure state, and preconditions before execution. Do not skip safety conditions merely to work faster.

## Diagnosis and command safety

Prefer low-risk observability before invasive production access: metrics, alerts, logs, traces, error reports, safe read-only inspection, then privileged diagnostics where appropriate. Avoid premature mutation while the failure is poorly understood unless active harm requires immediate containment.

Commands must be specific, bounded, copyable, and current when tooling exists. Do not invent provider-specific commands or placeholders and present them as executable procedure. Describe expected output and its meaning; include explicit branches when actions depend on evidence. Keep decision trees simple enough to use under pressure.

Prefer read-only, timeout-limited, bounded database queries, using known indexes where applicable. Explain production impact. Avoid embedding secrets in commands, shell history, process arguments, or documentation. Use credential references and secret-management procedures. Do not reuse service credentials or shared administrator accounts to bypass access policy.

Mark destructive, irreversible, and high-risk actions before execution with the concrete affected scope and consequences, not a generic warning. Verify authorization, scope, reversibility, and the verification method, and use the appropriate approval mechanism. A runbook is guidance, not unconditional permission or additional delegated capability.

## Mitigation, recovery, and verification

Mitigation reduces impact without necessarily correcting the cause. Explain what each important mitigation restores, disables, or puts at risk. Mark temporary measures and their follow-up/removal needs. Recovery restores safe normal operation; verify its prerequisites and restore progressively where risk warrants it.

Every state-changing procedure should define outcome verification. Command success or a cleared alert alone is not proof. Use relevant health, error-rate, latency, progress, data-integrity, or credential-revocation evidence. Where needed, prove that the previous unsafe behavior is no longer possible. Specify post-recovery observation signals and justified observation periods rather than arbitrary delays.

Document rollback only when real and safe; identify compatibility prerequisites. If rollback is unsafe or impossible, state that and provide the forward-recovery direction. Explicitly identify irreversible actions before execution.

Stop when evidence no longer matches the procedure, preconditions or required access cannot be verified, scope exceeds documented bounds, destructive effects are unknown, recovery fails, or corruption/security compromise is suspected. Preserve useful evidence and escalate rather than improvising outside the known safe scope. Identify actual escalation targets when organizational structure exists.

## Integration with policy and operational evidence

- [Production access](../security/production-access.md) governs least privilege, authorization, elevated roles, and break-glass. Break-glass is for genuine emergencies where normal access is unavailable or insufficient, not a default first step.
- [Incident response](../security/incident-response.md) governs incident declaration, severity, communication, recovery evidence, and follow-up. Incident urgency does not expand an agent's authority.
- [Observability](../reliability/observability.md) and [health checks](../reliability/health-checks.md) govern investigation signals. Reference stable events, fields, metrics, operations, error codes, and relevant spans rather than fragile message strings or vague “check logs” instructions.
- [Alerting](../reliability/alerting.md) connects alerts to runbooks; reference the canonical alert name where possible. Add real provider queries and links only when the tooling exists.
- [Data classification](../security/data-classification.md), [redaction](../security/telemetry-redaction.md), [secrets](../security/secrets-management.md), and [retention](../security/data-retention.md) govern sensitive outputs. Temporary exports need a storage location, access scope, retention, and deletion method.

## State-changing and long-running operations

Data repair must identify the invariant, affected scope, desired canonical state, repair, verification, and recovery. Prefer reviewed repository-controlled scripts over inline copies of complex code. Identify the relevant script revision/release when version-sensitive. Use dry runs before destructive execution where valuable and explain preview results.

State whether an operation is safe to repeat. Resolve unknown outcomes by inspecting actual state before retrying. For batch or long-running operations, document batch size, progress, monitoring, failure handling, safe pause, and resume behavior where supported. Say explicitly when concurrent execution is unsafe; tooling should eventually enforce that restriction where practical.

## Exercise, maintenance, and automation

Important procedures should eventually be exercised through controlled staging, synthetic failures, tabletop exercises, restore tests, or game days. Do not test destructive instructions against real production data merely to prove documentation works. Backups require real restore tests; successful backup creation alone is insufficient. Exercise credential rotation before an emergency where possible.

Review after architecture, tooling, permissions, dependencies, or incident evidence changes. After significant use, assess accuracy, missing steps, confusion, and opportunities for automation. Treat drift as an operational defect. Calendar review can be added when operational maturity justifies it.

Repeated deterministic procedures are candidates for scripts, purpose-built tools, and safe automatic recovery. Runbooks can remain orchestration and verification guides. Where safe self-healing exists, alert on failed recovery or recurring instability rather than keeping humans as the primary mechanism.

`pnpm docs:check` already checks local links, headings, and reachability. Runbook ownership, command applicability, safety, and recovery semantics still require review. Future focused checks may cover metadata, known command wrappers, scripts, or supported arguments; avoid rigid parsing that makes simple procedures difficult to maintain. Runbook files remain canonical if an index is later generated.

## Creation and follow-up

Confirm a real repeatable condition, copy the template, identify ownership/access, write triggers and preconditions, then diagnosis, action, verification, recovery, warnings, and escalation. Review security and operational safety and exercise the procedure where practical.

After recovery, consider permanent correction, regression tests, alert/observability changes, automation, revised warnings or verification, a runbook update, an ADR, and post-incident review based on observed evidence. Incident tooling, provider queries, command wrappers, metadata format, index generation, and review cadence remain dependent on actual operational needs and tooling.
