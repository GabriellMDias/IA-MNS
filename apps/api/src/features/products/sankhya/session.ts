import oracledb from "oracledb";
import type { ServerConfig } from "../../../config.js";
import { ensureOracleClient } from "../../../oracle-client.js";
import { ProductFailure } from "../errors.js";

export type SankhyaConnection = Pick<
  ServerConfig,
  | "sankhyaUser"
  | "sankhyaPassword"
  | "sankhyaConnectString"
  | "oracleClientLibDir"
>;
export type OracleRow = Record<string, unknown>;
export interface OracleSession {
  query(
    sql: string,
    binds?: oracledb.BindParameters,
    limit?: number,
  ): Promise<OracleRow[]>;
}
export interface OracleReader {
  read<T>(
    signal: AbortSignal,
    operation: (session: OracleSession) => Promise<T>,
  ): Promise<T>;
  close(): Promise<void>;
}

/** The approved discovery account is never accepted by the runtime reader. */
export function privilegeProblems(
  privileges: readonly string[],
  ownsErp: boolean,
): string[] {
  return [
    ...(ownsErp ? ["ERP object ownership"] : []),
    ...privileges.filter(
      (privilege) => privilege !== "CREATE SESSION" && privilege !== "SELECT",
    ),
  ];
}

/** Dedicated small pool; no session is exposed outside a rolled-back read-only transaction. */
export function createOracleProductReader(
  connection: SankhyaConnection,
  purpose: "runtime" | "discovery" = "runtime",
): OracleReader {
  let pool: Promise<oracledb.Pool> | undefined;
  const acquire = () => {
    ensureOracleClient(connection.oracleClientLibDir);
    return (pool ??= oracledb
      .createPool({
        user: connection.sankhyaUser,
        password: connection.sankhyaPassword,
        connectString: connection.sankhyaConnectString,
        poolMin: 0,
        poolMax: 2,
        poolIncrement: 1,
        queueMax: 4,
        queueTimeout: 5000,
        connectTimeout: 5,
        stmtCacheSize: 20,
      })
      .catch((cause: unknown) => {
        pool = undefined;
        throw cause;
      }));
  };
  return {
    async read<T>(
      signal: AbortSignal,
      operation: (session: OracleSession) => Promise<T>,
    ): Promise<T> {
      let client: oracledb.Connection | undefined;
      let stage: "connection" | "catalog" | "query" | "cleanup" = "connection";
      const interrupt = () => {
        void client?.break().catch(() => undefined);
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      let failed = true;
      let result!: T;
      let failure: ProductFailure | undefined;
      try {
        signal.throwIfAborted();
        client = await (await acquire()).getConnection();
        signal.throwIfAborted();
        client.callTimeout = 15000;
        signal.addEventListener("abort", interrupt, { once: true });
        const deadline = Date.now() + 30000;
        timer = setTimeout(interrupt, 30000);
        await client.execute("SET TRANSACTION READ ONLY");
        const session: OracleSession = {
          async query(sql, binds = {}, limit = 2000) {
            signal.throwIfAborted();
            if (Date.now() >= deadline)
              throw new Error("Product read budget exhausted");
            if (
              !/^\s*(SELECT|WITH)\b/i.test(sql) ||
              /;|\bFOR\s+UPDATE\b/i.test(sql)
            )
              throw new Error("Only internal SELECT statements are accepted");
            if (!Number.isInteger(limit) || limit < 1 || limit > 12000)
              throw new Error("Invalid read bound");
            client!.callTimeout = Math.max(
              1,
              Math.min(15000, deadline - Date.now()),
            );
            const result = await client!.execute<OracleRow>(sql, binds, {
              outFormat: oracledb.OUT_FORMAT_OBJECT,
              maxRows: limit + 1,
              fetchArraySize: Math.min(limit + 1, 201),
              autoCommit: false,
              fetchTypeHandler: (metadata) =>
                metadata.dbType === oracledb.DB_TYPE_CLOB
                  ? { type: oracledb.STRING }
                  : undefined,
            });
            signal.throwIfAborted();
            if (Date.now() >= deadline)
              throw new Error("Product read budget exhausted");
            if (!result.rows || result.rows.length > limit)
              throw new Error("Product metadata or result exceeded its bound");
            return result.rows;
          },
        };
        if (purpose === "runtime") {
          stage = "catalog";
          const privileges = await session.query(
            "SELECT PRIVILEGE FROM SESSION_PRIVS UNION SELECT PRIVILEGE FROM USER_TAB_PRIVS_RECD UNION SELECT PRIVILEGE FROM ROLE_TAB_PRIVS WHERE ROLE IN (SELECT ROLE FROM SESSION_ROLES)",
          );
          const owned = await session.query(
            "SELECT COUNT(*) N FROM USER_TABLES WHERE TABLE_NAME LIKE 'TGF%' OR TABLE_NAME LIKE 'TDD%' OR TABLE_NAME IN ('TSICUS', 'AD_LISTADCEMB')",
            {},
            1,
          );
          if (
            privilegeProblems(
              privileges.map((row) => String(row.PRIVILEGE)),
              Number(owned[0]?.N) > 0,
            ).length > 0
          )
            throw new Error("A SELECT-only non-owner ERP account is required");
        }
        stage = "query";
        result = await operation(session);
        stage = "cleanup";
        await client.rollback();
        signal.throwIfAborted();
        if (Date.now() >= deadline)
          throw new Error("Product read budget exhausted");
        failed = false;
      } catch (cause) {
        failure =
          cause instanceof ProductFailure
            ? cause
            : new ProductFailure(
                "PRODUCTS_PROVIDER_UNAVAILABLE",
                { provider: "oracle", stage },
                cause,
              );
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", interrupt);
        if (client) {
          let cleanupFailed = false;
          try {
            await client.rollback();
          } catch (cause) {
            cleanupFailed = true;
            failure ??= new ProductFailure(
              "PRODUCTS_PROVIDER_UNAVAILABLE",
              { provider: "oracle", stage: "cleanup" },
              cause,
            );
          }
          try {
            await client.close({
              drop: failed || cleanupFailed || signal.aborted,
            });
          } catch (cause) {
            failure ??= new ProductFailure(
              "PRODUCTS_PROVIDER_UNAVAILABLE",
              { provider: "oracle", stage: "cleanup" },
              cause,
            );
          }
        }
      }
      if (signal.aborted)
        failure ??= new ProductFailure(
          "PRODUCTS_PROVIDER_UNAVAILABLE",
          { provider: "oracle", stage: "cleanup" },
          signal.reason,
        );
      if (failure) throw failure;
      return result;
    },
    async close() {
      const active = pool;
      pool = undefined;
      const created = await active?.catch(() => undefined);
      try {
        await created?.close(0);
      } catch (cause) {
        throw new ProductFailure(
          "PRODUCTS_PROVIDER_UNAVAILABLE",
          { provider: "oracle", stage: "cleanup" },
          cause,
        );
      }
    },
  };
}
