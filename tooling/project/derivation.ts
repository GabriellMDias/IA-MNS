import {
  type SpawnSyncOptionsWithStringEncoding,
  execFileSync,
  spawnSync,
} from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, posix, resolve } from "node:path";
import {
  type FoundationManifest,
  type Manifest,
  type ProjectManifest,
  manifestPath,
  normalizeRepositoryUrl,
  readManifest,
  mayBeSameRepository,
  sameRepository,
  upstreamRemote,
  validateName,
  validatePackageScope,
  writeManifest,
} from "./manifest.ts";

// Git treats this push URL as a missing local repository, so any push to the
// canonical foundation remote fails before contacting a server.
export const fetchOnlyPushUrl = "orion-upstream-is-fetch-only";
export const derivationContractPath = ".orion/derivation.json";
export const projectPlanPath = "docs/project/implementation-plan.md";
export const projectHumanActionsPath = "docs/project/human-actions.md";
const releaseRegistryPath = "apps/api/prisma/release-history.json";
const templateDirectory = "tooling/project/templates";
// Files whose workspace package references are renamed to the project scope.
// Markdown keeps its wording: authored documentation names packages by role.
const scopedExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const scopeExcluded = [
  ".orion",
  "apps/web/src/generated",
  "docs",
  "tooling/project",
];
const codeExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

export class DerivationError extends Error {}

/**
 * `.orion/derivation.json`: which Orion paths are foundation-only, which
 * files every project owns from initialization, and the workspace package
 * scope a project renames (ADR-0017).
 */
export type DerivationContract = {
  foundationOnly: string[];
  foundationOnlyTerms: string[];
  isolationExempt: string[];
  projectFiles: Map<string, string>;
  workspaceScope: string;
};

function isSafePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value
      .split("/")
      .every(
        (segment) =>
          /^[A-Za-z0-9._-]+$/.test(segment) &&
          !/^\.{1,2}$/.test(segment) &&
          ![".git", "node_modules"].includes(segment.toLowerCase()),
      )
  );
}

function within(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function pathList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every(isSafePath))
    throw new Error(
      `${derivationContractPath}: ${label} must list repository-relative paths`,
    );
  if (new Set(value).size !== value.length)
    throw new Error(`${derivationContractPath}: ${label} repeats a path`);
  return value;
}

export function parseDerivationContract(source: string): DerivationContract {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(`${derivationContractPath}: invalid JSON`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${derivationContractPath}: must be an object`);
  const contract = value as Record<string, unknown>;
  const keys = [
    "schemaVersion",
    "foundationOnly",
    "foundationOnlyTerms",
    "isolationExempt",
    "projectFiles",
    "workspaceScope",
  ];
  if (
    JSON.stringify(Object.keys(contract).sort()) !==
    JSON.stringify([...keys].sort())
  )
    throw new Error(
      `${derivationContractPath}: must contain exactly ${keys.join(", ")}`,
    );
  if (contract.schemaVersion !== 1)
    throw new Error(`${derivationContractPath}: unsupported schemaVersion`);
  const foundationOnly = pathList(contract.foundationOnly, "foundationOnly");
  const isolationExempt = pathList(contract.isolationExempt, "isolationExempt");
  const terms = contract.foundationOnlyTerms;
  if (
    !Array.isArray(terms) ||
    !terms.every(
      (term) =>
        typeof term === "string" && term.trim() && term === term.toLowerCase(),
    )
  )
    throw new Error(
      `${derivationContractPath}: foundationOnlyTerms must list lowercase terms`,
    );
  const files = contract.projectFiles;
  if (typeof files !== "object" || files === null || Array.isArray(files))
    throw new Error(
      `${derivationContractPath}: projectFiles must be an object`,
    );
  const projectFiles = new Map<string, string>();
  for (const [path, template] of Object.entries(files)) {
    if (!isSafePath(path) || !isSafePath(template))
      throw new Error(
        `${derivationContractPath}: projectFiles must map repository-relative paths`,
      );
    if (!within(template, templateDirectory))
      throw new Error(
        `${derivationContractPath}: projectFiles template ${template} must be under ${templateDirectory}`,
      );
    projectFiles.set(path, template);
  }
  for (const path of foundationOnly) {
    // The derivation machinery and its record are shared by every project.
    if (
      [".orion", "tooling/project"].some(
        (shared) => within(path, shared) || within(shared, path),
      )
    )
      throw new Error(
        `${derivationContractPath}: ${path} is shared derivation tooling and cannot be foundation-only`,
      );
    for (const owned of projectFiles.keys())
      if (within(owned, path) || within(path, owned))
        throw new Error(
          `${derivationContractPath}: ${path} is both foundation-only and project-owned`,
        );
  }
  return {
    foundationOnly,
    foundationOnlyTerms: terms as string[],
    isolationExempt,
    projectFiles,
    workspaceScope: validatePackageScope(
      contract.workspaceScope,
      `${derivationContractPath}: workspaceScope`,
    ),
  };
}

export function readDerivationContract(root: string): DerivationContract {
  let source: string;
  try {
    source = readFileSync(resolve(root, derivationContractPath), "utf8");
  } catch {
    throw new Error(`${derivationContractPath}: missing`);
  }
  return parseDerivationContract(source);
}

function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitSucceeds(root: string, args: string[]): boolean {
  try {
    git(root, args);
    return true;
  } catch {
    return false;
  }
}

function isAncestor(root: string, ancestor: string, descendant: string) {
  return gitSucceeds(root, [
    "merge-base",
    "--is-ancestor",
    ancestor,
    descendant,
  ]);
}

function commitExists(root: string, commit: string): boolean {
  return gitSucceeds(root, ["cat-file", "-e", `${commit}^{commit}`]);
}

// Tracked paths present in the worktree; a conflicted path appears once.
function trackedFiles(root: string): string[] {
  const listed = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split("\0")
    .filter(Boolean);
  return [...new Set(listed)].filter((path) => {
    try {
      return statSync(resolve(root, path)).isFile();
    } catch {
      return false;
    }
  });
}

// Raw configuration, deliberately not `git remote get-url`, which expands
// insteadOf rewrites and would hide the configured repository identity.
function configuredRemoteUrl(root: string, remote: string, key = "url") {
  try {
    return git(root, ["config", "--get", `remote.${remote}.${key}`]);
  } catch {
    return undefined;
  }
}

// Every configured value; a remote may list several fetch or push URLs.
function configuredRemoteValues(
  root: string,
  remote: string,
  key: "url" | "pushurl",
): string[] {
  try {
    return git(root, ["config", "--get-all", `remote.${remote}.${key}`])
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Accepting a URL as a repository requires exact identity.
function isRepository(url: string | undefined, identity: string): boolean {
  if (!url) return false;
  try {
    return sameRepository(url, identity);
  } catch {
    return false;
  }
}

// Refusing a URL because it could reach a repository is case-conservative;
// see mayBeSameRepository.
function mayBeRepository(url: string | undefined, identity: string): boolean {
  if (!url) return false;
  try {
    return mayBeSameRepository(url, identity);
  } catch {
    return false;
  }
}

function recordedReleases(root: string): unknown[] {
  const value: unknown = JSON.parse(
    readFileSync(resolve(root, releaseRegistryPath), "utf8"),
  );
  const releases =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>).recordedDurableReleases
      : undefined;
  if (!Array.isArray(releases))
    throw new Error(`${releaseRegistryPath}: invalid release registry`);
  return releases;
}

// Mutations must stay inside this checkout, including through filesystem links.
function mutationPath(root: string, path: string): string {
  if (!isSafePath(path))
    throw new DerivationError("Unsafe repository mutation path");
  let target = realpathSync.native(root);
  for (const segment of path.split("/")) {
    target = resolve(target, segment);
    try {
      if (lstatSync(target).isSymbolicLink())
        throw new DerivationError(
          `Refusing to modify linked repository path: ${path}`,
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return target;
}

function requireProject(manifest: Manifest): ProjectManifest {
  if (manifest.kind !== "project")
    throw new DerivationError(
      "This is the Orion foundation repository, not a derived project",
    );
  return manifest;
}

/** The default npm scope for a project name: `Acme Ledger` → `@acme-ledger`. */
export function defaultPackageScope(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
  return `@${slug}`;
}

/**
 * Project-owned files rendered for a new project. Text templates (`.tmpl`)
 * receive the project identity; other templates are copied unchanged.
 */
export function renderProjectFiles(
  root: string,
  contract: DerivationContract,
  manifest: ProjectManifest,
  date: string,
): Map<string, string | Buffer> {
  const values: Record<string, string> = {
    NAME: manifest.name,
    PACKAGE_SCOPE: manifest.packageScope,
    DATE: date,
    BASELINE: manifest.foundation.initializedFromCommit,
    FOUNDATION_NAME: manifest.foundation.name,
    FOUNDATION_URL: manifest.foundation.repository.url,
    PROJECT_URL: manifest.repository.url,
  };
  const rendered = new Map<string, string | Buffer>();
  for (const [path, template] of contract.projectFiles) {
    const source = readFileSync(resolve(root, template));
    if (!template.endsWith(".tmpl")) {
      rendered.set(path, source);
      continue;
    }
    rendered.set(
      path,
      source
        .toString("utf8")
        .replaceAll("\r\n", "\n")
        .replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) => {
          if (!(key in values))
            throw new Error(`${template}: unknown ${match}`);
          return values[key];
        }),
    );
  }
  return rendered;
}

function scopedFiles(root: string): string[] {
  return trackedFiles(root).filter(
    (path) =>
      scopedExtensions.has(extname(path)) &&
      !scopeExcluded.some((prefix) => within(path, prefix)),
  );
}

/** Files that still reference the foundation's workspace package scope. */
export function foundationScopeReferences(
  root: string,
  contract: DerivationContract,
): string[] {
  const reference = `${contract.workspaceScope}/`;
  return scopedFiles(root).filter((path) =>
    readFileSync(resolve(root, path), "utf8").includes(reference),
  );
}

// Rename workspace package references (manifests, lockfile, imports) and the
// root package name. Idempotent, so upgrades can reapply it after merging.
function renameWorkspaceScope(
  root: string,
  contract: DerivationContract,
  packageScope: string,
  skipped = new Set<string>(),
): string[] {
  const changed: string[] = [];
  for (const path of foundationScopeReferences(root, contract)) {
    if (skipped.has(path)) continue;
    const target = mutationPath(root, path);
    writeFileSync(
      target,
      readFileSync(target, "utf8").replaceAll(
        `${contract.workspaceScope}/`,
        `${packageScope}/`,
      ),
    );
    changed.push(path);
  }
  if (skipped.has("package.json")) return changed;
  const rootPackage = mutationPath(root, "package.json");
  const source = readFileSync(rootPackage, "utf8");
  const manifest = JSON.parse(source) as Record<string, unknown>;
  if (manifest.name !== packageScope.slice(1)) {
    writeFileSync(
      rootPackage,
      `${JSON.stringify({ ...manifest, name: packageScope.slice(1) }, null, 2)}\n`,
    );
    if (!changed.includes("package.json")) changed.push("package.json");
  }
  return changed;
}

// Remove foundation-only paths, whether tracked, conflicted, or untracked.
function removeFoundationOnly(
  root: string,
  contract: DerivationContract,
): string[] {
  const present = contract.foundationOnly.filter((path) =>
    existsSync(resolve(root, path)),
  );
  if (present.length === 0) return [];
  const targets = present.map((path) => mutationPath(root, path));
  // An older project may have adopted a reference migration. Its recorded
  // durable history overrides removal of foundation-only content.
  for (const release of recordedReleases(root)) {
    if (
      !release ||
      typeof release !== "object" ||
      !("migrations" in release) ||
      !Array.isArray(release.migrations)
    )
      throw new DerivationError(
        `${releaseRegistryPath}: invalid release migrations; pruning refused`,
      );
    for (const migration of release.migrations as unknown[]) {
      if (
        !migration ||
        typeof migration !== "object" ||
        !("directory" in migration) ||
        typeof migration.directory !== "string" ||
        !/^\d{14}_[a-z0-9_]+$/.test(migration.directory)
      )
        throw new DerivationError(
          `${releaseRegistryPath}: invalid released migration; pruning refused`,
        );
      const path = `apps/api/prisma/migrations/${migration.directory}/migration.sql`;
      if (present.some((prefix) => within(path, prefix)))
        throw new DerivationError(
          `Cannot prune recorded durable migration ${migration.directory}; preserve its path and remove it from the foundation-only contract after reviewing the migration policy`,
        );
    }
  }
  git(root, ["rm", "-r", "-q", "-f", "--ignore-unmatch", "--", ...present]);
  for (const target of targets)
    rmSync(target, { recursive: true, force: true });
  return present;
}

function protectUpstream(root: string): void {
  // Replace every push URL; `git remote set-url --push` changes only one.
  git(root, [
    "config",
    "--replace-all",
    `remote.${upstreamRemote}.pushurl`,
    fetchOnlyPushUrl,
  ]);
  git(root, ["config", `remote.${upstreamRemote}.tagOpt`, "--no-tags"]);
  for (const branch of branchesTrackingUpstream(root))
    git(root, ["branch", "--unset-upstream", branch]);
}

// A local branch tracking the foundation would let an argument-free
// `git pull` merge upstream work outside the reviewed upgrade workflow.
function branchesTrackingUpstream(root: string): string[] {
  return git(root, [
    "for-each-ref",
    "--format=%(refname:short)%09%(upstream:remotename)",
    "refs/heads",
  ])
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"))
    .filter(([, remote]) => remote === upstreamRemote)
    .map(([branch]) => branch);
}

export type InitializationOptions = {
  name: string;
  repository: string;
  packageScope?: string;
  apply: boolean;
  date?: string;
  materialize?: (root: string) => void;
};

export type InitializationResult = {
  applied: boolean;
  manifest: ProjectManifest;
  removed: string[];
  actions: string[];
};

function run(root: string, command: string, args: string[]): void {
  // pnpm is a command script on Windows, which requires a shell. The shell
  // receives one command line built only from the fixed literal arguments
  // below, never from user input.
  const shell = command === "pnpm" && process.platform === "win32";
  const options: SpawnSyncOptionsWithStringEncoding = {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  };
  const result = shell
    ? spawnSync([command, ...args].join(" "), { ...options, shell: true })
    : spawnSync(command, args, options);
  if (result.status !== 0)
    throw new Error(
      `${[command === process.execPath ? "node" : command, ...args].join(" ")} failed:\n${(result.stderr || result.stdout || result.error?.message || "").trim().slice(-4000)}`,
    );
}

/**
 * Regenerate everything derived from the changed sources: workspace links for
 * the renamed scope, the Prisma client, API and database references (which
 * need a Testcontainers-compatible container runtime), SDK types, and the
 * Living Documentation data.
 */
export function materializeProject(root: string): void {
  run(root, "pnpm", ["install", "--frozen-lockfile", "--prefer-offline"]);
  run(root, "pnpm", ["db:generate"]);
  run(root, "pnpm", ["-C", "apps/api", "references:write"]);
  run(root, "pnpm", ["-C", "packages/sdk", "generate"]);
  run(root, process.execPath, [
    "tooling/documentation/generate.mjs",
    "--write",
  ]);
}

function initializationPreconditions(
  root: string,
  options: InitializationOptions,
): {
  foundation: FoundationManifest;
  contract: DerivationContract;
  head: string;
  projectUrl: string;
  packageScope: string;
} {
  let topLevel: string;
  try {
    topLevel = git(root, ["rev-parse", "--show-toplevel"]);
  } catch {
    throw new DerivationError(
      "Run this command inside a Git checkout of Orion",
    );
  }
  // Git reports the resolved top level; temporary directories are symlinks
  // on some platforms and Windows paths are case-insensitive.
  const canonical = (path: string) => {
    const real = realpathSync.native(path);
    return process.platform === "win32" ? real.toLowerCase() : real;
  };
  const samePath = (left: string, right: string) =>
    canonical(left) === canonical(right);
  if (!samePath(topLevel, root))
    throw new DerivationError("Run this command from the repository root");

  const manifest = readManifest(root);
  if (manifest.kind !== "foundation")
    throw new DerivationError(
      `${manifestPath} already describes the derived project "${manifest.name}"; initialization runs once, from a clean Orion clone`,
    );
  const problems: string[] = [];
  const attempt = (action: () => void) => {
    try {
      action();
    } catch (error) {
      problems.push((error as Error).message);
    }
  };
  let projectUrl = "";
  let packageScope = "";
  let contract: DerivationContract | undefined;
  attempt(() => validateName(options.name, "--name"));
  attempt(() => {
    projectUrl = normalizeRepositoryUrl(options.repository);
    if (mayBeSameRepository(projectUrl, manifest.repository.url))
      throw new Error(
        `--repository must be the new project's repository, not ${manifest.repository.url}`,
      );
  });
  attempt(() => {
    contract = readDerivationContract(root);
    for (const template of contract.projectFiles.values())
      if (!existsSync(resolve(root, template)))
        throw new Error(`${derivationContractPath}: missing ${template}`);
  });
  attempt(() => {
    const requested =
      options.packageScope?.trim() || defaultPackageScope(options.name);
    packageScope = validatePackageScope(
      requested,
      options.packageScope?.trim()
        ? "--package-scope"
        : `The package scope derived from --name (${requested})`,
    );
    if (contract && packageScope === contract.workspaceScope)
      throw new Error(
        `--package-scope must differ from the foundation scope ${contract.workspaceScope}`,
      );
  });

  if (git(root, ["rev-parse", "--is-shallow-repository"]) === "true")
    problems.push(
      "Shallow clones cannot preserve Orion ancestry; clone full history",
    );
  const changes = git(root, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (changes)
    problems.push(
      `The worktree has uncommitted or untracked changes; commit, stash, or remove them first:\n${changes.split("\n").slice(0, 10).join("\n")}`,
    );
  const branch = manifest.repository.defaultBranch;
  if (git(root, ["branch", "--show-current"]) !== branch)
    problems.push(`Check out the ${branch} branch before initialization`);
  // Renaming origin keeps every URL it lists, so each must be the foundation;
  // otherwise orion-upstream would start partly pointing elsewhere.
  const originUrls = configuredRemoteValues(root, "origin", "url");
  const foreignOriginUrls = originUrls.filter(
    (url) => !isRepository(url, manifest.repository.url),
  );
  if (originUrls.length === 0)
    problems.push(
      `The origin remote must be the canonical ${manifest.name} repository ${manifest.repository.url}; found no origin`,
    );
  else if (foreignOriginUrls.length > 0)
    problems.push(
      `Every origin URL must identify the canonical ${manifest.name} repository ${manifest.repository.url}; keep only it with git config --replace-all remote.origin.url ${manifest.repository.url}, or use a fresh clone. Found: ${foreignOriginUrls.join(", ")}`,
    );
  const head = git(root, ["rev-parse", "HEAD"]);
  const published = `refs/remotes/origin/${branch}`;
  if (!gitSucceeds(root, ["rev-parse", "--verify", "--quiet", published]))
    problems.push(`Fetch origin first; ${published} is missing`);
  else if (!isAncestor(root, head, published))
    problems.push(
      `HEAD contains commits that are not published on origin/${branch}; the baseline must be an immutable canonical commit`,
    );
  if (configuredRemoteUrl(root, upstreamRemote) !== undefined)
    problems.push(`A ${upstreamRemote} remote already exists`);
  if (existsSync(resolve(root, "docs/project")))
    problems.push("docs/project already exists");
  attempt(() => {
    if (recordedReleases(root).length > 0)
      throw new Error(
        `${releaseRegistryPath} records durable releases; they describe another deployment and cannot be inherited`,
      );
  });
  if (!gitSucceeds(root, ["var", "GIT_COMMITTER_IDENT"]))
    problems.push("Configure git user.name and user.email before initializing");

  if (problems.length > 0 || !contract)
    throw new DerivationError(
      `Initialization refused:\n- ${problems.join("\n- ")}`,
    );
  return { foundation: manifest, contract, head, projectUrl, packageScope };
}

export function initializeProject(
  root: string,
  options: InitializationOptions,
): InitializationResult {
  const { foundation, contract, head, projectUrl, packageScope } =
    initializationPreconditions(root, options);
  const manifest: ProjectManifest = {
    schemaVersion: 2,
    kind: "project",
    name: options.name,
    packageScope,
    repository: {
      url: projectUrl,
      defaultBranch: foundation.repository.defaultBranch,
    },
    foundation: {
      name: foundation.name,
      repository: foundation.repository,
      remote: upstreamRemote,
      initializedFromCommit: head,
      baselineCommit: head,
    },
  };
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const files = renderProjectFiles(root, contract, manifest, date);
  const removed = contract.foundationOnly.filter((path) =>
    existsSync(resolve(root, path)),
  );
  const actions = [
    `Record ${manifestPath}: project "${manifest.name}" (${projectUrl}) initialized from ${foundation.name} ${head}`,
    `Remove ${removed.length} foundation-only paths listed in ${derivationContractPath}: ${foundation.name}'s reference implementation and its own plan, human actions, and acceptance history`,
    `Write project-owned files: ${[...files.keys()].join(", ")}`,
    `Rename the workspace package scope ${contract.workspaceScope} to ${packageScope} in package manifests, the lockfile, and source; name the root package ${packageScope.slice(1)}`,
    "Regenerate workspace links, the Prisma client, API and database references (requires a Testcontainers-compatible container runtime), SDK types, and Living Documentation data",
    `Commit "Initialize ${manifest.name} from ${foundation.name} ${head.slice(0, 12)}" on ${manifest.repository.defaultBranch}, preserving ${foundation.name} history`,
    `Rename remote origin to ${upstreamRemote}; make it fetch-only, tag-free, and untracked by local branches`,
    `Add origin ${options.repository.trim()} (nothing is pushed)`,
  ];
  if (!options.apply) return { applied: false, manifest, removed, actions };

  try {
    writeManifest(root, manifest);
    removeFoundationOnly(root, contract);
    for (const [path, content] of files) {
      const target = mutationPath(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    renameWorkspaceScope(root, contract, packageScope);
    (options.materialize ?? materializeProject)(root);
    git(root, ["add", "--all"]);
    git(root, [
      "commit",
      "--quiet",
      "--message",
      `Initialize ${manifest.name} from ${foundation.name} ${head.slice(0, 12)}`,
      "--message",
      [
        `${foundation.name} repository: ${foundation.repository.url}`,
        `${foundation.name} baseline: ${head}`,
        `Project repository: ${projectUrl}`,
      ].join("\n"),
    ]);
  } catch (error) {
    // Preconditions proved the worktree was clean, so restoring HEAD and
    // removing untracked files discards only what this command wrote.
    git(root, ["reset", "--quiet", "--hard", head]);
    git(root, ["clean", "-fdq"]);
    throw new DerivationError(
      `Initialization failed and the checkout was restored to ${head}; run pnpm install --frozen-lockfile before retrying.\n${(error as Error).message}`,
    );
  }
  git(root, ["remote", "rename", "origin", upstreamRemote]);
  protectUpstream(root);
  git(root, ["remote", "add", "origin", options.repository.trim()]);
  return { applied: true, manifest, removed, actions };
}

/**
 * Reapply the clean-project contract after merging a foundation upgrade:
 * remove foundation-only paths the merge reintroduced and rename foundation
 * package-scope references. Project-owned files are never touched.
 */
export function pruneProject(root: string): string[] {
  const manifest = requireProject(readManifest(root));
  const contract = readDerivationContract(root);
  const conflicts = git(root, ["diff", "--name-only", "--diff-filter=U", "-z"])
    .split("\0")
    .filter(Boolean);
  const skipped = new Set([...conflicts, ...contract.projectFiles.keys()]);
  const removed = removeFoundationOnly(root, contract);
  const renamed = renameWorkspaceScope(
    root,
    contract,
    manifest.packageScope,
    skipped,
  );
  const actions = [
    removed.length
      ? `Removed foundation-only paths: ${removed.join(", ")}`
      : "No foundation-only paths were present",
    renamed.length
      ? `Renamed ${contract.workspaceScope} references to ${manifest.packageScope} in: ${renamed.join(", ")}`
      : `No ${contract.workspaceScope} references remained`,
  ];
  const remainingConflicts = conflicts.filter(
    (path) => !contract.foundationOnly.some((prefix) => within(path, prefix)),
  );
  if (remainingConflicts.length)
    actions.push(
      `Skipped unresolved files: ${remainingConflicts.join(", ")}; resolve and stage them, then rerun pnpm orion:prune`,
    );
  if (renamed.length) git(root, ["add", "--", ...renamed]);
  return actions;
}

// Relative Markdown link and module specifier targets in a file.
function relativeReferences(path: string, text: string): string[] {
  const pattern = codeExtensions.has(extname(path))
    ? /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["'](\.{1,2}\/[^"']+)["']/gm
    : extname(path) === ".md"
      ? /\]\((\.{0,2}\/?[^)\s#?:]+)(?:[#?][^)\s]*)?\)/g
      : undefined;
  if (!pattern) return [];
  return [...text.matchAll(pattern)].map((match) =>
    posix.normalize(posix.join(posix.dirname(path), match[1])),
  );
}

function stripExtension(path: string): string {
  return path.slice(0, path.length - extname(path).length);
}

/**
 * Shared files must work without the foundation-only paths: they may not
 * link to, import, name, or describe them. Exempt paths are derivation
 * tooling, history, and generated output regenerated in each project.
 */
export function isolationErrors(
  root: string,
  contract: DerivationContract,
): string[] {
  const exempt = [
    ...contract.foundationOnly,
    ...contract.projectFiles.keys(),
    ...contract.isolationExempt,
  ];
  const errors: string[] = [];
  for (const path of trackedFiles(root)) {
    if (exempt.some((prefix) => within(path, prefix))) continue;
    const content = readFileSync(resolve(root, path));
    if (content.subarray(0, 8000).includes(0)) continue;
    const text = content.toString("utf8");
    const lower = text.toLowerCase();
    const reasons = new Set<string>();
    for (const term of contract.foundationOnlyTerms)
      if (lower.includes(term)) reasons.add(`mentions "${term}"`);
    for (const target of contract.foundationOnly)
      if (text.includes(target)) reasons.add(`names ${target}`);
    for (const reference of relativeReferences(path, text))
      for (const target of contract.foundationOnly)
        if (
          within(reference, target) ||
          stripExtension(reference) === stripExtension(target)
        )
          reasons.add(`references ${target}`);
    if (reasons.size > 0)
      errors.push(
        `${path} ${[...reasons].join("; ")}, which is foundation-only; move the content into the foundation-only paths, a project-owned file, or generic wording`,
      );
  }
  return errors;
}

// origin may be the project repository, a fork, or a mirror, but never the
// foundation: that would make the foundation the normal push target.
function originTargetsFoundation(root: string, manifest: ProjectManifest) {
  return [
    ...configuredRemoteValues(root, "origin", "url"),
    ...configuredRemoteValues(root, "origin", "pushurl"),
  ].some((url) => mayBeRepository(url, manifest.foundation.repository.url));
}

function originFoundationError(manifest: ProjectManifest): string {
  return `origin identifies the ${manifest.foundation.name} foundation repository ${manifest.foundation.repository.url}, so product work would push there; point origin at ${manifest.repository.url} or a fork or mirror of it (git remote set-url origin <url>), then run pnpm orion:upstream`;
}

/**
 * Local remote configuration that could send product work to the foundation,
 * pull foundation changes outside a reviewed upgrade, or fetch a different
 * foundation. An absent orion-upstream is valid.
 */
export function remoteSafetyErrors(
  root: string,
  manifest: ProjectManifest,
): string[] {
  const identity = manifest.foundation.repository.url;
  const errors: string[] = [];
  if (originTargetsFoundation(root, manifest))
    errors.push(originFoundationError(manifest));
  const tracking = branchesTrackingUpstream(root);
  if (tracking.length > 0)
    errors.push(
      `Local branch(es) ${tracking.join(", ")} track ${upstreamRemote}, so git pull could merge foundation changes outside a reviewed upgrade; run pnpm orion:upstream to remove that tracking`,
    );
  const fetchUrls = configuredRemoteValues(root, upstreamRemote, "url");
  if (fetchUrls.length === 0) return errors;
  if (!fetchUrls.every((url) => isRepository(url, identity)))
    errors.push(
      `${upstreamRemote} fetches ${fetchUrls.join(", ")}, not the recorded foundation ${identity}; run git remote set-url ${upstreamRemote} ${identity}, then pnpm orion:upstream`,
    );
  const pushUrls = configuredRemoteValues(root, upstreamRemote, "pushurl");
  if (pushUrls.length !== 1 || pushUrls[0] !== fetchOnlyPushUrl)
    errors.push(
      `${upstreamRemote} is pushable; run pnpm orion:upstream to restore its fetch-only protection`,
    );
  return errors;
}

/** Configure the fetch-only foundation remote in any clone of a project. */
export function configureUpstream(root: string): string[] {
  const manifest = requireProject(readManifest(root));
  const identity = manifest.foundation.repository.url;
  if (originTargetsFoundation(root, manifest))
    throw new DerivationError(originFoundationError(manifest));
  const existing = configuredRemoteValues(root, upstreamRemote, "url");
  const actions: string[] = [];
  if (existing.length === 0) {
    git(root, ["remote", "add", upstreamRemote, identity]);
    actions.push(`Added ${upstreamRemote} ${identity}`);
  } else if (!existing.every((url) => isRepository(url, identity))) {
    throw new DerivationError(
      `${upstreamRemote} points at ${existing.join(", ")}, not the recorded foundation ${identity}`,
    );
  }
  protectUpstream(root);
  actions.push(
    `${upstreamRemote} is fetch-only, fetches no tags, and is tracked by no local branch`,
  );
  return actions;
}

export type ProjectStatus = {
  manifest: ProjectManifest;
  upstreamConfigured: boolean;
  pushDisabled: boolean;
  upstreamRef: string;
  upstreamCommit?: string;
  baselineIntegrated: boolean;
  upstreamCommitsAfterBaseline?: number;
  unrecordedIntegratedCommits?: number;
};

export function projectStatus(root: string): Manifest | ProjectStatus {
  const manifest = readManifest(root);
  if (manifest.kind !== "project") return manifest;
  const { baselineCommit } = manifest.foundation;
  const upstreamRef = `refs/remotes/${upstreamRemote}/${manifest.foundation.repository.defaultBranch}`;
  const status: ProjectStatus = {
    manifest,
    upstreamConfigured: configuredRemoteUrl(root, upstreamRemote) !== undefined,
    pushDisabled:
      configuredRemoteValues(root, upstreamRemote, "pushurl").join("\n") ===
      fetchOnlyPushUrl,
    upstreamRef,
    baselineIntegrated:
      commitExists(root, baselineCommit) &&
      isAncestor(root, baselineCommit, "HEAD"),
  };
  if (gitSucceeds(root, ["rev-parse", "--verify", "--quiet", upstreamRef])) {
    status.upstreamCommit = git(root, ["rev-parse", upstreamRef]);
    if (status.baselineIntegrated) {
      status.upstreamCommitsAfterBaseline = Number(
        git(root, ["rev-list", "--count", `${baselineCommit}..${upstreamRef}`]),
      );
      const integrated = git(root, ["merge-base", "HEAD", upstreamRef]);
      status.unrecordedIntegratedCommits = isAncestor(
        root,
        baselineCommit,
        integrated,
      )
        ? Number(
            git(root, [
              "rev-list",
              "--count",
              `${baselineCommit}..${integrated}`,
            ]),
          )
        : 0;
    }
  }
  return status;
}

export function formatStatus(status: Manifest | ProjectStatus): string[] {
  if (!("manifest" in status))
    return [
      `${status.name} foundation repository: ${status.repository.url}`,
      "Derived projects start from a fresh clone with pnpm orion:init-project; see docs/project-derivation.md.",
    ];
  const { manifest } = status;
  const { foundation } = manifest;
  const lines = [
    `Project: ${manifest.name} (${manifest.repository.url})`,
    `Foundation: ${foundation.name} ${foundation.repository.url}`,
    `Initialized from: ${foundation.initializedFromCommit}`,
    `Recorded baseline: ${foundation.baselineCommit}${status.baselineIntegrated ? "" : " (NOT an ancestor of HEAD)"}`,
    `Package scope: ${manifest.packageScope}`,
  ];
  if (!status.upstreamConfigured)
    lines.push(
      `Upstream: ${upstreamRemote} is not configured; run pnpm orion:upstream`,
    );
  else
    lines.push(
      `Upstream: ${upstreamRemote}${status.pushDisabled ? " (fetch-only)" : " (PUSHABLE; run pnpm orion:upstream)"}`,
    );
  if (status.upstreamCommit === undefined) {
    if (status.upstreamConfigured)
      lines.push(`Run git fetch ${upstreamRemote} to compare with upstream`);
    return lines;
  }
  lines.push(`Upstream ${status.upstreamRef}: ${status.upstreamCommit}`);
  if (status.upstreamCommitsAfterBaseline !== undefined)
    lines.push(
      `Upstream commits after the recorded baseline: ${status.upstreamCommitsAfterBaseline}`,
    );
  if (status.unrecordedIntegratedCommits)
    lines.push(
      `Integrated upstream commits not yet recorded as the baseline: ${status.unrecordedIntegratedCommits}; run pnpm orion:record-baseline after validation`,
    );
  if (status.upstreamCommitsAfterBaseline)
    lines.push(
      `Review: git log --oneline ${foundation.baselineCommit.slice(0, 12)}..${status.upstreamRef.replace("refs/remotes/", "")}`,
    );
  return lines;
}

export function recordBaseline(
  root: string,
  revision: string,
): { previous: string; next: string } {
  const manifest = requireProject(readManifest(root));
  if (git(root, ["status", "--porcelain=v1", "--untracked-files=all"]))
    throw new DerivationError(
      "Commit the validated upgrade before recording its baseline",
    );
  // Provenance may only come from the recorded foundation: verify the remote,
  // then refresh its branch so refs fetched earlier from another repository
  // cannot vouch for the candidate.
  const remoteProblems = remoteSafetyErrors(root, manifest);
  if (configuredRemoteValues(root, upstreamRemote, "url").length === 0)
    remoteProblems.push(
      `${upstreamRemote} is not configured; run pnpm orion:upstream`,
    );
  if (remoteProblems.length > 0)
    throw new DerivationError(
      `Baseline not recorded; the foundation remote must be verified first:\n- ${remoteProblems.join("\n- ")}`,
    );
  const branch = manifest.foundation.repository.defaultBranch;
  const upstreamRef = `refs/remotes/${upstreamRemote}/${branch}`;
  try {
    git(root, [
      "fetch",
      "--quiet",
      "--no-tags",
      upstreamRemote,
      `+refs/heads/${branch}:${upstreamRef}`,
    ]);
  } catch {
    throw new DerivationError(
      `Baseline not recorded; could not fetch ${branch} from ${upstreamRemote} ${manifest.foundation.repository.url}`,
    );
  }
  let next: string;
  try {
    next = git(root, ["rev-parse", "--verify", `${revision}^{commit}`]);
  } catch {
    throw new DerivationError(`Unknown commit: ${revision}`);
  }
  const previous = manifest.foundation.baselineCommit;
  const problems: string[] = [];
  if (!gitSucceeds(root, ["rev-parse", "--verify", "--quiet", upstreamRef]))
    problems.push(
      `Run pnpm orion:upstream and git fetch ${upstreamRemote}; ${upstreamRef} is missing`,
    );
  else if (!isAncestor(root, next, upstreamRef))
    problems.push(
      `${next} is not on the canonical ${manifest.foundation.name} ${manifest.foundation.repository.defaultBranch} branch`,
    );
  if (next === previous)
    problems.push(`${next} is already the recorded baseline`);
  else if (!isAncestor(root, previous, next))
    problems.push(
      `${next} does not descend from the recorded baseline ${previous}`,
    );
  if (!isAncestor(root, next, "HEAD"))
    problems.push(
      `${next} is not integrated into HEAD; merge it (without squashing) and validate first`,
    );
  if (problems.length > 0)
    throw new DerivationError(
      `Baseline not recorded:\n- ${problems.join("\n- ")}`,
    );
  writeManifest(root, {
    ...manifest,
    foundation: { ...manifest.foundation, baselineCommit: next },
  });
  return { previous, next };
}

export function checkProvenance(root: string): {
  errors: string[];
  summary: string;
} {
  let manifest: Manifest;
  let contract: DerivationContract;
  try {
    manifest = readManifest(root);
    contract = readDerivationContract(root);
  } catch (error) {
    return { errors: [(error as Error).message], summary: "" };
  }
  const errors: string[] = [];
  if (manifest.kind === "foundation") {
    if (existsSync(resolve(root, "docs/project")))
      errors.push(
        "docs/project exists, but project-owned plans belong only to derived projects",
      );
    for (const path of contract.foundationOnly)
      if (!existsSync(resolve(root, path)))
        errors.push(
          `${derivationContractPath}: foundation-only ${path} does not exist; remove the stale entry`,
        );
    for (const template of contract.projectFiles.values())
      if (!existsSync(resolve(root, template)))
        errors.push(`${derivationContractPath}: missing ${template}`);
    errors.push(...isolationErrors(root, contract));
    return {
      errors,
      summary: `${manifest.name} foundation manifest and derivation contract valid (${manifest.repository.url}); shared files are independent of ${contract.foundationOnly.length} foundation-only paths.`,
    };
  }
  const { foundation } = manifest;
  try {
    const rootPackage = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as { name?: unknown };
    if (rootPackage.name !== manifest.packageScope.slice(1))
      errors.push(
        `package.json name must be ${manifest.packageScope.slice(1)}; run pnpm orion:prune to restore the project identity`,
      );
  } catch {
    errors.push(
      "package.json is missing or invalid; resolve it before checking project identity",
    );
  }
  for (const path of [projectPlanPath, projectHumanActionsPath])
    if (!existsSync(resolve(root, path)))
      errors.push(`${path}: missing project-owned document`);
  const leftovers = contract.foundationOnly.filter((path) =>
    existsSync(resolve(root, path)),
  );
  if (leftovers.length > 0)
    errors.push(
      `Foundation-only paths are present: ${leftovers.join(", ")}; a foundation upgrade reintroduced them, so run pnpm orion:prune`,
    );
  const scoped = foundationScopeReferences(root, contract);
  if (scoped.length > 0)
    errors.push(
      `${scoped.slice(0, 10).join(", ")} still reference the foundation package scope ${contract.workspaceScope}; run pnpm orion:prune to rename them to ${manifest.packageScope}`,
    );
  const present = (commit: string, field: string) => {
    if (commitExists(root, commit)) return true;
    errors.push(
      `foundation.${field} ${commit} is not in this clone; fetch complete history (CI uses fetch-depth: 0)`,
    );
    return false;
  };
  const initial = present(
    foundation.initializedFromCommit,
    "initializedFromCommit",
  );
  const baseline = present(foundation.baselineCommit, "baselineCommit");
  if (
    initial &&
    baseline &&
    !isAncestor(
      root,
      foundation.initializedFromCommit,
      foundation.baselineCommit,
    )
  )
    errors.push(
      "foundation.baselineCommit does not descend from foundation.initializedFromCommit",
    );
  if (baseline && !isAncestor(root, foundation.baselineCommit, "HEAD"))
    errors.push(
      "foundation.baselineCommit is not an ancestor of HEAD; upgrades must be merged with their history (no squash or rebase)",
    );
  errors.push(...remoteSafetyErrors(root, manifest));
  return {
    errors,
    summary: `${manifest.name} provenance valid: ${foundation.name} baseline ${foundation.baselineCommit} (initialized from ${foundation.initializedFromCommit}); no foundation-only content; package scope ${manifest.packageScope}.`,
  };
}
