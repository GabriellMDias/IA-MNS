import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ApprovalRequestDisposition,
  type FoundationManifest,
  type Manifest,
  type ProjectManifest,
  manifestPath,
  normalizeRepositoryUrl,
  readManifest,
  sameRepository,
  upstreamRemote,
  validateName,
  writeManifest,
} from "./manifest.ts";

// Git treats this push URL as a missing local repository, so any push to the
// canonical foundation remote fails before contacting a server.
export const fetchOnlyPushUrl = "orion-upstream-is-fetch-only";
export const projectPlanPath = "docs/project/implementation-plan.md";
export const projectHumanActionsPath = "docs/project/human-actions.md";
const releaseRegistryPath = "apps/api/prisma/release-history.json";
const approvalRequestSourcePath = "apps/api/src/features/approval-requests";
const readmeBoundary = "\n## Start here\n";
const templateDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "templates",
);

export class DerivationError extends Error {}

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

function isRepository(url: string | undefined, identity: string): boolean {
  if (!url) return false;
  try {
    return sameRepository(url, identity);
  } catch {
    return false;
  }
}

function releaseCount(root: string): number {
  const value: unknown = JSON.parse(
    readFileSync(resolve(root, releaseRegistryPath), "utf8"),
  );
  const releases =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>).recordedDurableReleases
      : undefined;
  if (!Array.isArray(releases))
    throw new Error(`${releaseRegistryPath}: invalid release registry`);
  return releases.length;
}

function requireProject(manifest: Manifest): ProjectManifest {
  if (manifest.kind !== "project")
    throw new DerivationError(
      "This is the Orion foundation repository, not a derived project",
    );
  return manifest;
}

function render(template: string, values: Record<string, string>): string {
  const source = readFileSync(resolve(templateDirectory, template), "utf8");
  const rendered = source
    .replaceAll("\r\n", "\n")
    .replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) => {
      if (!(key in values)) throw new Error(`${template}: unknown ${match}`);
      return values[key];
    });
  return rendered;
}

export function renderProjectFiles(
  manifest: ProjectManifest,
  date: string,
): Map<string, string> {
  const values = {
    NAME: manifest.name,
    DATE: date,
    BASELINE: manifest.foundation.initializedFromCommit,
    FOUNDATION_NAME: manifest.foundation.name,
    FOUNDATION_URL: manifest.foundation.repository.url,
    PROJECT_URL: manifest.repository.url,
  };
  return new Map([
    ["README-intro.md", render("README-intro.md.tmpl", values)],
    [projectPlanPath, render("implementation-plan.md.tmpl", values)],
    [projectHumanActionsPath, render("human-actions.md.tmpl", values)],
  ]);
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
  apply: boolean;
  date?: string;
  regenerate?: (root: string) => void;
};

export type InitializationResult = {
  applied: boolean;
  manifest: ProjectManifest;
  actions: string[];
};

function regenerateDocumentation(root: string): void {
  const result = spawnSync(
    process.execPath,
    ["tooling/documentation/generate.mjs", "--write"],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(
      `Living documentation regeneration failed:\n${result.stderr || result.error?.message}`,
    );
}

function initializationPreconditions(
  root: string,
  options: InitializationOptions,
): { foundation: FoundationManifest; head: string; projectUrl: string } {
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
  attempt(() => validateName(options.name, "--name"));
  attempt(() => {
    projectUrl = normalizeRepositoryUrl(options.repository);
    if (sameRepository(projectUrl, manifest.repository.url))
      throw new Error(
        `--repository must be the new project's repository, not ${manifest.repository.url}`,
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
  const origin = configuredRemoteUrl(root, "origin");
  if (!isRepository(origin, manifest.repository.url))
    problems.push(
      `The origin remote must be the canonical ${manifest.name} repository ${manifest.repository.url}; found ${origin ?? "no origin"}`,
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
    if (releaseCount(root) > 0)
      throw new Error(
        `${releaseRegistryPath} records durable releases; they describe another deployment and cannot be inherited`,
      );
  });
  attempt(() => {
    if (
      !readFileSync(resolve(root, "README.md"), "utf8").includes(readmeBoundary)
    )
      throw new Error('README.md must contain a "## Start here" section');
  });
  if (!gitSucceeds(root, ["var", "GIT_COMMITTER_IDENT"]))
    problems.push("Configure git user.name and user.email before initializing");

  if (problems.length > 0)
    throw new DerivationError(
      `Initialization refused:\n- ${problems.join("\n- ")}`,
    );
  return { foundation: manifest, head, projectUrl };
}

export function initializeProject(
  root: string,
  options: InitializationOptions,
): InitializationResult {
  const { foundation, head, projectUrl } = initializationPreconditions(
    root,
    options,
  );
  const manifest: ProjectManifest = {
    schemaVersion: 1,
    kind: "project",
    name: options.name,
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
    referenceImplementations: { approvalRequest: "reference" },
  };
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const files = renderProjectFiles(manifest, date);
  const actions = [
    `Record ${manifestPath}: project "${manifest.name}" (${projectUrl}) initialized from ${foundation.name} ${head}`,
    `Replace the README introduction and current state; keep its shared sections`,
    `Create ${projectPlanPath} and ${projectHumanActionsPath} as this project's current plan and human actions`,
    "Mark the Approval Request slice as a retained reference implementation, not a product requirement",
    "Regenerate the Living Documentation portal data",
    `Commit "Initialize ${manifest.name} from ${foundation.name} ${head.slice(0, 12)}" on ${manifest.repository.defaultBranch}, preserving ${foundation.name} history`,
    `Rename remote origin to ${upstreamRemote}; make it fetch-only, tag-free, and untracked by local branches`,
    `Add origin ${options.repository.trim()} (nothing is pushed)`,
  ];
  if (!options.apply) return { applied: false, manifest, actions };

  try {
    writeManifest(root, manifest);
    const readme = readFileSync(resolve(root, "README.md"), "utf8").replaceAll(
      "\r\n",
      "\n",
    );
    const boundary = readme.indexOf(readmeBoundary);
    writeFileSync(
      resolve(root, "README.md"),
      `${files.get("README-intro.md")?.trimEnd()}\n${readme.slice(boundary)}`,
    );
    for (const path of [projectPlanPath, projectHumanActionsPath]) {
      mkdirSync(dirname(resolve(root, path)), { recursive: true });
      writeFileSync(resolve(root, path), files.get(path) ?? "");
    }
    (options.regenerate ?? regenerateDocumentation)(root);
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
    // Preconditions proved the worktree was clean, so restoring HEAD discards
    // only files written by this command.
    git(root, ["reset", "--quiet", "--hard", head]);
    git(root, [
      "clean",
      "-fdq",
      "--",
      "docs/project",
      "apps/web/src/generated",
    ]);
    throw error;
  }
  git(root, ["remote", "rename", "origin", upstreamRemote]);
  protectUpstream(root);
  git(root, ["remote", "add", "origin", options.repository.trim()]);
  return { applied: true, manifest, actions };
}

// origin may be the project repository, a fork, or a mirror, but never the
// foundation: that would make the foundation the normal push target.
function originTargetsFoundation(root: string, manifest: ProjectManifest) {
  return [
    ...configuredRemoteValues(root, "origin", "url"),
    ...configuredRemoteValues(root, "origin", "pushurl"),
  ].some((url) => isRepository(url, manifest.foundation.repository.url));
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
    `Approval Request reference implementation: ${manifest.referenceImplementations.approvalRequest}`,
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
  let next: string;
  try {
    next = git(root, ["rev-parse", "--verify", `${revision}^{commit}`]);
  } catch {
    throw new DerivationError(`Unknown commit: ${revision}`);
  }
  const previous = manifest.foundation.baselineCommit;
  const upstreamRef = `refs/remotes/${upstreamRemote}/${manifest.foundation.repository.defaultBranch}`;
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
  try {
    manifest = readManifest(root);
  } catch (error) {
    return { errors: [(error as Error).message], summary: "" };
  }
  const errors: string[] = [];
  if (manifest.kind === "foundation") {
    if (existsSync(resolve(root, "docs/project")))
      errors.push(
        "docs/project exists, but project-owned plans belong only to derived projects",
      );
    return {
      errors,
      summary: `${manifest.name} foundation manifest valid (${manifest.repository.url}).`,
    };
  }
  const { foundation } = manifest;
  for (const path of [projectPlanPath, projectHumanActionsPath])
    if (!existsSync(resolve(root, path)))
      errors.push(`${path}: missing project-owned document`);
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
  const disposition: ApprovalRequestDisposition =
    manifest.referenceImplementations.approvalRequest;
  const sourcePresent = existsSync(resolve(root, approvalRequestSourcePath));
  if (disposition === "removed" && sourcePresent)
    errors.push(
      `Approval Request is recorded as removed, but ${approvalRequestSourcePath} exists`,
    );
  if (disposition !== "removed" && !sourcePresent)
    errors.push(
      `${approvalRequestSourcePath} is absent; record approvalRequest as removed after a coherent removal`,
    );
  try {
    if (disposition === "reference" && releaseCount(root) > 0)
      errors.push(
        "A durable release is recorded while the Approval Request reference implementation is undecided; adopt or remove it first (PJ-04)",
      );
  } catch (error) {
    errors.push((error as Error).message);
  }
  return {
    errors,
    summary: `${manifest.name} provenance valid: ${foundation.name} baseline ${foundation.baselineCommit} (initialized from ${foundation.initializedFromCommit}); Approval Request ${disposition}.`,
  };
}
