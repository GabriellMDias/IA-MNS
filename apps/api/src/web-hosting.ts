import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

/**
 * Same-origin hosting of the built apps/web (ADR-0029). The build is indexed
 * once at startup and only exact paths in that index are served, so no request
 * path ever reaches the filesystem. The browser-visible API lives under /api,
 * as in development, where the Vite proxy strips that prefix.
 */
export const apiPrefix = "/api";

/** Build metadata emitted by apps/web/vite.config.ts; never served. */
export const webBuildManifest = "ia-mns-web.json";

export type WebFile = Readonly<{
  body: Buffer;
  type: string;
  etag: string;
  immutable: boolean;
}>;

export type WebBuild = Readonly<{
  files: ReadonlyMap<string, WebFile>;
  index: WebFile;
  documentation: boolean;
}>;

const contentTypes: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function listFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    // Hidden files and links are never part of the served build.
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

/**
 * Indexes a web build. Refuses a directory that is not an IA-MNS web build,
 * and a build that contains the /docs portal when documentation is disabled
 * (the portal is removed at build time with VITE_ORION_DOCS=disabled).
 */
export async function loadWebBuild(
  root: string,
  documentation: "enabled" | "disabled",
): Promise<WebBuild> {
  const directory = resolve(root);
  let manifest: unknown;
  try {
    manifest = JSON.parse(
      await readFile(join(directory, webBuildManifest), "utf8"),
    );
  } catch {
    throw new Error("Invalid web build: ORION_WEB_ROOT is not an IA-MNS build");
  }
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    (manifest as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    typeof (manifest as { documentation?: unknown }).documentation !== "boolean"
  )
    throw new Error("Invalid web build: unsupported build manifest");
  const included = (manifest as { documentation: boolean }).documentation;
  if (included && documentation === "disabled")
    throw new Error(
      "Invalid web build: it contains the /docs portal while ORION_WEB_DOCS is disabled",
    );
  const files = new Map<string, WebFile>();
  for (const path of await listFiles(directory)) {
    const name = relative(directory, path).split(sep).join("/");
    if (name === webBuildManifest) continue;
    const body = await readFile(path);
    files.set(`/${name}`, {
      body,
      type:
        contentTypes[extname(name).toLowerCase()] ?? "application/octet-stream",
      etag: `"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`,
      immutable: name.startsWith("assets/"),
    });
  }
  const index = files.get("/index.html");
  if (!index) throw new Error("Invalid web build: index.html is missing");
  return Object.freeze({ files, index, documentation: included });
}

/** Origins that may frame each embedded surface (ADR-0023). */
export type EmbedOrigins = Readonly<{ pdt?: string; sankhya?: string }>;

/**
 * Content-Security-Policy for a browser path: only /embed/pdt and
 * /embed/sankhya may be framed, each only by its own configured host.
 */
export function framePolicy(pathname: string, embed: EmbedOrigins): string {
  const surface = /^\/embed\/(pdt|sankhya)(?:\/|$)/.exec(pathname)?.[1] as
    "pdt" | "sankhya" | undefined;
  const origin = surface ? embed[surface] : undefined;
  return `frame-ancestors ${origin ?? "'none'"}`;
}

/** Paths answered by the API or probes, never by the web application. */
export function isServerPath(pathname: string): boolean {
  return (
    pathname === apiPrefix ||
    pathname.startsWith(`${apiPrefix}/`) ||
    pathname.startsWith("/health/")
  );
}

/**
 * The web file for a request, if any: an exact build file, or index.html for
 * a page navigation (client-side routes, including the embedded surfaces).
 * Missing assets stay 404 rather than receiving the HTML shell.
 */
export function resolveWebFile(
  build: WebBuild,
  pathname: string,
  accept: string | undefined,
): WebFile | undefined {
  if (isServerPath(pathname)) return undefined;
  const file = build.files.get(pathname);
  if (file) return file;
  if (pathname.startsWith("/assets/")) return undefined;
  return accept?.includes("text/html") ? build.index : undefined;
}
