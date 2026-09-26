# Web Component Reference

<!-- Generated from apps/web/src/components.docs.json and verified against components.tsx. Do not edit. -->

[Living documentation](../../architecture/living-documentation.md) · [Component source](../../../apps/web/src/components.tsx)

## AccessTokenForm

Collects an already-issued bearer token and passes it to the in-memory credential boundary.

### Props

| Name | Type | Meaning |
| --- | --- | --- |
| `onConnect` | `(token: string) => void` | Receives the trimmed token on form submission; the component clears its input. |
| `showLocalIdentity` | `boolean (optional)` | Shows development-only local identity controls when available; defaults to true and is disabled in documentation previews. |

### States

- Empty input
- Entered token
- Optional local synthetic identity controls in development

Accessibility: Labels the password input, uses a submit button, and supports keyboard submission. The local identity buttons have descriptive names when available.

Usage: Use only at the authentication boundary. Keep the token in memory; never persist it or include it in a URL.

### Examples

- **Empty token form** (`access-token`): Enter only a non-secret demonstration value here; the preview discards submitted values.

## ErrorNotice

Displays a public API failure message and an optional reload action.

### Props

| Name | Type | Meaning |
| --- | --- | --- |
| `error` | `unknown` | Mapped through the existing public failure-message boundary. |
| `operation` | `read \| create \| write` | Selects the relevant user-facing failure wording; defaults to read. |
| `onReload` | `() => void` | Optional recovery action for stale resource state. |

### States

- Failure message
- Failure message with reload action

Accessibility: Uses role=alert so the failure is announced; the optional reload control is a native button.

Usage: Pass the original error to preserve stable-code mapping. Offer reload only when the current request can be refreshed.

### Examples

- **Stale version with reload** (`version-conflict`): A synthetic RESOURCE_VERSION_CONFLICT response; no live request is involved.
