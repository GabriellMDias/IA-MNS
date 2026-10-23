import {
  createRootRoute,
  createRoute,
  lazyRouteComponent,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import brandMark from "./assets/brand-mark.svg";
import { HomePage } from "./home.js";
import { useModuleNavigation } from "./module-navigation.js";

function Shell() {
  const navigation = useModuleNavigation();
  const isDocumentation = useRouterState({
    select: (state) =>
      __ORION_INTERNAL_DOCS__ &&
      (state.location.pathname === "/docs" ||
        state.location.pathname.startsWith("/docs/")),
  });
  // The engineering portal owns its layout; application UI stays repository-owned.
  if (__ORION_INTERNAL_DOCS__ && isDocumentation) return <Outlet />;
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="brand">
            <img src={brandMark} alt="" width="32" height="32" />
            {__PROJECT_NAME__}
          </Link>
          <nav aria-label="Application" className="header-nav">
            {navigation.map((Item, index) => (
              <Item key={index} />
            ))}
            {__ORION_INTERNAL_DOCS__ && <Link to="/docs">Documentation</Link>}
          </nav>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

export const rootRoute = createRootRoute({ component: Shell });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});
const documentationSearch = (
  search: Record<string, unknown>,
): { q?: string; scope?: string; group?: string; page?: number } => ({
  ...(typeof search.q === "string" ? { q: search.q.slice(0, 200) } : {}),
  ...(typeof search.scope === "string" ? { scope: search.scope } : {}),
  ...(typeof search.group === "string" ? { group: search.group } : {}),
  ...(Number.isSafeInteger(Number(search.page)) && Number(search.page) > 1
    ? { page: Math.min(Number(search.page), 100000) }
    : {}),
});
function createDocumentationRoutes() {
  const documentationComponent = lazyRouteComponent(
    () => import("./documentation.js"),
    "DocumentationPage",
  );
  const documentationRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/docs",
    component: documentationComponent,
    validateSearch: documentationSearch,
  });
  const documentationDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/docs/$",
    component: documentationComponent,
    validateSearch: documentationSearch,
  });
  return [documentationRoute, documentationDetailRoute] as const;
}

/** Local engineering routes are removed with their imports in product builds. */
const documentationRoutes: ReadonlyArray<
  ReturnType<typeof createDocumentationRoutes>[number]
> = __ORION_INTERNAL_DOCS__ ? createDocumentationRoutes() : [];
export const coreRoutes = [homeRoute, ...documentationRoutes] as const;
