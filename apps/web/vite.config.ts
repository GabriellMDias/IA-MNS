import { defineConfig, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readFoundationVersion } from "./scripts/foundation-version.js";
import { escapeHtml, readProjectIdentity } from "./scripts/project-identity.js";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const identity = readProjectIdentity(repositoryRoot);

// Clickjacking protection: only /embed/* may be framed, and only by the trusted
// host origins (the same values as the API's PDT_EMBED_ORIGIN/SANKHYA_EMBED_ORIGIN).
// Production hosting must send the same Content-Security-Policy per path.
const embedAncestors = (process.env.ORION_WEB_EMBED_ANCESTORS ?? "")
  .split(/\s+/)
  .filter(Boolean);
for (const origin of embedAncestors)
  if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin))
    throw new Error("ORION_WEB_EMBED_ANCESTORS must list exact origins");
// A production build may leave out the /docs portal (ADR-0029); the API refuses
// to serve a build that contains it unless ORION_WEB_DOCS=enabled.
const documentationSetting = process.env.VITE_ORION_DOCS ?? "enabled";
if (!["enabled", "disabled"].includes(documentationSetting))
  throw new Error("VITE_ORION_DOCS must be enabled or disabled");
const documentation = documentationSetting === "enabled";
const frameAncestors: Connect.NextHandleFunction = (
  request,
  response,
  next,
) => {
  const embedded = /^\/embed\/(pdt|sankhya)(\/|$|\?)/.test(request.url ?? "/");
  // The same Referrer-Policy the API sends when it serves the build.
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Content-Security-Policy",
    embedded && embedAncestors.length
      ? `frame-ancestors ${embedAncestors.join(" ")}`
      : "frame-ancestors 'none'",
  );
  next();
};

export default defineConfig({
  plugins: [
    react({ compiler: true }),
    {
      name: "frame-ancestors",
      configureServer: (server) => void server.middlewares.use(frameAncestors),
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
});
