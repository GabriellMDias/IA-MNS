# ADR-0017: Start Derived Projects from a Clean Foundation Baseline

**Status:** accepted

**Date:** 2026-09-30

**Supersedes:** [ADR-0014](0014-derive-projects-from-orion-through-git-ancestry-with-recorded-provenance.md), only for inheriting Orion's plan, human actions, and acceptance history, retaining the Approval Request reference implementation with a recorded disposition, and keeping the foundation workspace package scope; its Git ancestry, provenance, remote protection, and upgrade decisions remain accepted

## Context

ADR-0014 derived projects through Git ancestry and kept everything Orion contained. A project therefore started with Orion's own implementation plan, human actions, and acceptance report as "inherited history", with the Approval Request slice as a retained reference implementation awaiting a product decision, and with `@orion/*` workspace packages. The first real derivation showed the cost: a new product repository read as Orion itself, carried documentation describing how Orion was built, and shipped an unrelated feature through its API, database, SDK, web application, and portal.

The owner directed that a new project start as a clean base for developing a product: it keeps Orion's architecture, principles, tooling, validation, CI, Living Documentation Portal, provenance, and future upgrades, but contains neither the reference implementation nor documentation of the foundation's development, and it carries the project's own name on its important surfaces.

Two structural facts made removal brittle under ADR-0014: shared runtime code imported the reference feature directly, and shared documentation linked to foundation-only files. A deletion step would have had to rewrite shared files and would conflict on every upgrade.

## Decision

Orion separates its content into three categories, recorded in the machine-readable derivation contract `.orion/derivation.json`:

- **Shared foundation**: architecture, policies, ADRs, tooling, CI, the API runtime and module contract, the web shell and portal, and generated-reference machinery. Shared code and documentation must work without foundation-only content: they do not import, link to, name, or describe it. Validation in Orion enforces this isolation.
- **Foundation-only**: Orion's Approval Request reference implementation (feature code, schema, migration, metadata, grants, smoke, tests, browser journeys, and domain documentation) and Orion's own implementation plan, human actions, and acceptance history.
- **Project-owned**: files every repository owns from its first commit, rendered from templates at initialization: the README, the API and web composition files (`apps/api/src/modules.ts`, `apps/web/src/modules.tsx`), the brand assets, and `docs/project/implementation-plan.md` and `docs/project/human-actions.md`. Orion's own copies compose the reference implementation and describe Orion.

`pnpm orion:init-project` removes the foundation-only paths, renders the project-owned files from the project identity, renames the workspace package scope (package manifests, the lockfile, and source; not authored prose) to the project's scope, names the root package after it, regenerates every derived artifact from the changed sources, and records manifest schema version 2 with the project name and package scope. It then commits on top of Orion's history and protects the upstream remote exactly as ADR-0014 decided. Living Documentation titles, the HTML title, the OpenAPI title, and the telemetry service name derive from the manifest name and package names.

Upgrades remain reviewed merges with ancestry. Because the project deleted foundation-only paths, an upgrade that changes them conflicts or reintroduces them; `pnpm orion:prune` reapplies the contract by removing those paths and renaming foundation scope references, and project validation fails while either remains. Project-owned files keep the project's version during upgrades.

The `ORION_*` configuration names, `orion_*` token claims and database role names, and the `Orion required gate` check name remain the foundation's technical namespace. Renaming them would touch shared files throughout the repository and conflict on every upgrade, and the check name is bound to branch protection.

## Rationale

Isolating shared content from foundation-only content turns removal into deleting a known list of paths rather than editing shared files, so a derived project shares every shared file byte for byte with Orion and upgrades merge cleanly there. Composition files give each repository a single owned seam for its modules; keeping Orion's reference behind that seam keeps it executable and validated in Orion, where it remains the example a project can study upstream.

A project that starts with Orion's history documents and a foreign feature must first remove or disclaim them, and its agents read another repository's plan as context. Starting clean makes the project's own plan and human actions the only current work and its README describe its actual state.

Renaming the package scope affects only package manifests, the lockfile, and a few imports, so it costs little at upgrade time and removes the most visible remaining Orion identity; `pnpm orion:prune` reapplies it mechanically. The configuration and claim namespaces appear in far more shared files and external configuration and are documented as foundation names instead.

## Alternatives Considered

### Keep the reference implementation with a recorded disposition

ADR-0014's model. It keeps initialization simple but makes every new product carry and validate an unrelated feature until someone performs a multi-artifact removal, which is exactly the brittle step this decision eliminates.

### Delete the reference implementation by editing shared files during initialization

A script could rewrite shared code and documentation, but every edited shared file would then differ from Orion and conflict on later upgrades. Isolation moves those differences into project-owned composition files instead.

### Move the reference implementation to a separate repository or a non-default branch

This would keep Orion's main branch clean but lose the executable example in the foundation's own validation gate, and projects could no longer see in Orion how a complete module fits the architecture.

### Rename every Orion namespace

Renaming configuration variables, token claims, database roles, and the CI check would maximize branding but touch most of the repository and external settings, making every upgrade conflict.

## Consequences

### Positive

- A new project contains only shared foundation content and its own files; its README, plan, human actions, package names, portal, and API contract describe it.
- Orion keeps a complete, validated reference implementation and its development history.
- Isolation, project cleanliness, and remaining foundation scope references are checked mechanically.

### Negative

- Upgrades that change foundation-only paths conflict in projects, and every upgrade must run `pnpm orion:prune` before validation.
- Initialization regenerates references, so it requires dependencies installed and a Testcontainers-compatible container runtime.
- Shared documentation cannot refer to the reference implementation except through the derivation guide.

### Operational or Migration Impact

- This changes the derivation contract and the manifest schema incompatibly, which [foundation versioning](../versioning.md#compatibility-meaning) classifies as a MAJOR foundation change.
- Projects derived under ADR-0014 have a schema version 1 manifest; `pnpm orion:check` refuses it with directions to the migration steps in the [derivation guide](../project-derivation.md#migrate-a-project-from-schema-version-1).

## References

- [Project derivation and Orion upgrades](../project-derivation.md)
- [ADR-0014: derive projects through Git ancestry](0014-derive-projects-from-orion-through-git-ancestry-with-recorded-provenance.md)
- [Foundation versioning](../versioning.md)
- [API modules](../../apps/api/README.md#modules) and [web modules](../../apps/web/README.md#modules)
