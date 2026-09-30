import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import test from "node:test";
import { checkReleaseHistory } from "./release-history.ts";

const migration = "20260924000000_approval_requests";
const sqlPath = `apps/api/prisma/migrations/${migration}/migration.sql`;
const registryPath = "apps/api/prisma/release-history.json";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "orion-release-check-"));
  function write(path: string, content: string) {
    const target = resolve(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  function git(...args: string[]) {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  }
  function commit() {
    git("add", ".");
    git(
      "-c",
      "user.name=Orion Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-m",
      "fixture",
    );
    return git("rev-parse", "HEAD");
  }
  function cleanup() {
    if (!root.startsWith(`${resolve(tmpdir())}${sep}`))
      throw new Error("Test directory escaped the temporary root");
    rmSync(root, { recursive: true, force: true });
  }
  git("init", "-q", "-b", "main");
  write(sqlPath, "CREATE TABLE example (id integer);\n");
  write(
    registryPath,
    JSON.stringify({ schemaVersion: 1, recordedDurableReleases: [] }),
  );
  function cli(baseRef: string) {
    return execFileSync(
      process.execPath,
      [resolve(import.meta.dirname, "release-history.ts")],
      {
        cwd: root,
        env: { ...process.env, ORION_RELEASE_BASE_REF: baseRef },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  }
  function recordRelease(releaseCommit: string, id = "release-1") {
    return {
      id,
      environment: "durable-test",
      gitCommit: releaseCommit,
      migrations: [
        {
          directory: migration,
          sha256: createHash("sha256")
            .update(readFileSync(resolve(root, sqlPath), "utf8"))
            .digest("hex"),
        },
      ],
    };
  }
  return { root, write, git, commit, cli, recordRelease, cleanup };
}

void test("an empty registry records no release without constraining unreleased SQL", () => {
  const state = fixture();
  try {
    assert.equal(checkReleaseHistory(state.root), 0);
    state.write(sqlPath, "CREATE TABLE example (id bigint);\n");
    assert.equal(checkReleaseHistory(state.root), 0);
  } finally {
    state.cleanup();
  }
});

void test("GitHub's first-push zero SHA means no comparison commit even with inherited Git history", () => {
  const state = fixture();
  try {
    state.commit();
    state.write(sqlPath, "CREATE TABLE example (id bigint);\n");
    state.commit();
    const before = "0".repeat(40);
    assert.equal(checkReleaseHistory(state.root, before), 0);
    assert.match(state.cli(before), /valid: 0 recorded durable release/);
  } finally {
    state.cleanup();
  }
});

void test("missing and first-push comparison bases still require a real base for recorded releases", () => {
  const state = fixture();
  try {
    const releaseCommit = state.commit();
    state.write(
      registryPath,
      JSON.stringify({
        schemaVersion: 1,
        recordedDurableReleases: [state.recordRelease(releaseCommit)],
      }),
    );
    state.commit();
    for (const base of [undefined, "0".repeat(40)]) {
      assert.throws(
        () => checkReleaseHistory(state.root, base),
        /A Git base is required to verify append-only release history/,
      );
    }
    assert.throws(
      () => state.cli("0".repeat(40)),
      /A Git base is required to verify append-only release history/,
    );
  } finally {
    state.cleanup();
  }
});

void test("a first push still validates the current registry", () => {
  const state = fixture();
  try {
    state.write(registryPath, JSON.stringify({ schemaVersion: 2 }));
    assert.throws(
      () => checkReleaseHistory(state.root, "0".repeat(40)),
      /Invalid migration release registry/,
    );
  } finally {
    state.cleanup();
  }
});

void test("real comparison commits with an empty or absent registry remain valid", () => {
  const state = fixture();
  try {
    const emptyCommit = state.commit();
    assert.equal(checkReleaseHistory(state.root, emptyCommit), 0);
    assert.match(state.cli(emptyCommit), /valid: 0 recorded durable release/);
    state.git("rm", registryPath);
    const withoutRegistry = state.commit();
    state.write(
      registryPath,
      JSON.stringify({ schemaVersion: 1, recordedDurableReleases: [] }),
    );
    assert.equal(checkReleaseHistory(state.root, withoutRegistry), 0);
  } finally {
    state.cleanup();
  }
});

void test("comparison bases must be full SHAs of existing commits except for the exact first-push sentinel", () => {
  const state = fixture();
  try {
    const commit = state.commit();
    for (const base of [
      "HEAD",
      commit.slice(0, 7),
      "0".repeat(39),
      "0".repeat(41),
    ]) {
      assert.throws(
        () => checkReleaseHistory(state.root, base),
        /Release comparison base must be a full Git commit SHA/,
      );
    }
    const blob = state.git("rev-parse", `${commit}:${registryPath}`);
    for (const base of ["1".repeat(40), blob]) {
      assert.throws(
        () => checkReleaseHistory(state.root, base),
        /Command failed: git rev-parse --verify/,
      );
    }
  } finally {
    state.cleanup();
  }
});

void test("real comparison commits allow unchanged and appended releases but reject edits, removals, and reordering", () => {
  const state = fixture();
  try {
    const releaseCommit = state.commit();
    const first = state.recordRelease(releaseCommit);
    const second = state.recordRelease(releaseCommit, "release-2");
    const third = state.recordRelease(releaseCommit, "release-3");
    function writeReleases(releases: (typeof first)[]) {
      state.write(
        registryPath,
        JSON.stringify({ schemaVersion: 1, recordedDurableReleases: releases }),
      );
    }
    writeReleases([first, second]);
    const base = state.commit();
    assert.equal(checkReleaseHistory(state.root, base), 2);
    assert.match(state.cli(base), /valid: 2 recorded durable release/);
    writeReleases([first, second, third]);
    assert.equal(checkReleaseHistory(state.root, base), 3);
    for (const changed of [
      [first],
      [second, first],
      [{ ...first, environment: "changed" }, second],
    ]) {
      writeReleases(changed);
      assert.throws(
        () => checkReleaseHistory(state.root, base),
        /Recorded durable release history cannot be changed or removed/,
      );
      assert.throws(
        () => state.cli(base),
        /Recorded durable release history cannot be changed or removed/,
      );
    }
  } finally {
    state.cleanup();
  }
});

void test("released SQL stays byte-identical across edits while new unreleased SQL can evolve", () => {
  const state = fixture();
  try {
    const releaseCommit = state.commit();
    const sql = readFileSync(resolve(state.root, sqlPath), "utf8");
    const sha256 = createHash("sha256").update(sql).digest("hex");
    state.write(
      registryPath,
      JSON.stringify({
        schemaVersion: 1,
        recordedDurableReleases: [
          {
            id: "release-1",
            environment: "durable-test",
            gitCommit: releaseCommit,
            migrations: [{ directory: migration, sha256 }],
          },
        ],
      }),
    );
    assert.equal(checkReleaseHistory(state.root, releaseCommit), 1);
    state.write(sqlPath, sql.replaceAll("\n", "\r\n"));
    assert.equal(checkReleaseHistory(state.root, releaseCommit), 1);
    state.write(sqlPath, sql);
    state.write(
      "apps/api/prisma/migrations/20260925000000_new/migration.sql",
      "CREATE TABLE newer (id integer);\n",
    );
    assert.equal(checkReleaseHistory(state.root, releaseCommit), 1);
    state.write(sqlPath, "CREATE TABLE example (id bigint);\n");
    assert.throws(
      () => checkReleaseHistory(state.root, releaseCommit),
      /Released migration changed/,
    );
    state.write(sqlPath, sql);
    const registryCommit = state.commit();
    state.write(
      registryPath,
      JSON.stringify({ schemaVersion: 1, recordedDurableReleases: [] }),
    );
    assert.throws(
      () => checkReleaseHistory(state.root, registryCommit),
      /cannot be changed or removed/,
    );
  } finally {
    state.cleanup();
  }
});
