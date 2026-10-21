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
SELECT 'total' AS period, base.id_produto::text || ' - ' || COALESCE(NULLIF(btrim(base.produto), ''), 'sem descrição') AS product, 'BRL' AS unit,
  COALESCE(SUM(base.valortotal::numeric), 0)::text AS value
FROM base
GROUP BY 1, 2, 3
HAVING COUNT(*) > 0
ORDER BY 1, 2, 3
LIMIT 501;
