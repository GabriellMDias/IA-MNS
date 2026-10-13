import {
  entityOf,
  hierarchyOf,
  relationshipOf,
  type CatalogDimension,
  type CatalogEntity,
  type CatalogHierarchy,
  type SemanticCatalog,
} from "./catalog.js";
import type { ProductSelection, ResolvedCriterion } from "./selection.js";
import {
  accentedLetters,
  plainLetters,
  productPhrasePattern,
} from "../sales/product-match.js";
import { anyTermPattern } from "./text.js";

/**
 * PostgreSQL statements for any semantic catalog. Identifiers come only from
 * the validated catalog and are checked again and quoted here; every value
 * is a bound parameter. The outer query reads only the root entity and every
 * relationship is a semi-join (IN or EXISTS), so one-to-many paths can never
 * duplicate a product.
 */

const safeIdentifier = /^[a-z_][a-z0-9_]{0,62}$/;
export function quote(identifier: string): string {
  if (!safeIdentifier.test(identifier))
    throw new Error("Unsafe catalog identifier");
  return `"${identifier}"`;
}
export function tableOf(entity: CatalogEntity): string {
  return `${quote(entity.table.schema)}.${quote(entity.table.name)}`;
}

/** The normalization of the shared product phrase matching, in SQL. */
export function normalized(expression: string): string {
  return `regexp_replace(upper(translate(${expression}, '${accentedLetters}', '${plainLetters}')), '[[:space:]]+', ' ', 'g')`;
}

/** Bound values in order; `bind` returns the placeholder with a fixed cast. */
export class Parameters {
  readonly values: unknown[] = [];
  private readonly offset: number;
  constructor(offset = 0) {
    this.offset = offset;
  }
  bind(value: unknown, cast: SqlCast): string {
    this.values.push(value);
    return `$${this.offset + this.values.length}::${cast}`;
  }
}
export type SqlCast =
  "integer" | "integer[]" | "bigint[]" | "text" | "text[]" | "boolean";

function columnType(entity: CatalogEntity, column: string): string {
  const type = entity.columns.find((item) => item.name === column)?.type;
  if (!type) throw new Error("Unknown catalog column");
  return type;
}
/** Array cast for the key of an entity; only integer keys are supported. */
export function keyArrayCast(entity: CatalogEntity): SqlCast {
  if (entity.key.length !== 1) throw new Error("Composite keys are not values");
  const type = columnType(entity, entity.key[0]);
  if (type === "integer") return "integer[]";
  if (type === "bigint") return "bigint[]";
  throw new Error("Unsupported key type");
}

function aliases() {
  let next = 0;
  return () => `t${++next}`;
}
type Alias = () => string;

/**
 * The rows `otherAlias` under the node `nodeAlias` of a hierarchy: a node of
 * level n contains the rows sharing its first n codes. `otherColumns` are the
 * other side's code columns (the hierarchy's own for nodes).
 */
export function prefixMatch(
  hierarchy: CatalogHierarchy,
  nodeAlias: string,
  otherAlias: string,
  otherColumns: readonly string[] = hierarchy.codeColumns,
): string {
  const level = `${nodeAlias}.${quote(hierarchy.levelColumn)}`;
  return hierarchy.codeColumns
    .map((column, index) => {
      const equal = `${nodeAlias}.${quote(column)} = ${otherAlias}.${quote(otherColumns[index])}`;
      return index === 0 ? equal : `(${level} < ${index + 1} OR ${equal})`;
    })
    .join(" AND ");
}

/** Membership in the subtrees of hierarchy nodes. */
export function subtreePredicate(
  catalog: SemanticCatalog,
  hierarchy: CatalogHierarchy,
  /** Root columns that hold the codes, in hierarchy order. */
  rootColumns: readonly string[],
  rootAlias: string,
  nodeIds: readonly number[],
  parameters: Parameters,
  alias: Alias,
): string {
  const entity = entityOf(catalog, hierarchy.entity);
  const node = alias();
  return `EXISTS (SELECT 1 FROM ${tableOf(entity)} ${node} WHERE ${node}.${quote(entity.key[0])} = ANY(${parameters.bind([...nodeIds], keyArrayCast(entity))}) AND ${prefixMatch(hierarchy, node, rootAlias, rootColumns)})`;
}

/**
 * Root rows related through `path` to the records `ids` of the path's last
 * entity, as nested semi-joins from the root outward.
 */
export function pathPredicate(
  catalog: SemanticCatalog,
  path: readonly string[],
  rootAlias: string,
  inner: (alias: string) => string,
  alias: Alias,
): string {
  if (path.length === 0) return inner(rootAlias);
  const [first, ...rest] = path;
  const relationship = relationshipOf(catalog, first);
  const target = entityOf(catalog, relationship.to);
  const current = alias();
  const conditions = [
    ...relationship.where.map(
      (condition) =>
        `${current}.${quote(condition.column)} = ${Number(condition.equals)}`,
    ),
    pathPredicate(catalog, rest, current, inner, alias),
  ];
  const from = relationship.join.map(
    (pair) => `${rootAlias}.${quote(pair.from)}`,
  );
  const to = relationship.join.map((pair) => `${current}.${quote(pair.to)}`);
  return `(${from.join(", ")}) IN (SELECT ${to.join(", ")} FROM ${tableOf(target)} ${current} WHERE ${conditions.join(" AND ")})`;
}

function dimensionOf(catalog: SemanticCatalog, id: string): CatalogDimension {
  const dimension = catalog.dimensions.find((item) => item.id === id);
  if (!dimension) throw new Error("Unknown catalog dimension");
  return dimension;
}

function textPredicate(
  column: string,
  phrase: string,
  parameters: Parameters,
): string {
  return `${normalized(column)} ~ ${parameters.bind(productPhrasePattern(phrase), "text")}`;
}

export function criterionPredicate(
  catalog: SemanticCatalog,
  criterion: ResolvedCriterion,
  rootAlias: string,
  parameters: Parameters,
  alias: Alias,
): string {
  const dimension = dimensionOf(catalog, criterion.dimension);
  if (dimension.kind !== criterion.kind)
    throw new Error("Criterion does not match its dimension");
  const root = entityOf(catalog, catalog.root);
  let predicate: string;
  switch (criterion.kind) {
    case "hierarchy": {
      const hierarchy = hierarchyOf(catalog, dimension.hierarchy!);
      const relationship = relationshipOf(catalog, dimension.path[0]);
      const rootColumns = relationship.join.map((pair) => pair.from);
      const subtree = criterion.include
        .filter((choice) => choice.scope === "subtree")
        .map((choice) => choice.node.id);
      const matching = criterion.include
        .filter((choice) => choice.scope === "matching_text")
        .map((choice) => choice.node.id);
      const pattern = anyTermPattern(criterion.terms);
      if (pattern === null)
        throw new Error("Hierarchy criterion without terms");
      // Bound only when used: PostgreSQL rejects parameters no clause reads.
      let bound: string | undefined;
      const description = () =>
        `${normalized(`${rootAlias}.${quote(root.label!)}`)} ~ ${(bound ??= parameters.bind(pattern, "text"))}`;
      const included = [
        ...(subtree.length > 0
          ? [
              subtreePredicate(
                catalog,
                hierarchy,
                rootColumns,
                rootAlias,
                subtree,
                parameters,
                alias,
              ),
            ]
          : []),
        ...(matching.length > 0
          ? [
              `(${subtreePredicate(catalog, hierarchy, rootColumns, rootAlias, matching, parameters, alias)} AND ${description()})`,
            ]
          : []),
        ...(criterion.anywhere ? [description()] : []),
      ];
      if (included.length === 0)
        throw new Error("Hierarchy criterion without inclusions");
      predicate = `(${included.join(" OR ")})`;
      if (criterion.exclude.length > 0)
        predicate = `(${predicate} AND NOT ${subtreePredicate(
          catalog,
          hierarchy,
          rootColumns,
          rootAlias,
          criterion.exclude.map((node) => node.id),
          parameters,
          alias,
        )})`;
      break;
    }
    case "entity": {
      const entity = entityOf(catalog, dimension.entity!);
      const ids = criterion.values.map((value) => value.id);
      predicate = pathPredicate(
        catalog,
        dimension.path,
        rootAlias,
        (last) =>
          `${last}.${quote(entity.key[0])} = ANY(${parameters.bind(ids, keyArrayCast(entity))})`,
        alias,
      );
      break;
    }
    case "text":
      predicate = textPredicate(
        `${rootAlias}.${quote(dimension.columns[0])}`,
        criterion.phrase,
        parameters,
      );
      break;
    case "flag":
      if (columnType(root, dimension.columns[0]) !== "boolean")
        throw new Error("Flag dimensions read boolean columns");
      predicate = `${rootAlias}.${quote(dimension.columns[0])} = ${parameters.bind(true, "boolean")}`;
      break;
    case "status": {
      const entity = entityOf(catalog, dimension.entity!);
      const status = entity.status!;
      predicate = pathPredicate(
        catalog,
        dimension.path,
        rootAlias,
        (last) =>
          `${last}.${quote(status.column)} = ${parameters.bind(status.active, "integer")}`,
        alias,
      );
      break;
    }
  }
  // NULLs from optional relationships must never turn an exclusion into a
  // silent inclusion or a whole-result loss.
  return criterion.mode === "include"
    ? `(${predicate}) IS TRUE`
    : `(${predicate}) IS NOT TRUE`;
}

export type CompiledSelection = Readonly<{
  where: string;
  values: readonly unknown[];
}>;

export function compileSelection(
  catalog: SemanticCatalog,
  selection: ProductSelection,
  rootAlias = "p",
  parameterOffset = 0,
): CompiledSelection {
  if (!Number.isInteger(parameterOffset) || parameterOffset < 0)
    throw new Error("Invalid parameter offset");
  const parameters = new Parameters(parameterOffset);
  const alias = aliases();
  const where = selection.criteria
    .map((criterion) =>
      criterionPredicate(catalog, criterion, rootAlias, parameters, alias),
    )
    .join("\n  AND ");
  return { where, values: parameters.values };
}

/** The hierarchy dimension used to label results (the classification path). */
export function displayHierarchy(catalog: SemanticCatalog) {
  const dimension = catalog.dimensions.find(
    (item) => item.kind === "hierarchy" && item.exposure === "enabled",
  );
  if (!dimension) return null;
  const hierarchy = hierarchyOf(catalog, dimension.hierarchy!);
  const relationship = relationshipOf(catalog, dimension.path[0]);
  return {
    hierarchy,
    entity: entityOf(catalog, hierarchy.entity),
    rootColumns: relationship.join.map((pair) => pair.from),
  };
}

/** Labels of the nodes containing the row, from the top level down. */
function pathExpression(catalog: SemanticCatalog, rootAlias: string): string {
  const display = displayHierarchy(catalog);
  if (!display) return "''";
  const { hierarchy, entity, rootColumns } = display;
  return `COALESCE((SELECT string_agg(btrim(h.${quote(entity.label!)}), ' › ' ORDER BY h.${quote(hierarchy.levelColumn)}) FROM ${tableOf(entity)} h WHERE ${prefixMatch(hierarchy, "h", rootAlias, rootColumns)}), '')`;
}

export type ProductStatements = Readonly<{
  list: string;
  count: string;
  sections: string | null;
  values: readonly unknown[];
}>;

/**
 * The bounded list (limit + 1 rows so truncation is visible), the exact
 * count and the per-section counts of a selection.
 */
export function productStatements(
  catalog: SemanticCatalog,
  selection: ProductSelection,
  limit: number,
): ProductStatements {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500)
    throw new Error("Invalid product limit");
  const root = entityOf(catalog, catalog.root);
  if (!root.label || root.key.length !== 1)
    throw new Error("The root needs one key and a label");
  const { where, values } = compileSelection(catalog, selection);
  const from = `FROM ${tableOf(root)} p\nWHERE ${where}`;
  const key = `p.${quote(root.key[0])}`;
  const label = `p.${quote(root.label)}`;
  const display = displayHierarchy(catalog);
  let sections: string | null = null;
  if (display) {
    const { hierarchy, entity, rootColumns } = display;
    sections = `SELECT COALESCE(btrim(s.${quote(entity.label!)}), '') AS label, count(*)::int AS count
FROM ${tableOf(root)} p
JOIN ${tableOf(entity)} s ON s.${quote(hierarchy.levelColumn)} = 1 AND s.${quote(hierarchy.codeColumns[0])} = p.${quote(rootColumns[0])}
WHERE ${where}
GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 25`;
  }
  return {
    list: `SELECT ${key}::text AS code, COALESCE(NULLIF(btrim(${label}), ''), 'sem descrição') AS description, ${pathExpression(catalog, "p")} AS classification
${from}
ORDER BY ${label}, ${key}
LIMIT ${limit + 1}`,
    count: `SELECT count(*)::int AS count\n${from}`,
    sections,
    values,
  };
}
