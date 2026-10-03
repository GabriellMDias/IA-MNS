# Web Component Reference

<!-- Generated from apps/web/src/components.docs.json and its feature metadata; verified against component sources. Do not edit. -->

[Living documentation](../../architecture/living-documentation.md) · [Component source](../../../apps/web/src/components.tsx)

## ErrorNotice

Displays a public API failure message and an optional reload action.

### Props

| Name | Type | Meaning |
| --- | --- | --- |
| `error` | `unknown` | Mapped through the shared public failure-message boundary. |
| `operation` | `read \| create \| write` | Selects the failure wording; failed or lost writes are reported as unknown outcomes. Defaults to read. |
| `messages` | `Record<string, string> (optional)` | Module-specific wording for its own stable error codes. |
| `onReload` | `() => void` | Optional recovery action when current data can be refreshed. |
| `reloadLabel` | `string (optional)` | Accessible name of the reload action; defaults to Reload. |

### States

- Failure message
- Failure message with reload action

Accessibility: Uses role=alert so the failure is announced; the optional reload control is a native button.

Usage: Pass the original error to preserve stable-code mapping. Offer reload only when the current data can be refreshed, and never imply that an unknown write outcome failed.

### Examples

- **Unavailable service with reload** (`unavailable-reload`): A synthetic SERVICE_UNAVAILABLE response; no live request is involved.

## SalesResults

Presents validated sales aggregates, distinct units, comparisons and matched products.

### Props

| Name | Type | Meaning |
| --- | --- | --- |
| `result` | `SalesResult` | Generated SDK response containing server-owned rows, exact decimal totals, comparison periods and warnings. |

### States

- Empty sales
- Table
- Single-unit monthly chart
- Comparison details
- Matched products

Accessibility: Native captioned tables, scoped headers, text values beside chart bars, pressed-state view buttons and native details controls.

Usage: Render only validated API results. Charts are available for monthly data sharing one unit; different quantity units never share a chart or total.

### Examples

- **Monthly sales with comparison** (`sales-monthly-results`): Synthetic decimal sales and prior-year totals; the preview makes no API or provider request.
