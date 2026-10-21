# Web Component Reference

<!-- Generated from apps/web/src/components.docs.json and its feature metadata; verified against component sources. Do not edit. -->

[Living documentation](../../architecture/living-documentation.md) · [Component source](../../../apps/web/src/components.tsx)

## PageHeader

A page title and description with optional back navigation and primary actions.

### Props

| Name | Type | Meaning |
| --- | --- | --- |
| `title / description` | `string / string (optional)` | The page h1 and concise supporting text. |
| `back / actions` | `ReactNode (optional)` | Caller-owned navigation and action controls. No routing or mutation is performed by this component. |

### States

- Title and description
- Back navigation
- Primary action
- Stacked mobile layout

Accessibility: Provides the page's h1. The caller supplies real links and buttons with accessible names; actions stay in reading order when the layout stacks.

Usage: Use once below the application shell. Keep routing in the caller and provide Button controls for actions. Back navigation appears above the title.

### Examples

- **Settings page header** (`ui-page-header`): A synthetic page heading with a local demonstration action.

## SelectField

A themed native select with an associated label, help and validation messages.

### Props

| Name | Type | Meaning |
| --- | --- | --- |
| `label` | `string` | Visible accessible name associated with the select. |
| `hint / error` | `string (optional)` | Described-by text; error also marks the control invalid. The owning form controls announcements. |
| `native select props` | `ComponentProps<select>` | Includes options as children, value/defaultValue, disabled, id, handlers, ref and ARIA attributes. An omitted id is generated uniquely. |

### States

- Selected option
- Disabled option or control
- Help text
- Invalid
- Keyboard focus

Accessibility: Retains native select keyboard behavior and disabled options. Label and help/error IDs are associated; caller-supplied aria-describedby is retained.

Usage: Use for a bounded choice. Supply native options and preserve server-owned option restrictions. Match TextField's label/help conventions.

### Examples

- **Native choice** (`ui-select-field`): Synthetic options and help; the selection is not saved or sent.

## Button

A themed native button with consistent action hierarchy and pending feedback.

### Props

| Name | Type | Meaning |
| --- | --- | --- |
| `variant` | `primary \| secondary \| ghost \| danger` | Action emphasis; defaults to primary. Danger uses semantic error tokens. |
| `loading` | `boolean` | Disables interaction, exposes aria-busy and adds a decorative spinner without replacing the accessible name. |
| `type` | `button \| submit \| reset` | Defaults to button. Forms must explicitly use submit. |
| `native button props` | `ComponentProps<button>` | Forwards native handlers, disabled state, ARIA attributes, ref and children. |

### States

- Primary, secondary, ghost and danger
- Disabled
- Loading
- Keyboard focus

Accessibility: Native keyboard semantics, visible focus and a stable accessible name. Loading disables repeated activation and sets aria-busy; reduced motion stops the spinner.

Usage: Use primary for a form's main action, secondary for alternatives, ghost for row actions and danger for consequential actions. Set loading from the actual pending operation.

### Examples

- **Action hierarchy** (`ui-buttons`): Button variants and pending feedback; no request or account change.

## TextField

A labeled text-like input with associated help and validation messages.

### Props

| Name | Type | Meaning |
| --- | --- | --- |
| `label` | `string` | Visible accessible name, associated with the native input. |
| `hint / error` | `string (optional)` | Described-by text; error also marks the input invalid. The owning form controls error announcements. |
| `native input props` | `ComponentProps<input>` | Includes type, value/defaultValue, autocomplete, required, id, handlers, ref and ARIA attributes. An omitted id is generated uniquely. |

### States

- Empty or filled
- Help text
- Invalid
- Disabled
- Keyboard focus

Accessibility: Label and help/error IDs remain associated across renders. Caller-supplied aria-describedby is retained. Uses native input and validation semantics.

Usage: Use for text-like inputs, including password and one-time codes. Supply appropriate autocomplete and validation attributes. Keep credentials in temporary form state only.

### Examples

- **Labels, help and errors** (`ui-text-fields`): Synthetic profile fields with no persistence or network request.

## SectionCard

A named section with a consistent heading, optional description and decorative icon.

### Props

| Name | Type | Meaning |
| --- | --- | --- |
| `title` | `string` | Level-two heading and accessible section name. |
| `description / icon` | `string / ReactNode (optional)` | Supporting text and an aria-hidden decorative icon. |
| `native section props` | `ComponentProps<section>` | Includes children, className and native section attributes. The heading owns aria-labelledby. |

### States

- Title only
- Description and content
- Decorative icon

Accessibility: Uses a semantic section named by a unique h2. Icons are decorative; the title must communicate meaning without them.

Usage: Group related settings below a page's h1. Parent layouts own grid placement; the card adapts to its available width.

### Examples

- **Settings section** (`ui-section-card`): A synthetic settings group demonstrating the shared surface and controls.

## StatusBadge

A compact textual label for a state or category.

### Props

| Name | Type | Meaning |
| --- | --- | --- |
| `children` | `ReactNode` | Visible text communicating the state or category. |
| `tone` | `neutral \| accent` | Defaults to neutral; accent emphasizes an enabled or current state without implying a global severity. |

### States

- Neutral
- Accent
- Light and dark themes

Accessibility: Meaning is conveyed by visible text, never color alone. This is static text, not a live region or an interactive control.

Usage: Use short text for enabled settings, current sessions and permission categories. Announce dynamic outcomes separately in the owning workflow.

### Examples

- **State labels** (`ui-status-badges`): Synthetic neutral and accent states.

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

- Closed composer trigger
- Compact add menu
- Floating attachment or preference view
- Empty
- Owned attachments
- Selected file awaiting purpose and explicit approval
- Client file-format or size feedback
- Saving
- Saved confirmation
- Validation or access failure

Accessibility: The labeled plus trigger exposes an expanded state and opens a named modeless native popover. Keyboard focus enters its options, Escape and outside clicks dismiss it, and explicit close restores trigger focus. Named sections, shared labeled controls, an explicit approval checkbox and live status/alert messages retain the material workflow.

Usage: Place the trigger inside the message composer. Its compact menu opens a file picker, existing attachment metadata or presentation settings. A viewport-bounded floating panel follows the composer without displacing the conversation; its portal sits outside the message form to prevent accidental submission from material fields. File selection remains local until explicit upload; replacing the file clears approval. Bounds, discard, retry IDs and dependent-reply removal remain intact. The server remains authoritative for ownership, limits and restricted-data policy.

### Examples

- **Conversation materials** (`agent-materials-disabled`): Disabled synthetic material settings; no live upload or preference request.
- **Owned conversation attachments** (`agent-materials-owned`): Synthetic file metadata and custom presentation with writes disabled; use the plus trigger to inspect the floating views.

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
