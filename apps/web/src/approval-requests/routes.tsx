import { createRoute, Link, Outlet } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { rootRoute } from "../shell.js";
import { AccessTokenForm } from "./access-token-form.js";
import type { Scope } from "./api.js";
import { CredentialProvider, useCredential } from "./credential.js";
import { DetailRoute, ListPage } from "./pages.js";
import "./approval-requests.css";

// Orion's reference workflow. Foundation-only: derived projects start
// without it and compose their own routes in apps/web/src/modules.tsx.
function ApprovalRequestsLayout() {
  return (
    <CredentialProvider>
      <CredentialGate />
    </CredentialProvider>
  );
}

function CredentialGate() {
  const { token, setToken } = useCredential();
  const queryClient = useQueryClient();
  function connect(value: string) {
    queryClient.clear();
    setToken(value);
  }
  function disconnect() {
    queryClient.clear();
    setToken(null);
  }
  if (!token) return <AccessTokenForm onConnect={connect} />;
  return (
    <>
      <div className="session-bar">
        <span>Connected for this tab</span>
        <button type="button" className="button-text" onClick={disconnect}>
          Disconnect
        </button>
      </div>
      <Outlet />
    </>
  );
}

const approvalRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/approval-requests",
  component: ApprovalRequestsLayout,
});
const listRoute = createRoute({
  getParentRoute: () => approvalRequestsRoute,
  path: "/",
  validateSearch: (
    search: Record<string, unknown>,
  ): { scope: Scope; cursor?: string } => ({
    scope: search.scope === "reviewable" ? "reviewable" : "mine",
    ...(typeof search.cursor === "string" && search.cursor.length > 0
      ? { cursor: search.cursor }
      : {}),
  }),
  component: ListPage,
});
const detailRoute = createRoute({
  getParentRoute: () => approvalRequestsRoute,
  path: "$id",
  component: DetailRoute,
});

export const approvalRequestsRouteTree = approvalRequestsRoute.addChildren([
  listRoute,
  detailRoute,
]);

export function ApprovalRequestsNavigation() {
  return (
    <Link to="/approval-requests" search={{ scope: "mine" }}>
      Approval requests
    </Link>
  );
}
