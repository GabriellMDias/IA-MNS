# ADR-0028: Administer Operational Parameters Separately from Secrets and Bootstrap Configuration

**Status:** accepted
**Date:** 2026-10-08
**Extends:** [ADR-0007](0007-establish-api-contract-openapi-sdk-and-configuration-schema-strategy.md) (TypeBox bootstrap configuration) and [ADR-0025](0025-administer-the-authentication-policy-within-fixed-safeguards.md) (owner administration of a typed setting). The environment remains the only source of secrets and bootstrap configuration; the authentication policy keeps its own storage and rules.

## Context

Every API setting was an environment variable parsed by `apps/api/src/config.ts`. Some of them are product behavior that the owner may need to change after deployment (which AI model answers, how much of each AI turn is traced, which provider links grant read capabilities automatically), and changing them required server access, editing configuration and a restart. Most other variables are credentials, keys or infrastructure that the process needs before it can reach its own database, and must not become editable or visible through an API. The [configuration policy](../architecture/configuration.md) asks for static startup configuration unless dynamic configuration is justified, with explicit change behavior, audit and tests.

## Decision

The API distinguishes three kinds of configuration, recorded per variable as `role` in `configReference` (rendered in the [generated reference](../generated/configuration/api.md) and grouped in `.env.example`):

- **secret** and **bootstrap** settings stay in the validated environment, are never exposed through administration, and change only by deployment and restart; **development** settings remain local aids refused in production;
- **operational parameters** are declared once in a typed catalog (`apps/api/src/parameters.ts`) with their domain, production limits and when a change takes effect. The first ones are the AI model (`ai.model`), the AI trace level (`ai.traceLevel`) and the automatic read grants by provider link (`access.providerGrants`).

Resolution is **owner value > installation default**. The installation default is the parameter's former environment variable (`OPENAI_MODEL`, `IA_MNS_AI_TRACE`, `IA_MNS_PROVIDER_GRANTS`), or the product default `config.ts` applies when it is unset. There is no environment override above the owner value; production limits (no content tracing) apply to every source. Saving `null` restores the installation default.

Owner values live in `operational_parameters`, one row per key with a JSON value constrained by database checks to the catalog type and domain of that key, a concurrency version and the last editor. Consumers never query the table: composition (`apps/api/src/modules.ts`) builds one `OperationalParameters` reader and passes narrow resolvers to the agent (trace level per turn, model per AI request), the sales interpreter (model per request) and identity (provider grants at every token issue). The reader has no cache, so a saved value applies to the next use on every API instance; no parameter requires a restart.

Administration stays in the identity module, which owns the principal administrator: `GET /identity/admin/parameters` and `PUT /identity/admin/parameters/{key}` use the same owner check as the rest of `/admin` (owner role, second-factor session per policy, recent administrative confirmation for changes), accept changes only for the version that was read, and record `parameter.updated` in `identity_audit_events` with previous and new values and the acting owner. The web shows them in **Administração → Parâmetros** with product names and descriptions, never environment variable names.

## Rationale

Keeping secrets and bootstrap values in the environment preserves secure defaults, startup validation and the separation between who deploys and who administers; exposing them through an API would enlarge the attack surface without a real need. The three chosen settings change product behavior, are understandable to an owner, have small validated domains, and are read at the moment of use, so they can change safely at run time.

Using the former variables as installation defaults keeps every existing installation identical until an owner saves a value and gives one clear precedence instead of two competing sources. An environment override above the owner value was not needed: the only safety limit (content tracing in production) is enforced in code for every source.

Declaring type and domain in code, with database checks per key, avoids an untyped key/value store; storing descriptions or types in the database would create a second definition that could drift from the code that interprets it. Reading without a cache costs one indexed query per AI request or token issue, negligible next to the model call, and avoids a screen that reports a saved value while instances still use the previous one. Hosting administration in identity reuses the existing owner authorization, step-up, error codes and audit instead of a second permission mechanism; the catalog and table remain runtime-owned because their meaning spans agent, sales and identity.

## Alternatives Considered

### Make every environment variable editable

Rejected: credentials and keys would become readable or writable through an API, and bootstrap settings (database, listener, issuers, telemetry) are needed before the application can read its own storage.

### Environment override above the owner value

Not adopted: it would let a stale deployment value silently defeat a choice the screen shows as saved. The environment keeps the role of installation default instead.

### Generic key/value settings with types and descriptions in the database

Rejected: weaker typing, a second source of meaning and arbitrary keys. New parameters are added deliberately to the catalog and to the table's checks.

### A separate settings module with its own administration routes

Not adopted: it would need a second owner check or new error codes for step-up authentication, and its own audit. Identity already administers owners and records administrative changes.

### Cached reads like the authentication policy

Not adopted for these parameters: they are read at most once per AI request or token issue, so a cache would only add a period in which instances disagree.

## Consequences

### Positive

- The owner changes the AI model, trace level and automatic grants from administration, with validation, concurrency protection and audit, and without a restart.
- The classification of every environment variable is explicit and checked where it is defined.
- Existing installations keep their behavior until an owner saves a value.

### Negative

- A wrong model identifier saved by an owner makes AI requests fail until it is corrected or reset; the screen asks for evaluation before changing it in production.
- Automatic grants are an authorization policy: an owner can narrow (never widen beyond the catalog) who receives read capabilities, and issued access tokens keep their permissions for up to 10 minutes.
- Each new parameter needs a catalog entry, a migration extending the table checks, web labels and tests.

### Operational or Migration Impact

- Additive migration `202610080001_operational_parameters` and runtime grant `SELECT, INSERT, UPDATE` on the new table; no backfill. Without rows every parameter keeps its environment or product default.
- `OPENAI_MODEL`, `IA_MNS_AI_TRACE` and `IA_MNS_PROVIDER_GRANTS` remain valid environment variables with the meaning "installation default"; a value later saved by an owner takes precedence, which the screen shows together with the default.
- Before production, an owner reviews **Administração → Parâmetros**; content tracing is refused there in any case.

## References

- [Configuration policy](../architecture/configuration.md#operational-parameters)
- [Identity domain](../domains/identity.md#operational-parameters)
- [Generated configuration reference](../generated/configuration/api.md)
- [ADR-0025](0025-administer-the-authentication-policy-within-fixed-safeguards.md), [ADR-0022](0022-own-the-ia-mns-identity-with-verified-external-links.md), [ADR-0024](0024-interpret-analytics-through-structured-state-and-evaluate-ai-behavior.md)
