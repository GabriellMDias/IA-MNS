import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

type Surface = "pdt" | "sankhya";
type Ancestors = Readonly<Record<Surface, readonly string[]>>;

/** Server-only framing configuration; no local environment enters the bundle. */
export function loadEmbedAncestors(
  repositoryRoot: string | undefined,
  inherited: NodeJS.ProcessEnv = process.env,
): Ancestors {
  let local: NodeJS.ProcessEnv = {};
  if (repositoryRoot) {
    try {
      local = parseEnv(
        readFileSync(join(repositoryRoot, ".env.local"), "utf8"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const value = (name: string) => inherited[name] ?? local[name];
  const override = value("ORION_WEB_EMBED_ANCESTORS");
  if (override !== undefined) {
    const origins = parseOrigins(override, "ORION_WEB_EMBED_ANCESTORS");
    return { pdt: origins, sankhya: origins };
  }
  const provider = (name: string) => {
    const origins = parseOrigins(value(name) ?? "", name);
    if (origins.length > 1) throw new Error(`${name} must be one exact origin`);
    return origins;
  };
  return {
    pdt: provider("PDT_EMBED_ORIGIN"),
    sankhya: provider("SANKHYA_EMBED_ORIGIN"),
  };
}

function parseOrigins(value: string, name: string): string[] {
  const origins = value.split(/\s+/).filter(Boolean);
  for (const origin of origins) {
    if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin))
      throw new Error(`${name} must list exact origins`);
    // URL also rejects invalid ports and malformed hosts, without echoing input.
    try {
      new URL(origin);
    } catch {
      throw new Error(`${name} must list exact origins`);
    }
  }
  return [...new Set(origins)];
}
