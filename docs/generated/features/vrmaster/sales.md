# Pilar da Terra (VR Master): sales

<!-- Generated offline by apps/api/scripts/feature-reference.ts from production query compilers and catalogs. Run pnpm -C apps/api references:write; do not edit. -->

[Feature catalog](../../../features/README.md) · [Product filters](products.md) · [Sales behavior](../../../domains/sales-chat.md)

## What it does

Vendas registradas no VR Master (tabela venda, todas as lojas), pela data da venda; valor = soma de valortotal.

Quantidades separadas pelo tipo de embalagem do produto; tipos diferentes não são somados.

Permission: `VRM-VEN-01` (`sales_vrmaster:read`). Availability depends on the configured Runtime reader and the person's effective permission.

## Request options

| Option | Accepted values / behavior |
| --- | --- |
| Source | Explicit selector: Sankhya, VR Master or Tudo. Tudo keeps separate results; it does not merge ERP rows or product IDs. |
| Dates | Inclusive startDate/endDate; valid dates from 2000-01-01, at most 366 days, no future dates (America/Sao_Paulo). SQL uses an exclusive next-day upper bound. |
| Relative periods | Current or previous day/month/year; last N days or completed months (includeCurrent controls the current block); calendar month with optional year; calendar year; explicit range. Started periods are clamped to today. |
| Measure | `net_value` (Valor total vendido); `quantity` (Quantidade vendida). |
| Grouping | `total`, `month`, `product`, `month_product`. Quantities always retain their unit/packaging partition. |
| Comparison | `none`, `previous_year`, `previous_period`. previous_period means the preceding equal number of days; previous_year clamps leap day. |
| Literal product | productSearch = null for all products, or a trimmed phrase of 2–80 characters. Whole words, case/accent insensitive; regex metacharacters are escaped. This is not a product ID or arbitrary SQL filter. |
| Semantic products | Resolve or reuse a verified selection from the same ERP; AND between criteria, include/exclude, hierarchy descendants. Requires the source's product permission too. See Product filters. |
| Multiple measures | The analytical tool accepts 1–3 distinct supported measures, sharing dates, grouping, product selection and comparison. It uses the same SQL compilers. |

Default measure: net_value; grouping: total; comparison: none. The period must be supplied or clarified. A completed analysis is limited to 500 aggregate rows; the SQL fetches 501 to detect overflow. The matching-product preview fetches 101 to detect a list above 100; it never limits the semantic membership used for totals.

## Complete SQL by measure and grouping

Open a combination to inspect, copy or download its complete SQL and parameter example. Fixed joins, DISTINCT and business exclusions remain visible in every statement.

| Measure | Grouping | Statement |
| --- | --- | --- |
| `net_value` | `total` | [View SQL](sales-net_value-total.md) |
| `net_value` | `month` | [View SQL](sales-net_value-month.md) |
| `net_value` | `product` | [View SQL](sales-net_value-product.md) |
| `net_value` | `month_product` | [View SQL](sales-net_value-month_product.md) |
| `quantity` | `total` | [View SQL](sales-quantity-total.md) |
| `quantity` | `month` | [View SQL](sales-quantity-month.md) |
| `quantity` | `product` | [View SQL](sales-quantity-product.md) |
| `quantity` | `month_product` | [View SQL](sales-quantity-month_product.md) |

## Literal product bindings

Synthetic phrase example. The compiler supplies both the normalized phrase and its escaped whole-word pattern; use these values together rather than writing your own regex.

```json
[
  "2026-01-01",
  "2026-01-31",
  "ARROZ",
  "(^|[^[:alnum:]])ARROZ([^[:alnum:]]|$)"
]
```

## Comparison bindings

The reader runs the same compiled statement for the current interval and, when requested, the interval below. Product membership and access restrictions apply to both.
### previous_year

```json
[
  "2025-01-01",
  "2025-01-31",
  null,
  null
]
```

### previous_period

```json
[
  "2025-12-01",
  "2025-12-31",
  null,
  null
]
```

## Effective access restrictions

These are owner-assigned permission conditions, not additional freely selectable chat filters. Conditions within one rule are ANDed; alternative grant rules are ORed. An unrestricted grant admits every row. The examples below use fictional ID 1 and show isolated predicates; the runtime injects them into the reference before aggregation and binds their values. Sankhya applies the same predicate to eligible lot controls and final sales; VR Master applies it in base. The final VR Master parameter offset follows any semantic product binds, so it can be greater than 4.

Sankhya result-center selection additionally depends on [PH-36](../../../project/human-actions.md#ph-36). Read [access semantics](../../../domains/sales-chat.md#access-and-restrictions) before interpreting a restricted total.

### LOJ: Loja

Loja da venda (id_loja).

Hierarchy descendants: not applicable.

```sql
((venda.id_loja = ANY($5::int[])))
```


```json
[
  [
    1
  ]
]
```

### COM: Comprador

Comprador registrado na venda (id_comprador), como o PDT Connect usa nos indicadores de compradores; não é o comprador atual do cadastro.

Hierarchy descendants: not applicable.

```sql
((venda.id_comprador = ANY($5::int[])))
```


```json
[
  [
    1
  ]
]
```

### CC: Centro de custo

Centro de custo da seção (nível 1 do mercadológico) do produto vendido; inclui os centros abaixo dele. Produtos de seções sem centro de custo ficam fora.

Hierarchy descendants: included.

```sql
((m.id_centrocusto IN (SELECT rd.id FROM public.centrocusto rd JOIN public.centrocusto rs ON rs.id = ANY($5::int[]) WHERE rd.centrocusto1 = rs.centrocusto1 AND (rs.nivel < 2 OR rd.centrocusto2 = rs.centrocusto2) AND (rs.nivel < 3 OR rd.centrocusto3 = rs.centrocusto3))))
```


```json
[
  [
    1
  ]
]
```

### MER: Mercadológico

Classificação mercadológica do produto vendido, em qualquer nível (seção, grupo, subgrupo...); inclui os níveis abaixo dela.

Hierarchy descendants: included.

```sql
((EXISTS (SELECT 1 FROM public.mercadologico rm WHERE rm.id = ANY($5::int[]) AND rm.mercadologico1 = produto.mercadologico1 AND (rm.nivel < 2 OR rm.mercadologico2 = produto.mercadologico2) AND (rm.nivel < 3 OR rm.mercadologico3 = produto.mercadologico3) AND (rm.nivel < 4 OR rm.mercadologico4 = produto.mercadologico4) AND (rm.nivel < 5 OR rm.mercadologico5 = produto.mercadologico5))))
```


```json
[
  [
    1
  ]
]
```

## Semantic product membership

The product resolver compiles a complete key subquery from the enabled catalog filters. Sales adds PRO.CODPROD IN (subquery) in both Sankhya selections, or produto.id IN (subquery) in VR Master's base. This selects all eligible products, not only the visible preview. It uses current registration membership for both time periods. It cannot reconstruct historical buyer or category responsibility. Literal product search and a semantic selection cannot be combined in one read.

## Canonical implementation

[SQL compiler](../../../../apps/api/src/features/sales/vrmaster-query.ts)
