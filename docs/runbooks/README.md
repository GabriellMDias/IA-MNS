# Runbooks

No operational runbooks exist yet. This directory contains the [authoring policy](authoring.md), [template](template.md), and [local instructions](AGENTS.md). Add index entries only for real procedures when the corresponding runtime and operational tooling exist.

Existing contributor procedures have narrower owners: [local setup](../setup.md), [validation](../validation.md), and [database release/evolution](../database/release-evolution.md). No production environment is selected; authoring guidance does not activate deployment-specific work.

Runbooks describe current repeatable operations, not hypothetical systems or historical incident narratives. A procedure does not grant authority: [production access](../security/production-access.md) and [incident response](../security/incident-response.md) continue to apply.

## Create a procedure

Read the [authoring policy](authoring.md#creation-and-follow-up), choose one real condition, and copy the template. Identify ownership, triggers, required access, verifiable preconditions, bounded diagnosis/actions, recovery verification, and stop/escalation conditions. Do not invent provider commands.

## Find related policy

- [Health checks](../reliability/health-checks.md) and [observability](../reliability/observability.md) for diagnostic evidence.
- [Alerting](../reliability/alerting.md) for actionable signals and runbook references.
- [Secrets](../security/secrets-management.md), [classification](../security/data-classification.md), and [retention](../security/data-retention.md) for safe handling of credentials, evidence, and temporary exports.
- [Documentation task index](../README.md) for other current policies.
