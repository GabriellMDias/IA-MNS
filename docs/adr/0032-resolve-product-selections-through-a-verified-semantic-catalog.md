# ADR-0032: Resolve Product Selections through a Verified Semantic Catalog

**Status:** accepted
**Date:** 2026-10-11
**Extends:** [ADR-0018](0018-bound-natural-language-sales-to-a-read-only-query-capability.md) (no arbitrary SQL, read-only ERP access), [ADR-0024](0024-interpret-analytics-through-structured-state-and-evaluate-ai-behavior.md) (structured interpretation through the model port) and [ADR-0027](0027-select-the-sales-source-in-the-interface-and-read-each-source-separately.md) (the interface selects the source).

## Context

On 2026-10-11 the owner asked for a reusable component that identifies products of the VR Master (Pilar da Terra) registration from Portuguese requests such as "Quais produtos são banana fruta?", "Quais produtos são do centro de custo SECOS?" and which products belong to a buyer named in the question, without enumerating every filter or relationship by hand, and without letting a model run SQL against the ERP. The sales capability matches a literal description phrase only; it cannot tell fresh bananas from banana yogurt, and has no notion of cost centers or buyers.

A read-only investigation of the real database on 2026-10-11 found that the answers depend on relationships that are not obvious from column names: cost centers are attached only to the level-1 node of the five-level mercadológico, not to products; the product's buyer is a column of the product registration, while `venda.id_comprador` is a snapshot taken at sale time; the column named "fornecedor fabricante" holds distributors and a placeholder rather than manufacturers; per-store status, barcodes and packaging live in tables the runtime account cannot read. The owner also wants a future Sankhya adapter without redesigning the resolver.

## Decision

IA-MNS identifies products through a **semantic catalog** and a resolver with an ERP adapter:

- Each ERP adapter supplies a typed, machine-readable catalog (`apps/api/src/features/products/vrmaster/catalog.ts`) of entities, columns with their discovered types, relationships with join columns, direction, cardinality, optionality, evidence (declared constraint, data validation, existing usage), status (`verified`, `validated`, `hypothesis`, `rejected`) and confidence, hierarchies, business dimensions with Portuguese meanings and synonyms, and value conventions. A dimension is usable only when it is `enabled`, every relationship on its path is verified or validated, and the runtime account can read every table on it. The catalog's integrity is checked when it loads, and its required columns, types, nullability and privileges are checked against the live database before the first statement of a process and every ten minutes; any mismatch fails closed.
- The model reads the request with one strict tool whose dimension ids come from the catalog, and, for classifications, chooses among numbered **real candidate nodes** the application retrieved (with their paths, counts and up to three example descriptions) with a second strict tool. Named records (buyers, cost centers) are matched by the application from the person's own words, never by the model. Every value is grounded in the person's text, resolved to ERP records, merged, checked for contradictions and executed by the application.
- The adapter compiles the validated selection to parameterized SQL using only catalog identifiers: the outer query reads only the product table, every relationship is a semi-join, so one-to-many paths cannot duplicate products, and exclusions are null-safe. Each request runs in a read-only, rolled-back transaction with the existing VR Master limits; lists are bounded to 200 products with an exact total.
- Product lookup is a separate corporate-agent capability (`products`, permission `products:read`, granted automatically to no provider until the owner decides) that identifies products and never calculates sales. Its answer states, for every criterion, the records or classification paths it resolved to and the business rule of the relationship. It runs only when the interface selects Pilar da Terra (VR Master) or Tudo.
- Classification paths, product counts and up to three example product descriptions per candidate may be sent to OpenAI to choose among candidates. Buyer names and other personal data, prices, costs, stock and sales never are: options that hold personal data appear only in the structured result, and the model sees a placeholder.

## Rationale

Selecting among enumerated, real candidates keeps the model's strength (understanding that "banana fruta" excludes chips, yogurts and raw materials) while the application keeps every guarantee: no free text reaches SQL, every value is an ERP record or a bound literal, and every interpretation is visible to the person. The live regression on 2026-10-11 confirmed that the model, given the candidates, chose the fresh-banana nodes, kept sweet corn out of "doces", and excluded a product of another brand misfiled under a brand node; the same model asked for clarification when "banana" had different kinds.

Encoding the relationships with their evidence, rather than letting a model infer joins from schema names, is what prevents wrong answers that look plausible: a product-level cost center or a manufacturer column would have produced complete but false lists. Keeping the catalog as code gives it type checking, review and a single deployable source; verifying it against the live schema protects against ERP upgrades.

Classification labels are product catalog data, not personal, customer or financial data; sending a bounded sample is the smallest input that lets the model judge candidates such as a node named after a producer. Buyer resolution needs no model judgment, so names stay inside IA-MNS.

## Alternatives Considered

### Model-generated SQL over the schema

Rejected: it contradicts ADR-0018, cannot be validated reliably, and would still need the relationship knowledge above to be correct.

### Literal description matching only (the sales approach)

Rejected as the general mechanism: "banana" matches yogurts, candies, sunscreen and raw materials, and description text cannot express cost centers or buyers. It remains a dimension (`description`) and the fallback the person can choose.

### Embeddings or a vector database

Not adopted: the classification already encodes the product taxonomy, candidate retrieval over it is fast (about one second on the real data) and exact, and no measured case required semantic search beyond what the model does among candidates. It would add infrastructure and a second copy of ERP data.

### A catalog generated automatically from foreign keys

Rejected as the runtime source: the investigation found a declared-but-unused brand column, a fiscal column that looks like a classification and an undeclared relationship that is only a snapshot. Discovery is automated (`products:catalog` lists unreviewed foreign keys and checks invariants), but exposure requires review.

## Consequences

### Positive

- New product questions combine verified dimensions without new SQL; adding a dimension is a reviewed catalog change plus tests.
- The resolver core (catalog model, interpretation, state, grounding, merge, answers) is ERP-neutral; a Sankhya adapter adds a catalog and an Oracle compiler and source behind the same port.
- Answers explain the relationship used, so a business reader can check or correct the interpretation.

### Negative

- Two model calls per classification criterion: turns take about 3 to 20 seconds on the real data; transient provider errors fail the turn, as other model calls do, without automatic retries.
- The catalog must be maintained when the ERP changes; a changed column disables the capability until reviewed.
- Product descriptions and classification labels now reach the model provider under `store:false`, which does not establish zero provider retention.
- Results include inactive products until the per-store status becomes readable, and model judgment can differ between runs for borderline products; both are stated in the answer and in the documentation.

### Operational or Migration Impact

- The agent reply contract gains two additive result kinds and two progress stages; earlier stored replies are unchanged.
- A new permission `products:read` exists; owners receive it, other people need an explicit grant until the owner decides on provider grants.
- Enabling store status, packaging or family requires column-level SELECT grants on the VR Master tables named in the human actions, then validation and a catalog change.

## References

- [Product lookup](../domains/product-lookup.md) and [semantic product resolution](../architecture/semantic-product-resolution.md)
- [AI interpretation](../architecture/ai-interpretation.md), [sales capability](../domains/sales-chat.md), [corporate agent](../domains/corporate-agent.md)
- [Data classification](../security/data-classification.md)
