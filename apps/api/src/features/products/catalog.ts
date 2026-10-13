import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

/**
 * The ERP-neutral semantic catalog: what a product source's schema means for
 * product identification. Each ERP adapter supplies one catalog with its
 * entities (tables), relationships (join columns with their evidence),
 * hierarchies, business dimensions and discovered value conventions. The
 * resolver exposes only enabled dimensions; the adapter compiles SQL only
 * from catalog identifiers, never from model or user text.
 */
const object = { additionalProperties: false };
const identifier = Type.String({ pattern: "^[a-z_][a-z0-9_]{0,62}$" });
const catalogId = Type.String({ pattern: "^[a-z][a-z0-9_]{0,40}$" });
const isoDate = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const text = Type.String({ minLength: 1, maxLength: 1200 });

const columnSchema = Type.Object(
  {
    name: identifier,
    /** Native column type as discovered; the adapter's sync check compares it. */
    type: Type.String({ minLength: 1, maxLength: 80 }),
    nullable: Type.Boolean(),
  },
  object,
);

const entitySchema = Type.Object(
  {
    id: catalogId,
    table: Type.Object({ schema: identifier, name: identifier }, object),
    key: Type.Array(identifier, { minItems: 1 }),
    /** Human-readable label column, when the entity has one. */
    label: Type.Union([identifier, Type.Null()]),
    meaning: text,
    /** Only the columns the catalog relies on, with their discovered types. */
    columns: Type.Array(columnSchema, { minItems: 1 }),
    /**
     * Whether the runtime account may read the table, as verified on the
     * discovery date. An entity without access can be documented, never used.
     */
    access: Type.Union([Type.Literal("granted"), Type.Literal("not_granted")]),
    /** A registration-status column and the value that means active. */
    status: Type.Union([
      Type.Object(
        {
          column: identifier,
          active: Type.Union([Type.Integer(), Type.String({ maxLength: 80 })]),
          meaning: text,
        },
        object,
      ),
      Type.Null(),
    ]),
    /** Personal data: values are shown to authorized people, never to the model. */
    personalData: Type.Boolean(),
  },
  object,
);

const evidenceSchema = Type.Object(
  {
    /** The declared foreign key, or null for an undeclared relationship. */
    declared: Type.Union([
      Type.Object({ constraint: Type.String({ minLength: 1 }) }, object),
      Type.Null(),
    ]),
    /** Read-only data checks: date and non-sensitive outcomes. */
    validated: Type.Union([
      Type.Object(
        { on: isoDate, findings: Type.Array(text, { minItems: 1 }) },
        object,
      ),
      Type.Null(),
    ]),
    /** Existing queries that use the same path. */
    usage: Type.Array(text),
  },
  object,
);

export const relationshipStatusSchema = Type.Union([
  /** Declared constraint and data checks agree. */
  Type.Literal("verified"),
  /** Declared constraint, not checked against data. */
  Type.Literal("declared"),
  /** No constraint, but data checks and existing usage support it. */
  Type.Literal("validated"),
  /** Plausible from names or types only; never executable. */
  Type.Literal("hypothesis"),
  /** Investigated and not a product-filtering relationship. */
  Type.Literal("rejected"),
]);
export type RelationshipStatus = Static<typeof relationshipStatusSchema>;

const relationshipSchema = Type.Object(
  {
    id: catalogId,
    from: catalogId,
    to: catalogId,
    /** Column pairs: from-entity column = to-entity column. */
    join: Type.Array(
      Type.Object({ from: identifier, to: identifier }, object),
      {
        minItems: 1,
      },
    ),
    /** Constant conditions on the target rows, such as a hierarchy level. */
    where: Type.Array(
      Type.Object(
        {
          column: identifier,
          equals: Type.Union([Type.Integer(), Type.String({ maxLength: 80 })]),
        },
        object,
      ),
    ),
    /** Rows of `from` per row of `to`, read in the direction from → to. */
    cardinality: Type.Union([
      Type.Literal("many_to_one"),
      Type.Literal("one_to_many"),
    ]),
    /** Whether a `from` row may have no target row. */
    optional: Type.Boolean(),
    meaning: text,
    evidence: evidenceSchema,
    /** Native dictionary edge, independently reconciled with data and physical keys. */
    dictionary: Type.Optional(
      Type.Object({ origin: Type.Integer(), target: Type.Integer() }, object),
    ),
    status: relationshipStatusSchema,
    confidence: Type.Union([
      Type.Literal("high"),
      Type.Literal("medium"),
      Type.Literal("low"),
    ]),
  },
  object,
);

const hierarchySchema = Type.Object(
  {
    id: catalogId,
    entity: catalogId,
    levelColumn: identifier,
    /** Code columns from the top level down; deeper codes are 0 above a node's level. */
    codeColumns: Type.Array(identifier, { minItems: 1, maxItems: 8 }),
    /** Adjacency tree; codeColumns then holds its single primary key. */
    parentColumn: Type.Optional(identifier),
    meaning: text,
  },
  object,
);

export const dimensionKindSchema = Type.Union([
  /** Nodes of a hierarchy chosen among real catalog candidates. */
  Type.Literal("hierarchy"),
  /** Named records (people, cost centers, companies) matched by their names. */
  Type.Literal("entity"),
  /** A literal phrase of the product description. */
  Type.Literal("text"),
  /** A yes/no product attribute. */
  Type.Literal("flag"),
  /** Whether a related record with an active status exists (for example in a store). */
  Type.Literal("status"),
]);
export type DimensionKind = Static<typeof dimensionKindSchema>;

export const exposureSchema = Type.Union([
  Type.Literal("enabled"),
  /** Verified relationship whose table the runtime account cannot read. */
  Type.Literal("requires_grant"),
  /** Needs data checks or an owner decision before use. */
  Type.Literal("pending_validation"),
]);

const dimensionSchema = Type.Object(
  {
    id: catalogId,
    kind: dimensionKindSchema,
    /** Portuguese name shown to people and the model. */
    title: Type.String({ minLength: 1, maxLength: 60 }),
    /** Portuguese meaning for the model; never table or column names. */
    description: text,
    /** Portuguese words people use for the dimension itself. */
    synonyms: Type.Array(Type.String({ minLength: 1, maxLength: 60 })),
    /** Relationship ids from the root entity to the value entity. */
    path: Type.Array(catalogId),
    /** Entity whose records are the dimension's values (hierarchy, entity and status). */
    entity: Type.Union([catalogId, Type.Null()]),
    /** Hierarchy of the value entity; values include their descendants. */
    hierarchy: Type.Union([catalogId, Type.Null()]),
    /** Columns of the value entity (entity kind) or root (text, flag) used for matching. */
    columns: Type.Array(identifier),
    /** Reviewed dictionary values of a root attribute, resolved like named records. */
    domain: Type.Optional(
      Type.Array(
        Type.Object(
          {
            value: Type.String({ minLength: 1, maxLength: 80 }),
            label: Type.String({ minLength: 1, maxLength: 400 }),
          },
          object,
        ),
        { minItems: 1, maxItems: 100 },
      ),
    ),
    /** Stored true value for non-boolean ERP flags. */
    trueValue: Type.Optional(
      Type.Union([Type.String({ maxLength: 80 }), Type.Integer()]),
    ),
    /** Portuguese explanation of the business rule behind the path, shown with results. */
    interpretation: text,
    exposure: exposureSchema,
    /** What must happen before a non-enabled dimension can be used. */
    blocker: Type.Union([text, Type.Null()]),
  },
  object,
);

const conventionSchema = Type.Object(
  {
    id: catalogId,
    entity: catalogId,
    /** Case- and accent-insensitive regular expression over the label column. */
    pattern: Type.String({ minLength: 1, maxLength: 120 }),
    /** Portuguese label the model and people see beside matching values. */
    label: Type.String({ minLength: 1, maxLength: 60 }),
    meaning: text,
    evidence: text,
  },
  object,
);

export const catalogSchema = Type.Object(
  {
    id: catalogId,
    /** Changes with every reviewed edit; recorded with results and traces. */
    version: Type.String({
      pattern: "^[a-z0-9-]+/\\d{4}-\\d{2}-\\d{2}\\.\\d+$",
    }),
    source: Type.Object(
      {
        id: catalogId,
        engine: Type.Union([
          Type.Literal("postgresql"),
          Type.Literal("oracle"),
        ]),
        title: Type.String({ minLength: 1, maxLength: 60 }),
      },
      object,
    ),
    discovery: Type.Object({ verifiedOn: isoDate, method: text }, object),
    /** The entity the resolver returns (the product). */
    root: catalogId,
    entities: Type.Array(entitySchema, { minItems: 1 }),
    relationships: Type.Array(relationshipSchema),
    hierarchies: Type.Array(hierarchySchema),
    dimensions: Type.Array(dimensionSchema, { minItems: 1 }),
    conventions: Type.Array(conventionSchema),
  },
  object,
);

export type SemanticCatalog = Static<typeof catalogSchema>;
export type CatalogEntity = SemanticCatalog["entities"][number];
export type CatalogRelationship = SemanticCatalog["relationships"][number];
export type CatalogHierarchy = SemanticCatalog["hierarchies"][number];
export type CatalogDimension = SemanticCatalog["dimensions"][number];
export type CatalogConvention = SemanticCatalog["conventions"][number];

/** Relationship states that may carry executable product filters. */
const executable: readonly RelationshipStatus[] = ["verified", "validated"];

/**
 * Structural and semantic integrity of a catalog. A catalog with any problem
 * is never used: identifiers come only from here, so their validity is a
 * precondition of every compiled statement.
 */
export function catalogProblems(candidate: unknown): string[] {
  if (!Value.Check(catalogSchema, candidate))
    return [...Value.Errors(catalogSchema, candidate)]
      .slice(0, 10)
      .map((error) => `schema ${error.instancePath}: ${error.message}`);
  const catalog = candidate;
  const problems: string[] = [];
  const unique = (kind: string, ids: readonly string[]) => {
    const seen = new Set<string>();
    for (const id of ids)
      if (seen.has(id)) problems.push(`${kind} ${id} is duplicated`);
      else seen.add(id);
  };
  unique(
    "entity",
    catalog.entities.map((item) => item.id),
  );
  unique(
    "relationship",
    catalog.relationships.map((item) => item.id),
  );
  unique(
    "hierarchy",
    catalog.hierarchies.map((item) => item.id),
  );
  unique(
    "dimension",
    catalog.dimensions.map((item) => item.id),
  );
  unique(
    "convention",
    catalog.conventions.map((item) => item.id),
  );
  const entities = new Map(catalog.entities.map((item) => [item.id, item]));
  const relationships = new Map(
    catalog.relationships.map((item) => [item.id, item]),
  );
  const hierarchies = new Map(
    catalog.hierarchies.map((item) => [item.id, item]),
  );
  const hasColumn = (entity: CatalogEntity, column: string) =>
    entity.columns.some((item) => item.name === column);
  const root = entities.get(catalog.root);
  if (!root) problems.push(`root ${catalog.root} is not an entity`);
  for (const entity of catalog.entities) {
    for (const column of [
      ...entity.key,
      ...(entity.label ? [entity.label] : []),
      ...(entity.status ? [entity.status.column] : []),
    ])
      if (!hasColumn(entity, column))
        problems.push(`entity ${entity.id} does not list column ${column}`);
  }
  for (const relationship of catalog.relationships) {
    const from = entities.get(relationship.from);
    const to = entities.get(relationship.to);
    if (!from || !to) {
      problems.push(`relationship ${relationship.id} names an unknown entity`);
      continue;
    }
    for (const pair of relationship.join) {
      if (!hasColumn(from, pair.from))
        problems.push(
          `relationship ${relationship.id} uses unknown ${from.id}.${pair.from}`,
        );
      if (!hasColumn(to, pair.to))
        problems.push(
          `relationship ${relationship.id} uses unknown ${to.id}.${pair.to}`,
        );
    }
    for (const condition of relationship.where)
      if (!hasColumn(to, condition.column))
        problems.push(
          `relationship ${relationship.id} filters unknown ${to.id}.${condition.column}`,
        );
    if (relationship.status === "verified" && !relationship.evidence.declared)
      problems.push(
        `relationship ${relationship.id} is verified without a constraint`,
      );
    if (
      (relationship.status === "verified" ||
        relationship.status === "validated") &&
      !relationship.evidence.validated
    )
      problems.push(
        `relationship ${relationship.id} lacks its data validation`,
      );
  }
  for (const hierarchy of catalog.hierarchies) {
    const entity = entities.get(hierarchy.entity);
    if (!entity) {
      problems.push(`hierarchy ${hierarchy.id} names an unknown entity`);
      continue;
    }
    for (const column of [
      hierarchy.levelColumn,
      ...hierarchy.codeColumns,
      ...(hierarchy.parentColumn ? [hierarchy.parentColumn] : []),
    ])
      if (!hasColumn(entity, column))
        problems.push(
          `hierarchy ${hierarchy.id} uses unknown column ${column}`,
        );
    if (
      hierarchy.parentColumn &&
      (hierarchy.codeColumns.length !== 1 ||
        entity.key.length !== 1 ||
        hierarchy.codeColumns[0] !== entity.key[0])
    )
      problems.push(`hierarchy ${hierarchy.id} needs a single adjacency key`);
  }
  for (const convention of catalog.conventions) {
    const entity = entities.get(convention.entity);
    if (!entity?.label)
      problems.push(`convention ${convention.id} needs a labeled entity`);
    try {
      new RegExp(convention.pattern, "u");
    } catch {
      problems.push(`convention ${convention.id} has an invalid pattern`);
    }
  }
  for (const dimension of catalog.dimensions) {
    const where = `dimension ${dimension.id}`;
    if (dimension.domain) {
      if (
        dimension.kind !== "entity" ||
        dimension.entity !== catalog.root ||
        dimension.path.length !== 0 ||
        dimension.columns.length !== 1 ||
        dimension.hierarchy !== null
      )
        problems.push(`${where} domain must read one root attribute`);
      unique(
        `${where} domain value`,
        dimension.domain.map((value) => value.value),
      );
    }
    if (dimension.trueValue !== undefined && dimension.kind !== "flag")
      problems.push(`${where} true value requires a flag`);
    // The path must be a chain that starts at the root entity.
    let current = catalog.root;
    for (const id of dimension.path) {
      const relationship = relationships.get(id);
      if (!relationship) {
        problems.push(`${where} uses unknown relationship ${id}`);
        break;
      }
      if (relationship.from !== current)
        problems.push(`${where} path breaks at ${id}`);
      current = relationship.to;
    }
    const valueEntity =
      dimension.kind === "text" || dimension.kind === "flag"
        ? catalog.root
        : dimension.entity;
    if (valueEntity === null || current !== valueEntity)
      problems.push(`${where} path does not end at its value entity`);
    if (
      dimension.kind === "hierarchy" &&
      (dimension.hierarchy === null || dimension.path.length !== 1)
    )
      problems.push(
        `${where}: a hierarchy dimension has its hierarchy and one relationship`,
      );
    if (
      (dimension.kind === "text" || dimension.kind === "flag") &&
      (dimension.hierarchy !== null || dimension.entity !== null)
    )
      problems.push(`${where}: a ${dimension.kind} dimension reads the root`);
    if (dimension.hierarchy !== null) {
      const hierarchy = hierarchies.get(dimension.hierarchy);
      if (!hierarchy || hierarchy.entity !== dimension.entity)
        problems.push(`${where} names a hierarchy of another entity`);
    }
    if (dimension.kind === "hierarchy") {
      const relationship = relationships.get(dimension.path[0] ?? "");
      const hierarchy = hierarchies.get(dimension.hierarchy ?? "");
      if (
        relationship &&
        hierarchy &&
        relationship.join.map((pair) => pair.to).join() !==
          hierarchy.codeColumns.join()
      )
        problems.push(`${where} must join every hierarchy code column`);
    }
    const columnsOf = entities.get(valueEntity ?? "");
    for (const column of dimension.columns)
      if (!columnsOf || !hasColumn(columnsOf, column))
        problems.push(`${where} matches unknown column ${column}`);
    if (
      (dimension.kind === "text" || dimension.kind === "flag") &&
      dimension.columns.length !== 1
    )
      problems.push(`${where} needs exactly one column`);
    if (dimension.kind === "entity" && dimension.columns.length === 0)
      problems.push(`${where} needs a column to match names`);
    if (
      dimension.kind === "status" &&
      (dimension.columns.length !== 0 ||
        !entities.get(dimension.entity ?? "")?.status)
    )
      problems.push(`${where} needs an entity with a registration status`);
    if (dimension.exposure === "enabled") {
      if (dimension.blocker !== null)
        problems.push(`${where} is enabled with a blocker`);
      for (const id of dimension.path) {
        const relationship = relationships.get(id);
        if (relationship && !executable.includes(relationship.status))
          problems.push(
            `${where} is enabled through ${relationship.status} ${id}`,
          );
        const target = relationship ? entities.get(relationship.to) : undefined;
        if (target && target.access !== "granted")
          problems.push(`${where} is enabled through unreadable ${target.id}`);
      }
      if (root && root.access !== "granted")
        problems.push(`${where} is enabled on an unreadable root`);
    } else if (dimension.blocker === null)
      problems.push(`${where} is not enabled and states no blocker`);
  }
  return problems;
}

/** Validates once; a broken catalog stops the capability from starting. */
export function loadCatalog(candidate: unknown): SemanticCatalog {
  const problems = catalogProblems(candidate);
  if (problems.length > 0)
    throw new Error(`Invalid semantic catalog: ${problems.join("; ")}`);
  return candidate as SemanticCatalog;
}

export function enabledDimensions(
  catalog: SemanticCatalog,
): readonly CatalogDimension[] {
  return catalog.dimensions.filter(
    (dimension) => dimension.exposure === "enabled",
  );
}

export function entityOf(catalog: SemanticCatalog, id: string): CatalogEntity {
  const entity = catalog.entities.find((item) => item.id === id);
  if (!entity) throw new Error(`Unknown catalog entity ${id}`);
  return entity;
}

export function relationshipOf(
  catalog: SemanticCatalog,
  id: string,
): CatalogRelationship {
  const relationship = catalog.relationships.find((item) => item.id === id);
  if (!relationship) throw new Error(`Unknown catalog relationship ${id}`);
  return relationship;
}

export function hierarchyOf(
  catalog: SemanticCatalog,
  id: string,
): CatalogHierarchy {
  const hierarchy = catalog.hierarchies.find((item) => item.id === id);
  if (!hierarchy) throw new Error(`Unknown catalog hierarchy ${id}`);
  return hierarchy;
}

/**
 * The entities and columns enabled dimensions need. Their existence, type,
 * nullability and the runtime account's SELECT privilege are verified before
 * the first statement, so a changed ERP schema fails closed.
 */
export function requiredColumns(
  catalog: SemanticCatalog,
): ReadonlyMap<string, readonly CatalogEntity["columns"][number][]> {
  const required = new Map<
    string,
    Map<string, CatalogEntity["columns"][number]>
  >();
  const add = (entity: CatalogEntity, columns: readonly string[]) => {
    const table = `${entity.table.schema}.${entity.table.name}`;
    const entry =
      required.get(table) ??
      new Map<string, CatalogEntity["columns"][number]>();
    for (const name of columns) {
      const column = entity.columns.find((item) => item.name === name);
      if (column) entry.set(name, column);
    }
    required.set(table, entry);
  };
  const root = entityOf(catalog, catalog.root);
  add(root, [...root.key, ...(root.label ? [root.label] : [])]);
  for (const dimension of enabledDimensions(catalog)) {
    if (dimension.kind === "text" || dimension.kind === "flag")
      add(root, dimension.columns);
    for (const id of dimension.path) {
      const relationship = relationshipOf(catalog, id);
      add(
        entityOf(catalog, relationship.from),
        relationship.join.map((pair) => pair.from),
      );
      const target = entityOf(catalog, relationship.to);
      add(target, [
        ...relationship.join.map((pair) => pair.to),
        ...relationship.where.map((condition) => condition.column),
      ]);
    }
    if (dimension.entity) {
      const entity = entityOf(catalog, dimension.entity);
      add(entity, [
        ...entity.key,
        ...(entity.label ? [entity.label] : []),
        ...(entity.status ? [entity.status.column] : []),
        ...(dimension.kind === "entity" ? dimension.columns : []),
      ]);
    }
    if (dimension.hierarchy) {
      const hierarchy = hierarchyOf(catalog, dimension.hierarchy);
      add(entityOf(catalog, hierarchy.entity), [
        hierarchy.levelColumn,
        ...hierarchy.codeColumns,
        ...(hierarchy.parentColumn ? [hierarchy.parentColumn] : []),
      ]);
    }
  }
  return new Map(
    [...required].map(([table, columns]) => [table, [...columns.values()]]),
  );
}
