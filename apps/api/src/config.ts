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
] as const satisfies readonly ConfigMetadata[]);

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
