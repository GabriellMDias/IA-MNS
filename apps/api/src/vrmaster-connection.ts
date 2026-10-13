import pg from "pg";
import type { ServerConfig } from "./config.js";

/**
 * The dedicated read-only VRMaster PostgreSQL account (PH-19). Sales and
 * product lookup read the same database with the same account; each owns its
 * pool and its fixed SQL.
 */
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
// (PH-19); every transaction repeats both limits as defense in depth.
export const vrmasterTransactionSettings: readonly string[] = [
  "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
  "SET LOCAL statement_timeout = '30s'",
  "SET LOCAL lock_timeout = '5s'",
  "SET LOCAL idle_in_transaction_session_timeout = '60s'",
  "SET LOCAL TIME ZONE 'America/Sao_Paulo'",
];

/** A small bounded pool; connections close when idle. */
export function createVrmasterPool(connection: VrmasterConnection): pg.Pool {
  const pool = new pg.Pool({
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
