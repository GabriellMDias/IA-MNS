import {
  describeScope,
  permissionDeniedMessage,
  recordAccess,
  unrestricted,
  type DataScope,
  type PermissionInfo,
  type RestrictionDimension,
  type RestrictionValue,
} from "../../access.js";
import type { SalesResult } from "./domain.js";
import type { SalesSource } from "./sources.js";
import { salesSources, sourceCatalog } from "./sources.js";

/** Capability permission: held with the sales permission of any source. */
export const salesCapabilityPermission = "sales:read";

const dimension = (
  id: string,
  code: string,
  title: string,
  description: string,
  hierarchical = false,
): RestrictionDimension => ({ id, code, title, description, hierarchical });

/**
 * One permission per sales source, with the dimensions this module enforces
 * in that source's reviewed sales SQL. Discovered read-only on 2026-10-20
 * from the sales reference joins and the ERPs' registrations (ADR-0037).
 */
export const salesPermissions: Readonly<Record<SalesSource, PermissionInfo>> = {
  sankhya: {
    permission: "sales_sankhya:read",
    code: "SNK-VEN-01",
    title: "Consultar vendas",
    description:
      "Valor, quantidade e peso vendidos da MNS no Sankhya, pela referência de vendas aprovada.",
    source: { id: "sankhya", title: sourceCatalog.sankhya.label },
    capability: salesCapabilityPermission,
    restrictions: [
      dimension("company", "EMP", "Empresa", "Empresa da nota (CODEMP)."),
      dimension(
        "project",
        "PRJ",
        "Projeto (setor)",
        "Projeto informado no item vendido (AD_CODPROJ), apresentado como setor na referência de vendas; inclui os subprojetos. O projeto 0 reúne os itens sem projeto.",
        true,
      ),
      dimension(
        "seller",
        "VEN",
        "Vendedor",
        "Vendedor da nota (CODVEND). O código 0 reúne as vendas sem vendedor.",
      ),
      dimension(
        "product_group",
        "GRP",
        "Grupo de produto",
        "Grupo do produto vendido (CODGRUPOPROD); inclui os subgrupos.",
        true,
      ),
      dimension(
        "result_center",
        "CR",
        "Centro de resultado",
        "Centro de resultado da nota (CODCENCUS); inclui os centros abaixo dele.",
        true,
      ),
    ],
  },
  vrmaster: {
    permission: "sales_vrmaster:read",
    code: "VRM-VEN-01",
    title: "Consultar vendas",
    description:
      "Valor e quantidade vendidos do Pilar da Terra no VR Master, pela referência de vendas aprovada.",
    source: { id: "vrmaster", title: sourceCatalog.vrmaster.label },
    capability: salesCapabilityPermission,
    restrictions: [
      dimension("store", "LOJ", "Loja", "Loja da venda (id_loja)."),
      dimension(
        "buyer",
        "COM",
        "Comprador",
        "Comprador registrado na venda (id_comprador), como o PDT Connect usa nos indicadores de compradores; não é o comprador atual do cadastro.",
      ),
      dimension(
        "cost_center",
        "CC",
        "Centro de custo",
        "Centro de custo da seção (nível 1 do mercadológico) do produto vendido; inclui os centros abaixo dele. Produtos de seções sem centro de custo ficam fora.",
        true,
      ),
      dimension(
        "classification",
        "MER",
        "Mercadológico",
        "Classificação mercadológica do produto vendido, em qualquer nível (seção, grupo, subgrupo...); inclui os níveis abaixo dela.",
        true,
      ),
    ],
  },
};

export function salesPermission(source: SalesSource): string {
  return salesPermissions[source].permission;
}

/**
 * What a person may read of each source: a missing source is not permitted.
 * Absent altogether (the legacy single-source contract with its own check),
 * every source is unrestricted.
 */
export type SalesAccess = Readonly<Partial<Record<SalesSource, DataScope>>>;

/**
 * The sales access of held permissions: each source whose permission is held,
 * with its scope (unrestricted when the caller supplies no scopes, as in
 * development access).
 */
export function salesAccessOf(
  permissions: ReadonlySet<string>,
  scopes?: ReadonlyMap<string, DataScope>,
): SalesAccess {
  const access: Partial<Record<SalesSource, DataScope>> = {};
  for (const source of salesSources) {
    const permission = salesPermission(source);
    if (!permissions.has(permission)) continue;
    const scope = scopes ? scopes.get(permission) : unrestricted;
    if (scope) access[source] = scope;
  }
  return access;
}

/** The answer text of a source the person may not read. */
export function deniedSourceText(source: SalesSource): string {
  const info = salesPermissions[source];
  return `${info.source!.title}: você não tem permissão para consultar as vendas desta fonte. Permissão necessária: ${info.code} — ${info.title}. Se precisar desse acesso, entre em contato com o suporte e informe esse código.`;
}

/** The denial when no selected source may be read. */
export function deniedSalesMessage(sources: readonly SalesSource[]): string {
  return permissionDeniedMessage(
    `consultar as vendas de ${sources.map((source) => sourceCatalog[source].label).join(" e ")}`,
    sources.map((source) => ({ info: salesPermissions[source] })),
  );
}

/**
 * The requested values of a dimension that no rule of the scope admits. A
 * rule that does not restrict the dimension admits every value of it.
 */
export function outsideScope(
  scope: DataScope | undefined,
  dimension: string,
  requested: readonly RestrictionValue[],
): RestrictionValue[] {
  if (!scope || scope.kind === "all") return [];
  return requested.filter(
    (item) =>
      !scope.rules.some((rule) => {
        const condition = rule.find((entry) => entry.dimension === dimension);
        return (
          !condition ||
          condition.values.some((value) => value.value === item.value)
        );
      }),
  );
}

/**
 * The answer when a request names values of a restriction dimension that the
 * person's sales scope does not admit, such as another buyer's products: the
 * permission and the exact values support must release.
 */
export function deniedScopeMessage(
  source: SalesSource,
  dimension: string,
  outside: readonly RestrictionValue[],
): string {
  return permissionDeniedMessage(
    `consultar as vendas de ${sourceCatalog[source].label} com esses critérios`,
    [
      {
        info: salesPermissions[source],
        outside: { dimension, values: [...outside] },
      },
    ],
  );
}

/**
 * Marks a result computed under a restricted scope: the recorded scope lets a
 * later reading check coverage, and the warning tells the person the figures
 * are not the source's complete total.
 */
export function restrictResult(
  result: SalesResult,
  source: SalesSource,
  scope: DataScope | undefined,
): SalesResult {
  const recorded = scope ? recordAccess(scope) : null;
  if (!scope || !recorded) return result;
  return {
    ...result,
    access: recorded,
    warnings: [
      `Resultado limitado ao seu acesso (${salesPermissions[source].code}): ${describeScope(scope, salesPermissions[source].restrictions)}. Não é o total da fonte.`,
      ...result.warnings,
    ],
  };
}

const integer = (value: string) => {
  if (!/^-?\d{1,15}$/.test(value)) throw new Error("Invalid restriction value");
  return Number(value);
};

// Bound fragments per dimension. Values are always bound, never interpolated.
const sankhyaConditions: Readonly<Record<string, (list: string) => string>> = {
  company: (list) => `CAB.CODEMP IN (${list})`,
  project: (list) =>
    `NVL(ITE.AD_CODPROJ, 0) IN (SELECT RP.CODPROJ FROM TCSPRJ RP START WITH RP.CODPROJ IN (${list}) CONNECT BY NOCYCLE PRIOR RP.CODPROJ = RP.CODPROJPAI)`,
  seller: (list) => `CAB.CODVEND IN (${list})`,
  product_group: (list) =>
    `PRO.CODGRUPOPROD IN (SELECT RG.CODGRUPOPROD FROM TGFGRU RG START WITH RG.CODGRUPOPROD IN (${list}) CONNECT BY NOCYCLE PRIOR RG.CODGRUPOPROD = RG.CODGRUPAI)`,
  result_center: (list) =>
    `CAB.CODCENCUS IN (SELECT RC.CODCENCUS FROM TSICUS RC START WITH RC.CODCENCUS IN (${list}) CONNECT BY NOCYCLE PRIOR RC.CODCENCUS = RC.CODCENCUSPAI)`,
};

/**
 * The Oracle predicate of a restricted Sankhya scope over the reference
 * aliases CAB, ITE and PRO, with named binds. Null when unrestricted.
 */
export function sankhyaRestriction(
  scope: DataScope | undefined,
): { sql: string; binds: Record<string, number> } | null {
  if (!scope || scope.kind === "all") return null;
  if (scope.rules.length === 0) throw new Error("Empty restricted scope");
  const binds: Record<string, number> = {};
  const rules = scope.rules.map((rule, r) => {
    if (rule.length === 0) throw new Error("Empty restriction rule");
    return `(${rule
      .map((condition, c) => {
        const compile = sankhyaConditions[condition.dimension];
        if (!compile || condition.values.length === 0)
          throw new Error("Unenforceable Sankhya restriction");
        const names = condition.values.map((item, v) => {
          const name = `acc_${r}_${c}_${v}`;
          binds[name] = integer(item.value);
          return `:${name}`;
        });
        return compile(names.join(", "));
      })
      .join(" AND ")})`;
  });
  return { sql: `(${rules.join(" OR ")})`, binds };
}

const vrmasterConditions: Readonly<Record<string, (param: string) => string>> =
  {
    store: (param) => `venda.id_loja = ANY(${param}::int[])`,
    buyer: (param) => `venda.id_comprador = ANY(${param}::int[])`,
    cost_center: (param) =>
      `m.id_centrocusto IN (SELECT rd.id FROM public.centrocusto rd JOIN public.centrocusto rs ON rs.id = ANY(${param}::int[]) WHERE rd.centrocusto1 = rs.centrocusto1 AND (rs.nivel < 2 OR rd.centrocusto2 = rs.centrocusto2) AND (rs.nivel < 3 OR rd.centrocusto3 = rs.centrocusto3))`,
    classification: (param) =>
      `EXISTS (SELECT 1 FROM public.mercadologico rm WHERE rm.id = ANY(${param}::int[]) AND rm.mercadologico1 = produto.mercadologico1 AND (rm.nivel < 2 OR rm.mercadologico2 = produto.mercadologico2) AND (rm.nivel < 3 OR rm.mercadologico3 = produto.mercadologico3) AND (rm.nivel < 4 OR rm.mercadologico4 = produto.mercadologico4) AND (rm.nivel < 5 OR rm.mercadologico5 = produto.mercadologico5))`,
  };

/**
 * The PostgreSQL predicate of a restricted VR Master scope over the reference
 * aliases venda, produto and m, with positional parameters from `offset + 1`.
 * Null when unrestricted.
 */
export function vrmasterRestriction(
  scope: DataScope | undefined,
  offset: number,
): { sql: string; values: number[][] } | null {
  if (!scope || scope.kind === "all") return null;
  if (scope.rules.length === 0) throw new Error("Empty restricted scope");
  const values: number[][] = [];
  const rules = scope.rules.map((rule) => {
    if (rule.length === 0) throw new Error("Empty restriction rule");
    return `(${rule
      .map((condition) => {
        const compile = vrmasterConditions[condition.dimension];
        if (!compile || condition.values.length === 0)
          throw new Error("Unenforceable VR Master restriction");
        values.push(condition.values.map((item) => integer(item.value)));
        return compile(`$${offset + values.length}`);
      })
      .join(" AND ")})`;
  });
  return { sql: `(${rules.join(" OR ")})`, values };
}
