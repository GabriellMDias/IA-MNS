# MNS (Sankhya): product lookup and filters

<!-- Generated offline by apps/api/scripts/feature-reference.ts from production query compilers and catalogs. Run pnpm -C apps/api references:write; do not edit. -->

[Feature catalog](../../../features/README.md) · [Sales](sales.md) · [Semantic resolution](../../../architecture/semantic-product-resolution.md)

## What it does

Finds unique registered products through verified catalog relationships, explains the interpretation and returns a bounded preview plus a complete count. The same selection can constrain sales from this ERP. It does not query stock, prices, costs or margins. Choosing Tudo asks for one ERP for product resolution; catalogs and identifiers stay separate.

Catalog version: `sankhya-products/2026-10-11.1`. Metadata verified on 2026-10-11; these are reviewed catalog facts, not a live database availability check.

## All catalog filters

Only enabled dimensions can execute. Each criterion supports include/exclude; criteria combine with AND, values within a criterion with OR. Hierarchies include descendants; ambiguous names require a choice. Values are discovered at request time rather than copied into documentation. Pending or unavailable dimensions below are visible for diagnosis and cannot be activated by wording a prompt differently.

| ID | Name | Kind | Status | Meaning | Interpretation / blocker |
| --- | --- | --- | --- | --- | --- |
| `category` | grupo de produtos | hierarchy | enabled | Tipo ou categoria de produto na árvore de grupos; inclui todos os subgrupos. Marcas possuem dimensão própria. | Grupo cadastrado no produto e todos os seus descendentes, conforme a relação explícita entre grupos. |
| `brand` | marca cadastrada | entity | enabled | Marca do cadastro de marcas selecionada no produto. Não equivale ao texto livre de marca. | Marca registrada vinculada ao produto; o campo de texto livre não substitui esse vínculo. |
| `unit` | unidade base | entity | enabled | Unidade de medida principal do cadastro do produto (como KG, quilo ou unidade). | Unidade principal do produto; não converte quantidades nem indica pesagem. |
| `purchase_unit` | unidade de compra | entity | enabled | Unidade de compra cadastrada no produto, que pode diferir da unidade principal. | Unidade de compra indicada no cadastro atual. |
| `alternate_unit` | unidade alternativa | entity | enabled | Produtos que possuem cadastro na unidade alternativa informada, incluindo cadastros ativos e inativos. | Existe ao menos um cadastro da unidade alternativa, independentemente do controle e da situação; cada produto aparece uma vez. |
| `supplier` | fornecedor vinculado | entity | enabled | Fornecedor associado ao produto no cadastro de relacionamento com parceiros. Não é o fornecedor preferencial nem histórico de compras. | Parceiro fornecedor do cadastro de relacionamento produto-parceiro; não representa compra realizada nem fornecedor preferencial. |
| `usage` | uso do produto | entity | enabled | Uso cadastral: revenda, consumo, matéria prima, embalagem ou outros valores oficialmente descritos no dicionário. | Valor literal do uso do produto; valores sem descrição no dicionário não são inferidos. |
| `active` | ativo | flag | enabled | Indicador de produto ativo no cadastro, sem situação por empresa ou loja. | Indicador de ativo do cadastro do produto, sem interpretar disponibilidade de estoque. |
| `description` | descrição | text | enabled | Frase literal na descrição do produto. | Frase da descrição, como palavras inteiras, sem distinguir acentos e maiúsculas. |
| `characteristics` | características | text | enabled | Texto literal no campo de características do produto; não equivale à descrição. | Texto literal nas características registradas; conteúdo ausente permanece ausente. |
| `epi_certificate` | certificado EPI | text | enabled | Texto ou número literal do certificado de aprovação de EPI no campo adicional do produto. | Valor literal do campo adicional de CA E.P.I.; não certifica validade legal ou vigência. |
| `packaging_list` | lista de embalagem adicional | entity | enabled | Lista adicional de embalagem atribuída ao grupo imediato do produto. Não herda dos grupos superiores. | Lista adicional cadastrada diretamente no grupo do produto; não calcula preços nem descontos. |
| `classification` | classificação adicional | entity | pending_validation | Classificação adicional de produtos, distinta da árvore de grupos. | Classificações associadas ao produto. Blocker: The classification tables are empty; no nonempty business scenario can be validated. |
| `buyer` | comprador | text | pending_validation | Comprador responsável pelo produto, quando esse vínculo estiver validado. | Comprador responsável pelo cadastro. Blocker: No product-to-buyer mapping was found; the custom last-editing user is not a buyer. |

## Value options

Entity and hierarchy choices come from the selected ERP at request time. The static dictionary domains and flag encodings below come from the reviewed catalog. Up to eight resolved criteria can be combined. A description criterion is a literal phrase; it is not free-form SQL or a regular expression supplied by the caller.

| Filter | Value options |
| --- | --- |
| `category` | Resolved ERP records/nodes; ambiguous values require clarification |
| `brand` | Resolved ERP records/nodes; ambiguous values require clarification |
| `unit` | Resolved ERP records/nodes; ambiguous values require clarification |
| `purchase_unit` | Resolved ERP records/nodes; ambiguous values require clarification |
| `alternate_unit` | Resolved ERP records/nodes; ambiguous values require clarification |
| `supplier` | Resolved ERP records/nodes; ambiguous values require clarification |
| `usage` | 1: Subproduto; 2: Prod.Intermediário; 4: Demonstração; B: Brinde; C: Consumo; D: Revenda (por fórmula); E: Embalagem; F: Brinde (NF); I: Imobilizado; M: Matéria prima; O: Outros insumos; P: Em Processo; R: Revenda; T: Terceiros; V: Venda (fabricação própria) |
| `active` | include/exclude; stored true value = S |
| `description` | Literal description phrase |
| `characteristics` | Literal description phrase |
| `epi_certificate` | Literal description phrase |
| `packaging_list` | Resolved ERP records/nodes; ambiguous values require clarification |
| `classification` | Resolved ERP records/nodes; ambiguous values require clarification |
| `buyer` | Literal description phrase |

## Filter SQL mappings

These are the reviewed paths used by the adapters. The model supplies a typed selection; the adapter chooses identifiers and binds values. The paths below are catalog relationship IDs, in traversal order; root attributes need no join. Oracle's logical erp schema resolves through the Runtime reader's private synonyms.

| Entity | Table | Key | Label |
| --- | --- | --- | --- |
| `product` | `erp.tgfpro` | codprod | descrprod |
| `group` | `erp.tgfgru` | codgrupoprod | descrgrupoprod |
| `brand` | `erp.tgfmar` | codigo | descricao |
| `unit` | `erp.tgfvol` | codvol | descrvol |
| `alternate_unit` | `erp.tgfvoa` | codprod, codvol, controle | none |
| `classification_link` | `erp.tgfclp` | codprod, codclassif | none |
| `classification` | `erp.tgfcla` | codclassif | descricao |
| `partner_link` | `erp.tgfpap` | codparc, codprod, sequencia | none |
| `partner` | `erp.tgfpar` | codparc | nomeparc |
| `cost_center` | `erp.tsicus` | codcencus | descrcencus |
| `packaging_list` | `erp.ad_listadcemb` | codlista | descrlista |

| Filter | Path | Entity / columns |
| --- | --- | --- |
| `category` | `product_group` | group / descrgrupoprod |
| `brand` | `product_brand` | brand / descricao |
| `unit` | `product_unit` | unit / codvol / descrvol |
| `purchase_unit` | `product_purchase_unit` | unit / codvol / descrvol |
| `alternate_unit` | `product_alternate_units` → `alternate_unit_unit` | unit / codvol / descrvol |
| `supplier` | `product_partner_links` → `linked_partner` | partner / nomeparc |
| `usage` | root | product / usoprod |
| `active` | root | product / ativo |
| `description` | root | product / descrprod |
| `characteristics` | root | product / caracteristicas |
| `epi_certificate` | root | product / ad_ca |
| `packaging_list` | `product_group` → `group_packaging_list` | packaging_list / descrlista |
| `classification` | `product_classifications` → `classification_label` | classification / descricao |
| `buyer` | root | product / descrprod |

| Relationship | Join | Status | Meaning |
| --- | --- | --- | --- |
| `product_group` | product.codgrupoprod = group.codgrupoprod | verified | Product's registered group. |
| `product_brand` | product.codmarca = brand.codigo | verified | Registered brand, when assigned. |
| `product_unit` | product.codvol = unit.codvol | verified | Product's base unit. |
| `product_purchase_unit` | product.codvolcompra = unit.codvol | verified | Purchase unit, independently from base unit. |
| `product_alternate_units` | product.codprod = alternate_unit.codprod | verified | Product's alternative unit registrations, regardless of their status. |
| `alternate_unit_unit` | alternate_unit.codvol = unit.codvol | verified | Unit of an alternative-unit registration. |
| `product_classifications` | product.codprod = classification_link.codprod | verified | Product classification registrations. |
| `classification_label` | classification_link.codclassif = classification.codclassif | verified | Label of a classification registration. |
| `product_partner_links` | product.codprod = partner_link.codprod | verified | Partners associated with a product. |
| `linked_partner` | partner_link.codparc = partner.codparc | verified | The associated partner; supplier role is checked separately. |
| `group_packaging_list` | group.ad_codlistadc = packaging_list.codlista | verified | Additional-packaging list of the immediate product group, without inheritance. |

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
SELECT COUNT(*) N FROM "TGFPRO" p WHERE (CASE WHEN (REGEXP_LIKE(REGEXP_REPLACE(UPPER(TRANSLATE(p."DESCRPROD", 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[[:space:]]+', ' '), :v1)) THEN 1 ELSE 0 END = 1)
```

### Preview

```sql
SELECT * FROM (SELECT TO_CHAR(p."CODPROD") CODE, p."DESCRPROD" DESCRIPTION, p."CODGRUPOPROD" GROUP_ID FROM "TGFPRO" p WHERE (CASE WHEN (REGEXP_LIKE(REGEXP_REPLACE(UPPER(TRANSLATE(p."DESCRPROD", 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[[:space:]]+', ' '), :v1)) THEN 1 ELSE 0 END = 1) ORDER BY p."DESCRPROD", p."CODPROD") WHERE ROWNUM <= 30
```

### Bound parameters

```json
{
  "v1": "(^|[^[:alnum:]])arroz([^[:alnum:]]|$)"
}
```

## Canonical implementation

[Catalog](../../../../apps/api/src/features/products/sankhya/catalog.ts) · [SQL compiler](../../../../apps/api/src/features/products/sankhya/oracle.ts) · [Sankhya semantics](../../../domains/sankhya-product-lookup.md)
