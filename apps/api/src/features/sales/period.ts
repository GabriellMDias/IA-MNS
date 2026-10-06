import { Type, type Static, type TSchema } from "typebox";

const nullable = <T extends TSchema>(schema: T) =>
  Type.Union([schema, Type.Null()]);
const isoDate = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

/**
 * A period as the user expressed it. Interpretation names the expression;
 * the application resolves it against the Sao Paulo business date, so
 * relative calendar arithmetic is deterministic and testable. The flat shape
 * keeps strict function calling simple; `kind` selects the relevant fields:
 * - current day/month/year: today, month to date, year to date;
 * - previous day/month/year: yesterday, the previous complete month or year;
 * - last day/month with count: last N days (default including today) or the
 *   N completed months before the current one (default excluding it);
 * - month with optional year: that calendar month, the most recent
 *   non-future occurrence when the year is omitted;
 * - year: that calendar year;
 * - range: explicit inclusive dates for anything else.
 */
export const periodExpressionSchema = Type.Object(
  {
    kind: Type.Union([
      Type.Literal("current"),
      Type.Literal("previous"),
      Type.Literal("last"),
      Type.Literal("month"),
      Type.Literal("year"),
      Type.Literal("range"),
    ]),
    unit: nullable(
      Type.Union([
        Type.Literal("day"),
        Type.Literal("month"),
        Type.Literal("year"),
      ]),
    ),
    count: nullable(Type.Integer({ minimum: 1, maximum: 366 })),
    includeCurrent: nullable(Type.Boolean()),
    month: nullable(Type.Integer({ minimum: 1, maximum: 12 })),
    year: nullable(Type.Integer({ minimum: 2000, maximum: 2100 })),
    startDate: nullable(isoDate),
    endDate: nullable(isoDate),
  },
  { additionalProperties: false },
);
export type PeriodExpression = Static<typeof periodExpressionSchema>;

/** Why a period cannot be queried; each maps to a period clarification. */
export type PeriodIssue =
  "incomplete" | "invalid" | "future" | "too_long" | "too_early";
export type PeriodResolution =
  | { ok: true; startDate: string; endDate: string; clamped: boolean }
  | { ok: false; issue: PeriodIssue };

const earliest = "2000-01-01";
const dayMs = 86400000;
const pad = (value: number) => String(value).padStart(2, "0");
function parse(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? parsed
    : null;
}
const addDays = (value: string, days: number) =>
  new Date(parse(value)!.getTime() + days * dayMs).toISOString().slice(0, 10);
function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
const monthStart = (year: number, month: number) => `${year}-${pad(month)}-01`;
const monthEnd = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

function bounds(
  expression: PeriodExpression,
  today: string,
): [string, string] | PeriodIssue {
  const [year, month] = today.split("-").map(Number);
  const { unit, count } = expression;
  switch (expression.kind) {
    case "current":
      if (unit === "day") return [today, today];
      if (unit === "month") return [monthStart(year, month), today];
      if (unit === "year") return [`${year}-01-01`, today];
      return "incomplete";
    case "previous": {
      if (unit === "day") return [addDays(today, -1), addDays(today, -1)];
      if (unit === "year") return [`${year - 1}-01-01`, `${year - 1}-12-31`];
      if (unit !== "month") return "incomplete";
      const prior = shiftMonth(year, month, -1);
      return [
        monthStart(prior.year, prior.month),
        monthEnd(prior.year, prior.month),
      ];
    }
    case "last": {
      if (count === null) return "incomplete";
      if (unit === "day")
        return expression.includeCurrent === false
          ? [addDays(today, -count), addDays(today, -1)]
          : [addDays(today, -(count - 1)), today];
      if (unit !== "month") return unit === null ? "incomplete" : "invalid";
      if (expression.includeCurrent === true) {
        const first = shiftMonth(year, month, -(count - 1));
        return [monthStart(first.year, first.month), today];
      }
      const first = shiftMonth(year, month, -count);
      const last = shiftMonth(year, month, -1);
      return [
        monthStart(first.year, first.month),
        monthEnd(last.year, last.month),
      ];
    }
    case "month": {
      if (expression.month === null) return "incomplete";
      const target =
        expression.year ?? (expression.month <= month ? year : year - 1);
      return [
        monthStart(target, expression.month),
        monthEnd(target, expression.month),
      ];
    }
    case "year":
      if (expression.year === null) return "incomplete";
      return [`${expression.year}-01-01`, `${expression.year}-12-31`];
    case "range":
      if (expression.startDate === null || expression.endDate === null)
        return "incomplete";
      if (!parse(expression.startDate) || !parse(expression.endDate))
        return "invalid";
      return [expression.startDate, expression.endDate];
  }
}

/**
 * Resolves an expression to inclusive dates. A period that has started is
 * clamped to today rather than querying the future; one that has not started
 * cannot be queried.
 */
export function resolvePeriod(
  expression: PeriodExpression,
  today: string,
): PeriodResolution {
  const resolved = bounds(expression, today);
  if (typeof resolved === "string") return { ok: false, issue: resolved };
  const [startDate, end] = resolved;
  if (startDate > end) return { ok: false, issue: "invalid" };
  if (startDate > today) return { ok: false, issue: "future" };
  if (startDate < earliest) return { ok: false, issue: "too_early" };
  const endDate = end > today ? today : end;
  const days =
    (parse(endDate)!.getTime() - parse(startDate)!.getTime()) / dayMs + 1;
  if (days > 366) return { ok: false, issue: "too_long" };
  return { ok: true, startDate, endDate, clamped: endDate !== end };
}

/** Bounded, content-free label of the expression form, for metadata. */
export function periodKind(expression: PeriodExpression): string {
  return ["current", "previous", "last"].includes(expression.kind) &&
    expression.unit
    ? `${expression.kind}_${expression.unit}`
    : expression.kind;
}

/** An explicit range expression for already resolved dates. */
export function rangeExpression(
  startDate: string,
  endDate: string,
): PeriodExpression {
  return {
    kind: "range",
    unit: null,
    count: null,
    includeCurrent: null,
    month: null,
    year: null,
    startDate,
    endDate,
  };
}
