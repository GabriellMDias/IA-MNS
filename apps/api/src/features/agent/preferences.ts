import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
export const presentationPreferencesSchema = Type.Object(
  {
    language: Type.Union([
      Type.Literal("auto"),
      Type.Literal("pt-BR"),
      Type.Literal("en"),
      Type.Literal("es"),
    ]),
    detail: Type.Union([
      Type.Literal("auto"),
      Type.Literal("concise"),
      Type.Literal("detailed"),
    ]),
    format: Type.Union([
      Type.Literal("auto"),
      Type.Literal("prose"),
      Type.Literal("bullets"),
    ]),
  },
  { additionalProperties: false },
);
export type PresentationPreferences = Static<
  typeof presentationPreferencesSchema
>;
export const defaultPreferences: PresentationPreferences = {
  language: "auto",
  detail: "auto",
  format: "auto",
};
export function loadPreferences(
  contexts: Readonly<Record<string, unknown>>,
): PresentationPreferences {
  return Value.Check(presentationPreferencesSchema, contexts._preferences)
    ? contexts._preferences
    : defaultPreferences;
}
