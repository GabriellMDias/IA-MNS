# ADR-0018: Bound Natural Language Sales to a Read-Only Query Capability

**Status:** accepted
**Date:** 2026-10-01
**Partially superseded by:** [ADR-0019](0019-compose-a-corporate-agent-with-durable-conversations.md) replaces the sales-specific product identity and temporary conversation decision. Controlled sales execution and deterministic answers remain accepted.
**Extended by:** [ADR-0024](0024-interpret-analytics-through-structured-state-and-evaluate-ai-behavior.md): the model now reports a structured interpretation that the application merges, resolves and compiles into the same bounded query.

## Context

IA-MNS's first product capability is Portuguese sales chat over an existing Oracle 12.1 Sankhya database. The owner delegated technical choices and supplied the sales reference SQL. Orion already selects Fastify, TypeBox, React/TanStack, and JWT verification. PostgreSQL remains the primary application persistence direction; this MVP requires no application tables and must never write to the external ERP.

## Decision

Accepted under the owner's explicit delegation of technical choices on 2026-10-01 after reviewing Orion boundaries and the sales-reference semantics.

Use one sales module and the OpenAI Node SDK Responses API to interpret questions into a strict allowlisted query capability. Execute fixed, parameterized Oracle SQL using node-oracledb, SELECT-only credentials, a read-only transaction, and bounded work. Preserve the supplied reference projection and joins until reconciliation justifies changes. Compute and render answers deterministically from database results; model output never supplies sales numbers or SQL.

Keep actor-owned conversation questions and last successful filters in bounded, expiring process memory. Require the existing bearer verifier and sales:read scope outside an explicitly enabled loopback-only development mode. Keep confidential prompts/results out of telemetry and ERP rows out of OpenAI requests. Do not select a concrete identity provider, deployment environment, vector database, or workflow engine.

## Rationale

A small sales query vocabulary covers the requested monetary, quantity, weight, period, and product questions without granting the model database execution authority. Retaining reference join cardinality avoids inventing business semantics. Deterministic decimal calculations prevent model arithmetic from becoming financial truth. Responses function calling provides an explicit external schema and refusals can be handled without querying the ERP. Current node-oracledb 7 documentation supports Oracle 12.1 in Thin mode; a configured Thick option addresses installation-specific requirements without mandating local client libraries for ordinary development.

Temporary context fulfills follow-up questions with no additional persistent sensitive-data lifecycle. This trades restart durability and multi-instance continuity for a narrower MVP. Local access makes a developer workflow executable before an issuer is selected, while rejecting that mode in production.

## Alternatives Considered

### Model-generated SQL

Rejected because an open SQL surface makes business semantics and query cost difficult to constrain and enlarges data access beyond sales.

### Agent framework and persistent conversation store

Deferred because a single forced capability does not need autonomous loops, handoffs, vector retrieval, or durable history. Add persistence only when product retention and operational requirements exist.

### Replacing the ERP integration with PostgreSQL replication

Deferred because it introduces synchronization, lag, operational work, and reconciliation beyond the requested direct read-only MVP. Oracle is an external-system adapter, not a replacement for ADR-0005.

## Consequences

### Positive

- Execution authority and calculations remain in reviewed application code.
- Orion's contract generation, client boundary, diagnostics, and validation remain applicable.
- No production credential is needed for ordinary synthetic verification.

### Negative

- Queries retain potentially expensive reference joins and require ERP performance/reconciliation checks.
- Context disappears on restart and does not support horizontal deployment without later changes.
- Interpretation quality, real schema compatibility, and grants remain unverified until external configuration is supplied.

### Operational or Migration Impact

No Sankhya or application database migration is introduced. A DBA must supply a SELECT-only account and verify resolution of reference tables/custom fields. A dedicated OpenAI project/key is configured outside version control. Shared environments need a trusted issuer, sales scope mapping, and provider/data handling review before exposure.

## References

- [Sales domain and acceptance](../domains/sales-chat.md)
- [ADR-0005](0005-select-postgresql-as-the-primary-database.md)
- [ADR-0012](0012-verify-jwt-access-tokens-at-the-first-api-boundary.md)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [Oracle driver modes](https://node-oracledb.readthedocs.io/en/stable/user_guide/appendix_a.html)
