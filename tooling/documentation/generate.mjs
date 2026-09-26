import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const mode = process.argv[2];
if (mode !== "--write" && mode !== "--check")
  throw new Error("Use --write or --check.");
const read = (name) => readFile(path.join(root, name), "utf8");
const outputs = new Map();
const fail = (message) => {
  throw new Error(`Living documentation: ${message}`);
};

function markdownRows(source, heading) {
  const allLines = source.split("\n");
  const start = allLines.findIndex((line) => line.startsWith(heading));
  if (start < 0) fail(`missing ${heading} in generated reference`);
  const lines = allLines.slice(heading.startsWith("|") ? start : start + 1);
  const rows = [];
  let inTable = false;
  for (const line of lines) {
    if (line.startsWith("#") && inTable) break;
    if (!line.startsWith("|")) {
      if (inTable) break;
      continue;
    }
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());
    if (cells.every((cell) => /^[-: ]+$/.test(cell))) continue;
    inTable = true;
    rows.push(cells.map((cell) => cell.replaceAll("`", "")));
  }
  if (rows.length < 2) fail(`empty table after ${heading}`);
  const [headers, ...values] = rows;
  return values.map((cells) => {
    if (cells.length !== headers.length)
      fail(`malformed table after ${heading}`);
    return Object.fromEntries(
      headers.map((header, index) => [header, cells[index]]),
    );
  });
}

function schemaType(schema) {
  if (!schema) return "none";
  if (schema.anyOf) return schema.anyOf.map(schemaType).join(" | ");
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  const type =
    schema.type === "array"
      ? `array of ${schemaType(schema.items)}`
      : (schema.type ?? (schema.$ref ? schema.$ref : "unknown"));
  const details = [];
  if (schema.format) details.push(schema.format);
  if (schema.minLength !== undefined)
    details.push(`min length ${schema.minLength}`);
  if (schema.maxLength !== undefined)
    details.push(`max length ${schema.maxLength}`);
  if (schema.minimum !== undefined) details.push(`minimum ${schema.minimum}`);
  if (schema.maximum !== undefined) details.push(`maximum ${schema.maximum}`);
  if (schema.pattern) details.push(`pattern ${schema.pattern}`);
  return `${type}${details.length ? ` (${details.join(", ")})` : ""}`;
}

function fields(schema, prefix = "") {
  if (!schema?.properties) return [];
  return Object.entries(schema.properties).flatMap(([name, value]) => {
    const qualified = `${prefix}${name}`;
    const row = {
      name: qualified,
      type: schemaType(value),
      required: schema.required?.includes(name) ?? false,
    };
    return [
      row,
      ...fields(value, `${qualified}.`),
      ...fields(value.items, `${qualified}[].`),
    ];
  });
}

const openapiText = await read("docs/generated/api/openapi.json");
const openapi = JSON.parse(openapiText);
if (!openapi.openapi?.startsWith("3.1.")) fail("expected OpenAPI 3.1");
const operations = [];
for (const [route, methods] of Object.entries(openapi.paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    const success = Object.entries(operation.responses).filter(([status]) =>
      status.startsWith("2"),
    );
    if (!operation.operationId || success.length === 0)
      fail(`missing operationId or success response: ${method} ${route}`);
    const requestSchema =
      operation.requestBody?.content?.["application/json"]?.schema;
    operations.push({
      operationId: operation.operationId,
      method: method.toUpperCase(),
      path: route,
      tags: operation.tags ?? [],
      authentication: operation.security?.length
        ? "Bearer access token"
        : "None declared",
      parameters: (operation.parameters ?? []).map((parameter) => ({
        name: parameter.name,
        in: parameter.in,
        required: parameter.required ?? false,
        type: schemaType(parameter.schema),
      })),
      request: requestSchema ? { fields: fields(requestSchema) } : null,
      responses: Object.entries(operation.responses).map(
        ([status, response]) => ({
          status,
          fields: fields(response.content?.["application/json"]?.schema),
        }),
      ),
    });
  }
}
const ids = operations.map((operation) => operation.operationId);
if (new Set(ids).size !== ids.length) fail("duplicate API operationId");

const databaseText = await read("docs/generated/database/approval-requests.md");
const tableHeadings = [...databaseText.matchAll(/^## ([a-z][a-z0-9_]*)$/gm)]
  .map((match) => match[1])
  .filter((name) => name !== "database_enums");
const tables = tableHeadings.map((name) => {
  const section = databaseText.split(`## ${name}\n`)[1]?.split(/^## /m)[0];
  if (!section) fail(`missing database section ${name}`);
  const description = section
    .split("\n")
    .find((line) => line.trim() && !line.startsWith("<!--"));
  const ownerLine = section.match(/^Owner: (.+)\. Classification: (.+)\.$/m);
  const lifecycle = section.match(/^Lifecycle: (.+)$/m);
  if (!description || !ownerLine || !lifecycle)
    fail(`missing table metadata: ${name}`);
  return {
    name,
    description,
    owner: ownerLine[1],
    classification: ownerLine[2],
    lifecycle: lifecycle[1],
    columns: markdownRows(section, "| Column |"),
    constraints: markdownRows(section, "### Constraints and indexes"),
  };
});
if (tables.length === 0) fail("no application-owned database tables");
const enums = markdownRows(databaseText, "## Database enums");
const errorsText = await read("docs/generated/api/errors.md");
const errors = markdownRows(errorsText, "| Code |");

const componentText = await read("apps/web/src/components.docs.json");
const componentSource = await read("apps/web/src/components.tsx");
const portalSource = await read("apps/web/src/documentation.tsx");
const componentMetadata = JSON.parse(componentText);
const components = componentMetadata.components;
if (!Array.isArray(components) || components.length === 0)
  fail("component metadata is missing");
const actualExports = [
  ...componentSource.matchAll(/export function ([A-Z][A-Za-z0-9]*)\(/g),
].map((match) => match[1]);
if (
  actualExports.length !== components.length ||
  actualExports.some((name) => !components.some((item) => item.name === name))
)
  fail("every exported web component needs owned metadata");
const exampleIds = new Set();
for (const component of components) {
  if (
    !actualExports.includes(component.name) ||
    !component.summary ||
    !component.usage ||
    !component.accessibility ||
    !Array.isArray(component.props) ||
    !component.props.length ||
    !Array.isArray(component.states) ||
    !component.states.length ||
    !Array.isArray(component.examples) ||
    !component.examples.length
  )
    fail(`incomplete metadata for ${component.name}`);
  if (
    component.props.some((prop) => !prop.name || !prop.type || !prop.meaning) ||
    component.states.some((state) => typeof state !== "string" || !state.trim())
  )
    fail(`incomplete prop or state metadata for ${component.name}`);
  for (const example of component.examples) {
    if (
      !example.id ||
      !example.label ||
      !example.description ||
      exampleIds.has(example.id)
    )
      fail(`missing or duplicate example metadata for ${component.name}`);
    if (!portalSource.includes(`case "${example.id}":`))
      fail(`missing live example renderer for ${example.id}`);
    exampleIds.add(example.id);
  }
}

const componentMarkdown = [
  "# Web Component Reference",
  "",
  "<!-- Generated from apps/web/src/components.docs.json and verified against components.tsx. Do not edit. -->",
  "",
  "[Living documentation](../../architecture/living-documentation.md) · [Component source](../../../apps/web/src/components.tsx)",
  "",
  ...components.flatMap((component) => [
    `## ${component.name}`,
    "",
    component.summary,
    "",
    "### Props",
    "",
    "| Name | Type | Meaning |",
    "| --- | --- | --- |",
    ...component.props.map(
      (prop) =>
        `| \`${prop.name.replaceAll("|", "\\|")}\` | \`${prop.type.replaceAll("|", "\\|")}\` | ${prop.meaning.replaceAll("|", "\\|")} |`,
    ),
    "",
    "### States",
    "",
    ...component.states.map((state) => `- ${state}`),
    "",
    `Accessibility: ${component.accessibility}`,
    "",
    `Usage: ${component.usage}`,
    "",
    "### Examples",
    "",
    ...component.examples.map(
      (example) =>
        `- **${example.label}** (\`${example.id}\`): ${example.description}`,
    ),
    "",
  ]),
].join("\n");

const data = {
  api: {
    title: openapi.info.title,
    version: openapi.info.version,
    operations,
    errors,
  },
  database: { tables, enums },
  components,
};
outputs.set(
  "apps/web/src/generated/documentation.json",
  await prettier.format(JSON.stringify(data), { parser: "json" }),
);
outputs.set("docs/generated/components/web.md", componentMarkdown);

for (const [name, value] of [
  ...outputs,
  ["docs/generated/api/openapi.json", openapiText],
  ["docs/generated/api/errors.md", errorsText],
  ["docs/generated/database/approval-requests.md", databaseText],
]) {
  if (
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/[^\s/@]+:[^\s/@]+@/i.test(
      value,
    )
  )
    fail(`sensitive content detected in ${name}`);
}
for (const [name, value] of outputs) {
  if (mode === "--write") {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), value);
  } else {
    let existing;
    try {
      existing = await read(name);
    } catch {
      fail(`missing generated artifact ${name}`);
    }
    if (existing !== value)
      fail(`stale generated artifact ${name}; run pnpm docs:references:write`);
  }
}
process.stdout.write(
  `Living documentation ${mode === "--check" ? "current" : "written"}: ${operations.length} operations, ${tables.length} tables, ${components.length} components.\n`,
);
