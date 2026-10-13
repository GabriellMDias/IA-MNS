import { Value } from "typebox/value";
import {
  entityOf,
  hierarchyOf,
  relationshipOf,
  type CatalogEntity,
  type SemanticCatalog,
} from "../catalog.js";
import {
  selectionSchema,
  type ProductSelection,
  type ResolvedCriterion,
} from "../selection.js";
import {
  accentedLetters,
  plainLetters,
  productPhrasePattern,
} from "../../sales/product-match.js";
import { termPattern } from "../text.js";

export function quote(name: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name))
    throw new Error("Unsafe catalog identifier");
  return `"${name.toUpperCase()}"`;
}
/** Logical `erp` schema resolves through the reader's private local synonyms. */
export const tableOf = (entity: CatalogEntity) => quote(entity.table.name);
export const normalized = (expression: string) =>
  `REGEXP_REPLACE(UPPER(TRANSLATE(${expression}, '${accentedLetters}', '${plainLetters}')), '[[:space:]]+', ' ')`;

export class Parameters {
  readonly values: Record<string, string | number> = {};
  private next = 0;
  bind(value: string | number): string {
    const name = `v${++this.next}`;
    this.values[name] = value;
    return `:${name}`;
  }
  list(values: readonly (string | number)[]): string {
    if (values.length === 0 || values.length > 200)
      throw new Error("Invalid value list");
    return values.map((value) => this.bind(value)).join(", ");
  }
}
export function regexp(
  column: string,
  pattern: string,
  parameters: Parameters,
): string {
  if (Buffer.byteLength(pattern, "utf8") > 512)
    throw new Error("Pattern exceeds Oracle limit");
  return `REGEXP_LIKE(${normalized(column)}, ${parameters.bind(pattern)})`;
}
export function termsPredicate(
  column: string,
  terms: readonly string[],
  parameters: Parameters,
): string {
  const patterns = terms
    .map(termPattern)
    .filter((pattern): pattern is string => pattern !== null);
  if (patterns.length === 0) throw new Error("No searchable terms");
  return `(${patterns.map((pattern) => regexp(column, pattern, parameters)).join(" OR ")})`;
}

export function compileSelection(
  catalog: SemanticCatalog,
  selection: ProductSelection,
) {
  if (!Value.Check(selectionSchema, selection))
    throw new Error("Invalid product selection");
  const parameters = new Parameters();
  let serial = 0;
  const alias = () => `t${++serial}`;
  const path = (
    ids: readonly string[],
    origin: string,
    inner: (a: string) => string,
  ): string => {
    if (ids.length === 0) return inner(origin);
    const link = relationshipOf(catalog, ids[0]);
    if (!["verified", "validated"].includes(link.status))
      throw new Error("Unverified product relationship");
    const target = alias();
    return `EXISTS (SELECT 1 FROM ${tableOf(entityOf(catalog, link.to))} ${target} WHERE ${[
      ...link.join.map(
        (pair) => `${origin}.${quote(pair.from)} = ${target}.${quote(pair.to)}`,
      ),
      ...link.where.map(
        (condition) =>
          `${target}.${quote(condition.column)} = ${parameters.bind(condition.equals)}`,
      ),
      path(ids.slice(1), target, inner),
    ].join(" AND ")})`;
  };
  const criterion = (item: ResolvedCriterion): string => {
    const dimension = catalog.dimensions.find(
      (entry) => entry.id === item.dimension,
    );
    if (
      !dimension ||
      dimension.exposure !== "enabled" ||
      dimension.kind !== item.kind
    )
      throw new Error("Unavailable product dimension");
    const root = entityOf(catalog, catalog.root);
    let predicate: string;
    switch (item.kind) {
      case "text":
        predicate = regexp(
          `p.${quote(dimension.columns[0])}`,
          productPhrasePattern(item.phrase),
          parameters,
        );
        break;
      case "flag":
        predicate = `p.${quote(dimension.columns[0])} = ${parameters.bind(dimension.trueValue ?? 1)}`;
        break;
      case "status": {
        const status = entityOf(catalog, dimension.entity!).status!;
        predicate = path(
          dimension.path,
          "p",
          (target) =>
            `${target}.${quote(status.column)} = ${parameters.bind(status.active)}`,
        );
        break;
      }
      case "entity": {
        const values = item.values.map((value) => value.id);
        if (dimension.domain) {
          if (
            values.some(
              (value) =>
                !dimension.domain!.some((option) => option.value === value),
            )
          )
            throw new Error("Unknown dictionary option");
          predicate = `p.${quote(dimension.columns[0])} IN (${parameters.list(values)})`;
        } else {
          const entity = entityOf(catalog, dimension.entity!);
          if (entity.key.length !== 1)
            throw new Error("Composite keys cannot be named values");
          predicate = path(
            dimension.path,
            "p",
            (target) =>
              `${target}.${quote(entity.key[0])} IN (${parameters.list(values)})`,
          );
        }
        break;
      }
      case "hierarchy": {
        const hierarchy = hierarchyOf(catalog, dimension.hierarchy!);
        if (!hierarchy.parentColumn)
          throw new Error("Oracle product hierarchy requires parent mapping");
        const entity = entityOf(catalog, hierarchy.entity);
        const relationship = relationshipOf(catalog, dimension.path[0]);
        const subtree = (ids: readonly number[]) =>
          `p.${quote(relationship.join[0].from)} IN (SELECT h.${quote(entity.key[0])} FROM ${tableOf(entity)} h START WITH h.${quote(entity.key[0])} IN (${parameters.list(ids)}) CONNECT BY NOCYCLE PRIOR h.${quote(entity.key[0])} = h.${quote(hierarchy.parentColumn!)} AND LEVEL <= 8)`;
        const subtreeIds = item.include
          .filter((entry) => entry.scope === "subtree")
          .map((entry) => entry.node.id);
        const matchingIds = item.include
          .filter((entry) => entry.scope === "matching_text")
          .map((entry) => entry.node.id);
        const inclusions = [
          ...(subtreeIds.length ? [subtree(subtreeIds)] : []),
          ...(matchingIds.length
            ? [
                `(${subtree(matchingIds)} AND ${termsPredicate(`p.${quote(root.label!)}`, item.terms, parameters)})`,
              ]
            : []),
          ...(item.anywhere
            ? [
                termsPredicate(
                  `p.${quote(root.label!)}`,
                  item.terms,
                  parameters,
                ),
              ]
            : []),
        ];
        if (inclusions.length === 0)
          throw new Error("Hierarchy selection without inclusions");
        predicate = `(${inclusions.join(" OR ")})`;
        if (item.exclude.length)
          predicate += ` AND NOT (${subtree(item.exclude.map((entry) => entry.id))})`;
        break;
      }
    }
    return `(CASE WHEN (${predicate}) THEN 1 ELSE 0 END = ${item.mode === "include" ? 1 : 0})`;
  };
  return {
    where: selection.criteria.map(criterion).join(" AND "),
    binds: parameters.values,
  };
}

export function productStatements(
  catalog: SemanticCatalog,
  selection: ProductSelection,
  limit: number,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new Error("Invalid product limit");
  const root = entityOf(catalog, catalog.root);
  const display = catalog.dimensions.find(
    (item) => item.kind === "hierarchy" && item.exposure === "enabled",
  );
  if (!display || root.key.length !== 1 || !root.label)
    throw new Error("Missing product display mapping");
  const group = relationshipOf(catalog, display.path[0]).join[0].from;
  const { where, binds } = compileSelection(catalog, selection);
  const from = `FROM ${tableOf(root)} p WHERE ${where}`;
  return {
    list: `SELECT * FROM (SELECT TO_CHAR(p.${quote(root.key[0])}) CODE, p.${quote(root.label)} DESCRIPTION, p.${quote(group)} GROUP_ID ${from} ORDER BY p.${quote(root.label)}, p.${quote(root.key[0])}) WHERE ROWNUM <= ${limit}`,
    count: `SELECT COUNT(*) N ${from}`,
    sections: `SELECT p.${quote(group)} GROUP_ID, COUNT(*) N ${from} GROUP BY p.${quote(group)}`,
    binds,
  };
}
