import type { paths } from "@ia-mns/sdk";

type AgentTurnReply = NonNullable<
  paths["/agent/conversations/{conversationId}"]["get"]["responses"][200]["content"]["application/json"]["turns"][number]["reply"]
>;
type AgentResult = NonNullable<AgentTurnReply["result"]>;

/** Products of a lookup with the interpretation that selected them. */
export type ProductAnswer = Extract<AgentResult, { kind: "products" }>;
/** Numbered choices of a product clarification. */
export type ProductOptions = Extract<AgentResult, { kind: "product_options" }>;

/** Product results carry a kind; sales answers do not. */
export function isProductResult(
  result: AgentResult,
): result is ProductAnswer | ProductOptions {
  return "kind" in result;
}
