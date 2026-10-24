# Web Component Reference

<!-- Generated from owned components.docs.json files and verified against named component exports. Do not edit. -->

[Component architecture](../../architecture/web-components.md) · [Living documentation](../../architecture/living-documentation.md)

## PageHeader

A page title and description with optional back navigation and primary actions.

Category: Layout. Scope: composed. Owner: IA-MNS Web UI.

Source: [apps/web/src/components.tsx](../../../apps/web/src/components.tsx) (export `PageHeader`). Metadata: [apps/web/src/components.docs.json](../../../apps/web/src/components.docs.json).

### Props

| Name | Type | Meaning | Required | Default |
| --- | --- | --- | --- | --- |
| `title / description` | `string / string (optional)` | The page h1 and concise supporting text. | See type | — |
| `back / actions` | `ReactNode (optional)` | Caller-owned navigation and action controls. No routing or mutation is performed by this component. | See type | — |

### States

- Title and description
- Back navigation
- Primary action
- Stacked mobile layout

Accessibility: Provides the page's h1. The caller supplies real links and buttons with accessible names; actions stay in reading order when the layout stacks.

Usage: Use once below the application shell. Keep routing in the caller and provide Button controls for actions. Back navigation appears above the title.

### Examples

- **Settings page header** (`ui-page-header`): A synthetic page heading with a local demonstration action.

```tsx
<PageHeader title="Administração" description="Preferências da equipe." />
```


## SelectField

A themed native select with an associated label, help and validation messages.

Category: Inputs. Scope: composed. Owner: IA-MNS Web UI.

Source: [apps/web/src/components.tsx](../../../apps/web/src/components.tsx) (export `SelectField`). Metadata: [apps/web/src/components.docs.json](../../../apps/web/src/components.docs.json).

### Props

| Name | Type | Meaning | Required | Default |
| --- | --- | --- | --- | --- |
| `label` | `string` | Visible accessible name associated with the select. | See type | — |
| `hint / error` | `string (optional)` | Described-by text; error also marks the control invalid. The owning form controls announcements. | See type | — |
| `native select props` | `ComponentProps<select>` | Includes options as children, value/defaultValue, disabled, id, handlers, ref and ARIA attributes. An omitted id is generated uniquely. | See type | — |

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

```tsx
<SelectField label="Duração"><option value="12">12 horas</option></SelectField>
```


## Button

A themed native button with consistent action hierarchy and pending feedback.

Category: Actions. Scope: shared. Owner: IA-MNS Web UI.

Source: [apps/web/src/components.tsx](../../../apps/web/src/components.tsx) (export `Button`). Metadata: [apps/web/src/components.docs.json](../../../apps/web/src/components.docs.json).

### Props

| Name | Type | Meaning | Required | Default |
| --- | --- | --- | --- | --- |
| `variant` | `primary \| secondary \| ghost \| danger` | Action emphasis; defaults to primary. Danger uses semantic error tokens. | See type | — |
| `loading` | `boolean` | Disables interaction, exposes aria-busy and adds a decorative spinner without replacing the accessible name. | See type | — |
| `type` | `button \| submit \| reset` | Defaults to button. Forms must explicitly use submit. | See type | — |
| `native button props` | `ComponentProps<button>` | Forwards native handlers, disabled state, ARIA attributes, ref and children. | See type | — |

### States

- Primary, secondary, ghost and danger
- Disabled
- Loading
- Keyboard focus

Accessibility: Native keyboard semantics, visible focus and a stable accessible name. Theme text and background colors change together to retain contrast; only borders transition. Loading disables repeated activation and sets aria-busy; reduced motion stops the spinner.

Usage: Use primary for a form's main action, secondary for alternatives, ghost for row actions and danger for consequential actions. Set loading from the actual pending operation.

### Examples

- **Action hierarchy** (`ui-buttons`): Button variants and pending feedback; no request or account change.

```tsx
<Button loading={saving}>Salvar</Button>
<Button variant="danger">Encerrar</Button>
```


## TextField

A labeled text-like input with associated help and validation messages.

Category: Inputs. Scope: composed. Owner: IA-MNS Web UI.

Source: [apps/web/src/components.tsx](../../../apps/web/src/components.tsx) (export `TextField`). Metadata: [apps/web/src/components.docs.json](../../../apps/web/src/components.docs.json).

### Props

| Name | Type | Meaning | Required | Default |
| --- | --- | --- | --- | --- |
| `label` | `string` | Visible accessible name, associated with the native input. | See type | — |
| `hint / error` | `string (optional)` | Described-by text; error also marks the input invalid. The owning form controls error announcements. | See type | — |
| `native input props` | `ComponentProps<input>` | Includes type, value/defaultValue, autocomplete, required, id, handlers, ref and ARIA attributes. An omitted id is generated uniquely. | See type | — |

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

```tsx
<TextField label="Nome" hint="Como você aparece no IA-MNS." required />
```


## SectionCard

A named section with a consistent heading, optional description and decorative icon.

Category: Layout. Scope: composed. Owner: IA-MNS Web UI.

Source: [apps/web/src/components.tsx](../../../apps/web/src/components.tsx) (export `SectionCard`). Metadata: [apps/web/src/components.docs.json](../../../apps/web/src/components.docs.json).

### Props

| Name | Type | Meaning | Required | Default |
| --- | --- | --- | --- | --- |
| `title` | `string` | Level-two heading and accessible section name. | See type | — |
| `description / icon` | `string / ReactNode (optional)` | Supporting text and an aria-hidden decorative icon. | See type | — |
| `native section props` | `ComponentProps<section>` | Includes children, className and native section attributes. The heading owns aria-labelledby. | See type | — |

### States

- Title only
- Description and content
- Decorative icon

Accessibility: Uses a semantic section named by a unique h2. Icons are decorative; the title must communicate meaning without them.

Usage: Group related settings below a page's h1. Parent layouts own grid placement; the card adapts to its available width.

### Examples

- **Settings section** (`ui-section-card`): A synthetic settings group demonstrating the shared surface and controls.

```tsx
<SectionCard title="Perfil"><TextField label="Nome" /></SectionCard>
```


## StatusBadge

A compact textual label for a state or category.

Category: Data Display. Scope: shared. Owner: IA-MNS Web UI.

Source: [apps/web/src/components.tsx](../../../apps/web/src/components.tsx) (export `StatusBadge`). Metadata: [apps/web/src/components.docs.json](../../../apps/web/src/components.docs.json).

### Props

| Name | Type | Meaning | Required | Default |
| --- | --- | --- | --- | --- |
| `children` | `ReactNode` | Visible text communicating the state or category. | See type | — |
| `tone` | `neutral \| accent` | Defaults to neutral; accent emphasizes an enabled or current state without implying a global severity. | See type | — |

### States

- Neutral
- Accent
- Light and dark themes

Accessibility: Meaning is conveyed by visible text, never color alone. This is static text, not a live region or an interactive control.

Usage: Use short text for enabled settings, current sessions and permission categories. Announce dynamic outcomes separately in the owning workflow.

### Examples

- **State labels** (`ui-status-badges`): Synthetic neutral and accent states.

```tsx
<StatusBadge tone="accent">Esta sessão</StatusBadge>
```


## ErrorNotice

Displays a public API failure message and an optional reload action.

Category: Feedback. Scope: composed. Owner: IA-MNS Web UI.

Source: [apps/web/src/components.tsx](../../../apps/web/src/components.tsx) (export `ErrorNotice`). Metadata: [apps/web/src/components.docs.json](../../../apps/web/src/components.docs.json).

### Props

| Name | Type | Meaning | Required | Default |
| --- | --- | --- | --- | --- |
| `error` | `unknown` | Mapped through the shared public failure-message boundary. | See type | — |
| `operation` | `read \| create \| write` | Selects the failure wording; failed or lost writes are reported as unknown outcomes. Defaults to read. | See type | — |
| `messages` | `Record<string, string> (optional)` | Module-specific wording for its own stable error codes. | See type | — |
| `onReload` | `() => void` | Optional recovery action when current data can be refreshed. | See type | — |
| `reloadLabel` | `string (optional)` | Accessible name of the reload action; defaults to Reload. | See type | — |

### States

- Failure message
- Failure message with reload action

Accessibility: Uses role=alert so the failure is announced; the optional reload control is a native button.

Usage: Pass the original error to preserve stable-code mapping. Offer reload only when the current data can be refreshed, and never imply that an unknown write outcome failed.

### Examples

- **Unavailable service with reload** (`unavailable-reload`): A synthetic SERVICE_UNAVAILABLE response; no live request is involved.

```tsx
<ErrorNotice error={error} onReload={reload} />
```


## ConversationMaterials

Manages owned operational attachments and explicit presentation preferences within one conversation.

Category: Forms. Scope: feature-specific. Owner: agent.

Source: [apps/web/src/features/agent/materials.tsx](../../../apps/web/src/features/agent/materials.tsx) (export `ConversationMaterials`). Metadata: [apps/web/src/features/agent/components.docs.json](../../../apps/web/src/features/agent/components.docs.json).

### Props

| Name | Type | Meaning | Required | Default |
| --- | --- | --- | --- | --- |
| `token` | `string \| null` | In-memory credential supplied by the workspace, never retained in storage. | See type | — |
| `conversationId` | `string (optional)` | Owned conversation; a new one is created before the first explicit save when absent. | See type | — |
| `source` | `SalesSourceSelection` | ERP scope of new user-supplied material. | See type | — |
| `attachments` | `Attachment[]` | Server metadata only; never inline attachment bodies. | See type | — |
| `preferences` | `PresentationPreferences (optional)` | Explicitly saved language, detail and format; omitted values use automatic presentation. | See type | — |
| `disabled` | `boolean` | Disables writes while access or conversation lifecycle prevents changes. | See type | — |
| `onCreated` | `(id: string) => Promise<void>` | Navigates to a newly persisted conversation before material is saved. | See type | — |

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

## ProductAnswer

Presents the products a lookup found in the Pilar da Terra (VR Master) registration with how each criterion was understood.

Category: Data Display. Scope: feature-specific. Owner: products.

Source: [apps/web/src/features/products/results.tsx](../../../apps/web/src/features/products/results.tsx) (export `ProductAnswer`). Metadata: [apps/web/src/features/products/components.docs.json](../../../apps/web/src/features/products/components.docs.json).

### Props

| Name | Type | Meaning | Required | Default |
| --- | --- | --- | --- | --- |
| `answer` | `ProductAnswer` | Generated SDK agent result: each criterion with the records or classification paths it resolved to, exclusions and the business rule of its relationship; counts per section, notes, the exact total and up to 200 products. | See type | — |

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

Category: Data Display. Scope: feature-specific. Owner: products.

Source: [apps/web/src/features/products/results.tsx](../../../apps/web/src/features/products/results.tsx) (export `ProductOptions`). Metadata: [apps/web/src/features/products/components.docs.json](../../../apps/web/src/features/products/components.docs.json).

### Props

| Name | Type | Meaning | Required | Default |
| --- | --- | --- | --- | --- |
| `options` | `ProductOptions` | Generated SDK agent result with the dimension, the asked words and numbered option labels. | See type | — |
| `onChoose` | `(number: number) => void (optional)` | Sends the chosen number as the next message; absent for earlier turns, which show the options as text. | See type | — |

### States

- Choosable
- Historical

Accessibility: A group named by its title; each choice is a native button whose text includes its number, so typing the number is equivalent.

Usage: Option labels can be personal data such as buyer names: they appear only in this result, never in the reply text that later turns send to the model.

### Examples

- **Two interpretations** (`product-options-choice`): Synthetic choices; selecting one shows a local message and makes no request.

## SalesResults

Presents validated sales aggregates of one source, distinct units, comparisons and matched products.

Category: Data Display. Scope: feature-specific. Owner: sales.

Source: [apps/web/src/features/sales/results.tsx](../../../apps/web/src/features/sales/results.tsx) (export `SalesResults`). Metadata: [apps/web/src/features/sales/components.docs.json](../../../apps/web/src/features/sales/components.docs.json).

### Props

| Name | Type | Meaning | Required | Default |
| --- | --- | --- | --- | --- |
| `result` | `SalesResult` | Generated SDK response containing server-owned rows, exact decimal totals, comparison periods and warnings. | See type | — |
| `source` | `sankhya \| vrmaster (optional)` | Source of the result; selects its measure labels. Defaults to sankhya. | See type | — |

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

Category: Data Display. Scope: feature-specific. Owner: sales.

Source: [apps/web/src/features/sales/results.tsx](../../../apps/web/src/features/sales/results.tsx) (export `SalesAnswer`). Metadata: [apps/web/src/features/sales/components.docs.json](../../../apps/web/src/features/sales/components.docs.json).

### Props

| Name | Type | Meaning | Required | Default |
| --- | --- | --- | --- | --- |
| `answer` | `SalesAnswer` | Generated SDK agent result: the selection and a section per source with its status, reason and result. | See type | — |

### States

- One source
- Both sources
- Source unavailable
- Measure unavailable in a source

Accessibility: Each source is a group named by its level-2 heading, not a landmark, so repeated answers stay distinct; status text explains a missing result without relying on color.

Usage: Never add figures across sections: each source keeps its own totals, and a failed source is reported beside the other source's result.

### Examples

- **Both sources, one unavailable** (`sales-answer-both-sources`): Synthetic Tudo answer with a Sankhya total and an unavailable VRMaster; the preview makes no API or provider request.
