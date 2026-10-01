import type { paths } from "@orion/sdk";
import { apiClient, unwrap } from "../api-client.js";

export type ApprovalRequest =
  paths["/approval-requests/{id}"]["get"]["responses"][200]["content"]["application/json"];
export type ApprovalPage =
  paths["/approval-requests"]["get"]["responses"][200]["content"]["application/json"];
export type Scope = "mine" | "reviewable";

// Stable codes this module publishes beyond the shared runtime's codes.
const approvalCodes: ReadonlySet<string> = new Set([
  "PERMISSION_DENIED",
  "APPROVAL_REQUEST_INVALID_STATE",
  "RESOURCE_VERSION_CONFLICT",
  "IDEMPOTENCY_KEY_REUSED",
]);

export const approvalMessages: Readonly<Record<string, string>> = {
  PERMISSION_DENIED: "You do not have permission for this action.",
  RESOURCE_VERSION_CONFLICT:
    "This request changed. Reload it before trying again.",
  APPROVAL_REQUEST_INVALID_STATE:
    "This action is no longer allowed in the current state.",
};

function approvalUnwrap<T>(result: Parameters<typeof unwrap<T>>[0]): T {
  return unwrap(result, approvalCodes);
}

export function approvalApi(token: string) {
  const client = apiClient(token);
  return {
    async list(scope: Scope, cursor?: string) {
      return approvalUnwrap<ApprovalPage>(
        await client.GET("/approval-requests", {
          params: { query: { scope, ...(cursor ? { cursor } : {}) } },
        }),
      );
    },
    async get(id: string) {
      return approvalUnwrap<ApprovalRequest>(
        await client.GET("/approval-requests/{id}", {
          params: { path: { id } },
        }),
      );
    },
    async create(title: string, description: string | null, key: string) {
      return approvalUnwrap<ApprovalRequest>(
        await client.POST("/approval-requests", {
          params: { header: { "idempotency-key": key } },
          body: { title, description },
        }),
      );
    },
    async edit(
      id: string,
      expectedVersion: number,
      title: string,
      description: string | null,
    ) {
      return approvalUnwrap<ApprovalRequest>(
        await client.PUT("/approval-requests/{id}/draft", {
          params: { path: { id } },
          body: { expectedVersion, title, description },
        }),
      );
    },
    async submit(id: string, expectedVersion: number) {
      return approvalUnwrap<ApprovalRequest>(
        await client.POST("/approval-requests/{id}/submit", {
          params: { path: { id } },
          body: { expectedVersion },
        }),
      );
    },
    async approve(id: string, expectedVersion: number) {
      return approvalUnwrap<ApprovalRequest>(
        await client.POST("/approval-requests/{id}/approve", {
          params: { path: { id } },
          body: { expectedVersion },
        }),
      );
    },
    async reject(id: string, expectedVersion: number, reason: string) {
      return approvalUnwrap<ApprovalRequest>(
        await client.POST("/approval-requests/{id}/reject", {
          params: { path: { id } },
          body: { expectedVersion, reason },
        }),
      );
    },
    async cancel(id: string, expectedVersion: number) {
      return approvalUnwrap<ApprovalRequest>(
        await client.POST("/approval-requests/{id}/cancel", {
          params: { path: { id } },
          body: { expectedVersion },
        }),
      );
    },
  };
}
