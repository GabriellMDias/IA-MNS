# Validation

## Current availability

The repository has a pnpm workspace, a committed lockfile, and local validation tooling. Install Node.js 24.13.0 and pnpm 11.25.0 (pinned in `.node-version` and `package.json`), then run from the repository root:

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
| `pnpm architecture:test` | Negative and permitted import fixtures verify flat domain, client/SDK, cross-application, cycle and generated-output boundaries. |
| `pnpm docs:check` | Checks local Markdown targets and heading anchors, single top-level headings, ADR filenames/metadata/index entries, and reachability from the root README. It does not verify external URLs or the meaning of a document. |
| `pnpm agents:check` / `pnpm agents:test` | Rejects committed instruction copies such as `CLAUDE.md` or `GEMINI.md`, requires the Gemini CLI adapter to set only `context.fileName: ["AGENTS.md"]`, and keeps each root-to-directory `AGENTS.md` chain within 32 KiB; tests use disposable Git repositories. See [agent instructions](architecture/agent-instructions.md). |
| `pnpm env:example:check` | Compares the safe root `.env.example` with API TypeBox configuration reference metadata and verifies its active development value parses. Runtime and migration credentials remain separate. |
| `pnpm release:check` / `pnpm release:test` | Verifies recorded durable migration SQL and append-only release history against Git; fixture tests prove tampering fails and unrecorded migrations remain refinable. An empty registry records no release but does not certify that no private durable environment exists. |
| `pnpm orion:check` / `pnpm orion:test` | Validates [`.orion/project.json`](../.orion/project.json). In a derived project it also requires the project plan and human actions, the recorded Orion commits in history with the baseline an ancestor of `HEAD`, and a coherent Approval Request disposition, and applies the [remote rules](project-derivation.md#remote-rules) to the clone's `origin` and any `orion-upstream`. Tests initialize, protect, upgrade, work through a fork, and refuse unsafe states in disposable local Git repositories. See [project derivation](project-derivation.md). |
| `pnpm references:check` | Checks API configuration, errors, OpenAPI, and migrated-PostgreSQL references; independently regenerates SDK types from the committed OpenAPI and compares without changing tracked files. Text comparisons normalize checkout line endings, so Windows CRLF does not masquerade as generated-content drift. |
| `pnpm docs:references:check` | Derives the portal catalog, local Markdown/reference pages, search shards, and component Markdown; rejects incomplete metadata, unsafe source content, or missing/stale/orphaned generated output. `pnpm docs:references:write` intentionally regenerates these artifacts. |
| `pnpm docs:references:test` | Tests deterministic generation, local links/heading IDs, hostile content, supported schema/reference handling, large inventories, and generated-output lifecycle. |
| `pnpm test` | Runs API Vitest tests against migrated PostgreSQL and web component tests in a real Chromium-family browser through Vitest Browser Mode/Playwright. |
| `pnpm build` | Emits Node-compatible ESM for `apps/api` and a static Vite production build for `apps/web` to ignored `dist/` directories, then checks browser assets for known server-only markers. |
| `pnpm smoke` | Starts the emitted API for foundation checks and then with migrated Testcontainers PostgreSQL and a local signed-token issuer for a real create/submit/review HTTP workflow; checks invalid configuration, trace propagation, failed OTLP export, and required authorization. |
| `pnpm test:e2e` | Runs Playwright Test in Chromium for product journeys, local documentation navigation/search, safe API exploration, responsive/keyboard behavior, and axe accessibility scans against the emitted API, actual Vite web app and public documentation routes, signed synthetic identities, and a fresh migrated Testcontainers PostgreSQL with a separate restricted runtime role. |

Use `pnpm format` only when an intentional formatting edit is needed; it writes files and is separate from `pnpm validate`. A formatting failure names the file; type, lint, architecture, and documentation failures report the relevant source location or import/link. Repair the canonical source and rerun the failing script, then the aggregate command.

Tracked text uses LF through `.gitattributes`; reference comparisons normalize checkout line endings. Preserve content when correcting line endings, and do not hide drift by regenerating tracked references.

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

Use [testing strategy](architecture/testing-strategy.md) for risk and test-layer selection. During documentation work, run `pnpm docs:check` for links, anchors, reachability, and ADR metadata; use `pnpm docs:references:check` when reviewing generated portal/component output. Run the full `pnpm validate` for substantial work. Structural checks do not replace semantic review, preservation of requirements/ADRs, or the final diff review.

When adding a capability, extend the applicable checks and update this command inventory in the same change. Examples of future commands in ADRs are not evidence that those commands have been implemented.

## Living Documentation manual browser checks

The owner retained manual browser verification on 2026-09-28 and reported [H-12](human-actions.md#h-12) complete on 2026-09-29. This is human-observed acceptance; the owner did not supply a route-by-route browser/version log. The automated browser suites remain enabled within `pnpm test` and `pnpm validate` and must be reported from actual runs separately. Reuse this checklist after material portal changes.

Start the [standalone portal](setup.md#living-documentation-portal) for checks 1–6. Repeat deep-link and asset checks against the production build using Vite preview. Start the [disposable Approval Request workflow](setup.md#manually-exercise-approval-requests) for checks 7–9; use its printed web origin and synthetic data only.

1. **Collections and local reading:** From `/docs`, visit API, Data dictionary, Components, Repository docs, and Architecture. Follow Repository docs → Project knowledge → Architecture and use breadcrumbs to return. Read `/docs/repository/docs/setup`, a numbered ADR, and the root README/AGENTS pages. Documentation links and heading anchors should remain local; code links may open GitHub. Select each API group and verify the list changes. Collections with more than 24 direct entries should offer working pagination.
2. **Deep links and recovery:** Open `/docs/api/createApprovalRequest`, `/docs/database/approval_requests`, and `/docs/repository/docs/setup#prepare-a-clean-checkout` directly. Reload and use Back/Forward; the same page/section should remain reachable. Follow an outline link, then visit `/docs/repository/docs/not-a-real-document`; expect a useful missing-page message and working navigation back to Overview. Repeat direct loading and reload against Vite preview.
3. **Search:** Search separately for `destructive integration suites`, `createApprovalRequest`, `creator_id`, and `onReload`. Results should reach the testing policy, API operation, table, and ErrorNotice component respectively, including matching sections where present. Narrow by documentation kind, reload the search URL, and try an unmatched query. Confirm clear empty results and that rapidly replacing a query does not show stale results.
4. **Reference completeness and artifacts:** Inspect operation parameters, required fields, authentication, request/response schemas and referenced schemas; inspect table columns, null meaning, lifecycle, constraints and indexes; inspect component props, usage, accessibility and examples. Open the section's OpenAPI/database/component artifact links and confirm they resolve on the local origin with the expected content.
5. **Responsive and accessible use:** At desktop width and approximately 390 px, navigate only with Tab, Shift+Tab, Enter and Space. Verify a visible focus indicator, Skip to documentation, usable search and labels, the collapsible Browse documentation menu and On this page outline, logical focus after navigation, and readable errors/status updates. At 200% zoom, check wrapping and access to all controls; wide tables/code may scroll inside their container, but the page should not overflow horizontally. Run an accessibility scan on Overview, API detail, table, component and setup pages, then inspect heading order, contrast, names and status announcements with a screen reader; automated scans alone do not establish accessibility.
6. **Synthetic previews and passive privacy:** With browser Network and Storage panels open, enter `non-secret-example` in the AccessTokenForm preview and select Connect; the preview should discard it and explain that result. Exercise the ErrorNotice demonstration reload. Browsing, search and previews must make no API calls or external image/search requests and must not store the input in URLs, local storage or session storage. Network inspection should show selected detail assets on demand and search shards only after searching.
7. **Explicit API execution:** On `/docs/api/getReadiness`, confirm no API request occurs before Send request. Send once and expect one same-origin `/api/health/ready` request, HTTP 200, elapsed time and JSON status. On `/docs/api/listApprovalRequests`, enter `synthetic-invalid-token`, send and expect HTTP 401 with the public authentication error. Confirm no credential appears in the URL or browser storage.
8. **Authenticated mutation and clearing:** In the disposable app, select Use local owner and obtain only that synthetic helper response's `accessToken` from the browser Network panel; do not save or share it. On `/docs/api/createApprovalRequest`, enter that token, a fresh `idempotency-key`, and `{"title":"Synthetic documentation request","description":null}`. Sending without acknowledgement must make no request. After acknowledging, invalid JSON must show an error without sending; valid JSON should produce one HTTP 201 response. Confirm the created resource in the local owner workflow. Clear request and response, leave the operation, and reload; token, response and acknowledgement must not persist. Use a fresh key for a new create request.
9. **Connection failure and cancellation:** Using the browser's network throttling/offline controls, exercise failed connection, cancellation and the 15-second timeout. Verify bounded, understandable feedback, recovery of Send request, and no late response after cancellation/navigation. For a mutation, the message must preserve the possibility that the server accepted it; inspect state before retrying. Confirm responses render as text and headers expose only the safe allowlist. Restore normal network settings afterwards.

For future rechecks, record the tested commit (or branch and working-tree changes if uncommitted), browser/version, viewport, development versus production preview, results and any failing route/control. Do not attach credentials, request headers or sensitive payloads. H-12 is already recorded as completed from the owner's attestation; Phase 12 remains out of scope.
