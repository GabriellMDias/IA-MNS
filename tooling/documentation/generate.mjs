import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocumentation } from "./build.mjs";
import { readSources, synchronizeOutputs } from "./files.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const mode = process.argv[2];
if (mode !== "--write" && mode !== "--check")
  throw new Error("Use --write or --check.");
const outputs = await buildDocumentation(await readSources(root));
await synchronizeOutputs(root, outputs, mode);
const manifest = JSON.parse(
  outputs.get("apps/web/src/generated/manifest.json"),
);
process.stdout.write(
  `Living documentation ${mode === "--check" ? "current" : "written"}: ${manifest.entries.length} pages, ${manifest.search.shards.length} search shards.\n`,
);
