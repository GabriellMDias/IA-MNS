/** Fixed, bounded inspections only; no SQL supplied by a user or a model. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { loadDiscoveryConfig } from "./discovery-config.js";
import { createOracleProductReader } from "../src/features/products/sankhya/session.js";
import {
  vrmasterConnection,
  vrmasterTransactionSettings,
} from "../src/vrmaster-connection.js";

async function main() {
  const [erp, ...args] = process.argv.slice(2);
  if (erp !== "sankhya" && erp !== "vrmaster")
    throw new Error(
      "Use erp:discovery sankhya|vrmaster --schema NAME --table NAME [--columns NAME,NAME] [--limit 1..100]",
    );
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (
      !key ||
      !["--schema", "--table", "--columns", "--limit"].includes(key) ||
      !value ||
      options.has(key)
    )
      throw new Error("Invalid Discovery arguments");
    options.set(key, value);
  }
  const schema = options.get("--schema");
  const table = options.get("--table");
  const columns = options.get("--columns")?.split(",") ?? [];
  const limit = Number(options.get("--limit") ?? "20");
  if (
    !schema ||
    !table ||
    [schema, table, ...columns].some(
      (name) => !/^[A-Za-z_][A-Za-z0-9_$#]{0,62}$/.test(name),
    ) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new Error(
      "Discovery requires simple schema/table/column identifiers and a limit of 1..100",
    );
  const config = await loadDiscoveryConfig(erp);
  const quote = (name: string) => `"${name}"`;
  // Bare column projections cannot invoke arbitrary functions or procedures.
  const projection = columns.map(quote).join(", ");
  let metadata: { columns: unknown[]; constraints: unknown[] } = {
    columns: [],
    constraints: [],
  };
  let rows: unknown[] = [];
  if (erp === "sankhya") {
    const reader = createOracleProductReader(config, "discovery");
    try {
      await reader.read(AbortSignal.timeout(30000), async (session) => {
        metadata = {
          columns: await session.query(
            "SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE FROM ALL_TAB_COLUMNS WHERE OWNER = :owner AND TABLE_NAME = :tableName ORDER BY COLUMN_ID",
            { owner: schema, tableName: table },
          ),
          constraints: await session.query(
            "SELECT c.CONSTRAINT_NAME, c.CONSTRAINT_TYPE, c.STATUS, k.COLUMN_NAME, k.POSITION, r.OWNER REFERENCED_OWNER, r.TABLE_NAME REFERENCED_TABLE, rk.COLUMN_NAME REFERENCED_COLUMN FROM ALL_CONSTRAINTS c LEFT JOIN ALL_CONS_COLUMNS k ON k.OWNER = c.OWNER AND k.CONSTRAINT_NAME = c.CONSTRAINT_NAME LEFT JOIN ALL_CONSTRAINTS r ON r.OWNER = c.R_OWNER AND r.CONSTRAINT_NAME = c.R_CONSTRAINT_NAME LEFT JOIN ALL_CONS_COLUMNS rk ON rk.OWNER = r.OWNER AND rk.CONSTRAINT_NAME = r.CONSTRAINT_NAME AND rk.POSITION = k.POSITION WHERE c.OWNER = :owner AND c.TABLE_NAME = :tableName ORDER BY c.CONSTRAINT_NAME, k.POSITION",
            { owner: schema, tableName: table },
          ),
        };
        if (columns.length)
          rows = await session.query(
            `SELECT ${projection} FROM ${quote(schema)}.${quote(table)} WHERE ROWNUM <= :rowLimit`,
            { rowLimit: limit },
            limit,
          );
      });
    } finally {
      await reader.close();
    }
  } else {
    const connection = vrmasterConnection(config);
    if (!connection)
      throw new Error("VRMaster Discovery connection is incomplete");
    const client = new pg.Client({
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.user,
      password: connection.password,
      ssl:
        connection.ssl === "verify-full" ? { rejectUnauthorized: true } : false,
      application_name: "ia-mns-discovery",
      connectionTimeoutMillis: 5000,
      query_timeout: 35000,
    });
    let connected = false;
    try {
      await client.connect();
      connected = true;
      for (const statement of vrmasterTransactionSettings)
        await client.query(statement);
      metadata = {
        columns: (
          await client.query(
            "SELECT a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS data_type, NOT a.attnotnull AS nullable FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 2001",
            [schema, table],
          )
        ).rows,
        constraints: (
          await client.query(
            "SELECT k.conname AS name, k.contype AS type, k.convalidated AS validated, pg_get_constraintdef(k.oid) AS definition FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid = k.conrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2 ORDER BY k.conname LIMIT 2001",
            [schema, table],
          )
        ).rows,
      };
      if (metadata.columns.length > 2000 || metadata.constraints.length > 2000)
        throw new Error("Discovery metadata exceeded its read bound");
      if (columns.length)
        rows = (
          await client.query(
            `SELECT ${projection} FROM ${quote(schema)}.${quote(table)} LIMIT $1`,
            [limit],
          )
        ).rows;
    } finally {
      try {
        if (connected) await client.query("ROLLBACK");
      } finally {
        await client.end();
      }
    }
  }
  const directory = resolve("evals/.local/discovery");
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, `${erp}-${schema}-${table}.json`),
    JSON.stringify({ erp, schema, table, metadata, rows }, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      erp,
      inspected: true,
      sampledRows: rows.length,
      evidence: "evals/.local/discovery",
      databaseChanged: false,
    }),
  );
}

try {
  await main();
} catch {
  // Driver errors and record values must not reach console/model context.
  console.error(
    "Read-only ERP inspection failed; check arguments, local Discovery configuration and connectivity privately.",
  );
  process.exitCode = 1;
}
