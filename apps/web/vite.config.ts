import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react({ compiler: true })],
  build: { assetsInlineLimit: 0 },
  server: {
    proxy: {
      "/api": {
        target: process.env.ORION_WEB_API_TARGET ?? "http://127.0.0.1:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      ...(process.env.ORION_WEB_LOCAL_IDENTITY_TARGET
        ? {
            "/__orion_local_identity": {
              target: process.env.ORION_WEB_LOCAL_IDENTITY_TARGET,
              changeOrigin: true,
              rewrite: (path: string) =>
                path.replace(/^\/__orion_local_identity/, "/local-identity"),
            },
          }
        : {}),
    },
  },
});
