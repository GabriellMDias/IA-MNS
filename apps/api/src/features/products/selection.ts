import { Type, type Static } from "typebox";

/**
 * A validated, ERP-neutral product selection: every value is a record the
 * source returned (node and record ids with their labels) or a bounded
 * literal. Adapters compile it with catalog identifiers only; nothing in it
 * is SQL. Criteria are combined with AND; the values of one criterion with OR.
 */
const object = { additionalProperties: false };
const mode = Type.Union([Type.Literal("include"), Type.Literal("exclude")]);
const label = Type.String({ minLength: 1, maxLength: 400 });
const userText = Type.String({ minLength: 1, maxLength: 120 });
const recordId = Type.Integer({ minimum: -2147483648, maximum: 2147483647 });

export const hierarchyNodeSchema = Type.Object(
  {
    id: recordId,
    level: Type.Integer({ minimum: 1, maximum: 8 }),
    codes: Type.Array(Type.Integer(), { minItems: 1, maxItems: 8 }),
    /** Labels from the top level down to the node. */
    path: Type.Array(label, { minItems: 1, maxItems: 8 }),
    /** Catalog conventions whose pattern matches a label of the path. */
    conventions: Type.Array(Type.String({ maxLength: 41 }), { maxItems: 8 }),
  },
  object,
);
export type HierarchyNode = Static<typeof hierarchyNodeSchema>;

export const nodeChoiceSchema = Type.Object(
  {
    node: hierarchyNodeSchema,
    /**
     * subtree: every product under the node. matching_text: only those whose
     * description also contains a criterion term (a node found through its
     * products rather than its name).
     */
    scope: Type.Union([Type.Literal("subtree"), Type.Literal("matching_text")]),
  },
  object,
);
export type NodeChoice = Static<typeof nodeChoiceSchema>;

export const recordValueSchema = Type.Object(
  {
    id: Type.Union([recordId, Type.String({ minLength: 1, maxLength: 80 })]),
    label: label,
    /** Registration status when the entity has one. */
    active: Type.Union([Type.Boolean(), Type.Null()]),
  },
  object,
);
export type RecordValue = Static<typeof recordValueSchema>;

export const resolvedCriterionSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("hierarchy"),
      dimension: Type.String({ maxLength: 41 }),
      mode,
      text: userText,
      qualifier: Type.Union([userText, Type.Null()]),
      include: Type.Array(nodeChoiceSchema, { maxItems: 60 }),
      /** Also every product whose description contains a term, in any node. */
      anywhere: Type.Boolean(),
      exclude: Type.Array(hierarchyNodeSchema, { maxItems: 60 }),
      /** Search terms of matching_text and anywhere (plural-tolerant whole words). */
      terms: Type.Array(Type.String({ minLength: 1, maxLength: 120 }), {
        minItems: 1,
        maxItems: 6,
      }),
    },
    object,
  ),
  Type.Object(
    {
      kind: Type.Literal("entity"),
      dimension: Type.String({ maxLength: 41 }),
      mode,
      text: userText,
      /** The matched records. */
      matched: Type.Array(recordValueSchema, { minItems: 1, maxItems: 20 }),
      /** Matched records plus their hierarchy descendants: what is filtered. */
      values: Type.Array(recordValueSchema, { minItems: 1, maxItems: 200 }),
    },
    object,
  ),
  Type.Object(
    {
      kind: Type.Literal("text"),
      dimension: Type.String({ maxLength: 41 }),
      mode,
      text: userText,
      phrase: Type.String({ minLength: 1, maxLength: 120 }),
    },
    object,
  ),
  Type.Object(
    {
      kind: Type.Literal("flag"),
      dimension: Type.String({ maxLength: 41 }),
      mode,
      text: userText,
    },
    object,
  ),
  Type.Object(
    {
      kind: Type.Literal("status"),
      dimension: Type.String({ maxLength: 41 }),
      mode,
      text: userText,
    },
    object,
  ),
]);
export type ResolvedCriterion = Static<typeof resolvedCriterionSchema>;

export const selectionSchema = Type.Object(
  {
    criteria: Type.Array(resolvedCriterionSchema, { minItems: 1, maxItems: 8 }),
  },
  object,
);
export type ProductSelection = Static<typeof selectionSchema>;

/** One product of a result; the classification is the node path labels. */
export type ProductRow = Readonly<{
  code: string;
  description: string;
  classification: string;
}>;

export type ProductPage = Readonly<{
  total: number;
  products: readonly ProductRow[];
  /** Product counts per top-level hierarchy node, largest first. */
  sections: readonly Readonly<{ label: string; count: number }>[];
}>;

export const pathText = (path: readonly string[]) => path.join(" › ");

/** Whether `node` is `ancestor` or below it. */
export function within(node: HierarchyNode, ancestor: HierarchyNode): boolean {
  return (
    node.level >= ancestor.level &&
    ancestor.codes
      .slice(0, ancestor.level)
      .every((code, index) => node.codes[index] === code)
  );
}
