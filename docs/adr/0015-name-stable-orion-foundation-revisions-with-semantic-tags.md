# ADR-0015: Name Stable Orion Foundation Revisions with Semantic Tags

**Status:** accepted
**Date:** 2026-09-29
**Supersedes:** [ADR-0014](0014-derive-projects-from-orion-through-git-ancestry-with-recorded-provenance.md), only its statement that no release or version scheme exists

## Context

[ADR-0014](0014-derive-projects-from-orion-through-git-ancestry-with-recorded-provenance.md) established immutable commit SHAs and ancestry as derived-project provenance and deliberately introduced no release scheme. Before the first real GitHub-backed derivation exercise, people need recognizable stable foundation points and compatibility signals without weakening that technical identity or making every merge a release.

## Decision

Stable Orion foundation releases use immutable annotated Git tags named `vMAJOR.MINOR.PATCH`. The tag is a human-readable alias for one commit. MAJOR denotes an intentionally incompatible foundation contract or supported upgrade model; MINOR denotes backward-compatible capability; PATCH denotes compatible correction or hardening. Classification follows contract impact, not diff size or incidental merge conflicts. A GitHub Release may describe a tag but has no provenance role. Pre-release naming is deferred until needed.

Project manifests continue to record commit SHAs. Derivation, baseline recording, and upgrades continue to rely on commit identity and Git ancestry. This decision changes only ADR-0014's no-release-scheme statement; its provenance and upgrade mechanics remain accepted.

## Rationale

Commit SHAs provide exact, verifiable identity while stable tags let humans communicate known foundation points. Semantic labels signal expected compatibility for projects that inherit and extend the foundation. Tags avoid a second mutable version store and do not require release automation or changes to project manifests. A stable-only model matches the current need for one first release; pre-release process would add obligations without an acceptance use case.

## Alternatives Considered

### Continue with commit SHAs alone

This preserves exact identity but makes stable foundation points and compatibility intent difficult to communicate during the first real derivation and later upgrade exercise.

### Store a semantic version in project provenance

This duplicates the tag and could be mistaken for proof that the corresponding commit was integrated. The existing SHA and ancestry checks already supply that proof.

## Consequences

### Positive

- Stable foundation points become easy to name without changing derivation mechanics.
- The tag is a single human-readable release identifier; commit identity stays authoritative for provenance.

### Negative

- Maintainers must classify contract impact deliberately and protect published tags from movement.
- Version labels cannot predict merge conflicts caused by project-specific edits to shared files.

### Operational or Migration Impact

No manifest migration or release tooling is required. The first tag follows review, merge, and CI verification of this policy. Later tags are assigned only at deliberate release points.

## References

- [Orion foundation versioning](../versioning.md)
- [Project derivation](../project-derivation.md)
- [ADR-0014](0014-derive-projects-from-orion-through-git-ancestry-with-recorded-provenance.md)
