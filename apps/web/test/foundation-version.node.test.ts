import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readFoundationVersion } from "../scripts/foundation-version.js";

const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "orion-version-"));
  roots.push(root);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.name", "Version fixture");
  git("config", "user.email", "fixture@example.invalid");
  mkdirSync(join(root, ".orion"));
  writeFileSync(
    join(root, ".orion/project.json"),
    JSON.stringify({ kind: "foundation" }),
  );
  git("add", ".");
  git("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Foundation");
  return { root, git };
}

it("resolves annotated stable tags and distinguishes later or modified revisions", () => {
  const { root, git } = fixture();
  const commit = git("rev-parse", "HEAD");
  git("-c", "tag.gpgsign=false", "tag", "-a", "v1.2.3", "-m", "Release");
  expect(readFoundationVersion(root)).toEqual({ label: "v1.2.3", commit });
  writeFileSync(join(root, "new.txt"), "Unreleased work");
  expect(readFoundationVersion(root).label).toBe("v1.2.3 · unreleased");
  git("add", ".");
  git("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Next change");
  git("-c", "tag.gpgsign=false", "tag", "v1.3.0-rc.1");
  expect(readFoundationVersion(root).label).toBe("v1.2.3 · unreleased");
});

it("does not confuse a derived product tag with the recorded Orion baseline", () => {
  const { root, git } = fixture();
  const baseline = git("rev-parse", "HEAD");
  git("-c", "tag.gpgsign=false", "tag", "v99.0.0");
  writeFileSync(
    join(root, ".orion/project.json"),
    JSON.stringify({
      kind: "project",
      foundation: { baselineCommit: baseline },
    }),
  );
  expect(readFoundationVersion(root)).toEqual({
    label: `Baseline ${baseline.slice(0, 7)}`,
    commit: baseline,
  });
});

it("uses a commit for untagged foundations and an explicit fallback without history", () => {
  const { root, git } = fixture();
  const commit = git("rev-parse", "HEAD");
  expect(readFoundationVersion(root)).toEqual({
    label: `${commit.slice(0, 7)} · unreleased`,
    commit,
  });
  rmSync(join(root, ".git"), { recursive: true, force: true });
  expect(readFoundationVersion(root)).toEqual({
    label: "Version unavailable",
    commit: null,
  });
});
