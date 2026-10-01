import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "orion-sdk-"));
try {
  const output = join(temporary, "api-types.ts");
  execFileSync(
    process.execPath,
    [
      resolve(root, "node_modules/openapi-typescript/bin/cli.js"),
      resolve(root, "../../docs/generated/api/openapi.json"),
      "-o",
      output,
    ],
    { stdio: "pipe" },
  );
  const committed = readFileSync(
    resolve(root, "src/generated/api-types.ts"),
    "utf8",
  );
  const normalizeLineEndings = (value) => value.replace(/\r\n?/g, "\n");
  if (
    normalizeLineEndings(readFileSync(output, "utf8")) !==
    normalizeLineEndings(committed)
  )
    throw new Error(
      "Generated SDK types are stale. Run pnpm -C packages/sdk generate.",
    );
  process.stdout.write("Generated SDK types match OpenAPI.\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
