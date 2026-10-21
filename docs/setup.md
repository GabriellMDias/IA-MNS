# Development Setup

[Repository README](../README.md) · [Validation](validation.md) · [API runtime](../apps/api/README.md) · [Web workflow](../apps/web/README.md)

This is the canonical local setup and execution path. Tests use disposable PostgreSQL and synthetic identities; no production database, identity provider, telemetry vendor, or deployment account is needed. Commands address workspace packages by path (`pnpm -C apps/api …`), so they work unchanged whatever a project names its packages.

| Goal                                                                 | Prerequisites after installing pinned Node.js/pnpm                          | Start here                                                                                             |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Browse the documentation portal                                      | Frozen dependency install; no container, API, or test browser needed        | [Portal](#living-documentation-portal)                                                                 |
| Run the API and web application locally                              | Frozen dependency install, generated Prisma client, and local configuration | [Configuration](#load-local-configuration)                                                             |
| Use a local PostgreSQL or access-token issuer                        | A database or issuer you control for development                            | [Local database and authentication](#local-database-and-authentication)                                |
| Run the complete validation gate                                     | All clean-checkout prerequisites, including containers and test browsers    | [Prepare a clean checkout](#prepare-a-clean-checkout), then [validate](#validate-regenerate-and-build) |
| Start a new project from Orion or upgrade a project's Orion baseline | A fresh full clone and frozen dependency install                            | [Project derivation](project-derivation.md)                                                            |
| Develop the Sankhya Om add-on                                        | JDK 8, the Sankhya development Om (database and WildFly); no Node tooling   | [Sankhya add-on guide](../apps/sankhya-addon/README.md#development-environment)                        |

## Prepare a clean checkout

Use Node.js 24.13.0 and pnpm 11.25.0, as pinned by `.node-version` and `package.json`. For full validation, start Docker or another Testcontainers-compatible container runtime and verify that its daemon is reachable with `docker info`. From a fresh checkout, run:

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm -C apps/web exec playwright install chromium
```

On Linux, use `pnpm -C apps/web exec playwright install --with-deps chromium` if the browser's system libraries are absent. Windows browser component tests use the installed Edge channel; Playwright end-to-end tests use Chromium. Do not put credentials in tracked files.

## Load local configuration

For a new local configuration, copy the safe, schema-checked [example](../.env.example) into an ignored root `.env.local` file; preserve an existing file's settings. The example activates only `ORION_ENV=development`; uncomment and fill an optional setting only when needed. The API `dev` script uses a [local launcher](../apps/api/scripts/local-runner.ts) to read this file, exclude ERP administrative keys and start a fresh process before `src/main.ts` parses and validates configuration. It never reads `.env.discovery.local`. Existing shell environment variables take precedence over file values. The following works in PowerShell and POSIX shells:

```sh
cp .env.example .env.local
pnpm -C apps/api dev
```

PowerShell also accepts `Copy-Item .env.example .env.local`. The default listener is `127.0.0.1:3000`; `GET http://127.0.0.1:3000/health/ready` returns `{"status":"ok"}`. Without database or token settings, the API serves its health routes; [modules](../apps/api/README.md#modules) that require the database or bearer authentication stay unmounted until those settings are configured. `.env.local` and other real environment files are ignored by Git; do not place secrets in `.env.example`.

When `.env.local` changes, stop and restart the complete API development command. Source hot reload can inherit the watcher's already loaded environment; it is not a configuration refresh. Existing shell settings still override the file, including the Oracle Client directory. Oracle mode is process-wide and requires a fresh process when changed.

Start the web development server in another terminal:

```sh
pnpm -C apps/web dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173`. Vite forwards `/api` to the local API by default and loads its own `apps/web/.env.local` if web-specific `VITE_` values are needed. Do not copy the root API `.env.local` into the web app: server-only values must not enter a browser build. The home page lists the workflows that [web modules](../apps/web/README.md#modules) compose.

## Sales chat

The [sales domain guide](domains/sales-chat.md) owns scope, matching, measures, security, context, and limits. After frozen installation and Prisma generation, copy `.env.example` to root `.env.local` only if that ignored file does not already exist. Keep server settings out of `apps/web/.env.local`.

For private local development, add these values in root `.env.local`. Replace placeholders yourself; never send credentials through chat or commit them:

```dotenv
ORION_ENV=development
IA_MNS_LOCAL_ACCESS=true
OPENAI_API_KEY=<dedicated-project-key>
OPENAI_MODEL=gpt-6.1-sol
SANKHYA_DB_USER=IA_MNS_RO
SANKHYA_DB_PASSWORD=<password>
SANKHYA_DB_CONNECT_STRING=<host>:1521/<service-name>
```

Reuse the owner-authorized key already configured locally; credential ownership/provisioning evidence is tracked in [PH-07](project/human-actions.md#ph-07); Oracle account/grant/schema resolution and live reconciliation are [PH-08](project/human-actions.md#ph-08). The DB user requires CREATE SESSION and only SELECT on the reference tables. node-oracledb 7 Thin mode supports Oracle 12.1; do not install client libraries unless an actual network/authentication feature requires Thick mode. In that case set `SANKHYA_ORACLE_CLIENT_LIB_DIR` to an installed compatible Oracle Client directory with the same architecture as Node. Oracle 12.1 can use Client 19 or 21; check the [compatibility matrix](https://node-oracledb.readthedocs.io/en/stable/user_guide/installation.html) before selecting another version. Do not point it at the database server installation by assumption. The local 2026-10-01 audit used Client 19.32 because the legacy password verifier was unavailable in Thin mode and the previously installed Client 11.2 was unsupported by the driver.

The current account uses a legacy password verifier and requires Thick mode even though the database is Oracle 12.1. Keep `SANKHYA_ORACLE_CLIENT_LIB_DIR` set to the absolute compatible Client 19.32 directory. Removing it selects Thin and can produce NJS-116; DPI-1047 indicates that the selected native client could not be loaded. No automatic mode fallback, password reset, or DBA change is performed. [Live verification](project/live-sales-verification.md) records the diagnosis.

The Pilar da Terra (VRMaster) source is optional. To enable it, add the dedicated read-only account of [PH-19](project/human-actions.md#ph-19) to the same root `.env.local`; never reuse the PDT Connect account, and type the password yourself:

```dotenv
VRMASTER_DB_HOST=<vrmaster-host>
VRMASTER_DB_PORT=<vrmaster-port>
VRMASTER_DB_NAME=<vrmaster-database>
VRMASTER_DB_USER=ia_mns
VRMASTER_DB_PASSWORD=<password>
VRMASTER_DB_SSL_MODE=disable
```

Host, user, password and database are configured together; the port defaults to 5432. `VRMASTER_DB_SSL_MODE` defaults to `verify-full`, which requires TLS with a verifiable certificate. The current VRMaster server offers no TLS, so it needs `disable`, which sends the credentials and sales data unencrypted on that network; return to `verify-full` once the server offers TLS. Without these settings the selector's VRMaster option answers that the source is not configured. Reconcile the source with [PH-20](project/human-actions.md#ph-20) before relying on its figures.

The same settings, with `OPENAI_API_KEY`, enable [VR Master product lookup](domains/product-lookup.md): choose `Pilar da Terra (VR Master)` and ask “Quais produtos são banana fruta?”. People need the VRM-PRD-01 permission (`products_vrmaster:read`), which owners have and grant in **Administração**; local access includes it. `products:catalog` compares its catalog with live metadata/grants, and `products:regression` replays the ignored local dataset ([maintenance](architecture/semantic-product-resolution.md#maintaining-the-catalog)). The existing `SANKHYA_DB_*` settings enable the [Sankhya adapter](domains/sankhya-product-lookup.md), which additionally enforces a non-owner CREATE SESSION / SELECT-only runtime account. The existing administrator is used only by explicit Discovery tools; use the now-verified `IA_MNS_RO` for runtime; PH-08 retains business confirmations. Runtime product lookup refuses privileged accounts. `products:sankhya:sync` and `products:sankhya:regression [--model]` perform authorized local read-only discovery/validation without changing ERP state. With both catalogs configured, `Tudo` asks for one product source; selections remain independent.

After pulling a new IA-MNS migration (for example `202610080001_operational_parameters`), rerun `pnpm db:local`: it applies committed migrations and keeps existing data. The API refuses to become ready against an older schema.

Start `pnpm -C apps/api dev` and, in another terminal, `pnpm -C apps/web dev`. Open `http://127.0.0.1:5173/`, choose the source in the `Fonte` selector above the message box, ask “Quanto vendi de maçã por mês nos últimos 3 meses?”, then try the offered year comparison. Missing configuration disables the composer and displays an explicit message; no demo sales are substituted. The public `/sales/status` reports configuration presence, not live connectivity. Provider/network/schema failures appear on the attempted question with a safe request reference.

Local access is forbidden in production and on public listeners; do not expose or tunnel the credential-free development proxy. For explicit owner-controlled phone testing, use the separate [temporary bearer procedure](#phone-testing-on-the-local-network). For authenticated shared access, leave `IA_MNS_LOCAL_ACCESS=false`, configure Orion's issuer/audience/JWKS settings, and obtain a trusted access token carrying `sales:read`. The UI keeps an entered token only in memory. An issuer/login and deployment are not supplied by this MVP. Production additionally refuses startup without providers and verifier. PostgreSQL persists the corporate agent conversations; provision it through [the local Docker setup](#corporate-agent-and-local-postgresql). Sankhya remains an external read-only source.

Run `pnpm validate` for synthetic provider, HTTP, calculation, browser, build, generated-reference, and foundation checks. These checks need no OpenAI or ERP credentials. They do not certify actual Oracle 12.1 compatibility, reference reconciliation, grants, model availability, or interpretation accuracy; complete PH-07/PH-08 before claiming real-data acceptance.

## Local database and authentication

For the first real product tests, follow [UI acceptance](domains/product-lookup.md#ui-acceptance): existing authenticated user, owner-controlled VRM-PRD-01, explicit VR Master source, and a process without privileged Sankhya credentials until its dedicated reader exists.

[API configuration](generated/configuration/api.md) names the runtime settings. `ORION_DATABASE_URL` enables PostgreSQL for modules that require it and adds the database to readiness. The three token settings enable bearer authentication together; a trusted issuer must provide the claims described by the [authentication policy](security/authentication.md).

For a separate **local** PostgreSQL, create distinct migration and restricted runtime credentials. Supply `ORION_MIGRATION_DATABASE_URL` in the shell only for `pnpm -C apps/api db:migrate:deploy`; the Prisma CLI reads it from that process. Keep `ORION_DATABASE_URL` in the root ignored `.env.local` for the API runtime, alongside any trusted token issuer, audience, and JWKS URL. The repository does not select or provision an issuer. Do not copy Testcontainers' synthetic credentials into a persistent environment, and clear the migration credential from the shell after deployment.

## ERP Discovery

Follow [ERP database access](security/erp-database-access.md) and [PH-29](project/human-actions.md#ph-29). Copy [`.env.discovery.example`](../.env.discovery.example) to ignored root `.env.discovery.local` (or the owner-selected `.env.discovery`) and privately supply the existing administrative accounts. Preserve the exact VRMaster `FULLACESS` names and supply the new Sankhya pair. Move any administrative entries out of `.env.local`; preserve their values and the existing accounts. Do not put administrative credentials into runtime-named keys or load the Discovery file with environment flags. Endpoint/TLS/Oracle Client settings remain in the normal local configuration.

Run explicit development inspections from the API directory:

```sh
pnpm -C apps/api erp:discovery vrmaster --schema public --table produto
pnpm -C apps/api erp:discovery vrmaster --schema public --table produto \
  --columns id,descricaocompleta --limit 20
pnpm -C apps/api erp:discovery sankhya --schema ERP_OWNER --table TGFPRO
pnpm -C apps/api products:sankhya:sync
pnpm -C apps/api products:sankhya:regression
```

Replace `ERP_OWNER` with the actual schema privately. Without `--columns`, `erp:discovery` reads metadata/relationships only; explicit minimal-column samples are bounded to 100 rows and kept with metadata in ignored `apps/api/evals/.local/discovery`, never console/model context. Review views/functions for side effects before sampling. The tool supplies fixed inspection queries only. Administrative credentials are read explicitly from one Discovery file (`.env.discovery.local` first, otherwise `.env.discovery`), without merging or runtime fallback; production application configuration is refused. All sessions use read-only transactions and rollback. No account, grant or database modification is performed. Read-only transactions are additional protection, not sufficient containment of an administrator.

Runtime checks do not load administrative credentials:

```sh
pnpm -C apps/api products:catalog
pnpm -C apps/api products:regression
pnpm -C apps/api products:sankhya:sync --runtime-check
pnpm -C apps/api products:sankhya:regression --runtime
```

The optional existing `--model` regression mode retains its reviewed minimized product interpretation boundary; never transmit confidential Discovery exports, credentials or unnecessary personal data to models. ERP writes and privilege changes require explicit owner authorization. This architecture task authorizes none; the reader access is now [verified](project/runtime-access-verification.md), while PH-08 retains business-unit confirmations.

### Owner-authorized Runtime access provisioning

`pnpm -C apps/api erp:runtime:access` reads the current metadata and reports missing changes without applying them. After explicit owner authorization, `pnpm -C apps/api erp:runtime:access --apply` executes the reviewed [Oracle](../apps/api/scripts/erp-access/sankhya-runtime.sql) and [PostgreSQL](../apps/api/scripts/erp-access/vrmaster-runtime.sql) templates. It targets existing `IA_MNS_RO` / `ia_mns` accounts, checks Oracle schema/synonym/view conflicts, and never changes passwords or PUBLIC. `erp:runtime:audit` inspects actual ACLs; `erp:runtime:verify` exercises bounded sales and directory reads without AI calls or record output. The current authorization and verification are recorded in [PJ-41](project/implementation-plan.md#current-work); a CLI flag itself is not mutation authority.

## Identity

After `pnpm db:local`, run `pnpm identity:local`. It adds `IA_MNS_PUBLIC_ORIGIN=http://127.0.0.1:5173` and freshly generated local signing and encryption keys to the ignored root `.env.local` when they are absent, without displaying them. Restart the API, then run `pnpm identity:bootstrap` and open the printed single-use URL (valid for 30 minutes) to create the principal administrator and enroll the required authenticator app. Open the web application at the same origin as `IA_MNS_PUBLIC_ORIGIN`, because refresh and provisioning cookies are checked against it.

PDT Connect sign-in needs the `PDT_IDENTITY_*` settings of a PDT homologation installation with this IA-MNS client registered. Embedded testing needs `PDT_EMBED_ORIGIN` or `SANKHYA_EMBED_ORIGIN` in the root ignored `.env.local`; `pnpm -C apps/web dev` automatically reuses each origin for its own embedded surface. Shell values take precedence. `ORION_WEB_EMBED_ANCESTORS` remains an explicit space-separated override for both embedded surfaces; setting it to an empty string disables framing. Restart the web server after changing these settings. For a local PDT Connect, `pnpm pdt:local --pdt-env <PDT root .env>` generates the IA-MNS client secret, adds the IA-MNS PDT settings to `.env.local` and registers the client in the PDT `.env` with only the secret's SHA-256; a PDT administrator then sets the `IA_MNS_*` parameters it prints. A local PDT API pointed at a shared ERP database runs startup DDL there and schedules its enabled jobs, so run it on a database copy without schedules and with `PDTCONNECT_BOOTSTRAP=false`. Sankhya sign-in needs the Om add-on ([`apps/sankhya-addon`](../apps/sankhya-addon/README.md)) and its public keys; for the Sankhya development Om, `pnpm sankhya:local` generates a development key outside the repository and configures both sides ([local journey](../apps/sankhya-addon/README.md#local-journey)). Production refuses Sankhya sign-in until `SANKHYA_SESSION_TRUST=approved` ([PH-11](project/human-actions.md#ph-11)). Owner association of real Sankhya users needs `SANKHYA_IDENTITY_ISSUER`, the Sankhya connection and `SANKHYA_DIRECTORY_VIEW`, the read-only user view requested in [PH-08](project/human-actions.md#ph-08); it is independent of Sankhya sign-in. There is no public account creation: people using PDT Connect or Sankhya get their profile at first access, and owners invite everyone else from `/admin`. Never point local development at production PDT or Om instances for experiments. The [identity domain](domains/identity.md) describes flows, the host bridge protocol and deployment headers. Explicit `IA_MNS_LOCAL_ACCESS` remains available only without identity sign-in; use synthetic data in tests.

## WhatsApp simulator

The [WhatsApp channel](domains/whatsapp-channel.md) runs locally without Meta or a real number. With identity and the local database configured:

1. `pnpm whatsapp:local setup` adds synthetic `WHATSAPP_*` values and `IA_MNS_WHATSAPP_CHANNEL=enabled` to the ignored `.env.local` (never overwriting existing values, never printing secrets); restart the API.
2. `pnpm whatsapp:local graph` runs a loopback Graph API on port 9311 that prints the replies IA-MNS would send.
3. As owner, link a number to a Person in **Administração → Pessoas → WhatsApp**.
4. `pnpm whatsapp:local send --from +5511987654321 "Quanto vendemos ontem?"` signs a webhook like Meta and posts it to `http://127.0.0.1:3000` (`--api` changes it; `--user-id` simulates a sender who hides the number). Unlinked numbers are ignored silently, as in production.

The conversation appears in that Person's web history. Meta's own test number (app dashboard) needs a public HTTPS webhook and real app credentials; never point the simulator or a development API at the production number. Activation with the definitive number follows the [runbook](runbooks/whatsapp-channel.md).

## Living Documentation Portal

The portal needs no API, database, identity provider, or `.env.local`. After the clean-checkout install above, run `pnpm -C apps/web dev` and open `http://127.0.0.1:5173/docs` (or the Vite-printed port plus `/docs`). Use its section navigation and breadcrumbs for API operations, tables, component examples, architecture, guides, policies, and ADRs. Repository documentation opens locally with headings and search, rather than requiring GitHub. Relevant sections also expose AI-readable OpenAPI, database, error, and component references.

To try an API route, also run the API as described above, open an API operation, enter declared inputs and a token when the operation requires one, then select **Send request**. Writes require explicit acknowledgement. Tokens and responses remain in memory; no request executes automatically. Cancellation/timeouts do not prove a write was undone. Without the API, reading remains available and request failures are shown safely.

After editing repository Markdown or reference sources, run `pnpm docs:references:write` and `pnpm docs:references:check`. Build with `pnpm -C apps/web build`; preview with `pnpm -C apps/web exec vite preview --host 127.0.0.1`, then open `/docs` on the printed port. Production/static serving must support the existing SPA fallback for nested routes; no deployment provider is selected here.

## Exercise automated workflows

Automated workflows use disposable databases and synthetic identities. No seed data or external account is needed:

```sh
pnpm build
pnpm smoke
pnpm test:e2e
```

`pnpm smoke` exercises the emitted API process, then any module process smokes. `pnpm test:e2e` runs the emitted API and the Vite web app for the shared documentation and shell journeys; module journeys start their own migrated PostgreSQL and synthetic issuer through the shared [end-to-end stack helpers](../apps/web/test/e2e/stack.ts). These fixtures are disposable and are not release or production data.

## Validate, regenerate, and build

Run the full, non-mutating tracked-source gate after changes:

```sh
pnpm validate
```

It checks format, lint, types, dependency boundaries, documentation, `.env.example` against API configuration metadata, migration release history, project provenance, current generated references, real PostgreSQL and browser tests, builds, and process smokes. `pnpm references:check` diagnoses generated API/database/SDK drift independently; it migrates a fresh PostgreSQL for the physical database reference and does not repair tracked files. To intentionally change those references, edit their canonical TypeBox/schema/metadata sources and run `pnpm -C apps/api references:write`, then `pnpm -C packages/sdk generate` after an OpenAPI change. Review the generated diff and rerun `pnpm references:check`.

After intentional repository Markdown, API, database, or component-metadata changes, run `pnpm docs:references:write` and review the generated component Markdown, catalog, detail pages, and search shards. Vite serves/emits the existing API, database, error, and component artifacts without committing duplicate copies. `pnpm docs:references:check` is non-mutating and fails on drift, missing component metadata, or known secret patterns; it runs within `pnpm validate` and CI. Do not edit either generated layer directly.

`pnpm build` emits the API ESM and web static assets into ignored `dist/` directories and checks the browser bundle for known server-only markers. The [release evolution workflow](database/release-evolution.md) governs migrations; no durable release is recorded merely by running these commands.

Production installation and operation are not local setup: follow the [production runbooks](runbooks/README.md). To run the production shape locally after `pnpm build`, start the emitted API with `ORION_WEB_ROOT` naming `apps/web/dist` (absolute, or relative to the working directory, such as `../web/dist` for `pnpm -C apps/api start`) and open the API's own address instead of the Vite server: the API serves the web build and answers under `/api`, as [ADR-0029](adr/0029-serve-the-web-and-api-from-one-origin-behind-restricted-trusted-proxies.md) describes. Set `IA_MNS_PUBLIC_ORIGIN` to that address when identity is configured. `pnpm -C apps/api config:check` validates a configuration without listening, and `VITE_ORION_DOCS=disabled pnpm -C apps/web build` produces a build without the `/docs` portal, which a production configuration requires unless `ORION_WEB_DOCS=enabled`.

## Corporate agent and local PostgreSQL

With Docker Desktop/the Docker engine running, Node.js 24.13.0, and dependencies installed, run from the repository root:

```powershell
pnpm db:local
pnpm -C apps/api dev
# In a second terminal:
pnpm -C apps/web dev
```

`pnpm db:local` provisions the [Compose service](../infra/local/compose.yaml), waits for PostgreSQL 16, applies committed migrations and module grants, and checks the restricted runtime role. It binds only `127.0.0.1:55432` and retains the `ia-mns_postgres_data` named volume. Generated random local credentials live in ignored `infra/local/.env`; runtime/migration URLs are written to ignored root `.env.local` without displaying them or modifying existing OpenAI/Oracle secrets. Repeating the command reuses credentials and data; it never deletes a volume or resets a database. An existing incompatible service/volume/port fails explicitly.

Stop/restart the database without deleting history:

```powershell
docker compose --env-file infra/local/.env -f infra/local/compose.yaml stop
docker compose --env-file infra/local/.env -f infra/local/compose.yaml start
```

Do not use `down -v` for normal startup/restart: it deletes the history volume. The runtime credential has only USAGE and SELECT/INSERT/UPDATE/DELETE on the agent's tables; migration credentials belong only to the CLI. The development entry point removes ORION_MIGRATION_DATABASE_URL from its environment before loading the runtime. No migration is applied automatically by the API. The required schema is checked before startup, and PostgreSQL participates in readiness.

The existing OPENAI_API_KEY and Sankhya configuration activate sales; [sales setup](#sales-chat) still owns Oracle requirements. Restart the complete API development command after changing `.env.local`, because watch reload alone does not refresh inherited environment. Open `http://127.0.0.1:5173`. New conversation keeps previous history; choose a conversation to continue it, or explicitly delete it. Only the display theme uses browser storage. [Agent design](domains/corporate-agent.md) records context, progress, recovery and lifecycle limits.

## AI evaluation and tracing

Replay the curated AI evaluation cases deterministically (also part of `pnpm test`):

```sh
pnpm eval run
```

With `OPENAI_API_KEY` in the ignored root `.env.local`, evaluate the live router and interpreter, then compare runs:

```sh
pnpm eval run --subject model
pnpm eval compare <base-report.json> <head-report.json>
```

Live runs send only synthetic dataset text, consume provider quota and write reports to the ignored `apps/api/evals/.local/`. `IA_MNS_AI_TRACE` defaults to `metadata` (one content-free log event per turn). To store confidential interpretation traces with each local turn, select **Metadados e conteúdo** in **Administração → Parâmetros** (it applies to the next turn), or set the installation default `IA_MNS_AI_TRACE=content` in `.env.local` and restart the API when no owner value is saved; then `pnpm eval capture --turn <turn-id>` writes a candidate case to the same ignored folder. Captured candidates contain real conversation text: rewrite them synthetically before promotion. [AI evaluation](architecture/ai-evaluation.md) documents every command and the review workflow.

## Phone testing on the local network

Normal web/API listeners are loopback-only, so a phone cannot use the computer IP with port 5173. The owner-controlled temporary alternative follows [ADR-0020](adr/0020-bound-temporary-device-testing-to-an-authenticated-development-proxy.md). With the existing database/providers running/configured, choose the computer's assigned private IPv4 address on the phone's network and run from the repository root:

```powershell
pnpm dev:lan 192.168.1.12
```

The address is an example; use the current computer Wi-Fi/Ethernet address, not a Docker/WSL adapter. The launcher binds only that interface at port 5174, starts a separate loopback API at 3002, and preserves the usual desktop services and root .env.local. It reuses configured providers and PostgreSQL. It never opens database ports or starts a public tunnel.

Open `http://192.168.1.12:5174` on the phone. Read only the `IA_MNS_DEV_ACCESS_TOKEN` value from ignored `infra/local/.env.lan` on the computer, enter it in the application's access field and select **Usar token**. This is a generated temporary development bearer, not the OpenAI key. Transfer it only to your own trusted device; never paste credentials in chat, URLs or tracked files. The UI stores it only in memory; reload requires entering it again. History belongs to the same local developer, so prior conversations are available after access.

All protected requests require the token, even calls from the computer. Its absolute lifetime is at most two hours. The launcher stops both temporary services on expiry or Ctrl+C and removes the credential file. Normal desktop/API/ERP credentials remain unchanged. If the launcher was forcibly killed and left a stale `.env.lan`, stop its temporary services before removing that exact ignored file and starting a new test. Do not expose the original credential-free proxy with `--host 0.0.0.0`.

API logs for this test are in ignored `test-results/network-test-api.log`; safe correlation/diagnostics remain enabled. HTTP device testing uses a secure Web Crypto UUID fallback when randomUUID is unavailable ([browser constraint](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID), [random bytes](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)). No Math.random-based acceptance IDs are used.

Use only a trusted owner-controlled LAN: this temporary HTTP test does not encrypt transport or provide employee authentication. Production/shared deployment remains outside scope. If the page does not open, check that the phone is on the same subnet, Wi-Fi guest/client isolation is disabled for this test network, and Windows permits inbound TCP 5174 for Node on that interface. Never disable the firewall. An administrator can add a narrowly scoped rule if none exists, substituting the correct IP/interface:

```powershell
New-NetFirewallRule -Name "IA-MNS-Phone-Test" `
  -DisplayName "IA-MNS phone test" -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort 5174 -LocalAddress 192.168.1.12 `
  -RemoteAddress LocalSubnet -InterfaceAlias "Wi-Fi" -Profile Any
# Remove the rule after the test if you added it:
Remove-NetFirewallRule -Name "IA-MNS-Phone-Test"
```

The launcher does not change network profiles, firewall rules or router settings. Test reachability from the actual phone; a successful request from the computer to its own LAN IP does not prove peer routing/firewall behavior.
