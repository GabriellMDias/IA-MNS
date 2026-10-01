import { coreErrors, type ErrorDefinition } from "./errors.js";
import type { ApiModule } from "./module.js";

/**
 * The complete public error registry: shared runtime codes plus the codes of
 * every composed module. A code has exactly one definition.
 */
export function publicErrorRegistry(
  modules: readonly ApiModule[],
): Readonly<Record<string, ErrorDefinition>> {
  const registry: Record<string, ErrorDefinition> = { ...coreErrors };
  for (const module of modules)
    for (const [code, definition] of Object.entries(module.errors)) {
      const existing = registry[code];
      if (existing && JSON.stringify(existing) !== JSON.stringify(definition))
        throw new Error(`Module ${module.name} redefines public error ${code}`);
      registry[code] = definition;
    }
  return Object.freeze(registry);
}
