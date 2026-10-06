import { Type, type Static } from "typebox";
import {
  comparisonSchema,
  groupingSchema,
  measureSchema,
  type Dimension,
} from "../src/features/sales/analysis.js";
import type { Interpretation } from "../src/features/sales/interpretation.js";
import {
  periodExpressionSchema,
  type PeriodExpression,
} from "../src/features/sales/period.js";
import { routeSchema, type AgentRoute } from "../src/features/agent/planner.js";

const object = { additionalProperties: false };

/** A period with only its relevant fields; the rest default to null. */
export const periodFixtureSchema = Type.Partial(periodExpressionSchema);
export type PeriodFixture = Static<typeof periodFixtureSchema>;
export function period(fixture: PeriodFixture): PeriodExpression {
  return {
    kind: "range",
    unit: null,
    count: null,
    includeCurrent: null,
    month: null,
    year: null,
    startDate: null,
    endDate: null,
    ...fixture,
  };
}

/**
 * Compact interpretation used by datasets and tests. Omitted fields are
 * unstated (null); `filters` maps a dimension to a phrase to set, or to null
 * to clear it.
 */
export const interpretationFixtureSchema = Type.Object(
  {
    decision: Type.Optional(
      Type.Union([
        Type.Literal("analyze"),
        Type.Literal("clarify"),
        Type.Literal("unsupported"),
      ]),
    ),
    relation: Type.Optional(
      Type.Union([
        Type.Literal("new"),
        Type.Literal("refine"),
        Type.Literal("answer_pending"),
      ]),
    ),
    measure: Type.Optional(measureSchema),
    filters: Type.Optional(
      Type.Object(
        { product: Type.Optional(Type.Union([Type.String(), Type.Null()])) },
        object,
      ),
    ),
    period: Type.Optional(periodFixtureSchema),
    groupBy: Type.Optional(groupingSchema),
    comparison: Type.Optional(comparisonSchema),
    clarification: Type.Optional(
      Type.Union([
        Type.Literal("period"),
        Type.Literal("product"),
        Type.Literal("measure"),
        Type.Literal("comparison"),
        Type.Literal("ambiguous"),
      ]),
    ),
    unsupportedReason: Type.Optional(
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
export type InterpretationFixture = Static<typeof interpretationFixtureSchema>;

export function interpretation(
  fixture: InterpretationFixture = {},
): Interpretation {
  return {
    decision: fixture.decision ?? "analyze",
    relation: fixture.relation ?? "new",
    measure: fixture.measure ?? null,
    filters: Object.entries(fixture.filters ?? {}).map(([dimension, text]) => ({
      dimension: dimension as Dimension,
      action: text === null ? ("clear" as const) : ("set" as const),
      text: text ?? null,
    })),
    period: fixture.period ? period(fixture.period) : null,
    groupBy: fixture.groupBy ?? null,
    comparison: fixture.comparison ?? null,
    clarification: fixture.clarification ?? null,
    unsupportedReason: fixture.unsupportedReason ?? null,
  };
}

export const routeFixtureSchema = routeSchema;
export type RouteFixture = AgentRoute;
export const salesRoute: AgentRoute = {
  intent: "capability",
  capabilityId: "sales",
};
