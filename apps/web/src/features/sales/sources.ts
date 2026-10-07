import type { paths } from "@ia-mns/sdk";

type TurnBody = NonNullable<
  paths["/agent/conversations/{conversationId}/turns"]["post"]["requestBody"]
>["content"]["application/json"];
/** The person's explicit sales source; the message text never changes it. */
export type SalesSourceSelection = NonNullable<TurnBody["source"]>;
export type SalesSource = Exclude<SalesSourceSelection, "all">;

export const sourceLabels: Readonly<Record<SalesSourceSelection, string>> = {
  sankhya: "MNS (Sankhya)",
  vrmaster: "Pilar da Terra (VR Master)",
  all: "Tudo",
};
/** The selector's options, in the order the product defines. */
export const sourceOptions: readonly SalesSourceSelection[] = [
  "sankhya",
  "vrmaster",
  "all",
];
