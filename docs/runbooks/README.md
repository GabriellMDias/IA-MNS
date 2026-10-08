# Runbooks

This directory contains the [authoring policy](authoring.md), [template](template.md), [local instructions](AGENTS.md), and the production procedures for the single-host deployment of [ADR-0031](../adr/0031-deploy-on-one-ubuntu-host-with-docker-compose-and-a-release-tool.md). They are drafts: every command is exercised by the disposable installation rehearsal in CI, and none has run on the production host yet.

| Procedure | Use when |
| --- | --- |
| [Production host setup and first deployment](production-host-setup-and-first-deployment.md) | Preparing a host and running the first release |
| [Production release update and rollback](production-release-update-and-rollback.md) | Installing a newer release or returning to an earlier one |
| [Production backup and restore](production-backup-and-restore.md) | Taking, verifying or restoring database backups |
| [Production secret rotation](production-secret-rotation.md) | Replacing a credential or key |

The files these procedures run are described in [`infra/production`](../../infra/production/README.md). Add index entries only for real procedures when the corresponding runtime and operational tooling exist.

Existing contributor procedures have narrower owners: [local setup](../setup.md), [validation](../validation.md), and [database release/evolution](../database/release-evolution.md).

Runbooks describe current repeatable operations, not hypothetical systems or historical incident narratives. A procedure does not grant authority: [production access](../security/production-access.md) and [incident response](../security/incident-response.md) continue to apply.

## Create a procedure

Read the [authoring policy](authoring.md#creation-and-follow-up), choose one real condition, and copy the template. Identify ownership, triggers, required access, verifiable preconditions, bounded diagnosis/actions, recovery verification, and stop/escalation conditions. Do not invent provider commands.

## Find related policy

- [Health checks](../reliability/health-checks.md) and [observability](../reliability/observability.md) for diagnostic evidence.
- [Alerting](../reliability/alerting.md) for actionable signals and runbook references.
- [Secrets](../security/secrets-management.md), [classification](../security/data-classification.md), and [retention](../security/data-retention.md) for safe handling of credentials, evidence, and temporary exports.
- [Documentation task index](../README.md) for other current policies.
