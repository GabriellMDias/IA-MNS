# Orion Foundation Versioning

[Documentation index](README.md) · [Project derivation](project-derivation.md) · [ADR-0015](adr/0015-name-stable-orion-foundation-revisions-with-semantic-tags.md)

This policy names stable revisions of the reusable Orion foundation for people comparing releases and planning derived-project upgrades. It does not version a derived product, API contract, database migration, or deployment independently; those boundaries retain their own policies.

## Identity and release points

- The immutable Git commit SHA is the exact technical identity of a foundation revision. Derived-project provenance records commits, and validation relies on commit identity and ancestry.
- A stable release has one immutable, annotated Git tag named `vMAJOR.MINOR.PATCH`. The tag is the canonical human-readable release identifier and points to the exact Orion commit released. A published tag must never be moved to another commit.
- A GitHub Release may be created from that tag as descriptive metadata. It should concisely state what the release represents, important foundation changes, compatibility or migration notes when relevant, materially required tool/runtime versions, the exact tagged commit, and useful documentation links. It does not establish provenance.

The first stable release is `v1.0.0`. That tag identifies its historical foundation snapshot; later licensing decisions do not change the tagged commit.

## Compatibility meaning

Choose the next version from the intended impact on the foundation contract and supported upgrade model for derived projects, not from diff size or the number of merge conflicts.

| Part | Increment when | Examples |
| --- | --- | --- |
| MAJOR | Orion intentionally makes the foundation contract or supported upgrade model incompatible, requiring deliberate project migration. | Breaking provenance/schema changes; removal or incompatible replacement of an established foundation contract; previously valid projects becoming unsupported; incompatible derivation or baseline-upgrade rules. |
| MINOR | Orion adds backward-compatible foundation capability. | Optional architecture or reference patterns, reusable tooling, agent/tool integrations, validation capabilities, or substantial compatible development-experience improvements. |
| PATCH | Orion makes compatible corrections or hardening without intentionally changing the foundation contract. | Bug and documentation fixes, security hardening, test or validation fixes, and small tooling or development-experience corrections. |

A project may legitimately change shared files. A three-way merge can therefore conflict even between compatible Orion releases; resolve the semantic conflict under review. A Git conflict alone does not make the foundation change MAJOR.

Stable tags are sufficient for Orion now. No pre-release tags or workflow are defined; naming such as `-alpha.1`, `-beta.1`, or `-rc.1` can be specified when an actual pre-release need arises.

## Derived projects and unreleased commits

A project may be described as derived from `Orion v1.0.0` when its recorded initialization commit equals that tag's target, or as having a `v1.0.0` foundation baseline when its recorded baseline equals the target. Its [manifest](../.orion/project.json) still stores the corresponding SHA, with no required semantic-version field. Tags neither change the [baseline-recording safety rules](project-derivation.md#upgrade-to-a-newer-orion-revision) nor replace normal Git ancestry, reviewed merge commits, and validation for upgrades.

To determine whether a recorded commit has a semantic version, inspect stable tags in the canonical Orion repository and compare their resolved commit SHAs with the recorded SHA (for example, `git rev-list -n 1 v1.0.0` in an Orion clone with the tag). The derived project's `orion-upstream` deliberately does not fetch tags, so use a separate Orion clone or the canonical repository's tag view. A nearby or ancestral tag does not name an untagged baseline.

The latest stable tag identifies the latest released human-readable version. Later commits on `main` are unreleased foundation revisions; a project can deliberately use one by its SHA. The next semantic version is assigned only when another release point is tagged. Ordinary merges require no new tag.

## First release and acceptance sequence

`v1.0.0` represents the completed reusable Orion foundation: agent-neutral repository instructions, Living Documentation, validation/CI/security foundations, the Approval Request reference slice, project derivation with preserved Git ancestry, recorded provenance, and guarded baseline upgrades. It marks the foundation state accepted before the first real GitHub-backed sandbox derivation exercise. It does not certify production deployment, activate Phase 12, select a production identity provider, establish product-specific readiness, or promise conflict-free upgrades. The real GitHub-backed derivation and subsequent upgrade exercise remain acceptance and reverification activities.

For a later compatible Orion change, release `v1.0.1` or `v1.1.0` according to its actual impact, then exercise a real sandbox upgrade between release points while checking the recorded commit baseline. Do not manufacture a change solely to create another version. The current [implementation plan](implementation-plan.md#maintaining-this-plan) tracks release preparation.
