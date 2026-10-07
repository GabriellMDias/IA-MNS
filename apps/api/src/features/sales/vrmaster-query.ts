import type { SalesQuery } from "./domain.js";
import { productPhrase, productPhrasePattern } from "./product-match.js";

// Upper- and lowercase accented letters are translated before upper(), so the
// match does not depend on the database's ctype for non-ASCII letters.
const accented = "ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç";
const plain = "AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc";

/**
 * The owner's VRMaster sales reference (PH-18) reduced to the columns IA-MNS
 * reports. Every join and its cardinality are kept as supplied: dropping the
 * fiscal, mercadológico or buyer joins could change which sales count. The
 * reference's store parameter is omitted because every store counts; its
 * inner join to loja already admits exactly the sales of existing stores.
 * Table names are schema-qualified so a role search_path cannot redirect them.
 * $1/$2 are the inclusive dates, $3/$4 the optional product phrase and its
 * whole-word pattern; all are bound values.
 */
export const vrmasterSalesCte = `
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
      upper(translate(produto.descricaocompleta, '${accented}', '${plain}')),
      '[[:space:]]+', ' ', 'g') ~ $4::text)
)`;

export function vrmasterParameters(query: SalesQuery) {
  const search =
    query.productSearch === null ? null : productPhrase(query.productSearch);
  return [
    query.startDate,
    query.endDate,
    search,
    search === null ? null : productPhrasePattern(search),
  ];
}

const productLabel =
  "base.id_produto::text || ' - ' || COALESCE(NULLIF(btrim(base.produto), ''), 'sem descrição')";

export function vrmasterAggregateSql(query: SalesQuery): string {
  if (query.metric === "weight")
    throw new Error("VRMaster has no reviewed weight measure");
  // These fragments come only from validated enums, never model/user text.
  const period =
    query.groupBy === "month" ? "to_char(base.data, 'YYYY-MM')" : "'total'";
  const product = query.groupBy === "product" ? productLabel : "NULL::text";
  const unit =
    query.metric === "net_value"
      ? "'BRL'"
      : "COALESCE('EMBALAGEM:' || base.id_tipoembalagem::text, 'UNSPECIFIED')";
  const measure =
    query.metric === "net_value"
      ? "base.valortotal::numeric"
      : "base.quantidade::numeric";
  return `${vrmasterSalesCte}
SELECT ${period} AS period, ${product} AS product, ${unit} AS unit,
  COALESCE(SUM(${measure}), 0)::text AS value
FROM base
GROUP BY 1, 2, 3
HAVING COUNT(*) > 0
ORDER BY 1, 2, 3
LIMIT 501`;
}

export const vrmasterProductsSql = `${vrmasterSalesCte}
SELECT DISTINCT base.id_produto::text AS code,
  COALESCE(NULLIF(btrim(base.produto), ''), 'sem descrição') AS description
FROM base
ORDER BY 1
LIMIT 101`;
