import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// `.orion/project.json` is the canonical machine-readable identity and
// provenance record (ADR-0014, ADR-0017). The Orion foundation repository
// describes itself; a derived project additionally records its Orion ancestry.
export const manifestPath = ".orion/project.json";
export const upstreamRemote = "orion-upstream";
export const manifestSchemaVersion = 2;

export type Repository = { url: string; defaultBranch: string };
export type FoundationManifest = {
  schemaVersion: 2;
  kind: "foundation";
  name: string;
  repository: Repository;
};
export type ProjectManifest = {
  schemaVersion: 2;
  kind: "project";
  name: string;
  packageScope: string;
  repository: Repository;
  foundation: {
    name: string;
    repository: Repository;
    remote: typeof upstreamRemote;
    initializedFromCommit: string;
    baselineCommit: string;
  };
};
export type Manifest = FoundationManifest | ProjectManifest;

const commitPattern = /^[a-f0-9]{40}$/;
const namePattern = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,79}$/u;
// npm scope of the workspace packages; see validatePackageScope.
const packageScopePattern = /^@[a-z0-9][a-z0-9-]{0,49}$/;
const branchPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${manifestPath}: ${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...keys].sort()))
    throw new Error(
      `${manifestPath}: ${label} must contain exactly ${keys.join(", ")}`,
    );
}

export function validatePackageScope(
  scope: unknown,
  label = "packageScope",
): string {
  if (typeof scope !== "string" || !packageScopePattern.test(scope))
    throw new Error(
      `${label} must be an npm scope such as @acme: "@" followed by 1-50 lowercase letters, digits, or hyphens, starting with a letter or digit`,
    );
  return scope;
}

export function validateName(name: unknown, label = "name"): string {
  if (typeof name !== "string" || !namePattern.test(name))
    throw new Error(
      `${label} must be 1-80 letters, digits, spaces, dots, underscores, or hyphens, starting with a letter or digit`,
    );
  return name;
}

/**
 * Canonical web identity of a Git repository URL. Accepts HTTPS, SSH, and
 * scp-like forms, and refuses embedded credentials so a manifest or log can
 * never carry one.
 *
 * A port is never discarded. An explicit non-default HTTPS port is part of
 * the identity (`https://host:8443/owner/repo`); the URL parser already drops
 * the default 443. An SSH port only selects the SSH transport and implies
 * nothing about the HTTPS endpoint, so a non-default SSH port is refused
 * rather than guessed. The scp-like form cannot express a port.
 */
export function normalizeRepositoryUrl(input: string): string {
  const value = input.trim();
  let host: string;
  let port = "";
  let path: string;
  const scpLike = /^[A-Za-z0-9._-]+@([A-Za-z0-9.-]+):(?!\/)(.+)$/.exec(value);
  if (scpLike) {
    [, host, path] = scpLike;
  } else {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`Unsupported repository URL: ${value}`);
    }
    if (!["https:", "ssh:"].includes(url.protocol))
      throw new Error(`Repository URL must use https or ssh: ${value}`);
    if (url.password || (url.protocol === "https:" && url.username))
      throw new Error("Repository URL must not contain credentials");
    if (url.search || url.hash)
      throw new Error(`Repository URL must not have a query or fragment`);
    host = url.hostname;
    path = decodeURIComponent(url.pathname);
    if (url.protocol === "https:") {
      port = url.port;
      if (port && !(Number(port) >= 1 && Number(port) <= 65535))
        throw new Error(`Unsupported repository URL port: ${value}`);
    } else if (url.port && url.port !== "22") {
      throw new Error(
        `SSH port ${url.port} does not identify the repository's HTTPS endpoint; use the repository's HTTPS URL: ${value}`,
      );
    }
  }
  const segments = path
    .replace(/\.git\/?$/, "")
    .split("/")
    .filter(Boolean);
  if (
    segments.length < 2 ||
    segments.some(
      (segment) => segment === ".." || !/^[A-Za-z0-9._-]+$/.test(segment),
    ) ||
    !/^[A-Za-z0-9.-]+$/.test(host)
  )
    throw new Error(`Unsupported repository URL: ${value}`);
  return `https://${host.toLowerCase()}${port ? `:${port}` : ""}/${segments.join("/")}`;
}

/**
 * Exact repository identity. Normalization lowercases the host, as URL
 * semantics do, but path case is significant because self-hosted servers may
 * treat `acme/Ledger` and `acme/ledger` as different repositories.
 */
export function sameRepository(left: string, right: string): boolean {
  return normalizeRepositoryUrl(left) === normalizeRepositoryUrl(right);
}

/**
 * Conservative match for refusals only. Some hosts, such as GitHub, resolve
 * repository paths case-insensitively, so a URL that differs only in path
 * case may still reach the repository. Checks that refuse a URL because it
 * could be the foundation use this; checks that accept a URL as a given
 * repository use `sameRepository`.
 */
export function mayBeSameRepository(left: string, right: string): boolean {
  return (
    normalizeRepositoryUrl(left).toLowerCase() ===
    normalizeRepositoryUrl(right).toLowerCase()
  );
}

function parseRepository(value: unknown, label: string): Repository {
  const repository = record(value, label);
  exactKeys(repository, ["url", "defaultBranch"], label);
  if (
    typeof repository.url !== "string" ||
    normalizeRepositoryUrl(repository.url) !== repository.url
  )
    throw new Error(
      `${manifestPath}: ${label}.url must be a normalized https repository URL`,
    );
  if (
    typeof repository.defaultBranch !== "string" ||
    !branchPattern.test(repository.defaultBranch) ||
    repository.defaultBranch.split("/").includes("..")
  )
    throw new Error(`${manifestPath}: ${label}.defaultBranch is invalid`);
  return { url: repository.url, defaultBranch: repository.defaultBranch };
}

export function parseManifest(source: string): Manifest {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(`${manifestPath}: invalid JSON`);
  }
  const manifest = record(value, "manifest");
  if (manifest.schemaVersion === 1 && manifest.kind === "project")
    throw new Error(
      `${manifestPath}: schemaVersion 1 records the earlier derivation contract, which kept Orion's reference implementation and history; migrate the project as described in docs/project-derivation.md#migrate-a-project-from-schema-version-1`,
    );
  if (manifest.schemaVersion !== manifestSchemaVersion)
    throw new Error(`${manifestPath}: unsupported schemaVersion`);
  validateName(manifest.name, `${manifestPath}: name`);
  const repository = parseRepository(manifest.repository, "repository");
  if (manifest.kind === "foundation") {
    exactKeys(
      manifest,
      ["schemaVersion", "kind", "name", "repository"],
      "manifest",
    );
    return {
      schemaVersion: 2,
      kind: "foundation",
      name: manifest.name as string,
      repository,
    };
  }
  if (manifest.kind !== "project")
    throw new Error(`${manifestPath}: kind must be foundation or project`);
  exactKeys(
    manifest,
    [
      "schemaVersion",
      "kind",
      "name",
      "packageScope",
      "repository",
      "foundation",
    ],
    "manifest",
  );
  validatePackageScope(manifest.packageScope, `${manifestPath}: packageScope`);
  const foundation = record(manifest.foundation, "foundation");
  exactKeys(
    foundation,
    ["name", "repository", "remote", "initializedFromCommit", "baselineCommit"],
    "foundation",
  );
  validateName(foundation.name, `${manifestPath}: foundation.name`);
  const foundationRepository = parseRepository(
    foundation.repository,
    "foundation.repository",
  );
  if (foundation.remote !== upstreamRemote)
    throw new Error(
      `${manifestPath}: foundation.remote must be ${upstreamRemote}`,
    );
  for (const field of ["initializedFromCommit", "baselineCommit"] as const) {
    const commit = foundation[field];
    if (typeof commit !== "string" || !commitPattern.test(commit))
      throw new Error(
        `${manifestPath}: foundation.${field} must be a full commit SHA`,
      );
  }
  if (mayBeSameRepository(repository.url, foundationRepository.url))
    throw new Error(
      `${manifestPath}: a derived project must not claim the foundation repository as its own`,
    );
  return {
    schemaVersion: 2,
    kind: "project",
    name: manifest.name as string,
    packageScope: manifest.packageScope as string,
    repository,
    foundation: {
      name: foundation.name as string,
      repository: foundationRepository,
      remote: upstreamRemote,
      initializedFromCommit: foundation.initializedFromCommit as string,
      baselineCommit: foundation.baselineCommit as string,
    },
  };
}

export function readManifest(root: string): Manifest {
  let source: string;
  try {
    source = readFileSync(resolve(root, manifestPath), "utf8");
  } catch {
    throw new Error(`${manifestPath}: missing; this is not an Orion checkout`);
  }
  return parseManifest(source);
}

export function writeManifest(root: string, manifest: Manifest): void {
  // Round-trip through the parser so an invalid manifest is never written.
  const source = `${JSON.stringify(manifest, null, 2)}\n`;
  parseManifest(source);
  writeFileSync(resolve(root, manifestPath), source);
}
