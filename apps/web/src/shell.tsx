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
import { ThemeToggle } from "./theme.js";

function Shell() {
  const navigation = useModuleNavigation();
  const isDocumentation = useRouterState({
    select: (state) =>
      state.location.pathname === "/docs" ||
      state.location.pathname.startsWith("/docs/"),
  });
  return (
    <div className="app-shell">
      {isDocumentation && (
        <header className="site-header">
          <div className="site-header-inner">
            <Link to="/" className="brand">
              <img src={brandMark} alt="" width="32" height="32" />
              {__PROJECT_NAME__}
              <span> / Documentation</span>
            </Link>
            <span className="header-note">Living documentation</span>
            <nav aria-label="Application" className="header-nav">
              {navigation.map((Item, index) => (
                <Item key={index} />
              ))}
              <Link to="/docs">Documentation</Link>
              <ThemeToggle />
            </nav>
          </div>
        </header>
      )}
      <main
        className={
          isDocumentation
            ? "main-content documentation-main"
            : "main-content product-main"
        }
      >
        <Outlet />
      </main>
    </div>
  );
}

export const rootRoute = createRootRoute({ component: Shell });

export const homeRoute = createRoute({
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

/** Routes every application shell provides; modules add theirs beside them. */
export const coreRoutes = [
  homeRoute,
  documentationRoute,
  documentationDetailRoute,
] as const;
