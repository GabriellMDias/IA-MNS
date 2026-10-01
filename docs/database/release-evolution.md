# Release and Evolution Workflow

[Migration policy](migrations.md) · [Compatibility policy](../architecture/versioning-and-compatibility.md) · [API versioning](../api/versioning.md)

This is the current contributor workflow for deciding whether a database or API change needs historical compatibility protection. It implements the policies above without declaring a deployment, a released contract, or a supported rollback window. The repository currently has no recorded durable release in [`release-history.json`](../../apps/api/prisma/release-history.json). An empty registry means **no release has been recorded here**; it is not proof that an unlisted persistent database does not exist. Do not edit existing migration history while its release status is uncertain.

## Record the first durable migration boundary

Before the first persistent release, record a human action in the repository's human-action checklist (linked from the README's [Current state](../../README.md#current-state)) to identify the actual durable environment, the deployed Git commit, and which migrations have completed there. Disposable Testcontainers or local databases are not durable release evidence. Inspect the target database's Prisma `_prisma_migrations` records with read-only access and correlate successful, non-rolled-back migration names with the migration deployment record. Investigate missing, failed, or manually changed migrations before recording a release. Do not put credentials or connection strings in the registry or issue evidence.

Once a release actually exists, run `pnpm release:checksums <full-deployed-commit-sha>` to print the complete migration set and normalized source SHA-256 values from that commit. Verify the deployed migration set against the database record and deployment artifact, then append an entry to [`release-history.json`](../../apps/api/prisma/release-history.json) containing a stable release ID, non-secret environment identifier, deployed commit SHA, and every migration directory/checksum printed for that commit. The registry's checksum is for the Git source with normalized line endings; Prisma's database checksum is evidence about the actual deployed file and may differ if checkout line endings differed. Do not substitute one for the other without verifying the deployed artifact. A release entry must follow the real durable application of the migrations, not a planned deployment.

`pnpm release:check` verifies recorded commits, their complete migration sets, current SQL hashes, and append-only registry history against a Git base. CI fetches full Git history and supplies the PR base, merge-group base, or push's preceding commit through `ORION_RELEASE_BASE_REF`; `pnpm validate` runs the same check locally. GitHub supplies exactly forty zeroes for a first push with no previous commit. The validator treats that sentinel as an absent comparison base, without falling back to local ancestry: an empty registry is valid, while a nonempty registry still fails because a real Git base is required to verify append-only history. Every other supplied base must be a full SHA resolving to an existing commit; malformed or unavailable bases fail rather than bypass comparison.

The validator deliberately leaves migrations absent from recorded durable releases refinable, subject to the policy requirement to verify that they are genuinely unreleased before editing them. Corrections to released migrations require a new reviewed forward migration. Deleting or rewriting an old release entry does not turn a released migration back into an unreleased one.

## Validate schema changes

For every migration change, review authored Prisma schema and SQL together, including custom PostgreSQL objects and data impact. `pnpm references:check` applies the committed migrations to a fresh disposable PostgreSQL and checks the generated physical database reference and adjacent semantic metadata. It compares generated text after normalizing checkout line endings, so Windows CRLF is not mistaken for content drift. `pnpm validate` also runs the real-database tests and emitted application smoke. These are fresh-install checks; they do not prove an upgrade from a released state.

When a real supported release baseline exists, add an upgrade test from that exact baseline: initialize a disposable database with the released migrations, preserve representative data permitted by the test policy, apply the new committed migrations, and verify data, constraints, and the supported application/database combinations. Record the actual supported versions and rollout order from that human action. Do not synthesize a historical state or require arbitrary old/new combinations before support obligations exist.

Application rollback means running earlier application code against the **current** schema only if that combination has been verified compatible. It does not rewind PostgreSQL or recover data dropped by a migration. If a released migration needs correction, prefer a reviewed forward migration; data loss may require a separate backup/restore decision and procedure for the actual environment. No production rollback command, deployment window, or recovery objective is selected here.

## Review API and temporary compatibility

The current API, generated OpenAPI, SDK, and web consumer evolve together in this repository. `pnpm references:check` regenerates API and SDK representations from current executable contracts without changing tracked files; it detects current-source drift, not compatibility with a released historical consumer. Before a change, review the executable operation IDs, requests/responses, [error registry](../generated/api/errors.md), authorization, list scope/order/cursor/defaults, state transitions, idempotency, and side effects against the owning module's business specification and implementation conventions. The module's server and browser tests protect those current semantics.

Use these current sources when reviewing contract impact:

| Concern | Current source and verification |
| --- | --- |
| Structure and defaults | A module's TypeBox operations own request/response shapes and stable operation IDs; its routes own defaults such as page sizes and list scopes. OpenAPI and SDK freshness checks keep current artifacts aligned. |
| Errors | The [shared registry](../../apps/api/src/errors.ts) and each module's registered codes own stable codes and status mapping; HTTP integration tests cover the module's denials, validation, conflicts, and rate limiting. No historical status/code compatibility is asserted. |
| Authorization | The module's business specification owns actor and capability rules; synthetic-principal tests exercise the transport and persisted query scopes. |
| Ordering and cursor | The module's implementation conventions own ordering, cursor behavior, and snapshot semantics; migrated-PostgreSQL tests verify authorization before pagination and cursor use. |
| Side effects and retry semantics | The module's recovery contract records external effects, replay, and version conflicts; concurrency and process-interruption tests protect these facts. |

This is a review of the **current** contract, not a released API baseline or a promise to support an older client. A future change can alter unreleased semantics deliberately, but must update the owning source, tests, and generated client together.

If an independently evolving consumer or published contract becomes real, record its released OpenAPI and supported consumer versions in a human action before introducing a baseline comparison. Mechanical comparisons can detect removed operations, required fields, types, and response shapes, while changes to authorization, errors, ordering, defaults, retry semantics, and side effects still need semantic review. No API version or deprecation window is created solely for unreleased development.

There is currently no temporary compatibility shim, dual-write path, deprecated endpoint, or retained old payload format to remove. If one is introduced for a real released boundary, record its consumers, migration path, support window, test coverage, and observable removal condition alongside that implementation. Remove it only after the actual dependent consumers and persisted data are safe, following [compatibility policy](../architecture/versioning-and-compatibility.md) and [API versioning](../api/versioning.md).
