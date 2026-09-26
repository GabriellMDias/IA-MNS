# Orion web reference workflow

[Phase 6 plan](../../docs/implementation-plan.md#phase-6) · [Approval Request specification](../../docs/domains/approval-request.md) · [Generated API contract](../../docs/generated/api/openapi.json)

This React 19/Vite 8 single-page application consumes the generated `@orion/sdk` client. TanStack Router owns request-detail paths and the list scope/cursor in the URL, TanStack Query owns API state, and React owns form and interaction state. The API remains authoritative for all ownership, review-capability, version, and state checks.

Use the canonical [development setup](../../docs/setup.md) for installation, local environment loading, and the full validation workflow.

## Living Documentation Portal

The public `/docs` route renders the current generated API contract, migrated database reference, and real exported components. It needs no bearer token or API process. Component-owned metadata lives beside [component source](src/components.tsx) in [components.docs.json](src/components.docs.json); [generated component Markdown](../../docs/generated/components/web.md) and browser data come from `pnpm docs:references:write`. See [portal setup](../../docs/setup.md#living-documentation-portal) and [living documentation ownership](../../docs/architecture/living-documentation.md).

Run `pnpm --filter @orion/web dev` after starting the API on `127.0.0.1:3000`. The default browser API path is `/api`; Vite forwards it to the local API and removes that prefix. `ORION_WEB_API_TARGET` changes only this development-server proxy target. `VITE_ORION_API_BASE_URL` is the only client-visible build setting and must be a same-origin path; it defaults to `/api`. A deployed static build needs a same-origin `/api` reverse proxy or an equivalent route. Neither variable contains a credential, issuer private key, or server-only URL.

The current provider-independent interface accepts an already-issued bearer access token, holds it only in React memory, and clears it on disconnect or refresh. It does not issue tokens or create a login/session/refresh flow. A real deployment must integrate a selected identity provider and its user-facing token acquisition under conditional [H-07](../../docs/human-actions.md#h-07); this phase does not select one. Browser tests use short-lived synthetic signed tokens from a local issuer. Never paste a production token into a test environment. The API verifies issuer, audience, signature, expiry, human principal, capability, and resource access on every business request.

From the repository root, run `pnpm --filter @orion/sdk generate` after an intentional OpenAPI change. `pnpm references:check` verifies generated SDK freshness without editing it. Run `pnpm --filter @orion/web typecheck`, `build`, `bundle:check`, `test:unit`, `test:browser`, and `test:e2e` individually or `pnpm validate` for the full gate. The browser component suite uses Vitest Browser Mode and the Playwright provider; on Windows it uses the installed Edge channel for a reliable local launch, while Linux CI uses bundled Chromium. The Playwright Test journey builds on a fresh Testcontainers PostgreSQL with committed migrations, separate runtime role, emitted API, and synthetic identity. Install its matching browser with `pnpm --filter @orion/web exec playwright install chromium` if it is absent.
