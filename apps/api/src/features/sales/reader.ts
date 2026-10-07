import type { SalesData, SalesQuery, SalesRow } from "./domain.js";

/**
 * The read port of one sales source. Each adapter owns its database, its
 * reviewed fixed SQL and its read-only transaction; the application chooses
 * which adapters run and never combines their figures.
 */
export interface SalesReader {
  read(
    this: void,
    query: SalesQuery,
    signal: AbortSignal,
  ): Promise<{ current: SalesData; previous: SalesData | null }>;
  close(this: void): Promise<void>;
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
      (query.groupBy === "month"
        ? row.period < query.startDate.slice(0, 7) ||
          row.period > query.endDate.slice(0, 7)
        : row.period !== "total") ||
      (query.groupBy === "product"
        ? row.product === null
        : row.product !== null)
    )
      return false;
    keys.add(key);
  }
  return true;
}
