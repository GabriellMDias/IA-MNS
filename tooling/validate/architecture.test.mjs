import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { cruise } from "dependency-cruiser";
import { ESLint } from "eslint";
import config from "../../.dependency-cruiser.mjs";

const repository = path.resolve(import.meta.dirname, "../..");

async function inspect(files) {
  const directory = await mkdtemp(path.join(tmpdir(), "orion-boundary-test-"));
  const original = process.cwd();
  try {
    for (const [name, content] of Object.entries(files)) {
      const destination = path.join(directory, name);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }
    process.chdir(directory);
    const report = await cruise(Object.keys(files), {
      ...config.options,
      tsConfig: { fileName: path.join(repository, "tsconfig.json") },
      ruleSet: config,
      validate: true,
      outputType: "json",
    });
    return JSON.parse(report.output);
  } finally {
    process.chdir(original);
    assert.ok(
      directory.startsWith(
        path.join(path.resolve(tmpdir()), "orion-boundary-test-"),
      ),
    );
    await rm(directory, { recursive: true, force: true });
  }
}

test("flat domain modules cannot import their transport or persistence adapters", async () => {
  for (const adapter of ["routes", "prisma-repository"]) {
    const result = await inspect({
      "apps/api/src/features/example/domain.ts": `import "./${adapter}.js";`,
      [`apps/api/src/features/example/${adapter}.ts`]: "export {};",
    });
    assert.ok(
      result.summary.violations.some(
        ({ rule }) => rule.name === "no-domain-to-infrastructure",
      ),
    );
  }
});

test("browser runtime and SDK reject Node builtins while build tooling can use them", async () => {
  const result = await inspect({
    "apps/web/src/unsafe.ts": 'import "node:fs";',
    "packages/sdk/src/unsafe.ts": 'import "node:crypto";',
    "apps/web/vite.config.ts": 'import "node:path";',
  });
  assert.equal(
    result.summary.violations.filter(
      ({ rule }) => rule.name === "no-client-node-builtins",
    ).length,
    2,
  );
  assert.ok(
    !result.summary.violations.some(({ from }) =>
      from.endsWith("vite.config.ts"),
    ),
  );
});

test("cycles and cross-application imports remain blocked; emitted chunks are excluded", async () => {
  const result = await inspect({
    "apps/web/src/a.ts": 'import "./b.js"; import "../../api/src/server.js";',
    "apps/web/src/b.ts": 'import "./a.js";',
    "apps/api/src/server.ts": "export {};",
    "apps/web/dist/a.js": 'import "./b.js";',
    "apps/web/dist/b.js": 'import "./a.js";',
  });
  const names = new Set(result.summary.violations.map(({ rule }) => rule.name));
  assert.ok(names.has("no-cross-application-imports"));
  assert.ok(names.has("no-circular-dependencies"));
  assert.ok(!result.modules.some(({ source }) => source.includes("/dist/")));
});

test("pure feature dependencies stay permitted", async () => {
  const result = await inspect({
    "apps/api/src/features/example/service.ts": 'import "./domain.js";',
    "apps/api/src/features/example/domain.ts": "export const status = 'draft';",
    "apps/web/src/helper.ts":
      "export const format = (value: string) => value.trim();",
  });
  assert.deepEqual(result.summary.violations, []);
});

test("browser and SDK imports reject server libraries at the source boundary", async () => {
  const eslint = new ESLint({ cwd: repository });
  for (const [file, source] of [
    ["apps/web/src/config.ts", 'import "pg";'],
    ["apps/web/src/config.ts", 'import "node:fs";'],
    ["packages/sdk/src/index.ts", 'import "@prisma/client";'],
  ]) {
    const reports = await eslint.lintText(source, {
      filePath: path.join(repository, file),
    });
    assert.ok(
      reports[0].messages.some(
        ({ ruleId }) => ruleId === "no-restricted-imports",
      ),
      `${file}: ${source}`,
    );
  }
});
