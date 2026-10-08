import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import pg from "pg";

/**
 * Database deployment with the migration credential: committed Prisma
 * migrations, then the least-privilege runtime grants each module declares in
 * prisma/runtime-grants/, then a check that the runtime role holds exactly
 * those privileges. The runtime role itself is created once by the database
 * administrator; this step never creates roles or sets passwords.
 */
export const runtimeRole = "orion_runtime";

// src/ and dist/ both sit directly under the API package root.
const appRoot = resolve(import.meta.dirname, "..");
const grantsDirectory = resolve(appRoot, "prisma/runtime-grants");
const migrationsDirectory = resolve(appRoot, "prisma/migrations");
const run = promisify(execFile);

export async function runtimeGrantStatements(
  directory = grantsDirectory,
): Promise<string[]> {
  let files: string[];
  try {
    files = (await readdir(directory)).filter((name) => name.endsWith(".sql"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const statements: string[] = [];
  for (const file of files.sort())
    statements.push(
      ...(await readFile(resolve(directory, file), "utf8"))
        .replace(/--[^\n]*/g, "")
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean),
    );
  return statements;
}

type DeclaredGrant = { table: string; privilege: string };

/** The table privileges a set of GRANT statements gives the runtime role. */
export function declaredGrants(statements: readonly string[]): DeclaredGrant[] {
  const grants: DeclaredGrant[] = [];
  for (const statement of statements) {
    const match =
      /^GRANT\s+([A-Z,\s]+?)\s+ON\s+TABLE\s+([\s\S]+?)\s+TO\s+([a-z_][a-z0-9_]*)$/i.exec(
        statement.replace(/\s+/g, " "),
      );
    if (!match || match[3] !== runtimeRole)
      throw new Error(
        "Unsupported runtime grant: declare GRANT <privileges> ON TABLE <tables> TO orion_runtime",
      );
    const privileges = match[1]
      .split(",")
      .map((item) => item.trim().toUpperCase());
    for (const table of match[2].split(",").map((item) => item.trim()))
      for (const privilege of privileges) {
        if (!/^public\.[a-z_][a-z0-9_]*$/.test(table))
          throw new Error("Unsupported runtime grant table name");
        grants.push({ table: table.slice("public.".length), privilege });
      }
  }
  return grants;
}

/** Applies committed migrations with the Prisma CLI and the given credential. */
export async function applyMigrations(
  migrationUrl: string,
  options: { output?: "inherit" | "capture" } = {},
): Promise<void> {
  const cli = resolve(appRoot, "node_modules/prisma/build/index.js");
  try {
    await access(cli);
  } catch {
    throw new Error(
      "Database deployment needs the Prisma CLI (migration image)",
    );
  }
  const args = [cli, "migrate", "deploy"];
  const env = { ...process.env, ORION_MIGRATION_DATABASE_URL: migrationUrl };
  if (options.output === "inherit") {
    await new Promise<void>((done, fail) => {
      const child = spawn(process.execPath, args, {
        cwd: appRoot,
        env,
        stdio: ["ignore", "inherit", "inherit"],
      });
      child.once("error", fail);
      child.once("exit", (code) =>
        code === 0
          ? done()
          : fail(
              new Error("Prisma migrate deploy failed; nothing was granted"),
            ),
      );
    });
  } else
    await run(process.execPath, args, { cwd: appRoot, env, timeout: 90_000 });
}

/**
 * Grants CONNECT, schema USAGE and the declared table privileges, then
 * verifies the runtime role has exactly those privileges, no attribute that
 * bypasses them and no ownership. Idempotent.
 */
export async function applyRuntimeGrants(
  client: pg.Client,
  statements?: readonly string[],
): Promise<{ tables: number; privileges: number }> {
  const declared = statements ?? (await runtimeGrantStatements());
  const expected = declaredGrants(declared);
  const role = await client.query<{
    rolsuper: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolbypassrls: boolean;
    rolreplication: boolean;
  }>(
    "SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication FROM pg_roles WHERE rolname = $1",
    [runtimeRole],
  );
  const attributes = role.rows[0];
  if (!attributes)
    throw new Error(
      "The runtime role orion_runtime does not exist; the database administrator creates it once before the first deployment",
    );
  if (Object.values(attributes).some(Boolean))
    throw new Error(
      "The runtime role orion_runtime has administrative attributes; it must be a plain login role",
    );
  await client.query(
    `DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO ${runtimeRole}', current_database()); END $$`,
  );
  await client.query(`GRANT USAGE ON SCHEMA public TO ${runtimeRole}`);
  for (const statement of declared) await client.query(statement);
  const held = await client.query<{ table: string; privilege: string }>(
    `SELECT c.relname AS table, a.privilege_type AS privilege
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(c.relacl) a
      WHERE n.nspname = 'public' AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = $1)`,
    [runtimeRole],
  );
  const key = (grant: DeclaredGrant) => `${grant.table}:${grant.privilege}`;
  const want = new Set(expected.map(key));
  const have = new Set(held.rows.map(key));
  if ([...want].some((item) => !have.has(item)))
    throw new Error("The runtime role is missing a declared privilege");
  if ([...have].some((item) => !want.has(item)))
    throw new Error(
      "The runtime role holds table privileges that no runtime grant declares",
    );
  const checks = await client.query<{ create: boolean; owned: string }>(
    `SELECT has_schema_privilege($1, 'public', 'CREATE') AS create,
            (SELECT count(*) FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname = $1)::text AS owned`,
    [runtimeRole],
  );
  if (checks.rows[0]?.create || checks.rows[0]?.owned !== "0")
    throw new Error(
      "The runtime role may create or owns database objects; it must only use them",
    );
  return {
    tables: new Set(expected.map((grant) => grant.table)).size,
    privileges: want.size,
  };
}

/**
 * Migrations, then grants and their verification, with one credential.
 * Refuses a database whose history is incompatible with this release.
 */
export async function deployDatabase(
  migrationUrl: string,
  options: { output?: "inherit" | "capture" } = {},
): Promise<{ tables: number; privileges: number; applied: readonly string[] }> {
  const before = await inspectDatabase(migrationUrl);
  if (!before.compatible)
    throw new Error(
      "The database migration history is incompatible with this release; nothing was applied",
    );
  await applyMigrations(migrationUrl, options);
  const client = new pg.Client({ connectionString: migrationUrl });
  await client.connect();
  try {
    const after = await migrationState(client);
    if (!after.compatible || after.pending.length)
      throw new Error(
        "The database did not reach this release's migration history after deployment",
      );
    return { ...(await applyRuntimeGrants(client)), applied: before.pending };
  } finally {
    await client.end();
  }
}

export type MigrationState = Readonly<{
  /** Release migrations the database finished applying. */
  applied: readonly string[];
  /** Release migrations the database has not applied yet. */
  pending: readonly string[];
  /** Finished migrations this release does not contain (database ahead). */
  unknown: readonly string[];
  /** Migrations that started without finishing or rolling back. */
  failed: readonly string[];
  /** Applied migrations whose recorded checksum differs from this release's file. */
  modified: readonly string[];
  /** True when this release can run against the database after applying `pending`. */
  compatible: boolean;
}>;

/** This release's migrations with the SHA-256 of each migration.sql as shipped. */
export async function releaseMigrations(
  directory = migrationsDirectory,
): Promise<ReadonlyMap<string, string>> {
  const migrations = new Map<string, string>();
  for (const entry of (await readdir(directory, { withFileTypes: true }))
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort())
    migrations.set(
      entry,
      createHash("sha256")
        .update(await readFile(resolve(directory, entry, "migration.sql")))
        .digest("hex"),
    );
  return migrations;
}

/**
 * Compares the database's Prisma migration history with this release, read
 * only. A database that finished migrations this release does not know, holds
 * a failed migration, or recorded a different checksum for a migration file is
 * incompatible: deploying or rolling back to this release would run code
 * against a schema it was not built for, or rewrite released history.
 */
export async function migrationState(
  client: pg.Client,
  release?: ReadonlyMap<string, string>,
): Promise<MigrationState> {
  const files = release ?? (await releaseMigrations());
  const table = await client.query<{ present: boolean }>(
    "SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present",
  );
  const rows = table.rows[0]?.present
    ? (
        await client.query<{
          migration_name: string;
          checksum: string;
          finished_at: Date | null;
          rolled_back_at: Date | null;
        }>(
          "SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY started_at",
        )
      ).rows
    : [];
  const finished = rows.filter(
    (row) => row.finished_at !== null && row.rolled_back_at === null,
  );
  const done = new Set(finished.map((row) => row.migration_name));
  const failed = rows
    .filter((row) => row.finished_at === null && row.rolled_back_at === null)
    .map((row) => row.migration_name);
  const unknown = [...done].filter((name) => !files.has(name));
  const modified = finished
    .filter(
      (row) =>
        files.has(row.migration_name) &&
        files.get(row.migration_name) !== row.checksum,
    )
    .map((row) => row.migration_name);
  return {
    applied: [...files.keys()].filter((name) => done.has(name)),
    pending: [...files.keys()].filter((name) => !done.has(name)),
    unknown,
    failed,
    modified,
    compatible: !unknown.length && !failed.length && !modified.length,
  };
}

/** The migration state with the migration credential, without changing it. */
export async function inspectDatabase(
  migrationUrl: string,
): Promise<MigrationState> {
  const client = new pg.Client({ connectionString: migrationUrl });
  await client.connect();
  try {
    return await migrationState(client);
  } finally {
    await client.end();
  }
}
