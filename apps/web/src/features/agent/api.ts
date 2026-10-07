import type { paths } from "@ia-mns/sdk";
import { apiClient, unwrap } from "../../api-client.js";
import type { SalesSourceSelection } from "../sales/sources.js";
const headers = { "x-ia-mns-client": "web" };
const codes = new Set([
  "AGENT_NOT_CONFIGURED",
  "AGENT_CONVERSATION_NOT_FOUND",
  "AGENT_CONVERSATION_BUSY",
  "AGENT_REQUEST_CONFLICT",
  "AGENT_ACCESS_DENIED",
  "AGENT_PROVIDER_UNAVAILABLE",
  "AGENT_CONVERSATION_ARCHIVED",
]);
export type ConversationDetail =
  paths["/agent/conversations/{conversationId}"]["get"]["responses"][200]["content"]["application/json"];
export type AgentTurn = ConversationDetail["turns"][number];
export type Conversation = ConversationDetail["conversation"];
export type ConversationScope = "active" | "pinned" | "archived";
export type ConversationPatch = {
  title?: string;
  pinned?: boolean;
  archived?: boolean;
};
export async function getAgentStatus(signal: AbortSignal) {
  return unwrap(await apiClient().GET("/agent/status", { signal }));
}
export async function listConversations(
  token: string | null,
  cursor: string | undefined,
  signal: AbortSignal,
  scope: ConversationScope = "active",
) {
  return unwrap(
    await apiClient(token).GET("/agent/conversations", {
      headers,
      params: { query: { scope, ...(cursor ? { cursor } : {}) } },
      signal,
    }),
    codes,
  );
}
export async function updateConversation(
  token: string | null,
  id: string,
  body: ConversationPatch,
) {
  return unwrap(
    await apiClient(token).PATCH("/agent/conversations/{conversationId}", {
      headers,
      params: { path: { conversationId: id } },
      body,
      signal: AbortSignal.timeout(10000),
    }),
    codes,
  );
}
export async function searchConversations(
  token: string | null,
  query: string,
  cursor: string | undefined,
  signal: AbortSignal,
) {
  return unwrap(
    await apiClient(token).POST("/agent/conversations/search", {
      headers,
      body: { query, ...(cursor ? { cursor } : {}) },
      signal,
    }),
    codes,
  );
}
export async function getConversation(
  token: string | null,
  conversationId: string,
  beforeSequence: number | undefined,
  signal: AbortSignal,
) {
  return unwrap(
    await apiClient(token).GET("/agent/conversations/{conversationId}", {
      headers,
      params: {
        path: { conversationId },
        ...(beforeSequence ? { query: { beforeSequence } } : {}),
      },
      signal,
    }),
    codes,
  );
}
export async function createConversation(token: string | null) {
  return unwrap(
    await apiClient(token).POST("/agent/conversations", {
      headers,
      body: {},
      signal: AbortSignal.timeout(10000),
    }),
    codes,
  );
}
export async function submitTurn(
  token: string | null,
  conversationId: string,
  message: string,
  requestId: string,
  source: SalesSourceSelection,
) {
  return unwrap(
    await apiClient(token).POST("/agent/conversations/{conversationId}/turns", {
      headers,
      params: { path: { conversationId } },
      body: { message, requestId, source },
      signal: AbortSignal.timeout(10000),
    }),
    codes,
  );
}
export async function deleteConversation(
  token: string | null,
  conversationId: string,
) {
  return unwrap(
    await apiClient(token).DELETE("/agent/conversations/{conversationId}", {
      headers,
      params: { path: { conversationId } },
      signal: AbortSignal.timeout(10000),
    }),
    codes,
  );
}
