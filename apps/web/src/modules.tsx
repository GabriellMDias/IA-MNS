import type { ComponentType, ReactNode } from "react";
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { coreRoutes, homeRoute, rootRoute } from "./shell.js";
import { CredentialProvider } from "./credentials.js";
import { AgentSessionProvider } from "./features/agent/session.js";
import {
  IdentitySessionProvider,
  RequireSignIn,
} from "./features/identity/session.js";
import {
  IdentityAccountMenu,
  IdentityNavigation,
} from "./features/identity/navigation.js";
import type { AccountMenuProps } from "./module-navigation.js";

/** Product providers: credentials, then identity (sign-in), then feature state. */
export function ProductProvider({ children }: { children: ReactNode }) {
  return (
    <CredentialProvider>
      <IdentitySessionProvider>
        <AgentSessionProvider>{children}</AgentSessionProvider>
      </IdentitySessionProvider>
    </CredentialProvider>
  );
}
function conversationSearch(search: Record<string, unknown>): {
  view?: "active" | "pinned" | "archived";
} {
  return search.view === "pinned" || search.view === "archived"
    ? { view: search.view }
    : {};
}
const text = (value: unknown) =>
  typeof value === "string" ? value.slice(0, 80) : undefined;
const loginSearch = (search: Record<string, unknown>): { erro?: string } =>
  text(search.erro) ? { erro: text(search.erro) } : {};
const adminSearch = (
  search: Record<string, unknown>,
): { secao?: "seguranca" | "parametros" } =>
  search.secao === "seguranca" || search.secao === "parametros"
    ? { secao: search.secao }
    : {};
const accountSearch = (
  search: Record<string, unknown>,
): {
  vinculado?: string;
  confirmado?: string;
  novo?: string;
  unificar?: string;
} => ({
  ...(text(search.vinculado) ? { vinculado: text(search.vinculado) } : {}),
  ...(text(search.confirmado) ? { confirmado: text(search.confirmado) } : {}),
  ...(text(search.novo) ? { novo: text(search.novo) } : {}),
  ...(text(search.unificar) ? { unificar: text(search.unificar) } : {}),
});

/** Product screens of the corporate agent require a signed-in person. */
const LazyAgentPage = lazyRouteComponent(
  () => import("./features/agent/page.js"),
  "AgentPage",
);
function AgentPage() {
  return (
    <RequireSignIn>
      <LazyAgentPage />
    </RequireSignIn>
  );
}
const LazyAccountPage = lazyRouteComponent(
  () => import("./features/identity/account.js"),
  "AccountPage",
);
const LazyAdminPage = lazyRouteComponent(
  () => import("./features/identity/admin.js"),
  "AdminPage",
);

// Composition owned by this repository. Mount each web module's route tree
// here and contribute its header and home-page links to moduleNavigation.
const productHomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: conversationSearch,
  component: AgentPage,
});
const conversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/$conversationId",
  validateSearch: conversationSearch,
  component: AgentPage,
});
const identityRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/entrar",
    validateSearch: loginSearch,
    component: lazyRouteComponent(
      () => import("./features/identity/pages.js"),
      "LoginPage",
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/entrar/primeiro-acesso",
    component: lazyRouteComponent(
      () => import("./features/identity/pages.js"),
      "ProvisionPage",
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/identidade/inicial",
    component: lazyRouteComponent(
      () => import("./features/identity/pages.js"),
      "BootstrapPage",
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/identidade/convite",
    component: lazyRouteComponent(
      () => import("./features/identity/pages.js"),
      "InvitationPage",
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/identidade/vincular",
    component: lazyRouteComponent(
      () => import("./features/identity/pages.js"),
      "LinkInvitationPage",
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/conta",
    validateSearch: accountSearch,
    component: () => (
      <RequireSignIn>
        <LazyAccountPage />
      </RequireSignIn>
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin",
    validateSearch: adminSearch,
    component: () => (
      <RequireSignIn>
        <LazyAdminPage />
      </RequireSignIn>
    ),
  }),
];
export const routeTree = rootRoute.addChildren([
  ...coreRoutes.filter((route) => route !== homeRoute),
  productHomeRoute,
  conversationRoute,
  ...identityRoutes,
]);

export const moduleNavigation: readonly ComponentType[] = [IdentityNavigation];
export const accountMenu: ComponentType<AccountMenuProps> = IdentityAccountMenu;
