# ADR-0021: License IA-MNS under Apache-2.0

**Status:** accepted
**Date:** 2026-10-03

## Context

IA-MNS was derived from Orion, whose source is licensed under Apache-2.0 ([ADR-0016](0016-license-the-orion-foundation-under-apache-2-0.md)). That decision explicitly left the license of independently created project code to each derived project. Since then, IA-MNS has added its corporate-agent and sales capabilities, documentation, and tooling as its own work. The repository is published at https://github.com/GabriellMDias/IA-MNS. Until this decision, project human action PH-06 tracked the license as undecided.

On 2026-10-03 the project owner decided that the repository stays public and that IA-MNS is licensed under the Apache License 2.0. This decision covers IA-MNS's repository source. It does not change third-party dependency rights, Orion's own license, or provenance.

## Decision

Distribute the IA-MNS repository source, including material inherited from Orion and IA-MNS's own work, under the unmodified Apache License, Version 2.0. The root `LICENSE` file holds the canonical terms, and the root README states the decision. The repository remains public.

Do not add package license metadata, a `NOTICE` file, or a copyright statement in this decision. Packages are private and unpublished, and the owner has not named a copyright holder. Any later change to the license or distribution model requires a new decision.

## Rationale

The owner chose the license explicitly. Because the inherited Orion material already uses Apache-2.0, one license now covers the whole repository. Contributors and readers therefore do not need to tell foundation code from project code to know which terms apply, and Orion upgrades keep merging into a single-license tree. The root license file already contains the standard terms, so the decision needs no custom text.

The repository is public, which means the code and documentation can be read by anyone and reused under these terms. Business rules, ERP table names, and verification evidence in the documentation are therefore public too. Credentials, local configuration, and real financial results stay out of the repository under the existing [secrets](../security/secrets-management.md) and [data classification](../security/data-classification.md) policies.

## Alternatives Considered

### Keep IA-MNS's own work under a different or proprietary license

The owner did not choose this. It would mean mixed licensing in one repository and does not fit the decision to keep the repository public.

## Consequences

### Positive

- The repository has one clear, standard license that GitHub detects.
- Orion upgrades do not create licensing boundaries inside the tree.

### Negative

- Anyone may use, modify, and redistribute IA-MNS under Apache-2.0. Confidential business data must therefore never be committed, because publication cannot be undone by later changing the license.
- Redistributors must satisfy Apache-2.0 conditions. The license does not settle obligations of third-party dependencies. A dependency-license policy remains deferred under [ADR-0011](0011-establish-continuous-integration-dependency-automation-and-supply-chain-security-strategy.md#license-policy).

### Operational or Migration Impact

No application, manifest, package publication, or deployment change is required. A copyright notice can be added later if the owner names a holder.

## References

- [Canonical Apache-2.0 license](../../LICENSE)
- [Repository README](../../README.md#license)
- [ADR-0016](0016-license-the-orion-foundation-under-apache-2-0.md)
- [Project human action PH-06](../project/human-actions.md#ph-06)
- [Project derivation](../project-derivation.md)
