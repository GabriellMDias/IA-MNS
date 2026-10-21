import { defineConfig, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readFoundationVersion } from "./scripts/foundation-version.js";
import { escapeHtml, readProjectIdentity } from "./scripts/project-identity.js";
import { loadEmbedAncestors } from "./scripts/embed-ancestors.js";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const identity = readProjectIdentity(repositoryRoot);

// A production build may leave out the /docs portal (ADR-0029); the API refuses
// to serve a build that contains it unless ORION_WEB_DOCS=enabled.
const documentationSetting = process.env.VITE_ORION_DOCS ?? "enabled";
if (!["enabled", "disabled"].includes(documentationSetting))
  throw new Error("VITE_ORION_DOCS must be enabled or disabled");
const documentation = documentationSetting === "enabled";
export default defineConfig(({ command }) => {
  const embedAncestors = loadEmbedAncestors(
    command === "serve" ? repositoryRoot : undefined,
  );
  const frameAncestors: Connect.NextHandleFunction = (
    request,
    response,
    next,
  ) => {
    const surface = /^\/embed\/(pdt|sankhya)(\/|$|\?)/.exec(
      request.url ?? "/",
    )?.[1] as "pdt" | "sankhya" | undefined;
    const ancestors = surface ? embedAncestors[surface] : [];
    // The same Referrer-Policy the API sends when it serves the build.
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      ancestors.length
        ? `frame-ancestors ${ancestors.join(" ")}`
        : "frame-ancestors 'none'",
    );
    next();
  };

  return {
    plugins: [
      react({ compiler: true }),
      {
        name: "frame-ancestors",
        configureServer: (server) =>
          void server.middlewares.use(frameAncestors),
        configurePreviewServer: (server) =>
          void server.middlewares.use(frameAncestors),
      },
      {
        // Read by the API before it serves this build (apps/api/src/web-hosting.ts).
        name: "web-build-manifest",
        apply: "build",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "ia-mns-web.json",
            source: `${JSON.stringify({ schemaVersion: 1, documentation })}
`,
          });
        },
      },
      {
        name: "project-identity",
        transformIndexHtml: (html) =>
          html.replaceAll("%PROJECT_NAME%", escapeHtml(identity.name)),
      },
    ],
    define: {
      __ORION_FOUNDATION_VERSION__: JSON.stringify(
        readFoundationVersion(repositoryRoot),
      ),
      __PROJECT_NAME__: JSON.stringify(identity.name),
      __ORION_DOCUMENTATION__: JSON.stringify(documentation),
    },
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
  };
});
