// Run inside the built runtime image, with this file supplied on stdin.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

assert.notEqual(
  process.getuid(),
  0,
  "The runtime must use an unprivileged user.",
);
for (const path of ["/app/AGENTS.md", "/app/README.md", "/app/docs"])
  assert.equal(existsSync(path), false, `Internal guidance shipped: ${path}`);

const manifest = JSON.parse(readFileSync("/app/web/ia-mns-web.json", "utf8"));
assert.deepEqual(manifest, { schemaVersion: 1, documentation: false });
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) inspect(path);
    else if (/\.(js|css|json|md)$/.test(entry.name)) {
      const content = readFileSync(path, "utf8");
      for (const marker of [".docs-workspace", "Web Component Reference"])
        assert.equal(
          content.includes(marker),
          false,
          `Internal portal shipped: ${path}`,
        );
    }
  }
}
inspect("/app/web");

const runtimeRequire = createRequire("/app/package.json");
const oracle = runtimeRequire("oracledb");
oracle.initOracleClient({ libDir: process.env.SANKHYA_ORACLE_CLIENT_LIB_DIR });
assert.equal(oracle.thin, false);
process.stdout.write(
  "Runtime image verified: non-root, Oracle Thick mode, product-only web and no application engineering guidance.\n",
);
