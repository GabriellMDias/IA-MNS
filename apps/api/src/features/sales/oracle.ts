import oracledb from "oracledb";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import type { ServerConfig } from "../../config.js";
import { ensureOracleClient } from "../../oracle-client.js";
import { comparisonQuery, type SalesData, type SalesQuery } from "./domain.js";
import { SalesFailure } from "./errors.js";
import { aggregateSql, matchingProductsSql, queryBindings } from "./query.js";

export interface SalesReader {
  read(
    this: void,
    query: SalesQuery,
    signal: AbortSignal,
  ): Promise<{ current: SalesData; previous: SalesData | null }>;
  close(this: void): Promise<void>;
}
const aggregateRowSchema = Type.Object({
  PERIOD: Type.String({ pattern: "^(?:total|\\d{4}-(?:0[1-9]|1[0-2]))$" }),
  PRODUCT: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  UNIT: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  VALUE: Type.String({ pattern: "^-?\\d+(?:\\.\\d+)?$" }),
  MISSING_WEIGHT: Type.Integer({ minimum: 0 }),
});
const aggregateRowsSchema = Type.Array(aggregateRowSchema);
const productRowSchema = Type.Object({
  CODE: Type.String({ pattern: "^\\d+$" }),
  DESCRIPTION: Type.String({ minLength: 1 }),
});
const productRowsSchema = Type.Array(productRowSchema);
type AggregateRow = Static<typeof aggregateRowSchema>;
type ProductRow = Static<typeof productRowSchema>;

export function createOracleReader(config: ServerConfig): SalesReader {
  let poolPromise: Promise<oracledb.Pool> | undefined;
  function pool() {
    if (!poolPromise) {
      ensureOracleClient(config.oracleClientLibDir);
      poolPromise = oracledb
        .createPool({
          user: config.sankhyaUser,
          password: config.sankhyaPassword,
          connectString: config.sankhyaConnectString,
          poolMin: 0,
          poolMax: 3,
          poolIncrement: 1,
          queueMax: 6,
          queueTimeout: 5000,
          connectTimeout: 5,
          stmtCacheSize: 10,
        })
        .catch((cause: unknown) => {
          poolPromise = undefined;
          throw cause;
        });
    }
    return poolPromise;
  }
  return {
    async read(query, signal) {
      let connection: oracledb.Connection | undefined;
      let result:
        { current: SalesData; previous: SalesData | null } | undefined;
      let failure: SalesFailure | undefined;
      let stage: "connection" | "query" = "connection";
      const interrupt = () => {
        void connection?.break().catch(() => undefined);
      };
      try {
        signal.throwIfAborted();
        connection = await (await pool()).getConnection();
        stage = "query";
        signal.throwIfAborted();
        connection.callTimeout = 45000;
        signal.addEventListener("abort", interrupt, { once: true });
        // All statements in both periods see one Oracle snapshot. SELECT-only
        // grants are still mandatory: this transaction is defense in depth.
        await connection.execute("SET TRANSACTION READ ONLY");
        const fetch = async (period: SalesQuery): Promise<SalesData> => {
          signal.throwIfAborted();
          const binds = queryBindings(period);
          const aggregates = await connection!.execute<AggregateRow>(
            aggregateSql(period),
            binds,
            {
              outFormat: oracledb.OUT_FORMAT_OBJECT,
              maxRows: 501,
              // Fetch the complete bounded result together. The local legacy
              // Oracle/Thick stack produced intermittent record differences
              // across small fetch batches during reference reconciliation.
              fetchArraySize: 501,
              autoCommit: false,
            },
          );
          if (!Value.Check(aggregateRowsSchema, aggregates.rows))
            throw new Error("Invalid sales aggregate response");
          const rows = aggregates.rows;
          if (rows.length > 500)
            throw new SalesFailure("SALES_RESULT_TOO_LARGE");
          const keys = new Set<string>();
          for (const row of rows) {
            const key = JSON.stringify([row.PERIOD, row.PRODUCT, row.UNIT]);
            if (
              keys.has(key) ||
              (period.groupBy === "month"
                ? row.PERIOD < period.startDate.slice(0, 7) ||
                  row.PERIOD > period.endDate.slice(0, 7)
                : row.PERIOD !== "total") ||
              (period.groupBy === "product"
                ? row.PRODUCT === null
                : row.PRODUCT !== null) ||
              (period.metric === "net_value" && row.UNIT !== "BRL") ||
              (period.metric === "weight" && row.UNIT !== "PESOLIQ")
            )
              throw new Error("Sales aggregate does not match its query scope");
            keys.add(key);
          }
          const products =
            period.productSearch === null
              ? []
              : (
                  await connection!.execute<ProductRow>(
                    matchingProductsSql,
                    binds,
                    {
                      outFormat: oracledb.OUT_FORMAT_OBJECT,
                      maxRows: 101,
                      fetchArraySize: 101,
                      autoCommit: false,
                    },
                  )
                ).rows;
          if (!Value.Check(productRowsSchema, products))
            throw new Error("Invalid sales product response");
          if (products.length > 100)
            throw new SalesFailure("SALES_RESULT_TOO_LARGE");
          return {
            rows: rows.map((row) => ({
              period: row.PERIOD,
              product: row.PRODUCT,
              unit: row.UNIT ?? "UNSPECIFIED",
              value: row.VALUE,
            })),
            products: products.map((row) => ({
              code: row.CODE,
              description: row.DESCRIPTION,
            })),
            missingWeight: rows.some((row) => row.MISSING_WEIGHT > 0),
          };
        };
        const current = await fetch(query);
        const comparison = comparisonQuery(query);
        const previous = comparison ? await fetch(comparison) : null;
        signal.throwIfAborted();
        result = { current, previous };
      } catch (cause) {
        failure =
          cause instanceof SalesFailure
            ? cause
            : new SalesFailure("SALES_PROVIDER_UNAVAILABLE", cause, {
                provider: "oracle",
                stage,
              });
      } finally {
        signal.removeEventListener("abort", interrupt);
        if (connection) {
          try {
            try {
              await connection.rollback();
            } finally {
              await connection.close();
            }
          } catch (cause) {
            failure = new SalesFailure("SALES_PROVIDER_UNAVAILABLE", cause, {
              provider: "oracle",
              stage: "cleanup",
            });
          }
        }
      }
      if (failure) throw failure;
      return result!;
    },
    async close() {
      const closing = poolPromise;
      poolPromise = undefined;
      if (closing) await (await closing).close(0);
    },
  };
}
