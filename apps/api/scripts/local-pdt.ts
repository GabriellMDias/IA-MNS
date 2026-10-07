// Connects a local IA-MNS to a local PDT Connect for the embedded surface
// (/embed/pdt). Development only: it generates the IA-MNS client secret, adds the
// IA-MNS PDT settings to the ignored root .env.local and registers the client
// in the PDT's ignored .env with only the SHA-256 of that secret. Never prints
// the secret. The PDT parameters of the IA-MNS screen are set by a PDT
// administrator in Configurações → Parâmetros, as for any PDT parameter.
// Production clients and secrets are human actions (PH-12).
import { createHash, randomBytes } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs, parseEnv } from "node:util";

const root = resolve(import.meta.dirname, "../../..");
const envFile = resolve(root, ".env.local");
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

const { values: options } = parseArgs({
  options: {
    "pdt-env": { type: "string" },
    "pdt-origin": { type: "string", default: "http://localhost:5180" },
    issuer: {
      type: "string",
      default: "https://pdt-connect.development.test",
    },
  },
});

async function readSafe(path: string) {
  const stat = await lstat(path).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  });
  if (!stat) return undefined;
  if (stat.isSymbolicLink() || !stat.isFile())
    throw new Error(`Unsafe local file: ${path}`);
  if ((await realpath(path)).toLowerCase() !== path.toLowerCase())
    throw new Error(`Unexpected local file destination: ${path}`);
  return readFile(path, "utf8");
}

function loopbackOrigin(value: string, name: string) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !loopback.has(url.hostname) ||
    url.origin !== value
  )
    throw new Error(
      `${name} must be an exact http://localhost or http://127.0.0.1 origin; this command configures development only`,
    );
  return value;
}

/** Adds absent settings; refuses to overwrite different existing values. */
function merge(content: string, desired: Record<string, string>, file: string) {
  const existing = parseEnv(content);
  const added: string[] = [];
  const conflicts: string[] = [];
  for (const [name, value] of Object.entries(desired)) {
    if (existing[name] === undefined) {
      const quoted = /["'\s#]/.test(value) ? `'${value}'` : value;
      content = `${content.trimEnd()}\n${name}=${quoted}\n`;
      added.push(name);
    } else if (existing[name] !== value) conflicts.push(name);
  }
  if (conflicts.length)
    throw new Error(
      `${file} already sets ${conflicts.join(", ")} to other values. Remove them from both files and rerun.`,
    );
  return { content: content.trimStart(), added };
}

if (!options["pdt-env"])
  throw new Error("Pass --pdt-env with the PDT Connect root .env file");
const pdtEnvFile = resolve(options["pdt-env"]);
const pdtContent = await readSafe(pdtEnvFile);
if (pdtContent === undefined)
  throw new Error(`PDT environment file not found: ${pdtEnvFile}`);
const localContent = (await readSafe(envFile)) ?? "";
const env = { ...parseEnv(localContent), ...process.env };
if ((env.ORION_ENV ?? "development") === "production")
  throw new Error("Refusing to configure PDT development in production");
const publicOrigin = env.IA_MNS_PUBLIC_ORIGIN;
if (!publicOrigin)
  throw new Error(
    "Run pnpm identity:local first: IA_MNS_PUBLIC_ORIGIN is not set",
  );
loopbackOrigin(publicOrigin, "IA_MNS_PUBLIC_ORIGIN");
const pdtOrigin = loopbackOrigin(options["pdt-origin"], "--pdt-origin");
const issuer = new URL(options.issuer);
if (issuer.protocol !== "https:" || issuer.href.length > 200)
  throw new Error("--issuer must be an HTTPS URL (the PDT requires it)");

// The PDT accepts only HTTPS callbacks. The embedded flow never navigates to it,
// so a local IA-MNS on HTTP registers the HTTPS form of its callback; IA-MNS
// then offers "Entrar com PDT Connect" on its direct URL only over HTTPS.
const callback = new URL("/api/identity/pdt/callback", publicOrigin);
callback.protocol = "https:";
const redirectUri = callback.href;
const secret =
  parseEnv(localContent).PDT_IDENTITY_CLIENT_SECRET ??
  randomBytes(32).toString("base64url");
const clients = JSON.stringify([
  {
    id: "ia-mns",
    name: "IA-MNS",
    secretSha256: createHash("sha256").update(secret).digest("hex"),
    redirectUris: [redirectUri],
  },
]);

const local = merge(
  localContent,
  {
    PDT_IDENTITY_BASE_URL: pdtOrigin,
    PDT_IDENTITY_ISSUER: issuer.href.replace(/\/$/, ""),
    PDT_IDENTITY_CLIENT_ID: "ia-mns",
    PDT_IDENTITY_CLIENT_SECRET: secret,
    PDT_IDENTITY_REDIRECT_URI: redirectUri,
    PDT_EMBED_ORIGIN: pdtOrigin,
  },
  ".env.local",
);
const pdt = merge(
  pdtContent,
  {
    PDT_IDENTITY_ISSUER: issuer.href.replace(/\/$/, ""),
    PDT_IDENTITY_CLIENTS: clients,
  },
  pdtEnvFile,
);
if (pdt.added.length) await writeFile(pdtEnvFile, pdt.content);
if (local.added.length)
  await writeFile(envFile, local.content, { mode: 0o600 });

const embedAncestors = [env.SANKHYA_EMBED_ORIGIN, pdtOrigin]
  .filter(Boolean)
  .join(" ");
process.stdout.write(
  [
    local.added.length
      ? `Added ${local.added.join(", ")} to the ignored .env.local (secret not displayed). Restart the IA-MNS API.`
      : "IA-MNS PDT settings already present in .env.local.",
    pdt.added.length
      ? `Registered the IA-MNS client in ${pdtEnvFile} (${pdt.added.join(", ")}; only the secret's SHA-256). Restart the PDT API.`
      : `PDT identity settings already present in ${pdtEnvFile}.`,
    `In the PDT, set Configurações → Parâmetros: IA_MNS_URL=${publicOrigin}, IA_MNS_CLIENT_ID=ia-mns, IA_MNS_REDIRECT_URI=${redirectUri}; grant ia-mns:acessar.`,
    `Serve the PDT web at ${pdtOrigin} and start the IA-MNS web with ORION_WEB_EMBED_ANCESTORS="${embedAncestors}".`,
    "",
  ].join("\n"),
);
