# ADR-0016: License the Orion Foundation under Apache-2.0

**Status:** accepted
**Date:** 2026-09-30

## Context

Orion is a public reusable development foundation intended for independent projects, including commercial and proprietary products. Its source had no explicit repository license through the `v1.0.0` foundation snapshot. The owner has now selected a distribution license for Orion source before the real GitHub-backed project derivation exercise. This is a durable repository-wide permission decision; it does not select a derived project's overall license or change third-party dependency rights.

## Decision

Distribute Orion's repository source under the unmodified Apache License, Version 2.0. The root `LICENSE` file contains the canonical terms, and the root README links to it. Do not retroactively change the existing `v1.0.0` tag. Orion's independently developed future revisions inherit this repository license unless a separately authorized decision changes it. Derived projects must make their own decisions for independently created product code and comply with licenses applicable to inherited and third-party material.

## Rationale

The owner explicitly selected Apache-2.0 for broad reuse, modification, and distribution of the foundation, including use in independent commercial projects. A standard license file makes those permissions and obligations discoverable without custom terms, package publication metadata, or changes to derivation provenance. The existing `v1.0.0` tag remains an immutable record of the pre-license snapshot.

## Alternatives Considered

### Leave the repository without an explicit license

This was the previous state. It leaves reuse and distribution permissions unclear for the intended audience, so it does not meet the owner's distribution objective.

## Consequences

### Positive

- Orion source has a clear, standard distribution license.
- Derived projects can identify the terms of inherited Orion material without changing SHA-based provenance or upgrade mechanics.

### Negative

- Redistributors must satisfy applicable Apache-2.0 conditions for Orion material; choosing a different license for their own code does not remove those obligations.
- The root license does not settle separate rights or obligations for package dependencies or independently created project code.

### Operational or Migration Impact

No manifest, package publication, application, or deployment change is required. The licensing change is a compatible PATCH candidate after PR review, merge, and CI verification. No `NOTICE` or copyright holder statement is added without supporting repository evidence.

## References

- [Canonical Apache-2.0 license](../../LICENSE)
- [Repository README](../../README.md#license)
- [Foundation versioning](../versioning.md) and [ADR-0015](0015-name-stable-orion-foundation-revisions-with-semantic-tags.md)
- [Project derivation](../project-derivation.md)
