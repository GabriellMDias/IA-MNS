import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

/**
 * AI model identifiers: the domain of OPENAI_MODEL and of the ai.model
 * operational parameter, so the installation default is always a value
 * owners could also save.
 */
export const aiModelPattern = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$";

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
    openaiModel: Type.String({ pattern: aiModelPattern }),
    aiTrace: Type.Union([
      Type.Literal("off"),
      Type.Literal("metadata"),
      Type.Literal("content"),
    ]),
    sankhyaUser: Type.Optional(Type.String({ minLength: 1 })),
    sankhyaPassword: Type.Optional(Type.String({ minLength: 1 })),
    sankhyaConnectString: Type.Optional(Type.String({ minLength: 1 })),
    oracleClientLibDir: Type.Optional(Type.String({ minLength: 1 })),
    vrmasterHost: Type.Optional(
      Type.String({ pattern: "^[A-Za-z0-9.:_-]{1,253}$" }),
    ),
    vrmasterPort: Type.Integer({ minimum: 1, maximum: 65535 }),
    vrmasterDatabase: Type.Optional(
      Type.String({ minLength: 1, maxLength: 63 }),
    ),
    vrmasterUser: Type.Optional(Type.String({ minLength: 1, maxLength: 63 })),
    vrmasterPassword: Type.Optional(Type.String({ minLength: 1 })),
    vrmasterSslMode: Type.Union([
      Type.Literal("verify-full"),
      Type.Literal("disable"),
    ]),
    localAccess: Type.Boolean(),
    devAccessToken: Type.Optional(Type.String({ pattern: "^[a-f0-9]{64}$" })),
    devAccessOrigin: Type.Optional(Type.String({ minLength: 1 })),
    devAccessExpiresAt: Type.Optional(Type.Integer({ minimum: 1 })),
    publicOrigin: Type.Optional(Type.String({ minLength: 1 })),
    identitySigningKey: Type.Optional(
      Type.String({ pattern: "^[A-Za-z0-9_-]{40,400}$" }),
    ),
    identityEncryptionKey: Type.Optional(
      Type.String({ pattern: "^[A-Za-z0-9_-]{43}$" }),
    ),
    identityAudience: Type.String({ pattern: "^[A-Za-z0-9._:-]{1,100}$" }),
    providerGrants: Type.Optional(
      Type.String({ minLength: 1, maxLength: 1000 }),
    ),
    pdtBaseUrl: Type.Optional(Type.String({ minLength: 1 })),
    pdtIssuer: Type.Optional(Type.String({ minLength: 1 })),
    pdtClientId: Type.Optional(
      Type.String({ pattern: "^[a-zA-Z0-9_-]{1,64}$" }),
    ),
    pdtClientSecret: Type.Optional(Type.String({ minLength: 32 })),
    pdtRedirectUri: Type.Optional(Type.String({ minLength: 1 })),
    pdtEmbedOrigin: Type.Optional(Type.String({ minLength: 1 })),
    sankhyaIdentityIssuer: Type.Optional(
      Type.String({ pattern: "^[A-Za-z0-9._:/-]{3,200}$" }),
    ),
    sankhyaIdentityKeys: Type.Optional(
      Type.String({ minLength: 2, maxLength: 20000 }),
    ),
    sankhyaIdentityAuthorizeUrl: Type.Optional(Type.String({ minLength: 1 })),
    sankhyaEmbedOrigin: Type.Optional(Type.String({ minLength: 1 })),
    sankhyaDirectoryView: Type.Optional(
      Type.String({
        pattern:
          "^[A-Za-z][A-Za-z0-9_$#]{0,127}(\\.[A-Za-z][A-Za-z0-9_$#]{0,127})?$",
      }),
    ),
    sankhyaSessionTrust: Type.Union([
      Type.Literal("pending"),
      Type.Literal("approved"),
    ]),
  },
  { additionalProperties: false },
);

export type ServerConfig = Readonly<Static<typeof serverConfigSchema>>;
export type ClientConfig = Readonly<Record<string, never>>;

/**
 * Why a setting is an environment variable:
 * - bootstrap: infrastructure, deployment or trust configuration the process
 *   needs before (or independently of) its own storage; changed by deployment
 *   and restart;
 * - secret: a credential or key; never exposed through an API or interface;
 * - parameter: installation default of an operational parameter that owners
 *   override at run time in administration (`src/parameters.ts`, ADR-0028);
 * - development: local development or testing aid, refused in production.
 */
export type ConfigRole = "bootstrap" | "secret" | "parameter" | "development";

type ConfigMetadata = {
  key: keyof ServerConfig;
  name: string;
  role: ConfigRole;
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
    role: "bootstrap",
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
    role: "bootstrap",
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
    role: "bootstrap",
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
    role: "bootstrap",
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
    role: "bootstrap",
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
    role: "bootstrap",
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
    role: "bootstrap",
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
    role: "bootstrap",
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
    role: "secret",
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
    role: "bootstrap",
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
    role: "bootstrap",
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
    role: "bootstrap",
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
    role: "secret",
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
    role: "parameter",
    type: "model identifier",
    default: "gpt-6.1-sol",
    secret: false,
    purpose:
      "Installation default of the AI model (Responses API with strict function calling); an owner value in administration (Parâmetros) takes precedence.",
    required: false,
    visibility: "server",
    classification: "INTERNAL",
  },
  {
    key: "aiTrace",
    name: "IA_MNS_AI_TRACE",
    role: "parameter",
    type: "off | metadata | content",
    default: "metadata",
    secret: false,
    purpose:
      "Installation default of AI turn tracing; an owner value in administration (Parâmetros) takes precedence. metadata logs allowlisted decisions, timings and token counts without user content; content also stores confidential interpretation traces with each turn and is refused in production until PH-09.",
    required: false,
    visibility: "server",
    classification: "INTERNAL",
  },
  {
    key: "sankhyaUser",
    name: "SANKHYA_DB_USER",
    role: "secret",
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
    role: "secret",
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
    role: "secret",
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
    role: "bootstrap",
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
    key: "vrmasterHost",
    name: "VRMASTER_DB_HOST",
    role: "bootstrap",
    type: "host name or IP address",
    default: "",
    secret: false,
    purpose:
      "VRMaster PostgreSQL server of the Pilar da Terra sales source; configure with name, user and password.",
    required: false,
    visibility: "server",
    classification: "RESTRICTED",
  },
  {
    key: "vrmasterPort",
    name: "VRMASTER_DB_PORT",
    role: "bootstrap",
    type: "integer 1..65535",
    default: "5432",
    secret: false,
    purpose: "VRMaster PostgreSQL port.",
    required: false,
    visibility: "server",
    classification: "INTERNAL",
  },
  {
    key: "vrmasterDatabase",
    name: "VRMASTER_DB_NAME",
    role: "bootstrap",
    type: "PostgreSQL database name",
    default: "",
    secret: false,
    purpose: "VRMaster database that holds the sales reference tables.",
    required: false,
    visibility: "server",
    classification: "INTERNAL",
  },
  {
    key: "vrmasterUser",
    name: "VRMASTER_DB_USER",
    role: "secret",
    type: "PostgreSQL role name",
    default: "",
    secret: true,
    purpose:
      "Dedicated read-only VRMaster role (PH-19) with SELECT only on the sales reference tables; never the PDT Connect account.",
    required: false,
    visibility: "server",
    classification: "RESTRICTED",
  },
  {
    key: "vrmasterPassword",
    name: "VRMASTER_DB_PASSWORD",
    role: "secret",
    type: "nonempty string",
    default: "",
    secret: true,
    purpose: "Password of the dedicated read-only VRMaster role.",
    required: false,
    visibility: "server",
    classification: "RESTRICTED",
  },
  {
    key: "vrmasterSslMode",
    name: "VRMASTER_DB_SSL_MODE",
    role: "bootstrap",
    type: "verify-full | disable",
    default: "verify-full",
    secret: false,
    purpose:
      "TLS with certificate and host verification, or explicitly disabled for a server without TLS, which sends the credentials and sales data unencrypted on that network.",
    required: false,
    visibility: "server",
    classification: "INTERNAL",
  },
  {
    key: "localAccess",
    name: "IA_MNS_LOCAL_ACCESS",
    role: "development",
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
    role: "development",
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
    role: "development",
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
    role: "development",
    type: "Unix timestamp in seconds",
    default: "",
    secret: false,
    purpose:
      "Absolute temporary bearer expiry; at most two hours after startup. Checked on every request, not renewed.",
    required: false,
    visibility: "server",
    classification: "INTERNAL",
  },
  {
    key: "publicOrigin",
    name: "IA_MNS_PUBLIC_ORIGIN",
    role: "bootstrap",
    type: "exact origin",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose:
      "Browser origin of the IA-MNS web application; token issuer and redirect target for sign-in flows. HTTPS in production; enables identity together with the signing and encryption keys.",
  },
  {
    key: "identitySigningKey",
    name: "IA_MNS_IDENTITY_SIGNING_KEY",
    role: "secret",
    type: "base64url PKCS#8 DER P-256 private key",
    required: false,
    default: "",
    visibility: "server",
    classification: "RESTRICTED",
    secret: true,
    purpose:
      "Signs IA-MNS access tokens (ES256). Generate with pnpm identity:keys; never browser configuration.",
  },
  {
    key: "identityEncryptionKey",
    name: "IA_MNS_IDENTITY_ENCRYPTION_KEY",
    role: "secret",
    type: "base64url 32-byte key",
    required: false,
    default: "",
    visibility: "server",
    classification: "RESTRICTED",
    secret: true,
    purpose:
      "AES-256-GCM key for TOTP secrets at rest. Rotation requires re-enrollment of second factors.",
  },
  {
    key: "identityAudience",
    name: "IA_MNS_IDENTITY_AUDIENCE",
    role: "bootstrap",
    type: "nonempty identifier",
    required: false,
    default: "ia-mns-api",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose: "Audience of IA-MNS access tokens.",
  },
  {
    key: "providerGrants",
    name: "IA_MNS_PROVIDER_GRANTS",
    role: "parameter",
    type: "none | comma list of provider:permission",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose:
      "Installation default of automatic read grants by provider link; an owner value in administration (Parâmetros) takes precedence. Unset uses the composed capability defaults, none disables them.",
  },
  {
    key: "pdtBaseUrl",
    name: "PDT_IDENTITY_BASE_URL",
    role: "bootstrap",
    type: "HTTPS origin",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose:
      "PDT Connect origin serving the identity contract; configure with issuer, client and redirect URI.",
  },
  {
    key: "pdtIssuer",
    name: "PDT_IDENTITY_ISSUER",
    role: "bootstrap",
    type: "HTTPS URL",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose:
      "Exact PDT_IDENTITY_ISSUER of the PDT installation; link issuer for PDT identities.",
  },
  {
    key: "pdtClientId",
    name: "PDT_IDENTITY_CLIENT_ID",
    role: "bootstrap",
    type: "1..64 letters, digits, _ or -",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose: "IA-MNS client id registered in PDT_IDENTITY_CLIENTS.",
  },
  {
    key: "pdtClientSecret",
    name: "PDT_IDENTITY_CLIENT_SECRET",
    role: "secret",
    type: "32+ characters",
    required: false,
    default: "",
    visibility: "server",
    classification: "RESTRICTED",
    secret: true,
    purpose:
      "IA-MNS client secret for the PDT contract; PDT stores only its SHA-256.",
  },
  {
    key: "pdtRedirectUri",
    name: "PDT_IDENTITY_REDIRECT_URI",
    role: "bootstrap",
    type: "HTTPS URL",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose:
      "Exact callback registered in PDT; the browser-visible URL of GET /identity/pdt/callback.",
  },
  {
    key: "pdtEmbedOrigin",
    name: "PDT_EMBED_ORIGIN",
    role: "bootstrap",
    type: "exact origin",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose:
      "Only PDT origin allowed to host the embedded IA-MNS and exchange bridge messages.",
  },
  {
    key: "sankhyaIdentityIssuer",
    name: "SANKHYA_IDENTITY_ISSUER",
    role: "bootstrap",
    type: "stable identifier",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose:
      "Fixed identifier of the Sankhya installation: issuer of CODUSU links (owner directory association) and expected in Om host assertions.",
  },
  {
    key: "sankhyaIdentityKeys",
    name: "SANKHYA_IDENTITY_KEYS",
    role: "bootstrap",
    type: "JWKS JSON of public keys",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose:
      "Pinned public keys of the Om identity add-on (RS256/ES256). Private key material is rejected.",
  },
  {
    key: "sankhyaIdentityAuthorizeUrl",
    name: "SANKHYA_IDENTITY_AUTHORIZE_URL",
    role: "bootstrap",
    type: "HTTPS URL",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose:
      "Om add-on page that mints an assertion for the direct-URL sign-in.",
  },
  {
    key: "sankhyaEmbedOrigin",
    name: "SANKHYA_EMBED_ORIGIN",
    role: "bootstrap",
    type: "exact origin",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose:
      "Only Om origin allowed to host the embedded IA-MNS and exchange bridge messages.",
  },
  {
    key: "sankhyaDirectoryView",
    name: "SANKHYA_DIRECTORY_VIEW",
    role: "bootstrap",
    type: "Oracle view name (optionally SCHEMA.VIEW)",
    required: false,
    default: "",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose:
      "Read-only Sankhya user view (CODUSU, NOMEUSU, NOMEUSUCPLT, EMAIL, DTLIMACESSO) that lets owners associate real Sankhya users; unset disables the directory (PH-08).",
  },
  {
    key: "sankhyaSessionTrust",
    name: "SANKHYA_SESSION_TRUST",
    role: "bootstrap",
    type: "pending | approved",
    required: false,
    default: "pending",
    visibility: "server",
    classification: "INTERNAL",
    secret: false,
    purpose:
      "Human gate for Om-session sign-in in production (PH-11); production refuses the Sankhya connector until approved.",
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

function optional<K extends string>(key: K, value: string | undefined) {
  return value === undefined ? {} : ({ [key]: value } as Record<K, string>);
}

const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];

/** HTTPS everywhere; plain HTTP only for loopback outside production. */
function secureUrl(
  value: string,
  environment: string,
  kind: "origin" | "url",
  name: string,
): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid API configuration: ${name}`);
  }
  const httpAllowed =
    environment !== "production" && loopbackHosts.includes(parsed.hostname);
  if (
    !(
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" && httpAllowed)
    ) ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (kind === "origin" && parsed.origin !== value)
  )
    throw new Error(`Invalid API configuration: ${name}`);
}

const privateJwkFields = ["d", "p", "q", "dp", "dq", "qi", "k"];

function validateIdentity(candidate: Static<typeof serverConfigSchema>): void {
  const environment = candidate.environment;
  const core = [
    candidate.publicOrigin,
    candidate.identitySigningKey,
    candidate.identityEncryptionKey,
  ];
  if (
    core.some((value) => value !== undefined) &&
    core.some((value) => value === undefined)
  )
    throw new Error(
      "Invalid API configuration: incomplete identity configuration",
    );
  const enabled = candidate.publicOrigin !== undefined;
  if (enabled && candidate.localAccess)
    throw new Error(
      "Invalid API configuration: IA_MNS_LOCAL_ACCESS cannot be combined with identity sign-in",
    );
  if (enabled) {
    secureUrl(
      candidate.publicOrigin!,
      environment,
      "origin",
      "IA_MNS_PUBLIC_ORIGIN",
    );
    if (
      Buffer.from(candidate.identityEncryptionKey!, "base64url").length !== 32
    )
      throw new Error("Invalid API configuration: identity encryption key");
  }
  const pdt = [
    candidate.pdtBaseUrl,
    candidate.pdtIssuer,
    candidate.pdtClientId,
    candidate.pdtClientSecret,
    candidate.pdtRedirectUri,
  ];
  if (
    pdt.some((value) => value !== undefined) ||
    candidate.pdtEmbedOrigin !== undefined
  ) {
    if (!enabled || pdt.some((value) => value === undefined))
      throw new Error(
        "Invalid API configuration: incomplete PDT identity configuration",
      );
    secureUrl(
      candidate.pdtBaseUrl!,
      environment,
      "origin",
      "PDT_IDENTITY_BASE_URL",
    );
    secureUrl(candidate.pdtIssuer!, environment, "url", "PDT_IDENTITY_ISSUER");
    secureUrl(
      candidate.pdtRedirectUri!,
      environment,
      "url",
      "PDT_IDENTITY_REDIRECT_URI",
    );
    if (candidate.pdtEmbedOrigin !== undefined)
      secureUrl(
        candidate.pdtEmbedOrigin,
        environment,
        "origin",
        "PDT_EMBED_ORIGIN",
      );
  }
  if (candidate.sankhyaIdentityIssuer !== undefined && !enabled)
    throw new Error(
      "Invalid API configuration: incomplete Sankhya identity configuration",
    );
  if (
    candidate.sankhyaDirectoryView !== undefined &&
    (!candidate.sankhyaIdentityIssuer ||
      !candidate.sankhyaUser ||
      !candidate.sankhyaPassword ||
      !candidate.sankhyaConnectString)
  )
    throw new Error(
      "Invalid API configuration: SANKHYA_DIRECTORY_VIEW requires SANKHYA_IDENTITY_ISSUER and the Sankhya connection",
    );
  // The Om session connector is separate from the issuer: the directory alone
  // never signs anyone in, so only the connector is gated by PH-11.
  const sankhyaConnector = [
    candidate.sankhyaIdentityKeys,
    candidate.sankhyaIdentityAuthorizeUrl,
    candidate.sankhyaEmbedOrigin,
  ].some((value) => value !== undefined);
  if (sankhyaConnector) {
    if (
      !enabled ||
      !candidate.sankhyaIdentityIssuer ||
      !candidate.sankhyaIdentityKeys
    )
      throw new Error(
        "Invalid API configuration: incomplete Sankhya identity configuration",
      );
    let keys: unknown;
    try {
      keys = JSON.parse(candidate.sankhyaIdentityKeys);
    } catch {
      throw new Error("Invalid API configuration: SANKHYA_IDENTITY_KEYS");
    }
    const list =
      typeof keys === "object" && keys !== null
        ? (keys as { keys?: unknown }).keys
        : undefined;
    if (
      !Array.isArray(list) ||
      list.length === 0 ||
      list.some(
        (key: unknown) =>
          typeof key !== "object" ||
          key === null ||
          !["RSA", "EC"].includes(String((key as { kty?: unknown }).kty)) ||
          privateJwkFields.some((field) => field in key),
      )
    )
      throw new Error(
        "Invalid API configuration: SANKHYA_IDENTITY_KEYS must contain public keys only",
      );
    if (candidate.sankhyaIdentityAuthorizeUrl !== undefined)
      secureUrl(
        candidate.sankhyaIdentityAuthorizeUrl,
        environment,
        "url",
        "SANKHYA_IDENTITY_AUTHORIZE_URL",
      );
    if (candidate.sankhyaEmbedOrigin !== undefined)
      secureUrl(
        candidate.sankhyaEmbedOrigin,
        environment,
        "origin",
        "SANKHYA_EMBED_ORIGIN",
      );
    if (
      environment === "production" &&
      candidate.sankhyaSessionTrust !== "approved"
    )
      throw new Error(
        "Invalid API configuration: Sankhya session sign-in requires SANKHYA_SESSION_TRUST=approved after PH-11",
      );
  }
  if (candidate.providerGrants !== undefined && !enabled)
    throw new Error(
      "Invalid API configuration: provider grants require identity",
    );
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
    aiTrace: env.IA_MNS_AI_TRACE ?? "metadata",
    identityAudience: env.IA_MNS_IDENTITY_AUDIENCE ?? "ia-mns-api",
    sankhyaSessionTrust: env.SANKHYA_SESSION_TRUST ?? "pending",
    ...optional("publicOrigin", env.IA_MNS_PUBLIC_ORIGIN),
    ...optional("identitySigningKey", env.IA_MNS_IDENTITY_SIGNING_KEY),
    ...optional("identityEncryptionKey", env.IA_MNS_IDENTITY_ENCRYPTION_KEY),
    ...optional("providerGrants", env.IA_MNS_PROVIDER_GRANTS),
    ...optional("pdtBaseUrl", env.PDT_IDENTITY_BASE_URL),
    ...optional("pdtIssuer", env.PDT_IDENTITY_ISSUER),
    ...optional("pdtClientId", env.PDT_IDENTITY_CLIENT_ID),
    ...optional("pdtClientSecret", env.PDT_IDENTITY_CLIENT_SECRET),
    ...optional("pdtRedirectUri", env.PDT_IDENTITY_REDIRECT_URI),
    ...optional("pdtEmbedOrigin", env.PDT_EMBED_ORIGIN),
    ...optional("sankhyaIdentityIssuer", env.SANKHYA_IDENTITY_ISSUER),
    ...optional("sankhyaIdentityKeys", env.SANKHYA_IDENTITY_KEYS),
    ...optional(
      "sankhyaIdentityAuthorizeUrl",
      env.SANKHYA_IDENTITY_AUTHORIZE_URL,
    ),
    ...optional("sankhyaEmbedOrigin", env.SANKHYA_EMBED_ORIGIN),
    ...optional("sankhyaDirectoryView", env.SANKHYA_DIRECTORY_VIEW),
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
    ...optional("vrmasterHost", env.VRMASTER_DB_HOST),
    vrmasterPort: numberFromEnv(env.VRMASTER_DB_PORT, 5432),
    ...optional("vrmasterDatabase", env.VRMASTER_DB_NAME),
    ...optional("vrmasterUser", env.VRMASTER_DB_USER),
    ...optional("vrmasterPassword", env.VRMASTER_DB_PASSWORD),
    vrmasterSslMode: env.VRMASTER_DB_SSL_MODE ?? "verify-full",
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
  validateIdentity(candidate);
  // Confidential AI content traces need an approved shared retention and
  // access policy before any production use (PH-09).
  if (candidate.environment === "production" && candidate.aiTrace === "content")
    throw new Error(
      "Invalid API configuration: content AI tracing is not approved for production",
    );
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
      candidate.publicOrigin ||
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
  const vrmasterValues = [
    candidate.vrmasterHost,
    candidate.vrmasterDatabase,
    candidate.vrmasterUser,
    candidate.vrmasterPassword,
  ];
  if (vrmasterValues.some(Boolean) && vrmasterValues.some((value) => !value))
    throw new Error(
      "Invalid API configuration: incomplete VRMaster connection (VRMASTER_DB_HOST, VRMASTER_DB_NAME, VRMASTER_DB_USER and VRMASTER_DB_PASSWORD)",
    );
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
