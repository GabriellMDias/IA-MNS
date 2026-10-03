import type { ComponentType } from "react";
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { coreRoutes, homeRoute, rootRoute } from "./shell.js";
import { AgentSessionProvider } from "./features/agent/session.js";

export const ProductProvider = AgentSessionProvider;
function conversationSearch(search: Record<string, unknown>): {
  view?: "active" | "pinned" | "archived";
} {
  return search.view === "pinned" || search.view === "archived"
    ? { view: search.view }
    : {};
}

// Composition owned by this repository. Mount each web module's route tree
// here and contribute its header and home-page links to moduleNavigation.
const productHomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: conversationSearch,
  component: lazyRouteComponent(
    () => import("./features/agent/page.js"),
    "AgentPage",
  ),
});
const conversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/$conversationId",
  validateSearch: conversationSearch,
  component: lazyRouteComponent(
    () => import("./features/agent/page.js"),
    "AgentPage",
  ),
});
export const routeTree = rootRoute.addChildren([
  ...coreRoutes.filter((route) => route !== homeRoute),
  productHomeRoute,
  conversationRoute,
]);

export const moduleNavigation: readonly ComponentType[] = [];
