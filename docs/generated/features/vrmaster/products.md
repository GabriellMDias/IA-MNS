# Pilar da Terra (VR Master): product lookup and filters

<!-- Generated offline by apps/api/scripts/feature-reference.ts from production query compilers and catalogs. Run pnpm -C apps/api references:write; do not edit. -->

[Feature catalog](../../../features/README.md) · [Sales](sales.md) · [Semantic resolution](../../../architecture/semantic-product-resolution.md)

## What it does

Finds unique registered products through verified catalog relationships, explains the interpretation and returns a bounded preview plus a complete count. The same selection can constrain sales from this ERP. It does not query stock, prices, costs or margins. Choosing Tudo asks for one ERP for product resolution; catalogs and identifiers stay separate.

Catalog version: `vrmaster-products/2026-10-11.2`. Metadata verified on 2026-10-11; these are reviewed catalog facts, not a live database availability check.

## All catalog filters

Only enabled dimensions can execute. Each criterion supports include/exclude; criteria combine with AND, values within a criterion with OR. Hierarchies include descendants; ambiguous names require a choice. Values are discovered at request time rather than copied into documentation. Pending or unavailable dimensions below are visible for diagnosis and cannot be activated by wording a prompt differently.

| ID | Name | Kind | Status | Meaning | Interpretation / blocker |
| --- | --- | --- | --- | --- | --- |
| `category` | classificação mercadológica | hierarchy | enabled | Classificação mercadológica do produto em até 5 níveis (seções como hortifrúti, registrado como FLV neste cadastro, ou mercearia, depois grupos, subgrupos, marcas e tamanhos). Use para tipos ou categorias de produto (por exemplo fruta, iogurte, cerveja, banana) e para marcas quando o cadastro as classifica. | Produtos classificados nos níveis do mercadológico escolhidos, incluindo os níveis abaixo deles. |
| `cost_center` | centro de custo | entity | enabled | Centro de custo ao qual a seção (nível 1 do mercadológico) do produto está vinculada. Não há centro de custo no próprio produto. | O centro de custo não é cadastrado no produto: considera-se o centro de custo vinculado à seção (nível 1 do mercadológico) de cada produto. |
| `buyer` | comprador | entity | enabled | Comprador responsável pelo produto no cadastro atual do produto (não o comprador registrado em vendas antigas). | Comprador responsável indicado no cadastro atual de cada produto. |
| `description` | descrição | text | enabled | Frase literal escrita na descrição do produto, quando a pessoa pede produtos cuja descrição contém um texto. | Produtos cuja descrição contém a frase, sem diferenciar acentos e maiúsculas, como palavras inteiras. |
| `weighable` | pesável | flag | enabled | Indicador "pesável" do cadastro do produto, como o ERP o registra. Não significa ser vendido por quilo: muitos produtos vendidos em embalagem KG não são marcados como pesáveis. | Indicador "pesável" do cadastro do produto. Não equivale a ser vendido por quilo (embalagem KG). |
| `store_status` | situação nas lojas | status | pending_validation | Produto ativo em pelo menos uma loja. | Produto com cadastro ativo em pelo menos uma loja (produtocomplemento). Blocker: PH-27 grants verified; PJ-36 must validate the path before exposing this dimension. |
| `packaging` | embalagem de venda | entity | pending_validation | Unidade de venda do produto (unidade, quilo, caixa...). | Tipo de embalagem de venda do cadastro do produto. Blocker: PH-27 grants verified; PJ-36 must validate the path before exposing this dimension. |
| `family` | família de preço | entity | pending_validation | Família do produto usada pelo ERP para preços e ofertas. | Família de preços indicada no cadastro do produto. Blocker: PH-27 grants verified; PJ-36 must validate the path before exposing this dimension. |
| `manufacturer` | fabricante | entity | pending_validation | Fabricante do produto. | Parceiro indicado como fornecedor fabricante no cadastro. Blocker: The 'fornecedor fabricante' column holds distributors and a placeholder; the owner must define what manufacturer means before use. |

## Value options

Entity and hierarchy choices come from the selected ERP at request time. The static dictionary domains and flag encodings below come from the reviewed catalog. Up to eight resolved criteria can be combined. A description criterion is a literal phrase; it is not free-form SQL or a regular expression supplied by the caller.

| Filter | Value options |
| --- | --- |
| `category` | Resolved ERP records/nodes; ambiguous values require clarification |
| `cost_center` | Resolved ERP records/nodes; ambiguous values require clarification |
| `buyer` | Resolved ERP records/nodes; ambiguous values require clarification |
| `description` | Literal description phrase |
| `weighable` | include/exclude; stored true value = true |
| `store_status` | Resolved ERP records/nodes; ambiguous values require clarification |
| `packaging` | Resolved ERP records/nodes; ambiguous values require clarification |
| `family` | Resolved ERP records/nodes; ambiguous values require clarification |
| `manufacturer` | Resolved ERP records/nodes; ambiguous values require clarification |

## Filter SQL mappings

These are the reviewed paths used by the adapters. The model supplies a typed selection; the adapter chooses identifiers and binds values. The paths below are catalog relationship IDs, in traversal order; root attributes need no join. Oracle's logical erp schema resolves through the Runtime reader's private synonyms.

| Entity | Table | Key | Label |
| --- | --- | --- | --- |
| `product` | `public.produto` | id | descricaocompleta |
| `classification_node` | `public.mercadologico` | id | descricao |
| `cost_center` | `public.centrocusto` | id | descricao |
| `buyer` | `public.comprador` | id | nome |
| `supplier_company` | `public.fornecedor` | id | nomefantasia |
| `sale` | `public.venda` | id | none |
| `packaging_type` | `public.tipoembalagem` | id | descricaocompleta |
| `product_family` | `public.familiaproduto` | id | descricao |
| `barcode` | `public.produtoautomacao` | id | none |
| `store_registration` | `public.produtocomplemento` | id | none |
| `supplier_link` | `public.produtofornecedor` | id | none |
| `brand` | `public.marca` | id | descricao |
| `merchandise_type` | `public.tipomercadoria` | id | descricao |

| Filter | Path | Entity / columns |
| --- | --- | --- |
| `category` | `product_classification` | classification_node / descricao |
| `cost_center` | `product_section` → `section_cost_center` | cost_center / descricao |
| `buyer` | `product_buyer` | buyer / nome |
| `description` | root | product / descricaocompleta |
| `weighable` | root | product / pesavel |
| `store_status` | `product_store_registrations` | store_registration |
| `packaging` | `product_packaging` | packaging_type / descricaocompleta |
| `family` | `product_family_link` | product_family / descricao |
| `manufacturer` | `product_supplier_company` | supplier_company / nomefantasia / razaosocial |

| Relationship | Join | Status | Meaning |
| --- | --- | --- | --- |
| `product_classification` | product.mercadologico1 = classification_node.mercadologico1 AND product.mercadologico2 = classification_node.mercadologico2 AND product.mercadologico3 = classification_node.mercadologico3 AND product.mercadologico4 = classification_node.mercadologico4 AND product.mercadologico5 = classification_node.mercadologico5 | verified | The product's deepest classification node; its ancestors are the nodes whose leading codes it shares. |
| `product_section` | product.mercadologico1 = classification_node.mercadologico1 | validated | The product's level-1 classification node (its top-level section). |
| `section_cost_center` | classification_node.id_centrocusto = cost_center.id | verified | Cost center assigned to a classification node. Only level-1 nodes carry it, so a product's cost center is the one of its section. |
| `product_buyer` | product.id_comprador = buyer.id | verified | The buyer currently responsible for the product in its registration. |
| `sale_buyer` | sale.id_comprador = buyer.id | validated | The product's buyer recorded on each sale when it happened (a snapshot), not the product's current buyer. |
| `product_supplier_company` | product.id_fornecedorfabricante = supplier_company.id | verified | Business partner in the column named 'fornecedor fabricante'. The data does not support reading it as the manufacturer. |
| `product_packaging` | product.id_tipoembalagem = packaging_type.id | verified | The product's sales unit (UN, KG, CX...). |
| `product_family_link` | product.id_familiaproduto = product_family.id | verified | The family the product belongs to, when any. |
| `product_barcodes` | product.id = barcode.id_produto | verified | The product's barcodes. |
| `product_store_registrations` | product.id = store_registration.id_produto | verified | The product's registration in each store, with its active or excluded status. |
| `product_supplier_links` | product.id = supplier_link.id_produto | verified | Suppliers the product is bought from. |
| `product_brand` | product.id_marca = brand.id | rejected | Declared brand column that is not used: brands appear in descriptions and often as classification nodes. |
| `product_merchandise_type` | product.id_tipomercadoria = merchandise_type.id | rejected | Fiscal merchandise nature, not a business classification: almost every product shares one value. |

## Example lookup SQL

Synthetic description-only selection; 30 visible products. The count covers the complete membership. Other criteria change the bound predicates through the catalog paths above; there is no single fixed SQL statement containing all possible filter combinations.

```json
{
  "criteria": [
    {
      "kind": "text",
      "dimension": "description",
      "mode": "include",
      "text": "arroz",
      "phrase": "arroz"
    }
  ]
}
```

### Count

```sql
SELECT count(*)::int AS count
FROM "public"."produto" p
WHERE (regexp_replace(upper(translate(p."descricaocompleta", 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[[:space:]]+', ' ', 'g') ~ $1::text) IS TRUE
```

### Preview

```sql
SELECT p."id"::text AS code, COALESCE(NULLIF(btrim(p."descricaocompleta"), ''), 'sem descrição') AS description, COALESCE((SELECT string_agg(btrim(h."descricao"), ' › ' ORDER BY h."nivel") FROM "public"."mercadologico" h WHERE h."mercadologico1" = p."mercadologico1" AND (h."nivel" < 2 OR h."mercadologico2" = p."mercadologico2") AND (h."nivel" < 3 OR h."mercadologico3" = p."mercadologico3") AND (h."nivel" < 4 OR h."mercadologico4" = p."mercadologico4") AND (h."nivel" < 5 OR h."mercadologico5" = p."mercadologico5")), '') AS classification
FROM "public"."produto" p
WHERE (regexp_replace(upper(translate(p."descricaocompleta", 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[[:space:]]+', ' ', 'g') ~ $1::text) IS TRUE
ORDER BY p."descricaocompleta", p."id"
LIMIT 31
```

### Bound parameters

```json
[
  "(^|[^[:alnum:]])arroz([^[:alnum:]]|$)"
]
```

## Canonical implementation

[Catalog](../../../../apps/api/src/features/products/vrmaster/catalog.ts) · [SQL compiler](../../../../apps/api/src/features/products/postgres.ts) · [VR Master semantics](../../../domains/product-lookup.md)
