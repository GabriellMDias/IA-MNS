/**
 * Read-only synchronization check of a product semantic catalog against the
 * live ERP (`pnpm -C apps/api products:catalog`). It never edits the catalog
 * and never enables anything: a person reviews the report, validates any
 * change with the owner and edits the catalog source in a reviewed change.
 *
 * Checks: every catalog column (type, nullability, readability by the
 * runtime account), declared constraints behind relationships, the access
 * state of each entity, data invariants of the enabled paths (bounded
 * aggregates) and foreign keys around the root entity that the catalog does
 * not describe yet. Exit 1 when an enabled dimension is affected.
 *
 * Uses the runtime VRMASTER_DB_* settings (the restricted account); it prints
 * counts and schema names only, never product, buyer or other record values.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pg from "pg";
import { parseServerConfig } from "../src/config.js";
import {
  entityOf,
  enabledDimensions,
  hierarchyOf,
  type SemanticCatalog,
} from "../src/features/products/catalog.js";
import { catalogMismatches } from "../src/features/products/postgres-source.js";
import { quote, tableOf } from "../src/features/products/postgres.js";
import { vrmasterCatalog } from "../src/features/products/vrmaster/catalog.js";
import {
  vrmasterConnection,
  vrmasterTransactionSettings,
} from "../src/vrmaster-connection.js";

type Finding = {
  level: "error" | "warning" | "info";
  topic: string;
  detail: string;
};

const columnsQuery = `SELECT n.nspname || '.' || c.relname AS "table", a.attname AS "column",
  format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable,
  has_column_privilege(c.oid, a.attnum, 'SELECT') AS readable,
  has_table_privilege(c.oid, 'SELECT') AS "tableReadable"
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE a.attnum > 0 AND NOT a.attisdropped
  AND n.nspname || '.' || c.relname = ANY($1::text[])`;

const foreignKeysQuery = `SELECT c.conname AS name,
  sn.nspname || '.' || s.relname AS "from", tn.nspname || '.' || t.relname AS "to",
  ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(n, o)
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.o)::text[] AS "fromColumns",
  ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(n, o)
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.o)::text[] AS "toColumns",
  c.convalidated AS validated
FROM pg_catalog.pg_constraint c
JOIN pg_catalog.pg_class s ON s.oid = c.conrelid
JOIN pg_catalog.pg_namespace sn ON sn.oid = s.relnamespace
JOIN pg_catalog.pg_class t ON t.oid = c.confrelid
JOIN pg_catalog.pg_namespace tn ON tn.oid = t.relnamespace
WHERE c.contype = 'f'
  AND (sn.nspname || '.' || s.relname = ANY($1::text[]) OR tn.nspname || '.' || t.relname = $2)`;

type ForeignKey = {
  name: string;
  from: string;
  to: string;
  fromColumns: string[];
  toColumns: string[];
  validated: boolean;
};

const tableName = (catalog: SemanticCatalog, entityId: string) => {
  const entity = entityOf(catalog, entityId);
  return `${entity.table.schema}.${entity.table.name}`;
};

/** Bounded aggregate checks of the invariants enabled paths rely on. */
function invariants(catalog: SemanticCatalog) {
  const checks: { topic: string; sql: string }[] = [];
  const root = entityOf(catalog, catalog.root);
  for (const dimension of enabledDimensions(catalog)) {
    if (dimension.hierarchy) {
      const hierarchy = hierarchyOf(catalog, dimension.hierarchy);
      const entity = entityOf(catalog, hierarchy.entity);
      const codes = hierarchy.codeColumns;
      const level = quote(hierarchy.levelColumn);
      checks.push({
        topic: `${hierarchy.id}: codes below a node's level are 0 and set above it`,
        sql: `SELECT count(*)::int AS count FROM ${tableOf(entity)} n WHERE ${codes
          .map(
            (column, index) =>
              `(n.${level} > ${index} AND n.${quote(column)} = 0) OR (n.${level} <= ${index} AND n.${quote(column)} <> 0)`,
          )
          .join(" OR ")}`,
      });
    }
  }
  const classification = catalog.dimensions.find(
    (item) => item.kind === "hierarchy" && item.exposure === "enabled",
  );
  if (classification) {
    const relationship = catalog.relationships.find(
      (item) => item.id === classification.path[0],
    )!;
    const node = entityOf(catalog, relationship.to);
    checks.push({
      topic: `${relationship.id}: root rows without their node`,
      sql: `SELECT count(*)::int AS count FROM ${tableOf(root)} p WHERE NOT EXISTS (SELECT 1 FROM ${tableOf(node)} n WHERE ${relationship.join
        .map((pair) => `n.${quote(pair.to)} = p.${quote(pair.from)}`)
        .join(" AND ")})`,
    });
  }
  for (const relationship of catalog.relationships) {
    if (relationship.where.length === 0) continue;
    const target = entityOf(catalog, relationship.to);
    if (target.access !== "granted") continue;
    checks.push({
      topic: `${relationship.id}: target rows per join value above one`,
      sql: `SELECT count(*)::int AS count FROM (SELECT ${relationship.join
        .map((pair) => quote(pair.to))
        .join(", ")} FROM ${tableOf(target)} WHERE ${relationship.where
        .map((item) => `${quote(item.column)} = ${Number(item.equals)}`)
        .join(" AND ")} GROUP BY ${relationship.join
        .map((pair) => quote(pair.to))
        .join(", ")} HAVING count(*) > 1) duplicated`,
    });
  }
  const costCenter = catalog.relationships.find(
    (item) => item.id === "section_cost_center",
  );
  const sectionPath = catalog.relationships.find(
    (item) => item.id === "product_section",
  );
  if (costCenter && sectionPath) {
    const node = entityOf(catalog, costCenter.from);
    const level = sectionPath.where[0];
    checks.push({
      topic: `${costCenter.id}: assignments outside the level the product path reads`,
      sql: `SELECT count(*)::int AS count FROM ${tableOf(node)} WHERE ${quote(costCenter.join[0].from)} IS NOT NULL AND ${quote(level.column)} <> ${Number(level.equals)}`,
    });
  }
  return checks;
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
  const config = parseServerConfig({
    ...process.env,
    ORION_ENV: "development",
  });
  const connection = vrmasterConnection(config);
  if (!connection) {
    console.error("VRMASTER_DB_* is not configured.");
    process.exit(2);
  }
  const catalog = vrmasterCatalog;
  const client = new pg.Client({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    ssl:
      connection.ssl === "verify-full" ? { rejectUnauthorized: true } : false,
    application_name: "ia-mns-catalog-check",
    connectionTimeoutMillis: 8000,
  });
  const findings: Finding[] = [];
  await client.connect();
  try {
    for (const statement of vrmasterTransactionSettings)
      await client.query(statement);
    // Enabled dimensions: exactly what the runtime verifies before use.
    for (const problem of await catalogMismatches(client, catalog))
      findings.push({
        level: "error",
        topic: "enabled dimension",
        detail: problem,
      });
    // Every catalog column and the access state of every entity.
    const tables = catalog.entities.map((item) => tableName(catalog, item.id));
    const live = (
      await client.query<{
        table: string;
        column: string;
        type: string;
        nullable: boolean;
        readable: boolean;
        tableReadable: boolean;
      }>(columnsQuery, [tables])
    ).rows;
    for (const entity of catalog.entities) {
      const table = tableName(catalog, entity.id);
      const rows = live.filter((row) => row.table === table);
      if (rows.length === 0) {
        findings.push({
          level: "warning",
          topic: entity.id,
          detail: `${table} is missing`,
        });
        continue;
      }
      for (const column of entity.columns) {
        const found = rows.find((row) => row.column === column.name);
        if (!found)
          findings.push({
            level: "warning",
            topic: entity.id,
            detail: `${table}.${column.name} is missing`,
          });
        else if (
          found.type !== column.type ||
          found.nullable !== column.nullable
        )
          findings.push({
            level: "warning",
            topic: entity.id,
            detail: `${table}.${column.name} is ${found.type}${found.nullable ? " NULL" : " NOT NULL"}`,
          });
      }
      const readable = entity.columns.every(
        (column) => rows.find((row) => row.column === column.name)?.readable,
      );
      if (readable !== (entity.access === "granted"))
        findings.push({
          level: entity.access === "granted" ? "error" : "info",
          topic: entity.id,
          detail: readable
            ? `${table} is now readable by the runtime account; validate its paths before enabling a dimension`
            : `${table} is no longer readable by the runtime account`,
        });
    }
    // Declared constraints behind relationships, and undescribed ones.
    const rootTable = tableName(catalog, catalog.root);
    const keys = (
      await client.query<ForeignKey>(foreignKeysQuery, [tables, rootTable])
    ).rows;
    for (const relationship of catalog.relationships) {
      if (!relationship.evidence.declared) continue;
      const from = tableName(catalog, relationship.from);
      const to = tableName(catalog, relationship.to);
      const match = keys.find(
        (key) =>
          ((key.from === from &&
            key.to === to &&
            key.fromColumns.join() ===
              relationship.join.map((pair) => pair.from).join() &&
            key.toColumns.join() ===
              relationship.join.map((pair) => pair.to).join()) ||
            (key.from === to &&
              key.to === from &&
              key.fromColumns.join() ===
                relationship.join.map((pair) => pair.to).join() &&
              key.toColumns.join() ===
                relationship.join.map((pair) => pair.from).join())) &&
          key.validated,
      );
      if (!match)
        findings.push({
          level: relationship.status === "verified" ? "error" : "warning",
          topic: relationship.id,
          detail:
            "its declared foreign key is missing, changed or not validated",
        });
    }
    const described = new Set(
      catalog.relationships.map(
        (item) =>
          `${tableName(catalog, item.from)}(${item.join.map((pair) => pair.from).join()})>${tableName(catalog, item.to)}`,
      ),
    );
    const reversed = new Set(
      catalog.relationships.map(
        (item) =>
          `${tableName(catalog, item.to)}(${item.join.map((pair) => pair.to).join()})>${tableName(catalog, item.from)}`,
      ),
    );
    const unreviewed = keys.filter((key) => {
      const signature = `${key.from}(${key.fromColumns.join()})>${key.to}`;
      return !described.has(signature) && !reversed.has(signature);
    });
    findings.push({
      level: "info",
      topic: "unreviewed foreign keys",
      detail: `${unreviewed.length} foreign keys touch catalog tables without a catalog relationship (incoming references to the root are mostly transactional history); listed in the report file`,
    });
    // Data invariants of enabled paths, read-only and bounded.
    for (const check of invariants(catalog)) {
      const count = (await client.query<{ count: number }>(check.sql)).rows[0]
        .count;
      findings.push({
        level: count === 0 ? "info" : "error",
        topic: "invariant",
        detail: `${check.topic}: ${count === 0 ? "holds" : `${count} violations`}`,
      });
    }
    const report = {
      catalog: catalog.version,
      checkedAt: new Date().toISOString(),
      findings,
      unreviewed: unreviewed.map((key) => ({
        from: key.from,
        columns: key.fromColumns,
        to: key.to,
        targetColumns: key.toColumns,
      })),
    };
    for (const finding of findings)
      console.log(
        `${finding.level.padEnd(7)} ${finding.topic}: ${finding.detail}`,
      );
    if (out) {
      const path = resolve(out);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Report: ${path}`);
    }
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
  if (findings.some((finding) => finding.level === "error")) process.exit(1);
}

await main();
