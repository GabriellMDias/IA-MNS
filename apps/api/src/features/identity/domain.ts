// Pure identity rules. No Fastify, Prisma or provider SDKs.
import {
  uniteScopes,
  unrestricted,
  restrictionLimits,
  type AccessCondition,
  type DataScope,
  type PermissionInfo,
} from "../../access.js";

export type Provider = "pdt" | "sankhya";
export const providers: readonly Provider[] = ["pdt", "sankhya"];
export type Surface = "direct" | "pdt" | "sankhya";
export type SessionMethod =
  "local" | "pdt" | "sankhya" | "bootstrap" | "enrollment";
export type Assurance = "single" | "mfa";
export type Role = "owner";

/** Administrative permission carried only by owners; never grantable directly. */
export const ADMIN_PERMISSION = "identity:admin";
/** Identification of the administrative permission for owners and support. */
export const ADMIN_PERMISSION_CODE = "IAM-ADM-01";

/**
 * A grantable permission contributed by composition: its identification and
 * restriction dimensions come from the module that owns the data. `access`
 * classifies risk: only `read` permissions may be granted automatically by
 * provider policy; `write` and `sensitive` always need an explicit owner grant.
 */
export type PermissionDescriptor = PermissionInfo &
  Readonly<{
    access: "read" | "write" | "sensitive";
    /** Providers whose active link grants this permission without manual approval. */
    autoGrantProviders: readonly Provider[];
  }>;

/** An explicit grant of a Person or a group; no conditions means every row. */
export type GrantRecord = Readonly<{
  permission: string;
  restrictions: readonly AccessCondition[];
}>;

export type ProviderGrant = Readonly<{
  provider: Provider;
  permission: string;
}>;

const permissionPattern = /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/;
const codePattern = /^[A-Z]{2,4}-[A-Z]{2,4}-\d{2}$/;
const dimensionPattern = /^[a-z][a-z_]{1,30}$/;
const dimensionCodePattern = /^[A-Z]{2,4}$/;

export function validateCatalog(
  catalog: readonly PermissionDescriptor[],
): void {
  const seen = new Set<string>();
  const codes = new Set<string>([ADMIN_PERMISSION_CODE]);
  const capabilities = new Set(
    catalog.flatMap((item) => (item.capability ? [item.capability] : [])),
  );
  for (const item of catalog) {
    if (
      !permissionPattern.test(item.permission) ||
      item.permission === ADMIN_PERMISSION ||
      capabilities.has(item.permission)
    )
      throw new Error(`Invalid identity permission ${item.permission}`);
    if (seen.has(item.permission))
      throw new Error(`Duplicate identity permission ${item.permission}`);
    seen.add(item.permission);
    if (!codePattern.test(item.code) || codes.has(item.code))
      throw new Error(`Invalid or duplicate permission code ${item.code}`);
    codes.add(item.code);
    if (
      item.capability !== null &&
      (!permissionPattern.test(item.capability) ||
        item.capability === ADMIN_PERMISSION)
    )
      throw new Error(`Invalid capability permission ${item.capability}`);
    const dimensions = new Set<string>();
    const dimensionCodes = new Set<string>();
    for (const dimension of item.restrictions) {
      if (
        !dimensionPattern.test(dimension.id) ||
        !dimensionCodePattern.test(dimension.code) ||
        dimensions.has(dimension.id) ||
        dimensionCodes.has(dimension.code)
      )
        throw new Error(
          `Invalid restriction ${dimension.id} of ${item.permission}`,
        );
      dimensions.add(dimension.id);
      dimensionCodes.add(dimension.code);
    }
    if (item.access !== "read" && item.autoGrantProviders.length > 0)
      throw new Error(
        `Only read permissions may be granted automatically: ${item.permission}`,
      );
  }
}

/**
 * Normalizes the restrictions an owner submits for one grant: dimensions the
 * permission declares, at most once each, with distinct non-empty values in a
 * stable order. Returns null for anything else.
 */
export function normalizeRestrictions(
  descriptor: PermissionDescriptor,
  input: readonly { dimension: string; values: readonly string[] }[],
): { dimension: string; values: string[] }[] | null {
  const result: { dimension: string; values: string[] }[] = [];
  for (const condition of input) {
    if (
      !descriptor.restrictions.some(
        (item) => item.id === condition.dimension,
      ) ||
      result.some((item) => item.dimension === condition.dimension)
    )
      return null;
    const values = [...new Set(condition.values.map((value) => value.trim()))];
    if (
      values.length === 0 ||
      values.length > restrictionLimits.values ||
      values.some((value) => !/^-?\d{1,15}$/.test(value))
    )
      return null;
    result.push({
      dimension: condition.dimension,
      values: values.sort((a, b) =>
        BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0,
      ),
    });
  }
  return result.sort(
    (a, b) =>
      descriptor.restrictions.findIndex((item) => item.id === a.dimension) -
      descriptor.restrictions.findIndex((item) => item.id === b.dimension),
  );
}

/** Where a held permission comes from, for owners and the person. */
export type AccessOrigin =
  | Readonly<{ kind: "owner" }>
  | Readonly<{ kind: "grant" }>
  | Readonly<{ kind: "group"; groupId: string }>
  | Readonly<{ kind: "provider"; provider: Provider }>;

export type EffectiveAccess = {
  /** Token scopes: held permissions, their capability permissions and identity:admin. */
  permissions: string[];
  /** One scope per held catalog permission. */
  scopes: Map<string, DataScope>;
  origins: Map<string, AccessOrigin[]>;
};

/**
 * Effective access is computed only from trusted server state. For each
 * catalog permission: owners hold it without restriction; otherwise the
 * explicit grants of the Person and of its groups are united; only when there
 * is no explicit grant may provider policy grant it, without restriction, so
 * an owner can narrow an automatically granted permission by granting it
 * explicitly. A grant restricted by a dimension the permission no longer
 * declares cannot be enforced and is ignored. Nothing from the browser or the
 * language model counts.
 */
export function effectiveAccess(input: {
  catalog: readonly PermissionDescriptor[];
  policy: readonly ProviderGrant[];
  grants: readonly GrantRecord[];
  groupGrants?: readonly (GrantRecord & { groupId: string })[];
  linkedProviders: readonly Provider[];
  roles: readonly Role[];
}): EffectiveAccess {
  const owner = input.roles.includes("owner");
  const scopes = new Map<string, DataScope>();
  const origins = new Map<string, AccessOrigin[]>();
  for (const item of input.catalog) {
    const enforceable = (grant: GrantRecord) =>
      grant.permission === item.permission &&
      grant.restrictions.every((condition) =>
        item.restrictions.some(
          (dimension) => dimension.id === condition.dimension,
        ),
      );
    const own = input.grants.filter(enforceable);
    const grouped = (input.groupGrants ?? []).filter(enforceable);
    const from: AccessOrigin[] = [
      ...(owner ? [{ kind: "owner" as const }] : []),
      ...(own.length ? [{ kind: "grant" as const }] : []),
      ...grouped.map((grant) => ({
        kind: "group" as const,
        groupId: grant.groupId,
      })),
    ];
    let scope: DataScope | null = null;
    if (owner) scope = unrestricted;
    else if (own.length || grouped.length)
      scope = uniteScopes(
        [...own, ...grouped].map((grant) =>
          grant.restrictions.length
            ? { kind: "restricted", rules: [grant.restrictions] }
            : unrestricted,
        ),
      );
    else {
      const providers = input.policy
        .filter(
          (rule) =>
            rule.permission === item.permission &&
            input.linkedProviders.includes(rule.provider),
        )
        .map((rule) => rule.provider);
      if (providers.length) {
        scope = unrestricted;
        from.push(
          ...[...new Set(providers)].map((provider) => ({
            kind: "provider" as const,
            provider,
          })),
        );
      }
    }
    if (scope) {
      scopes.set(item.permission, scope);
      origins.set(item.permission, from);
    }
  }
  const permissions = new Set<string>();
  for (const item of input.catalog)
    if (scopes.has(item.permission)) {
      permissions.add(item.permission);
      if (item.capability) permissions.add(item.capability);
    }
  if (owner) permissions.add(ADMIN_PERMISSION);
  return { permissions: [...permissions].sort(), scopes, origins };
}

/**
 * Provider grant policy. Defaults come from the catalog; an explicit override
 * may only narrow it to catalog-eligible read permissions (or disable it).
 */
export function providerGrantPolicy(
  catalog: readonly PermissionDescriptor[],
  override?: readonly ProviderGrant[],
): readonly ProviderGrant[] {
  const eligible = catalog.flatMap((item) =>
    item.autoGrantProviders.map((provider) => ({
      provider,
      permission: item.permission,
    })),
  );
  if (override === undefined) return eligible;
  for (const grant of override)
    if (
      !eligible.some(
        (item) =>
          item.provider === grant.provider &&
          item.permission === grant.permission,
      )
    )
      throw new Error(
        `Provider grant ${grant.provider}:${grant.permission} is not an eligible read permission`,
      );
  return override;
}

/** `provider:permission`, the notation of IA_MNS_PROVIDER_GRANTS and of the parameter. */
export function providerGrantKey(grant: ProviderGrant): string {
  return `${grant.provider}:${grant.permission}`;
}

export function parseProviderGrants(value: string): ProviderGrant[] {
  if (value.trim() === "none") return [];
  return value.split(",").map((entry) => {
    const match = /^(pdt|sankhya):([a-z][a-z0-9_]*:[a-z][a-z0-9_]*)$/.exec(
      entry.trim(),
    );
    if (!match) throw new Error("Invalid provider grant");
    return { provider: match[1] as Provider, permission: match[2] };
  });
}

/**
 * The conditions of a stored grant: one per restricted dimension, values in
 * numeric order. Rows are one admitted value each.
 */
export function grantConditions(
  rows: readonly { dimension: string; value: string; label: string }[],
): AccessCondition[] {
  const byDimension = new Map<string, { value: string; label: string }[]>();
  for (const row of rows)
    byDimension.set(row.dimension, [
      ...(byDimension.get(row.dimension) ?? []),
      { value: row.value, label: row.label },
    ]);
  return [...byDimension.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dimension, values]) => ({
      dimension,
      values: values.sort((a, b) =>
        BigInt(a.value) < BigInt(b.value)
          ? -1
          : BigInt(a.value) > BigInt(b.value)
            ? 1
            : 0,
      ),
    }));
}

/** The token scopes of {@link effectiveAccess} for unrestricted grants. */
export function effectivePermissions(input: {
  catalog: readonly PermissionDescriptor[];
  policy: readonly ProviderGrant[];
  grants: readonly string[];
  linkedProviders: readonly Provider[];
  roles: readonly Role[];
}): string[] {
  return effectiveAccess({
    ...input,
    grants: input.grants.map((permission) => ({
      permission,
      restrictions: [],
    })),
  }).permissions;
}

/** Normalizes a group name typed by an owner; null when unusable. */
export function normalizeGroupName(value: string): string | null {
  const name = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  return name.length >= 2 && name.length <= 80 && !/[\p{Cc}<>]/u.test(name)
    ? name
    : null;
}

/** Optional group description; empty means none. Undefined when unusable. */
export function normalizeGroupDescription(
  value: string | null,
): string | null | undefined {
  if (value === null) return null;
  const text = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (text.length === 0) return null;
  return text.length <= 300 && !/[\p{Cc}<>]/u.test(text) ? text : undefined;
}

export function normalizeLogin(login: string): string | null {
  const value = login.normalize("NFKC").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,63}$/.test(value) ? value : null;
}

/** Unicode NFKC compatibility normalization applied to user-typed text. */
export function nfkc(value: string): string {
  return value.normalize("NFKC");
}

/** NIST SP 800-63B style: length over composition; reject trivially derived values. */
export function passwordProblem(
  password: string,
  login: string | null,
): string | null {
  const length = [...nfkc(password)].length;
  if (length < 12) return "too_short";
  if (length > 256) return "too_long";
  if (login && password.toLowerCase().includes(login)) return "contains_login";
  if (/^(.)\1+$/.test(password)) return "repetitive";
  return null;
}

/** Provider-reported e-mail, normalized for hint matching only (never proof). */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.normalize("NFKC").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)
    ? email
    : null;
}

export function normalizeDisplayName(value: string): string | null {
  const name = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= 120 && !/[\p{Cc}<>]/u.test(name)
    ? name
    : null;
}

/** A Person must keep at least one way to sign in after removing a method. */
export function remainingMethods(input: {
  hasLocalCredential: boolean;
  linkCount: number;
}): number {
  return (input.hasLocalCredential ? 1 : 0) + input.linkCount;
}

/**
 * Fixed protocol lifetimes. Session duration, inactivity, recent
 * authentication and second-factor behavior are the administrable
 * {@link SecurityPolicy}; these remain fixed because they bound how long a
 * bearer, a one-time ticket or an in-flight flow can be replayed.
 */
export const lifetimes = {
  /** Access tokens stay short: other modules accept them until they expire. */
  accessTokenSeconds: 600,
  /** Embedded sessions renew silently through a new host proof. */
  embeddedSessionMs: 600_000,
  /** Window in which a concurrent refresh of the same browser is not reuse. */
  refreshRaceGraceMs: 30_000,
  mfaTicketMs: 5 * 60_000,
  providerFlowMs: 5 * 60_000,
  provisionTicketMs: 10 * 60_000,
  bootstrapTicketMs: 30 * 60_000,
  invitationTicketMs: 72 * 3600_000,
  totpSetupMs: 10 * 60_000,
} as const;

/** Temporary lockout: none for the first 5 failures, then 1, 2, 4 … ≤ 60 minutes. */
export function lockoutMs(failedAttempts: number): number {
  if (failedAttempts < 5) return 0;
  return Math.min(60, 2 ** (failedAttempts - 5)) * 60_000;
}

// ---------------- administrable authentication policy ----------------

export type MfaRequirement = "everyone" | "administrators" | "none";
export type SecurityPolicy = {
  /** Longest a direct session lasts from sign-in. */
  sessionMaxMinutes: number;
  /** Longest a direct session survives without user activity. */
  idleTimeoutMinutes: number;
  /** Recent authentication for sensitive changes to one's own account. */
  recentAuthMinutes: number;
  /** Recent strong authentication for administrative changes. */
  adminRecentAuthMinutes: number;
  /** Who must use a second factor with an IA-MNS password. */
  mfaRequirement: MfaRequirement;
  /** Days a browser skips the second factor at sign-in (non-owners); 0 = never. */
  rememberDeviceDays: number;
};
export type PolicyField = Exclude<keyof SecurityPolicy, "mfaRequirement">;

/** Secure defaults; also the policy before any owner changes it. */
export const defaultSecurityPolicy: Readonly<SecurityPolicy> = Object.freeze({
  sessionMaxMinutes: 12 * 60,
  idleTimeoutMinutes: 2 * 60,
  recentAuthMinutes: 10,
  adminRecentAuthMinutes: 30,
  mfaRequirement: "administrators",
  rememberDeviceDays: 0,
});

/**
 * Hard bounds (every environment, enforced again by database checks) and the
 * value above which a setting is reported as reducing security.
 */
export const policyLimits: Readonly<
  Record<PolicyField, { min: number; max: number; recommendedMax: number }>
> = Object.freeze({
  sessionMaxMinutes: { min: 60, max: 30 * 24 * 60, recommendedMax: 24 * 60 },
  idleTimeoutMinutes: { min: 15, max: 7 * 24 * 60, recommendedMax: 8 * 60 },
  recentAuthMinutes: { min: 5, max: 24 * 60, recommendedMax: 60 },
  adminRecentAuthMinutes: { min: 5, max: 4 * 60, recommendedMax: 60 },
  rememberDeviceDays: { min: 0, max: 90, recommendedMax: 30 },
});

export type PolicyProblem =
  | "out_of_range"
  | "idle_exceeds_session"
  | "recent_exceeds_session"
  | "mfa_none_in_production";

/** Problems that make a policy unacceptable in this environment. */
export function policyProblems(
  policy: SecurityPolicy,
  production: boolean,
): PolicyProblem[] {
  const problems: PolicyProblem[] = [];
  for (const [field, limit] of Object.entries(policyLimits) as [
    PolicyField,
    (typeof policyLimits)[PolicyField],
  ][]) {
    const value = policy[field];
    if (!Number.isInteger(value) || value < limit.min || value > limit.max)
      problems.push("out_of_range");
  }
  if (policy.idleTimeoutMinutes > policy.sessionMaxMinutes)
    problems.push("idle_exceeds_session");
  if (policy.recentAuthMinutes > policy.sessionMaxMinutes)
    problems.push("recent_exceeds_session");
  if (production && policy.mfaRequirement === "none")
    problems.push("mfa_none_in_production");
  return [...new Set(problems)];
}

export type PolicyWarning = PolicyField | "mfaRequirement";

/** Settings that significantly reduce security compared with the recommendation. */
export function policyWarnings(policy: SecurityPolicy): PolicyWarning[] {
  const warnings: PolicyWarning[] = (
    Object.entries(policyLimits) as [
      PolicyField,
      (typeof policyLimits)[PolicyField],
    ][]
  )
    .filter(([field, limit]) => policy[field] > limit.recommendedMax)
    .map(([field]) => field);
  if (policy.mfaRequirement === "none") warnings.push("mfaRequirement");
  return warnings;
}

/**
 * The policy actually enforced. Production never lets administrators skip the
 * second factor, even if a permissive policy was stored (for example in a
 * database copied from a test environment).
 */
export function effectivePolicy(
  stored: SecurityPolicy,
  production: boolean,
): SecurityPolicy {
  return production && stored.mfaRequirement === "none"
    ? { ...stored, mfaRequirement: "administrators" }
    : stored;
}

/** Whether a Person must sign in with a second factor under the policy. */
export function secondFactorRequired(
  policy: SecurityPolicy,
  owner: boolean,
): boolean {
  return (
    policy.mfaRequirement === "everyone" ||
    (policy.mfaRequirement === "administrators" && owner)
  );
}

/**
 * Days a browser may skip the second factor at sign-in. Never inside a host
 * page; for owners only when the policy makes the second factor optional,
 * which production never allows.
 */
export function rememberDeviceDaysFor(
  policy: SecurityPolicy,
  owner: boolean,
  direct: boolean,
): number {
  if (!direct || (owner && policy.mfaRequirement !== "none")) return 0;
  return policy.rememberDeviceDays;
}
