import { Type, type Static } from "typebox";

const object = { additionalProperties: false };

/** Product sources with a semantic catalog. */
export const productSourceSchema = Type.Union([
  Type.Literal("vrmaster"),
  Type.Literal("sankhya"),
]);

/**
 * Validated products of a lookup with the interpretation that produced them:
 * every criterion with the records or classification paths it resolved to
 * and the business rule of its relationship. Rows come from the ERP; no text
 * here is model-authored.
 */
export const productAnswerSchema = Type.Object(
  {
    kind: Type.Literal("products"),
    source: productSourceSchema,
    catalogVersion: Type.String({ maxLength: 80 }),
    total: Type.Integer({ minimum: 0 }),
    products: Type.Array(
      Type.Object(
        {
          code: Type.String({ maxLength: 20 }),
          description: Type.String({ maxLength: 200 }),
          classification: Type.String({ maxLength: 600 }),
        },
        object,
      ),
      { maxItems: 200 },
    ),
    criteria: Type.Array(
      Type.Object(
        {
          dimension: Type.String({ maxLength: 41 }),
          title: Type.String({ maxLength: 60 }),
          mode: Type.Union([Type.Literal("include"), Type.Literal("exclude")]),
          text: Type.String({ maxLength: 120 }),
          values: Type.Array(Type.String({ maxLength: 600 }), {
            maxItems: 61,
          }),
          excluded: Type.Array(Type.String({ maxLength: 600 }), {
            maxItems: 60,
          }),
          interpretation: Type.String({ maxLength: 1200 }),
        },
        object,
      ),
      { maxItems: 8 },
    ),
    sections: Type.Array(
      Type.Object(
        {
          label: Type.String({ maxLength: 80 }),
          count: Type.Integer({ minimum: 1 }),
        },
        object,
      ),
      { maxItems: 25 },
    ),
    notes: Type.Array(Type.String({ maxLength: 600 }), { maxItems: 8 }),
  },
  object,
);
export type ProductAnswer = Static<typeof productAnswerSchema>;

/** Numbered choices of a clarification; labels may hold personal data. */
export const productOptionsSchema = Type.Object(
  {
    kind: Type.Literal("product_options"),
    source: productSourceSchema,
    title: Type.String({ maxLength: 60 }),
    text: Type.String({ maxLength: 120 }),
    options: Type.Array(
      Type.Object(
        {
          number: Type.Integer({ minimum: 1, maximum: 16 }),
          label: Type.String({ maxLength: 600 }),
        },
        object,
      ),
      { minItems: 1, maxItems: 16 },
    ),
  },
  object,
);
export type ProductOptions = Static<typeof productOptionsSchema>;
