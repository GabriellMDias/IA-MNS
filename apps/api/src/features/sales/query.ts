import type { SalesQuery } from "./domain.js";
import { productPhrase, productPhrasePattern } from "./product-match.js";

// Bound literal phrases prevent a named product from matching another word's
// prefix. Both eligible controls and sales use this exact predicate.
const productDescriptionPredicate = `(:productSearch IS NULL OR REGEXP_LIKE(
  REGEXP_REPLACE(TRANSLATE(UPPER(PRO.DESCRPROD), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'), '[[:space:]]+', ' '),
  :productPattern))`;

// Preserve the supplied DISTINCT projection and join cardinality. Changing the
// grain requires ERP reconciliation; dropping joins can silently change totals.
export const referenceSalesCte = `
WITH ELIGIBLE_CONTROLS AS (
  SELECT DISTINCT ITE.CONTROLE
  FROM TGFCAB CAB
  JOIN TGFITE ITE ON ITE.NUNOTA = CAB.NUNOTA
  JOIN TGFPRO PRO ON PRO.CODPROD = ITE.CODPROD
  WHERE CAB.DTNEG >= TO_DATE(:startDate, 'YYYY-MM-DD')
    AND CAB.DTNEG < TO_DATE(:endDate, 'YYYY-MM-DD') + 1
    AND CAB.STATUSNOTA = 'L'
    AND PRO.USOPROD IN ('M','R')
    AND PRO.CODGRUPOPROD NOT IN (85007003)
    AND CAB.CODTIPOPER NOT IN (1002,915,9599,905,575,930,568,515,450,460,1006,1008)
    AND ${productDescriptionPredicate}
)
, VENDAS AS (SELECT DISTINCT
         CAB.NUNOTA,
         ORIO.NUNOTAORIG AS "NR_UNI_ORIG",
         CAB.CODTIPVENDA TIPNEG,
	    (CASE WHEN TOP.BONIFICACAO = 'S' AND CAB.TIPMOV = 'V' THEN 'B' ELSE CAB.TIPMOV END) TIPMOV,
         /*NVL(DEST.NUNOTA,CAB.NUNOTA) AS "NR_UNI_DEST",*/
         CAB.NUMNOTA AS "NR_NOTA",
         CAB2.NUMNOTA AS "NR_NOTA_ORIGEM",
         (CASE
             WHEN CAB.TIPMOV = 'P'
             THEN
                'PEDIDO'
             ELSE
                (CASE WHEN CAB.TIPMOV = 'V' AND TOP.BONIFICACAO <> 'S' THEN 'VENDA' 
			WHEN CAB.TIPMOV = 'V' AND TOP.BONIFICACAO = 'S' THEN 'VENDA BONIFICADA'
			ELSE 'DEVOLUCAO' END)
          END)
            AS "TIPO_MOV",
         (CASE
             WHEN DEST.NUNOTA IS NULL AND CAB.TIPMOV = 'P' THEN 'NÃO FATURADO'
             ELSE 'FATURADO'
          END)
            AS "STATUS",
         (CASE WHEN CAB.STATUSNOTA = 'L' THEN 'SIM' ELSE 'NÃO' END)
            AS CONFIRMADO,
         (CASE
             WHEN DEST.NUNOTA IS NULL AND CAB.TIPMOV = 'P' THEN 'RED'
             ELSE 'BLUE'
          END)
            AS FGCOLOR,
         CAB.CODEMP AS "CODEMP",
         EMP.RAZAOSOCIAL,
         ITE.AD_CODPROJ AS "CODSETOR",
         PRJ.IDENTIFICACAO AS "SETOR",
         CAB.DTNEG AS "DTNEG",
         CAB.CODPARC AS "CODPARC",
         PAR.NOMEPARC AS "PARCEIRO",
         CAB.DTMOV AS "DT_MOV",
         CAB.DTFATUR DT_FATURAMENTO,
         CAB.CODVEND || '-' || VEN.APELIDO AS "VENDEDOR",
         ITE.VLRUNIT * (CASE WHEN CAB.TIPMOV = 'D' THEN -1 ELSE 1 END)
            AS "VLRUNIT",
           (ITE.VLRTOT - ITE.VLRDESC)
         * (CASE WHEN CAB.TIPMOV = 'D' THEN -1 ELSE 1 END)
            AS "VLRBRUTO",
         CASE
            WHEN NVL(AJI.AD_VLRUNITFIN, 0) != 0 THEN 
                NVL(AJI.AD_VLRUNITFIN, 0)
            ELSE
                NVL (ITE.AD_PRECOAJUSTADO, 0) 
         END AS "VLRUNITAJUSTADO",
         CASE
            WHEN NVL(AJI.AD_VLRTOTFIN, 0) != 0 THEN
                NVL (AJI.AD_VLRTOTFIN, 0)
            ELSE
                NVL (ITE.AD_TOTALAJUSTADO, 0)
         END AS "TOTALAJUSTADO",
           NVL (ITE.AD_VLRTOTALBONIFI, 0)
         * (CASE WHEN CAB.TIPMOV = 'D' THEN -1 ELSE 1 END)
            AS "BONIFICACAO",
           (  (CASE
                  WHEN NVL(AJI.AD_VLRTOTFIN, 0) != 0 THEN AJI.AD_VLRTOTFIN
                  WHEN NVL(ITE.AD_TOTALAJUSTADO, 0) != 0 THEN ITE.AD_TOTALAJUSTADO
                  ELSE (ITE.VLRTOT - ITE.VLRDESC)
               END)
            - NVL (ITE.AD_VLRTOTALBONIFI, 0))
         * (CASE WHEN CAB.TIPMOV = 'D' THEN -1 ELSE 1 END)
            AS "VLRLIQUIDO",
         ITE.QTDNEG * (CASE WHEN CAB.TIPMOV = 'D' THEN -1 ELSE 1 END)
            AS "QTDNEG",
         PRO.PESOLIQ AS "PESOPROD",
           (ITE.QTDNEG * PRO.PESOLIQ)
         * (CASE WHEN CAB.TIPMOV = 'D' THEN -1 ELSE 1 END)
            AS "PESOTOTAL",
         ITE.CODPROD AS "CODPROD",
         PRO.DESCRPROD AS "PRODUTO",
         PRO.CODGRUPOPROD AS "GRUPO",
         GRU.DESCRGRUPOPROD AS "GRUPOPROD",
         GRUP.DESCRGRUPOPROD AS "GRUPOPAI",
         ITE.CONTROLE AS "CONTROLE",
         ITE.CODVOL AS "VOLUME",
         CAB.CODTIPOPER || ' - ' || TOP.DESCROPER AS "OPERACAO",
         DEV.DESCMOTIVO AS MOTIVODEV,
		(CASE WHEN ITE.AD_DESTPROD = 'D' THEN 'DESCARTE'
               WHEN ITE.AD_DESTPROD = 'V' THEN 'REVENDA'
               WHEN ITE.AD_DESTPROD = 'R' THEN 'RETORNO'
               WHEN ITE.AD_DESTPROD = 'N' THEN 'NÃO SE APLICA' END) AS DEST_PROD,
         CAST (
              CAST (NVL (ITE.QTDNEG, 0) AS DECIMAL (38, 9))
            - CAST (NVL (ITE.QTDENTREGUE, 0) AS DECIMAL (38, 9)) AS FLOAT)
            AS "QTDPENDENTE",
         CAB.ORDEMCARGA,
         (CASE WHEN CAB.TIPMOV = 'D' THEN 0 ELSE NVL (ITE.AD_VLRFRETEITEM, 0) END) AS FRETE_UNT,
         (CASE WHEN CAB.TIPMOV = 'D' THEN 0 ELSE NVL (ITE.AD_VLREMBALAGEM, 0) END) AS EMBALAGEM,
            LOT.NOMEPARC,
            LOT.COMPRADOR,
            LOT.PROJETOCOM
    FROM TGFCAB CAB
         JOIN TGFTOP TOP
            ON (CAB.CODTIPOPER = TOP.CODTIPOPER AND CAB.DHTIPOPER = TOP.DHALTER)
         JOIN TGFVEN VEN ON (VEN.CODVEND = CAB.CODVEND)
         JOIN TGFITE ITE ON (ITE.NUNOTA = CAB.NUNOTA)
         JOIN TGFPAR PAR ON (PAR.CODPARC = CAB.CODPARC)
         JOIN TGFPRO PRO ON (PRO.CODPROD = ITE.CODPROD)
         JOIN TGFGRU GRU ON (GRU.CODGRUPOPROD = PRO.CODGRUPOPROD)
         JOIN TGFGRU GRUP ON (GRUP.CODGRUPOPROD = GRU.CODGRUPAI)
         JOIN TSIEMP EMP ON (EMP.CODEMP = CAB.CODEMP)
         LEFT JOIN TCSPRJ PRJ ON (PRJ.CODPROJ = ITE.AD_CODPROJ)
         LEFT JOIN TGFVAR DEST
            ON (    DEST.NUNOTAORIG = ITE.NUNOTA
                AND DEST.SEQUENCIAORIG = ITE.SEQUENCIA)
         LEFT JOIN TGFVAR ORIO
            ON (ORIO.NUNOTA = ITE.NUNOTA AND ORIO.SEQUENCIA = ITE.SEQUENCIA)
         LEFT JOIN TGFCAB CAB2
            ON (    ORIO.NUNOTAORIG = CAB2.NUNOTA
                AND ORIO.SEQUENCIA = ITE.SEQUENCIA)
         LEFT JOIN AD_MOTIVODEV DEV ON (DEV.CODMOTIVO = ITE.AD_CODMOTIVO)
         LEFT JOIN
         (  SELECT LOT.CONTROLE,
                   LOT.NOMEPARC,
                   MAX (LOT.CODCOMP) AS CODCOMP,
                   LOT.PROJETOCOM,
                   LOT.COMPRADOR
              FROM (SELECT LOT.CONTROLE,
                           PAR.NOMEPARC,
                           LOT.CODVEND AS CODCOMP,
                           PRJ.IDENTIFICACAO AS PROJETOCOM,
                           COM.APELIDO AS COMPRADOR
                      FROM AD_RESULTADO_LOTE LOT
                           JOIN TGFCAB CAB ON TO_CHAR (CAB.NUNOTA) = LOT.CONTROLE
                           JOIN TGFPAR PAR ON (PAR.CODPARC = CAB.CODPARC AND LOT.CODPARC = CAB.CODPARC)
                           JOIN TCSPRJ PRJ ON PRJ.CODPROJ = CAB.CODPROJ
                           JOIN TGFVEN COM ON CAB.CODVEND = COM.CODVEND
                     WHERE EXISTS (SELECT 1 FROM ELIGIBLE_CONTROLS EC WHERE EC.CONTROLE = LOT.CONTROLE)) LOT
          GROUP BY LOT.CONTROLE,
                   LOT.NOMEPARC,
                   LOT.PROJETOCOM,
                   LOT.COMPRADOR) LOT
            ON (LOT.CONTROLE = ITE.CONTROLE)
        LEFT JOIN TGFVAR AJV ON (AJV.NUNOTAORIG = CAB.NUNOTA AND AJV.SEQUENCIA = ITE.SEQUENCIA)
        LEFT JOIN TGFCAB AJC ON (AJC.NUNOTA = AJV.NUNOTA AND AJC.CODTIPOPER IN (450, 460))
        LEFT JOIN TGFITE AJI ON (AJI.NUNOTA = AJC.NUNOTA AND AJI.SEQUENCIA = ITE.SEQUENCIA)
   WHERE     CAB.DTNEG >= TO_DATE(:startDate, 'YYYY-MM-DD')
         AND CAB.DTNEG < TO_DATE(:endDate, 'YYYY-MM-DD') + 1
         AND PRO.USOPROD IN ('M','R')
         AND CAB.CODTIPOPER NOT IN (1002,
                                    915,
                                    9599,
                                    905,
                                    575,930,568,515,450,460, 1006, 1008)
         AND (CAB.STATUSNOTA = 'L')
		AND PRO.CODGRUPOPROD NOT IN (85007003)

         AND ${productDescriptionPredicate}
		--AND ORIO.NUNOTAORIG <> 1301858

)

, FILTERED AS (
  SELECT * FROM VENDAS
  WHERE TIPMOV = 'V'
)`;

export function queryBindings(query: SalesQuery) {
  const search =
    query.productSearch === null ? null : productPhrase(query.productSearch);
  return {
    startDate: query.startDate,
    endDate: query.endDate,
    productSearch: search,
    productPattern: search === null ? null : productPhrasePattern(search),
  };
}

export function aggregateSql(query: SalesQuery): string {
  // These expressions come only from validated enums, never model/user SQL.
  const period =
    query.groupBy === "month" ? "TO_CHAR(DTNEG, 'YYYY-MM')" : "'total'";
  const product =
    query.groupBy === "product"
      ? "TO_CHAR(CODPROD) || ' - ' || PRODUTO"
      : "CAST(NULL AS VARCHAR2(4000))";
  const unit =
    query.metric === "quantity"
      ? "VOLUME"
      : query.metric === "net_value"
        ? "'BRL'"
        : "'PESOLIQ'";
  const measure = {
    net_value: "VLRLIQUIDO",
    quantity: "QTDNEG",
    weight: "PESOTOTAL",
  }[query.metric];
  return `${referenceSalesCte}
    SELECT ${period} AS PERIOD, ${product} AS PRODUCT, ${unit} AS UNIT,
      TO_CHAR(NVL(SUM(${measure}), 0), 'FM99999999999999999999999999999999999990D000000000', 'NLS_NUMERIC_CHARACTERS=''.,''') AS VALUE,
      COUNT(CASE WHEN PESOPROD IS NULL OR PESOPROD <= 0 THEN 1 END) AS MISSING_WEIGHT
    FROM FILTERED GROUP BY ${period}, ${product}, ${unit}
    HAVING COUNT(*) > 0
    ORDER BY PERIOD, PRODUCT, UNIT FETCH FIRST 501 ROWS ONLY`;
}
export const matchingProductsSql = `${referenceSalesCte}
  SELECT DISTINCT TO_CHAR(CODPROD) AS CODE, PRODUTO AS DESCRIPTION
  FROM FILTERED ORDER BY CODE FETCH FIRST 101 ROWS ONLY`;
