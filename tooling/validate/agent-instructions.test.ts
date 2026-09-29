import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import test from "node:test";
import {
  checkAgentInstructions,
  instructionChainLimitBytes,
} from "./agent-instructions.ts";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "orion-agent-check-"));
  const write = (path: string, content: string) => {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), content);
  };
  execFileSync("git", ["init", "-q"], { cwd: root });
  write("AGENTS.md", "# Instructions\n");
  write("apps/api/AGENTS.md", "# API\n");
  write(
    ".gemini/settings.json",
    JSON.stringify({ context: { fileName: ["AGENTS.md"] } }),
  );
  return {
    root,
    write,
    cleanup() {
      if (!root.startsWith(`${resolve(tmpdir())}${sep}`))
        throw new Error("Test directory escaped the temporary root");
      rmSync(root, { recursive: true, force: true });
    },
  };
}

void test("the repository keeps AGENTS.md as its only instruction source", () => {
  const result = checkAgentInstructions(process.cwd());
  assert.deepEqual(result.errors, []);
  assert.ok(result.instructionFiles.includes("AGENTS.md"));
});

void test("a minimal AGENTS.md hierarchy with the Gemini adapter passes", (t) => {
  const repo = fixture();
  t.after(() => repo.cleanup());
  const result = checkAgentInstructions(repo.root);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.instructionFiles, [
    "AGENTS.md",
    "apps/api/AGENTS.md",
  ]);
});

void test("vendor-specific instruction copies are rejected", (t) => {
  const repo = fixture();
  t.after(() => repo.cleanup());
  for (const name of [
    "CLAUDE.md",
    "apps/api/CLAUDE.md",
    ".claude/rules/api.md",
    "GEMINI.md",
    "docs/AGENTS.override.md",
    ".github/copilot-instructions.md",
    ".cursor/rules/style.mdc",
  ])
    repo.write(name, "@AGENTS.md\n");
  const { errors } = checkAgentInstructions(repo.root);
  assert.equal(errors.length, 7);
  assert.ok(errors.every((error) => /competing agent instruction/.test(error)));
});

void test("the Gemini adapter must exist and only configure discovery", (t) => {
  const repo = fixture();
  t.after(() => repo.cleanup());
  repo.write(
    ".gemini/settings.json",
    JSON.stringify({
      context: { fileName: ["AGENTS.md", "GEMINI.md"] },
      model: { name: "example" },
    }),
  );
  assert.match(
    checkAgentInstructions(repo.root).errors.join("\n"),
    /must only set context\.fileName/,
  );
  rmSync(resolve(repo.root, ".gemini"), { recursive: true });
  assert.match(
    checkAgentInstructions(repo.root).errors.join("\n"),
    /missing Gemini CLI AGENTS\.md adapter/,
  );
});

void test("root-to-leaf instruction chains stay within the portable size limit", (t) => {
  const repo = fixture();
  t.after(() => repo.cleanup());
  repo.write(
    "AGENTS.md",
    `# Root\n${"r".repeat(instructionChainLimitBytes / 2)}\n`,
  );
  repo.write(
    "apps/api/AGENTS.md",
    `# API\n${"a".repeat(instructionChainLimitBytes / 2)}\n`,
  );
  repo.write("apps/web/AGENTS.md", "# Web\n");
  const { errors } = checkAgentInstructions(repo.root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^apps\/api\/AGENTS\.md: instructions from the root/);
});
