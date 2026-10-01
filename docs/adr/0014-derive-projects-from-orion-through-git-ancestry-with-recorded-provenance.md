# ADR-0014: Derive Projects from Orion through Git Ancestry with Recorded Provenance

**Status:** accepted

**Date:** 2026-09-29

**Superseded by:** [ADR-0015](0015-name-stable-orion-foundation-revisions-with-semantic-tags.md), only for the statement that no release or version scheme exists; the provenance and upgrade decision remains accepted

**Superseded by:** [ADR-0017](0017-start-derived-projects-from-a-clean-foundation-baseline.md), only for inheriting Orion's plan, human actions, and acceptance history, retaining the Approval Request reference implementation with a recorded disposition, and keeping the `@orion/*` package scope; the Git ancestry, provenance, remote protection, and upgrade decisions remain accepted

## Context

Orion's purpose is to be a reusable foundation for real projects. Each real project must be an independent repository with its own `origin`, pull requests, CI history, human actions, product decisions, and releases, while the canonical `GabriellMDias/Orion` repository continues evolving as the upstream foundation. Projects need to know which Orion revision they contain and to adopt later Orion improvements without losing product changes.

The repository also contains state that cannot be inherited as true for a new repository: Orion's implementation plan and acceptance evidence describe how Orion itself was built, several completed human actions verified GitHub settings for the Orion repository only, and the Approval Request feature is an executable reference rather than a product requirement. The owner directed a workflow that preserves Git ancestry, protects the canonical repository from accidental product pushes, records machine-readable provenance, and keeps upgrades as reviewable changes.

## Decision

A project is derived from a clean, full clone of Orion by the repository's `pnpm orion:init-project` command. After verifying preconditions, the command commits the project's initial identity on top of Orion's history, renames the canonical remote to `orion-upstream`, disables pushing to it and fetching its tags, removes local branch tracking of it, and adds the project's repository as `origin`. It creates no remote repository and pushes nothing.

`.orion/project.json` is the versioned, schema-checked identity and provenance record. In Orion it describes the foundation. In a derived project it records the project identity, the canonical Orion repository, the immutable commit the project was initialized from, the Orion baseline currently integrated, and the disposition of the Approval Request reference implementation. The immutable Git commit is the foundation version; no separate release or version scheme is introduced.

Foundation-owned and project-owned state are separated by file. Orion's plan, human actions, and acceptance report remain inherited foundation history in projects; initialization creates project-owned `docs/project/implementation-plan.md` and `docs/project/human-actions.md` with pending actions for the project's own repository settings. Root instructions route implementation work to the project-owned files when the manifest describes a project. The foundation namespace (`@orion/*`, `ORION_*`, `orion_*` claims, and the CI check name) is not renamed.

The Approval Request slice is retained in derived projects as a recorded `reference` implementation, not a product requirement. The project owner later records `adopted` or `removed`; validation keeps the disposition coherent with the source tree and refuses a durable release while it is still `reference`.

Orion upgrades are ordinary branches that merge a chosen commit from `orion-upstream/main` with its history, resolve conflicts under review, regenerate derived artifacts, and pass validation. The recorded baseline is updated only after that commit is integrated, and validation requires it to be an ancestor of `HEAD`.

## Rationale

Preserving ancestry lets Git compute the upstream changes after a baseline and perform three-way merges, which is the property that makes future upgrades practical. A GitHub template repository or a squashed snapshot would discard that ancestry and force every upgrade to become a manual diff-and-copy exercise. Keeping the canonical repository as a fetch-only remote retains that ancestry without letting ordinary `git push` or `git pull` cross the boundary.

A small manifest makes provenance machine-checkable in local validation and CI without inventing a release system. Commit ancestry is verifiable wherever full history is available, and the recorded baseline cannot claim unintegrated upstream work.

Separate project-owned files avoid conflicts that would otherwise recur on every upgrade while keeping Orion's evidence intact rather than rewriting it. Retaining the reference implementation avoids a brittle, multi-artifact deletion step during initialization; the release guard ensures it cannot silently become product behavior.

## Alternatives Considered

### GitHub template repository

Templates create an unrelated history. They make project creation easy but lose the shared ancestry that three-way upgrade merges need, and they record no provenance.

### Fork or shared-history repository with Orion as `origin`

Working directly from a fork or clone that still pushes to Orion risks product work reaching the canonical repository, couples project pull requests and settings to Orion, and blurs project and foundation history.

### Automatic updater that overwrites or patches foundation files

An updater could replace foundation files mechanically, but it would silently overwrite product changes or resolve semantic conflicts without review. Upgrades are engineering changes and remain reviewable merges.

### Deleting the reference implementation during initialization

A scripted removal would have to change application code, tests, migrations, generated OpenAPI/SDK/database references, documentation, and portal data together, and would conflict with every later Orion change to those files. Retaining it with a recorded, validated disposition is smaller and safer.

## Consequences

### Positive

- Each project is independent while retaining a verifiable relationship to Orion.
- Accidental pushes to the canonical repository fail locally, and upstream changes enter projects only through reviewed merges.
- Provenance, inherited-state boundaries, and the reference implementation's status are explicit and checked.

### Negative

- Project history includes Orion's history, and upgrades can still conflict where projects change foundation files.
- Remote protection is local Git configuration; each clone must run `pnpm orion:upstream`, and repository-level protections still require the project's own settings.
- Squash or rebase merges of upgrades break the baseline check and must be avoided.

### Operational or Migration Impact

- Orion itself changes only by adding its foundation manifest, validation, and documentation; its history and completed evidence are preserved.
- A future change to the manifest schema requires a new schema version and an upgrade path for existing projects.

## References

- [Project derivation and Orion upgrades](../project-derivation.md)
- [Implementation plan](https://github.com/GabriellMDias/Orion/blob/v1.1.1/docs/implementation-plan.md) and [human actions](https://github.com/GabriellMDias/Orion/blob/v1.1.1/docs/human-actions.md)
- [Migration policy](../database/migrations.md) and [release evolution](../database/release-evolution.md)
- [ADR-0011: continuous integration and supply-chain security](0011-establish-continuous-integration-dependency-automation-and-supply-chain-security-strategy.md)
