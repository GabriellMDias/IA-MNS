import { Type, type Static, type TSchema } from "typebox";
import { Value } from "typebox/value";
import { resolvedCriterionSchema, selectionSchema } from "./selection.js";

const object = { additionalProperties: false };
const nullable = <T extends TSchema>(schema: T) =>
  Type.Union([schema, Type.Null()]);

/** A criterion as the model read it, kept until the application resolves it. */
export const requestedCriterionSchema = Type.Object(
  {
    dimension: Type.String({ minLength: 1, maxLength: 41 }),
    mode: Type.Union([Type.Literal("include"), Type.Literal("exclude")]),
    text: Type.String({ minLength: 1, maxLength: 120 }),
    qualifier: nullable(Type.String({ minLength: 1, maxLength: 120 })),
    searchTerms: Type.Array(Type.String({ minLength: 2, maxLength: 60 }), {
      maxItems: 5,
    }),
  },
  object,
);
export type StoredRequest = Static<typeof requestedCriterionSchema>;

export const optionSchema = Type.Object(
  {
    label: Type.String({ minLength: 1, maxLength: 600 }),
    /** Whether the label is personal data, which is never sent to the model. */
    personal: Type.Boolean(),
    criterion: resolvedCriterionSchema,
  },
  object,
);
export type ProductOption = Static<typeof optionSchema>;

/**
 * Product lookup conversation state (version 1): the last executed selection,
 * an unanswered question with the work it interrupts, and recent exchanges.
 */
export const productStateSchema = Type.Object(
  {
    version: Type.Literal(1),
    active: nullable(selectionSchema),
    pending: nullable(
      Type.Object(
        {
          /** choice: an option number or name; product: another wording. */
          awaiting: Type.Union([
            Type.Literal("choice"),
            Type.Literal("product"),
          ]),
          /** The criterion the question is about, as requested. */
          asked: requestedCriterionSchema,
          resolved: Type.Array(resolvedCriterionSchema, { maxItems: 8 }),
          remaining: Type.Array(requestedCriterionSchema, { maxItems: 6 }),
          options: Type.Array(optionSchema, { maxItems: 16 }),
        },
        object,
      ),
    ),
    transcript: Type.Array(
      Type.Object(
        {
          user: Type.String({ maxLength: 2000 }),
          reply: Type.Union([
            Type.Literal("answer"),
            Type.Literal("clarification"),
            Type.Literal("unsupported"),
          ]),
          /** Application text; for answers a description of the filters only. */
          text: Type.String({ maxLength: 4000 }),
        },
        object,
      ),
      { maxItems: 12 },
    ),
  },
  object,
);
export type ProductState = Static<typeof productStateSchema>;
export type PendingQuestion = NonNullable<ProductState["pending"]>;

export const emptyProductState: ProductState = {
  version: 1,
  active: null,
  pending: null,
  transcript: [],
};

/** Stored context, or an empty state when it is absent or not trusted. */
export function loadProductState(saved: unknown): ProductState {
  return Value.Check(productStateSchema, saved)
    ? structuredClone(saved)
    : structuredClone(emptyProductState);
}

export function withExchange(
  state: ProductState,
  exchange: ProductState["transcript"][number],
): ProductState["transcript"] {
  return [
    ...state.transcript,
    {
      user: exchange.user.slice(0, 2000),
      reply: exchange.reply,
      text: exchange.text.slice(0, 4000),
    },
  ].slice(-12);
}
