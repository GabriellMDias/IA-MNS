# ADR-0030: Name IA-MNS Releases with Product Tags Distinct from Orion

**Status:** accepted
**Date:** 2026-10-07
**Extends:** [ADR-0015](0015-name-stable-orion-foundation-revisions-with-semantic-tags.md), which names Orion foundation revisions only and explicitly does not version a derived product, deployment or migration history.

## Context

IA-MNS is preparing its first production deployment, which will also become its first durable migration boundary ([release workflow](../database/release-evolution.md)). The owner wants production to run a known release rather than the latest `main`. IA-MNS keeps Orion's Git history ([ADR-0014](0014-derive-projects-from-orion-through-git-ancestry-with-recorded-provenance.md)), and Orion names its own stable revisions `vMAJOR.MINOR.PATCH`; clones that received those tags hold `v1.0.0` to `v2.0.0` on Orion commits that are ancestors of IA-MNS's `main`. A product tag in the same namespace would collide with them or be mistaken for a foundation version. Three identifiers must agree for a release: the Git commit, the artifact's `ORION_RELEASE_ID`, and the `release-history.json` entry that freezes the migrations a durable database applied.

## Decision

- IA-MNS releases are immutable annotated Git tags named `ia-mns-vMAJOR.MINOR.PATCH` on a commit of `main` that passed the required CI gate. Historical Orion tags are never deleted, moved or reused, and IA-MNS never creates a bare `vX.Y.Z` tag.
- The tag is the release's single human-readable identifier: the artifact built from it uses the tag as `ORION_RELEASE_ID`, and the `release-history.json` entry of a durable deployment uses it as its release ID with the full SHA the tag resolves to. No `VERSION` file or package version duplicates it.
- A release is recorded only after it ran, in this order:
  1. Tag a `main` commit whose required CI gate passed, and build the artifact from exactly that commit with the tag as `ORION_RELEASE_ID`.
  2. Apply the artifact's migrations to the durable database with `database-deploy`.
  3. Verify the database with read-only access: the set of `_prisma_migrations` rows that finished and were not rolled back equals the migration directories of the tagged commit, with no failed or extra row; and each row's Prisma checksum equals the SHA-256 of that `migration.sql` inside the deployed artifact.
  4. Run `pnpm release:checksums <tagged full SHA>` and append its output to `release-history.json` under the tag's name, with a non-secret environment identifier, in a reviewed change after the tag. `pnpm release:check` then freezes that history.

  The two checksums are different evidence and never substitute for each other: Prisma's records the bytes the database applied, the registry's the line-ending-normalized Git source ([release workflow](../database/release-evolution.md)). Because the artifact is built from the tagged commit, step 3 ties the database to the artifact and step 4 ties the registry to the commit. A mismatch stops the recording and is investigated; it is never resolved by editing history or marking migrations applied. The recording change never alters the tagged commit.
- MAJOR, MINOR and PATCH describe the product and its supported upgrade path: MAJOR when an upgrade needs operator action beyond deploying the next release (for example a migration that cannot coexist with the previous release), MINOR for compatible capability, PATCH for compatible corrections.

## Rationale

A distinct prefix makes collision with foundation tags impossible in any clone and tells readers which project a tag names, while keeping semantic versions familiar. Using one identifier for tag, artifact and registry entry lets an operator correlate logs, the deployed image and the frozen migrations without a lookup table. Recording after the real application follows the existing release workflow: the registry describes what a durable database actually applied, not what was planned.

## Alternatives Considered

### Bare `vX.Y.Z` tags

They match ADR-0015's form but collide with Orion's tags present in clones and invite confusion between product and foundation versions. Deleting Orion's tags to make room would rewrite shared history.

### A version field in `package.json`

It duplicates the tag and can drift from it; the repository already avoids a second version store.

### Deploying the latest `main`

It gives no stable name to what runs in production and makes the release-history commit ambiguous.

## Consequences

### Positive

- Every production artifact, log line and frozen migration set names the same release.
- Product and foundation versions can be told apart at a glance.

### Negative

- Tooling that sorts or describes tags must filter by the `ia-mns-v` prefix.
- Recording needs read access to the deployed database's `_prisma_migrations` and to the deployed artifact's migration files, not only to the repository.
- The release-history entry lands in a change after the tag, so the tagged commit itself never contains its own record.

### Operational or Migration Impact

- The first durable release freezes all migrations committed at its tag. Later schema changes are new forward migrations with an upgrade test from that baseline, and each production release that applies migrations is recorded.

## References

- [ADR-0015](0015-name-stable-orion-foundation-revisions-with-semantic-tags.md), [foundation versioning](../versioning.md), [release workflow](../database/release-evolution.md), [migration policy](../database/migrations.md)
- [Configuration policy](../architecture/configuration.md) (`ORION_RELEASE_ID`)
