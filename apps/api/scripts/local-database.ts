import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, writeFile, lstat, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv, promisify } from "node:util";
import pg from "pg";
import { runtimeGrantStatements } from "./migrated-database.js";
const run = promisify(execFile);
const root = resolve(import.meta.dirname, "../../..");
const localFile = resolve(root, "infra/local/.env");
const envFile = resolve(root, ".env.local");
async function readSafe(path: string) {
  const stat = await lstat(path).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  });
  if (!stat) return "";
  if (stat?.isSymbolicLink() || (stat && !stat.isFile()))
    throw new Error("Unsafe local environment file");
  if (stat && (await realpath(path)).toLowerCase() !== path.toLowerCase())
    throw new Error("Unexpected local environment file destination");
  return readFile(path, "utf8");
}
try {
  const existing = parseEnv(await readSafe(localFile));
  const adminPassword =
    existing.IA_MNS_POSTGRES_PASSWORD ?? randomBytes(32).toString("hex");
  const runtimePassword =
    existing.IA_MNS_POSTGRES_RUNTIME_PASSWORD ??
    randomBytes(32).toString("hex");
  if (
    !/^[a-f0-9]{64}$/.test(adminPassword) ||
    !/^[a-f0-9]{64}$/.test(runtimePassword)
  )
    throw new Error("Invalid local database credential format");
  await writeFile(
    localFile,
    `IA_MNS_POSTGRES_PASSWORD=${adminPassword}\nIA_MNS_POSTGRES_RUNTIME_PASSWORD=${runtimePassword}\n`,
    { mode: 0o600 },
  );
  await run(
    "docker",
    [
      "compose",
      "--env-file",
      localFile,
      "-f",
      resolve(root, "infra/local/compose.yaml"),
      "up",
      "-d",
      "--wait",
    ],
    { timeout: 180000 },
  );
  const migrationUrl = `postgresql://postgres:${adminPassword}@127.0.0.1:55432/ia_mns`;
  const runtimeUrl = `postgresql://orion_runtime:${runtimePassword}@127.0.0.1:55432/ia_mns`;
  await run(
    process.execPath,
    [
      resolve(root, "apps/api/node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
    ],
    {
      cwd: resolve(root, "apps/api"),
      env: { ...process.env, ORION_MIGRATION_DATABASE_URL: migrationUrl },
      timeout: 90000,
    },
  );
  const admin = new pg.Client({ connectionString: migrationUrl });
  await admin.connect();
  try {
    const present = await admin.query(
      "SELECT 1 FROM pg_roles WHERE rolname = 'orion_runtime'",
    );
    if (!present.rowCount)
      await admin.query(
        `CREATE ROLE orion_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
      );
    await admin.query("GRANT CONNECT ON DATABASE ia_mns TO orion_runtime");
    await admin.query("GRANT USAGE ON SCHEMA public TO orion_runtime");
    for (const statement of await runtimeGrantStatements())
      await admin.query(statement);
  } finally {
    await admin.end();
  }
  const check = new pg.Client({ connectionString: runtimeUrl });
  await check.connect();
  try {
    await check.query("SELECT id FROM agent_conversations LIMIT 1");
  } finally {
    await check.end();
  }
  let content = await readSafe(envFile);
  for (const [name, value] of [
    ["ORION_DATABASE_URL", runtimeUrl],
    ["ORION_MIGRATION_DATABASE_URL", migrationUrl],
  ]) {
    const pattern = new RegExp(`^${name}=.*$`, "m");
    content = pattern.test(content)
      ? content.replace(pattern, `${name}=${value}`)
      : `${content.trimEnd()}\n${name}=${value}\n`;
  }
  await writeFile(envFile, content, { mode: 0o600 });
  process.stdout.write(
    "Local PostgreSQL ready on 127.0.0.1:55432; migrations and restricted grants applied. Ignored .env.local updated; no credentials displayed.\n",
  );
} catch {
  process.stderr.write(
    "Local database setup failed. Verify Docker is running, port 55432 is free and existing local database files match the volume. No volume or data was deleted.\n",
  );
  process.exitCode = 1;
}
