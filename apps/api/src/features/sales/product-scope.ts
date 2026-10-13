import type { SalesSource } from "./sources.js";

/** Public provenance, with no SQL or private catalog identifiers. */
export type SalesProductSelection = Readonly<{
  source: SalesSource;
  catalogVersion: string;
  description: string;
}>;

/**
 * Internal handoff from a verified registration adapter. Never accepted over
 * HTTP, persisted, or produced by a model. The subquery returns every matching
 * product key; display limits must never restrict sales totals.
 */
export type SalesProductScope = SalesProductSelection &
  (
    | { source: "vrmaster"; keysSql: string; values: readonly unknown[] }
    | {
        source: "sankhya";
        keysSql: string;
        binds: Record<string, string | number>;
      }
  );

export function scopeDescription(
  scope: SalesProductScope,
): SalesProductSelection {
  return {
    source: scope.source,
    catalogVersion: scope.catalogVersion,
    description: scope.description,
  };
}
