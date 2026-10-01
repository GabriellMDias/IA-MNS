import { readFileSync } from "node:fs";

// The workspace package name identifies this executable in logs and traces.
// Project initialization renames it, so derived products report their own
// service instead of the foundation's.
function serviceNameFromPackage(): string {
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const name =
      manifest && typeof manifest === "object" && "name" in manifest
        ? manifest.name
        : undefined;
    const service =
      typeof name === "string" ? name.replace(/^@/, "").replace("/", "-") : "";
    if (/^[a-z0-9][a-z0-9._-]{0,99}$/.test(service)) return service;
  } catch {
    // A missing or malformed manifest must not prevent fail-safe diagnostics.
  }
  return "api";
}

export const serviceName = serviceNameFromPackage();
