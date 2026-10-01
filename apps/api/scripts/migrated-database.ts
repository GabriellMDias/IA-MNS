import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { GenericContainer, Wait } from "testcontainers";
import pg from "pg";

const run = promisify(execFile);
const appRoot = resolve(import.meta.dirname, "..");
const runtimeGrants = resolve(appRoot, "prisma/runtime-grants");

/** Least-privilege runtime grants that each module declares beside its schema. */
export async function runtimeGrantStatements(
  directory = runtimeGrants,
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

/** Compare only Prisma-representable structure; SQL-only objects use catalog checks. */
export async function assertPrismaSchemaMatchesDatabase(
  migrationUrl: string,
): Promise<void> {
  try {
    await run(
      process.execPath,
      [
        resolve(appRoot, "node_modules/prisma/build/index.js"),
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        resolve(appRoot, "prisma/schema"),
        "--exit-code",
      ],
      {
        cwd: appRoot,
        env: { ...process.env, ORION_MIGRATION_DATABASE_URL: migrationUrl },
        timeout: 90_000,
      },
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 2
    )
      throw new Error(
        "Prisma schema differs from committed migrations. Reconcile schema.prisma and reviewed migration SQL before generating references.",
        { cause: error },
      );
    throw error;
  }
}

export async function withMigratedDatabase<T>(
  work: (runtimeUrl: string, migrationUrl: string) => Promise<T>,
): Promise<T> {
  const container = await new GenericContainer("postgres:16")
    .withEnvironment({
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: "test",
      POSTGRES_DB: "orion",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      // Initialization starts a temporary server before the final mapped server.
      Wait.forLogMessage("database system is ready to accept connections", 2),
    )
    .start();
  try {
    const url = `postgresql://postgres:test@${container.getHost()}:${container.getMappedPort(5432)}/orion`;
    await run(
      process.execPath,
      [
        resolve(appRoot, "node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
      ],
      {
        cwd: appRoot,
        env: { ...process.env, ORION_MIGRATION_DATABASE_URL: url },
        timeout: 90_000,
      },
    );
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    try {
      await admin.query(
        "CREATE ROLE orion_runtime LOGIN PASSWORD 'runtime_test'",
      );
      await admin.query("GRANT USAGE ON SCHEMA public TO orion_runtime");
      for (const statement of await runtimeGrantStatements())
        await admin.query(statement);
    } finally {
      await admin.end();
    }
    const runtimeUrl = `postgresql://orion_runtime:runtime_test@${container.getHost()}:${container.getMappedPort(5432)}/orion`;
    return await work(runtimeUrl, url);
  } finally {
    await container.stop();
  }
}
