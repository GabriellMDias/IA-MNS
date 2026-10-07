import type { paths } from "@ia-mns/sdk";
import { apiClient, unwrap } from "../../api-client.js";

export type SalesReply =
  paths["/sales/chat"]["post"]["responses"][200]["content"]["application/json"];
export type SalesResult = NonNullable<SalesReply["result"]>;
type AgentTurnReply = NonNullable<
  paths["/agent/conversations/{conversationId}"]["get"]["responses"][200]["content"]["application/json"]["turns"][number]["reply"]
>;
/** One section per queried source, each with its own result; never summed. */
export type SalesAnswer = NonNullable<AgentTurnReply["result"]>;
const codes = new Set([
  "SALES_ACCESS_DENIED",
  "SALES_NOT_CONFIGURED",
  "SALES_PROVIDER_UNAVAILABLE",
  "SALES_QUERY_INVALID",
  "SALES_RESULT_TOO_LARGE",
  "SALES_CONVERSATION_EXPIRED",
  "SALES_CONVERSATION_BUSY",
]);
const headers = { "x-ia-mns-client": "web" };
export async function getSalesStatus(signal: AbortSignal) {
  return unwrap(await apiClient().GET("/sales/status", { signal }));
}
export async function askSales(
  token: string | null,
  message: string,
  conversationId?: string,
): Promise<SalesReply> {
  return unwrap(
    await apiClient(token).POST("/sales/chat", {
      headers,
      body: { message, ...(conversationId ? { conversationId } : {}) },
      signal: AbortSignal.timeout(95000),
    }),
    codes,
  );
}
export async function forgetConversation(
  token: string | null,
  conversationId: string,
) {
  return unwrap(
    await apiClient(token).DELETE("/sales/conversations/{conversationId}", {
      headers,
      params: { path: { conversationId } },
      signal: AbortSignal.timeout(10000),
    }),
    codes,
  );
}
