# Backend Execution and Generated Artifacts

[Documentation index](../README.md) · [Validation availability](../validation.md) · [Local setup](../setup.md)

This page owns API execution and generated-artifact storage conventions. The implemented pipeline follows [TypeScript/Node.js](../adr/0001-select-typescript-and-nodejs-as-primary-language-and-runtime.md), [pnpm](../adr/0002-select-pnpm-for-package-and-workspace-management.md), [API generation](../adr/0007-establish-api-contract-openapi-sdk-and-configuration-schema-strategy.md), [Prisma/PostgreSQL](../adr/0006-select-prisma-orm-for-database-access-and-migrations.md), and [validation](../adr/0003-establish-repository-validation-and-architecture-enforcement.md) decisions. [Setup](../setup.md#validate-regenerate-and-build) owns the regeneration sequence; [validation](../validation.md) lists current commands and prerequisites.

## API development and build

- Keep the API as an ESM TypeScript workspace application under `apps/api`. Use pnpm package scripts as the stable interface and native workspace filtering for orchestration; no dedicated monorepo task runner or backend bundler is needed initially.
- The `apps/api` scripts expose `dev` (Node's optional root `.env.local` loading and watch mode with pinned `tsx`), `typecheck` (`tsc --noEmit`), `build` (`tsc` emitting Node-compatible ESM JavaScript to an ignored `dist/` directory), and `start` (`node dist/main.js`). The [setup guide](../setup.md) owns local environment-file instructions. Source imports and compiler settings resolve in the emitted Node.js ESM output. `tsx` is an execution convenience, never a substitute for TypeScript checking or a production runtime dependency.
- Install dependencies from the shared frozen lockfile. Generate tool-managed Prisma client code before typecheck/build when required; keep its cache/output out of hand-edited source and commit history. Build and start must work without a development transpiler at runtime. The existing process and feature smokes exercise the emitted application.
- Root `pnpm validate` and CI include application typechecks, tests, builds, smokes, and generated-output freshness. Integrate new capabilities into that same gate. Keep validation non-mutating with respect to tracked source; generation is a separate explicit write command. Update [validation availability](../validation.md) when scripts change.

## Artifact ownership and storage

| Derived artifact | Canonical input | Output and handling |
| --- | --- | --- |
| OpenAPI 3.1 description | Executable TypeBox wire schemas and stable route `operationId` metadata owned by the API | Committed `docs/generated/api/openapi.json` is regenerated and checked; clients and documentation consume that file, with no independently authored copy. |
| TypeScript API client types | Committed generated OpenAPI | Committed `packages/sdk/src/generated/api-types.ts` comes from `openapi-typescript`; a thin `openapi-fetch` client lives outside the generated file. `pnpm --filter @orion/sdk generate` writes it and `references:check` verifies it without editing tracked files. The web app does not import API implementation types. |
| API configuration reference | API-owned TypeBox bootstrap configuration schema and metadata | Committed `docs/generated/configuration/api.md` is regenerated and checked from the API source. It contains safe types/defaults, never secrets or a real `.env`. |
| API error registry reference | API-owned registry and envelope schema | Committed `docs/generated/api/errors.md` is regenerated and checked from the API source. Feature errors join the same registry when their routes exist. |
| Database reference | Migrated PostgreSQL plus canonical schema-adjacent semantic metadata; Prisma schema and reviewed migrations are inputs | Committed `docs/generated/database/approval-requests.md` is generated and checked from a fresh Testcontainers PostgreSQL, including custom SQL constraints and indexes; it is not authored independently. |
| Portal catalog, pages, search, and component reference | Repository Markdown, current generated API/database/error references, and web-owned component source/examples/metadata | Committed `apps/web/src/generated/manifest.json`, page/search assets, and `docs/generated/components/web.md` are written/checked by `pnpm docs:references:write` / `pnpm docs:references:check`. [Living documentation](living-documentation.md) owns portal behavior and limitations. |
| Prisma Client and emitted JavaScript | Prisma schema and TypeScript source | Generate into ignored, tool-managed outputs for each build; do not commit platform/tool-generated client code or `dist/`. Reviewed SQL migrations are authored release history, not disposable generated output. |

Mark generated files clearly and never edit them to repair a source defect. A generation command may update tracked derived artifacts intentionally; a separate check must regenerate in a temporary location or compare deterministically without changing tracked files. The current gate fails on generated drift. Rebuildability does not waive public API or SDK compatibility responsibilities under [versioning](versioning-and-compatibility.md), nor the independent [migration-history rules](../database/migrations.md).

Do not create planned files or directories as placeholders. Each artifact belongs with its canonical source, generator, validation check, and actual consumer. The [Approval Request conventions](../domains/approval-request-implementation.md) describe the implemented feature data and contract metadata.
