# Feature Catalog by Origin

Find an implemented product function, its data source, SQL and filters. Open a linked detail for the behavior and limits. This inventory describes the repository's composition, not which connections or permissions are active in a particular installation. Conditional availability is stated below; future work belongs in the [implementation plan](../project/implementation-plan.md).

## VR Master — Pilar da Terra

| Function | What it does / available criteria | SQL and details | Availability |
| --- | --- | --- | --- |
| Sales consultation | Value and quantity; inclusive dates, literal product phrase, monthly/product grouping, previous year or equal-day period comparison | [Sales options, complete SQL and access predicates](../generated/features/vrmaster/sales.md) | Configured Runtime reader and VRM-VEN-01 |
| Product lookup | Find products by the reviewed classification, cost center, buyer, description and flags; include/exclude, descendants and combined criteria | [Every catalog filter, status, relationships and example SQL](../generated/features/vrmaster/products.md) | Configured Runtime reader and VRM-PRD-01; only enabled catalog dimensions |
| Sales of a product selection | Constrain sales to a verified current registration selection, including products beyond the visible preview; reuse a completed lookup from this ERP | [Product membership and permissions](../generated/features/vrmaster/sales.md#semantic-product-membership) | Both sales and product permissions |

VR Master is the sales/product data source. PDT Connect is a sign-in integration; signing in through PDT Connect does not select an ERP or grant its sales permission by itself.

## Sankhya — MNS

| Function | What it does / available criteria | SQL and details | Availability |
| --- | --- | --- | --- |
| Sales consultation | Net value, quantity and weight; inclusive dates, literal product phrase, monthly/product grouping and comparisons; preserves the approved joins and exclusions | [Sales options, complete SQL and access predicates](../generated/features/sankhya/sales.md) | Configured Runtime reader and SNK-VEN-01; result-center access additionally needs PH-36 |
| Product lookup | Find unique products through the reviewed Data Dictionary catalog: groups, product attributes, units and other enabled dimensions | [Every catalog filter, status, relationships and example SQL](../generated/features/sankhya/products.md) | Configured Runtime reader and SNK-PRD-01; only enabled catalog dimensions |
| Sales of a product selection | Constrain sales through the same complete verified product membership, with include/exclude and hierarchy descendants | [Product membership and permissions](../generated/features/sankhya/sales.md#semantic-product-membership) | Both sales and product permissions |
| Access inside Sankhya Om | Open the same application in the add-on and authenticate the current Om user through a verified assertion | [Host and identity contract](../domains/identity.md#sign-in-methods-and-surfaces) · [add-on](../../apps/sankhya-addon/README.md) | Configured trusted host, deployed add-on and identity requirements; see PH-11/PH-16 |

## PDT Connect

| Function | What it does / available criteria | Implementation basis and details | Availability |
| --- | --- | --- | --- |
| Integrated sign-in | Verified authorization-code/PKCE flow links the external account to an IA-MNS Person and opens the same web application | Provider identity protocol, not a sales SQL query; [sign-in and linking](../domains/identity.md#sign-in-methods-and-surfaces) | Registered client, configured origins and provider; shared-use homologation is PH-12 |
| Default user group | Verified provider sign-in adds normal membership to the owner's selected PDT Connect group; its permissions and restrictions apply | IA-MNS persistence, not ERP SQL; [default groups](../domains/identity.md#replacing-the-former-provider-permission-policy) | Owner selection in Parâmetros; PH-13 |

## IA-MNS — shared application functions

| Function | What it does / available criteria | Implementation basis and details |
| --- | --- | --- |
| Corporate assistant | Select a source explicitly, ask in natural language, clarify ambiguous criteria and inspect source-separated results | Typed capability tools; [agent composition](../domains/corporate-agent.md#product-and-current-capabilities). SQL is compiled by the sales/product functions above |
| Analytical plans | Combine supported measures and month/product dimensions; execute bounded plans over the reviewed sales relation | [Plans, source selection and filters](../architecture/conversational-autonomy.md#planning-and-analytical-composition) · [sales options](../generated/features/sankhya/sales.md#request-options) |
| Evidence follow-ups | Summarize, compare, explain or reformat already authorized results; current permissions still apply | Reuses retained evidence without inventing another query; [evidence scope](../architecture/conversational-autonomy.md#conversation-and-evidence) |
| Conversations and history | Create, reopen, rename, pin, archive, search and delete actor-owned conversations; retain source-specific context | IA-MNS PostgreSQL, not an ERP report; [history and ownership](../domains/corporate-agent.md#persistent-conversations-and-context) |
| Conversation materials | Explicitly attach supported operational text/CSV or PNG/JPEG, inspect and remove them; no PDF/Office support | Bounded attachment processing, not ERP SQL; [formats, limits and provenance](../architecture/conversational-autonomy.md#attachments-and-presentation-preferences) |
| Presentation preferences | Save language, verbosity and format for one conversation | IA-MNS persistence; [preferences](../architecture/conversational-autonomy.md#attachments-and-presentation-preferences) |
| My account and authentication | Local account, verified external links, credential and session security, account access information | IA-MNS identity persistence and provider proofs; [sign-in](../domains/identity.md#sign-in-methods-and-surfaces) · [authentication policy](../domains/identity.md#authentication-policy) |
| Persons, permissions and user groups | Owners manage persons, direct/group grants, restrictions, default provider groups and linked WhatsApp numbers | IA-MNS audited writes; ERP reads only for restriction values; [authorization](../domains/identity.md#authorization) · [WhatsApp numbers](../domains/identity.md#whatsapp-numbers) |
| Operational parameters | Owners change supported model, trace and channel parameters with audited validation | IA-MNS persistence; [operational parameters](../domains/identity.md#operational-parameters) |
| Living documentation | Browse/search local guides, API operations, database tables, components and this catalog; explicitly try supported API requests | Static generated references and bounded API explorer; [portal](../architecture/living-documentation.md) |

## WhatsApp — alternate channel

| Function | What it does / available criteria | Implementation basis and details | Availability |
| --- | --- | --- | --- |
| Agent conversations | Linked numbers reach the same sales/product capabilities with current per-person permissions; source commands and conversations follow the channel's rules | Meta webhook and delivery; the ERP SQL is the same as above; [channel experience](../domains/whatsapp-channel.md#conversation-experience) | Implemented, production activation pending PH-32–PH-35; [checklist](../project/human-actions.md#ph-32) |
| Delivery and web history | Bounded reply delivery, delivery-status handling and actor-owned history visible on the web | IA-MNS outbox/history, not an additional ERP report; [processing](../domains/whatsapp-channel.md#processing) · [web history](../domains/whatsapp-channel.md#history-on-the-web) | Same channel activation requirements |

## Inspect a sales discrepancy

1. Open the source's sales page. Check its definition of a sale and the fixed rules visible in the SQL: the two ERPs do not measure the same relation.
2. Choose the measure and grouping to open the complete SQL. Copy or download it in the portal, then bind the documented example parameters in your database client. Examples contain synthetic dates/phrases, no ERP records or credentials.
3. Match the actual date interval, literal or semantic product selection and effective permission restrictions. A restriction by sale-time buyer differs from filtering the current product registration buyer. Quantity partitions must retain their unit/packaging.
4. For comparisons, use the separate comparison bindings. previous_period is an equal-day interval, not necessarily the preceding calendar month. Both periods use the same current product membership.

Documentation reading never queries an ERP. Downloaded SQL runs only when you explicitly execute it through your own authorized database client. The examples document the production compiler; they are not captured SQL from a particular person's request or proof of live ERP reconciliation.

## Maintenance

The [composition](../../apps/api/src/modules.ts) owns which runtime modules and capabilities exist. This index routes to their canonical domain documentation. When adding/removing a product function, update its row here in the same change; do not maintain a second normative description in this index. The [OpenAPI reference](../generated/api/openapi.json) contains the exhaustive HTTP operation inventory, including administrative and operational endpoints.

SQL variants, supported measures/groupings, filter dimensions, exposure status and access predicates are generated from the production compilers/catalogs by [feature-reference.ts](../../apps/api/scripts/feature-reference.ts). Run `pnpm -C apps/api references:write`, then `pnpm docs:references:write`. The corresponding check commands reject drift. No environment file, model call or ERP connection is needed to generate these feature references; the broader API reference command also verifies the migrated local application schema as usual.
