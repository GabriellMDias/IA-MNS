import { coreErrors, type ErrorDefinition } from "./errors.js";
import type { ApiModule } from "./module.js";

/**
 * The complete public error registry: shared runtime codes plus the codes of
 * every composed module. A code has exactly one owner: a module may neither
 * redeclare a shared code nor declare another module's code, even with an
 * identical definition, because its meaning would then have two sources.
 */
export function publicErrorRegistry(
  modules: readonly ApiModule[],
): Readonly<Record<string, ErrorDefinition>> {
  const registry: Record<string, ErrorDefinition> = { ...coreErrors };
  const owners = new Map<string, string>(
    Object.keys(coreErrors).map((code) => [code, "the shared runtime"]),
  );
  for (const module of modules)
    for (const [code, definition] of Object.entries(module.errors)) {
      const owner = owners.get(code);
      if (owner)
        throw new Error(
          `Module ${module.name} redefines public error ${code}, already defined by ${owner}`,
        );
      owners.set(code, `module ${module.name}`);
      registry[code] = definition;
    }
  return Object.freeze(registry);
}
