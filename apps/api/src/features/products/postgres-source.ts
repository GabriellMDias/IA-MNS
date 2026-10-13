import type pg from "pg";
import { Type, type Static, type TSchema } from "typebox";
import { Value } from "typebox/value";
import {
  entityOf,
  requiredColumns,
  hierarchyOf,
  relationshipOf,
  type CatalogDimension,
  type CatalogEntity,
  type CatalogHierarchy,
  type SemanticCatalog,
} from "./catalog.js";
import { ProductFailure } from "./errors.js";
import {
  displayHierarchy,
  compileSelection,
  keyArrayCast,
  normalized,
  prefixMatch,
  productStatements,
  quote,
  tableOf,
} from "./postgres.js";
import {
  within,
  type HierarchyNode,
  type ProductPage,
  type RecordValue,
} from "./selection.js";
import { selectionSchema } from "./selection.js";
import { describeRequest } from "./answer.js";
import type {
  CategoryCandidate,
  ProductSource,
  RecordMatch,
} from "./source.js";
import { anyTermPattern, wordPattern } from "./text.js";

/** Bounds of candidate retrieval; the model never sees more than this. */
export const candidateLimits = {
  /** Candidates offered for one criterion. */
  total: 60,
  /** Nodes whose own name matches. */
  named: 30,
  /** Children listed below a name-matched node. */
  children: 12,
  /** Description groups read per level before folding. */
  groups: 1000,
  /** Hierarchy level at which product-description matches are grouped. */
  groupLevel: 3,
  /** Example descriptions per candidate. */
  examples: 3,
} as const;
const recordLimit = 20;
const listLimit = 15;
/** How long a successful schema verification is trusted. */
const verificationMs = 10 * 60 * 1000;

const integer = Type.Integer({ minimum: -2147483648, maximum: 2147483647 });
const nodeRows = Type.Array(
  Type.Object({
    id: integer,
    level: Type.Integer({ minimum: 1, maximum: 8 }),
    codes: Type.Array(Type.Integer(), { minItems: 1, maxItems: 8 }),
  }),
);
const childRows = Type.Array(
  Type.Object({
    parent: integer,
    id: integer,
    level: Type.Integer({ minimum: 1, maximum: 8 }),
    codes: Type.Array(Type.Integer(), { minItems: 1, maxItems: 8 }),
  }),
);
const detailRows = Type.Array(
  Type.Object({
    id: integer,
    path: Type.Array(Type.String()),
    products: Type.Integer({ minimum: 0 }),
    matching: Type.Integer({ minimum: 0 }),
    examples: Type.Array(Type.String()),
  }),
);
const groupRows = Type.Array(
  Type.Object({
    id: integer,
    level: Type.Integer({ minimum: 1, maximum: 8 }),
    codes: Type.Array(Type.Integer(), { minItems: 1, maxItems: 8 }),
    matching: Type.Integer({ minimum: 1 }),
  }),
);
const recordRows = Type.Array(
  Type.Object({
    id: integer,
    label: Type.String({ minLength: 1 }),
    active: Type.Union([Type.Boolean(), Type.Null()]),
  }),
);
const expansionRows = Type.Array(
  Type.Object({
    ancestor: integer,
    id: integer,
    label: Type.String({ minLength: 1 }),
    active: Type.Union([Type.Boolean(), Type.Null()]),
  }),
);
const productRows = Type.Array(
  Type.Object({
    code: Type.String({ pattern: "^-?\\d+$" }),
    description: Type.String({ minLength: 1 }),
    classification: Type.String(),
  }),
);
const countRows = Type.Array(
  Type.Object({ count: Type.Integer({ minimum: 0 }) }),
  { minItems: 1, maxItems: 1 },
);
const sectionRows = Type.Array(
  Type.Object({ label: Type.String(), count: Type.Integer({ minimum: 1 }) }),
);
const columnRows = Type.Array(
  Type.Object({
    table: Type.String(),
    column: Type.String(),
    type: Type.String(),
    nullable: Type.Boolean(),
    readable: Type.Boolean(),
  }),
);

function checked<T extends TSchema>(schema: T, rows: unknown): Static<T> {
  if (!Value.Check(schema, rows))
    throw new Error("Unexpected product catalog response shape");
  return rows;
}

const codesArray = (hierarchy: CatalogHierarchy, alias: string) =>
  `ARRAY[${hierarchy.codeColumns.map((column) => `${alias}.${quote(column)}`).join(", ")}]::int[]`;

function labelExpression(entity: CatalogEntity, alias: string): string {
  const key = `${alias}.${quote(entity.key[0])}`;
  return entity.label
    ? `COALESCE(NULLIF(btrim(${alias}.${quote(entity.label)}), ''), '#' || ${key}::text)`
    : `'#' || ${key}::text`;
}
function activeExpression(entity: CatalogEntity, alias: string): string {
  return entity.status
    ? `(${alias}.${quote(entity.status.column)} = ${Number(entity.status.active)})`
    : "NULL::boolean";
}

/** Differences between the live schema and what enabled dimensions require. */
export async function catalogMismatches(
  client: pg.ClientBase,
  catalog: SemanticCatalog,
): Promise<string[]> {
  const required = requiredColumns(catalog);
  const rows = checked(
    columnRows,
    (
      await client.query(
        `SELECT n.nspname || '.' || c.relname AS "table", a.attname AS "column",
  format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable,
  has_column_privilege(c.oid, a.attnum, 'SELECT') AS readable
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE a.attnum > 0 AND NOT a.attisdropped
  AND n.nspname || '.' || c.relname = ANY($1::text[])`,
        [[...required.keys()]],
      )
    ).rows,
  );
  const live = new Map(rows.map((row) => [`${row.table}.${row.column}`, row]));
  const problems: string[] = [];
  for (const [table, columns] of required)
    for (const column of columns) {
      const found = live.get(`${table}.${column.name}`);
      if (!found) problems.push(`${table}.${column.name} is missing`);
      else if (found.type !== column.type)
        problems.push(`${table}.${column.name} is ${found.type}`);
      else if (found.nullable !== column.nullable)
        problems.push(`${table}.${column.name} nullability changed`);
      else if (!found.readable)
        problems.push(`${table}.${column.name} is not readable`);
    }
  return problems;
}

/**
 * Product lookup over a PostgreSQL ERP described by a semantic catalog. Every
 * call runs in its own read-only transaction that is always rolled back.
 */
export function createPostgresProductSource(
  catalog: SemanticCatalog,
  createPool: () => pg.Pool,
  transactionSettings: readonly string[],
): ProductSource {
  let pool: pg.Pool | undefined;
  let verifiedAt = 0;
  const root = entityOf(catalog, catalog.root);
  const display = displayHierarchy(catalog);

  async function transaction<T>(
    signal: AbortSignal,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    let client: pg.PoolClient | undefined;
    let destroyed = false;
    let stage: "connection" | "catalog" | "query" = "connection";
    let result: { value: T } | undefined;
    let failure: ProductFailure | undefined;
    // pg has no statement cancellation through AbortSignal: ending the
    // connection stops the read; the server-side timeouts bound the rest.
    const interrupt = () => {
      if (client && !destroyed) {
        destroyed = true;
        client.release(new Error("Product read aborted"));
      }
    };
    try {
      signal.throwIfAborted();
      pool ??= createPool();
      client = await pool.connect();
      signal.throwIfAborted();
      signal.addEventListener("abort", interrupt, { once: true });
      stage = "query";
      for (const statement of transactionSettings)
        await client.query(statement);
      if (Date.now() - verifiedAt > verificationMs) {
        stage = "catalog";
        const problems = await catalogMismatches(client, catalog);
        if (problems.length > 0)
          throw new Error(`Catalog mismatch: ${problems.join("; ")}`);
        verifiedAt = Date.now();
        stage = "query";
      }
      result = { value: await work(client) };
      signal.throwIfAborted();
    } catch (cause) {
      failure =
        cause instanceof ProductFailure
          ? cause
          : new ProductFailure(
              "PRODUCTS_PROVIDER_UNAVAILABLE",
              { provider: "postgresql", stage },
              cause,
            );
    } finally {
      signal.removeEventListener("abort", interrupt);
      if (client && !destroyed) {
        try {
          await client.query("ROLLBACK");
          client.release();
        } catch (cause) {
          client.release(cause instanceof Error ? cause : true);
          failure ??= new ProductFailure(
            "PRODUCTS_PROVIDER_UNAVAILABLE",
            { provider: "postgresql", stage: "cleanup" },
            cause,
          );
        }
      }
    }
    if (failure) throw failure;
    return result!.value;
  }

  function recordEntity(dimension: CatalogDimension): CatalogEntity {
    if (dimension.kind !== "entity" || dimension.exposure !== "enabled")
      throw new Error("Not an enabled entity dimension");
    return entityOf(catalog, dimension.entity!);
  }

  /** Each record with what it stands for: itself and its hierarchy descendants. */
  async function expand(
    client: pg.PoolClient,
    dimension: CatalogDimension,
    records: readonly RecordValue[],
  ): Promise<RecordMatch[]> {
    if (!dimension.hierarchy || records.length === 0)
      return records.map((record) => ({ record, covers: [record] }));
    const entity = entityOf(catalog, dimension.entity!);
    const hierarchy = hierarchyOf(catalog, dimension.hierarchy);
    const key = quote(entity.key[0]);
    const level = quote(hierarchy.levelColumn);
    const rows = checked(
      expansionRows,
      (
        await client.query(
          `SELECT a.${key} AS ancestor, d.${key} AS id, ${labelExpression(entity, "d")} AS label, ${activeExpression(entity, "d")} AS active
FROM ${tableOf(entity)} a JOIN ${tableOf(entity)} d
  ON d.${level} >= a.${level} AND ${prefixMatch(hierarchy, "a", "d")}
WHERE a.${key} = ANY($1::${keyArrayCast(entity)})
ORDER BY 1, d.${level}, 2 LIMIT 401`,
          [records.map((record) => record.id)],
        )
      ).rows,
    );
    if (rows.length > 400)
      throw new Error("Hierarchy expansion exceeds its bound");
    return records.map((record) => ({
      record,
      covers: rows
        .filter((row) => row.ancestor === record.id)
        .map(({ id, label, active }) => ({ id, label, active })),
    }));
  }

  function hierarchyContext(dimension: CatalogDimension) {
    if (dimension.kind !== "hierarchy" || dimension.exposure !== "enabled")
      throw new Error("Not an enabled hierarchy dimension");
    const hierarchy = hierarchyOf(catalog, dimension.hierarchy!);
    const relationship = relationshipOf(catalog, dimension.path[0]);
    return {
      hierarchy,
      entity: entityOf(catalog, hierarchy.entity),
      rootColumns: relationship.join.map((pair) => pair.from),
    };
  }

  return {
    catalog,
    categoryCandidates(dimension, terms, signal) {
      const { hierarchy, entity, rootColumns } = hierarchyContext(dimension);
      const pattern = anyTermPattern(terms);
      if (pattern === null)
        return Promise.resolve({
          candidates: [],
          truncated: false,
          textMatches: 0,
        });
      // Nodes named with the person's own words come before alternatives.
      const primary = anyTermPattern(terms.slice(0, 1)) ?? pattern;
      const table = tableOf(entity);
      const key = quote(entity.key[0]);
      const level = quote(hierarchy.levelColumn);
      const nodeLabel = normalized(`n.${quote(entity.label!)}`);
      const description = normalized(`p.${quote(root.label!)}`);
      const rootTable = tableOf(root);
      const nodeColumns = `n.${key} AS id, n.${level} AS level, ${codesArray(hierarchy, "n")} AS codes`;
      const groupLevel = Math.min(
        candidateLimits.groupLevel,
        hierarchy.codeColumns.length,
      );
      return transaction(signal, async (client) => {
        const named = checked(
          nodeRows,
          (
            await client.query(
              `SELECT ${nodeColumns} FROM ${table} n
WHERE ${nodeLabel} ~ $1::text
ORDER BY (${nodeLabel} ~ $2::text) DESC, n.${level}, n.${key}
LIMIT ${candidateLimits.named + 1}`,
              [pattern, primary],
            )
          ).rows,
        );
        let truncated = named.length > candidateLimits.named;
        const top = named.slice(0, candidateLimits.named);
        const children = top.length
          ? checked(
              childRows,
              (
                await client.query(
                  `SELECT a.${key} AS parent, ${nodeColumns}
FROM ${table} a JOIN ${table} n ON n.${level} = a.${level} + 1 AND ${prefixMatch(hierarchy, "a", "n")}
WHERE a.${key} = ANY($1::int[])
  AND EXISTS (SELECT 1 FROM ${rootTable} p WHERE ${prefixMatch(hierarchy, "n", "p", rootColumns)})
ORDER BY 1, n.${key}`,
                  [top.map((node) => node.id)],
                )
              ).rows,
            )
          : [];
        const seen = new Set(top.map((node) => node.id));
        const childNodes = top.flatMap((parent) => {
          const own = children.filter((child) => child.parent === parent.id);
          if (own.length > candidateLimits.children) return [];
          return own
            .filter(
              (child) => !seen.has(child.id) && Boolean(seen.add(child.id)),
            )
            .map(({ id, level, codes }) => ({ id, level, codes }));
        });
        // Product-description matches grouped at one level; the long tail
        // folds into ancestors so every mention stays within the bound.
        const groupsAt = async (depth: number) => {
          const rows = checked(
            groupRows,
            (
              await client.query(
                `SELECT ${nodeColumns}, count(*)::int AS matching
FROM ${rootTable} p JOIN ${table} n ON ${hierarchy.codeColumns
                  .map((column, index) =>
                    index < depth
                      ? `n.${quote(column)} = p.${quote(rootColumns[index])}`
                      : `n.${quote(column)} = 0`,
                  )
                  .join(" AND ")}
WHERE ${description} ~ $1::text
GROUP BY n.${key}, n.${level}, ${hierarchy.codeColumns.map((column) => `n.${quote(column)}`).join(", ")}
ORDER BY count(*) DESC, n.${key} LIMIT ${candidateLimits.groups + 1}`,
                [pattern],
              )
            ).rows,
          );
          if (rows.length > candidateLimits.groups)
            throw new Error("Too many description groups");
          return rows.filter(
            (row) =>
              !seen.has(row.id) &&
              !covering.some((node) => within(asNode(row), node)),
          );
        };
        const covering = [...top, ...childNodes].map(asNode);
        const budget = Math.max(
          0,
          candidateLimits.total - top.length - childNodes.length,
        );
        let groups = await groupsAt(groupLevel);
        if (groups.length > budget) {
          let folded: typeof groups | null = null;
          for (let depth = groupLevel - 1; depth >= 1 && !folded; depth--) {
            const parents = await groupsAt(depth);
            for (let count = budget; count >= 0 && !folded; count--) {
              const rest = groups.slice(count);
              const needed = parents.filter((parent) =>
                rest.some((group) => within(asNode(group), asNode(parent))),
              );
              if (count + needed.length <= budget)
                folded = [...groups.slice(0, count), ...needed];
            }
          }
          if (!folded) truncated = true;
          groups = (folded ?? groups).slice(0, budget);
        }
        const textMatches = checked(
          countRows,
          (
            await client.query(
              `SELECT count(*)::int AS count FROM ${rootTable} p WHERE ${description} ~ $1::text`,
              [pattern],
            )
          ).rows,
        )[0].count;
        const kept: {
          id: number;
          level: number;
          codes: number[];
          matchedBy: CategoryCandidate["matchedBy"];
        }[] = [
          ...top.map((node) => ({ ...node, matchedBy: "name" as const })),
          ...childNodes.map((node) => ({
            ...node,
            matchedBy: "child" as const,
          })),
          ...groups.map(({ id, level, codes }) => ({
            id,
            level,
            codes,
            matchedBy: "products" as const,
          })),
        ].slice(0, candidateLimits.total);
        if (kept.length === 0)
          return { candidates: [], truncated, textMatches };
        const details = checked(
          detailRows,
          (
            await client.query(
              `SELECT n.${key} AS id,
  ARRAY(SELECT btrim(a.${quote(entity.label!)}) FROM ${table} a
    WHERE a.${level} <= n.${level} AND ${prefixMatch(hierarchy, "a", "n")}
    ORDER BY a.${level}) AS path,
  (SELECT count(*)::int FROM ${rootTable} p WHERE ${prefixMatch(hierarchy, "n", "p", rootColumns)}) AS products,
  (SELECT count(*)::int FROM ${rootTable} p WHERE ${prefixMatch(hierarchy, "n", "p", rootColumns)} AND ${description} ~ $2::text) AS matching,
  ARRAY(SELECT btrim(p.${quote(root.label!)}) FROM ${rootTable} p
    WHERE ${prefixMatch(hierarchy, "n", "p", rootColumns)}
    ORDER BY (${description} ~ $2::text) DESC, p.${quote(root.key[0])}
    LIMIT ${candidateLimits.examples}) AS examples
FROM ${table} n WHERE n.${key} = ANY($1::int[])`,
              [kept.map((node) => node.id), pattern],
            )
          ).rows,
        );
        const byId = new Map(details.map((row) => [row.id, row]));
        const conventions = catalog.conventions.filter(
          (convention) => convention.entity === entity.id,
        );
        return {
          truncated,
          textMatches,
          candidates: kept.flatMap((node): CategoryCandidate[] => {
            const detail = byId.get(node.id);
            if (!detail || detail.path.length !== node.level) return [];
            return [
              {
                node: {
                  id: node.id,
                  level: node.level,
                  codes: node.codes,
                  path: detail.path.map((label) => label || "—"),
                  conventions: conventions
                    .filter((convention) =>
                      detail.path.some((label) =>
                        new RegExp(convention.pattern, "u").test(
                          plainUpper(label),
                        ),
                      ),
                    )
                    .map((convention) => convention.id),
                },
                matchedBy: node.matchedBy,
                products: detail.products,
                matchingProducts: detail.matching,
                examples: detail.examples.slice(0, candidateLimits.examples),
              },
            ];
          }),
        };
      });
    },
    findRecords(dimension, words, signal) {
      const entity = recordEntity(dimension);
      if (words.length === 0 || words.length > 6) return Promise.resolve([]);
      const values = words.map(wordPattern);
      const alternatives = dimension.columns.map(
        (column) =>
          `(${values.map((_, index) => `${normalized(`t.${quote(column)}`)} ~ $${index + 1}::text`).join(" AND ")})`,
      );
      return transaction(signal, async (client) =>
        expand(
          client,
          dimension,
          checked(
            recordRows,
            (
              await client.query(
                `SELECT t.${quote(entity.key[0])} AS id, ${labelExpression(entity, "t")} AS label, ${activeExpression(entity, "t")} AS active
FROM ${tableOf(entity)} t WHERE ${alternatives.join(" OR ")}
ORDER BY 2, 1 LIMIT ${recordLimit}`,
                values,
              )
            ).rows,
          ),
        ),
      );
    },
    listRecords(dimension, signal) {
      const entity = recordEntity(dimension);
      return transaction(signal, async (client) =>
        expand(
          client,
          dimension,
          checked(
            recordRows,
            (
              await client.query(
                `SELECT t.${quote(entity.key[0])} AS id, ${labelExpression(entity, "t")} AS label, ${activeExpression(entity, "t")} AS active
FROM ${tableOf(entity)} t
${entity.status ? `WHERE t.${quote(entity.status.column)} = ${Number(entity.status.active)}` : ""}
ORDER BY 2, 1 LIMIT ${listLimit}`,
              )
            ).rows,
          ),
        ),
      );
    },
    salesScope(selection, signal) {
      if (!Value.Check(selectionSchema, selection))
        throw new Error("Invalid sales product selection");
      const compiled = compileSelection(catalog, selection, "p", 4);
      const root = entityOf(catalog, catalog.root);
      if (catalog.source.id !== "vrmaster" || root.key.length !== 1)
        throw new Error("Unsupported sales product source");
      return transaction(signal, () =>
        Promise.resolve({
          source: "vrmaster" as const,
          catalogVersion: catalog.version,
          description: describeRequest(catalog, selection).slice(0, 4000),
          keysSql: `SELECT p.${quote(root.key[0])} FROM ${tableOf(root)} p WHERE ${compiled.where}`,
          values: compiled.values,
        }),
      );
    },
    find(selection, limit, signal) {
      for (const criterion of selection.criteria) {
        const dimension = catalog.dimensions.find(
          (item) => item.id === criterion.dimension,
        );
        if (dimension?.exposure !== "enabled")
          throw new Error("Selection uses a dimension that is not enabled");
      }
      const statements = productStatements(catalog, selection, limit);
      return transaction(signal, async (client): Promise<ProductPage> => {
        const values = [...statements.values];
        const count = checked(
          countRows,
          (await client.query(statements.count, values)).rows,
        )[0].count;
        const products =
          count === 0
            ? []
            : checked(
                productRows,
                (await client.query(statements.list, values)).rows,
              );
        const sections =
          count === 0 || !statements.sections || !display
            ? []
            : checked(
                sectionRows,
                (await client.query(statements.sections, values)).rows,
              );
        if (products.length > Math.min(count, limit + 1))
          throw new Error("Product list exceeds its count");
        return {
          total: count,
          products: products.slice(0, limit),
          sections,
        };
      });
    },
    async close() {
      const closing = pool;
      pool = undefined;
      await closing?.end();
    },
  };
}

function asNode(row: {
  id: number;
  level: number;
  codes: number[];
}): HierarchyNode {
  return { ...row, path: ["—"], conventions: [] };
}

function plainUpper(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type { RecordMatch, RecordValue };
