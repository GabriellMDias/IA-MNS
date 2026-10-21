# Pilar da Terra (VR Master): net_value / total

<!-- Generated offline by apps/api/scripts/feature-reference.ts from production query compilers and catalogs. Run pnpm -C apps/api references:write; do not edit. -->

[Sales and all filters](sales.md) · [Feature catalog](../../../features/README.md)

This is the complete SQL emitted by the production compiler for the plan below, without a semantic product selection or a permission restriction. The portal offers a local SQL download and copy action. Bind the parameters before running it in your database client; the portal only reads static documentation.

## Example plan

```json
{
  "startDate": "2026-01-01",
  "endDate": "2026-01-31",
  "productSearch": null,
  "metric": "net_value",
  "groupBy": "total",
  "comparison": "none"
}
```

## Bound parameters
PostgreSQL positional binds, starting at `$1`:

```json
[
  "2026-01-01",
  "2026-01-31",
  null,
  null
]
```

## Complete SQL

```sql
WITH base AS (
  SELECT venda.id,
    venda.id_produto,
    produto.descricaocompleta AS produto,
    venda.data,
    venda.quantidade,
    venda.id_loja,
    produto.id_tipoembalagem,
    venda.valortotal
  FROM public.venda
  INNER JOIN public.produto ON venda.id_produto = produto.id
  INNER JOIN public.loja ON loja.id = venda.id_loja
  INNER JOIN public.fornecedor fl ON fl.id = loja.id_fornecedor
  INNER JOIN public.produtoaliquota pa ON pa.id_produto = venda.id_produto AND pa.id_estado = fl.id_estado
  INNER JOIN public.aliquota a ON a.id = pa.id_aliquotaconsumidor
  INNER JOIN public.mercadologico m ON m.mercadologico1 = produto.mercadologico1 AND m.nivel = 1
  LEFT JOIN public.centrocusto cc ON cc.id = m.id_centrocusto
  LEFT JOIN public.comprador ON comprador.id = venda.id_comprador
  WHERE venda.data >= $1::date
    AND venda.data < ($2::date + INTERVAL '1 day')
    AND ($3::text IS NULL OR regexp_replace(
      upper(translate(produto.descricaocompleta, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')),
      '[[:space:]]+', ' ', 'g') ~ $4::text)
)
SELECT 'total' AS period, NULL::text AS product, 'BRL' AS unit,
  COALESCE(SUM(base.valortotal::numeric), 0)::text AS value
FROM base
GROUP BY 1, 2, 3
HAVING COUNT(*) > 0
ORDER BY 1, 2, 3
LIMIT 501
```

## Diagnose a difference

Match the source, dates, measure, grouping, product selection and effective permission scope before comparing figures. A comparison runs this same SQL again with the comparison dates. The SQL above deliberately shows the unrestricted reference; the filters page documents the extra predicates a restricted request receives.
