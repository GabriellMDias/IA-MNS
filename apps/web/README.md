# Orion Web Reference Workflow

[Setup](../../docs/setup.md) · [Feature rules](../../docs/domains/approval-request.md) · [Generated API](../../docs/generated/api/openapi.json) · [Validation](../../docs/validation.md)

This React/Vite application demonstrates the Approval Request workflow through the generated `@orion/sdk` client. TanStack Router owns detail IDs and list scope/cursor in the URL, TanStack Query owns API state, and React owns temporary form/interaction state. The API enforces ownership, review capability, version preconditions, and state transitions.

## Find the owning implementation

| Concern | Source |
| --- | --- |
| Routes and feature UI | [`src/main.tsx`](src/main.tsx) |
| In-memory credentials and query/client boundary | [`src/auth.tsx`](src/auth.tsx), [`src/api.ts`](src/api.ts) |
| Client configuration | [`src/config.ts`](src/config.ts) and [`vite.config.ts`](vite.config.ts) |
| Exported components and canonical examples | [`src/components.tsx`](src/components.tsx), [`src/components.docs.json`](src/components.docs.json) |
| Documentation presentation | [`src/documentation.tsx`](src/documentation.tsx) under [portal ownership](../../docs/architecture/living-documentation.md) |

## Run the workflow

Use the canonical [setup guide](../../docs/setup.md) for installation, environment loading, and prerequisites. `pnpm dev:approval` starts the complete disposable API/database/web workflow and synthetic owner/reviewer identities. For a separately configured API at `127.0.0.1:3000`, run `pnpm --filter @orion/web dev`.

Vite forwards the default `/api` browser path to the local API and removes that prefix. `ORION_WEB_API_TARGET` changes only the development-server target. `VITE_ORION_API_BASE_URL` is the sole browser API setting, defaults to `/api`, and must be a same-origin path. A deployed static build needs an equivalent same-origin route/reverse proxy; this guide does not select deployment infrastructure. Server-only URLs and credentials must not enter browser configuration.

The provider-independent interface accepts an already-issued bearer token and holds it only in React memory. Disconnect/refresh clears it; changing it clears cached query data. The local workflow provides short-lived synthetic tokens through its development-only issuer path. This is not a login/session/refresh implementation. A real provider and user-facing acquisition flow remain conditional under [H-07](../../docs/human-actions.md#h-07); never use production credentials in tests. The API still verifies every business request.

## Living Documentation Portal

The public `/docs` hub provides separate API, data dictionary, component, and repository-documentation collections, nested local pages, breadcrumbs, page outlines, and full-text search. Reading and synthetic previews need no token, API process, or database. The API explorer sends only explicit requests to the configured same-origin API, keeps tokens in memory, and asks for acknowledgement before writes. See [portal setup](../../docs/setup.md#living-documentation-portal) to run it independently or with the disposable API workflow.

Component examples/descriptions belong in [`components.docs.json`](src/components.docs.json) beside the real exports. `pnpm docs:references:write` produces [component Markdown](../../docs/generated/components/web.md) and a lightweight catalog, separately loaded pages, and search shards. All `docs/` Markdown and repository README/instruction files are rendered locally; normal documentation links stay in the portal. Regenerate after authored documentation edits too. API/database/error references come from their respective canonical generators. The portal is a presentation of those facts, not another authoring source.

## Validate changes

Run commands from the repository root. `pnpm --filter @orion/web typecheck`, `build`, `bundle:check`, `test:unit`, `test:browser`, and `test:e2e` are individual package scripts; use `pnpm validate` for the complete gate. After intentional contract changes, follow the [artifact workflow](../../docs/architecture/backend-execution-and-generated-artifacts.md) to regenerate API, SDK, and portal data in order. `pnpm references:check` and `pnpm docs:references:check` detect drift without repairing tracked output.

Browser component tests use Vitest Browser Mode with Playwright: installed Edge on Windows, bundled Chromium on Linux CI. Playwright end-to-end tests use matching Chromium against fresh Testcontainers PostgreSQL, committed migrations, a restricted runtime role, emitted API, and synthetic identity. Install missing Chromium with `pnpm --filter @orion/web exec playwright install chromium`; [setup](../../docs/setup.md#prepare-a-clean-checkout) covers system prerequisites.
