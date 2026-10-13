import { Type, type Static, type TSchema } from "typebox";
import type { SemanticCatalog } from "./catalog.js";

const object = { additionalProperties: false };
const nullable = <T extends TSchema>(schema: T) =>
  Type.Union([schema, Type.Null()]);

export const maxCriteria = 6;
export const maxSearchTerms = 5;
export const maxCandidates = 60;
export const maxOptions = 4;

/**
 * The model's structured reading of one product request: which catalog
 * dimensions it names, with the words the person wrote. The dimension ids
 * are generated from the catalog, so the model can only choose real
 * capabilities; values are resolved against ERP records by the application.
 */
export function interpretationSchema(catalog: SemanticCatalog) {
  const ids = catalog.dimensions.map((dimension) => dimension.id);
  return Type.Object(
    {
      decision: Type.Union([
        Type.Literal("resolve"),
        Type.Literal("clarify"),
        Type.Literal("unsupported"),
      ]),
      relation: Type.Union([
        Type.Literal("new"),
        Type.Literal("refine"),
        Type.Literal("answer_pending"),
      ]),
      /** Number of the option chosen from the pending question, if any. */
      choice: nullable(Type.Integer({ minimum: 1, maximum: 20 })),
      criteria: Type.Array(
        Type.Object(
          {
            // Generated from the catalog; the application checks the id again.
            dimension: Type.Unsafe<string>(
              Type.Union(ids.map((id) => Type.Literal(id))),
            ),
            mode: Type.Union([
              Type.Literal("include"),
              Type.Literal("exclude"),
            ]),
            /** The words the person wrote for the value. */
            text: Type.String({ minLength: 1, maxLength: 120 }),
            /** Words that qualify a category, such as "fruta" or "industrializado". */
            qualifier: nullable(Type.String({ minLength: 1, maxLength: 120 })),
            /** Alternative words to look the category up (synonyms, singulars, ERP abbreviations). */
            searchTerms: Type.Array(
              Type.String({ minLength: 2, maxLength: 60 }),
              { maxItems: maxSearchTerms },
            ),
          },
          object,
        ),
        { maxItems: maxCriteria },
      ),
      unsupportedReason: nullable(
        Type.Union([
          Type.Literal("sales_or_metrics"),
          Type.Literal("action"),
          Type.Literal("other_data"),
        ]),
      ),
    },
    object,
  );
}
export type ProductInterpretation = Static<
  ReturnType<typeof interpretationSchema>
>;
export type RequestedCriterion = ProductInterpretation["criteria"][number];

export function interpretationIssues(value: ProductInterpretation): string[] {
  const issues: string[] = [];
  if ((value.decision === "unsupported") !== (value.unsupportedReason !== null))
    issues.push("unsupported_reason_mismatch");
  if (value.choice !== null && value.relation !== "answer_pending")
    issues.push("choice_without_pending");
  return issues;
}

/** The model's choice among numbered candidate nodes of one criterion. */
export const selectionChoiceSchema = Type.Object(
  {
    decision: Type.Union([
      Type.Literal("select"),
      Type.Literal("ambiguous"),
      Type.Literal("none"),
    ]),
    include: Type.Array(Type.Integer({ minimum: 1, maximum: maxCandidates }), {
      maxItems: maxCandidates,
    }),
    exclude: Type.Array(Type.Integer({ minimum: 1, maximum: maxCandidates }), {
      maxItems: maxCandidates,
    }),
    /** Every product whose description contains the words. */
    allText: Type.Boolean(),
    alternatives: Type.Array(
      Type.Object(
        {
          include: Type.Array(
            Type.Integer({ minimum: 1, maximum: maxCandidates }),
            { maxItems: maxCandidates },
          ),
          exclude: Type.Array(
            Type.Integer({ minimum: 1, maximum: maxCandidates }),
            { maxItems: maxCandidates },
          ),
          allText: Type.Boolean(),
        },
        object,
      ),
      { maxItems: maxOptions },
    ),
  },
  object,
);
export type SelectionChoice = Static<typeof selectionChoiceSchema>;

export function selectionIssues(
  value: SelectionChoice,
  candidates: number,
): string[] {
  const issues: string[] = [];
  const references = [
    ...value.include,
    ...value.exclude,
    ...value.alternatives.flatMap((item) => [...item.include, ...item.exclude]),
  ];
  if (references.some((reference) => reference > candidates))
    issues.push("unknown_candidate");
  const empty = (item: { include: readonly number[]; allText: boolean }) =>
    item.include.length === 0 && !item.allText;
  if (
    value.decision === "select" &&
    (empty(value) || value.alternatives.length)
  )
    issues.push("select_mismatch");
  if (
    value.decision === "ambiguous" &&
    (value.alternatives.length < 2 || value.alternatives.some(empty))
  )
    issues.push("ambiguous_mismatch");
  if (
    value.decision === "none" &&
    (!empty(value) || value.exclude.length || value.alternatives.length)
  )
    issues.push("none_mismatch");
  return issues;
}
