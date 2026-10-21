# MNS (Sankhya): sales

<!-- Generated offline by apps/api/scripts/feature-reference.ts from production query compilers and catalogs. Run pnpm -C apps/api references:write; do not edit. -->

[Feature catalog](../../../features/README.md) · [Product filters](products.md) · [Sales behavior](../../../domains/sales-chat.md)

## What it does

Vendas confirmadas, sem devoluções e sem vendas bonificadas; data de negociação (DTNEG).

Quantidades separadas por unidade do ERP; unidades diferentes não são somadas.

Peso calculado por QTDNEG × PESOLIQ, na unidade cadastrada no ERP.

Há produtos sem PESOLIQ positivo; o peso pode estar incompleto.

Permission: `SNK-VEN-01` (`sales_sankhya:read`). Availability depends on the configured Runtime reader and the person's effective permission.

## Request options

| Option | Accepted values / behavior |
| --- | --- |
| Source | Explicit selector: Sankhya, VR Master or Tudo. Tudo keeps separate results; it does not merge ERP rows or product IDs. |
| Dates | Inclusive startDate/endDate; valid dates from 2000-01-01, at most 366 days, no future dates (America/Sao_Paulo). SQL uses an exclusive next-day upper bound. |
| Relative periods | Current or previous day/month/year; last N days or completed months (includeCurrent controls the current block); calendar month with optional year; calendar year; explicit range. Started periods are clamped to today. |
| Measure | `net_value` (Valor líquido vendido); `quantity` (Quantidade vendida); `weight` (Peso vendido). |
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
| `weight` | `total` | [View SQL](sales-weight-total.md) |
| `weight` | `month` | [View SQL](sales-weight-month.md) |
| `weight` | `product` | [View SQL](sales-weight-product.md) |
| `weight` | `month_product` | [View SQL](sales-weight-month_product.md) |

## Literal product bindings

Synthetic phrase example. The compiler supplies both the normalized phrase and its escaped whole-word pattern; use these values together rather than writing your own regex.

```json
{
  "startDate": "2026-01-01",
  "endDate": "2026-01-31",
  "productSearch": "ARROZ",
  "productPattern": "(^|[^[:alnum:]])ARROZ([^[:alnum:]]|$)"
}
```

## Comparison bindings

The reader runs the same compiled statement for the current interval and, when requested, the interval below. Product membership and access restrictions apply to both.
### previous_year

```json
{
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "productSearch": null,
  "productPattern": null
}
```

### previous_period

```json
{
  "startDate": "2025-12-01",
  "endDate": "2025-12-31",
  "productSearch": null,
  "productPattern": null
}
```

## Effective access restrictions

These are owner-assigned permission conditions, not additional freely selectable chat filters. Conditions within one rule are ANDed; alternative grant rules are ORed. An unrestricted grant admits every row. The examples below use fictional ID 1 and show isolated predicates; the runtime injects them into the reference before aggregation and binds their values. Sankhya applies the same predicate to eligible lot controls and final sales; VR Master applies it in base. The final VR Master parameter offset follows any semantic product binds, so it can be greater than 4.

Sankhya result-center selection additionally depends on [PH-36](../../../project/human-actions.md#ph-36). Read [access semantics](../../../domains/sales-chat.md#access-and-restrictions) before interpreting a restricted total.

### EMP: Empresa

Empresa da nota (CODEMP).

Hierarchy descendants: not applicable.

```sql
((CAB.CODEMP IN (:acc_0_0_0)))
```


```json
{
  "acc_0_0_0": 1
}
```

### PRJ: Projeto (setor)

Projeto informado no item vendido (AD_CODPROJ), apresentado como setor na referência de vendas; inclui os subprojetos. O projeto 0 reúne os itens sem projeto.

Hierarchy descendants: included.

```sql
((NVL(ITE.AD_CODPROJ, 0) IN (SELECT RP.CODPROJ FROM TCSPRJ RP START WITH RP.CODPROJ IN (:acc_0_0_0) CONNECT BY NOCYCLE PRIOR RP.CODPROJ = RP.CODPROJPAI)))
```


```json
{
  "acc_0_0_0": 1
}
```

### VEN: Vendedor

Vendedor da nota (CODVEND). O código 0 reúne as vendas sem vendedor.

Hierarchy descendants: not applicable.

```sql
((CAB.CODVEND IN (:acc_0_0_0)))
```


```json
{
  "acc_0_0_0": 1
}
```

### GRP: Grupo de produto

Grupo do produto vendido (CODGRUPOPROD); inclui os subgrupos.

Hierarchy descendants: included.

```sql
((PRO.CODGRUPOPROD IN (SELECT RG.CODGRUPOPROD FROM TGFGRU RG START WITH RG.CODGRUPOPROD IN (:acc_0_0_0) CONNECT BY NOCYCLE PRIOR RG.CODGRUPOPROD = RG.CODGRUPAI)))
```


```json
{
  "acc_0_0_0": 1
}
```

### CR: Centro de resultado

Centro de resultado da nota (CODCENCUS); inclui os centros abaixo dele.

Hierarchy descendants: included.

```sql
((CAB.CODCENCUS IN (SELECT RC.CODCENCUS FROM TSICUS RC START WITH RC.CODCENCUS IN (:acc_0_0_0) CONNECT BY NOCYCLE PRIOR RC.CODCENCUS = RC.CODCENCUSPAI)))
```


```json
{
  "acc_0_0_0": 1
}
```

## Semantic product membership

The product resolver compiles a complete key subquery from the enabled catalog filters. Sales adds PRO.CODPROD IN (subquery) in both Sankhya selections, or produto.id IN (subquery) in VR Master's base. This selects all eligible products, not only the visible preview. It uses current registration membership for both time periods. It cannot reconstruct historical buyer or category responsibility. Literal product search and a semantic selection cannot be combined in one read.

## Canonical implementation

[SQL compiler](../../../../apps/api/src/features/sales/query.ts)
