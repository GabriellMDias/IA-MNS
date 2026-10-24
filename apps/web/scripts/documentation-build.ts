import type { Plugin } from "vite";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(
  new URL("../../../", import.meta.url),
).replaceAll("\\", "/");

/** Build selection is independent of the product identity and Vite mode name. */
export function internalDocumentationEnabled(
  command: "build" | "serve",
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  const selection = environment.ORION_WEB_DOCUMENTATION;
  if (
    selection !== undefined &&
    selection !== "disabled" &&
    selection !== "internal"
  )
    throw new Error("ORION_WEB_DOCUMENTATION must be disabled or internal.");
  const enabled =
    selection === "internal" ||
    (selection === undefined && command === "serve");
  if (
    enabled &&
    command === "build" &&
    environment.ORION_WEB_INTERNAL_DOCS_ACCESS !== "external"
  )
    throw new Error(
      "Internal documentation builds require ORION_WEB_INTERNAL_DOCS_ACCESS=external and an authorized host enforcing access to the entire artifact, including assets.",
    );
  return enabled;
}

export function isInternalDocumentationModule(id: string): boolean {
  const path = id.replaceAll("\\", "/").split("?")[0];
  if (path.includes("/node_modules/")) return false;
  const repositoryPath = path.startsWith(repositoryRoot)
    ? path.slice(repositoryRoot.length)
    : undefined;
  return (
    repositoryPath?.startsWith("docs/") === true ||
    (repositoryPath !== undefined &&
      /(?:^|\/)(?:AGENTS|README)\.md$/.test(repositoryPath)) ||
    /\/(?:apps\/web\/src\/(?:documentation(?:[./])|generated\/)|docs\/generated\/)/.test(
      path,
    ) ||
    /\/apps\/web\/src\/(?:.*\/)?components\.docs\.json$/.test(path)
  );
}

/** Prevent an accidental product import from silently reintroducing the catalog. */
export function documentationIsolation(enabled: boolean): Plugin {
  return {
    name: "internal-documentation-isolation",
    generateBundle() {
      if (enabled) return;
      for (const id of this.getModuleIds()) {
        if (isInternalDocumentationModule(id))
          this.error(
            "Internal documentation reached a product build. Keep its imports behind the documentation build boundary.",
          );
      }
    },
  };
}
