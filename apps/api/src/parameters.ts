import { aiTraceLevels, type AiTraceLevel } from "./ai/trace.js";

/**
 * Operational parameters: product behavior that an owner may change at run
 * time from administration, without a deployment or restart. This catalog is
 * their single definition (type, domain, environment limits and when a change
 * takes effect); the validated environment (`config.ts`) keeps secrets and the
 * bootstrap/infrastructure settings, and supplies each parameter's
 * installation default.
 *
 * Resolution: a valid value saved by an owner, otherwise the installation
 * default (the environment variable named here, or the product default that
 * `config.ts` applies). Production limits apply to both. There is no cache:
 * every read sees the latest saved value on every API instance.
 */
export type ParameterValues = {
  /** Model identifier sent to the AI provider by routing and interpretation. */
  "ai.model": string;
  /** How much of each AI turn is traced (see `ai/trace.ts`). */
  "ai.traceLevel": AiTraceLevel;
  /** Enabled automatic read grants, as `provider:permission`. */
  "access.providerGrants": readonly string[];
};
export type ParameterKey = keyof ParameterValues;
export const parameterKeys = [
  "ai.model",
  "ai.traceLevel",
  "access.providerGrants",
] as const satisfies readonly ParameterKey[];

export type ParameterGroup = "ai" | "access";
/** When a saved change starts to apply; no parameter needs a restart. */
export type ParameterEffect = "next_turn" | "next_access_token";
export type ParameterOption = Readonly<{ value: string; label: string }>;
export type ParameterControl =
  | Readonly<{ kind: "text"; pattern: string; maxLength: number }>
  | Readonly<{
      kind: "choice";
      options: readonly string[];
      /** Options this environment refuses to save. */
      refused: readonly string[];
    }>
  | Readonly<{ kind: "set"; options: readonly ParameterOption[] }>;

export type ParameterDefinition = Readonly<{
  key: ParameterKey;
  group: ParameterGroup;
  effect: ParameterEffect;
  /** Environment variable that sets the installation default; never a secret. */
  environment: string;
  control: ParameterControl;
}>;

/** What composition supplies: installation defaults and catalog-derived domains. */
export type ParameterSetup = Readonly<{
  production: boolean;
  defaults: Readonly<ParameterValues>;
  /** Provider grants eligible under the permission catalog. */
  providerGrantOptions: readonly ParameterOption[];
}>;

export type StoredParameter = Readonly<{
  key: string;
  /** JSON value saved by an owner; null after a reset to the default. */
  value: unknown;
  version: number;
  updatedBy: string | null;
  updatedAt: Date;
}>;

/** Persistence of saved values; conditional writes protect concurrent owners. */
export interface ParameterStore {
  read(key: ParameterKey): Promise<StoredParameter | null>;
  list(): Promise<StoredParameter[]>;
  /**
   * Saves `value` (null resets to the default) when the stored version equals
   * `expectedVersion` (0 when nothing was ever saved). Returns the new
   * version, or null when another change came first.
   */
  write(
    key: ParameterKey,
    value: string | readonly string[] | null,
    expectedVersion: number,
    actor: string,
    now: Date,
  ): Promise<number | null>;
}

export type ParameterState = Readonly<{
  definition: ParameterDefinition;
  /** The value the application uses now. */
  value: ParameterValues[ParameterKey];
  /** Installation default used when no valid value is saved. */
  defaultValue: ParameterValues[ParameterKey];
  source: "administration" | "default";
  /** A saved value that is no longer valid here and is therefore not (fully) used. */
  storedInvalid: boolean;
  version: number;
  updatedBy: string | null;
  updatedAt: Date | null;
}>;

export type ParameterCheck<K extends ParameterKey> =
  | { ok: true; value: ParameterValues[K] }
  | { ok: false; reason: "invalid" | "not_allowed" };

const modelPattern = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$";

export class OperationalParameters {
  readonly definitions: readonly ParameterDefinition[];
  private readonly store: ParameterStore | undefined;
  private readonly setup: ParameterSetup;
  constructor(store: ParameterStore | undefined, setup: ParameterSetup) {
    this.store = store;
    this.setup = setup;
    this.definitions = [
      {
        key: "ai.model",
        group: "ai",
        effect: "next_turn",
        environment: "OPENAI_MODEL",
        control: { kind: "text", pattern: modelPattern, maxLength: 100 },
      },
      {
        key: "ai.traceLevel",
        group: "ai",
        effect: "next_turn",
        environment: "IA_MNS_AI_TRACE",
        control: {
          kind: "choice",
          options: aiTraceLevels,
          // Confidential content traces need an approved retention and access
          // policy before any production use (PH-09).
          refused: setup.production ? ["content"] : [],
        },
      },
      {
        key: "access.providerGrants",
        group: "access",
        effect: "next_access_token",
        environment: "IA_MNS_PROVIDER_GRANTS",
        control: { kind: "set", options: setup.providerGrantOptions },
      },
    ];
  }

  definition(key: string): ParameterDefinition | undefined {
    return this.definitions.find((item) => item.key === key);
  }

  /** The value the application must use now. */
  async get<K extends ParameterKey>(key: K): Promise<ParameterValues[K]> {
    return this.resolve(key, (await this.store?.read(key)) ?? null).value;
  }

  /** Every parameter with its value, default, origin and last change. */
  async states(): Promise<ParameterState[]> {
    const stored = new Map(
      (await this.store?.list())?.map((item) => [item.key, item]) ?? [],
    );
    return this.definitions.map((definition) => {
      const row = stored.get(definition.key) ?? null;
      const resolved = this.resolve(definition.key, row);
      return {
        definition,
        value: resolved.value,
        defaultValue: this.setup.defaults[definition.key],
        source: resolved.source,
        storedInvalid: resolved.storedInvalid,
        version: row?.version ?? 0,
        updatedBy: row?.updatedBy ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  /** Validates and normalizes an owner's value for this environment. */
  check<K extends ParameterKey>(key: K, value: unknown): ParameterCheck<K> {
    const control = this.definition(key)!.control;
    if (control.kind === "text") {
      const text = typeof value === "string" ? value.trim() : "";
      return new RegExp(control.pattern).test(text)
        ? { ok: true, value: text as ParameterValues[K] }
        : { ok: false, reason: "invalid" };
    }
    if (control.kind === "choice") {
      if (typeof value !== "string" || !control.options.includes(value))
        return { ok: false, reason: "invalid" };
      return control.refused.includes(value)
        ? { ok: false, reason: "not_allowed" }
        : { ok: true, value: value as ParameterValues[K] };
    }
    const known = control.options.map((option) => option.value);
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== "string" || !known.includes(item))
    )
      return { ok: false, reason: "invalid" };
    // Stored in catalog order without duplicates, so equal sets compare equal.
    return {
      ok: true,
      value: known.filter((item) =>
        (value as string[]).includes(item),
      ) as unknown as ParameterValues[K],
    };
  }

  /**
   * Saves an owner's value (null resets to the default). The caller authorizes
   * the owner and audits the returned before/after values.
   */
  async save<K extends ParameterKey>(
    key: K,
    value: unknown,
    expectedVersion: number,
    actor: string,
    now: Date,
  ): Promise<
    | {
        result: "saved";
        before: ParameterValues[K];
        after: ParameterValues[K];
        version: number;
      }
    | { result: "invalid" | "not_allowed" | "conflict" | "unavailable" }
  > {
    if (!this.store) return { result: "unavailable" };
    let saved: string | readonly string[] | null = null;
    if (value !== null) {
      const checked = this.check(key, value);
      if (!checked.ok) return { result: checked.reason };
      saved = checked.value;
    }
    const before = this.resolve(key, await this.store.read(key)).value;
    const version = await this.store.write(
      key,
      saved,
      expectedVersion,
      actor,
      now,
    );
    if (version === null) return { result: "conflict" };
    const after = this.resolve(key, {
      key,
      value: saved,
      version,
      updatedBy: actor,
      updatedAt: now,
    }).value;
    return { result: "saved", before, after, version };
  }

  private resolve<K extends ParameterKey>(
    key: K,
    stored: StoredParameter | null,
  ): {
    value: ParameterValues[K];
    source: "administration" | "default";
    storedInvalid: boolean;
  } {
    const fallback = this.setup.defaults[key];
    const control = this.definition(key)!.control;
    if (!stored || stored.value === null)
      return {
        value: this.limit(key, fallback),
        source: "default",
        storedInvalid: false,
      };
    if (control.kind === "set") {
      // Narrowing is always safe for grants: options that left the catalog are
      // ignored instead of discarding the owner's choice.
      if (!Array.isArray(stored.value))
        return {
          value: this.limit(key, fallback),
          source: "default",
          storedInvalid: true,
        };
      const known = control.options.map((option) => option.value);
      const values = stored.value as unknown[];
      return {
        value: known.filter((item) =>
          values.includes(item),
        ) as unknown as ParameterValues[K],
        source: "administration",
        storedInvalid: values.some(
          (item) => typeof item !== "string" || !known.includes(item),
        ),
      };
    }
    const valid =
      typeof stored.value === "string" &&
      (control.kind === "choice"
        ? control.options.includes(stored.value)
        : new RegExp(control.pattern).test(stored.value));
    if (!valid)
      return {
        value: this.limit(key, fallback),
        source: "default",
        storedInvalid: true,
      };
    const value = this.limit(key, stored.value as ParameterValues[K]);
    return {
      value,
      source: "administration",
      storedInvalid: value !== stored.value,
    };
  }

  /** Production floor: content tracing is never used there, whatever is stored. */
  private limit<K extends ParameterKey>(
    key: K,
    value: ParameterValues[K],
  ): ParameterValues[K] {
    return key === "ai.traceLevel" &&
      this.setup.production &&
      value === "content"
      ? ("metadata" as ParameterValues[K])
      : value;
  }
}
