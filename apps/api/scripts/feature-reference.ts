import type { DataScope } from "../src/access.js";
import { salesCatalog } from "../src/features/sales/analysis.js";
import {
  comparisonQuery,
  validateQuery,
  type SalesQuery,
} from "../src/features/sales/domain.js";
import {
  salesPermissions,
  sankhyaRestriction,
  vrmasterRestriction,
} from "../src/features/sales/access.js";
import { aggregateSql, queryBindings } from "../src/features/sales/query.js";
import {
  vrmasterAggregateSql,
  vrmasterParameters,
} from "../src/features/sales/vrmaster-query.js";
import {
  salesSources,
  sourceCatalog,
  type SalesSource,
} from "../src/features/sales/sources.js";
import { vrmasterCatalog } from "../src/features/products/vrmaster/catalog.js";
import { sankhyaCatalog } from "../src/features/products/sankhya/catalog.js";
import { productStatements as postgresProducts } from "../src/features/products/postgres.js";
import { productStatements as oracleProducts } from "../src/features/products/sankhya/oracle.js";
import type { ProductSelection } from "../src/features/products/selection.js";

const fence = (language: string, content: string) =>
  `\n\`\`\`${language}\n${content.trim()}\n\`\`\`\n`;
const json = (value: unknown) => fence("json", JSON.stringify(value, null, 2));
const cell = (value: string) =>
  value.replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");
const generated =
  "<!-- Generated offline by apps/api/scripts/feature-reference.ts from production query compilers and catalogs. Run pnpm -C apps/api references:write; do not edit. -->";
const directory = "docs/generated/features";

export const exampleSalesQuery: SalesQuery = {
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  productSearch: null,
  metric: "net_value",
  groupBy: "total",
  comparison: "none",
};

export function salesStatement(source: SalesSource, query: SalesQuery): string {
  validateQuery(query, "2026-12-31");
  return source === "sankhya"
    ? aggregateSql(query)
    : vrmasterAggregateSql(query);
}

/** Static publication only: no environment loading, connections, model calls or ERP values. */
export function featureReferences(): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  const add = (name: string, content: string) =>
    files.push({ path: `${directory}/${name}`, content });
  for (const source of salesSources) {
    const semantics = sourceCatalog[source];
    const catalog = source === "sankhya" ? sankhyaCatalog : vrmasterCatalog;
    const permission = salesPermissions[source];
    const bindings = (query: SalesQuery) =>
      source === "sankhya" ? queryBindings(query) : vrmasterParameters(query);
    const prefix = `${source}/sales`;
    const variants: string[] = [];
    for (const metric of semantics.measures) {
      for (const groupBy of salesCatalog.groupings) {
        const query = { ...exampleSalesQuery, metric, groupBy };
        const name = `sales-${metric}-${groupBy}`;
        const sql = salesStatement(source, query).trim();
        variants.push(
          `| \`${metric}\` | \`${groupBy}\` | [View SQL](${name}.md) |`,
        );
        add(`${source}/${name}.sql`, `${sql};\n`);
        add(
          `${source}/${name}.md`,
          [
            `# ${semantics.label}: ${metric} / ${groupBy}`,
            "",
            generated,
            "",
            "[Sales and all filters](sales.md) · [Feature catalog](../../../features/README.md)",
            "",
            "This is the complete SQL emitted by the production compiler for the plan below, without a semantic product selection or a permission restriction. The portal offers a local SQL download and copy action. Bind the parameters before running it in your database client; the portal only reads static documentation.",
            "",
            "## Example plan",
            json(query),
            "## Bound parameters",
            source === "sankhya"
              ? "Named Oracle binds:"
              : "PostgreSQL positional binds, starting at `$1`:",
            json(bindings(query)),
            "## Complete SQL",
            fence("sql", sql),
            "## Diagnose a difference",
            "",
            "Match the source, dates, measure, grouping, product selection and effective permission scope before comparing figures. A comparison runs this same SQL again with the comparison dates. The SQL above deliberately shows the unrestricted reference; the filters page documents the extra predicates a restricted request receives.",
            "",
          ].join("\n"),
        );
      }
    }
    const restricted: string[] = [];
    for (const dimension of permission.restrictions) {
      const scope: DataScope = {
        kind: "restricted",
        rules: [
          [
            {
              dimension: dimension.id,
              values: [{ value: "1", label: "Synthetic example" }],
            },
          ],
        ],
      };
      const compiled =
        source === "sankhya"
          ? sankhyaRestriction(scope)!
          : vrmasterRestriction(scope, 4)!;
      restricted.push(
        `### ${dimension.code}: ${dimension.title}`,
        "",
        dimension.description,
        "",
        `Hierarchy descendants: ${dimension.hierarchical ? "included" : "not applicable"}.`,
        fence("sql", compiled.sql),
        json("binds" in compiled ? compiled.binds : compiled.values),
      );
    }
    const literal = { ...exampleSalesQuery, productSearch: "arroz" };
    add(
      `${prefix}.md`,
      [
        `# ${semantics.label}: sales`,
        "",
        generated,
        "",
        "[Feature catalog](../../../features/README.md) · [Product filters](products.md) · [Sales behavior](../../../domains/sales-chat.md)",
        "",
        "## What it does",
        "",
        semantics.basis,
        "",
        semantics.quantityNote,
        ...(semantics.weightNote
          ? ["", semantics.weightNote, "", semantics.missingWeightNote!]
          : []),
        "",
        `Permission: \`${permission.code}\` (\`${permission.permission}\`). Availability depends on the configured Runtime reader and the person's effective permission.`,
        "",
        "## Request options",
        "",
        "| Option | Accepted values / behavior |",
        "| --- | --- |",
        "| Source | Explicit selector: Sankhya, VR Master or Tudo. Tudo keeps separate results; it does not merge ERP rows or product IDs. |",
        "| Dates | Inclusive startDate/endDate; valid dates from 2000-01-01, at most 366 days, no future dates (America/Sao_Paulo). SQL uses an exclusive next-day upper bound. |",
        "| Relative periods | Current or previous day/month/year; last N days or completed months (includeCurrent controls the current block); calendar month with optional year; calendar year; explicit range. Started periods are clamped to today. |",
        `| Measure | ${semantics.measures.map((value) => `\`${value}\` (${semantics.measureLabels[value]})`).join("; ")}. |`,
        `| Grouping | ${salesCatalog.groupings.map((value) => `\`${value}\``).join(", ")}. Quantities always retain their unit/packaging partition. |`,
        `| Comparison | ${salesCatalog.comparisons.map((value) => `\`${value}\``).join(", ")}. previous_period means the preceding equal number of days; previous_year clamps leap day. |`,
        "| Literal product | productSearch = null for all products, or a trimmed phrase of 2–80 characters. Whole words, case/accent insensitive; regex metacharacters are escaped. This is not a product ID or arbitrary SQL filter. |",
        "| Semantic products | Resolve or reuse a verified selection from the same ERP; AND between criteria, include/exclude, hierarchy descendants. Requires the source's product permission too. See Product filters. |",
        "| Multiple measures | The analytical tool accepts 1–3 distinct supported measures, sharing dates, grouping, product selection and comparison. It uses the same SQL compilers. |",
        "",
        "Default measure: net_value; grouping: total; comparison: none. The period must be supplied or clarified. A completed analysis is limited to 500 aggregate rows; the SQL fetches 501 to detect overflow. The matching-product preview fetches 101 to detect a list above 100; it never limits the semantic membership used for totals.",
        "",
        "## Complete SQL by measure and grouping",
        "",
        "Open a combination to inspect, copy or download its complete SQL and parameter example. Fixed joins, DISTINCT and business exclusions remain visible in every statement.",
        "",
        "| Measure | Grouping | Statement |",
        "| --- | --- | --- |",
        ...variants,
        "",
        "## Literal product bindings",
        "",
        "Synthetic phrase example. The compiler supplies both the normalized phrase and its escaped whole-word pattern; use these values together rather than writing your own regex.",
        json(bindings(literal)),
        "## Comparison bindings",
        "",
        "The reader runs the same compiled statement for the current interval and, when requested, the interval below. Product membership and access restrictions apply to both.",
        ...salesCatalog.comparisons
          .filter((value) => value !== "none")
          .flatMap((comparison) => [
            `### ${comparison}`,
            json(
              bindings(comparisonQuery({ ...exampleSalesQuery, comparison })!),
            ),
          ]),
        "## Effective access restrictions",
        "",
        "These are owner-assigned permission conditions, not additional freely selectable chat filters. Conditions within one rule are ANDed; alternative grant rules are ORed. An unrestricted grant admits every row. The examples below use fictional ID 1 and show isolated predicates; the runtime injects them into the reference before aggregation and binds their values. Sankhya applies the same predicate to eligible lot controls and final sales; VR Master applies it in base. The final VR Master parameter offset follows any semantic product binds, so it can be greater than 4.",
        "",
        "Sankhya result-center selection additionally depends on [PH-36](../../../project/human-actions.md#ph-36). Read [access semantics](../../../domains/sales-chat.md#access-and-restrictions) before interpreting a restricted total.",
        "",
        ...restricted,
        "## Semantic product membership",
        "",
        "The product resolver compiles a complete key subquery from the enabled catalog filters. Sales adds PRO.CODPROD IN (subquery) in both Sankhya selections, or produto.id IN (subquery) in VR Master's base. This selects all eligible products, not only the visible preview. It uses current registration membership for both time periods. It cannot reconstruct historical buyer or category responsibility. Literal product search and a semantic selection cannot be combined in one read.",
        "",
        "## Canonical implementation",
        "",
        source === "sankhya"
          ? "[SQL compiler](../../../../apps/api/src/features/sales/query.ts)"
          : "[SQL compiler](../../../../apps/api/src/features/sales/vrmaster-query.ts)",
        "",
      ].join("\n"),
    );

    const description = catalog.dimensions.find(
      (dimension) =>
        dimension.kind === "text" && dimension.exposure === "enabled",
    )!;
    const selection: ProductSelection = {
      criteria: [
        {
          kind: "text",
          dimension: description.id,
          mode: "include",
          text: "arroz",
          phrase: "arroz",
        },
      ],
    };
    const statements =
      source === "sankhya"
        ? oracleProducts(catalog, selection, 30)
        : postgresProducts(catalog, selection, 30);
    add(
      `${source}/products.md`,
      [
        `# ${semantics.label}: product lookup and filters`,
        "",
        generated,
        "",
        "[Feature catalog](../../../features/README.md) · [Sales](sales.md) · [Semantic resolution](../../../architecture/semantic-product-resolution.md)",
        "",
        "## What it does",
        "",
        "Finds unique registered products through verified catalog relationships, explains the interpretation and returns a bounded preview plus a complete count. The same selection can constrain sales from this ERP. It does not query stock, prices, costs or margins. Choosing Tudo asks for one ERP for product resolution; catalogs and identifiers stay separate.",
        "",
        `Catalog version: \`${catalog.version}\`. Metadata verified on ${catalog.discovery.verifiedOn}; these are reviewed catalog facts, not a live database availability check.`,
        "",
        "## All catalog filters",
        "",
        "Only enabled dimensions can execute. Each criterion supports include/exclude; criteria combine with AND, values within a criterion with OR. Hierarchies include descendants; ambiguous names require a choice. Values are discovered at request time rather than copied into documentation. Pending or unavailable dimensions below are visible for diagnosis and cannot be activated by wording a prompt differently.",
        "",
        "| ID | Name | Kind | Status | Meaning | Interpretation / blocker |",
        "| --- | --- | --- | --- | --- | --- |",
        ...catalog.dimensions.map(
          (dimension) =>
            `| \`${dimension.id}\` | ${cell(dimension.title)} | ${dimension.kind} | ${dimension.exposure} | ${cell(dimension.description)} | ${cell(dimension.interpretation)}${dimension.blocker ? ` Blocker: ${cell(dimension.blocker)}` : ""} |`,
        ),
        "",
        "## Value options",
        "",
        "Entity and hierarchy choices come from the selected ERP at request time. The static dictionary domains and flag encodings below come from the reviewed catalog. Up to eight resolved criteria can be combined. A description criterion is a literal phrase; it is not free-form SQL or a regular expression supplied by the caller.",
        "",
        "| Filter | Value options |",
        "| --- | --- |",
        ...catalog.dimensions.map(
          (dimension) =>
            `| \`${dimension.id}\` | ${cell(dimension.domain ? dimension.domain.map((option) => `${option.value}: ${option.label}`).join("; ") : dimension.kind === "flag" ? `include/exclude; stored true value = ${String(dimension.trueValue ?? true)}` : dimension.kind === "text" ? "Literal description phrase" : "Resolved ERP records/nodes; ambiguous values require clarification")} |`,
        ),
        "",
        "## Filter SQL mappings",
        "",
        "These are the reviewed paths used by the adapters. The model supplies a typed selection; the adapter chooses identifiers and binds values. The paths below are catalog relationship IDs, in traversal order; root attributes need no join. Oracle's logical erp schema resolves through the Runtime reader's private synonyms.",
        "",
        "| Entity | Table | Key | Label |",
        "| --- | --- | --- | --- |",
        ...catalog.entities.map(
          (entity) =>
            `| \`${entity.id}\` | \`${entity.table.schema}.${entity.table.name}\` | ${entity.key.join(", ")} | ${entity.label ?? "none"} |`,
        ),
        "",
        "| Filter | Path | Entity / columns |",
        "| --- | --- | --- |",
        ...catalog.dimensions.map(
          (dimension) =>
            `| \`${dimension.id}\` | ${dimension.path.map((id) => `\`${id}\``).join(" → ") || "root"} | ${cell([dimension.entity ?? catalog.root, ...dimension.columns].join(" / "))} |`,
        ),
        "",
        "| Relationship | Join | Status | Meaning |",
        "| --- | --- | --- | --- |",
        ...catalog.relationships.map(
          (relationship) =>
            `| \`${relationship.id}\` | ${cell(relationship.join.map((pair) => `${relationship.from}.${pair.from} = ${relationship.to}.${pair.to}`).join(" AND "))} | ${relationship.status} | ${cell(relationship.meaning)} |`,
        ),
        "",
        "## Example lookup SQL",
        "",
        "Synthetic description-only selection; 30 visible products. The count covers the complete membership. Other criteria change the bound predicates through the catalog paths above; there is no single fixed SQL statement containing all possible filter combinations.",
        json(selection),
        "### Count",
        fence("sql", statements.count),
        "### Preview",
        fence("sql", statements.list),
        "### Bound parameters",
        json("binds" in statements ? statements.binds : statements.values),
        "## Canonical implementation",
        "",
        source === "sankhya"
          ? "[Catalog](../../../../apps/api/src/features/products/sankhya/catalog.ts) · [SQL compiler](../../../../apps/api/src/features/products/sankhya/oracle.ts) · [Sankhya semantics](../../../domains/sankhya-product-lookup.md)"
          : "[Catalog](../../../../apps/api/src/features/products/vrmaster/catalog.ts) · [SQL compiler](../../../../apps/api/src/features/products/postgres.ts) · [VR Master semantics](../../../domains/product-lookup.md)",
        "",
      ].join("\n"),
    );
  }
  return files;
}
