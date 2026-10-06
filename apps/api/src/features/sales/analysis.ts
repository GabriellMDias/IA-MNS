import { Type, type Static, type TSchema } from "typebox";
import { validateQuery, type SalesQuery } from "./domain.js";
import {
  periodExpressionSchema,
  rangeExpression,
  resolvePeriod,
  type PeriodIssue,
} from "./period.js";

/**
 * The implemented analytical vocabulary of the sales capability. Each entry
 * compiles to the reconciled reference query in query.ts; add a dimension,
 * measure or grouping only together with reviewed query support and ERP
 * reconciliation. Interpretation schemas are derived from this catalog, so the
 * model cannot express an unimplemented constraint.
 */
export const salesCatalog = {
  measures: ["net_value", "quantity", "weight"],
  defaultMeasure: "net_value",
  /** Filterable business dimensions; product matches a description phrase. */
  dimensions: ["product"],
  /** "total", a time grain, or a groupable dimension. */
  groupings: ["total", "month", "product"],
  defaultGrouping: "total",
  comparisons: ["none", "previous_year", "previous_period"],
  defaultComparison: "none",
} as const;

export type Measure = (typeof salesCatalog.measures)[number];
export type Dimension = (typeof salesCatalog.dimensions)[number];
export type Grouping = (typeof salesCatalog.groupings)[number];
export type Comparison = (typeof salesCatalog.comparisons)[number];
/** A piece of an analysis that a message can provide or the user can be asked for. */
export type Slot = "measure" | "period" | "grouping" | "comparison" | Dimension;
/** Slots without a default; an analysis cannot run until they are known. */
export const requiredSlots: readonly Slot[] = ["period"];

const object = { additionalProperties: false };
const nullable = <T extends TSchema>(schema: T) =>
  Type.Union([schema, Type.Null()]);
// Schemas list the catalog values literally; a test keeps them identical.
export const measureSchema = Type.Union([
  Type.Literal("net_value"),
  Type.Literal("quantity"),
  Type.Literal("weight"),
]);
export const dimensionSchema = Type.Union([Type.Literal("product")]);
export const groupingSchema = Type.Union([
  Type.Literal("total"),
  Type.Literal("month"),
  Type.Literal("product"),
]);
export const comparisonSchema = Type.Union([
  Type.Literal("none"),
  Type.Literal("previous_year"),
  Type.Literal("previous_period"),
]);
export const filterTextSchema = Type.String({ minLength: 2, maxLength: 80 });

const filterSchema = Type.Object(
  { dimension: dimensionSchema, text: filterTextSchema },
  object,
);
const filtersSchema = Type.Array(filterSchema, {
  maxItems: salesCatalog.dimensions.length,
});
/** The structured analytical plan: what to compute, independent of wording and SQL. */
export const specSchema = Type.Object(
  {
    measure: measureSchema,
    filters: filtersSchema,
    period: periodExpressionSchema,
    groupBy: groupingSchema,
    comparison: comparisonSchema,
  },
  object,
);
/** A partially known analysis, such as a request awaiting its period. */
export const draftSchema = Type.Object(
  {
    measure: nullable(measureSchema),
    filters: filtersSchema,
    period: nullable(periodExpressionSchema),
    groupBy: nullable(groupingSchema),
    comparison: nullable(comparisonSchema),
  },
  object,
);
export type AnalysisSpec = Static<typeof specSchema>;
export type AnalysisDraft = Static<typeof draftSchema>;
export type DimensionFilter = AnalysisSpec["filters"][number];

/** What one message states about the analysis; null fields are unstated. */
export type AnalysisChange = Readonly<{
  measure: Measure | null;
  filters: readonly Readonly<{
    dimension: Dimension;
    action: "set" | "clear";
    text: string | null;
  }>[];
  period: AnalysisDraft["period"];
  groupBy: Grouping | null;
  comparison: Comparison | null;
}>;

export const emptyDraft: AnalysisDraft = {
  measure: null,
  filters: [],
  period: null,
  groupBy: null,
  comparison: null,
};

export function providedSlots(change: AnalysisChange): Slot[] {
  return [
    ...(change.measure !== null ? (["measure"] as const) : []),
    ...(change.period !== null ? (["period"] as const) : []),
    ...(change.groupBy !== null ? (["grouping"] as const) : []),
    ...(change.comparison !== null ? (["comparison"] as const) : []),
    ...change.filters.map((filter) => filter.dimension),
  ];
}

/** Deterministic merge: stated values replace, clear removes, the rest is retained. */
export function applyChange(
  base: AnalysisDraft,
  change: AnalysisChange,
): AnalysisDraft {
  let filters: DimensionFilter[] = [...base.filters];
  for (const filter of change.filters) {
    filters = filters.filter((item) => item.dimension !== filter.dimension);
    if (filter.action === "set" && filter.text !== null)
      filters.push({ dimension: filter.dimension, text: filter.text.trim() });
  }
  return {
    measure: change.measure ?? base.measure,
    filters: filters.sort(
      (left, right) =>
        salesCatalog.dimensions.indexOf(left.dimension) -
        salesCatalog.dimensions.indexOf(right.dimension),
    ),
    period: change.period ?? base.period,
    groupBy: change.groupBy ?? base.groupBy,
    comparison: change.comparison ?? base.comparison,
  };
}

/**
 * Slots whose stated value differs from what the draft already holds (or
 * would default to). Restating a known value adds no new request.
 */
export function conflictingSlots(
  base: AnalysisDraft,
  change: AnalysisChange,
): Slot[] {
  const conflicts: Slot[] = [];
  const same = (left: unknown, right: unknown) =>
    JSON.stringify(left) === JSON.stringify(right);
  if (
    change.measure !== null &&
    change.measure !== (base.measure ?? salesCatalog.defaultMeasure)
  )
    conflicts.push("measure");
  if (
    change.period !== null &&
    base.period &&
    !same(change.period, base.period)
  )
    conflicts.push("period");
  if (
    change.groupBy !== null &&
    change.groupBy !== (base.groupBy ?? salesCatalog.defaultGrouping)
  )
    conflicts.push("grouping");
  if (
    change.comparison !== null &&
    change.comparison !== (base.comparison ?? salesCatalog.defaultComparison)
  )
    conflicts.push("comparison");
  for (const filter of change.filters) {
    const current = base.filters.find(
      (item) => item.dimension === filter.dimension,
    );
    const restated =
      filter.action === "set"
        ? current !== undefined &&
          normalizedText(current.text) === normalizedText(filter.text ?? "")
        : current === undefined;
    if (!restated) conflicts.push(filter.dimension);
  }
  return conflicts;
}

export function missingSlots(draft: AnalysisDraft): Slot[] {
  return requiredSlots.filter(
    (slot) => slot === "period" && draft.period === null,
  );
}

/** Applies catalog defaults once every required slot is known. */
export function completeDraft(draft: AnalysisDraft): AnalysisSpec | null {
  if (draft.period === null) return null;
  return {
    measure: draft.measure ?? salesCatalog.defaultMeasure,
    filters: draft.filters,
    period: draft.period,
    groupBy: draft.groupBy ?? salesCatalog.defaultGrouping,
    comparison: draft.comparison ?? salesCatalog.defaultComparison,
  };
}

export type CompiledAnalysis =
  | { ok: true; query: SalesQuery; clamped: boolean }
  | { ok: false; issue: PeriodIssue };

/**
 * Compiles a plan into the bounded execution contract. Unresolvable periods
 * return an issue; out-of-bounds queries still fail validation.
 */
export function compileAnalysis(
  spec: AnalysisSpec,
  today: string,
): CompiledAnalysis {
  const period = resolvePeriod(spec.period, today);
  if (!period.ok) return period;
  const query = validateQuery(
    {
      productSearch:
        spec.filters.find((filter) => filter.dimension === "product")?.text ??
        null,
      startDate: period.startDate,
      endDate: period.endDate,
      metric: spec.measure,
      groupBy: spec.groupBy,
      comparison: spec.comparison,
    },
    today,
  );
  return { ok: true, query, clamped: period.clamped };
}

/** The plan equivalent of an executed query, for contexts saved before plans. */
export function specFromQuery(query: SalesQuery): AnalysisSpec {
  return {
    measure: query.metric,
    filters:
      query.productSearch === null
        ? []
        : [{ dimension: "product", text: query.productSearch }],
    period: rangeExpression(query.startDate, query.endDate),
    groupBy: query.groupBy,
    comparison: query.comparison,
  };
}

/**
 * Compact filter-only description of an analysis for model context. It never
 * contains results, figures or response prose.
 */
export function describeAnalysis(
  analysis: AnalysisDraft,
  query?: SalesQuery,
): string {
  const period = query
    ? `${query.startDate}..${query.endDate}`
    : analysis.period
      ? JSON.stringify(
          Object.fromEntries(
            Object.entries(analysis.period).filter(([, v]) => v !== null),
          ),
        )
      : "unknown";
  const filters = salesCatalog.dimensions.map((dimension) => {
    const filter = analysis.filters.find(
      (item) => item.dimension === dimension,
    );
    return `${dimension}=${filter ? JSON.stringify(filter.text) : "all"}`;
  });
  return [
    `measure=${analysis.measure ?? "unstated"}`,
    ...filters,
    `period=${period}`,
    `groupBy=${analysis.groupBy ?? "unstated"}`,
    `comparison=${analysis.comparison ?? "unstated"}`,
  ].join("; ");
}

/** Case/accent-insensitive comparison form matching the Oracle predicate. */
export function normalizedText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function words(value: string): string[] {
  return normalizedText(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
// Portuguese plural forms map back to a shared singular candidate, so a
// singularized filter remains traceable to the plural the user wrote.
function forms(word: string): Set<string> {
  const result = new Set([word]);
  if (word.length <= 3) return result;
  if (/(?:oes|aes)$/.test(word)) result.add(`${word.slice(0, -3)}ao`);
  if (word.endsWith("ns")) result.add(`${word.slice(0, -2)}m`);
  if (word.endsWith("is")) result.add(`${word.slice(0, -2)}l`);
  if (word.endsWith("es")) result.add(word.slice(0, -2));
  if (word.endsWith("s")) result.add(word.slice(0, -1));
  return result;
}
const overlaps = (left: Set<string>, right: Set<string>) =>
  [...left].some((item) => right.has(item));

/**
 * Whether a filter phrase is written, as a contiguous word sequence, in user
 * text. A constraint the user never wrote must not silently restrict results.
 */
export function groundedIn(
  phrase: string,
  evidence: readonly string[],
): boolean {
  const target = words(phrase).map(forms);
  if (target.length === 0) return false;
  return evidence.some((text) => {
    const candidate = words(text).map(forms);
    for (let start = 0; start + target.length <= candidate.length; start++)
      if (
        target.every((item, index) => overlaps(item, candidate[start + index]))
      )
        return true;
    return false;
  });
}
