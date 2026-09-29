import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import GithubSlugger from "github-slugger";
import MarkdownIt from "markdown-it";
import {
  DerivationError,
  checkProvenance,
  configureUpstream,
  fetchOnlyPushUrl,
  initializeProject,
  projectHumanActionsPath,
  projectPlanPath,
  projectStatus,
  recordBaseline,
  renderProjectFiles,
  type ProjectStatus,
} from "./derivation.ts";
import {
  type ProjectManifest,
  normalizeRepositoryUrl,
  parseManifest,
  readManifest,
  sameRepository,
} from "./manifest.ts";

const repositoryRoot = process.cwd();
const sandbox = mkdtempSync(join(tmpdir(), "orion-derivation-"));
const remotes = join(sandbox, "remotes");
const remoteBase = `${pathToFileURL(remotes).href}/`;
const canonicalUrl = "https://example.test/orion/core";
const projectUrl = "git@example.test:acme/ledger.git";

// Isolate Git from user/system configuration and resolve the synthetic
// https/ssh repository identities to local bare repositories.
const gitConfig: [string, string][] = [
  [`url.${remoteBase}.insteadOf`, "https://example.test/"],
  [`url.${remoteBase}.insteadOf`, "git@example.test:"],
  ["init.defaultBranch", "main"],
  ["commit.gpgSign", "false"],
  ["core.autocrlf", "false"],
  ["protocol.file.allow", "always"],
  ["advice.detachedHead", "false"],
];
const emptyGlobalConfig = join(sandbox, "gitconfig");
writeFileSync(emptyGlobalConfig, "");
Object.assign(process.env, {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: emptyGlobalConfig,
  GIT_CONFIG_COUNT: String(gitConfig.length),
  GIT_AUTHOR_NAME: "Orion Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Orion Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
});
gitConfig.forEach(([key, value], index) => {
  process.env[`GIT_CONFIG_KEY_${index}`] = key;
  process.env[`GIT_CONFIG_VALUE_${index}`] = value;
});
test.after(() => {
  if (!sandbox.startsWith(`${resolve(tmpdir())}${sep}`))
    throw new Error("Test directory escaped the temporary root");
  rmSync(sandbox, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function write(root: string, path: string, content: string) {
  mkdirSync(dirname(resolve(root, path)), { recursive: true });
  writeFileSync(resolve(root, path), content);
}

let fixtureCount = 0;
function fixture(options: { releases?: unknown[] } = {}) {
  const base = join(sandbox, `case-${(fixtureCount += 1)}`);
  const canonicalBare = join(remotes, `orion${fixtureCount}`, "core");
  const productBare = join(remotes, `acme${fixtureCount}`, "ledger.git");
  const canonical = canonicalUrl.replace("/orion/", `/orion${fixtureCount}/`);
  const product = projectUrl.replace(":acme/", `:acme${fixtureCount}/`);
  const fork = `https://example.test/fork${fixtureCount}/ledger`;
  const forkBare = join(remotes, `fork${fixtureCount}`, "ledger");
  for (const bare of [canonicalBare, productBare]) {
    mkdirSync(bare, { recursive: true });
    git(bare, "init", "--quiet", "--bare");
  }
  const seed = join(base, "seed");
  mkdirSync(seed, { recursive: true });
  git(seed, "init", "--quiet");
  write(
    seed,
    ".orion/project.json",
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: "foundation",
        name: "Orion",
        repository: { url: canonical, defaultBranch: "main" },
      },
      null,
      2,
    )}\n`,
  );
  write(
    seed,
    "README.md",
    "# Orion\n\nFoundation introduction.\n\n## Current state\n\nFoundation state.\n\n## Start here\n\nShared routes.\n",
  );
  write(
    seed,
    "apps/api/prisma/release-history.json",
    JSON.stringify({
      schemaVersion: 1,
      recordedDurableReleases: options.releases ?? [],
    }),
  );
  write(
    seed,
    "apps/api/src/features/approval-requests/domain.ts",
    "export {};\n",
  );
  write(seed, "docs/policy.md", "# Policy\n\nVersion 1.\n");
  git(seed, "add", "--all");
  git(seed, "commit", "--quiet", "--message", "Foundation");
  git(seed, "remote", "add", "origin", canonical);
  git(seed, "push", "--quiet", "origin", "main");
  const work = join(base, "work");
  git(base, "clone", "--quiet", canonical, work);
  const regenerated: string[] = [];
  const regenerate = (root: string) => {
    regenerated.push(root);
    write(root, "apps/web/src/generated/manifest.json", "{}\n");
  };
  return {
    base,
    seed,
    work,
    canonical,
    product,
    canonicalBare,
    productBare,
    fork,
    forkBare,
    regenerated,
    init(overrides: Partial<Parameters<typeof initializeProject>[1]> = {}) {
      return initializeProject(work, {
        name: "Acme Ledger",
        repository: product,
        apply: true,
        date: "2026-09-29",
        regenerate,
        ...overrides,
      });
    },
    advanceFoundation(message: string) {
      write(seed, "docs/policy.md", `# Policy\n\n${message}.\n`);
      git(seed, "commit", "--quiet", "--all", "--message", message);
      git(seed, "push", "--quiet", "origin", "main");
      return git(seed, "rev-parse", "HEAD");
    },
  };
}

function refusal(action: () => unknown, pattern: RegExp) {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof DerivationError, String(error));
    assert.match(error.message, pattern);
    return true;
  });
}

void test("repository URLs normalize to a credential-free identity", () => {
  for (const url of [
    "git@github.com:Acme/Ledger.git",
    "ssh://git@github.com/Acme/Ledger.git",
    "https://github.com/Acme/Ledger.git",
    "https://github.com/Acme/Ledger/",
  ])
    assert.equal(normalizeRepositoryUrl(url), "https://github.com/Acme/Ledger");
  assert.ok(
    sameRepository(
      "git@github.com:gabriellmdias/orion.git",
      "https://github.com/GabriellMDias/Orion",
    ),
  );
  assert.throws(
    () => normalizeRepositoryUrl("https://user:token@github.com/acme/ledger"),
    /credentials/,
  );
  for (const url of [
    "file:///tmp/orion",
    "../orion",
    "https://github.com/acme",
  ])
    assert.throws(() => normalizeRepositoryUrl(url));
});

void test("explicit ports are preserved or refused, never discarded", () => {
  const custom = "https://git.example.com:8443/acme/ledger";
  assert.equal(normalizeRepositoryUrl(`${custom}.git`), custom);
  assert.equal(normalizeRepositoryUrl(`${custom}/`), custom);
  // The default HTTPS port is the same endpoint as no port.
  assert.equal(
    normalizeRepositoryUrl("https://git.example.com:443/acme/ledger.git"),
    "https://git.example.com/acme/ledger",
  );
  assert.ok(
    sameRepository(
      "https://GIT.example.com:443/Acme/Ledger",
      "https://git.example.com/acme/ledger",
    ),
  );
  for (const [left, right] of [
    [custom, "https://git.example.com/acme/ledger"],
    [custom, "https://git.example.com:9443/acme/ledger"],
    [custom, "git@git.example.com:acme/ledger.git"],
  ])
    assert.equal(sameRepository(left, right), false, `${left} vs ${right}`);

  // The default SSH port maps to the HTTPS identity like the scp-like form.
  assert.equal(
    normalizeRepositoryUrl("ssh://git@git.example.com:22/acme/ledger.git"),
    "https://git.example.com/acme/ledger",
  );
  assert.throws(
    () =>
      normalizeRepositoryUrl("ssh://git@git.example.com:2222/acme/ledger.git"),
    /SSH port 2222 does not identify the repository's HTTPS endpoint/,
  );
  // scp-like syntax has no port; a leading number is a path segment.
  assert.equal(
    normalizeRepositoryUrl("git@git.example.com:8443/acme/ledger.git"),
    "https://git.example.com/8443/acme/ledger",
  );
  assert.throws(
    () =>
      normalizeRepositoryUrl(
        "https://user:secret@git.example.com:8443/acme/ledger",
      ),
    /credentials/,
  );
  assert.throws(() =>
    normalizeRepositoryUrl("https://git.example.com:0/acme/ledger"),
  );

  const manifest = {
    schemaVersion: 1,
    kind: "foundation",
    name: "Orion",
    repository: { url: custom, defaultBranch: "main" },
  };
  assert.equal(parseManifest(JSON.stringify(manifest)).repository.url, custom);
  assert.throws(
    () =>
      parseManifest(
        JSON.stringify({
          ...manifest,
          repository: {
            url: "https://git.example.com:443/acme/ledger",
            defaultBranch: "main",
          },
        }),
      ),
    /normalized https repository URL/,
  );
});

// This checkout is Orion itself or a project derived from it; both must pass.
void test("this repository's manifest and provenance are valid", () => {
  const manifest = readManifest(repositoryRoot);
  assert.ok(["foundation", "project"].includes(manifest.kind));
  assert.deepEqual(checkProvenance(repositoryRoot).errors, []);
});

void test("project templates render complete documents whose local links resolve", () => {
  const manifest = parseManifest(
    JSON.stringify({
      schemaVersion: 1,
      kind: "project",
      name: "Acme Ledger",
      repository: {
        url: "https://github.com/acme/ledger",
        defaultBranch: "main",
      },
      foundation: {
        name: "Orion",
        repository: readManifest(repositoryRoot).repository,
        remote: "orion-upstream",
        initializedFromCommit: "a".repeat(40),
        baselineCommit: "a".repeat(40),
      },
      referenceImplementations: { approvalRequest: "reference" },
    }),
  ) as ProjectManifest;
  const rendered = renderProjectFiles(manifest, "2026-09-29");
  const documents = new Map<string, string>([
    ["README.md", rendered.get("README-intro.md") ?? ""],
    [projectPlanPath, rendered.get(projectPlanPath) ?? ""],
    [projectHumanActionsPath, rendered.get(projectHumanActionsPath) ?? ""],
  ]);
  const markdown = new MarkdownIt();
  const source = (name: string) =>
    documents.get(name) ?? readFileSync(resolve(repositoryRoot, name), "utf8");
  const anchors = (name: string) => {
    const slugger = new GithubSlugger();
    const tokens = markdown.parse(source(name), {});
    return new Set(
      tokens.flatMap((token, index) =>
        token.type === "heading_open"
          ? [slugger.slug(tokens[index + 1]?.content ?? "")]
          : [],
      ),
    );
  };
  for (const [name, text] of documents) {
    assert.doesNotMatch(
      text,
      /\{\{|\}\}/,
      `${name} has unresolved placeholders`,
    );
    const links = markdown
      .parse(text, {})
      .flatMap((token) => token.children ?? [])
      .filter((token) => token.type === "link_open")
      .map((token) => String(token.attrGet("href") ?? ""))
      .filter((href) => !/^https?:/.test(href));
    assert.ok(links.length > 0);
    for (const href of links) {
      const [path, fragment] = href.split("#", 2);
      const target = path
        ? posix.normalize(posix.join(posix.dirname(name), path))
        : name;
      assert.ok(
        documents.has(target) || existsSync(resolve(repositoryRoot, target)),
        `${name}: missing ${href}`,
      );
      if (fragment)
        assert.ok(anchors(target).has(fragment), `${name}: missing ${href}`);
    }
  }
});

void test("a dry run verifies preconditions and changes nothing", () => {
  const repo = fixture();
  const before = git(repo.work, "rev-parse", "HEAD");
  const result = repo.init({ apply: false });
  assert.equal(result.applied, false);
  assert.equal(result.manifest.foundation.initializedFromCommit, before);
  assert.equal(git(repo.work, "status", "--porcelain"), "");
  assert.equal(git(repo.work, "remote"), "origin");
  assert.equal(repo.regenerated.length, 0);
});

void test("initialization preserves ancestry, records provenance, and protects the foundation", () => {
  const repo = fixture();
  const orionHead = git(repo.work, "rev-parse", "HEAD");
  const result = repo.init();
  assert.equal(result.applied, true);

  const manifest = readManifest(repo.work);
  assert.equal(manifest.kind, "project");
  if (manifest.kind !== "project") return;
  assert.equal(manifest.name, "Acme Ledger");
  assert.equal(manifest.repository.url, normalizeRepositoryUrl(repo.product));
  assert.equal(manifest.foundation.repository.url, repo.canonical);
  assert.equal(manifest.foundation.initializedFromCommit, orionHead);
  assert.equal(manifest.foundation.baselineCommit, orionHead);
  assert.equal(manifest.referenceImplementations.approvalRequest, "reference");

  assert.equal(git(repo.work, "rev-parse", "HEAD^"), orionHead);
  assert.equal(
    git(repo.work, "log", "-1", "--format=%s"),
    `Initialize Acme Ledger from Orion ${orionHead.slice(0, 12)}`,
  );
  assert.equal(git(repo.work, "status", "--porcelain"), "");
  assert.deepEqual(repo.regenerated, [repo.work]);
  assert.ok(
    git(repo.work, "ls-files")
      .split("\n")
      .includes("apps/web/src/generated/manifest.json"),
  );
  const readme = readFileSync(join(repo.work, "README.md"), "utf8");
  assert.match(readme, /^# Acme Ledger\n/);
  assert.match(readme, new RegExp(`from Orion commit \`${orionHead}\``));
  assert.doesNotMatch(readme, /Foundation (introduction|state)/);
  assert.match(readme, /\n\n## Start here\n\nShared routes\.\n$/);
  for (const path of [projectPlanPath, projectHumanActionsPath])
    assert.match(
      readFileSync(join(repo.work, path), "utf8"),
      /^# Acme Ledger /,
    );

  const config = (key: string) => git(repo.work, "config", "--get", key);
  assert.equal(config("remote.origin.url"), repo.product);
  assert.equal(config("remote.orion-upstream.url"), repo.canonical);
  assert.equal(config("remote.orion-upstream.pushurl"), fetchOnlyPushUrl);
  assert.equal(config("remote.orion-upstream.tagOpt"), "--no-tags");
  assert.throws(() => config("branch.main.remote"));

  const canonicalMain = git(repo.canonicalBare, "rev-parse", "main");
  assert.throws(() => git(repo.work, "push", "orion-upstream", "main"));
  assert.throws(() => git(repo.work, "push"));
  assert.equal(git(repo.canonicalBare, "rev-parse", "main"), canonicalMain);
  git(repo.work, "push", "--quiet", "-u", "origin", "main");
  assert.equal(
    git(repo.productBare, "rev-parse", "main"),
    git(repo.work, "rev-parse", "HEAD"),
  );
  assert.deepEqual(checkProvenance(repo.work).errors, []);
  refusal(() => repo.init(), /already describes the derived project/);
});

void test("initialization refuses ambiguous or unsafe starting states", () => {
  const dirty = fixture();
  refusal(
    () =>
      initializeProject(join(dirty.work, "docs"), {
        name: "Acme Ledger",
        repository: dirty.product,
        apply: true,
      }),
    /from the repository root/,
  );
  write(dirty.work, "docs/policy.md", "# Policy\n\nLocal edit.\n");
  refusal(() => dirty.init(), /uncommitted or untracked changes/);
  git(dirty.work, "checkout", "--", "docs/policy.md");
  write(dirty.work, "notes.txt", "untracked\n");
  refusal(() => dirty.init(), /notes\.txt/);
  rmSync(join(dirty.work, "notes.txt"));

  refusal(
    () =>
      dirty.init({
        repository: dirty.canonical.replace(
          "https://example.test/",
          "git@example.test:",
        ),
      }),
    /must be the new project's repository/,
  );
  refusal(() => dirty.init({ name: "Bad`Name" }), /--name must be/);
  refusal(
    () =>
      dirty.init({
        repository: "https://user:secret@example.test/acme/ledger",
      }),
    /credentials/,
  );

  git(
    dirty.work,
    "remote",
    "set-url",
    "origin",
    "https://example.test/fork/core",
  );
  refusal(() => dirty.init(), /origin remote must be the canonical/);
  git(dirty.work, "remote", "set-url", "origin", dirty.canonical);

  git(dirty.work, "commit", "--quiet", "--allow-empty", "--message", "local");
  refusal(() => dirty.init(), /not published on origin\/main/);
  git(dirty.work, "reset", "--quiet", "--hard", "origin/main");

  git(dirty.work, "switch", "--quiet", "-c", "feature");
  refusal(() => dirty.init(), /Check out the main branch/);
  git(dirty.work, "switch", "--quiet", "main");

  git(dirty.work, "remote", "add", "orion-upstream", dirty.canonical);
  refusal(() => dirty.init(), /orion-upstream remote already exists/);
  git(dirty.work, "remote", "remove", "orion-upstream");
  assert.equal(git(dirty.work, "status", "--porcelain"), "");
  assert.equal(readManifest(dirty.work).kind, "foundation");

  const released = fixture({
    releases: [
      {
        id: "r1",
        environment: "prod",
        gitCommit: "a".repeat(40),
        migrations: [],
      },
    ],
  });
  refusal(() => released.init(), /records durable releases/);

  const shallow = fixture();
  const shallowWork = join(shallow.base, "shallow");
  git(
    shallow.base,
    "clone",
    "--quiet",
    "--depth",
    "1",
    `${shallow.canonical}`.replace("https://example.test/", remoteBase),
    shallowWork,
  );
  git(shallowWork, "remote", "set-url", "origin", shallow.canonical);
  refusal(
    () =>
      initializeProject(shallowWork, {
        name: "Acme Ledger",
        repository: shallow.product,
        apply: true,
      }),
    /Shallow clones/,
  );
});

void test("a failed initialization restores the clean foundation checkout", () => {
  const repo = fixture();
  assert.throws(
    () =>
      repo.init({
        regenerate: () => {
          throw new Error("generation failed");
        },
      }),
    /generation failed/,
  );
  assert.equal(
    git(repo.work, "status", "--porcelain", "--untracked-files=all"),
    "",
  );
  assert.equal(readManifest(repo.work).kind, "foundation");
  assert.equal(git(repo.work, "remote"), "origin");
});

void test("upgrades are reviewed merges whose baseline is recorded only after integration", () => {
  const repo = fixture();
  const initial = git(repo.work, "rev-parse", "HEAD");
  repo.init();
  git(repo.work, "push", "--quiet", "-u", "origin", "main");

  const next = repo.advanceFoundation("Version 2");
  git(repo.work, "fetch", "--quiet", "orion-upstream");
  let status = projectStatus(repo.work) as ProjectStatus;
  assert.equal(status.pushDisabled, true);
  assert.equal(status.upstreamCommit, next);
  assert.equal(status.upstreamCommitsAfterBaseline, 1);
  assert.equal(status.unrecordedIntegratedCommits, 0);
  refusal(() => recordBaseline(repo.work, next), /not integrated into HEAD/);

  git(repo.work, "switch", "--quiet", "-c", "orion-upgrade");
  git(
    repo.work,
    "merge",
    "--quiet",
    "--no-ff",
    "--no-edit",
    "orion-upstream/main",
  );
  status = projectStatus(repo.work) as ProjectStatus;
  assert.equal(status.unrecordedIntegratedCommits, 1);
  assert.deepEqual(recordBaseline(repo.work, "orion-upstream/main"), {
    previous: initial,
    next,
  });
  refusal(
    () => recordBaseline(repo.work, next),
    /Commit the validated upgrade/,
  );
  git(
    repo.work,
    "commit",
    "--quiet",
    "--all",
    "--message",
    "Record Orion baseline",
  );
  const manifest = readManifest(repo.work) as ProjectManifest;
  assert.equal(manifest.foundation.baselineCommit, next);
  assert.equal(manifest.foundation.initializedFromCommit, initial);
  assert.deepEqual(checkProvenance(repo.work).errors, []);
  refusal(
    () => recordBaseline(repo.work, next),
    /already the recorded baseline/,
  );
  refusal(() => recordBaseline(repo.work, initial), /does not descend/);

  git(repo.work, "commit", "--quiet", "--allow-empty", "--message", "product");
  refusal(
    () => recordBaseline(repo.work, "HEAD"),
    /not on the canonical Orion main/,
  );

  const squashed = repo.advanceFoundation("Version 3");
  git(repo.work, "fetch", "--quiet", "orion-upstream");
  git(repo.work, "merge", "--quiet", "--squash", "orion-upstream/main");
  git(repo.work, "commit", "--quiet", "--message", "Squashed upgrade");
  refusal(
    () => recordBaseline(repo.work, squashed),
    /not integrated into HEAD/,
  );
  write(
    repo.work,
    ".orion/project.json",
    `${JSON.stringify({ ...manifest, foundation: { ...manifest.foundation, baselineCommit: squashed } }, null, 2)}\n`,
  );
  assert.match(
    checkProvenance(repo.work).errors.join("\n"),
    /not an ancestor of HEAD/,
  );
});

void test("other clones configure the fetch-only foundation remote from the manifest", () => {
  const repo = fixture();
  repo.init();
  git(repo.work, "push", "--quiet", "-u", "origin", "main");
  const teammate = join(repo.base, "teammate");
  git(repo.base, "clone", "--quiet", repo.product, teammate);
  assert.equal(git(teammate, "remote"), "origin");
  assert.equal(
    (projectStatus(teammate) as ProjectStatus).upstreamConfigured,
    false,
  );
  // A normal clone has no orion-upstream until a developer configures it.
  assert.deepEqual(checkProvenance(teammate).errors, []);
  configureUpstream(teammate);
  configureUpstream(teammate);
  assert.equal(
    git(teammate, "config", "--get", "remote.orion-upstream.url"),
    repo.canonical,
  );
  assert.equal(
    git(teammate, "config", "--get", "remote.orion-upstream.pushurl"),
    fetchOnlyPushUrl,
  );
  git(teammate, "fetch", "--quiet", "orion-upstream");
  assert.deepEqual(checkProvenance(teammate).errors, []);

  git(
    teammate,
    "remote",
    "set-url",
    "orion-upstream",
    "https://example.test/other/core",
  );
  refusal(() => configureUpstream(teammate), /points at/);
  git(teammate, "remote", "remove", "orion-upstream");
  git(teammate, "remote", "set-url", "origin", repo.canonical);
  refusal(
    () => configureUpstream(teammate),
    /origin identifies the Orion foundation repository/,
  );
});

void test("provenance validation rejects remotes that push to or fetch the wrong foundation", () => {
  const repo = fixture();
  repo.init();
  git(repo.work, "push", "--quiet", "-u", "origin", "main");
  const errors = () => checkProvenance(repo.work).errors.join("\n");
  assert.equal(errors(), "");

  const canonicalSsh = repo.canonical.replace(
    "https://example.test/",
    "git@example.test:",
  );
  for (const url of [repo.canonical, `${canonicalSsh}.git`]) {
    git(repo.work, "remote", "set-url", "origin", url);
    assert.match(
      errors(),
      /origin identifies the Orion foundation repository .*git remote set-url origin <url>.*pnpm orion:upstream/,
    );
  }
  git(repo.work, "remote", "set-url", "origin", repo.product);
  git(repo.work, "remote", "set-url", "--push", "origin", repo.canonical);
  assert.match(errors(), /origin identifies the Orion foundation repository/);
  git(repo.work, "config", "--unset-all", "remote.origin.pushurl");
  assert.equal(errors(), "");

  git(
    repo.work,
    "remote",
    "set-url",
    "orion-upstream",
    "https://example.test/other/core",
  );
  assert.match(
    errors(),
    /orion-upstream fetches https:\/\/example\.test\/other\/core, not the recorded foundation/,
  );
  git(repo.work, "remote", "set-url", "orion-upstream", repo.canonical);
  assert.equal(errors(), "");

  const pushable = /orion-upstream is pushable; run pnpm orion:upstream/;
  git(repo.work, "config", "--unset-all", "remote.orion-upstream.pushurl");
  assert.match(errors(), pushable);
  configureUpstream(repo.work);
  assert.equal(errors(), "");
  git(
    repo.work,
    "remote",
    "set-url",
    "--push",
    "orion-upstream",
    repo.canonical,
  );
  assert.match(errors(), pushable);
  configureUpstream(repo.work);
  git(
    repo.work,
    "config",
    "--add",
    "remote.orion-upstream.pushurl",
    repo.canonical,
  );
  assert.match(errors(), pushable);
  configureUpstream(repo.work);
  assert.equal(
    git(repo.work, "config", "--get-all", "remote.orion-upstream.pushurl"),
    fetchOnlyPushUrl,
  );
  assert.equal(errors(), "");
  const canonicalMain = git(repo.canonicalBare, "rev-parse", "main");
  assert.throws(() => git(repo.work, "push", "orion-upstream", "main"));
  assert.equal(git(repo.canonicalBare, "rev-parse", "main"), canonicalMain);
});

void test("a contributor working through a project fork remains valid", () => {
  const repo = fixture();
  repo.init();
  git(repo.work, "push", "--quiet", "-u", "origin", "main");
  // The fork is neither the foundation nor the canonical project repository.
  git(repo.base, "clone", "--quiet", "--bare", repo.productBare, repo.forkBare);
  const contributor = join(repo.base, "contributor");
  git(repo.base, "clone", "--quiet", repo.fork, contributor);
  assert.equal(
    git(contributor, "config", "--get", "remote.origin.url"),
    repo.fork,
  );
  assert.deepEqual(checkProvenance(contributor).errors, []);

  configureUpstream(contributor);
  git(contributor, "fetch", "--quiet", "orion-upstream");
  assert.deepEqual(checkProvenance(contributor).errors, []);
  git(contributor, "remote", "add", "project", repo.product);
  assert.deepEqual(checkProvenance(contributor).errors, []);

  git(contributor, "switch", "--quiet", "-c", "feature");
  git(
    contributor,
    "commit",
    "--quiet",
    "--allow-empty",
    "--message",
    "product work",
  );
  git(contributor, "push", "--quiet", "origin", "feature");
  assert.equal(
    git(repo.forkBare, "rev-parse", "feature"),
    git(contributor, "rev-parse", "HEAD"),
  );
});

void test("no local branch may track the foundation remote", () => {
  const repo = fixture();
  repo.init();
  git(repo.work, "push", "--quiet", "-u", "origin", "main");
  git(repo.work, "fetch", "--quiet", "orion-upstream");
  assert.deepEqual(checkProvenance(repo.work).errors, []);

  // Track the foundation from the checked-out branch and a non-current one.
  git(repo.work, "branch", "--quiet", "--set-upstream-to=orion-upstream/main");
  git(repo.work, "branch", "--quiet", "side", "orion-upstream/main");
  git(
    repo.work,
    "branch",
    "--quiet",
    "--set-upstream-to=orion-upstream/main",
    "side",
  );
  git(repo.work, "branch", "--quiet", "product", "main");
  git(
    repo.work,
    "branch",
    "--quiet",
    "--set-upstream-to=origin/main",
    "product",
  );
  const [error, ...others] = checkProvenance(repo.work).errors;
  assert.deepEqual(others, []);
  assert.match(
    error,
    /^Local branch\(es\) main, side track orion-upstream, so git pull could merge foundation changes outside a reviewed upgrade; run pnpm orion:upstream/,
  );

  configureUpstream(repo.work);
  assert.deepEqual(checkProvenance(repo.work).errors, []);
  for (const branch of ["main", "side"])
    assert.throws(() =>
      git(repo.work, "config", "--get", `branch.${branch}.remote`),
    );
  // Tracking of other remotes is untouched, and repair is idempotent.
  assert.equal(
    git(repo.work, "config", "--get", "branch.product.remote"),
    "origin",
  );
  configureUpstream(repo.work);
  assert.deepEqual(checkProvenance(repo.work).errors, []);
});

void test("explicit ports stay part of repository identity through initialization and remote checks", () => {
  const repo = fixture();
  const withPort = (url: string, port: string) =>
    url.replace("https://example.test/", `https://example.test:${port}/`);
  const productPath = repo.product
    .replace(/^git@example\.test:/, "")
    .replace(/\.git$/, "");
  const productWithPort = `https://example.test:8443/${productPath}`;
  assert.equal(
    repo.init({ apply: false, repository: `${productWithPort}.git` }).manifest
      .repository.url,
    productWithPort,
  );
  // The foundation's host on another port is a different endpoint, not the
  // foundation itself, while the explicit default port is the same endpoint.
  assert.equal(
    repo.init({ apply: false, repository: withPort(repo.canonical, "8443") })
      .manifest.repository.url,
    withPort(repo.canonical, "8443"),
  );
  refusal(
    () =>
      repo.init({ apply: false, repository: withPort(repo.canonical, "443") }),
    /must be the new project's repository/,
  );
  refusal(
    () =>
      repo.init({
        apply: false,
        repository: "ssh://git@example.test:2222/acme/ledger.git",
      }),
    /SSH port 2222/,
  );

  repo.init();
  const errors = () => checkProvenance(repo.work).errors.join("\n");
  git(
    repo.work,
    "remote",
    "set-url",
    "origin",
    withPort(repo.canonical, "8443"),
  );
  assert.equal(errors(), "");
  git(
    repo.work,
    "remote",
    "set-url",
    "origin",
    withPort(repo.canonical, "443"),
  );
  assert.match(errors(), /origin identifies the Orion foundation repository/);
  git(repo.work, "remote", "set-url", "origin", repo.product);
  git(
    repo.work,
    "remote",
    "set-url",
    "orion-upstream",
    withPort(repo.canonical, "8443"),
  );
  assert.match(
    errors(),
    /orion-upstream fetches .*:8443.*, not the recorded foundation/,
  );
  refusal(() => configureUpstream(repo.work), /not the recorded foundation/);
  git(
    repo.work,
    "remote",
    "set-url",
    "orion-upstream",
    withPort(repo.canonical, "443"),
  );
  assert.equal(errors(), "");
});

void test("the Approval Request disposition stays coherent with source and releases", () => {
  const repo = fixture();
  repo.init();
  const manifest = readManifest(repo.work) as ProjectManifest;
  const withDisposition = (approvalRequest: string) =>
    write(
      repo.work,
      ".orion/project.json",
      `${JSON.stringify({ ...manifest, referenceImplementations: { approvalRequest } }, null, 2)}\n`,
    );
  write(
    repo.work,
    "apps/api/prisma/release-history.json",
    JSON.stringify({
      schemaVersion: 1,
      recordedDurableReleases: [{ id: "r1" }],
    }),
  );
  assert.match(
    checkProvenance(repo.work).errors.join("\n"),
    /reference implementation is undecided/,
  );
  withDisposition("adopted");
  assert.deepEqual(checkProvenance(repo.work).errors, []);
  withDisposition("removed");
  assert.match(
    checkProvenance(repo.work).errors.join("\n"),
    /recorded as removed/,
  );
  rmSync(join(repo.work, "apps/api/src/features/approval-requests"), {
    recursive: true,
  });
  assert.deepEqual(checkProvenance(repo.work).errors, []);
  withDisposition("reference");
  assert.match(checkProvenance(repo.work).errors.join("\n"), /is absent/);
  withDisposition("unknown");
  assert.match(checkProvenance(repo.work).errors.join("\n"), /must be one of/);
});
