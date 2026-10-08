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

// The production runtime example (ADR-0031) may name only real, non-development
// settings, set or commented, and must not hold a value that looks real: its
// values are placeholders, safe defaults or names of files in the container.
const productionExample = path.join(
  root,
  "infra/production/examples/runtime.env.example",
);
const known = new Map<string, (typeof configReference)[number]>(
  configReference.map((item) => [item.name, item] as const),
);
const imageOwned = new Set([
  "ORION_RELEASE_ID",
  "ORION_WEB_ROOT",
  "ORION_API_HOST",
  "ORION_API_PORT",
  "SANKHYA_ORACLE_CLIENT_LIB_DIR",
]);
const problems: string[] = [];
for (const line of (await readFile(productionExample, "utf8")).split(/\r?\n/)) {
  const match = /^#?\s?([A-Z][A-Z0-9_]+)=(.*)$/.exec(line);
  if (!match) continue;
  const [, name, value] = match as unknown as [string, string, string];
  const item = known.get(name);
  if (!item) problems.push(`${name} is not an API setting`);
  else if (item.role === "development")
    problems.push(`${name} is a development setting`);
  else if (imageOwned.has(name))
    problems.push(`${name} is set by the production image`);
  else if (
    item.secret &&
    value &&
    !/^(CHANGE_ME|postgresql:\/\/[a-z_]+:__GENERATE_[A-Z_]+__@postgres:5432\/ia_mns|__GENERATE_[A-Z_]+__)$/.test(
      value,
    )
  )
    problems.push(`${name} must hold a placeholder, never a value`);
}
if (problems.length)
  throw new Error(
    `infra/production/examples/runtime.env.example: ${problems.join("; ")}`,
  );
console.log(
  "The production runtime example names only API settings, with placeholders for secrets.",
);
