# ADR-0033: Use One Reader and the Existing Administrator per ERP

**Status:** accepted
**Date:** 2026-10-11

## Context

IA-MNS reads Sankhya Oracle and VRMaster PostgreSQL. Earlier investigation used broader credentials alongside runtime configuration, and PH-29 requested removal and rotation of the temporary VRMaster Discovery credentials. The owner has now explicitly decided the account topology and authorized ongoing read-only Discovery with the existing administrative users.

## Decision

Each ERP has exactly two IA-MNS access identities: a dedicated least-privilege runtime reader and the existing administrator, also used by Codex for Discovery. Sankhya runtime is `IA_MNS_RO` (provisioning pending); VRMaster runtime is the already provisioned `ia_mns`. Do not create a third account dedicated to Discovery, replace the existing administrator or rotate its credentials merely because Discovery ended.

Preserve `VRMASTER_DB_USER_FULLACESS` and `VRMASTER_DB_PASSWORD_FULLACESS`; add `SANKHYA_DB_USER_FULLACESS` and `SANKHYA_DB_PASSWORD_FULLACESS`. Administrative credentials belong in ignored `.env.discovery.local`, explicitly read by development tools. Runtime configuration, processes, client builds and deployment must not receive them or fall back to them.

Discovery permits only reading and inspecting task-relevant schemas, objects, relationships and data, subject to project confidentiality. Read-only transactions are additional protection, not sufficient containment for an administrator. ERP mutations, including DML, DDL, grants, revocations and procedures with side effects, require explicit owner authorization. For implementations needing more runtime access, identify minimum privileges, prepare reviewed scripts and execute within that authorization; the current architecture task explicitly prohibits all real ERP account/privilege changes.

This refines ERP access only. Application-owned PostgreSQL runtime/migration identities remain separate. [ERP access policy](../security/erp-database-access.md) owns current controls and procedures.

## Rationale

The owner's definitive decision retains the existing operational administrator and permits necessary development investigation without a redundant third account. Separating credential delivery preserves the runtime reader boundary. Fixed inspection queries, explicit projections, bounded reads, local evidence and human authorization for mutations compensate for some exposure, but do not convert an administrator into a restricted database reader.

## Alternatives Considered

### A third restricted Discovery account

Explicitly rejected by the owner. Do not create it under a different name or treat it as a prerequisite.

### Share administrative credentials with runtime

Rejected because read-only transactions cannot replace minimal database privileges or credential isolation.

## Consequences

### Positive

- Runtime access remains narrowly scoped; Discovery retains access to objects needed for development.
- Credential names remain compatible and the existing ERP administrators are preserved.

### Negative

- A Discovery process still holds administrative capability; reviewed operations and confidentiality controls remain necessary.
- Local isolation and runtime configuration tests do not certify actual database grants or sandbox arbitrary SQL.

### Operational or Migration Impact

- Separate local administrative credential delivery and provision `IA_MNS_RO` before combined Sankhya runtime acceptance (PH-08).
- PH-29 becomes credential isolation and maintenance, not removal of the administrative identity.
- This decision does not itself execute ERP provisioning or grant scripts.

## References

- [Runtime and Discovery access](../security/erp-database-access.md)
- [Secrets management](../security/secrets-management.md)
- [Human actions](../project/human-actions.md#ph-29)
- [Read-only sales capability](0018-bound-natural-language-sales-to-a-read-only-query-capability.md)
