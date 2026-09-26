# Contributing and Documentation

Use the [task index](README.md) to locate the policy relevant to a change. This guide owns the contributor workflow and documentation-maintenance rules; it does not replace the architectural policies or [accepted decisions](adr/README.md).

## Change workflow

1. Inspect relevant implementation, documentation, tests, and applicable local `AGENTS.md` files. Search for existing implementations and public APIs before creating equivalents.
2. Identify the smallest coherent change that follows existing patterns and architectural boundaries. Preserve unrelated code and avoid unnecessary refactoring. State assumptions that cannot be verified; do not invent repository behavior or domain rules.
3. Before introducing an abstraction, service, package, dependency, or cross-layer relationship, check existing equivalents, boundaries, and ADRs. Shared code must represent shared meaning, not merely similar code. Record genuinely significant architectural decisions through the [ADR process](adr/authoring.md).
4. Implement the change, add or update behavior tests, update affected documentation, and regenerate derived artifacts from their canonical sources.
5. Run the available [validation](validation.md), review the final diff, and report unavailable checks or remaining failures explicitly. Do not declare success while concealing known validation errors.

Keep pull requests as coherent units of work. Follow-up changes for the same phase or objective should normally reuse its open PR and branch instead of creating a new PR for each small documentation or status update.

Prefer the least irreversible solution when an architectural choice is uncertain. Identify conflicts with established architecture rather than bypassing them. Prefer mechanical enforcement where practical; never weaken typing, tests, validation, security, or observability to make a change pass.

Before adding a dependency, check repository and standard-platform capabilities. Consider maintenance, security, licensing, runtime/bundle cost, and ecosystem maturity. Avoid competing libraries for the same responsibility without a documented reason. Foundational dependencies may require an ADR.

Behavior changes require appropriate verification. Use the lowest-cost test that reliably protects behavior, with broader integration coverage at boundaries. Bug fixes should include a regression test whenever practical; otherwise document why and how the fix was verified. Do not delete, disable, or weaken a valid test merely because it fails. See [testing strategy](architecture/testing-strategy.md).

Completion requires, as applicable: correct implementation, respected boundaries, passing tests/types/static analysis, current generated artifacts and documentation, preserved observability, satisfied security requirements, and no unrelated changes. Passing tests do not excuse architectural violations; correct code with stale documentation is incomplete.

## Documentation ownership

| Information | Authoritative location |
| --- | --- |
| Current architectural policy and intended behavior | Relevant policy under `docs/` |
| Architectural decision history and rationale | [ADRs](adr/README.md) |
| Current executable operational procedure | [Runbooks](runbooks/README.md) |
| Development history | Git |
| Released database transitions | [Migration history](database/migrations.md) |
| Externally relevant release history | Changelog when releases exist |
| Structural reference | Generated from canonical schemas, contracts, or metadata |
| Domain meaning | Near the owning domain; `docs/domains/` when cross-file explanation is needed |
| Application/package-specific knowledge | Near the owning application or package |

Prefer the narrowest authoritative location. Do not create empty documentation directories, speculative runbooks, or placeholder applications to match an illustrative tree. `docs/domains/` and `docs/generated/` should appear only when real content exists. Technology-specific documentation is appropriate after the technology exists or has been selected.

Packages should document responsibility, public API, dependency constraints, and important assumptions when these cannot be safely inferred from code or contracts. Domain documentation may explain terminology, invariants, ownership, workflows, state transitions, side effects, and failure semantics. Repository-wide policy must not become a dumping ground for one feature or provider integration.

## Authored meaning and generated facts

Document architectural decisions, business rules, invariants, non-obvious constraints, side effects, public contracts, security-sensitive behavior, failure modes, operational procedures, integrations, and unusual implementation choices with their rationale. Explain why, constraints, and consequences rather than restating code or type signatures.

A fact should have one canonical source wherever practical. Small navigational summaries are useful; independently maintained normative copies are not. Link to the authoritative policy instead of repeating its rules. Code comments should explain local non-obvious reasoning, such as ordering, protected invariants, retry safety, or workaround constraints.

| Reference | Canonical source and governing policy |
| --- | --- |
| Database | Schema semantics and metadata under [schema documentation](database/schema-documentation.md); the complete physical reference must account for migrated PostgreSQL, including custom SQL |
| API and SDK | Executable contracts and route metadata, then generated OpenAPI and clients under [API principles](api/principles.md) |
| Configuration | Canonical schema and metadata under [configuration](architecture/configuration.md): name, type, description, required/default, classification, secret status, and validation |
| Public errors | API-owned [`errorRegistry`](../apps/api/src/errors.ts) under [error contract](api/error-contract.md), with a [generated reference](generated/api/errors.md) |
| Components | Web component source and [owned examples/metadata](../apps/web/src/components.docs.json), with generated [AI-readable reference](generated/components/web.md) and [human-facing portal](architecture/living-documentation.md) |

Files marked as generated must not be edited independently. Update their canonical source and regenerate using repository tooling. Generated output must not become a source of truth or be patched to hide stale generation. Reviewed SQL migrations have the distinct authorship and release rules in [migration policy](database/migrations.md); this does not authorize editing generated SDKs or references.

## Maintenance and review

Current policy describes current truth, including accepted direction and transitional implementation state. ADRs preserve decision history; old Git revisions and superseded ADRs are not automatically current instructions. Keep implementation availability separate from decision status. Do not silently select an intentionally deferred technology or fabricate missing semantics.

Update canonical documentation when behavior, architecture, contracts, configuration, security, ownership, database semantics, or operational procedures change. Significant behavior changes should include those updates in the same change where practical. Incorrect or obsolete current documentation is a defect.

Use English for repository artifacts, including comments, API/database descriptions, generated documentation, and operational metadata, except where product localization or external data explicitly requires another language. Use stable terminology for the same concept across documents.

Before adding a document, identify its question, owner, canonical source, audience, discovery route, and maintenance needs. Prefer an existing owner or machine-readable source when appropriate. Before completing a change, check whether it requires an ADR, supersession, generated-reference regeneration, or updates to affected consumers and policies.

Review documentation in proportion to its importance: architecture, security, database lifecycle, API compatibility, and production-operation changes deserve particular scrutiny. Optimize for accuracy, clarity, discoverability, and durability rather than volume. Link and metadata checks should become mechanically enforced when tooling exists; those checks do not prove semantic correctness.
