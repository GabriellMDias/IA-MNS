import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { ModuleNavigation } from "./module-navigation.js";
import { moduleNavigation, routeTree, ProductProvider } from "./modules.js";
import "./styles.css";
import { initializeTheme } from "./theme.js";

initializeTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 10_000, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

const router = createRouter({ routeTree, defaultPreload: "intent" });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ModuleNavigation value={moduleNavigation}>
        <ProductProvider>
          <RouterProvider router={router} />
        </ProductProvider>
      </ModuleNavigation>
    </QueryClientProvider>
  </React.StrictMode>,
);
