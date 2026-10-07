# VRMaster Reconciliation

[Human actions](human-actions.md#ph-20) · [VRMaster sales semantics](../domains/sales-chat.md#vrmaster-sales-semantics) · [Reference transcription](../../apps/api/src/features/sales/vrmaster-query.ts)

These read-only queries let the owner compare the IA-MNS VRMaster source with the official dashboard SQL on the real database ([PH-20](human-actions.md#ph-20)). Run them in a PostgreSQL client connected to the VRMaster database. Sections 2 to 6 also run as `ia_mns`, which has a 30-second statement limit; narrow the period to one month if a query is stopped. Record in the human-action evidence only whether results are equal and row counts, never figures, product names, hosts or credentials: the repository is public.

Each query starts from the same `params` block. Replace the dates (inclusive) and, in section 6, the product phrase.

## 1. Account limits (as `ia_mns`)

```sql
SHOW default_transaction_read_only;  -- on
SHOW statement_timeout;              -- 30s
SELECT has_schema_privilege('public', 'CREATE') AS can_create,
       has_table_privilege('public.venda', 'INSERT, UPDATE, DELETE, TRUNCATE') AS can_write;  -- false, false
SELECT table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'ia_mns'
ORDER BY 1, 2, 3;  -- SELECT only, on the nine reference tables
BEGIN;
CREATE TABLE public.ia_mns_probe (id integer);  -- must fail
ROLLBACK;
```

`default_transaction_read_only` is a session default the account can change; the grants are the actual protection.

## 2. Same sales as the official query

Paste the complete official SQL into `oficial`, without its final `ORDER BY`, replacing `:periodo_start` with `(SELECT ini FROM params)`, `:periodo_end` with `(SELECT fim FROM params)` and `:lojas::int[]` with `(SELECT array_agg(id) FROM public.loja)`. `ia_mns` is the IA-MNS reference with the same dates. Both differences must return no rows; `EXCEPT ALL` also compares how many times each sale appears.

```sql
WITH params AS (SELECT DATE '2026-09-01' AS ini, DATE '2026-09-30' AS fim),
oficial AS (
  -- official dashboard SQL here
),
ia_mns AS (
  SELECT venda.id, venda.id_produto, venda.data, venda.quantidade, venda.valortotal
  FROM public.venda
  INNER JOIN public.produto ON venda.id_produto = produto.id
  INNER JOIN public.loja ON loja.id = venda.id_loja
  INNER JOIN public.fornecedor fl ON fl.id = loja.id_fornecedor
  INNER JOIN public.produtoaliquota pa ON pa.id_produto = venda.id_produto AND pa.id_estado = fl.id_estado
  INNER JOIN public.aliquota a ON a.id = pa.id_aliquotaconsumidor
  INNER JOIN public.mercadologico m ON m.mercadologico1 = produto.mercadologico1 AND m.nivel = 1
  LEFT JOIN public.centrocusto cc ON cc.id = m.id_centrocusto
  LEFT JOIN public.comprador ON comprador.id = venda.id_comprador
  WHERE venda.data >= (SELECT ini FROM params)
    AND venda.data < ((SELECT fim FROM params) + INTERVAL '1 day')
)
SELECT 'only official' AS side, * FROM (
  SELECT id, id_produto, data, quantidade, valortotal FROM oficial
  EXCEPT ALL
  SELECT id, id_produto, data, quantidade, valortotal FROM ia_mns) x
UNION ALL
SELECT 'only IA-MNS', * FROM (
  SELECT id, id_produto, data, quantidade, valortotal FROM ia_mns
  EXCEPT ALL
  SELECT id, id_produto, data, quantidade, valortotal FROM oficial) y;
```

An empty result confirms the transcription, including the assumption that the official `calculos` step adds no row filter.

## 3. Figures IA-MNS answers

The totals IA-MNS shows for the same period with `Pilar da Terra (VR Master)` selected. Ask, for example, "Quanto vendi em setembro de 2026?", "Qual a quantidade vendida em setembro de 2026?" and "Quanto vendi por mês de julho a setembro de 2026?", and compare.

```sql
WITH params AS (SELECT DATE '2026-07-01' AS ini, DATE '2026-09-30' AS fim),
base AS (
  SELECT venda.data, venda.quantidade, produto.id_tipoembalagem, venda.valortotal
  FROM public.venda
  INNER JOIN public.produto ON venda.id_produto = produto.id
  INNER JOIN public.loja ON loja.id = venda.id_loja
  INNER JOIN public.fornecedor fl ON fl.id = loja.id_fornecedor
  INNER JOIN public.produtoaliquota pa ON pa.id_produto = venda.id_produto AND pa.id_estado = fl.id_estado
  INNER JOIN public.aliquota a ON a.id = pa.id_aliquotaconsumidor
  INNER JOIN public.mercadologico m ON m.mercadologico1 = produto.mercadologico1 AND m.nivel = 1
  LEFT JOIN public.centrocusto cc ON cc.id = m.id_centrocusto
  LEFT JOIN public.comprador ON comprador.id = venda.id_comprador
  WHERE venda.data >= (SELECT ini FROM params)
    AND venda.data < ((SELECT fim FROM params) + INTERVAL '1 day')
)
SELECT to_char(data, 'YYYY-MM') AS month,
       COALESCE('EMBALAGEM:' || id_tipoembalagem::text, 'UNSPECIFIED') AS unit,
       SUM(valortotal::numeric) AS total_value,
       SUM(quantidade::numeric) AS quantity
FROM base
GROUP BY ROLLUP (to_char(data, 'YYYY-MM')),
         COALESCE('EMBALAGEM:' || id_tipoembalagem::text, 'UNSPECIFIED')
ORDER BY 1 NULLS LAST, 2;
```

Rows with an empty month are the period totals per packaging type; the value total of the period is their sum, which IA-MNS shows as one value (value is not split by packaging type).

## 4. Stores that count

IA-MNS counts every store. Confirm that each listed store should count; a store that should not (for example a test or closed store) needs a reviewed rule before IA-MNS changes.

```sql
WITH params AS (SELECT DATE '2026-09-01' AS ini, DATE '2026-09-30' AS fim)
SELECT loja.id, loja.descricao, count(*) AS sales_rows
FROM public.venda
INNER JOIN public.loja ON loja.id = venda.id_loja
WHERE venda.data >= (SELECT ini FROM params)
  AND venda.data < ((SELECT fim FROM params) + INTERVAL '1 day')
GROUP BY 1, 2
ORDER BY 1;
```

## 5. Sales repeated or dropped by the reference joins

Diagnostics of the reference itself; IA-MNS reproduces whatever it does. Repeated sales mean several fiscal or level-1 mercadológico rows for one product, which also repeat them in the dashboard. Dropped sales have no fiscal row for the store's state or no level-1 mercadológico.

```sql
WITH params AS (SELECT DATE '2026-09-01' AS ini, DATE '2026-09-30' AS fim),
joined AS (
  SELECT venda.id
  FROM public.venda
  INNER JOIN public.produto ON venda.id_produto = produto.id
  INNER JOIN public.loja ON loja.id = venda.id_loja
  INNER JOIN public.fornecedor fl ON fl.id = loja.id_fornecedor
  INNER JOIN public.produtoaliquota pa ON pa.id_produto = venda.id_produto AND pa.id_estado = fl.id_estado
  INNER JOIN public.aliquota a ON a.id = pa.id_aliquotaconsumidor
  INNER JOIN public.mercadologico m ON m.mercadologico1 = produto.mercadologico1 AND m.nivel = 1
  LEFT JOIN public.centrocusto cc ON cc.id = m.id_centrocusto
  LEFT JOIN public.comprador ON comprador.id = venda.id_comprador
  WHERE venda.data >= (SELECT ini FROM params)
    AND venda.data < ((SELECT fim FROM params) + INTERVAL '1 day')
),
period AS (
  SELECT venda.id FROM public.venda
  WHERE venda.data >= (SELECT ini FROM params)
    AND venda.data < ((SELECT fim FROM params) + INTERVAL '1 day')
)
SELECT (SELECT count(*) FROM period) AS sales_in_period,
       (SELECT count(DISTINCT id) FROM joined) AS sales_counted,
       (SELECT count(*) FROM joined) AS rows_counted,
       (SELECT count(*) FROM (SELECT id FROM joined GROUP BY id HAVING count(*) > 1) r) AS sales_repeated;
```

## 6. Product phrase

IA-MNS matches the phrase as whole words, ignoring accents and case. List what it matches and compare with what the owner expects for that phrase. Set `phrase` without accents in uppercase, as IA-MNS normalizes it (for example `MACA` for "maçã").

```sql
WITH params AS (SELECT 'MACA'::text AS phrase)
SELECT produto.id, produto.descricaocompleta
FROM public.produto
WHERE regexp_replace(
        upper(translate(produto.descricaocompleta,
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
          'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')),
        '[[:space:]]+', ' ', 'g')
      ~ ('(^|[^[:alnum:]])' || (SELECT phrase FROM params) || '([^[:alnum:]]|$)')
ORDER BY 1
LIMIT 200;
```

A phrase with characters such as `.`, `(` or `+` must have them escaped with `\` here; IA-MNS escapes them itself. IA-MNS lists only the matched products that have sales in the period. Then ask IA-MNS "Quanto vendi de maçã em setembro de 2026?" and compare with section 3 restricted to these products.

## 7. Through IA-MNS

With `Pilar da Terra (VR Master)` selected, the answers must equal sections 3 and 6. With `Tudo`, the VRMaster group must show the same figures and the MNS (Sankhya) group its own, never a sum. A question that names Sankhya while VR Master is selected must still answer from VR Master, with a notice.
