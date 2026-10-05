import type { paths } from "@ia-mns/sdk";
import { apiClient, unwrap } from "../../api-client.js";

export const identityCodes = new Set([
  "IDENTITY_NOT_CONFIGURED",
  "IDENTITY_METHOD_UNAVAILABLE",
  "IDENTITY_INVALID_CREDENTIALS",
  "IDENTITY_INVALID_CODE",
  "IDENTITY_FLOW_EXPIRED",
  "IDENTITY_PROOF_REJECTED",
  "IDENTITY_PROVIDER_UNAVAILABLE",
  "IDENTITY_ACCOUNT_DISABLED",
  "IDENTITY_SESSION_EXPIRED",
  "IDENTITY_RECENT_AUTHENTICATION_REQUIRED",
  "IDENTITY_STRONG_AUTHENTICATION_REQUIRED",
  "IDENTITY_ACCESS_DENIED",
  "IDENTITY_PERSON_NOT_FOUND",
  "IDENTITY_LINK_NOT_FOUND",
  "IDENTITY_SESSION_NOT_FOUND",
  "IDENTITY_LINK_CONFLICT",
  "IDENTITY_PROVIDER_ALREADY_LINKED",
  "IDENTITY_LAST_METHOD",
  "IDENTITY_LAST_OWNER",
  "IDENTITY_LOGIN_TAKEN",
  "IDENTITY_ALREADY_ENROLLED",
  "IDENTITY_INVALID_LOGIN",
  "IDENTITY_INVALID_NAME",
  "IDENTITY_WEAK_PASSWORD",
  "IDENTITY_UNKNOWN_PERMISSION",
  "IDENTITY_TOTP_REQUIRED",
  "IDENTITY_LOCAL_CREDENTIAL_REQUIRED",
  "IDENTITY_DIRECTORY_UNAVAILABLE",
  "IDENTITY_EXTERNAL_ACCOUNT_NOT_FOUND",
  "IDENTITY_EXTERNAL_ACCOUNT_INACTIVE",
  "IDENTITY_MERGE_NOT_ALLOWED",
  "IDENTITY_MERGE_BUSY",
]);
const web = { "x-ia-mns-client": "web" };
const timeout = () => AbortSignal.timeout(15_000);

type Json<
  P extends keyof paths,
  M extends keyof paths[P],
> = paths[P][M] extends {
  responses: { 200: { content: { "application/json": infer R } } };
}
  ? R
  : never;
export type IdentityStatus = Json<"/identity/status", "get">;
export type Outcome = Json<"/identity/login/local", "post">;
export type Me = Json<"/identity/me", "get">;
export type PersonList = Json<"/identity/admin/persons", "get">;
export type PersonDetail = Json<"/identity/admin/persons/{personId}", "get">;
export type Provision = Json<"/identity/provision/inspect", "post">;
export type SankhyaUsers = Json<"/identity/admin/sankhya-users", "get">;
export type Provider = "pdt" | "sankhya";
export type Intent = "login" | "link" | "reauth" | "invite";

export async function getIdentityStatus(signal?: AbortSignal) {
  return unwrap(
    await apiClient().GET("/identity/status", { signal }),
    identityCodes,
  );
}
export async function loginLocal(
  login: string,
  password: string,
  surface: "direct" | Provider,
) {
  return unwrap(
    await apiClient().POST("/identity/login/local", {
      body: { login, password, surface },
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function completeMfa(challenge: string, code: string) {
  return unwrap(
    await apiClient().POST("/identity/login/mfa", {
      body: { challenge, code },
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function refreshSession() {
  return unwrap(
    await apiClient().POST("/identity/session/refresh", {
      headers: web,
      body: {},
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function logout(token: string | null) {
  return unwrap(
    await apiClient(token).POST("/identity/logout", {
      headers: web,
      body: {},
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function startProvider(
  provider: Provider,
  intent: Intent,
  mode: "direct" | "embedded",
  token: string | null = null,
  options: { invitation?: string; resumeFirstAccess?: boolean } = {},
) {
  return unwrap(
    await apiClient(token).POST("/identity/providers/{provider}/start", {
      params: { path: { provider } },
      // The web header lets a direct login see an existing browser session.
      headers: web,
      body: { intent, mode, ...options },
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function completeEmbedded(
  provider: Provider,
  body: {
    pendingId: string;
    state?: string;
    code?: string;
    iss?: string;
    assertion?: string;
  },
) {
  return unwrap(
    await apiClient().POST("/identity/providers/{provider}/complete", {
      params: { path: { provider } },
      body,
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function inspectProvision(ticket?: string) {
  return unwrap(
    await apiClient().POST("/identity/provision/inspect", {
      headers: web,
      body: ticket ? { ticket } : {},
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function mergeProven(token: string, ticket?: string) {
  return unwrap(
    await apiClient(token).POST("/identity/merge", {
      headers: web,
      body: ticket ? { ticket } : {},
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function provisionCreate(ticket?: string) {
  return unwrap(
    await apiClient().POST("/identity/provision/create", {
      headers: web,
      body: ticket ? { ticket } : {},
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function provisionLink(token: string, ticket?: string) {
  return unwrap(
    await apiClient(token).POST("/identity/provision/link", {
      headers: web,
      body: ticket ? { ticket } : {},
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function inspectInvitation(
  purpose: "bootstrap" | "enrollment" | "reset" | "link",
  token: string,
) {
  return unwrap(
    await apiClient().POST("/identity/invitations/inspect", {
      body: { purpose, token },
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function completeBootstrap(body: {
  token: string;
  displayName: string;
  login: string;
  password: string;
}) {
  return unwrap(
    await apiClient().POST("/identity/bootstrap", { body, signal: timeout() }),
    identityCodes,
  );
}
export async function completeInvitation(body: {
  purpose: "enrollment" | "reset";
  token: string;
  login: string;
  password: string;
}) {
  return unwrap(
    await apiClient().POST("/identity/invitations/complete", {
      body,
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function getMe(token: string, signal?: AbortSignal) {
  return unwrap(
    await apiClient(token).GET("/identity/me", { signal }),
    identityCodes,
  );
}
export async function renameMe(token: string, displayName: string) {
  return unwrap(
    await apiClient(token).PATCH("/identity/me", {
      body: { displayName },
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function reauthenticate(
  token: string,
  password: string,
  code?: string,
) {
  return unwrap(
    await apiClient(token).POST("/identity/me/reauthenticate", {
      body: { password, ...(code ? { code } : {}) },
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function setPassword(
  token: string,
  password: string,
  login?: string,
) {
  return unwrap(
    await apiClient(token).PUT("/identity/me/password", {
      body: { password, ...(login ? { login } : {}) },
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function startTotp(token: string) {
  return unwrap(
    await apiClient(token).POST("/identity/me/totp", {
      body: {},
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function confirmTotp(token: string, setup: string, code: string) {
  return unwrap(
    await apiClient(token).POST("/identity/me/totp/confirm", {
      body: { setup, code },
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function disableTotp(token: string) {
  return unwrap(
    await apiClient(token).DELETE("/identity/me/totp", { signal: timeout() }),
    identityCodes,
  );
}
export async function regenerateRecoveryCodes(token: string) {
  return unwrap(
    await apiClient(token).POST("/identity/me/recovery-codes", {
      body: {},
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function unlink(token: string, linkId: string) {
  return unwrap(
    await apiClient(token).DELETE("/identity/me/links/{linkId}", {
      params: { path: { linkId } },
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function revokeSession(token: string, sessionId: string) {
  return unwrap(
    await apiClient(token).DELETE("/identity/me/sessions/{sessionId}", {
      params: { path: { sessionId } },
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function listPersons(
  token: string,
  query: string,
  cursor: string | undefined,
  signal?: AbortSignal,
) {
  return unwrap(
    await apiClient(token).GET("/identity/admin/persons", {
      params: {
        query: { ...(query ? { query } : {}), ...(cursor ? { cursor } : {}) },
      },
      signal,
    }),
    identityCodes,
  );
}
export async function getPerson(
  token: string,
  personId: string,
  signal?: AbortSignal,
) {
  return unwrap(
    await apiClient(token).GET("/identity/admin/persons/{personId}", {
      params: { path: { personId } },
      signal,
    }),
    identityCodes,
  );
}
export async function createPerson(
  token: string,
  body: {
    displayName: string;
    localInvitation: boolean;
    sankhyaUser?: string;
    linkInvitations?: Provider[];
  },
) {
  return unwrap(
    await apiClient(token).POST("/identity/admin/persons", {
      body,
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function searchSankhyaUsers(
  token: string,
  query: string,
  signal?: AbortSignal,
) {
  return unwrap(
    await apiClient(token).GET("/identity/admin/sankhya-users", {
      params: { query: { query } },
      signal,
    }),
    identityCodes,
  );
}
export async function linkSankhyaUser(
  token: string,
  personId: string,
  codusu: string,
) {
  return unwrap(
    await apiClient(token).POST(
      "/identity/admin/persons/{personId}/links/sankhya",
      {
        params: { path: { personId } },
        body: { codusu },
        signal: timeout(),
      },
    ),
    identityCodes,
  );
}
export async function issueLinkInvitation(
  token: string,
  personId: string,
  provider: Provider,
) {
  return unwrap(
    await apiClient(token).POST(
      "/identity/admin/persons/{personId}/link-invitations",
      {
        params: { path: { personId } },
        body: { provider },
        signal: timeout(),
      },
    ),
    identityCodes,
  );
}
export async function issueEnrollment(token: string, personId: string) {
  return unwrap(
    await apiClient(token).POST(
      "/identity/admin/persons/{personId}/enrollment",
      {
        params: { path: { personId } },
        body: {},
        signal: timeout(),
      },
    ),
    identityCodes,
  );
}
export async function mergePersons(
  token: string,
  personId: string,
  sourcePersonId: string,
) {
  return unwrap(
    await apiClient(token).POST("/identity/admin/persons/{personId}/merge", {
      params: { path: { personId } },
      body: { sourcePersonId },
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function setGrant(
  token: string,
  personId: string,
  permission: string,
  granted: boolean,
) {
  const options = {
    params: { path: { personId, permission } },
    signal: timeout(),
  };
  return unwrap(
    granted
      ? await apiClient(token).PUT(
          "/identity/admin/persons/{personId}/grants/{permission}",
          options,
        )
      : await apiClient(token).DELETE(
          "/identity/admin/persons/{personId}/grants/{permission}",
          options,
        ),
    identityCodes,
  );
}
export async function setOwner(
  token: string,
  personId: string,
  owner: boolean,
) {
  const options = { params: { path: { personId } }, signal: timeout() };
  return unwrap(
    owner
      ? await apiClient(token).PUT(
          "/identity/admin/persons/{personId}/owner",
          options,
        )
      : await apiClient(token).DELETE(
          "/identity/admin/persons/{personId}/owner",
          options,
        ),
    identityCodes,
  );
}
export async function setPersonStatus(
  token: string,
  personId: string,
  status: "active" | "disabled",
) {
  return unwrap(
    await apiClient(token).PATCH("/identity/admin/persons/{personId}", {
      params: { path: { personId } },
      body: { status },
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function adminUnlink(
  token: string,
  personId: string,
  linkId: string,
) {
  return unwrap(
    await apiClient(token).DELETE(
      "/identity/admin/persons/{personId}/links/{linkId}",
      {
        params: { path: { personId, linkId } },
        signal: timeout(),
      },
    ),
    identityCodes,
  );
}
export async function resetLocal(token: string, personId: string) {
  return unwrap(
    await apiClient(token).POST("/identity/admin/persons/{personId}/reset", {
      params: { path: { personId } },
      body: {},
      signal: timeout(),
    }),
    identityCodes,
  );
}
export async function revokePersonSessions(token: string, personId: string) {
  return unwrap(
    await apiClient(token).DELETE(
      "/identity/admin/persons/{personId}/sessions",
      {
        params: { path: { personId } },
        signal: timeout(),
      },
    ),
    identityCodes,
  );
}
