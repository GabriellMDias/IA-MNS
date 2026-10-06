import { Type, type Static, type TSchema } from "typebox";
import {
  comparisonSchema,
  dimensionSchema,
  filterTextSchema,
  groupingSchema,
  measureSchema,
  salesCatalog,
  type AnalysisChange,
} from "./analysis.js";
import { periodExpressionSchema } from "./period.js";

const object = { additionalProperties: false };
const nullable = <T extends TSchema>(schema: T) =>
  Type.Union([schema, Type.Null()]);

/**
 * The model's structured reading of one message: a decision, how the message
 * relates to the conversation state, and only what the message itself states.
 * It never contains SQL, figures or user-visible prose; the application merges
 * the change into its state and decides what to execute or ask.
 */
export const interpretationSchema = Type.Object(
  {
    decision: Type.Union([
      Type.Literal("analyze"),
      Type.Literal("clarify"),
      Type.Literal("unsupported"),
    ]),
    relation: Type.Union([
      Type.Literal("new"),
      Type.Literal("refine"),
      Type.Literal("answer_pending"),
    ]),
    measure: nullable(measureSchema),
    filters: Type.Array(
      Type.Object(
        {
          dimension: dimensionSchema,
          action: Type.Union([Type.Literal("set"), Type.Literal("clear")]),
          text: nullable(filterTextSchema),
        },
        object,
      ),
      { maxItems: salesCatalog.dimensions.length },
    ),
    period: nullable(periodExpressionSchema),
    groupBy: nullable(groupingSchema),
    comparison: nullable(comparisonSchema),
    clarification: nullable(
      Type.Union([
        Type.Literal("period"),
        Type.Literal("product"),
        Type.Literal("measure"),
        Type.Literal("comparison"),
        Type.Literal("ambiguous"),
      ]),
    ),
    unsupportedReason: nullable(
      Type.Union([
        Type.Literal("dimension"),
        Type.Literal("measure"),
        Type.Literal("operation"),
        Type.Literal("domain"),
      ]),
    ),
  },
  object,
);
export type Interpretation = Static<typeof interpretationSchema>;

/** Semantic consistency beyond the schema; inconsistent output is not trusted. */
export function interpretationIssues(value: Interpretation): string[] {
  const issues: string[] = [];
  if ((value.decision === "clarify") !== (value.clarification !== null))
    issues.push("clarification_mismatch");
  if ((value.decision === "unsupported") !== (value.unsupportedReason !== null))
    issues.push("unsupported_reason_mismatch");
  if (
    value.filters.some(
      (filter) => (filter.action === "set") !== (filter.text !== null),
    )
  )
    issues.push("filter_action_mismatch");
  if (
    new Set(value.filters.map((filter) => filter.dimension)).size !==
    value.filters.length
  )
    issues.push("duplicate_filter");
  return issues;
}

export function changeOf(value: Interpretation): AnalysisChange {
  return {
    measure: value.measure,
    filters: value.filters,
    period: value.period,
    groupBy: value.groupBy,
    comparison: value.comparison,
  };
}
