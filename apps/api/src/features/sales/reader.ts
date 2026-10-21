import {
  businessToday,
  validateQuery,
  type SalesData,
  type SalesQuery,
  type SalesRow,
} from "./domain.js";
import type { DataScope } from "../../access.js";
import type { SalesProductScope } from "./product-scope.js";
import { SalesFailure } from "./errors.js";
import { supportsMetric, type SalesSource } from "./sources.js";

export type SalesReadResult = {
  current: SalesData;
  previous: SalesData | null;
};

/**
 * The read port of one sales source. Each adapter owns its database, its
 * reviewed fixed SQL and its read-only transaction; the application chooses
 * which adapters run and never combines their figures. A restricted scope
 * admits only the rows its rules admit, enforced in the adapter's SQL.
 */
export interface SalesReader {
  read(
    this: void,
    query: SalesQuery,
    signal: AbortSignal,
    products?: SalesProductScope,
    restriction?: DataScope,
  ): Promise<SalesReadResult>;
  /** A bounded analytical plan; all measures read one ERP snapshot. */
  readMany?(
    this: void,
    queries: readonly SalesQuery[],
    signal: AbortSignal,
    products?: SalesProductScope,
    restriction?: DataScope,
  ): Promise<SalesReadResult[]>;
  close(this: void): Promise<void>;
}

/** Reject a malformed or unbounded batch before opening an ERP connection. */
export function validateReadBatch(
  queries: readonly SalesQuery[],
  source: SalesSource,
  scope?: SalesProductScope,
): void {
  if (
    queries.length < 1 ||
    queries.length > 3 ||
    new Set(queries.map((query) => query.metric)).size !== queries.length ||
    (scope && scope.source !== source)
  )
    throw new SalesFailure("SALES_QUERY_INVALID");
  const first = queries[0];
  for (const query of queries) {
    validateQuery(query, businessToday());
    if (
      !supportsMetric(source, query.metric) ||
      (scope && query.productSearch !== null) ||
      query.startDate !== first.startDate ||
      query.endDate !== first.endDate ||
      query.productSearch !== first.productSearch ||
      query.groupBy !== first.groupBy ||
      query.comparison !== first.comparison
    )
      throw new SalesFailure("SALES_QUERY_INVALID");
  }
}

/**
 * Whether aggregate rows stay inside the scope of their query: unique keys,
 * periods within the requested months and product labels only when grouping by
 * product. Units are checked by each adapter, since they are source-specific.
 */
export function rowsMatchScope(
  query: SalesQuery,
  rows: readonly Pick<SalesRow, "period" | "product" | "unit">[],
): boolean {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = JSON.stringify([row.period, row.product, row.unit]);
    if (
      keys.has(key) ||
      (query.groupBy === "month" || query.groupBy === "month_product"
        ? row.period < query.startDate.slice(0, 7) ||
          row.period > query.endDate.slice(0, 7)
        : row.period !== "total") ||
      (query.groupBy === "product" || query.groupBy === "month_product"
        ? row.product === null
        : row.product !== null)
    )
      return false;
    keys.add(key);
  }
  return true;
}
