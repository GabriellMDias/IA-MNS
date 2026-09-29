# Runbook: Procedure Title

**Owner:** actual responsible owner
**Status:** active only after the procedure exists and is verified
**Environment / applicability:**
**Related alerts:**
**Required access:**

Follow [authoring policy](authoring.md), [production access](../security/production-access.md), [incident response](../security/incident-response.md), and [redaction](../security/telemetry-redaction.md). Replace prompts with current, verified details; this template is not an executable procedure or an authorization grant.

## Purpose

State the one operational condition or task handled by this procedure.

## Trigger / Symptoms

Identify observable alerts, errors, or symptoms that activate the procedure, and cases where it must not be used.

## Impact

Describe affected capabilities, scope, urgency, and data/security risk, including any known limit on impact.

## Preconditions

1. Verify the target environment and observed condition.
2. Verify required access and authorization for the planned actions.
3. Verify procedure-specific safety conditions and current state.

## Diagnosis

Order low-risk inspection before mutation: relevant metrics, alerts, logs, traces, errors, and bounded read-only checks. Establish affected scope and whether deployment, migration, configuration, or dependency changes contributed. Include expected results and evidence-based branches. Add provider commands only when tooling exists; continue only while evidence matches the procedure.

## Mitigation / Procedure

Write ordered, bounded, copyable actions with consequences, expected output, decision points, and temporary-measure removal needs. Before a destructive, irreversible, or high-risk action, explain the exact affected scope and consequences. Stop when observed state differs from the documented scope.

State whether actions are safe to repeat and how to inspect an unknown outcome before retrying. For long-running work, specify supported batch size, progress, monitoring, pause/resume, failure recovery, and concurrent-execution limits.

## Verification

Prove the intended service, security, or data state through relevant health, errors, latency, progress, integrity, authorization, revocation, or application behavior. A successful command or cleared alert alone is insufficient. Name any justified post-recovery observation period and signals.

## Rollback / Recovery

Describe safe reversal and its compatibility prerequisites, or the actual forward-recovery path when rollback is unsafe/impossible. Identify irreversible effects. Remove this section only when it does not apply.

## Escalation

Stop when evidence does not match, scope exceeds bounds, access/preconditions cannot be verified, destructive impact is unknown, corruption/compromise is suspected, recovery fails, or postconditions cannot be verified. Preserve safe evidence and identify the real escalation owner when one exists.

## Follow-Up

Record needed permanent correction, regression tests, alert/observability changes, automation, temporary-measure removal, runbook update, ADR, or post-incident review. Give follow-up work an owner; keep incident history outside this current procedure.
