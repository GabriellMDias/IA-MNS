# Living Documentation

[Documentation index](../README.md) · [Implementation plan](../implementation-plan.md#phase-11) · [Contributing](../contributing.md)

Orion's foundation includes a navigable human interface for the current API, database/data dictionary, and frontend components. The interface presents derived facts; it does not replace the canonical schemas, metadata, source, ADRs, or machine-readable generated artifacts. This responsibility is part of the foundation, not a deployment-specific extra.

## Sources and representations

| Subject | Canonical source | Existing or required derived representation |
| --- | --- | --- |
| API operations, requests, responses, and expected errors | Executable TypeBox wire contracts, route metadata, and the API error registry | Committed [OpenAPI 3.1](../generated/api/openapi.json) and [error reference](../generated/api/errors.md); the portal renders operations, fields, authentication, statuses, and registered errors. The SDK remains a separate generated consumer. |
| Database structure and data dictionary | Migrated PostgreSQL, reviewed SQL migrations, and [schema-adjacent semantic metadata](../../apps/api/prisma/schema-metadata.json) | Committed [physical and semantic reference](../generated/database/approval-requests.md); the portal renders tables, columns, constraints, ownership, classification, null semantics, and lifecycle where recorded. Never infer missing meaning from names. |
| Frontend components | Actual [web component source](../../apps/web/src/components.tsx) and [component-owned examples/metadata](../../apps/web/src/components.docs.json) | Generated [AI-readable component reference](../generated/components/web.md) and portal examples render only exported components that exist, with API, states, accessibility behavior, and usage constraints. |
| Configuration | API TypeBox schema and [reference metadata](../../apps/api/src/config.ts) | [Generated safe configuration reference](../generated/configuration/api.md) and the mechanically checked [local example](../../.env.example); never publish secret values. |

Authored documentation owns intent, invariants, operational procedures, and rationale that cannot be reliably generated. Derived structural facts have one source and may be rendered in several forms. The portal should link back to canonical sources and relevant policy instead of maintaining independent narrative copies. ADRs retain decision history; the portal shows current behavior.

## Portal requirements and boundary

The portal is the public `/docs` route in the existing React/Vite web application. This keeps live examples with the component owner and requires no new application boundary, framework, or ADR. It is discoverable from the repository README and documentation index, navigates API, data dictionary, and components, and links the underlying AI-readable artifacts and canonical policy. Human pages remain usable without reading raw JSON or source files. Generated output is deterministic, safe to publish from tracked repository data, and freshness-checked by `pnpm validate`/CI. A clean checkout can regenerate or check it through documented commands. Broken local documentation links and undocumented application-owned schema objects fail validation.

Do not copy real environment values, production data, tokens, or unrestricted examples into generated pages. Preserve the API's server/client configuration boundary and database classification. A portal renderer may transform the existing artifacts, but it must not become the source for API, database, or component semantics. Choose and justify any new portal or component-documentation dependency during Phase 11 against existing ADRs and the [ADR policy](../adr/authoring.md); this document does not select a framework.

## Change workflow

1. Change the owning source and its meaningful tests. Add component examples/metadata beside the owning component when needed.
2. Regenerate derived files through their owners. Review the diff for loss of meaning, sensitive content, and unexpected changes.
3. Run `pnpm docs:references:write` after changes to API/database references or component metadata. It generates the browser dataset and component Markdown; Vite serves the existing AI-readable files directly in development and emits them as build assets. `pnpm docs:references:check` compares generated outputs without editing tracked files. Run the full [validation gate](../validation.md) for links, metadata, browser navigation, and live examples.

The committed files under `docs/generated/` remain authoritative; the browser downloads those same files as Vite assets, with no second tracked copy. Repository-relative links inside downloaded Markdown are intended for repository readers; the portal provides direct links to the canonical source and policy. The generator fails when an exported web component lacks metadata, when required component fields are missing, or when known secret patterns appear in output or referenced artifacts. Existing database generation checks ensure every migrated application-owned table, column, and physical object has required semantic metadata. No real identity provider or deployed environment is needed to browse the portal.
