import pg from "pg";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import type { ServerConfig } from "../../config.js";
import { comparisonQuery, type SalesData, type SalesQuery } from "./domain.js";
import { SalesFailure } from "./errors.js";
import { rowsMatchScope, type SalesReader } from "./reader.js";
import {
  vrmasterAggregateSql,
  vrmasterParameters,
  vrmasterProductsSql,
} from "./vrmaster-query.js";

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

export type VrmasterConnection = Readonly<{
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: "verify-full" | "disable";
}>;

export function vrmasterConnection(
  config: ServerConfig,
): VrmasterConnection | undefined {
  if (
    !config.vrmasterHost ||
    !config.vrmasterDatabase ||
    !config.vrmasterUser ||
    !config.vrmasterPassword
  )
    return undefined;
  return {
    host: config.vrmasterHost,
    port: config.vrmasterPort,
    database: config.vrmasterDatabase,
    user: config.vrmasterUser,
    password: config.vrmasterPassword,
    ssl: config.vrmasterSslMode,
  };
}

// The account is read-only and has its own 30-second statement timeout
// (PH-19); the transaction repeats both limits as defense in depth.
const transactionSettings = [
  "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
  "SET LOCAL statement_timeout = '30s'",
  "SET LOCAL lock_timeout = '5s'",
  "SET LOCAL idle_in_transaction_session_timeout = '60s'",
  "SET LOCAL TIME ZONE 'America/Sao_Paulo'",
];

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
    pool = new pg.Pool({
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.user,
      password: connection.password,
      ssl:
        connection.ssl === "verify-full" ? { rejectUnauthorized: true } : false,
      application_name: "ia-mns",
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 30000,
      query_timeout: 35000,
      allowExitOnIdle: true,
    });
    // An idle connection that drops is discarded by the pool; the next read
    // opens a new one and reports its own failure. Unhandled, it would crash.
    pool.on("error", () => undefined);
    return pool;
  }
  return {
    async read(query, signal) {
      if (query.metric === "weight")
        throw new Error("VRMaster has no reviewed weight measure");
      let client: pg.PoolClient | undefined;
      let destroyed = false;
      let result:
        { current: SalesData; previous: SalesData | null } | undefined;
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
        for (const statement of transactionSettings)
          await client.query(statement);
        const fetch = async (period: SalesQuery): Promise<SalesData> => {
          signal.throwIfAborted();
          const values = vrmasterParameters(period);
          const aggregates = await client!.query<AggregateRow>(
            vrmasterAggregateSql(period),
            values,
          );
          if (!Value.Check(aggregateRowsSchema, aggregates.rows))
            throw new Error("Invalid VRMaster aggregate response");
          const rows = aggregates.rows;
          if (rows.length > 500)
            throw new SalesFailure("SALES_RESULT_TOO_LARGE");
          if (
            !rowsMatchScope(period, rows) ||
            (period.metric === "net_value" &&
              rows.some((row) => row.unit !== "BRL")) ||
            (period.metric === "quantity" &&
              rows.some((row) => row.unit === "BRL"))
          )
            throw new Error(
              "VRMaster aggregate does not match its query scope",
            );
          const products =
            period.productSearch === null
              ? []
              : (await client!.query<ProductRow>(vrmasterProductsSql, values))
                  .rows;
          if (!Value.Check(productRowsSchema, products))
            throw new Error("Invalid VRMaster product response");
          if (products.length > 100)
            throw new SalesFailure("SALES_RESULT_TOO_LARGE");
          return {
            rows: rows.map((row) => ({
              period: row.period,
              product: row.product,
              unit: row.unit,
              value: row.value,
            })),
            products: products.map((row) => ({
              code: row.code,
              description: row.description,
            })),
            missingWeight: false,
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
    },
    async close() {
      const closing = pool;
      pool = undefined;
      await closing?.end();
    },
  };
}
