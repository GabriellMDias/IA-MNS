# Product Lookup

[Corporate agent](corporate-agent.md) · [Semantic product resolution](../architecture/semantic-product-resolution.md) · [ADR-0032](../adr/0032-resolve-product-selections-through-a-verified-semantic-catalog.md) · [Sales capability](sales-chat.md) · [Project plan](../project/implementation-plan.md)

## Scope

Product lookup is one corporate-agent capability that answers, in Portuguese, which products of the selected registration match conditions. This page owns the VR Master semantics: "Quais produtos são banana fruta?", "Quais produtos são do centro de custo SECOS?", buyers, combinations, exclusions, synonyms and refinements. [Sankhya product lookup](sankhya-product-lookup.md) owns its separate dictionary-discovered dimensions and runtime credential requirements. It lists products with the interpretation that selected them; it never calculates sales, prices, stock or margins, which remain the [sales capability](sales-chat.md). It needs `products:read`. Choose the ERP explicitly; when both are configured, `Tudo` asks which registration to query. State, ids and pending choices are isolated per ERP. With only VR Master configured, `Tudo` retains the single-source notice.

| Dimension | Meaning | How a product is related | Status |
| --- | --- | --- | --- |
| Classificação mercadológica | Product types, sections, groups and, where the registration uses them as levels, brands and sizes | The product's five-level mercadológico code; a node contains the products sharing its leading codes | enabled |
| Centro de custo | Cost center of the product's section | Not registered on the product: the cost center assigned to the product's level-1 mercadológico node (sub-centers included) | enabled |
| Comprador | Buyer responsible for the product | The buyer in the product's current registration | enabled |
| Descrição | A literal phrase of the description | Whole words, accent- and case-insensitive | enabled |
| Pesável | The registration's "pesável" flag | A column of the product; not the same as being sold by KG | enabled |
| Situação nas lojas | Active in at least one store | Per-store registration rows | needs a grant ([PH-27](../project/human-actions.md#ph-27)) |
| Embalagem de venda | Sales unit (UN, KG, CX…) | Packaging type of the product | needs a grant ([PH-27](../project/human-actions.md#ph-27)) |
| Família de preço | ERP price/offer family | Family of the product | needs a grant ([PH-27](../project/human-actions.md#ph-27)) |
| Fabricante | Manufacturer | The "fornecedor fabricante" column does not hold manufacturers | needs an owner definition ([PH-28](../project/human-actions.md#ph-28)) |

Barcodes and supplier links are documented relationships without a dimension yet. Brands have no usable registration; they appear in descriptions and, in many sections, as level-4 classification nodes, which the classification dimension already offers.

## UI acceptance

VR Master is ready for first user acceptance with the configured restricted reader. Sankhya Runtime access is now [verified](../project/runtime-access-verification.md) with `IA_MNS_RO`; PH-08 retains business confirmations. Automated authenticated journeys use synthetic identities/data; no authenticated browser journey against these real ERPs has been executed by the agent. A configuration check proves neither database availability nor user acceptance.

1. Use Node 24.13.0 and pnpm 11.25.0. From the repository root run `pnpm install --frozen-lockfile`. Start the existing IA-MNS PostgreSQL; for the already provisioned repository Compose database use `docker compose --env-file infra/local/.env -f infra/local/compose.yaml start`. Use `pnpm db:local` only for the local database setup described in [setup](../setup.md#corporate-agent-and-local-postgresql), since it also configures application database URLs. Keep the existing ignored `.env.local`, OpenAI key, identity keys and restricted `VRMASTER_DB_*` settings. Do not bootstrap a replacement owner or change an existing account.
2. Use `IA_MNS_LOCAL_ACCESS=false` and ordinary IA-MNS sign-in. Start `pnpm -C apps/api dev` with the existing `IA_MNS_RO` and `ia_mns` Runtime settings. Both sources now have [verified reader access](../project/runtime-access-verification.md). Normal loading excludes administrative keys and never loads either Discovery file. Never use administrative credentials to work around a Runtime error. Restart an already running API to ingest the new directory setting.
3. In a second terminal run `pnpm -C apps/web dev`. Open `http://127.0.0.1:5173` (the configured `IA_MNS_PUBLIC_ORIGIN`; use the same origin as existing sign-in), and sign in with the existing authorized account and its second factor if required. Do not enter database or OpenAI credentials in the browser.
4. An existing principal administrator already has every product permission. For another authorized tester, a principal administrator opens the account menu → **Administração** → selects the existing person → **Permissões**, clicks **Conceder** on **VRM-PRD-01 Consultar produtos** under Pilar da Terra (VR Master) (`products_vrmaster:read`; SNK-PRD-01 for Sankhya) and confirms it reads **Efetiva por concessão individual**. Review default provider groups separately in Parâmetros; their members inherit any product permission an owner grants to those groups. The tester signs out and in to obtain an updated access token. No new database migration or new owner is required for this permission.
5. Open a new conversation, choose **Pilar da Terra (VR Master)** in **Fonte** above the composer, and send the cases below one at a time. Start a new conversation for independent cases; keep a conversation for refinements and numbered choices. Check the displayed source, interpretation, criteria, total and product list. Counts describe the live catalog and may change.

| Message / action | Expected acceptance behavior |
| --- | --- |
| `Quais produtos são banana fruta?` | Fresh-banana classification, descendants included, chips and raw materials excluded; five products in the 2026-10-11 reference |
| `Quais produtos do centro de custo SECOS?` | Indirect product → section → cost center; 19,091 products in the reference, bounded visible list with total |
| `Quais produtos de mercearia não são doces?` | Hierarchical inclusion plus exclusions; interpretation explains nodes chosen and preserves sweet corn |
| `Quais produtos de hortifrúti são pesáveis?` | Verified section synonym FLV plus the registration flag; does not equate KG with pesável |
| `Quais produtos são banana?` then a displayed option number | Explicit ambiguity where applicable; the number chooses the offered interpretation, preserving the source |
| `Quais produtos da compradora Ana?` (fictional example), then choose a real offered buyer if unmatched; `Desses, quais são do centro de custo SECOS?` | Grounded current buyer, safe unknown-name clarification, then combined filtering; no fabricated personal value |
| `Quais produtos estão ativos?` | Explicit unavailable-dimension explanation until PH-27 and catalog validation; no invented status |
| Change to `Tudo` with both catalogs configured | Asks which ERP, without combining or translating identifiers |
| Change to **MNS (Sankhya)** with the verified Runtime reader and ask `Quais produtos possuem unidade alternativa KG?` | Separate Sankhya state, indirect registration relation, unique products; 3,035 in the reference |

For Sankhya also reproduce literal BATATA description (382), base KG (794), active revenda plus BATATA (97), and a literal EPI certificate from an authorized known record; see [its validated scope](sankhya-product-lookup.md#filtering-capabilities). Unsupported buyer/classification semantics must remain explicit. No real Sankhya UI success is claimed before account provisioning and this journey.

Product model requests now have a bounded **30-second per-request budget**, with zero automatic runtime retries; sales and routing retain their **20-second** default. The agent cancels the entire asynchronous turn after **90 seconds**, propagates the same abort signal, and checks cancellation before saving successful state. ERP queries have separate bounded deadlines. UI polling does not extend these budgets; closing the page is not a cancellation operation. Tests cover provider timeout, caller cancellation, Oracle interruption and safe cleanup. The second acceptance-preparation VR run included a completed 17.8-second model call and one transient provider retry (only the opt-in runner retries); that tail latency justifies modest product-specific headroom. The provider retry was not classified as a timeout and is not proof of one. Both live product runners share the runtime's 30-second constant, replacing Sankhya's former offline 40-second override. Failures retain a safe reference; verify the conversation outcome before resubmitting.

## VR Master product schema

Discovered on 2026-10-11 through read-only transactions with bounded queries: PostgreSQL catalogs (columns, primary, unique and foreign keys, indexes, privileges), aggregate checks of the data and comparison with the [sales reference SQL](sales-chat.md#vrmaster-sales-semantics) and PDT Connect queries. The runtime account (PH-19) reads only nine tables but all catalog metadata; data checks of the other tables used temporary discovery credentials the owner supplied for this investigation only, inside read-only transactions. Those credentials are not part of any IA-MNS configuration. The machine-readable result is the [VR Master catalog](../../apps/api/src/features/products/vrmaster/catalog.ts); this section summarizes it.

### Entities

| Entity | Table | Meaning | Runtime account |
| --- | --- | --- | --- |
| product | `produto` | One registration per product, shared by every store | reads |
| classification_node | `mercadologico` | Five-level classification; a level-n node has its first n codes set and the rest 0 | reads |
| cost_center | `centrocusto` | Three-level cost center tree, with registration status | reads |
| buyer | `comprador` | Buyers, with registration status; names are personal data | reads |
| supplier_company | `fornecedor` | Business partners: suppliers, distributors, the stores' companies | reads |
| sale | `venda` | Monthly partitions of sales; documented only for the sale-time buyer | reads |
| store_registration | `produtocomplemento` | One row per product and store: status, prices, costs, stock | no |
| packaging_type | `tipoembalagem` | Sales unit | no |
| product_family | `familiaproduto` | Price/offer family | no |
| barcode | `produtoautomacao` | Barcodes, one or more per product | no |
| supplier_link | `produtofornecedor` | Purchasing links to suppliers | no |
| brand | `marca` | Brand registration (empty) | no |
| merchandise_type | `tipomercadoria` | Fiscal PIS/COFINS nature | no |

### Relationships

Read from the first entity to the second. "Verified" means a declared foreign key whose data was checked; "validated" an undeclared relationship supported by data checks and existing usage.

| Relationship | Join | Cardinality | Status | Evidence and meaning |
| --- | --- | --- | --- | --- |
| product → classification node | `mercadologico1..5` = `mercadologico1..5` | many-to-one, required | verified, high | Composite key `pk_mercadologico`; every product matches one node (`un_mercadologico`); almost all products are classified at level 5, a handful at level 3; node code shape holds for every node |
| product → section (level-1 node) | `mercadologico1` = `mercadologico1` and `nivel = 1` | many-to-one, required | validated, high | One level-1 node per code; used by the sales reference SQL and PDT Connect |
| classification node → cost center | `id_centrocusto` = `id` | many-to-one, optional | verified, high | `fk_id_centrocusto`; set only on level-1 nodes (17 of 21), always to level-3 cost centers; several sections share a cost center |
| product → buyer | `id_comprador` = `id` | many-to-one, required | verified, high | `fk_id_comprador`, NOT NULL; one buyer record is a default placeholder |
| sale → buyer | `venda.id_comprador` = `id` | many-to-one, optional | validated, high | No constraint; equals the product's buyer on every 2026-10 sale but differs for a few products in 2025-10 sales after reassignment: a sale-time snapshot, not the product's buyer |
| product → supplier company | `id_fornecedorfabricante` = `id` | many-to-one, required | verified, low (meaning) | `fk_id_fornecedorfabricante`; products of one brand point to several distributors and many to a placeholder partner, so it is not a manufacturer |
| product → packaging type | `id_tipoembalagem` = `id` | many-to-one, required | verified, high | Roughly a tenth of products are KG; KG packaging and the "pesável" flag differ |
| product → price family | `id_familiaproduto` = `id` | many-to-one, optional | verified, high | About a quarter of products belong to a family |
| product → barcodes | `id` = `produtoautomacao.id_produto` | one-to-many, required | verified, high | Every product has at least one; some have many |
| product → store registrations | `id` = `produtocomplemento.id_produto` | one-to-many, required | verified, high | One row per store for every product; PDT Connect treats `id_situacaocadastro = 1` as active |
| product → supplier links | `id` = `produtofornecedor.id_produto` | one-to-many, optional | verified, high | About half of the products have links |
| product → brand | `id_marca` = `id` | — | rejected | Declared but unused: no product sets it |
| product → merchandise type | `id_tipomercadoria` = `id` | — | rejected | Fiscal nature; one value covers over 90% of products |

Fiscal classifications (`ncm`, `cest`) are declared but not modeled: they are tax codes, not business categories, and no request needs them yet. The catalog check lists 366 further foreign keys that touch these tables, almost all transactional history referencing the product (notes, orders, stock, logs); none is exposed.

### Observations that shape answers

- The mercadológico has 21 level-1, 208 level-2, 1,622 level-3, 5,200 level-4 and 8,914 level-5 nodes. Deeper levels frequently hold brands and package sizes, sometimes producer names.
- Cost center SECOS is assigned to 13 sections, including two named INATIVO and FEIRA INATIVO; four sections have no cost center. A level-2 cost center and its level-3 child often share a name; a name therefore resolves to the subtree.
- Nodes named `MP …` or `MATERIA PRIMA` hold production inputs of bakery, butchery and rotisserie (fresh bananas used as ingredients, for example).
- Nodes named INATIVO group retired registrations by convention, but about a third of their products are still active in a store, while many products elsewhere are active in none. Only per-store registration states activity.
- The classification can be wrong for individual products: the live regression found a product of another brand filed under a brand node.
- Indexes support the executed shapes: subtree membership and section lookups take milliseconds; the combined cost center and buyer case took 26 ms in `EXPLAIN ANALYZE`; candidate retrieval for a classification takes about one second.

## Interpretation

- **Categories.** The person's concept ("banana") and its qualifier ("fruta") are kept apart. The model chooses among real nodes found by name, their children and nodes whose product descriptions mention the words. With "fruta", "in natura" or "fresca" it keeps the product itself and leaves out flavored, processed and prepared products. Raw-material and inactive-classification nodes are included only when asked. Without a qualifier, when the word covers clearly different kinds, the person chooses between numbered interpretations, typically the product itself or every product mentioning the word.
- **Cost centers** follow the section of each product, including sub-centers; the answer says so.
- **Buyers** are the registered buyer of each product. Names are matched by the application from the person's words (whole words); several matches, or none, become numbered options.
- **Combinations.** Different dimensions combine with AND. Two values of one single-valued dimension ("do comprador A ou do B", "banana e maçã") are a union; overlapping classifications ("mercearia" and "doces") intersect. Exclusions remove subtrees or records; including and excluding the same thing is asked about.
- **Answers** state every criterion with its resolved records or classification paths, exclusions and business rule, counts per section, notes (inactive products not yet distinguishable; products under inactive classifications; raw materials included) and up to 200 products in alphabetical order with the exact total.

## Required scenarios and results

Live runs on 2026-10-11 used the real VR Master through the restricted account and the configured model (`gpt-6.1-sol`). "Equal" means the resolver's complete selection equals the set of an independent hand-written SQL query; no record values are recorded here.

| Scenario | Result |
| --- | --- |
| A — "Quais produtos são banana fruta?" | The five fresh bananas under FLV › FRUTAS › BANANA, without its chips node; snacks, yogurts, sweets, a sunscreen brand and the two raw-material bananas excluded. Equal. This classification is the regression reference for "banana fruta"; no earlier classification existed in the repository. |
| B — cost center SECOS | 19,091 products of the 13 sections linked to SECOS (sub-center included). Equal. |
| C — products of a buyer named in the question | The first name matched exactly one active buyer. Equal. |
| D — cost center SECOS and that buyer | 487 products. Equal. |
| E — hierarchies, synonyms, attributes, exclusions | Mercearia without sweets (sweet corn kept), hortifrúti (FLV) that are pesáveis, raw-material bananas only (2), a brand within a category, two buyers as a union, refinement of a buyer, two buyers with similar first names kept apart, a literal description, cost center with category exclusions, an ambiguous word answered with an option number (no second model call), a contradiction, an unknown name with options, and unavailable or out-of-scope requests: all as expected. |

The final acceptance-preparation [live regression](../architecture/semantic-product-resolution.md#maintaining-the-catalog) passed 24 of 24 turns with the shared 30-second product request budget and zero provider retries. The catalog check reported no difference from the live schema, grants or invariants. The restricted VR reader has no superuser, database/role creation, replication or row-security bypass privileges, owns no public tables, and has no writable public tables; its default transactions are read-only with a 30-second statement timeout. These are dated observations of the configured account, not a replacement for catalog verification after grants change.

## Privacy and data flow

Product descriptions, classifications, buyers and results are CONFIDENTIAL; buyer names are personal data. The model receives the person's messages, application replies, dimension meanings and, to choose classifications, classification paths, counts and up to three example product descriptions per candidate; never buyer names, prices, costs, stock, sales, table names or credentials. Requests use `store:false`, which does not establish zero provider retention. Options holding personal data appear only in the structured result. Traces follow the [AI tracing levels](../architecture/ai-interpretation.md#ai-tracing-and-observability). No product data is committed: the regression dataset with real codes stays in the ignored local folder.

## Limits and open questions

- Lists include inactive products until per-store status is readable ([PH-27](../project/human-actions.md#ph-27)); the answer says so.
- Whether sections named INATIVO count under SECOS, what "fabricante" should mean, the operational meaning of "pesável" and whether provider links should grant product permissions (SNK-PRD-01, VRM-PRD-01) automatically are owner decisions ([PH-28](../project/human-actions.md#ph-28)).
- Model judgment can differ between runs for borderline products and is shown in the answer; transient provider errors fail the turn (observed in a few percent of calls during the 2026-10-11 runs); a classification criterion makes two model calls.
- Product lookup can feed [semantic sales selections](sales-chat.md#semantic-product-selections) with both permissions. An explicit "desses produtos" reuses the same ERP's completed selection; qualified concepts can also be resolved directly inside sales. Current registration membership does not reconstruct historical classification/responsibility.

## Verification

Unit, synthetic-PostgreSQL, evaluation and browser checks are listed in [semantic product resolution](../architecture/semantic-product-resolution.md#verification). On 2026-10-11 the earlier live curated evaluation passed 49 of 49 cases (72 turns). Acceptance preparation then passed all six product-routing cases/seven turns with zero retries, including the verified FLV synonym and both ERP routes.

The complete `pnpm validate` passed in the actual working tree on 2026-10-11: 383 API tests, 63 web unit tests, 12 browser component tests, 35 end-to-end journeys, builds, bundle checks, internal-HTTPS smoke and all static/reference checks. Installed Git OpenSSL was added only to that validation process PATH. All 83 focused resolver tests passed, including real module composition over disposable PostgreSQL with authenticated HTTP, permission denial before ERP access, both adapters, source-scoped persistence and idempotent replay. The browser suite uses synthetic identities and ERP data. It exposed a real permission UI bug: the controlled checkbox's value was read after asynchronous execution; capturing it before execution fixed grant/revoke persistence, with all ten identity journeys passing across Vite and built serving. No real user's grants were changed.

Documentation discovery now follows the portal's Git scope: tracked and non-ignored new Markdown, with no symlink/junction redirects. Two source-validator tests cover private-note exclusion, tracked files even when newly ignored, new public documents, tracked deletions and redirected directories. The original 128 pending implementation files remain present; ignored private notes and `.env.local` were not edited. The existing application database was started without replacing its users or settings. The local API and web return success, and anonymous conversation access remains 401. This verifies availability and authentication boundaries, not real authenticated UI acceptance. No ERP database was modified, no remote CI or deployment was run, and PH-08/PH-29 remain open.
