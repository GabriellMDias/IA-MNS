# Validation

## Current availability

The repository now has a pnpm workspace, a committed lockfile, and local validation tooling. Install Node.js 24.13.0 and pnpm 11.25.0 (pinned in `.node-version` and `package.json`), then run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm validate
```

`pnpm validate` runs the independently available checks below in order and stops at the first failure. It is non-interactive and does not fix tracked files. Run a narrower script to diagnose a particular failure.

| Command | Current check |
| --- | --- |
| `pnpm format:check` | Prettier checks source and configuration files. Existing authored Markdown is covered by structural checks below, not a repository-wide Prettier baseline. |
| `pnpm lint` | ESLint Flat Config checks JavaScript and TypeScript; TypeScript uses typescript-eslint's type-aware rules. |
| `pnpm typecheck` | Strict TypeScript checking of repository tooling, API, generated SDK wrapper, web source, and browser/E2E test code. |
| `pnpm architecture` | dependency-cruiser checks resolvable imports, cycles, and applicable repository/application/package boundary rules. Extend rules with real package ownership and public APIs. |
| `pnpm docs:check` | Checks local Markdown targets and heading anchors, single top-level headings, ADR filenames/metadata/index entries, and reachability from the root README. It does not verify external URLs or the meaning of a document. |
| `pnpm env:example:check` | Compares the safe root `.env.example` with API TypeBox configuration reference metadata and verifies its active development value parses. Runtime and migration credentials remain separate. |
| `pnpm release:check` / `pnpm release:test` | Verifies recorded durable migration SQL and append-only release history against Git; fixture tests prove tampering fails and unrecorded migrations remain refinable. An empty registry records no release but does not certify that no private durable environment exists. |
| `pnpm references:check` | Checks API configuration, errors, OpenAPI, and migrated-PostgreSQL references; independently regenerates SDK types from the committed OpenAPI and compares without changing tracked files. Text comparisons normalize checkout line endings, so Windows CRLF does not masquerade as generated-content drift. |
| `pnpm docs:references:check` | Derives portal data and component Markdown from committed API/database references and component-owned metadata; rejects missing component documentation, known secret patterns, or stale browser/reference output. `pnpm docs:references:write` intentionally regenerates these artifacts. |
| `pnpm test` | Runs API Vitest tests against migrated PostgreSQL and web component tests in a real Chromium-family browser through Vitest Browser Mode/Playwright. |
| `pnpm build` | Emits Node-compatible ESM for `apps/api` and a static Vite production build for `apps/web` to ignored `dist/` directories, then checks browser assets for known server-only markers. |
| `pnpm smoke` | Starts the emitted API for foundation checks and then with migrated Testcontainers PostgreSQL and a local signed-token issuer for a real create/submit/review HTTP workflow; checks invalid configuration, trace propagation, failed OTLP export, and required authorization. |
| `pnpm test:e2e` | Runs Playwright Test in Chromium against the emitted API, actual Vite web app and public documentation route, signed synthetic identities, and a fresh migrated Testcontainers PostgreSQL with a separate restricted runtime role. |

Use `pnpm format` only when an intentional formatting edit is needed; it writes files and is separate from `pnpm validate`. A formatting failure names the file; type, lint, architecture, and documentation failures report the relevant source location or import/link. Repair the canonical source and rerun the failing script, then the aggregate command.

Clean checkouts use LF for tracked text through `.gitattributes`, so Windows `core.autocrlf` does not make Prettier reject otherwise unchanged files. Existing checkouts may need files rechecked out or intentionally formatted after this rule is introduced; do not hide content drift by regenerating tracked references.

`pnpm release:checksums <full-deployed-commit-sha>` prints candidate migration source hashes for the [release recording workflow](database/release-evolution.md); it does not record a release or verify what a database applied.

The API, generated SDK/web reference workflow, and living documentation portal exist. `pnpm validate` first generates the ignored Prisma client; API references, integration tests, and browser E2E require a Testcontainers-compatible runtime. Browser tests require Playwright Chromium (the local Windows Vitest provider can use installed Edge); CI installs Chromium and its system libraries before running the same validation command. A concrete identity provider remains conditional under [H-07](human-actions.md#h-07). A GitHub Actions workflow invokes `pnpm validate`; its execution and required-check settings are tracked in [CI status](architecture/continuous-integration.md). First-party workspace dependencies use `workspace:`.

## Accepted responsibilities

The [validation ADR](adr/0003-establish-repository-validation-and-architecture-enforcement.md), [testing ADR](adr/0009-establish-testing-strategy-and-tooling.md), and [CI ADR](adr/0011-establish-continuous-integration-dependency-automation-and-supply-chain-security-strategy.md) govern implementation.

| Responsibility | Accepted mechanism |
| --- | --- |
| Formatting checks | Prettier; separate checking from automatic fixes |
| Static analysis | ESLint Flat Config and typescript-eslint, with typed linting where useful |
| Type checking | TypeScript compiler; test execution and linting do not replace it |
| Dependency boundaries | dependency-cruiser, derived from [dependency rules](architecture/dependency-rules.md) |
| Pure logic | Vitest in Node.js |
| Infrastructure integration | Vitest with real dependencies; Testcontainers and migrated PostgreSQL for persistence behavior |
| Browser-dependent component/feature behavior | Vitest Browser Mode with the Playwright provider |
| Complete browser journeys | Playwright Test; Chromium initially, additional browsers according to product requirements |
| Derived artifacts and documentation | Consistency, links, metadata, and generation checks when their canonical sources and tooling exist |

The canonical workflow must be deterministic, non-interactive, composable, and non-mutating with respect to tracked source files. Explicit formatting/fix operations remain separate. Managed generated or ignored execution artifacts are not source modifications.

Add validation capabilities only when their implementations exist. Individual responsibilities should remain independently runnable where practical. CI must invoke the same validation capabilities rather than maintain different correctness logic. See [CI policy](architecture/continuous-integration.md).

## Choosing verification

Use [testing strategy](architecture/testing-strategy.md) for risk and test-layer selection. Documentation-only work can verify links, anchors, references, decision metadata, source preservation, and the final diff without pretending runtime tests exist. Structural checks do not replace review of normative meaning or accepted ADR constraints.

As applications and packages arrive, extend these checks and add the applicable test, build, and generated-artifact checks. Update this availability section and the root command pointer in the same change. Examples of future commands in ADRs are not evidence that those commands have been implemented.
