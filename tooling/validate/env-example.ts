import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  configReference,
  parseServerConfig,
} from "../../apps/api/src/config.ts";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const examplePath = path.join(root, ".env.example");
const environment = "ORION_ENV=development";

// Grouped by why each setting is an environment variable (ConfigRole).
const groups = [
  {
    role: "bootstrap",
    title:
      "# Infrastructure and bootstrap: needed before or independently of the application's own storage; change by deployment and restart.",
  },
  {
    role: "secret",
    title:
      "# Secrets: credentials and keys; never shown or edited in administration.",
  },
  {
    role: "parameter",
    title:
      "# Installation defaults of operational parameters: owners override them in administration (Parâmetros) without a restart.",
  },
  {
    role: "development",
    title: "# Local development and testing only; refused in production.",
  },
] as const;
const covered = new Set<string>(groups.map(({ role }) => role));
for (const { name, role } of configReference)
  if (!covered.has(role))
    throw new Error(`${name} has an unknown configuration role ${role}`);

const lines = [
  "# Local API development example. Copy to .env.local; never commit real values.",
  "# The keys and safe defaults below are checked against apps/api/src/config.ts.",
  "# See docs/setup.md and docs/generated/configuration/api.md.",
  environment,
  ...groups.flatMap(({ role, title }) => [
    "",
    title,
    ...configReference
      .filter((item) => item.role === role && item.name !== "ORION_ENV")
      .map(({ name, default: safeDefault, purpose }) =>
        safeDefault
          ? `# ${name}=${safeDefault}  # ${purpose}`
          : `# ${name}: ${purpose}`,
      ),
  ]),
  "",
];

parseServerConfig({ ORION_ENV: "development" });
const expected = lines.join("\n");
const actual = (await readFile(examplePath, "utf8")).replaceAll("\r\n", "\n");
if (process.argv.includes("--print")) process.stdout.write(expected);
else if (actual !== expected) {
  throw new Error(
    ".env.example differs from the API configuration schema/reference; update the example and rerun pnpm env:example:check.",
  );
} else
  console.log(
    ".env.example matches the API configuration reference and parses safely.",
  );
