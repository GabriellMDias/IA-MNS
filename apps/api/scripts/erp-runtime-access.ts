/** Default: inspect a reviewed plan. --apply requires explicit owner mutation authority. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import oracledb from "oracledb";
import pg from "pg";
import { loadLocalEnvironment } from "./local-environment.js";
import { loadDiscoveryConfig } from "./discovery-config.js";
import { parseServerConfig } from "../src/config.js";
import { ensureOracleClient } from "../src/oracle-client.js";

const directory = "IA_MNS_USER_DIRECTORY";
const directoryColumns = [
  "CODUSU",
  "NOMEUSU",
  "NOMEUSUCPLT",
  "EMAIL",
  "DTLIMACESSO",
];
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const statements = (text: string) =>
  text
    .replace(/^\s*--[^\n]*$/gm, "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
const normalize = (text: string) =>
  text.replaceAll('"', "").replace(/\s+/g, " ").trim().toUpperCase();
const apply = process.argv.includes("--apply");
if (process.argv.slice(2).some((argument) => argument !== "--apply"))
  throw new Error(
    "Use erp-runtime-access with no argument (plan) or --apply (owner-authorized changes)",
  );
const env = await loadLocalEnvironment();
const runtime = parseServerConfig(env);
if (
  runtime.sankhyaUser?.toUpperCase() !== "IA_MNS_RO" ||
  runtime.vrmasterUser !== "ia_mns"
)
  throw new Error(
    "Only the designated IA_MNS_RO and ia_mns runtime accounts may be targeted",
  );
await mkdir("evals/.local/runtime-access", { recursive: true });

function safeCode(cause: unknown) {
  const code = (cause as { code?: unknown })?.code;
  return typeof code === "string" && /^[A-Z0-9-]{3,12}$/.test(code)
    ? code
    : "ACCESS_PLAN_FAILED";
}

async function oracleAccess() {
  const config = await loadDiscoveryConfig("sankhya", env);
  ensureOracleClient(config.oracleClientLibDir);
  const client = await oracledb.getConnection({
    user: config.sankhyaUser,
    password: config.sankhyaPassword,
    connectString: config.sankhyaConnectString,
  });
  client.callTimeout = 15000;
  const completed: { operation: string; object: string }[] = [];
  let stage = "preflight";
  try {
    await client.execute("SET TRANSACTION READ ONLY");
    const query = async (sql: string, binds: oracledb.BindParameters = {}) => {
      const result = await client.execute<Record<string, unknown>>(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        maxRows: 2001,
      });
      if (!result.rows || result.rows.length > 2000)
        throw new Error("Oracle access metadata exceeded its bound");
      return result.rows;
    };
    const owner = (
      await query(
        "SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') OWNER_NAME FROM DUAL",
      )
    )[0]?.OWNER_NAME;
    if (
      typeof owner !== "string" ||
      !/^[A-Z][A-Z0-9_$#]{0,127}$/.test(owner) ||
      owner === "IA_MNS_RO"
    )
      throw new Error(
        "Cannot resolve the ERP owner from administrative schema metadata",
      );
    const template = await readFile(
      new URL("./erp-access/sankhya-runtime.sql", import.meta.url),
      "utf8",
    );
    const sql = statements(template.replaceAll("{{ERP_OWNER}}", quote(owner)));
    const tables = sql
      .map(
        (item) =>
          /^GRANT SELECT ON "[^"]+"\.([A-Z0-9_]+) TO IA_MNS_RO$/.exec(
            item,
          )?.[1],
      )
      .filter((name): name is string => Boolean(name) && name !== directory);
    if (tables.length !== 24 || new Set(tables).size !== 24)
      throw new Error("Unexpected Oracle runtime grant scope");
    if (
      (await query("SELECT USERNAME FROM ALL_USERS WHERE USERNAME='IA_MNS_RO'"))
        .length !== 1
    )
      throw new Error(
        "The owner must provision IA_MNS_RO and its credentials before granting access",
      );
    const placeholders = tables.map((_, index) => `:t${index}`).join(",");
    const bindings = {
      owner,
      ...Object.fromEntries(tables.map((name, index) => [`t${index}`, name])),
    };
    if (
      (
        await query(
          `SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER=:owner AND TABLE_NAME IN (${placeholders})`,
          bindings,
        )
      ).length !== 24
    )
      throw new Error(
        "Required ERP tables are not all in the resolved source schema",
      );
    const userColumns = await query(
      "SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE OWNER=:owner AND TABLE_NAME='TSIUSU' ORDER BY COLUMN_ID",
      { owner },
    );
    if (
      !directoryColumns.every((name) =>
        userColumns.some((row) => row.COLUMN_NAME === name),
      )
    )
      throw new Error(
        "The five-column Sankhya user projection needs source-schema review",
      );
    const synonyms = await query(
      "SELECT SYNONYM_NAME,TABLE_OWNER,TABLE_NAME,DB_LINK FROM ALL_SYNONYMS WHERE OWNER='IA_MNS_RO'",
    );
    for (const row of synonyms)
      if (
        [...tables, directory].includes(String(row.SYNONYM_NAME)) &&
        (row.TABLE_OWNER !== owner ||
          row.TABLE_NAME !== row.SYNONYM_NAME ||
          row.DB_LINK !== null)
      )
        throw new Error(
          "An existing runtime synonym redirects an expected object; no replacement is allowed",
        );
    const views = await query(
      "SELECT TEXT FROM ALL_VIEWS WHERE OWNER=:owner AND VIEW_NAME=:name",
      { owner, name: directory },
    );
    if (
      views.length &&
      (typeof views[0].TEXT !== "string" ||
        normalize(views[0].TEXT) !==
          normalize(
            `SELECT ${directoryColumns.join(", ")} FROM ${owner}.TSIUSU`,
          ))
    )
      throw new Error(
        "The existing directory view differs from the reviewed projection; no replacement is allowed",
      );
    const grants = await query(
      "SELECT TABLE_NAME,PRIVILEGE,GRANTABLE FROM ALL_TAB_PRIVS WHERE TABLE_SCHEMA=:owner AND GRANTEE='IA_MNS_RO'",
      { owner },
    );
    if (
      grants.some((row) => row.PRIVILEGE !== "SELECT" || row.GRANTABLE !== "NO")
    )
      throw new Error(
        "The runtime has unexpected object privileges requiring a separate review",
      );
    const reader = await oracledb.getConnection({
      user: runtime.sankhyaUser,
      password: runtime.sankhyaPassword,
      connectString: runtime.sankhyaConnectString,
    });
    let sessionGranted: boolean;
    try {
      const privileges =
        (
          await reader.execute<{ PRIVILEGE: string }>(
            "SELECT PRIVILEGE FROM SESSION_PRIVS",
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 2000 },
          )
        ).rows ?? [];
      if (privileges.some((row) => row.PRIVILEGE !== "CREATE SESSION"))
        throw new Error("Runtime system privileges exceed CREATE SESSION");
      sessionGranted = privileges.some(
        (row) => row.PRIVILEGE === "CREATE SESSION",
      );
    } finally {
      await reader.close();
    }
    const planned = sql.filter((statement) => {
      if (statement === "GRANT CREATE SESSION TO IA_MNS_RO")
        return !sessionGranted;
      const grant = /^GRANT SELECT ON "[^"]+"\.([A-Z0-9_]+) TO IA_MNS_RO$/.exec(
        statement,
      );
      if (grant)
        return !grants.some(
          (row) => row.TABLE_NAME === grant[1] && row.PRIVILEGE === "SELECT",
        );
      const synonym =
        /^CREATE SYNONYM IA_MNS_RO\.([A-Z0-9_]+) FOR "[^"]+"\.\1$/.exec(
          statement,
        );
      if (synonym)
        return !synonyms.some((row) => row.SYNONYM_NAME === synonym[1]);
      if (statement.startsWith(`CREATE VIEW ${quote(owner)}.${directory} AS`))
        return views.length === 0;
      throw new Error(
        "Unexpected Oracle statement in the reviewed access template",
      );
    });
    const scope = planned.map((statement) => ({
      operation: statement.split(" ")[0],
      object: statement.startsWith("CREATE VIEW")
        ? directory
        : (/(?:ON|IA_MNS_RO)\.?(?: "[^"]+"\.)?([A-Z0-9_]+)/.exec(
            statement,
          )?.[1] ?? "runtime"),
    }));
    console.log(
      JSON.stringify({
        erp: "sankhya",
        mode: apply ? "apply" : "plan",
        requiredTables: tables.length,
        directoryProjectionColumns: directoryColumns.length,
        missingStatements: planned.length,
        sourceOwnerVerified: true,
        credentialsChanged: false,
      }),
    );
    await client.rollback();
    if (apply) {
      stage = "apply";
      for (let index = 0; index < planned.length; index++) {
        await client.execute(planned[index]);
        completed.push(scope[index]);
      }
      await writeFile(
        "evals/.local/runtime-access/oracle-application.json",
        JSON.stringify(
          {
            on: new Date().toISOString(),
            completed,
            transactionallyReversible: false,
            credentialsChanged: false,
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      console.log(
        JSON.stringify({
          erp: "sankhya",
          appliedStatements: completed.length,
          accountCreated: false,
          credentialsChanged: false,
        }),
      );
    }
  } catch (cause) {
    console.error(
      JSON.stringify({
        erp: "sankhya",
        stage,
        code: safeCode(cause),
        appliedStatements: completed.length,
      }),
    );
    process.exitCode = 1;
  } finally {
    try {
      await client.rollback();
    } finally {
      await client.close();
    }
  }
}

async function postgresAccess() {
  const config = await loadDiscoveryConfig("vrmaster", env);
  const client = new pg.Client({
    host: config.vrmasterHost,
    port: config.vrmasterPort,
    database: config.vrmasterDatabase,
    user: config.vrmasterUser,
    password: config.vrmasterPassword,
    ssl:
      config.vrmasterSslMode === "verify-full"
        ? { rejectUnauthorized: true }
        : false,
    connectionTimeoutMillis: 5000,
    query_timeout: 35000,
    application_name: "ia-mns-runtime-grants",
  });
  let connected = false;
  let stage = "connect";
  try {
    await client.connect();
    connected = true;
    stage = "preflight";
    await client.query(apply ? "BEGIN READ WRITE" : "BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout='30s'");
    await client.query("SET LOCAL lock_timeout='5s'");
    const role = (
      await client.query<{
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolreplication: boolean;
        rolbypassrls: boolean;
      }>(
        "SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='ia_mns'",
      )
    ).rows;
    if (role.length !== 1 || Object.values(role[0]).some(Boolean))
      throw new Error(
        "The designated runtime role must exist without privileged role attributes",
      );
    const name: string = (
      await client.query<{ name: string }>("SELECT current_database() AS name")
    ).rows[0].name;
    const template = await readFile(
      new URL("./erp-access/vrmaster-runtime.sql", import.meta.url),
      "utf8",
    );
    const sql = statements(template.replaceAll("{{DATABASE}}", quote(name)));
    const planned: string[] = [];
    for (const statement of sql) {
      const tableGrant =
        /^GRANT SELECT(?: \(([^)]+)\))? ON public\.([a-z_]+) TO ia_mns$/.exec(
          statement,
        );
      if (tableGrant) {
        const [, columnList, table] = tableGrant;
        if (columnList) {
          for (const column of columnList.split(", "))
            if (!/^[a-z_]+$/.test(column))
              throw new Error(
                "Unexpected column identifier in reviewed grant template",
              );
          const state = (
            await client.query<{ attname: string; readable: boolean }>(
              "SELECT a.attname,has_column_privilege('ia_mns',c.oid,a.attnum,'SELECT') AS readable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='public' AND c.relname=$1 AND a.attname=ANY($2::text[]) AND a.attnum>0 AND NOT a.attisdropped",
              [table, columnList.split(", ")],
            )
          ).rows;
          if (state.length !== columnList.split(", ").length)
            throw new Error("A required runtime column is missing");
          if (state.some((row) => !row.readable)) planned.push(statement);
        } else {
          const state = (
            await client.query<{ readable: boolean }>(
              "SELECT has_table_privilege('ia_mns',c.oid,'SELECT') AS readable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1",
              [table],
            )
          ).rows;
          if (state.length !== 1)
            throw new Error("A required runtime table is missing");
          if (!state[0].readable) planned.push(statement);
        }
      } else if (
        statement === `GRANT CONNECT ON DATABASE ${quote(name)} TO ia_mns`
      ) {
        if (
          !(
            await client.query<{ granted: boolean }>(
              "SELECT has_database_privilege('ia_mns',current_database(),'CONNECT') AS granted",
            )
          ).rows[0].granted
        )
          planned.push(statement);
      } else if (statement === "GRANT USAGE ON SCHEMA public TO ia_mns") {
        if (
          !(
            await client.query<{ granted: boolean }>(
              "SELECT has_schema_privilege('ia_mns','public','USAGE') AS granted",
            )
          ).rows[0].granted
        )
          planned.push(statement);
      } else
        throw new Error(
          "Unexpected PostgreSQL statement in reviewed access template",
        );
    }
    console.log(
      JSON.stringify({
        erp: "vrmaster",
        mode: apply ? "apply" : "plan",
        missingStatements: planned.length,
        publicChanged: false,
        accountsCreated: false,
        credentialsChanged: false,
      }),
    );
    if (apply) {
      stage = "apply";
      for (const statement of planned) await client.query(statement);
      await client.query("COMMIT");
      await writeFile(
        "evals/.local/runtime-access/postgres-application.json",
        JSON.stringify(
          {
            on: new Date().toISOString(),
            appliedStatements: planned.length,
            publicChanged: false,
            credentialsChanged: false,
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      console.log(
        JSON.stringify({
          erp: "vrmaster",
          appliedStatements: planned.length,
          publicChanged: false,
        }),
      );
    } else await client.query("ROLLBACK");
  } catch (cause) {
    console.error(
      JSON.stringify({ erp: "vrmaster", stage, code: safeCode(cause) }),
    );
    process.exitCode = 1;
  } finally {
    try {
      if (connected) await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  }
}

// Keep independent ERP mutations sequential and inspect each result.
try {
  await oracleAccess();
  if (!process.exitCode) await postgresAccess();
} catch (cause) {
  console.error(
    JSON.stringify({ stage: "access-command", code: safeCode(cause) }),
  );
  process.exitCode = 1;
}
