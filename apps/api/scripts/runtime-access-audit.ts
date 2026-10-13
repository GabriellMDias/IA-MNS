/** Owner-authorized access review. Reads metadata only; never changes an ERP. */
import { mkdir, writeFile } from "node:fs/promises";
import oracledb from "oracledb";
import pg from "pg";
import { loadLocalEnvironment } from "./local-environment.js";
import { loadDiscoveryConfig } from "./discovery-config.js";
import { parseServerConfig } from "../src/config.js";
import { ensureOracleClient } from "../src/oracle-client.js";

const oracleTables = [
  "TGFPRO",
  "TGFGRU",
  "TGFMAR",
  "TGFVOL",
  "TGFVOA",
  "TGFPAP",
  "TGFPAR",
  "AD_LISTADCEMB",
  "TDDTAB",
  "TDDCAM",
  "TDDINS",
  "TDDLIG",
  "TDDLGC",
  "TDDOPC",
  "TDDPCO",
  "TGFCAB",
  "TGFTOP",
  "TGFVEN",
  "TGFITE",
  "TSIEMP",
  "TCSPRJ",
  "TGFVAR",
  "AD_MOTIVODEV",
  "AD_RESULTADO_LOTE",
];
const pgTables = [
  "venda",
  "produto",
  "loja",
  "fornecedor",
  "produtoaliquota",
  "aliquota",
  "mercadologico",
  "centrocusto",
  "comprador",
  "produtocomplemento",
  "tipoembalagem",
  "familiaproduto",
];
const env = await loadLocalEnvironment();
const runtime = parseServerConfig(env);
const credentials = new URL("../../../.env.discovery", import.meta.url);
await mkdir("evals/.local/runtime-access", { recursive: true });

function code(cause: unknown) {
  const value = (cause as { code?: unknown })?.code;
  return typeof value === "string" && /^[A-Z0-9-]{3,12}$/.test(value)
    ? value
    : "UNAVAILABLE";
}
async function oracleAudit() {
  const config = await loadDiscoveryConfig("sankhya", env, credentials);
  ensureOracleClient(config.oracleClientLibDir);
  let admin: oracledb.Connection | undefined;
  let reader: oracledb.Connection | undefined;
  let stage = "admin-connect";
  try {
    admin = await oracledb.getConnection({
      user: config.sankhyaUser,
      password: config.sankhyaPassword,
      connectString: config.sankhyaConnectString,
    });
    admin.callTimeout = 15000;
    await admin.execute("SET TRANSACTION READ ONLY");
    const query = async (sql: string, binds: oracledb.BindParameters = {}) =>
      (
        await admin!.execute<Record<string, unknown>>(sql, binds, {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          maxRows: 2000,
        })
      ).rows ?? [];
    stage = "admin-metadata";
    const binds = Object.fromEntries(
      oracleTables.map((table, index) => [`t${index}`, table]),
    );
    const list = Object.keys(binds)
      .map((key) => `:${key}`)
      .join(",");
    const report: Record<string, unknown> = {
      users: await query(
        "SELECT USERNAME FROM ALL_USERS WHERE USERNAME = 'IA_MNS_RO'",
      ),
      objects: await query(
        `SELECT OWNER,TABLE_NAME FROM ALL_TABLES WHERE TABLE_NAME IN (${list}) ORDER BY OWNER,TABLE_NAME`,
        binds,
      ),
      adminPrivileges: await query(
        "SELECT PRIVILEGE FROM SESSION_PRIVS ORDER BY PRIVILEGE",
      ),
      grants: await query(
        "SELECT TABLE_SCHEMA,TABLE_NAME,PRIVILEGE,GRANTABLE FROM ALL_TAB_PRIVS WHERE GRANTEE='IA_MNS_RO' ORDER BY TABLE_SCHEMA,TABLE_NAME,PRIVILEGE",
      ),
      directoryConfigured: Boolean(runtime.sankhyaDirectoryView),
      sourceSchema: await query(
        "SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') SCHEMA_NAME FROM DUAL",
      ),
      sourceSynonyms: await query(
        "SELECT OWNER,TABLE_OWNER,TABLE_NAME FROM ALL_SYNONYMS WHERE SYNONYM_NAME='TGFPRO' AND (OWNER=USER OR OWNER='PUBLIC') AND DB_LINK IS NULL",
      ),
    };
    stage = "runtime-connect";
    reader = await oracledb.getConnection({
      user: runtime.sankhyaUser,
      password: runtime.sankhyaPassword,
      connectString: runtime.sankhyaConnectString,
    });
    reader.callTimeout = 15000;
    await reader.execute("SET TRANSACTION READ ONLY");
    const read = async (sql: string) =>
      (
        await reader!.execute<Record<string, unknown>>(
          sql,
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 2000 },
        )
      ).rows ?? [];
    report.runtimePrivileges = await read(
      "SELECT PRIVILEGE FROM SESSION_PRIVS UNION SELECT PRIVILEGE FROM USER_TAB_PRIVS_RECD UNION SELECT PRIVILEGE FROM ROLE_TAB_PRIVS WHERE ROLE IN (SELECT ROLE FROM SESSION_ROLES)",
    );
    report.runtimeRoles = await read("SELECT ROLE FROM SESSION_ROLES");
    report.runtimeSynonyms = await read(
      "SELECT SYNONYM_NAME,TABLE_OWNER,TABLE_NAME,DB_LINK FROM USER_SYNONYMS",
    );
    report.runtimeOwnedTables = await read(
      "SELECT TABLE_NAME FROM USER_TABLES",
    );
    const readable: string[] = [];
    const missing: { table: string; code: string }[] = [];
    for (const table of oracleTables) {
      try {
        await reader.execute(`SELECT 1 FROM ${table} WHERE 1=0`);
        readable.push(table);
      } catch (cause) {
        missing.push({ table, code: code(cause) });
      }
    }
    report.readable = readable;
    report.missing = missing;
    await writeFile(
      "evals/.local/runtime-access/oracle-preflight.json",
      JSON.stringify(report, null, 2),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        erp: "sankhya",
        runtimeConnected: true,
        objectsRequired: oracleTables.length,
        readable: readable.length,
        missing,
        directoryConfigured: report.directoryConfigured,
        accountExists: (report.users as unknown[]).length === 1,
        evidence: "evals/.local/runtime-access/oracle-preflight.json",
      }),
    );
  } catch (cause) {
    console.error(JSON.stringify({ erp: "sankhya", stage, code: code(cause) }));
    process.exitCode = 1;
  } finally {
    for (const connection of [reader, admin])
      if (connection) {
        try {
          await connection.rollback();
        } finally {
          await connection.close();
        }
      }
  }
}
async function postgresAudit() {
  const config = await loadDiscoveryConfig("vrmaster", env, credentials);
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
    application_name: "ia-mns-runtime-access-audit",
  });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout='30s'");
    const roles = (
      await client.query<{
        rolname: string;
        rolconfig: string[] | null;
        rolsuper: boolean;
        rolinherit: boolean;
        rolcreaterole: boolean;
        rolcreatedb: boolean;
        rolcanlogin: boolean;
        rolreplication: boolean;
        rolbypassrls: boolean;
      }>(
        "SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig FROM pg_roles WHERE rolname='ia_mns'",
      )
    ).rows;
    const scope = (
      await client.query(
        "SELECT has_database_privilege('ia_mns', current_database(), 'CONNECT') AS connect, has_database_privilege('ia_mns', current_database(), 'CREATE') AS database_create, has_database_privilege('ia_mns', current_database(), 'TEMP') AS temporary, has_schema_privilege('ia_mns','public','USAGE') AS usage, has_schema_privilege('ia_mns','public','CREATE') AS schema_create",
      )
    ).rows;
    const memberships = (
      await client.query(
        "SELECT parent.rolname AS role, m.admin_option FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles member ON member.oid=m.member WHERE member.rolname='ia_mns'",
      )
    ).rows;
    const acl = (
      await client.query(
        "SELECT 'database' AS scope, CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE 'runtime' END AS grantee, x.privilege_type, x.is_grantable FROM pg_database d CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) x WHERE d.datname=current_database() AND (x.grantee=0 OR x.grantee=(SELECT oid FROM pg_roles WHERE rolname='ia_mns')) UNION ALL SELECT 'schema', CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE 'runtime' END, x.privilege_type,x.is_grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x WHERE n.nspname='public' AND (x.grantee=0 OR x.grantee=(SELECT oid FROM pg_roles WHERE rolname='ia_mns'))",
      )
    ).rows;
    const objects = (
      await client.query<{
        relname: string;
        attname: string;
        table_select: boolean;
        column_select: boolean;
        column_write: boolean;
      }>(
        "SELECT c.relname, a.attname, has_table_privilege('ia_mns',c.oid,'SELECT') AS table_select, has_column_privilege('ia_mns',c.oid,a.attnum,'SELECT') AS column_select, has_column_privilege('ia_mns',c.oid,a.attnum,'INSERT') OR has_column_privilege('ia_mns',c.oid,a.attnum,'UPDATE') AS column_write FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum",
        [pgTables],
      )
    ).rows;
    const writes = (
      await client.query(
        "SELECT c.relname, pg_get_userbyid(c.relowner)='ia_mns' AS owned, has_table_privilege('ia_mns',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS writable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m','f','p') AND (pg_get_userbyid(c.relowner)='ia_mns' OR has_table_privilege('ia_mns',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))",
      )
    ).rows;
    await writeFile(
      "evals/.local/runtime-access/postgres-preflight.json",
      JSON.stringify(
        { roles, scope, memberships, objects, writes, acl },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(JSON.stringify({ erp: "vrmaster", acl }));
    console.log(
      JSON.stringify({
        erp: "vrmaster",
        accountExists: roles.length === 1,
        scope,
        roleFlags: roles.map(
          ({
            rolsuper,
            rolinherit,
            rolcreaterole,
            rolcreatedb,
            rolcanlogin,
            rolreplication,
            rolbypassrls,
          }) => ({
            rolsuper,
            rolinherit,
            rolcreaterole,
            rolcreatedb,
            rolcanlogin,
            rolreplication,
            rolbypassrls,
          }),
        ),
        memberships: memberships.length,
        writableObjects: writes.length,
        tableSelect: [
          ...new Set(
            objects.filter((row) => row.table_select).map((row) => row.relname),
          ),
        ],
        evidence: "evals/.local/runtime-access/postgres-preflight.json",
      }),
    );
  } catch (cause) {
    console.error(JSON.stringify({ erp: "vrmaster", code: code(cause) }));
    process.exitCode = 1;
  } finally {
    try {
      if (connected) await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  }
}
try {
  await Promise.all([oracleAudit(), postgresAudit()]);
} catch (cause) {
  console.error(JSON.stringify({ stage: "access-audit", code: code(cause) }));
  process.exitCode = 1;
}
