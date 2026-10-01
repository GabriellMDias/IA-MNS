import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads the repository's display identity from `.orion/project.json`, so the
 * Orion foundation and each derived project present their own name.
 */
export function readProjectIdentity(root: string): { name: string } {
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(join(root, ".orion/project.json"), "utf8"),
    );
    const name =
      manifest && typeof manifest === "object" && "name" in manifest
        ? manifest.name
        : undefined;
    if (typeof name === "string" && name.trim()) return { name: name.trim() };
  } catch {
    // Source archives without the manifest still build with a neutral name.
  }
  return { name: "Application" };
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}
