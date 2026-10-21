import { Type, type Static } from "typebox";

/**
 * Permission descriptions and data restrictions shared by identity, which
 * grants permissions and computes what each Person may read, and by the
 * modules that own the data and enforce the restrictions in their own queries
 * (ADR-0037). Shared runtime: this file imports no module.
 */

/** A dimension by which an owner may narrow a granted permission. */
export type RestrictionDimension = Readonly<{
  /** Stable identifier, for example `company`. */
  id: string;
  /** Short code shown to owners and support, for example `EMP`. */
  code: string;
  title: string;
  description: string;
  /** Selecting a node also admits every node below it. */
  hierarchical: boolean;
}>;

/**
 * What a grantable permission is, as owners, support and the agent describe
 * it. `code` is the stable identification a person gives support; `capability`
 * is the capability permission held whenever any of its permissions is held.
 */
export type PermissionInfo = Readonly<{
  permission: string;
  code: string;
  title: string;
  description: string;
  /** The data source the permission reads, when it reads one. */
  source: Readonly<{ id: string; title: string }> | null;
  capability: string | null;
  /** Dimensions the owning module enforces; empty when it cannot be narrowed. */
  restrictions: readonly RestrictionDimension[];
}>;

/** A value a restriction admits, with the label the source reported for it. */
export type RestrictionValue = Readonly<{ value: string; label: string }>;
export type AccessCondition = Readonly<{
  dimension: string;
  values: readonly RestrictionValue[];
}>;
/** Admits the rows that satisfy every condition; other dimensions are free. */
export type AccessRule = readonly AccessCondition[];
/**
 * What a held permission admits: every row, or the rows that at least one rule
 * admits (the grants a Person holds, united).
 */
export type DataScope =
  | Readonly<{ kind: "all" }>
  | Readonly<{ kind: "restricted"; rules: readonly AccessRule[] }>;
export const unrestricted: DataScope = Object.freeze({ kind: "all" });

/** The permissions and scopes of one Person, computed from trusted state now. */
export type AccessSnapshot = Readonly<{
  permissions: ReadonlySet<string>;
  /** One entry per held catalog permission; absent means not held. */
  scopes: ReadonlyMap<string, DataScope>;
}>;
/** Current access of a principal; null when it no longer designates an active Person. */
export type AccessResolver = (
  principalId: string,
) => Promise<AccessSnapshot | null>;

/** A real value of a restriction dimension, read from the owning source. */
export type RestrictionOption = Readonly<{
  value: string;
  label: string;
  detail: string | null;
}>;
/** Read-only lookup of restriction values, implemented by the module that owns them. */
export interface RestrictionDirectory {
  search(
    this: void,
    permission: string,
    dimension: string,
    query: string,
    signal: AbortSignal,
  ): Promise<readonly RestrictionOption[]>;
  /** The given values that exist, with their current labels. */
  resolve(
    this: void,
    permission: string,
    dimension: string,
    values: readonly string[],
    signal: AbortSignal,
  ): Promise<readonly RestrictionOption[]>;
}

export const restrictionLimits = {
  /** Values of one dimension in one grant. */
  values: 100,
  /** Characters of a value identifier. */
  valueLength: 40,
  /** Characters of a stored label. */
  labelLength: 200,
} as const;

/**
 * The value-only form of a restricted scope that an answer records, so a later
 * reading can check that the reader still covers it. No labels are kept.
 */
export const recordedAccessSchema = Type.Object(
  {
    rules: Type.Array(
      Type.Array(
        Type.Object(
          {
            dimension: Type.String({ pattern: "^[a-z][a-z_]{1,30}$" }),
            values: Type.Array(
              Type.String({
                minLength: 1,
                maxLength: restrictionLimits.valueLength,
              }),
              { minItems: 1, maxItems: restrictionLimits.values },
            ),
          },
          { additionalProperties: false },
        ),
        { minItems: 1, maxItems: 12 },
      ),
      { minItems: 1, maxItems: 64 },
    ),
  },
  {
    additionalProperties: false,
    description:
      "Data restriction this result was computed under; absent when it covers every row of its source.",
  },
);
export type RecordedAccess = Static<typeof recordedAccessSchema>;

/** One rule with sorted dimensions and values, labels removed. */
function ruleKey(rule: AccessRule | RecordedAccess["rules"][number]) {
  return rule
    .map((condition) => ({
      dimension: condition.dimension,
      values: [
        ...new Set(
          condition.values.map((value) =>
            typeof value === "string" ? value : value.value,
          ),
        ),
      ].sort(),
    }))
    .sort((a, b) => a.dimension.localeCompare(b.dimension));
}

/**
 * The union of the scopes of several grants of one permission. Any grant
 * without restriction admits everything; equal rules are kept once.
 */
export function uniteScopes(scopes: readonly DataScope[]): DataScope {
  if (scopes.length === 0 || scopes.some((scope) => scope.kind === "all"))
    return unrestricted;
  const rules = new Map<string, AccessRule>();
  for (const scope of scopes)
    if (scope.kind === "restricted")
      for (const rule of scope.rules) {
        if (rule.length === 0) return unrestricted;
        const key = JSON.stringify(ruleKey(rule));
        if (!rules.has(key)) rules.set(key, rule);
      }
  return { kind: "restricted", rules: [...rules.values()] };
}

/** The value-only form recorded with a result; null for an unrestricted scope. */
export function recordAccess(scope: DataScope): RecordedAccess | null {
  return scope.kind === "all" ? null : { rules: scope.rules.map(ruleKey) };
}

/**
 * Whether a reader's current scope admits everything a result was computed
 * under. A result without a recorded restriction covered every row, so only
 * an unrestricted reader covers it. Each recorded rule must fit inside one
 * current rule: every dimension the current rule restricts is restricted at
 * least as much by the recorded rule. Hierarchical values are compared as
 * selected, which can refuse an equivalent rule but never admits a broader one.
 */
export function scopeCovers(
  current: DataScope,
  recorded: RecordedAccess | null | undefined,
): boolean {
  if (current.kind === "all") return true;
  if (!recorded) return false;
  const allowed = current.rules.map(ruleKey);
  return recorded.rules.map(ruleKey).every((rule) =>
    allowed.some((limit) =>
      limit.every((condition) => {
        const narrowed = rule.find(
          (item) => item.dimension === condition.dimension,
        );
        return (
          narrowed !== undefined &&
          narrowed.values.every((value) => condition.values.includes(value))
        );
      }),
    ),
  );
}

/** A permission a person lacks, or holds without the values they asked for. */
export type MissingPermission = Readonly<{
  info: PermissionInfo;
  /** Values outside the person's restriction, when the permission is held. */
  outside?: AccessCondition;
}>;

/** How a missing permission is written for the person and for support. */
export function missingPermissionLine(missing: MissingPermission): string {
  const { info, outside } = missing;
  const source = info.source ? ` · ${info.source.title}` : "";
  const dimension = outside
    ? info.restrictions.find((item) => item.id === outside.dimension)
    : undefined;
  const values = outside?.values
    .map((item) =>
      item.label && item.label !== item.value
        ? `${item.value} – ${item.label}`
        : item.value,
    )
    .join(", ");
  return `• ${info.code} — ${info.title}${source}${
    outside
      ? `, com acesso a ${dimension?.title ?? outside.dimension}${dimension ? ` (${dimension.code})` : ""}: ${values}`
      : ""
  }`;
}

/**
 * The deterministic Portuguese answer when a request needs permissions the
 * person does not hold: what was refused, the identification of each missing
 * permission and how to obtain it. No model writes or rewrites it.
 */
export function permissionDeniedMessage(
  subject: string,
  missing: readonly MissingPermission[],
): string {
  const plural = missing.length > 1;
  return [
    `Você não tem permissão para ${subject}.`,
    `${plural ? "Permissões necessárias" : "Permissão necessária"}:\n${missing.map(missingPermissionLine).join("\n")}`,
    `Se precisar desse acesso, entre em contato com o suporte e informe ${plural ? "os códigos acima" : "o código acima"} para a liberação.`,
  ].join("\n\n");
}

/**
 * Portuguese description of a restricted scope, for answers and denials:
 * "Empresa: 1 – Matriz, 3 – Filial; Vendedor: 12 – Ana" per rule, rules joined
 * with "ou". Labels come from the source when the grant was saved.
 */
export function describeScope(
  scope: DataScope,
  dimensions: readonly RestrictionDimension[],
): string | null {
  if (scope.kind === "all") return null;
  const title = (id: string) =>
    dimensions.find((item) => item.id === id)?.title ?? id;
  return scope.rules
    .map((rule) =>
      rule
        .map(
          (condition) =>
            `${title(condition.dimension)}: ${condition.values
              .map((item) =>
                item.label && item.label !== item.value
                  ? `${item.value} – ${item.label}`
                  : item.value,
              )
              .join(", ")}`,
        )
        .join("; "),
    )
    .join(" ou ");
}
