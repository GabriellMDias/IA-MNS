import {
  entityOf,
  loadCatalog,
  requiredColumns,
  type CatalogDimension,
  type SemanticCatalog,
} from "../catalog.js";
import { ProductFailure } from "../errors.js";
import type { HierarchyNode, ProductPage, RecordValue } from "../selection.js";
import type {
  CategoryCandidate,
  ProductSource,
  RecordMatch,
} from "../source.js";
import { productPhrase } from "../../sales/product-match.js";
import { searchForms, significantWords, wordPattern } from "../text.js";
import { sankhyaCatalog } from "./catalog.js";
import { discoverMetadata, type SankhyaMetadata } from "./metadata.js";
import {
  Parameters,
  compileSelection,
  productStatements,
  quote,
  regexp,
  tableOf,
  termsPredicate,
} from "./oracle.js";
import {
  createOracleProductReader,
  type OracleReader,
  type OracleRow,
  type OracleSession,
  type SankhyaConnection,
} from "./session.js";
import { sankhyaMetadata } from "./snapshot.js";
import { describeRequest } from "../answer.js";

export type GroupRow = { id: number; parent: number; label: string };
/** Preserve real ancestry ids so the shared resolver's prefix comparison still applies. */
export function groupTree(
  rows: readonly GroupRow[],
): Map<number, HierarchyNode> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (byId.size !== rows.length) throw new Error("Duplicate group key");
  const nodes = new Map<number, HierarchyNode>();
  for (const row of rows) {
    const ancestors: GroupRow[] = [];
    let current: GroupRow | undefined = row;
    const seen = new Set<number>();
    while (current) {
      if (seen.has(current.id) || ancestors.length >= 8)
        throw new Error("Cyclic or overdeep group hierarchy");
      seen.add(current.id);
      ancestors.unshift(current);
      if (current.parent <= 0) break;
      current = byId.get(current.parent);
      if (!current) throw new Error("Missing positive group parent");
    }
    nodes.set(row.id, {
      id: row.id,
      level: ancestors.length,
      codes: ancestors.map((item) => item.id),
      path: ancestors.map((item) => item.label),
      conventions: [],
    });
  }
  return nodes;
}

/** Only used metadata can disable a reviewed capability; additive unused fields remain discovery candidates. */
export function metadataProblems(
  catalog: SemanticCatalog,
  expected: SankhyaMetadata,
  actual: SankhyaMetadata,
): string[] {
  const problems: string[] = [];
  const required = requiredColumns(catalog);
  for (const entity of catalog.entities) {
    const usedColumns = required.get(
      `${entity.table.schema}.${entity.table.name}`,
    );
    if (!usedColumns) continue;
    const name = entity.table.name.toUpperCase();
    const baseline = expected.tables.find((item) => item.name === name);
    const live = actual.tables.find((item) => item.name === name);
    for (const column of usedColumns) {
      const found = live?.columns.find(
        (item) => item.name === column.name.toUpperCase(),
      );
      if (
        !found ||
        found.type !== column.type ||
        found.nullable !== column.nullable
      )
        problems.push(
          `${entity.id}.${column.name}: physical definition changed`,
        );
      const field = (table: typeof baseline) =>
        table?.fields.find((item) => item.name === column.name.toUpperCase());
      if (JSON.stringify(field(baseline)) !== JSON.stringify(field(live)))
        problems.push(
          `${entity.id}.${column.name}: dictionary definition changed`,
        );
    }
    const keys = (table: typeof baseline) =>
      table?.constraints.filter(
        (item) => item.kind === "P" || item.kind === "U",
      );
    if (JSON.stringify(keys(baseline)) !== JSON.stringify(keys(live)))
      problems.push(`${entity.id}: unique keys changed`);
    // Field properties can carry metadata interceptors and visibility/security rules.
    const properties = (table: typeof baseline) =>
      table?.properties.filter((item) =>
        usedColumns.some((column) => column.name.toUpperCase() === item.field),
      );
    if (
      JSON.stringify(properties(baseline)) !== JSON.stringify(properties(live))
    )
      problems.push(`${entity.id}: field properties changed`);
  }
  const usedPaths = new Set(
    catalog.dimensions
      .filter((item) => item.exposure === "enabled")
      .flatMap((item) => item.path),
  );
  for (const link of catalog.relationships.filter((item) =>
    usedPaths.has(item.id),
  )) {
    if (!link.dictionary) continue;
    const dictionary = link.dictionary;
    const matching = (metadata: SankhyaMetadata) =>
      metadata.links.find(
        (item) =>
          item.origin === dictionary.origin &&
          item.target === dictionary.target,
      );
    if (JSON.stringify(matching(expected)) !== JSON.stringify(matching(actual)))
      problems.push(`${link.id}: dictionary mapping changed`);
    const constraint = link.evidence.declared?.constraint;
    if (constraint) {
      const constraints = (metadata: SankhyaMetadata) =>
        metadata.tables.flatMap((item) =>
          item.constraints.filter((entry) => entry.name === constraint),
        );
      if (
        JSON.stringify(constraints(expected)) !==
        JSON.stringify(constraints(actual))
      )
        problems.push(`${link.id}: physical constraint changed`);
    }
  }
  for (const dimension of catalog.dimensions.filter((item) => item.domain)) {
    const values = actual.tables
      .find((item) => item.name === "TGFPRO")
      ?.options.filter(
        (item) => item.field === dimension.columns[0].toUpperCase(),
      )
      .map((item) => ({ value: item.value, label: item.label }));
    if (JSON.stringify(values) !== JSON.stringify(dimension.domain))
      problems.push(`${dimension.id}: dictionary domain changed`);
  }
  return problems;
}

const number = (row: OracleRow, name: string) => {
  const value = row[name];
  if (typeof value !== "number" || !Number.isSafeInteger(value))
    throw new Error("Unexpected integer response");
  return value;
};
const text = (row: OracleRow, name: string) => {
  const value = row[name];
  if (typeof value !== "string") throw new Error("Unexpected text response");
  return value.trim();
};
const matches = (label: string, words: readonly string[]) => {
  const actual = significantWords(productPhrase(label).toLowerCase());
  return words.every((word) =>
    searchForms(word).some((form) => actual.includes(form)),
  );
};

/** Prefer a complete dictionary label over a label containing additional qualifiers. */
export function matchingDomain(
  options: NonNullable<CatalogDimension["domain"]>,
  words: readonly string[] | null,
) {
  if (!words) return options;
  const exact = options.filter(
    (option) =>
      significantWords(productPhrase(option.label).toLowerCase()).join(" ") ===
      words.join(" "),
  );
  return exact.length
    ? exact
    : options.filter((option) => matches(option.label, words));
}

/** Sankhya physical registration adapter behind the existing ProductSource port. */
export function createOracleProductSource(
  catalogInput: SemanticCatalog,
  reader: OracleReader,
): ProductSource {
  const catalog = loadCatalog(catalogInput);
  let verifiedAt = 0;
  const read = <T>(
    signal: AbortSignal,
    operation: (session: OracleSession) => Promise<T>,
  ) =>
    reader.read(signal, async (session) => {
      if (Date.now() - verifiedAt > 10 * 60 * 1000) {
        try {
          const actual = await discoverMetadata(session);
          if (metadataProblems(catalog, sankhyaMetadata, actual).length)
            throw new Error("Reviewed Sankhya metadata changed");
          const required = requiredColumns(catalog);
          for (const entity of catalog.entities) {
            const columns = required.get(
              `${entity.table.schema}.${entity.table.name}`,
            );
            if (!columns) continue;
            await session.query(
              `SELECT ${columns.map((column) => quote(column.name)).join(",")} FROM ${tableOf(entity)} WHERE 1=0`,
              {},
              1,
            );
          }
          verifiedAt = Date.now();
        } catch (cause) {
          throw new ProductFailure(
            "PRODUCTS_PROVIDER_UNAVAILABLE",
            { provider: "oracle", stage: "catalog" },
            cause,
          );
        }
      }
      return operation(session);
    });
  const dimension = (input: CatalogDimension) => {
    const actual = catalog.dimensions.find((item) => item.id === input.id);
    if (actual !== input || actual.exposure !== "enabled")
      throw new Error("Unavailable product dimension");
    return actual;
  };
  const tree = async (session: OracleSession) =>
    groupTree(
      (
        await session.query(
          "SELECT CODGRUPOPROD ID,CODGRUPAI PARENT,DESCRGRUPOPROD LABEL FROM TGFGRU ORDER BY CODGRUPOPROD",
          {},
          2000,
        )
      ).map((row) => ({
        id: number(row, "ID"),
        parent: number(row, "PARENT"),
        label: text(row, "LABEL") || `#${number(row, "ID")}`,
      })),
    );
  const records = (
    input: CatalogDimension,
    words: readonly string[] | null,
    signal: AbortSignal,
  ): Promise<readonly RecordMatch[]> => {
    const current = dimension(input);
    if (current.kind !== "entity")
      throw new Error("Named records require an entity dimension");
    return read(signal, async (session) => {
      if (current.domain)
        return matchingDomain(current.domain, words)
          .slice(0, words ? 20 : 15)
          .map((option) => {
            const record: RecordValue = {
              id: option.value,
              label: option.label,
              active: null,
            };
            return { record, covers: [record] };
          });
      const entity = entityOf(catalog, current.entity!);
      if (entity.key.length !== 1 || !entity.label)
        throw new Error("Named records require a single key and label");
      const parameters = new Parameters();
      const predicate =
        words
          ?.map(
            (word) =>
              `(${current.columns.map((column) => regexp(`e.${quote(column)}`, wordPattern(word), parameters)).join(" OR ")})`,
          )
          .join(" AND ") || "1=1";
      // Candidate labels obey the same value-entity conditions as execution.
      const conditions = current.path
        .flatMap((id) =>
          catalog.relationships
            .filter((link) => link.id === id && link.to === entity.id)
            .flatMap((link) => link.where),
        )
        .map(
          (condition) =>
            `e.${quote(condition.column)} = ${parameters.bind(condition.equals)}`,
        );
      const result = await session.query(
        `SELECT * FROM (SELECT e.${quote(entity.key[0])} ID,e.${quote(entity.label)} LABEL FROM ${tableOf(entity)} e WHERE ${[predicate, ...conditions].join(" AND ")} ORDER BY e.${quote(entity.label)},e.${quote(entity.key[0])}) WHERE ROWNUM <= ${words ? 20 : 15}`,
        parameters.values,
        words ? 20 : 15,
      );
      return result.map((row) => {
        const id = row.ID;
        if (
          (typeof id !== "string" || id.length === 0 || id.length > 80) &&
          (typeof id !== "number" ||
            !Number.isInteger(id) ||
            Math.abs(id) > 2147483647)
        )
          throw new Error("Unexpected record key");
        const record: RecordValue = {
          id,
          label: text(row, "LABEL") || `#${String(id)}`,
          active: null,
        };
        return { record, covers: [record] };
      });
    });
  };
  return {
    catalog,
    close: () => reader.close(),
    findRecords: (input, words, signal) => records(input, words, signal),
    listRecords: (input, signal) => records(input, null, signal),
    categoryCandidates(input, terms, signal) {
      const current = dimension(input);
      if (current.kind !== "hierarchy" || terms.length < 1 || terms.length > 6)
        throw new Error("Invalid category search");
      return read(signal, async (session) => {
        const nodes = await tree(session);
        const parameters = new Parameters();
        const predicate = termsPredicate("p.DESCRPROD", terms, parameters);
        const counts = await session.query(
          `SELECT CODGRUPOPROD ID,COUNT(*) N,SUM(CASE WHEN ${predicate} THEN 1 ELSE 0 END) MATCHING FROM TGFPRO p GROUP BY CODGRUPOPROD`,
          parameters.values,
          2000,
        );
        const totals = new Map<number, { total: number; matching: number }>();
        let textMatches = 0;
        for (const row of counts) {
          const node = nodes.get(number(row, "ID"));
          if (!node) throw new Error("Product group disappeared");
          const count = number(row, "N"),
            matching = number(row, "MATCHING");
          textMatches += matching;
          for (const id of node.codes) {
            const existing = totals.get(id) ?? { total: 0, matching: 0 };
            existing.total += count;
            existing.matching += matching;
            totals.set(id, existing);
          }
        }
        const candidates = new Map<number, CategoryCandidate["matchedBy"]>();
        for (const node of nodes.values())
          if (
            terms.some((term) =>
              matches(node.path.at(-1)!, significantWords(term)),
            )
          )
            candidates.set(node.id, "name");
        for (const id of [...candidates.keys()]) {
          const children = [...nodes.values()].filter(
            (node) => node.codes.at(-2) === id,
          );
          if (children.length <= 12)
            for (const child of children)
              if (!candidates.has(child.id)) candidates.set(child.id, "child");
        }
        for (const [id, count] of totals)
          if (
            count.matching &&
            nodes.get(id)!.level >= 2 &&
            !candidates.has(id)
          )
            candidates.set(id, "products");
        const examples = await session.query(
          `SELECT * FROM (SELECT CODGRUPOPROD ID,DESCRPROD DESCRIPTION FROM TGFPRO p WHERE ${predicate} ORDER BY CODPROD) WHERE ROWNUM<=180`,
          parameters.values,
          180,
        );
        const ordered = [...candidates]
          .map(([id, matchedBy]): CategoryCandidate => ({
            node: nodes.get(id)!,
            matchedBy,
            products: totals.get(id)?.total ?? 0,
            matchingProducts: totals.get(id)?.matching ?? 0,
            examples: examples
              .filter((row) => nodes.get(number(row, "ID"))?.codes.includes(id))
              .slice(0, 3)
              .map((row) => text(row, "DESCRIPTION")),
          }))
          .filter((item) => item.products > 0)
          .sort(
            (a, b) =>
              Number(b.matchedBy === "name") - Number(a.matchedBy === "name") ||
              b.matchingProducts - a.matchingProducts ||
              a.node.id - b.node.id,
          );
        return {
          candidates: ordered.slice(0, 60),
          truncated: ordered.length > 60,
          textMatches,
        };
      });
    },
    salesScope(selection, signal) {
      const compiled = compileSelection(catalog, selection);
      const root = entityOf(catalog, catalog.root);
      if (catalog.source.id !== "sankhya" || root.key.length !== 1)
        throw new Error("Unsupported sales product source");
      return read(signal, () =>
        Promise.resolve({
          source: "sankhya" as const,
          catalogVersion: catalog.version,
          description: describeRequest(catalog, selection).slice(0, 4000),
          keysSql: `SELECT p.${quote(root.key[0])} FROM ${tableOf(root)} p WHERE ${compiled.where}`,
          binds: compiled.binds,
        }),
      );
    },
    find(selection, limit, signal) {
      const compiled = productStatements(catalog, selection, limit);
      return read(signal, async (session): Promise<ProductPage> => {
        const nodes = await tree(session);
        const count = await session.query(compiled.count, compiled.binds, 1);
        const products = await session.query(
          compiled.list,
          compiled.binds,
          limit,
        );
        const grouped = await session.query(
          compiled.sections,
          compiled.binds,
          2000,
        );
        const sections = new Map<string, number>();
        for (const row of grouped) {
          const node = nodes.get(number(row, "GROUP_ID"));
          if (!node) throw new Error("Unknown product group");
          const label = node.path[0];
          sections.set(label, (sections.get(label) ?? 0) + number(row, "N"));
        }
        return {
          total: number(count[0], "N"),
          products: products.map((row) => ({
            code: text(row, "CODE"),
            description: text(row, "DESCRIPTION"),
            classification:
              nodes.get(number(row, "GROUP_ID"))?.path.join(" › ") ?? "",
          })),
          sections: [...sections]
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
            .slice(0, 25),
        };
      });
    },
  };
}

/** Runtime always enforces non-owner SELECT-only credentials, in addition to read-only transactions. */
export function createSankhyaProductSource(
  connection: SankhyaConnection,
): ProductSource {
  return createOracleProductSource(
    sankhyaCatalog,
    createOracleProductReader(connection),
  );
}
