import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  rm,
  rmdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { markdownFiles } from "./docs-files.ts";

void test("checks tracked and new public Markdown while preserving ignored private notes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ia-mns-docs-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    await writeFile(path.join(root, "tracked.md"), "# Tracked\n");
    await writeFile(path.join(root, "deleted.md"), "# Deleted\n");
    execFileSync(
      "git",
      ["-c", "core.autocrlf=false", "add", "tracked.md", "deleted.md"],
      { cwd: root },
    );
    // A newly ignored tracked file must still be validated.
    await writeFile(path.join(root, ".gitignore"), "private.md\ntracked.md\n");
    await writeFile(path.join(root, "private.md"), "Local private notes\n");
    await writeFile(path.join(root, "new.md"), "# New public document\n");
    await rm(path.join(root, "deleted.md"));
    assert.deepEqual(
      (await markdownFiles(root)).map((file) => path.basename(file)).sort(),
      ["new.md", "tracked.md"],
    );
  } finally {
    assert.ok(root.startsWith(`${path.resolve(tmpdir())}${path.sep}`));
    assert.ok(path.basename(root).startsWith("ia-mns-docs-"));
    await rm(root, { recursive: true, force: true });
  }
});

void test("rejects tracked documents below a redirected directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ia-mns-docs-"));
  const external = await mkdtemp(path.join(tmpdir(), "ia-mns-docs-target-"));
  const directory = path.join(root, "docs");
  let linked = false;
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    await mkdir(directory);
    await writeFile(path.join(directory, "guide.md"), "# Original\n");
    execFileSync("git", ["-c", "core.autocrlf=false", "add", "docs/guide.md"], {
      cwd: root,
    });
    await rm(path.join(directory, "guide.md"));
    await rmdir(directory);
    await writeFile(
      path.join(external, "guide.md"),
      "# External private fixture\n",
    );
    await symlink(
      external,
      directory,
      process.platform === "win32" ? "junction" : "dir",
    );
    linked = true;
    await assert.rejects(
      markdownFiles(root),
      /Symlink is not a documentation input/,
    );
  } finally {
    // Remove only the redirect itself before recursively deleting either fixture.
    if (linked) await unlink(directory);
    for (const fixture of [root, external]) {
      assert.ok(fixture.startsWith(`${path.resolve(tmpdir())}${path.sep}`));
      assert.ok(path.basename(fixture).startsWith("ia-mns-docs-"));
      await rm(fixture, { recursive: true, force: true });
    }
  }
});
