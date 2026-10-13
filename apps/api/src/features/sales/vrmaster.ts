import type pg from "pg";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import {
  createVrmasterPool,
  vrmasterTransactionSettings,
  type VrmasterConnection,
} from "../../vrmaster-connection.js";
import { comparisonQuery, type SalesData, type SalesQuery } from "./domain.js";
import { SalesFailure } from "./errors.js";
import {
  rowsMatchScope,
  validateReadBatch,
  type SalesReader,
  type SalesReadResult,
} from "./reader.js";
import type { SalesProductScope } from "./product-scope.js";
import {
  vrmasterAggregateSql,
  vrmasterParameters,
  vrmasterMatchingProductsSql,
} from "./vrmaster-query.js";

export {
  vrmasterConnection,
  type VrmasterConnection,
} from "../../vrmaster-connection.js";

const aggregateRowSchema = Type.Object({
  period: Type.String({ pattern: "^(?:total|\\d{4}-(?:0[1-9]|1[0-2]))$" }),
  product: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  unit: Type.String({ pattern: "^(?:BRL|UNSPECIFIED|EMBALAGEM:-?\\d+)$" }),
  value: Type.String({ pattern: "^-?\\d+(?:\\.\\d+)?$" }),
});
const aggregateRowsSchema = Type.Array(aggregateRowSchema);
const productRowsSchema = Type.Array(
  Type.Object({
    code: Type.String({ pattern: "^-?\\d+$" }),
    description: Type.String({ minLength: 1 }),
  }),
);
type AggregateRow = Static<typeof aggregateRowSchema>;
type ProductRow = Static<(typeof productRowsSchema)["items"]>;

/**
 * PostgreSQL adapter of the VRMaster sales source. It only knows the VRMaster
 * reference query; both periods and the matched products read one snapshot
 * inside a read-only transaction that is always rolled back.
 */
export function createVrmasterReader(
  connection: VrmasterConnection,
): SalesReader {
  let pool: pg.Pool | undefined;
  function connect() {
    if (pool) return pool;
    pool = createVrmasterPool(connection);
    return pool;
  }
  async function readMany(
    queries: readonly SalesQuery[],
    signal: AbortSignal,
    scope?: SalesProductScope,
  ): Promise<SalesReadResult[]> {
    validateReadBatch(queries, "vrmaster", scope);
    let client: pg.PoolClient | undefined;
    let destroyed = false;
    let result: SalesReadResult[] | undefined;
    let failure: SalesFailure | undefined;
    let stage: "connection" | "query" = "connection";
    // pg has no statement cancellation through AbortSignal: ending the
    // connection stops the read; the server-side timeouts bound the rest.
    const interrupt = () => {
      if (client && !destroyed) {
        destroyed = true;
        client.release(new Error("Sales read aborted"));
      }
    };
    try {
      signal.throwIfAborted();
      client = await connect().connect();
      stage = "query";
      signal.throwIfAborted();
      signal.addEventListener("abort", interrupt, { once: true });
      for (const statement of vrmasterTransactionSettings)
        await client.query(statement);
      const productCache = new Map<string, ProductRow[]>();
      const fetch = async (period: SalesQuery): Promise<SalesData> => {
        signal.throwIfAborted();
        const values = [
          ...vrmasterParameters(period),
          ...(scope?.source === "vrmaster" ? scope.values : []),
        ];
        const aggregates = await client!.query<AggregateRow>(
          vrmasterAggregateSql(period, scope),
          values,
        );
        if (!Value.Check(aggregateRowsSchema, aggregates.rows))
          throw new Error("Invalid VRMaster aggregate response");
        const rows = aggregates.rows;
        if (rows.length > 500) throw new SalesFailure("SALES_RESULT_TOO_LARGE");
        if (
          !rowsMatchScope(period, rows) ||
          (period.metric === "net_value" &&
            rows.some((row) => row.unit !== "BRL")) ||
          (period.metric === "quantity" &&
            rows.some((row) => row.unit === "BRL"))
        )
          throw new Error("VRMaster aggregate does not match its query scope");
        const productKey = `${period.startDate}:${period.endDate}`;
        const products =
          productCache.get(productKey) ??
          (period.productSearch === null && !scope
            ? []
            : (
                await client!.query<ProductRow>(
                  vrmasterMatchingProductsSql(scope),
                  values,
                )
              ).rows);
        if (!Value.Check(productRowsSchema, products))
          throw new Error("Invalid VRMaster product response");
        productCache.set(productKey, products);
        if (products.length > 100 && !scope)
          throw new SalesFailure("SALES_RESULT_TOO_LARGE");
        return {
          rows: rows.map((row) => ({
            period: row.period,
            product: row.product,
            unit: row.unit,
            value: row.value,
          })),
          products: products.slice(0, 100).map((row) => ({
            code: row.code,
            description: row.description,
          })),
          missingWeight: false,
          ...(scope ? { productsTruncated: products.length > 100 } : {}),
        };
      };
      const batch: SalesReadResult[] = [];
      for (const query of queries) {
        const current = await fetch(query);
        const comparison = comparisonQuery(query);
        const previous = comparison ? await fetch(comparison) : null;
        batch.push({ current, previous });
      }
      signal.throwIfAborted();
      result = batch;
    } catch (cause) {
      failure =
        cause instanceof SalesFailure
          ? cause
          : new SalesFailure("SALES_PROVIDER_UNAVAILABLE", cause, {
              provider: "postgresql",
              stage,
            });
    } finally {
      signal.removeEventListener("abort", interrupt);
      if (client && !destroyed) {
        try {
          await client.query("ROLLBACK");
          client.release();
        } catch (cause) {
          client.release(cause instanceof Error ? cause : true);
          failure ??= new SalesFailure("SALES_PROVIDER_UNAVAILABLE", cause, {
            provider: "postgresql",
            stage: "cleanup",
          });
        }
      }
    }
    if (failure) throw failure;
    return result!;
  }
  return {
    async read(query, signal, scope) {
      return (await readMany([query], signal, scope))[0];
    },
    readMany,
    async close() {
      const closing = pool;
      pool = undefined;
      await closing?.end();
    },
  };
}
