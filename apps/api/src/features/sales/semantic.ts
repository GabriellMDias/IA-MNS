import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { comparisonSchema, measureSchema } from "./analysis.js";
import type {
  SalesAnswer,
  SectionReason,
  SourceReaders,
} from "./application.js";
import { assembleResult, validateQuery, type SalesQuery } from "./domain.js";
import { SalesFailure } from "./errors.js";
import { scopeDescription, type SalesProductScope } from "./product-scope.js";
import type { SalesReadResult } from "./reader.js";
import {
  sourcesOf,
  supportsMetric,
  type SalesSource,
  type SourceSelection,
} from "./sources.js";

/** A composable plan over the reviewed sales relation, never arbitrary SQL. */
export const semanticSalesPlanSchema = Type.Object(
  {
    metrics: Type.Array(measureSchema, {
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
    }),
    dimensions: Type.Array(
      Type.Union([Type.Literal("month"), Type.Literal("product")]),
      { maxItems: 2, uniqueItems: true },
    ),
    startDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    endDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    comparison: {
      ...comparisonSchema,
      description:
        "none: no comparison. previous_year: the same calendar dates one year earlier, clamping leap day. previous_period: the immediately preceding interval with the SAME NUMBER OF DAYS; this is not necessarily the preceding calendar months. For distinct calendar blocks use separate explicit-range queries with none; never substitute an equal-day comparison for calendar months.",
    },
  },
  { additionalProperties: false },
);
export type SemanticSalesPlan = Static<typeof semanticSalesPlanSchema>;
export type SalesAnalysis = { kind: "sales_analysis"; panels: SalesAnswer[] };

export function compileSemanticSalesPlan(
  plan: unknown,
  today: string,
  productSearch: string | null = null,
): SalesQuery[] {
  if (!Value.Check(semanticSalesPlanSchema, plan))
    throw new SalesFailure("SALES_QUERY_INVALID");
  const groupBy =
    plan.dimensions.length === 2
      ? "month_product"
      : (plan.dimensions[0] ?? "total");
  return plan.metrics.map((metric) =>
    validateQuery(
      {
        metric,
        groupBy,
        startDate: plan.startDate,
        endDate: plan.endDate,
        comparison: plan.comparison,
        productSearch,
      },
      today,
    ),
  );
}

const failureReasons: Partial<Record<SalesFailure["code"], SectionReason>> = {
  SALES_PROVIDER_UNAVAILABLE: "provider_unavailable",
  SALES_NOT_CONFIGURED: "not_configured",
  SALES_RESULT_TOO_LARGE: "result_too_large",
};

/** All measures of one source share a snapshot; sources remain independent. */
export async function executeSemanticSales(
  input: Readonly<{
    plan: unknown;
    permissions: ReadonlySet<string>;
    selection: SourceSelection;
    readers: SourceReaders;
    today: string;
    signal: AbortSignal;
    productSearch?: string | null;
    productScope?: SalesProductScope;
    report?: (error: unknown) => void;
  }>,
): Promise<SalesAnalysis> {
  if (
    !input.permissions.has("sales:read") ||
    (input.productScope && !input.permissions.has("products:read"))
  )
    throw new SalesFailure("SALES_ACCESS_DENIED");
  if (
    !["sankhya", "vrmaster", "all"].includes(input.selection) ||
    (input.productScope &&
      (input.selection !== input.productScope.source || input.productSearch))
  )
    throw new SalesFailure("SALES_QUERY_INVALID");
  const queries = compileSemanticSalesPlan(
    input.plan,
    input.today,
    input.productSearch,
  );
  input.signal.throwIfAborted();
  const selected = sourcesOf(input.selection);
  type Outcome = {
    source: SalesSource;
    reads: Map<SalesQuery["metric"], SalesReadResult>;
    reason: SectionReason | null;
  };
  const outcomes = await Promise.all(
    selected.map(async (source): Promise<Outcome> => {
      const supported = queries.filter((query) =>
        supportsMetric(source, query.metric),
      );
      if (!supported.length) return { source, reads: new Map(), reason: null };
      try {
        const reader = input.readers[source];
        if (!reader || (supported.length > 1 && !reader.readMany))
          throw new SalesFailure("SALES_NOT_CONFIGURED");
        const reads = reader.readMany
          ? await reader.readMany(supported, input.signal, input.productScope)
          : [await reader.read(supported[0], input.signal, input.productScope)];
        if (reads.length !== supported.length)
          throw new SalesFailure("SALES_PROVIDER_UNAVAILABLE");
        return {
          source,
          reads: new Map(
            supported.map((query, index) => [query.metric, reads[index]]),
          ),
          reason: null,
        };
      } catch (error) {
        const reason =
          error instanceof SalesFailure
            ? failureReasons[error.code]
            : undefined;
        if (!reason || selected.length === 1) throw error;
        input.report?.(error);
        return { source, reads: new Map(), reason };
      }
    }),
  );
  input.signal.throwIfAborted();
  return {
    kind: "sales_analysis",
    panels: queries.map((query) => ({
      selection: input.selection,
      sections: outcomes.map(({ source, reads, reason }) => {
        if (!supportsMetric(source, query.metric))
          return {
            source,
            status: "unsupported",
            reason: "measure",
            result: null,
          };
        const read = reads.get(query.metric);
        if (!read)
          return { source, status: "unavailable", reason, result: null };
        const result = assembleResult(
          query,
          read.current,
          read.previous,
          source,
        );
        if (input.productScope) {
          result.productSelection = scopeDescription(input.productScope);
          result.warnings.unshift(
            "A seleção usa o cadastro atual, aplicado igualmente aos dois períodos; não reconstrói classificações ou responsáveis históricos.",
          );
        }
        if (query.groupBy === "month_product")
          result.warnings.push(
            "O detalhamento mensal por produto mostra apenas combinações com vendas; combinações ausentes não são valores desconhecidos nem produtos excluídos dos totais.",
          );
        return { source, status: "answered", reason: null, result };
      }),
    })),
  };
}
