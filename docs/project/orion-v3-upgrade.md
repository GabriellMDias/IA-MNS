# Orion v3.0.0 Foundation Upgrade

[Project plan](implementation-plan.md#current-work) · [Human actions](human-actions.md) · [Official workflow](../project-derivation.md#upgrade-to-a-newer-orion-revision)

## Scope and provenance

PJ-59 adopts the released Orion v3.0.0 commit `aafb920a3616f51c0da4b145dbee61a4bf5c3cc7`. The upgrade branch starts at IA-MNS main `4bed381`, which already contains PR #11. The starting checkout had no tracked or untracked modifications. The merge base and immutable initialization revision are `53bcc705a9f68f01aa1bbea3a0f4df4a009577ea`. The target is on the verified fetch-only `orion-upstream/main`; later publication-record commits are outside this upgrade.

The official workflow requires a real merge of the upstream commit, `orion:prune`, source regeneration, complete validation, a clean merge commit, and then `orion:record-baseline` and another validation. Reviewers must integrate this PR with a merge commit to retain foundation ancestry. Do not squash or rebase it. No release or production deployment is part of PJ-59.

## Reconciliation and preservation

- Keep IA-MNS's composed corporate agent, conversations, identity and permissions, WhatsApp, Semantic Product Resolver, sales, ERP adapters, PDT bridge and Sankhya add-on. API feature source, API/web module composition, SDK contracts, Prisma schema, metadata, grants, migration SQL and release history are unchanged from the starting product commit.
- Keep the product Button/TextField contracts, `loading`, four button variants, SelectField, PageHeader, SectionCard, StatusBadge, ErrorNotice, themes and synthetic feature previews. Adopt classification, ownership, source/export verification, examples and category navigation without installing competing primitives or a parallel stylesheet. Feature metadata is discovered automatically beside its source; the old root registration list is no longer needed.
- Keep the product shell, sidebar and localized workflows. The internal portal owns its layout and retains the existing theme toggle. Both shared and feature-owned catalogs remain available in development.
- Resolve the incoming ADR-0018 collision as [IA-MNS ADR-0039](../adr/0039-isolate-internal-documentation-from-product-distribution.md), with explicit upstream provenance. Preserve the existing sales ADR-0018 and every product decision identifier. ADR-0039 partially supersedes only ADR-0029's build selection; its hosting and security decisions remain intact.
- Keep per-surface embed CSP, Referrer-Policy, development proxies, `ia-mns-web.json` and the API's independent `ORION_WEB_DOCS` refusal. Production web builds exclude the internal portal by default. Explicit internal builds require both foundation build controls and external protection for the entire artifact. `VITE_ORION_DOCS` is retired; see [current controls](../architecture/living-documentation.md#build-and-deployment-boundary).
- Remove application README/instruction files from both distributed API images, retain required runtime/migration assets and licenses, and check the final runtime image in CI. Product tests use the default artifact; API-served feature-catalog tests create a separate disposable internal artifact. Process smoke explicitly accepts the default product build with documentation disabled and separately verifies refusal of an internal-manifest fixture. Account-menu expectations require the developer link only in development.
- Prune only foundation reference implementation/history paths and regenerate all derived references from canonical product sources. Preserve the project README, plans, human actions, assets, feature documentation and configurations, including files Git merged automatically.

## Verification

Evidence recorded on 2026-10-24 in this checkout:

| Check | Evidence |
| --- | --- |
| Toolchain and dependencies | Node.js 24.13.0, pnpm 11.25.0; frozen install succeeds; `pnpm audit` reports no known vulnerabilities. Fastify 5.12.6, Vite 8.3.4, Vitest 5.0.5 and markdown-it 15.0.3 adopt the foundation security updates. |
| Regeneration | Prisma client, API/database/configuration/error/feature references, SDK and internal portal regenerated through official commands. API/SDK/database contracts retain their starting content. |
| Generator and distribution tests | 24 generator tests and both actual-build isolation tests pass, including default product, neutral derived composition, product-owned help, explicit internal catalog/search/previews, and rejection of accidental internal imports. |
| Production artifacts | Both Docker targets build. Runtime check verifies non-root execution, Oracle Instant Client 19.32 Thick initialization, product-only web and absence of application engineering guides. The migration image preserves all 16 normalized migration SQL files and runs as non-root without application engineering guides. No database connection is made by these image checks. |
| Sankhya add-on | `gradlew.bat model:test` passes: eight Java tests, zero failures/errors. No `deployAddon` or Om mutation. |
| Complete gate | The complete pre-merge `pnpm validate` passed: 572 API, 79 web unit, 20 browser component and 42 end-to-end tests, static/reference/provenance checks, actual-build isolation, builds and both process smokes. Merge `2b273e6a59606edd8fe8857597e5079c37fbc1fd` retains the product and target foundation parents. Official baseline recording is commit `b92df67476fbd3e8bc184fa9bb3d9180ea357487`; initialization provenance is unchanged. The post-baseline gate passed through all 572/79/20 tests and build, then hit the existing 5-second invalid-startup smoke timeout; both process smokes passed on focused repeat. The complete post-baseline [PR CI run 40107974130](https://github.com/GabriellMDias/IA-MNS/actions/runs/40107974130) passed on `b8d3d6cf54522a2c65cd44403a3d7d9eb7f1ce3c`: all 572/79/20/42 tests, both process smokes, production image checks, the entire synthetic installation/backup/restore/rollback rehearsal, dependency review and the Orion required gate. CodeQL and GitGuardian also passed. [PR #13](https://github.com/GabriellMDias/IA-MNS/pull/13) remains open and unmerged; its current checks own subsequent review-state evidence. Local runs use `VITEST_MAX_WORKERS=2` and Git for Windows OpenSSL on the process PATH. No assertion or timeout was weakened. |

The [post-upgrade audit](orion-v3-post-upgrade-audit.md) compares the complete upgrade against the original product commit, records the authored-source isolation correction and owns its verification evidence.

## Release and operational boundaries

Production deployments, real ERP queries/mutations, provider evaluation calls, credentials, tag/release publication and PR integration remain outside this change. Existing human actions and unverified external grants remain open. Synthetic PostgreSQL and host/provider fixtures validate integration boundaries without certifying a live ERP or production installation.

Future deployments must rebuild product artifacts and remove stale internal documentation files and caches through the approved deployment procedure. An intentional internal deployment additionally needs verified host authorization over every direct asset and download; build flags and API runtime opt-in do not provide that access control.
