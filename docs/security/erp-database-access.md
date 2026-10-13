# ERP Database Access

[ADR-0033](../adr/0033-use-one-reader-and-the-existing-administrator-per-erp.md) records the owner's definitive decision. This policy covers external ERPs, not IA-MNS's own PostgreSQL migration/runtime separation.

## Exactly two access identities per ERP

| ERP | Runtime reader | Administration and Discovery |
| --- | --- | --- |
| Sankhya / Oracle | `IA_MNS_RO`, provisioned with verified reads under [PH-08](../project/human-actions.md#ph-08) | Existing administrative user, also used by Codex |
| VRMaster / PostgreSQL | `ia_mns`, already provisioned under [PH-19](../project/human-actions.md#ph-19) | Existing administrative user, also used by Codex |

Do not create a third Discovery-only account. The administrator retains its existing purpose and privileges; finishing Discovery does not require deletion or password rotation. Rotate for an actual credential-lifecycle or exposure reason under [secrets management](secrets-management.md), with appropriate owner authority.

Runtime gets only the objects/projections needed by enabled application capabilities. Oracle requires `CREATE SESSION`, reviewed object `SELECT` and name resolution; no broad ANY privileges, DML, DDL or procedure execution. PostgreSQL requires database `CONNECT`, schema `USAGE` and reviewed table/column `SELECT`, without ownership, superuser or write privileges. Actual inherited `PUBLIC` CREATE/TEMP permissions currently exceed that intended boundary; the owner instructed preserving PUBLIC while [PH-30](../project/human-actions.md#ph-30) tracks coordinated restriction. Do not claim effective DDL denial for this account. A read-only transaction supplements these grants.

## Credential delivery

Normal `.env.local` and deployment contain only runtime `SANKHYA_DB_USER` / `SANKHYA_DB_PASSWORD` and `VRMASTER_DB_USER` / `VRMASTER_DB_PASSWORD`, plus non-secret connection settings. Keep the existing administrative pairs in an ignored root Discovery file. Tools prefer `.env.discovery.local` when present and otherwise use the owner-selected `.env.discovery`; they never merge the two files:

- `VRMASTER_DB_USER_FULLACESS` and `VRMASTER_DB_PASSWORD_FULLACESS` (preserved spelling).
- `SANKHYA_DB_USER_FULLACESS` and `SANKHYA_DB_PASSWORD_FULLACESS`.

The safe [example](../../.env.discovery.example) contains no actual account values. Protect the real file with the owner's local access controls. Never commit it, print it, attach it to chat, include it in an image/backup for distribution, send it to a model, or load it through Node/Vite runtime environment flags. Do not place administrative credentials in runtime-named keys.

The [local loader](../../apps/api/scripts/local-environment.ts) excludes all four administrative keys before spawning development commands, including phone-test processes. It never reads `.env.discovery.local`. The [runtime parser](../../apps/api/src/config.ts) refuses those keys if externally injected into a directly started runtime. The [Discovery loader](../../apps/api/scripts/discovery-config.ts) selects and reads one administrative file explicitly without putting its values in `process.env`, accepts only those four keys, requires development/test configuration and never falls back to runtime credentials. Administrative settings are deliberately absent from the runtime schema/reference and public configuration.

These controls separate delivery. They do not certify privileges behind a runtime-named credential. Sankhya products retain their existing privilege/ownership check; existing sales and directory readers use fixed read-only queries and rely on DBA-verified grants. Do not claim an unprovisioned Oracle reader is ready because configuration parses.

## Discovery authority and confidentiality

Codex may investigate objects needed for development without requesting fresh approval for each read. Use reviewed SELECT/catalog inspection, explicit minimal columns, bound values, bounded rows/connections and timeouts. Use read-only transactions where applicable and always roll back/close sessions. Read-only transactions, a SELECT prefix check and fixed queries are not a sufficient sandbox for administrative credentials; review the target objects and any functions/views for side effects before use.

Do not execute INSERT, UPDATE, DELETE, MERGE, DDL, GRANT, REVOKE, write-capable procedures, maintenance commands or any other ERP state change during Discovery. This applies even in a transaction intended for rollback. Technical privilege is not authorization. A database mutation requires explicit owner authorization for its target and operation; a Discovery authorization is never mutation approval.

Credentials are RESTRICTED. ERP business data is CONFIDENTIAL and personal fields need concrete task justification. Do not send confidential raw rows, credentials or unnecessary personal information to AI models. Inspect data locally, prefer counts/structural evidence, redact/minimize any shared evidence, and use synthetic model/test inputs where possible. Ignored evidence is still confidential data requiring controlled local access and retention under [classification](data-classification.md) and [retention](data-retention.md). Model-assisted regressions require their existing, separately reviewed minimized product input boundary; they must not transmit discovery exports or administrative configuration.

## Available development tools

The [setup procedure](../setup.md#erp-discovery) owns commands. `erp:discovery` inspects one named object with fixed Oracle/PostgreSQL metadata queries and optional explicit-column samples of at most 100 rows. It accepts no arbitrary SQL or model-generated query. Metadata and data are written only to ignored `apps/api/evals/.local/discovery`; console output contains status/counts only. It is not a general SQL sandbox or a privilege verifier.

Sankhya `products:sankhya:sync` and `products:sankhya:regression` explicitly use the existing administrator by default; `--runtime-check` / `--runtime` use only the reader and never load the administrative file. VRMaster `products:catalog` and `products:regression` continue using the runtime reader to verify its actual visibility and behavior; they do not silently switch to the administrator.

## New runtime access and activation

For a new capability, identify the minimum object/column privileges, name resolution, reason and affected queries; prepare repository-reviewed scripts targeted only at `IA_MNS_RO` or `ia_mns`. Keep Discovery metadata candidates separate from enabled runtime paths. Execute scripts only within explicit owner mutation authority and then verify effective grants and reconcile runtime reads without probing writes. Report missing provisioning or authorization through the relevant Human Action.

The owner separately authorized and completed the current [Runtime access provisioning](../project/runtime-access-verification.md): reviewed Oracle SELECT/name-resolution/directory changes and three PostgreSQL column grants. `erp:runtime:access` inspects the current plan by default; `--apply` is a mutation mode requiring explicit owner authority, never ordinary Discovery. The [canonical templates](../../apps/api/scripts/erp-access/sankhya-runtime.sql) target the existing readers and do not change accounts/passwords. Oracle DDL is not transactionally reversible; PostgreSQL grants use one transaction. Read-only inspection never automatically executes a grant or changes an account.
