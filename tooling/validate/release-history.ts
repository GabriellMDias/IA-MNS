import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const registryPath = "apps/api/prisma/release-history.json";
const migrationPrefix = "apps/api/prisma/migrations/";

type Migration = { directory: string; sha256: string };
type Release = {
  id: string;
  environment: string;
  gitCommit: string;
  migrations: Migration[];
};
type Registry = { schemaVersion: 1; recordedDurableReleases: Release[] };

function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sha256(source: string): string {
  // Git stores normalized text; Windows checkouts may use CRLF.
  return createHash("sha256")
    .update(source.replaceAll("\r\n", "\n"))
    .digest("hex");
}

function migrationsAtCommit(root: string, commit: string): Migration[] {
  if (!/^[a-f0-9]{40}$/.test(commit))
    throw new Error("Expected a full Git commit SHA");
  git(root, ["rev-parse", "--verify", `${commit}^{commit}`]);
  return git(root, [
    "ls-tree",
    "-r",
    "--name-only",
    commit,
    "--",
    "apps/api/prisma/migrations",
  ])
    .split("\n")
    .filter((path) => path.endsWith("/migration.sql"))
    .map((path) => ({
      directory: path.slice(migrationPrefix.length, -"/migration.sql".length),
      sha256: sha256(git(root, ["show", `${commit}:${path}`])),
    }));
}

function parseRegistry(source: string): Registry {
  const value: unknown = JSON.parse(source);
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("recordedDurableReleases" in value) ||
    !Array.isArray(value.recordedDurableReleases)
  )
    throw new Error("Invalid migration release registry");
  const releases = value.recordedDurableReleases as unknown[];
  const ids = new Set<string>();
  for (const entry of releases) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      throw new Error("Invalid migration release entry");
    const release = entry as Record<string, unknown>;
    if (
      typeof release.id !== "string" ||
      !/^[A-Za-z0-9._-]{1,100}$/.test(release.id) ||
      ids.has(release.id) ||
      typeof release.environment !== "string" ||
      !/^[A-Za-z0-9._-]{1,100}$/.test(release.environment) ||
      typeof release.gitCommit !== "string" ||
      !/^[a-f0-9]{40}$/.test(release.gitCommit) ||
      !Array.isArray(release.migrations) ||
      release.migrations.length === 0
    )
      throw new Error("Invalid migration release entry");
    ids.add(release.id);
    const names = new Set<string>();
    for (const item of release.migrations as unknown[]) {
      if (typeof item !== "object" || item === null || Array.isArray(item))
        throw new Error("Invalid released migration entry");
      const migration = item as Record<string, unknown>;
      if (
        typeof migration.directory !== "string" ||
        !/^\d{14}_[a-z0-9_]+$/.test(migration.directory) ||
        names.has(migration.directory) ||
        typeof migration.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(migration.sha256)
      )
        throw new Error("Invalid released migration entry");
      names.add(migration.directory);
    }
  }
  return value as Registry;
}

function previousRegistry(root: string, baseRef: string): Registry {
  git(root, ["rev-parse", "--verify", `${baseRef}^{commit}`]);
  try {
    git(root, ["cat-file", "-e", `${baseRef}:${registryPath}`]);
  } catch {
    return { schemaVersion: 1, recordedDurableReleases: [] };
  }
  return parseRegistry(git(root, ["show", `${baseRef}:${registryPath}`]));
}

export function checkReleaseHistory(root: string, baseRef?: string): number {
  // GitHub's first push has no previous commit, even with inherited Git history.
  const comparisonBase = baseRef === "0".repeat(40) ? undefined : baseRef;
  const registry = parseRegistry(
    readFileSync(resolve(root, registryPath), "utf8"),
  );
  if (comparisonBase) {
    if (!/^[a-f0-9]{40}$/.test(comparisonBase))
      throw new Error("Release comparison base must be a full Git commit SHA");
    const previous = previousRegistry(
      root,
      comparisonBase,
    ).recordedDurableReleases;
    if (
      JSON.stringify(
        registry.recordedDurableReleases.slice(0, previous.length),
      ) !== JSON.stringify(previous)
    )
      throw new Error(
        "Recorded durable release history cannot be changed or removed",
      );
  } else if (registry.recordedDurableReleases.length > 0) {
    throw new Error(
      "A Git base is required to verify append-only release history",
    );
  }

  for (const release of registry.recordedDurableReleases) {
    const atRelease = migrationsAtCommit(root, release.gitCommit);
    if (
      JSON.stringify(atRelease.map(({ directory }) => directory).sort()) !==
      JSON.stringify(
        release.migrations.map(({ directory }) => directory).sort(),
      )
    )
      throw new Error(
        `Release ${release.id} does not list its complete migration set`,
      );
    for (const migration of release.migrations) {
      const path = `${migrationPrefix}${migration.directory}/migration.sql`;
      const current = readFileSync(resolve(root, path), "utf8");
      if (
        atRelease.find(({ directory }) => directory === migration.directory)
          ?.sha256 !== migration.sha256 ||
        sha256(current) !== migration.sha256
      )
        throw new Error(`Released migration changed: ${migration.directory}`);
    }
  }
  return registry.recordedDurableReleases.length;
}

function localBase(root: string): string | undefined {
  const explicit = process.env.ORION_RELEASE_BASE_REF;
  if (explicit) return explicit;
  try {
    const branch = git(root, ["branch", "--show-current"]).trim();
    return branch === "main"
      ? git(root, ["rev-parse", "HEAD^"]).trim()
      : git(root, ["merge-base", "HEAD", "refs/remotes/origin/main"]).trim();
  } catch {
    return undefined;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv[2] === "--print-checksums") {
    const commit = process.argv[3];
    if (!commit)
      throw new Error("Provide the verified deployed Git commit SHA");
    process.stdout.write(
      `${JSON.stringify(migrationsAtCommit(process.cwd(), commit), null, 2)}\n`,
    );
  } else if (process.argv.length === 2) {
    const count = checkReleaseHistory(process.cwd(), localBase(process.cwd()));
    process.stdout.write(
      `Migration release registry valid: ${count} recorded durable release(s).\n`,
    );
  } else {
    throw new Error("Expected no arguments or --print-checksums <commit>");
  }
}
