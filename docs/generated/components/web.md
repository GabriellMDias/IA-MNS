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

## ConversationMaterials

Manages owned operational attachments and explicit presentation preferences within one conversation.

### Props

| Name | Type | Meaning |
| --- | --- | --- |
| `token` | `string \| null` | In-memory credential supplied by the workspace, never retained in storage. |
| `conversationId` | `string (optional)` | Owned conversation; a new one is created before the first explicit save when absent. |
| `source` | `SalesSourceSelection` | ERP scope of new user-supplied material. |
| `attachments` | `Attachment[]` | Server metadata only; never inline attachment bodies. |
| `preferences` | `PresentationPreferences (optional)` | Explicitly saved language, detail and format; omitted values use automatic presentation. |
| `disabled` | `boolean` | Disables writes while access or conversation lifecycle prevents changes. |
| `onCreated` | `(id: string) => Promise<void>` | Navigates to a newly persisted conversation before material is saved. |

### States

- Collapsed
- Empty
- Owned attachments
- Saving
- Validation or access failure

Accessibility: Native details, labeled inputs, file picker, fieldset and live status/alert messages support keyboard and assistive technology.

Usage: Pass current actor-owned metadata. Upload is deliberate and requires operational classification; removal invalidates derived replies. The server remains authoritative for ownership, bounds and restricted-data policy.

### Examples

- **Conversation materials** (`agent-materials-disabled`): Disabled synthetic material settings; no live upload or preference request.

## SalesResults

Presents validated sales aggregates of one source, distinct units, comparisons and matched products.

### Props

| Name | Type | Meaning |
| --- | --- | --- |
| `result` | `SalesResult` | Generated SDK response containing server-owned rows, exact decimal totals, comparison periods and warnings. |
| `source` | `sankhya \| vrmaster (optional)` | Source of the result; selects its measure labels. Defaults to sankhya. |

### States

- Empty sales
- Table
- Single-unit monthly chart
- Comparison details
- Matched products

Accessibility: Native captioned tables, scoped headers, text values beside chart bars, pressed-state view buttons and native details controls.

Usage: Render only validated API results. Charts are available for monthly data sharing one unit; different quantity units, including VRMaster packaging types, never share a chart or total.

### Examples

- **Monthly sales with comparison** (`sales-monthly-results`): Synthetic decimal sales and prior-year totals; the preview makes no API or provider request.

## SalesAnswer

Presents a sales answer with one labeled section per queried source: MNS (Sankhya), Pilar da Terra (VR Master) or both.

### Props

| Name | Type | Meaning |
| --- | --- | --- |
| `answer` | `SalesAnswer` | Generated SDK agent result: the selection and a section per source with its status, reason and result. |

### States

- One source
- Both sources
- Source unavailable
- Measure unavailable in a source

Accessibility: Each source is a group named by its level-2 heading, not a landmark, so repeated answers stay distinct; status text explains a missing result without relying on color.

Usage: Never add figures across sections: each source keeps its own totals, and a failed source is reported beside the other source's result.

### Examples

- **Both sources, one unavailable** (`sales-answer-both-sources`): Synthetic Tudo answer with a Sankhya total and an unavailable VRMaster; the preview makes no API or provider request.

## ProductAnswer

Presents the products a lookup found in the Pilar da Terra (VR Master) registration with how each criterion was understood.

### Props

| Name | Type | Meaning |
| --- | --- | --- |
| `answer` | `ProductAnswer` | Generated SDK agent result: each criterion with the records or classification paths it resolved to, exclusions and the business rule of its relationship; counts per section, notes, the exact total and up to 200 products. |

### States

- Classification with exclusions
- Several criteria combined
- List shorter than the total
- No products

Accessibility: A group named by its level-2 source heading; criteria in a description list; a native captioned table with scoped headers that states when only the first products are listed.

Usage: Render only validated API results. Always show the interpretation beside the list: classification paths, exclusions and relationship rules are how a person checks what was selected.

### Examples

- **Category with an exclusion** (`product-answer-category`): Synthetic classification paths and products; the preview makes no API, provider or ERP request.

## ProductOptions

Presents the numbered choices of a product clarification, such as two interpretations of a word or several matching buyers.

### Props

| Name | Type | Meaning |
| --- | --- | --- |
| `options` | `ProductOptions` | Generated SDK agent result with the dimension, the asked words and numbered option labels. |
| `onChoose` | `(number: number) => void (optional)` | Sends the chosen number as the next message; absent for earlier turns, which show the options as text. |

### States

- Choosable
- Historical

Accessibility: A group named by its title; each choice is a native button whose text includes its number, so typing the number is equivalent.

Usage: Option labels can be personal data such as buyer names: they appear only in this result, never in the reply text that later turns send to the model.

### Examples

- **Two interpretations** (`product-options-choice`): Synthetic choices; selecting one shows a local message and makes no request.
