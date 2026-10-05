// Pure identity rules. No Fastify, Prisma or provider SDKs.

export type Provider = "pdt" | "sankhya";
export const providers: readonly Provider[] = ["pdt", "sankhya"];
export type Surface = "direct" | "pdt" | "sankhya";
export type SessionMethod =
  "local" | "pdt" | "sankhya" | "bootstrap" | "enrollment";
export type Assurance = "single" | "mfa";
export type Role = "owner";

/** Administrative permission carried only by owners; never grantable directly. */
export const ADMIN_PERMISSION = "identity:admin";

/**
 * A grantable capability permission contributed by composition. `access`
 * classifies risk: only `read` permissions may be granted automatically by
 * provider policy; `write` and `sensitive` always need an explicit owner grant.
 */
export type PermissionDescriptor = Readonly<{
  permission: string;
  title: string;
  access: "read" | "write" | "sensitive";
  /** Providers whose active link grants this permission without manual approval. */
  autoGrantProviders: readonly Provider[];
}>;

export type ProviderGrant = Readonly<{
  provider: Provider;
  permission: string;
}>;

const permissionPattern = /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/;

export function validateCatalog(
  catalog: readonly PermissionDescriptor[],
): void {
  const seen = new Set<string>();
  for (const item of catalog) {
    if (
      !permissionPattern.test(item.permission) ||
      item.permission === ADMIN_PERMISSION
    )
      throw new Error(`Invalid identity permission ${item.permission}`);
    if (seen.has(item.permission))
      throw new Error(`Duplicate identity permission ${item.permission}`);
    seen.add(item.permission);
    if (item.access !== "read" && item.autoGrantProviders.length > 0)
      throw new Error(
        `Only read permissions may be granted automatically: ${item.permission}`,
      );
  }
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
 * Effective permissions are computed only from trusted server state: explicit
 * grants that still exist in the catalog, provider policy for active links,
 * and internal roles. Nothing from the browser or the language model counts.
 */
export function effectivePermissions(input: {
  catalog: readonly PermissionDescriptor[];
  policy: readonly ProviderGrant[];
  grants: readonly string[];
  linkedProviders: readonly Provider[];
  roles: readonly Role[];
}): string[] {
  const known = new Set(input.catalog.map((item) => item.permission));
  const result = new Set<string>();
  for (const grant of input.grants) if (known.has(grant)) result.add(grant);
  for (const rule of input.policy)
    if (
      input.linkedProviders.includes(rule.provider) &&
      known.has(rule.permission)
    )
      result.add(rule.permission);
  if (input.roles.includes("owner")) {
    for (const item of input.catalog) result.add(item.permission);
    result.add(ADMIN_PERMISSION);
  }
  return [...result].sort();
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

export const lifetimes = {
  accessTokenSeconds: 600,
  directSessionAbsoluteMs: 12 * 3600_000,
  directSessionIdleMs: 2 * 3600_000,
  embeddedSessionMs: 600_000,
  recentAuthenticationMs: 10 * 60_000,
  adminRecentAuthenticationMs: 30 * 60_000,
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
