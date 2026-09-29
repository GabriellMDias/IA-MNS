# Web Application Instructions

Use [the web guide](README.md) for source locations, startup, and browser checks. Global repository instructions still apply.

- Product workflows use the generated `@orion/sdk` as the API boundary. The generic documentation explorer follows its [bounded OpenAPI execution contract](../../docs/architecture/living-documentation.md#safe-local-reading-and-api-exploration). Change API TypeBox contracts and regenerate OpenAPI/SDK through the [artifact workflow](../../docs/architecture/backend-execution-and-generated-artifacts.md); never import API implementation or hand-edit generated types.
- Keep URL-owned list scope/cursor and detail IDs in TanStack Router, API-owned state in TanStack Query, and temporary form state in React. Clear cached query data when the in-memory bearer token changes.
- Browser input and UI visibility do not grant permission. Preserve visible authorization denials, stale-version conflicts, idempotency, and unknown-outcome recovery under [feature conventions](../../docs/domains/approval-request-implementation.md), without reimplementing business rules in React.
- `VITE_ORION_API_BASE_URL` is the only public API setting and must be a same-origin path. Keep credentials in memory, never URLs, storage, logs, or generated artifacts; server/development proxy targets remain outside browser configuration.
- Maintain exported component examples/metadata beside source under [living documentation ownership](../../docs/architecture/living-documentation.md); regenerate portal data and component Markdown rather than editing generated files.
- Run focused `typecheck`, `build`, `bundle:check`, unit/browser/end-to-end checks as applicable, then root `pnpm validate` before substantial-work handoff. See [validation](../../docs/validation.md) for prerequisites and limits.
