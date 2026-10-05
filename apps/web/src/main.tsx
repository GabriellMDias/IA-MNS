import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { AccountMenu, ModuleNavigation } from "./module-navigation.js";
import {
  accountMenu,
  moduleNavigation,
  routeTree,
  ProductProvider,
} from "./modules.js";
import "./styles.css";
import { initializeTheme } from "./theme.js";
import { currentSurface } from "./surface.js";

initializeTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 10_000, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

// Embedded hosts load the same build under /embed/<host>; keep every route there.
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  basepath: currentSurface.basepath,
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ModuleNavigation value={moduleNavigation}>
        <AccountMenu value={accountMenu}>
          <ProductProvider>
            <RouterProvider router={router} />
          </ProductProvider>
        </AccountMenu>
      </ModuleNavigation>
    </QueryClientProvider>
  </React.StrictMode>,
);
