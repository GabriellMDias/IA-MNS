# Development Setup

[Repository README](../README.md) · [Validation](validation.md) · [API runtime](../apps/api/README.md) · [Web workflow](../apps/web/README.md)

This is the canonical local setup and execution path. Tests use disposable PostgreSQL and synthetic identities; no production database, identity provider, telemetry vendor, or deployment account is needed.

## Prepare a clean checkout

Use Node.js 24.13.0 and pnpm 11.25.0, as pinned by `.node-version` and `package.json`. Start Docker or another Testcontainers-compatible container runtime and verify that its daemon is reachable with `docker info`. From a fresh checkout, run:

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @orion/web exec playwright install chromium
```

On Linux, use `pnpm --filter @orion/web exec playwright install --with-deps chromium` if the browser's system libraries are absent. Windows browser component tests use the installed Edge channel; Playwright end-to-end tests use Chromium. Do not put credentials in tracked files.

## Load local configuration

Copy the safe, schema-checked [example](../.env.example) into an ignored root `.env.local` file. The example activates only `ORION_ENV=development`; uncomment and fill an optional setting only when needed. The API `dev` script uses Node's `--env-file-if-exists` to load this file before `src/main.ts` parses and validates configuration. Existing shell environment variables take precedence over file values. The same command works in PowerShell and POSIX shells:

```sh
cp .env.example .env.local
pnpm --filter @orion/api dev
```

In PowerShell, replace `cp` with `Copy-Item .env.example .env.local`. The default listener is `127.0.0.1:3000`; `GET http://127.0.0.1:3000/health/ready` returns `{"status":"ok"}`. This minimal mode exposes health routes but does not enable Approval Request routes. `.env.local` and other real environment files are ignored by Git; do not place secrets in `.env.example`.

Start the web development server in another terminal:

```sh
pnpm --filter @orion/web dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173`. Vite forwards `/api` to the local API by default and loads its own `apps/web/.env.local` if web-specific `VITE_` values are needed. Do not copy the root API `.env.local` into the web app: server-only values must not enter a browser build. This health-only mode leaves the reference UI disconnected. [API configuration](generated/configuration/api.md) names the four settings required together for the feature.

## Living Documentation Portal

The portal needs no API, database, identity provider, or `.env.local`. After the clean-checkout install above, run `pnpm --filter @orion/web dev` and open `http://127.0.0.1:5173/docs` (or the Vite-printed port plus `/docs`). Use its navigation for the current API contract, migrated data dictionary, and live examples of actual web components. The route is public even when the Approval Request workflow has no token. Links in each section expose the AI-readable OpenAPI, database, error, and component references and canonical source/policy.

To verify the deployable static build, run `pnpm --filter @orion/web build`, then `pnpm --filter @orion/web exec vite preview --host 127.0.0.1` and open the printed URL plus `/docs`. For the complete authenticated workflow, use the separate `pnpm dev:approval` command below.

## Manually exercise Approval Requests

With Docker running, use the one-command local workflow from the repository root:

```sh
pnpm dev:approval
```

It generates the Prisma client, builds the API, starts a disposable PostgreSQL container, applies the committed migrations with a migration credential, grants a separate restricted runtime role, and starts the real API and Vite server on available loopback ports. It generates an ephemeral signing key and serves its public JWKS on loopback. The API verifies signed bearer tokens, ownership, and review capability exactly as in the automated browser journey; authentication is never bypassed. This command supplies its own temporary feature configuration and does not read the root `.env.local`. No external identity provider, permanent database, or seed data is needed.

Open the printed web URL and choose **Use local owner**. Create a draft, edit it, and submit it; trying **Approve** with this owner identity should be denied. Choose **Disconnect**, then **Use local reviewer**. Under **For review**, open the submitted request and approve or reject it. The reviewer cannot decide their own requests, and the owner can inspect the terminal result after reconnecting. Reloading the page clears the in-memory token; use the appropriate local button again.

The local buttons appear only when the development server is paired with this synthetic issuer. They fetch a signed token through a same-origin, no-store development route and hand it directly to the existing in-memory credential state. Tokens are never written to files, URLs, browser storage, or terminal output; the real API still verifies every business request. The tokens expire after one hour. Restart the command for fresh identities and an empty database. Press Ctrl+C to stop the servers and database. If either service exits unexpectedly, the runner reports a bounded, redacted diagnostic and stops the remaining services and container. The `.env.local` file remains a safe development default for the separate health-only command above. A real provider and user-facing token acquisition remain conditional under [H-07](human-actions.md#h-07).

## Initialize and exercise feature data

The automated feature workflows use the same disposable database and synthetic identity boundaries. No seed data or external account is needed:

```sh
pnpm build
pnpm --filter @orion/api feature:smoke
pnpm test:e2e
```

The feature smoke exercises the emitted API and a create/submit/review flow, including process interruption. The browser test builds and runs the API and web app against its own migrated PostgreSQL and verifies the owner/reviewer journey. These fixtures are disposable and are not release or production data.

If using a separate **local** PostgreSQL for manual development, create distinct migration and restricted runtime credentials before enabling the feature. Supply `ORION_MIGRATION_DATABASE_URL` in the shell only for `pnpm --filter @orion/api db:migrate:deploy`; the Prisma CLI reads it from that process. Keep `ORION_DATABASE_URL` in the root ignored `.env.local` for the API runtime, alongside the trusted token issuer, audience, and JWKS URL described in the [API runtime guide](../apps/api/README.md). The repository does not select or provision that issuer. Do not copy Testcontainers' synthetic credentials into a persistent environment, and clear the migration credential from the shell after deployment.

## Validate, regenerate, and build

Run the full, non-mutating tracked-source gate after changes:

```sh
pnpm validate
```

It checks format, lint, types, dependency boundaries, documentation, `.env.example` against API configuration metadata, migration release history, current generated references, real PostgreSQL and browser tests, builds, and process smokes. `pnpm references:check` diagnoses generated API/database/SDK drift independently; it migrates a fresh PostgreSQL for the physical database reference and does not repair tracked files. To intentionally change those references, edit their canonical TypeBox/schema/metadata sources and run `pnpm --filter @orion/api references:write`, then `pnpm --filter @orion/sdk generate` after an OpenAPI change. Review the generated diff and rerun `pnpm references:check`.

After intentional API, database, or component-metadata changes, run `pnpm docs:references:write` and review the generated component Markdown and browser dataset. Vite serves/emits the existing API, database, error, and component artifacts without committing duplicate copies. `pnpm docs:references:check` is non-mutating and fails on drift, missing component metadata, or known secret patterns; it runs within `pnpm validate` and CI. Do not edit either generated layer directly.

`pnpm build` emits the API ESM and web static assets into ignored `dist/` directories and checks the browser bundle for known server-only markers. The [release evolution workflow](database/release-evolution.md) governs migrations; no durable release is recorded merely by running these commands.
