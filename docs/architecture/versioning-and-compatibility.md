# Versioning and Compatibility

[Documentation index](../README.md) · [API versioning](../api/versioning.md) · [Database release evolution](../database/release-evolution.md)

Compatibility protects consumers that cannot change atomically. This page owns cross-boundary evolution; API, database, configuration, and security policies own their specific contracts. Prefer compatible evolution over reflexively adding versions or preserving obsolete internal interfaces forever. Significant support/versioning strategies require an ADR; ordinary compatible changes do not.

## Compatibility Boundary

Identify the producer, consumer, canonical contract, independent deployment/distribution, persisted-state lifetime, release status, support window, and rollback requirements. Internal monorepo code can often change atomically; installed clients, queued jobs, durable database state, published SDKs, external automation, and independently managed configuration cannot necessarily do so.

Compatibility includes structure, meaning, behavior, wire serialization, source compilation, security, and operational assumptions such as capacity or startup requirements. An additive field can still break a strict consumer; an unchanged string type can conceal changed meaning. Binary compatibility becomes relevant only if compiled/native artifacts are distributed.

Define the required combinations explicitly: new provider with old consumer, old reader with new data, and both directions during overlap where necessary. No universal compatibility matrix or global system version is required. Application release, API version, database migration state, SDK/package version, and configuration schema version serve different purposes; a release can identify a compatible set without changing all their versions.

## Released vs Unreleased Behavior

“Released” includes behavior deployed, persisted, published, installed, queued, or consumed independently, not only public release. Verified unreleased contracts may be refined when no durable consumer depends on them. Git preserves development history; ADRs preserve decisions; migration history preserves durable database transitions. Released contracts may evolve compatibly, but released migrations retain their distinct immutability requirements.

Current API, SDK, and web code evolve together. The [release registry](../../apps/api/prisma/release-history.json) records durable database releases; absence of an entry is not proof that no persistent environment exists. Verify release status before editing migration history. [Release evolution](../database/release-evolution.md) owns the evidence and upgrade procedure. No published SDK versioning scheme, released API baseline, client-support period, or production rollback window is implied by current scripts.

## Expand–Migrate–Contract

For changes that cannot occur atomically:

1. **Expand:** introduce compatible fields, schema capabilities, accepted payloads, configuration, or infrastructure while existing consumers still work.
2. **Migrate:** update readers/writers/consumers, backfill durable data, and switch traffic or activation in a safe order.
3. **Contract:** remove old behavior only after supported consumers, retained data, and rollback obligations no longer need it.

Specify the application/schema/configuration/infrastructure state at each step. Rolling/canary deployment creates mixed versions; blue-green can shorten but does not eliminate compatibility during shared data use, traffic switches, or rollback. Feature flags may separate activation from deployment but do not solve incompatible data formats.

Temporary adapters, dual reads/writes, legacy config fallbacks, and feature flags need identifiable ownership, purpose, tests, tracking, and removal conditions. Define the canonical representation, failure handling, and reconciliation for dual writes. Fallback reads must not conceal an incomplete migration indefinitely. Preserve durable meaning; compatibility is never a justification for silent data loss.

Choose and document rollback or forward recovery for a significant transition. Application rollback does not undo a schema migration or recover dropped data. Do not contract schema/configuration while a supported rollback application still needs it. Before activating a new writer, ask whether old readers can understand its output; delaying new writes may be necessary even when new readers understand old data.

## Persisted Data Compatibility

Database enums/JSON, cached documents, events, job payloads, sessions, stored files, and encrypted serialization can outlive the code that wrote them. Determine which old shapes actually exist, where they live, their retention/replay lifetime, which versions read them, whether they can be migrated/rebuilt, and how both read/write directions are tested.

Explicit payload versions are useful when incompatible shapes coexist and parsing needs identification; do not add them to every record preemptively. Shape detection may suffice for simple transitions. Defaults must accurately represent historical meaning, not merely make deserialization succeed. Preserve unknown values or reject unsupported shapes explicitly instead of mapping them to an incorrect known state.

Events need an owned type, schema, meaning, producer, and consumers. Prefer compatible evolution when consumers permit it; a different business fact deserves a semantic new event type rather than a misleading version of the old one. Queues, logs, dead letters, archives, and replay extend compatibility obligations; long-lived retries may span several releases. Consumers may ignore additive unknown fields only where the contract permits, never required semantics.

Caches may be migrated, safely invalidated, or assigned new key namespaces; old namespaces must expire/be removed. Search indexes are derived state and may use reindexing, dual indexes, or alias switches instead of indefinite legacy support. Prefer mature standard serialization formats; custom binary formats need a concrete benefit and explicit compatibility design.

## Other Compatibility Surfaces

| Surface | Required considerations |
| --- | --- |
| Packages and SDK | Internal atomic changes usually need no compatibility layer. Independently published packages need a deliberate distribution/version policy and intentional exports. SDK programming API compatibility and SDK-to-server compatibility are distinct; generated public interfaces can become commitments even though output is rebuildable. |
| APIs and public errors | Follow [API versioning](../api/versioning.md). Consumer-visible errors, ordering, defaults, authorization, pagination, idempotency, and side effects can break without a schema diff. |
| Configuration | New required keys may need provisioning before code. Renames need deterministic old/new precedence; removal must preserve rollback. Follow [configuration policy](configuration.md). |
| Credentials and identity | Issuer, audience, claim, algorithm, key, token-lifetime, and session-format changes affect existing clients/sessions. Rotation may sign with new keys while accepting previous keys temporarily under security policy. Mass logout must be deliberate. |
| Authorization/classification | Persisted permission identifiers may need migration. Review both tighter and looser access; apply stricter current data classification to telemetry, exports, analytics, access, and retention. Required security corrections can override compatibility, with impact managed explicitly. |
| CLIs and scripts | Public command names, arguments, output, and exit codes can be contracts. Internal scripts within one revision may evolve atomically; external CI/operations consumers may not. |
| Infrastructure/providers | Coordinate resources and permissions before dependent consumers and remove them after migration. Provider API versions are dependencies, not this API's versions; test upgrades and track deprecation deadlines near the integration. |
| Toolchain/dependencies | Runtime/compiler upgrades can affect output, library compatibility, and behavior. Use repository pins, lockfile, and frozen installation; assess actual breaking impact rather than trusting labels or allowing uncontrolled upgrades. |
| Generated references | Canonical contract semantics govern compatibility, not incidental formatting. If external automation consumes a machine-readable artifact, its intended schema becomes explicit. |

Security takes priority over retaining vulnerable behavior. Safe release metadata should support correlation without conflating release identity with API/schema versions.

## Deprecation and Removal

Deprecation needs a replacement, migration path, support/removal condition, and owner. Remove compatibility complexity once the real consumer is gone, not just because current source no longer uses it. Check installed clients, external users, queued/persisted historical shapes, and rollback; source search alone may be insufficient.

Use safe runtime usage evidence when available. Telemetry can correlate release, operation, bounded contract/error category, migration, and configuration changes; it must not create unbounded labels for arbitrary consumer/payload identities. Alerts should reflect impact from unsupported clients or deployment ordering failures. Document supported versions only where support exists; metadata such as introduced/deprecated/replacement belongs in canonical contracts only when useful, never a parallel manually duplicated manifest.

## Compatibility Testing

Test actual supported combinations at their boundary: old request/new server, new application/transitional schema, old reader/new message, new worker/retained old job, active/deprecated configuration, or rollback application/current schema. Do not maintain arbitrary historical combinations. Use the real release baseline for migrations; fresh-install checks alone do not prove upgrade safety.

Released fixtures/baselines are immutable evidence, not snapshots to silently rewrite when tests fail. Add distinct historical shapes when necessary. Structural API comparisons, canonical event/schema checks, and property-based serializer tests can help where justified; semantic review remains required.

`pnpm release:check` and its tests protect recorded migration/release history. Current API/SDK/reference freshness checks detect drift from current sources, not released-consumer compatibility. Dedicated historical API diffing, event versioning, and package-publication compatibility tooling are not selected merely by this policy.

Fail before unsafe work when a dependency/schema is unsupported and expose stable safe diagnostics. Prefer capability detection when the real dependency is a capability; numeric comparisons are appropriate only with precise version semantics. Accept supported old forms during transition, then reject removed forms explicitly rather than failing later with unrelated SQL/property errors.

## Breaking Change Checklist

Before completing a compatibility-sensitive change, establish:

1. Consumers, release evidence, independence, persistence/replay lifetime, and required direction/window.
2. Structural, semantic, behavioral, operational, and security impact; whether atomic or additive evolution is possible.
3. Ordered application, schema, configuration, infrastructure, credential, and message states, including new-writer/old-reader safety.
4. Rollback or forward-recovery expectations and any urgent security override.
5. Canonical transition state, tests for supported combinations, safe usage evidence, and completion criteria.
6. Ownership and removal conditions for every temporary compatibility path.

Do not introduce `v2`, a package major, or a payload schema version merely to avoid this analysis. Compatibility exists to protect real consumers while keeping the foundation maintainable.
