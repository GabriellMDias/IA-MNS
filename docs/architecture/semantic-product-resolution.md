# Semantic Product Resolution

[Documentation index](../README.md) · [ADR-0032](../adr/0032-resolve-product-selections-through-a-verified-semantic-catalog.md) · [Product lookup](../domains/product-lookup.md) · [AI interpretation](ai-interpretation.md) · [Corporate agent](../domains/corporate-agent.md)

This page owns how IA-MNS turns a Portuguese product-selection request into a validated, executable product selection: the semantic catalog, the ERP adapter port, the division of work between model and application, SQL safety, and how the catalog is maintained. [Product lookup](../domains/product-lookup.md) owns the capability and VR Master semantics; [Sankhya product lookup](../domains/sankhya-product-lookup.md) owns the Oracle dictionary findings and adapter semantics.

## Implemented and not implemented

Implemented: the ERP-neutral catalog model with integrity checks; VR Master and Sankhya catalogs; PostgreSQL and Oracle compilers/sources; runtime verification against live metadata and grants; hierarchy candidate retrieval; two strict model tools; grounding, merging, clarification and contradiction handling; one `products` capability with ERP-isolated state; targeted semantic metadata retrieval; reproducible read-only synchronization and live regression runners; [sales integration](#sales-integration) through complete validated membership. Sankhya runtime refuses privileged accounts; the dedicated reader's current access is recorded in [Runtime verification](../project/runtime-access-verification.md).

Not implemented: standalone product HTTP routes; VR Master dimensions awaiting semantic validation; Sankhya native API execution or calculated/JAPE-rule parity; automatic exposure of discovered relationships. Each requires its own reviewed change.

## Components

| Concern | Source | ERP-specific |
| --- | --- | --- |
| Catalog model, integrity checks | [`catalog.ts`](../../apps/api/src/features/products/catalog.ts) | no |
| Resolved selection (the query AST) | [`selection.ts`](../../apps/api/src/features/products/selection.ts) | no |
| Adapter port | [`source.ts`](../../apps/api/src/features/products/source.ts) | no |
| Model tools and their checks | [`interpretation.ts`](../../apps/api/src/features/products/interpretation.ts), [`interpreter.ts`](../../apps/api/src/features/products/interpreter.ts) | no |
| Orchestration, grounding, merge, clarification | [`resolver.ts`](../../apps/api/src/features/products/resolver.ts), [`state.ts`](../../apps/api/src/features/products/state.ts), [`answer.ts`](../../apps/api/src/features/products/answer.ts) | no |
| Agent capability and wire contracts | [`capability.ts`](../../apps/api/src/features/products/capability.ts), [`contracts.ts`](../../apps/api/src/features/products/contracts.ts) | no |
| PostgreSQL compiler and source | [`postgres.ts`](../../apps/api/src/features/products/postgres.ts), [`postgres-source.ts`](../../apps/api/src/features/products/postgres-source.ts) | PostgreSQL, any catalog |
| VR Master catalog and source | [`vrmaster/catalog.ts`](../../apps/api/src/features/products/vrmaster/catalog.ts), [`vrmaster/source.ts`](../../apps/api/src/features/products/vrmaster/source.ts) | yes |
| Sankhya catalog, discovery and reviewed snapshot | [`sankhya/catalog.ts`](../../apps/api/src/features/products/sankhya/catalog.ts), [`sankhya/metadata.ts`](../../apps/api/src/features/products/sankhya/metadata.ts), [`sankhya/snapshot.ts`](../../apps/api/src/features/products/sankhya/snapshot.ts) | yes |
| Oracle compiler, source and read-only session | [`sankhya/oracle.ts`](../../apps/api/src/features/products/sankhya/oracle.ts), [`sankhya/source.ts`](../../apps/api/src/features/products/sankhya/source.ts), [`sankhya/session.ts`](../../apps/api/src/features/products/sankhya/session.ts) | yes |
| Targeted model-safe capability retrieval | [`metadata-retrieval.ts`](../../apps/api/src/features/products/metadata-retrieval.ts) | no |

The VR Master connection settings and transaction limits are shared with the sales source in [`vrmaster-connection.ts`](../../apps/api/src/vrmaster-connection.ts); each feature owns its pool and SQL. The product-phrase normalization and the grounding word forms are shared with sales ([`product-match.ts`](../../apps/api/src/features/sales/product-match.ts), [`analysis.ts`](../../apps/api/src/features/sales/analysis.ts)).

## Sales integration

[`products/sales.ts`](../../apps/api/src/features/products/sales.ts) composes the resolver through the sales-owned port in [`application.ts`](../../apps/api/src/features/sales/application.ts). Sales owns analysis/period validation and its reference queries; products owns registration interpretation and selection. Only composition wires them together; sales never imports product internals. [ADR-0034](../adr/0034-apply-verified-product-selections-to-sales-without-materializing-display-lists.md) records the implementation's rationale for review.

The sales tool adds a nullable `productMode` only for this composed agent path: `resolve`, `reuse`, `literal`, `all`, or unstated. It can name no SQL or record ids. The selected catalog supplies a compact dimension guide only after `products:read`; the ordinary analytical vocabulary still owns metrics/groupings/comparisons. The product interpreter's sales purpose identifies all registration conditions while ignoring separately validated metrics/dates. Unavailable product dimensions and unsupported transaction conditions block the whole query. A missing period retains the original request; a pending numbered product choice retains the sales draft, source and period and resumes within sales.

Each adapter's `salesScope` revalidates the same metadata/access boundary as lookup and compiles a complete root-key subquery. PostgreSQL membership parameters start after the four existing reference parameters; Oracle uses distinct named binds. The sales adapter inserts key membership without changing its joins, projection/grain, measures or transaction behavior. Oracle applies it to both eligible lot controls and final sales. One-to-many paths stay semi-joins. No id list is materialized from the bounded product answer; an empty selection yields zero eligible sales rather than removing the filter.

The internal SQL handoff is not a wire contract, model output or persisted state. Context stores the validated AST with catalog version in a version-3 sales envelope, isolated per ERP; existing version-1/2 sales context upgrades through its original loader. Ordinary literal sales retain source-selector refinements and `Tudo` queries. A semantic request with `Tudo` asks for one ERP. Explicit reuse reads only the matching actor-owned lookup context and never changes it. Every scoped continuation checks `products:read` again; stale catalogs, missing context, verification failures and cancellation never fall back to all products.

Selection membership is the **current registration**, queried within each sales adapter's snapshot and applied equally to both periods. It does not reconstruct historical buyer/category assignments. Semantic results add optional `productSelection` provenance and an explicit current-registration warning. Reading saved semantic answers/choices and replaying completed turns also requires both permissions after revocation. Lists show at most 100 sold products per period, with an explicit truncation warning, while aggregate totals cover the complete selection; the existing 500-row aggregate cap still refuses oversized breakdowns. Legacy literal product-list overflow behavior is unchanged. Product and sales use their existing 30-/20-second model request budgets within the agent's 90-second cancellation deadline, with no runtime retries or new grants.

Run `pnpm -C apps/api products:sales:regression [--model]` for read-only Runtime reconciliation. It never loads Discovery credentials, uses one-day current/comparison scopes, compares exact decimal aggregate rows against independent membership predicates over the unchanged reference grain, and emits only status/timings. Optional model runs use the normal composed capability with synthetic actor permissions, not browser authentication. Evidence remains in ignored `evals/.local/products/sales-regression.json`.

## The semantic catalog

A catalog is typed data validated by [`catalogProblems`](../../apps/api/src/features/products/catalog.ts) when it loads; a problem stops the capability. It contains:

- **Entities**: a table, key, label column, the columns the catalog relies on with their discovered `format_type` and nullability, whether the runtime account may read it (`access`), an optional registration status column and whether its values are personal data.
- **Relationships**: from and to entities, join column pairs, constant conditions on the target (for example a hierarchy level), cardinality read from → to, optionality, meaning, evidence (declared constraint, dated data validation findings, existing application usage), status and confidence. Status distinguishes `verified` (declared and checked against data), `validated` (undeclared but checked against data and usage), `declared` (constraint not checked), `hypothesis` (names or types only) and `rejected`.
- **Hierarchies**: VR Master uses its level column and ordered code columns. Sankhya supplies an explicit parent column; the adapter validates ancestry and returns actual ancestor ids in the same node contract.
- **Dimensions**: what people and the model can ask for. Kinds are `hierarchy` (nodes chosen among real candidates), `entity` (named records matched by name, expanded to hierarchy descendants), `text` (a literal description phrase), `flag` (a boolean column of the root) and `status` (a related record with an active status exists). Each has a Portuguese title, meaning, synonyms, a relationship path from the root, the Portuguese business interpretation shown with results, an exposure (`enabled`, `requires_grant`, `pending_validation`) and the blocker of a non-enabled dimension.
- **Conventions**: patterns over labels that carry cataloguing meaning discovered in the data (for example raw-material or inactive nodes), shown to the model and the person beside matching values.

Integrity rules include: safe identifiers; every referenced column listed; paths that chain from the root to the value entity; a verified relationship has a declared constraint; executable relationships have data validation; an enabled dimension passes only through `verified` or `validated` relationships and readable tables; a disabled one states its blocker.

Named records support integer and string keys (Sankhya units use strings). Entity dimensions may carry a reviewed dictionary domain; this reuses record grounding, clarification and binding without inventing a new query language. Flags and registration status accept the catalog's integer or string values. ERP-specific metadata stays in each adapter; the shared catalog describes shared semantic meaning.

## Turn pipeline

1. The capability selects the configured catalog from the interface's source selector. With both catalogs, `all` asks for one ERP. Persisted active/pending state is scoped by ERP and catalog version; legacy unscoped state belongs only to VR Master.
2. A pending numbered choice answered with its number, an ordinal or words that identify exactly one option is applied without a model call.
3. Otherwise the model reads the message with `interpret_product_request`: decision, relation (`new`, `refine`, `answer_pending`), an optional option number, and criteria with a catalog dimension id, mode (`include`/`exclude`), the person's words, a qualifier and up to five alternative search terms for the same concept.
4. The application rejects inconsistent output, explains dimensions that are not enabled, drops criteria whose words the person never wrote (grounding as in sales) and normalizes the relation against its state.
5. Each criterion is resolved against the ERP:
   - **hierarchy**: the source returns up to 60 candidate nodes: nodes named with the words (the person's own words first), their children when a node has at most twelve, and nodes whose product descriptions mention the words, grouped at level 3 with the long tail folded into level-2 and level-1 ancestors so every mention stays reachable. One named node that holds every mention is selected directly; otherwise `select_product_categories` chooses included and excluded candidates, "every product mentioning the words", or 2–4 alternatives when the words are ambiguous. A node found by name contributes its subtree; one found by descriptions only its products that mention the words.
   - **entity**: the person's significant words, without the dimension's own words, must each match a whole word of the record name, accent- and case-insensitively. A record covered by another match (a cost center and its sub-center) is one value; several distinct records, or none, become numbered options.
   - **text**, **flag** and **status** need no lookup.
6. Inclusions of one single-valued dimension with disjoint values merge into one criterion (a product has one buyer, one classification), so "do comprador A ou do B" is a union; overlapping ones remain combined with AND ("mercearia" and "doces"). An inclusion wholly excluded again is a contradiction and is asked about.
7. The source executes the selection; the answer lists every criterion with its resolved values and interpretation, product counts per section, notes and up to 200 products with the exact total.

Clarifications store the work already resolved and what remains, so the answer to a question continues the same request. State holds the last executed selection (for refinements such as "e desses, quais são pesáveis?"), one pending question and up to 12 exchanges.

## Safety of the executed SQL

The following PostgreSQL details describe VR Master. Sankhya preserves the same invariants with Oracle-specific mechanisms described below.

- Identifiers come only from the validated catalog, are checked again against `^[a-z_][a-z0-9_]{0,62}$` and quoted; every value, pattern and id list is a bound parameter with a fixed cast. A parameter no clause reads is not bound.
- The outer query reads only the root table. Hierarchy membership is an `EXISTS` over node ids with prefix conditions; other paths are nested `IN` semi-joins built from the catalog's join pairs and conditions. One-to-many relationships therefore never duplicate a product.
- Inclusions require the predicate to be `TRUE`; exclusions use `IS NOT TRUE`, so a NULL from an optional relationship (a section without a cost center) is neither silently included nor silently lost.
- Every call runs in `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` with 30-second statements and 5-second locks, is always rolled back, and an aborted turn ends its connection. Lists are `LIMIT 201` for 200 shown; candidate and record lookups have their own bounds.
- Before the first statement of a process, and again after ten minutes, the source compares every column enabled dimensions need (existence, type, nullability, column SELECT privilege) with `pg_catalog`; any difference fails closed with `PRODUCTS_PROVIDER_UNAVAILABLE` at the `catalog` stage.

Sankhya uses quoted reviewed identifiers, bound values, nested `EXISTS`, null-safe `CASE` predicates and explicit-parent `CONNECT BY NOCYCLE` traversal. Sessions use `SET TRANSACTION READ ONLY`, rollback, cancellation, bounded fetches, 15-second calls and a 30-second operation budget. A dedicated non-owner SELECT-only account is enforced before runtime product queries. Used physical/dictionary definitions, keys, relationships, properties and domain values are revalidated before first use and every ten minutes. Raw dictionary expressions never enter compiled SQL; physical registration semantics are explicitly distinct from JAPE instances ([details and API evaluation](../domains/sankhya-product-lookup.md#execution-and-native-api-evaluation)).

## Model input and privacy

The interpretation tool sees the dimension guide (ids, Portuguese meanings, synonyms, availability), at most six relevant authorized semantic capability descriptions, user messages, application-authored replies and filter-only descriptions of earlier answers in the person's words. It never receives the raw Data Dictionary. The selection tool sees one condition and the numbered candidates: classification paths, levels, counts, conventions and up to three example product descriptions. No table or column name, buyer or other personal candidate name, price, cost, stock or sales figure is sent. Options holding personal data appear only in the structured result; the model sees a placeholder, and the person's own reply chooses deterministically. Instructions carry versions (`product-interpreter/…`, `product-selector/…`) recorded in traces; change them with any instruction change.

Traces follow [AI tracing](ai-interpretation.md#ai-tracing-and-observability): metadata records decisions, dimension ids, candidate counts, issue codes, outcomes and totals; the content level adds the interpretation, the selection choice and the filter description.

## Maintaining the catalog

Run from the repository root with the runtime `VRMASTER_DB_*` settings in the ignored `.env.local`:

| Purpose | Command |
| --- | --- |
| Compare the catalog with the live schema, grants, declared constraints and data invariants; list foreign keys the catalog does not describe | `pnpm -C apps/api products:catalog [--out evals/.local/products/catalog-check.json]` |
| Run the live regression (real model and database) against the ignored local dataset, comparing with independent SQL | `pnpm -C apps/api products:regression [--case <id>]` |

The check is read-only, uses the restricted account and prints only counts and schema names. It exits 1 when an enabled dimension is affected. It never edits the catalog and never enables anything. To change the catalog:

1. Investigate read-only (catalogs, bounded aggregates, existing queries), record dated non-sensitive findings and the status of each relationship.
2. Confirm business meaning with the owner when the data cannot decide it (for example what "fabricante" means).
3. Edit the catalog, bump its `version`, extend the synthetic schema in [`products-vrmaster.test.ts`](../../apps/api/test/products-vrmaster.test.ts) with the exact column types and grants, add unit and regression cases, and update [product lookup](../domains/product-lookup.md).
4. Run `products:catalog`, `products:regression` and the full gate.

A table that becomes readable is reported as information, never enabled automatically. The regression dataset holds real product codes and lives in the ignored `apps/api/evals/.local/products/`; [`products-regression.example.json`](../../apps/api/scripts/products-regression.example.json) shows its format with fictional values.

Sankhya's bounded dictionary/native snapshot, drift checks, explicit reviewed promotion and live runner use `products:sankhya:sync` and `products:sankhya:regression`; see the [synchronization procedure](../domains/sankhya-product-lookup.md#reproducible-synchronization). Metadata discovery and capability exposure are separate. The local discovery reader is never selected by application composition. [ERP access policy](../security/erp-database-access.md) separates the existing administrator in `.env.discovery.local` from the runtime reader; no third account is created. VRMaster `products:catalog` continues to check the runtime reader, while `erp:discovery` inspects objects with the existing administrator.

PH-27 now supplies column-level reads for store status, packaging and family. Their catalog access metadata is updated, but their dimensions remain `pending_validation` until PJ-36 validates the paths; current available dimensions and model instructions remain unchanged. [Runtime access evidence](../project/runtime-access-verification.md) records the applied grants and remaining PUBLIC privilege issue.

## Adding a dimension or an ERP

A dimension of an existing catalog is data plus tests when its kind exists: add the relationships with evidence, the dimension, synthetic tests and regression cases. A new kind needs compiler support, resolution in the resolver and wire changes if the answer needs new fields.

Another ERP implements [`ProductSource`](../../apps/api/src/features/products/source.ts) and supplies its catalog. A PostgreSQL ERP reuses `createPostgresProductSource`. The implemented Sankhya Oracle adapter uses the same resolver, model tools, selection AST, clarification and result contracts; its specialized compiler and discovery layer own Oracle/dictionary behavior. Composition constructs one resolver per configured ERP behind the same capability and permission. Cross-ERP queries never reuse ids or pending choices.

## Verification

[`products-resolver.test.ts`](../../apps/api/test/products-resolver.test.ts) covers catalog integrity and rejection of broken catalogs, compiled SQL (bound values, quoting, semi-joins, null-safe exclusions, unused parameters), word forms, strict-mode compatibility of both tools, absence of schema names in instructions, candidate selection, ambiguity and deterministic choices, personal data kept from the model, hierarchy expansion, unions and intersections, contradictions, grounding, unavailable dimensions, sales requests, the source selector, refinement and the OpenAI boundary. [`products-vrmaster.test.ts`](../../apps/api/test/products-vrmaster.test.ts) runs the source on PostgreSQL 16 with a synthetic schema of the discovered shapes and the PH-19 grants, compares every scenario with independent SQL, and checks de-duplication over one-to-many registrations under a column grant, fail-closed verification, hostile text and refused writes. The curated [product routing cases](../../apps/api/evals/datasets/curated/products-routing.json) gate routing between sales and products. Live evidence is in [product lookup](../domains/product-lookup.md#verification).

[`products-sankhya.test.ts`](../../apps/api/test/products-sankhya.test.ts) protects Oracle compilation, privilege/transaction boundaries, string keys, hierarchy validation, metadata drift, targeted retrieval, dictionary-domain grounding and ERP-isolated state. The real-database runner is opt-in and compares exact product sets with independent SQL; [Sankhya evidence and limitations](../domains/sankhya-product-lookup.md#validation-evidence-and-remaining-work) distinguish runtime enablement, passing local scenarios and unsupported semantics.
