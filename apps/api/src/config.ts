import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

// This is the only application module that interprets environment values.
export const serverConfigSchema = Type.Object(
  {
    environment: Type.Union([
      Type.Literal("development"),
      Type.Literal("test"),
      Type.Literal("production"),
    ]),
    releaseId: Type.String({ pattern: "^[A-Za-z0-9._-]{1,128}$" }),
    host: Type.String({ minLength: 1 }),
    port: Type.Integer({ minimum: 0, maximum: 65535 }),
    logLevel: Type.Union([
      Type.Literal("fatal"),
      Type.Literal("error"),
      Type.Literal("warn"),
      Type.Literal("info"),
      Type.Literal("debug"),
      Type.Literal("trace"),
    ]),
    shutdownTimeoutMs: Type.Integer({ minimum: 100, maximum: 30000 }),
    otlpEndpoint: Type.Optional(Type.String({ format: "uri" })),
    traceSampleRatio: Type.Number({ minimum: 0, maximum: 1 }),
    databaseUrl: Type.Optional(Type.String({ minLength: 1 })),
    tokenIssuer: Type.Optional(Type.String({ minLength: 1 })),
    tokenAudience: Type.Optional(Type.String({ minLength: 1 })),
    tokenJwksUrl: Type.Optional(Type.String({ minLength: 1 })),
    openaiApiKey: Type.Optional(Type.String({ minLength: 1 })),
    openaiModel: Type.String({ minLength: 1, maxLength: 100 }),
    sankhyaUser: Type.Optional(Type.String({ minLength: 1 })),
    sankhyaPassword: Type.Optional(Type.String({ minLength: 1 })),
    sankhyaConnectString: Type.Optional(Type.String({ minLength: 1 })),
    oracleClientLibDir: Type.Optional(Type.String({ minLength: 1 })),
    localAccess: Type.Boolean(),
    devAccessToken: Type.Optional(Type.String({ pattern: "^[a-f0-9]{64}$" })),
    devAccessOrigin: Type.Optional(Type.String({ minLength: 1 })),
    devAccessExpiresAt: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

export type ServerConfig = Readonly<Static<typeof serverConfigSchema>>;
export type ClientConfig = Readonly<Record<string, never>>;

type ConfigMetadata = {
  key: keyof ServerConfig;
  name: string;
  type: string;
  required: boolean;
  default: string;
  visibility: "server";
  classification: "PUBLIC" | "INTERNAL" | "RESTRICTED";
  secret: boolean;
  purpose: string;
};

export const configReference = Object.freeze([
  {
    key: "environment",
    name: "ORION_ENV",
    type: "development | test | production",
    required: true,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose: "Runtime environment.",
  },
  {
    key: "releaseId",
    name: "ORION_RELEASE_ID",
    type: "artifact identifier, 1..128 ASCII letters/digits/._-",
    required: false,
    default: "local",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose:
      "Actual artifact revision for correlated logs and traces; local for unversioned development.",
  },
  {
    key: "host",
    name: "ORION_API_HOST",
    type: "nonempty string",
    required: false,
    default: "127.0.0.1",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose: "Listen address; loopback by default.",
  },
  {
    key: "port",
    name: "ORION_API_PORT",
    type: "integer 0..65535",
    required: false,
    default: "3000",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose: "Listen port; zero selects an ephemeral port.",
  },
  {
    key: "logLevel",
    name: "ORION_LOG_LEVEL",
    type: "Pino level",
    required: false,
    default: "info",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose: "Structured log threshold.",
  },
  {
    key: "shutdownTimeoutMs",
    name: "ORION_SHUTDOWN_TIMEOUT_MS",
    type: "integer 100..30000",
    required: false,
    default: "5000",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose: "Total graceful shutdown deadline.",
  },
  {
    key: "otlpEndpoint",
    name: "ORION_OTLP_ENDPOINT",
    type: "http(s) URL",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose: "Optional OTLP HTTP collector base URL.",
  },
  {
    key: "traceSampleRatio",
    name: "ORION_TRACE_SAMPLE_RATIO",
    type: "number 0..1",
    required: false,
    default: "1",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose: "Trace sampling probability.",
  },
  {
    key: "databaseUrl",
    name: "ORION_DATABASE_URL",
    type: "PostgreSQL URL",
    required: false,
    default: "",
    visibility: "server",
    classification: "RESTRICTED",
    secret: true,
    purpose:
      "Runtime PostgreSQL credential; enables the database for modules that require it and adds it to readiness.",
  },
  {
    key: "tokenIssuer",
    name: "ORION_TOKEN_ISSUER",
    type: "issuer URL",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose:
      "Expected access-token issuer; configure with audience and JWKS URL to enable bearer authentication.",
  },
  {
    key: "tokenAudience",
    name: "ORION_TOKEN_AUDIENCE",
    type: "nonempty string",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose: "Expected API access-token audience.",
  },
  {
    key: "tokenJwksUrl",
    name: "ORION_TOKEN_JWKS_URL",
    type: "http(s) URL",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose: "Trusted issuer public-key endpoint.",
  },
  {
    key: "openaiApiKey",
    name: "OPENAI_API_KEY",
    type: "nonempty string",
    default: "",
    secret: true,
    purpose:
      "Dedicated IA-MNS project key; required for agent routing and capability interpretation.",
    required: false,
    visibility: "server",
    classification: "RESTRICTED",
  },
  {
    key: "openaiModel",
    name: "OPENAI_MODEL",
    type: "model identifier",
    default: "gpt-6.1-sol",
    secret: false,
    purpose: "Responses API model supporting strict function calling.",
    required: false,
    visibility: "server",
    classification: "INTERNAL",
  },
  {
    key: "sankhyaUser",
    name: "SANKHYA_DB_USER",
    type: "nonempty string",
    default: "",
    secret: true,
    purpose:
      "Oracle account with CREATE SESSION and only SELECT grants on the sales reference tables.",
    required: false,
    visibility: "server",
    classification: "RESTRICTED",
  },
  {
    key: "sankhyaPassword",
    name: "SANKHYA_DB_PASSWORD",
    type: "nonempty string",
    default: "",
    secret: true,
    purpose:
      "Restricted Oracle account password; configure with user and connect string.",
    required: false,
    visibility: "server",
    classification: "RESTRICTED",
  },
  {
    key: "sankhyaConnectString",
    name: "SANKHYA_DB_CONNECT_STRING",
    type: "Oracle connect descriptor",
    default: "",
    secret: true,
    purpose:
      "Oracle Easy Connect or full descriptor, without embedded credentials.",
    required: false,
    visibility: "server",
    classification: "RESTRICTED",
  },
  {
    key: "oracleClientLibDir",
    name: "SANKHYA_ORACLE_CLIENT_LIB_DIR",
    type: "local directory",
    default: "",
    secret: false,
    purpose:
      "Optional Oracle Client 19+ library directory; enables Thick mode when needed.",
    required: false,
    visibility: "server",
    classification: "INTERNAL",
  },
  {
    key: "localAccess",
    name: "IA_MNS_LOCAL_ACCESS",
    type: "true | false",
    default: "false",
    secret: false,
    purpose:
      "Explicit local development access; forbidden in production or on a non-loopback listener.",
    required: false,
    visibility: "server",
    classification: "INTERNAL",
  },
  {
    key: "devAccessToken",
    name: "IA_MNS_DEV_ACCESS_TOKEN",
    type: "64 lowercase hexadecimal characters",
    default: "",
    secret: true,
    purpose:
      "Temporary bearer for an owner-controlled LAN test; non-production loopback API only, paired with origin and expiration. Never browser configuration.",
    required: false,
    visibility: "server",
    classification: "RESTRICTED",
  },
  {
    key: "devAccessOrigin",
    name: "IA_MNS_DEV_ACCESS_ORIGIN",
    type: "private IPv4 HTTP origin",
    default: "",
    secret: false,
    purpose:
      "Exact browser origin for the temporary LAN test; no credentials, path or wildcard.",
    required: false,
    visibility: "server",
    classification: "INTERNAL",
  },
  {
    key: "devAccessExpiresAt",
    name: "IA_MNS_DEV_ACCESS_EXPIRES_AT",
    type: "Unix timestamp in seconds",
    default: "",
    secret: false,
    purpose:
      "Absolute temporary bearer expiry; at most two hours after startup. Checked on every request, not renewed.",
    required: false,
    visibility: "server",
    classification: "INTERNAL",
  },
] as const satisfies readonly ConfigMetadata[]);

export function isPrivateIpv4(value: string): boolean {
  const parts = value.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)
  )
    return false;
  const [first, second] = parts.map(Number);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (value.trim() === "") return Number.NaN;
  return Number(value);
}

export function parseServerConfig(
  env: Readonly<Record<string, string | undefined>>,
): ServerConfig {
  const candidate = {
    environment: env.ORION_ENV,
    ...(env.IA_MNS_DEV_ACCESS_TOKEN === undefined
      ? {}
      : { devAccessToken: env.IA_MNS_DEV_ACCESS_TOKEN }),
    ...(env.IA_MNS_DEV_ACCESS_ORIGIN === undefined
      ? {}
      : { devAccessOrigin: env.IA_MNS_DEV_ACCESS_ORIGIN }),
    ...(env.IA_MNS_DEV_ACCESS_EXPIRES_AT === undefined
      ? {}
      : { devAccessExpiresAt: Number(env.IA_MNS_DEV_ACCESS_EXPIRES_AT) }),
    openaiModel: env.OPENAI_MODEL ?? "gpt-6.1-sol",
    localAccess: env.IA_MNS_LOCAL_ACCESS === "true",
    ...(env.OPENAI_API_KEY === undefined
      ? {}
      : { openaiApiKey: env.OPENAI_API_KEY }),
    ...(env.SANKHYA_DB_USER === undefined
      ? {}
      : { sankhyaUser: env.SANKHYA_DB_USER }),
    ...(env.SANKHYA_DB_PASSWORD === undefined
      ? {}
      : { sankhyaPassword: env.SANKHYA_DB_PASSWORD }),
    ...(env.SANKHYA_DB_CONNECT_STRING === undefined
      ? {}
      : { sankhyaConnectString: env.SANKHYA_DB_CONNECT_STRING }),
    ...(env.SANKHYA_ORACLE_CLIENT_LIB_DIR === undefined
      ? {}
      : { oracleClientLibDir: env.SANKHYA_ORACLE_CLIENT_LIB_DIR }),
    releaseId: env.ORION_RELEASE_ID ?? "local",
    host: env.ORION_API_HOST ?? "127.0.0.1",
    port: numberFromEnv(env.ORION_API_PORT, 3000),
    logLevel: env.ORION_LOG_LEVEL ?? "info",
    shutdownTimeoutMs: numberFromEnv(env.ORION_SHUTDOWN_TIMEOUT_MS, 5000),
    ...(env.ORION_OTLP_ENDPOINT === undefined
      ? {}
      : { otlpEndpoint: env.ORION_OTLP_ENDPOINT }),
    traceSampleRatio: numberFromEnv(env.ORION_TRACE_SAMPLE_RATIO, 1),
    ...(env.ORION_DATABASE_URL === undefined
      ? {}
      : { databaseUrl: env.ORION_DATABASE_URL }),
    ...(env.ORION_TOKEN_ISSUER === undefined
      ? {}
      : { tokenIssuer: env.ORION_TOKEN_ISSUER }),
    ...(env.ORION_TOKEN_AUDIENCE === undefined
      ? {}
      : { tokenAudience: env.ORION_TOKEN_AUDIENCE }),
    ...(env.ORION_TOKEN_JWKS_URL === undefined
      ? {}
      : { tokenJwksUrl: env.ORION_TOKEN_JWKS_URL }),
  };
  if (!Value.Check(serverConfigSchema, candidate)) {
    throw new Error("Invalid API configuration");
  }
  if (
    env.IA_MNS_LOCAL_ACCESS !== undefined &&
    !["true", "false"].includes(env.IA_MNS_LOCAL_ACCESS)
  )
    throw new Error("Invalid API configuration: local access must be boolean");
  if (
    candidate.localAccess &&
    (candidate.environment === "production" ||
      !["127.0.0.1", "::1"].includes(candidate.host))
  )
    throw new Error(
      "Invalid API configuration: local access requires a non-production loopback listener",
    );
  const devValues = [
    candidate.devAccessToken,
    candidate.devAccessOrigin,
    candidate.devAccessExpiresAt,
  ];
  if (devValues.some((value) => value !== undefined)) {
    if (
      devValues.some((value) => value === undefined) ||
      candidate.environment === "production" ||
      candidate.localAccess ||
      !["127.0.0.1", "::1"].includes(candidate.host) ||
      candidate.tokenIssuer ||
      candidate.tokenAudience ||
      candidate.tokenJwksUrl
    )
      throw new Error(
        "Invalid API configuration: temporary access requires isolated non-production loopback mode",
      );
    const now = Math.floor(Date.now() / 1000);
    if (
      candidate.devAccessExpiresAt! <= now ||
      candidate.devAccessExpiresAt! > now + 7200
    )
      throw new Error(
        "Invalid API configuration: temporary access expiry must be within two hours",
      );
    let origin: URL;
    try {
      origin = new URL(candidate.devAccessOrigin!);
    } catch {
      throw new Error("Invalid API configuration: temporary access origin");
    }
    if (
      origin.protocol !== "http:" ||
      origin.origin !== candidate.devAccessOrigin ||
      !isPrivateIpv4(origin.hostname)
    )
      throw new Error(
        "Invalid API configuration: temporary access requires an exact private IPv4 HTTP origin",
      );
  }
  const oracleValues = [
    candidate.sankhyaUser,
    candidate.sankhyaPassword,
    candidate.sankhyaConnectString,
  ];
  if (oracleValues.some(Boolean) && oracleValues.some((value) => !value))
    throw new Error("Invalid API configuration: incomplete Sankhya connection");
  if (candidate.otlpEndpoint !== undefined) {
    let endpoint: URL;
    try {
      endpoint = new URL(candidate.otlpEndpoint);
    } catch {
      throw new Error("Invalid API configuration: /otlpEndpoint");
    }
    if (
      !["http:", "https:"].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    ) {
      throw new Error("Invalid API configuration: /otlpEndpoint");
    }
  }
  const authValues = [
    candidate.tokenIssuer,
    candidate.tokenAudience,
    candidate.tokenJwksUrl,
  ];
  // Access-token verification is all-or-none; module requirements are
  // enforced when modules activate.
  if (authValues.some(Boolean) && authValues.some((value) => !value))
    throw new Error(
      "Invalid API configuration: incomplete access-token verification",
    );
  for (const value of [
    candidate.databaseUrl,
    candidate.tokenIssuer,
    candidate.tokenJwksUrl,
  ]) {
    if (!value) continue;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("Invalid API configuration: URL");
    }
    const protocols =
      value === candidate.databaseUrl
        ? ["postgres:", "postgresql:"]
        : ["http:", "https:"];
    if (!protocols.includes(parsed.protocol))
      throw new Error("Invalid API configuration: URL protocol");
    if (value !== candidate.databaseUrl && parsed.protocol !== "https:") {
      if (
        candidate.environment === "production" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
      )
        throw new Error("Invalid API configuration: token URL must use HTTPS");
    }
    if (
      !parsed.hostname ||
      (value !== candidate.databaseUrl &&
        (parsed.username || parsed.password || parsed.search || parsed.hash))
    )
      throw new Error("Invalid API configuration: URL components");
  }
  if (
    candidate.tokenAudience !== undefined &&
    candidate.tokenAudience.trim() === ""
  )
    throw new Error("Invalid API configuration: token audience");
  return Object.freeze(candidate);
}

// No browser-consumable API configuration exists. This projection
// prevents server settings from leaking into a future client configuration.
export function clientConfigFrom(config: ServerConfig): ClientConfig {
  void config;
  return Object.freeze({});
}
