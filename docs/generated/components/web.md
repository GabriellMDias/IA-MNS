# Web Component Reference

<!-- Generated from apps/web/src/components.docs.json and verified against components.tsx. Do not edit. -->

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
