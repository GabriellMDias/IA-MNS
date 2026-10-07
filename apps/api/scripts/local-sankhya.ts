// Connects a local IA-MNS to the Sankhya development Om through the IA-MNS
// add-on (apps/sankhya-addon). Development only: it generates a development
// signing key into the development WildFly configuration directory (never into
// this repository), writes the add-on's host configuration next to it, and adds
// the matching public key, issuer and host origin to the ignored root .env.local.
// Never prints key material. Production keys and configuration are human
// actions (PH-14); never reuse this key or configuration elsewhere.
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
} from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs, parseEnv } from "node:util";
import { calculateJwkThumbprint, type JWK } from "jose";

const root = resolve(import.meta.dirname, "../../..");
const envFile = resolve(root, ".env.local");
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

const { values: options } = parseArgs({
  options: {
    "wildfly-home": { type: "string" },
    "om-origin": { type: "string", default: "http://localhost:8080" },
    issuer: { type: "string", default: "sankhya-om-development" },
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

const envContent = (await readSafe(envFile)) ?? "";
const env = { ...parseEnv(envContent), ...process.env };
if ((env.ORION_ENV ?? "development") === "production")
  throw new Error("Refusing to configure Sankhya development in production");
const iaMnsOrigin = env.IA_MNS_PUBLIC_ORIGIN;
if (!iaMnsOrigin)
  throw new Error(
    "Run pnpm identity:local first: IA_MNS_PUBLIC_ORIGIN is not set",
  );
loopbackOrigin(iaMnsOrigin, "IA_MNS_PUBLIC_ORIGIN");
const omOrigin = loopbackOrigin(options["om-origin"], "--om-origin");
const issuer = options.issuer;
if (!/^[\x21-\x7e]{1,200}$/.test(issuer)) throw new Error("Invalid --issuer");
const audience = env.IA_MNS_IDENTITY_AUDIENCE ?? "ia-mns-api";
const wildflyHome = options["wildfly-home"] ?? env.WILDFLY_HOME;
if (!wildflyHome)
  throw new Error(
    "Pass --wildfly-home or set WILDFLY_HOME to the development WildFly",
  );
const configDirectory = resolve(wildflyHome, "standalone", "configuration");
if (!(await lstat(configDirectory).catch(() => undefined))?.isDirectory())
  throw new Error(`Not a WildFly installation: ${wildflyHome}`);

const keyFile = resolve(configDirectory, "ia-mns-addon-signing-key.pem");
const configFile = resolve(configDirectory, "ia-mns-addon.properties");
let pem = await readSafe(keyFile);
const createdKey = pem === undefined;
if (pem === undefined) {
  pem = generateKeyPairSync("ec", { namedCurve: "P-256" })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  await writeFile(keyFile, pem, { mode: 0o600, flag: "wx" });
}
const publicJwk = createPublicKey(createPrivateKey(pem)).export({
  format: "jwk",
}) as JWK;
if (publicJwk.kty !== "EC" || publicJwk.crv !== "P-256")
  throw new Error("The development signing key must be an EC P-256 key");
const kid = await calculateJwkThumbprint(publicJwk, "sha256");
const jwks = JSON.stringify({
  keys: [{ ...publicJwk, kid, alg: "ES256", use: "sig" }],
});

const properties = [
  "# IA-MNS Sankhya add-on host configuration (development; written by pnpm sankhya:local).",
  `iamns.origin=${iaMnsOrigin}`,
  `om.origin=${omOrigin}`,
  `sankhya.issuer=${issuer}`,
  `iamns.audience=${audience}`,
  `signing.key.id=${kid}`,
  "signing.key.file=ia-mns-addon-signing-key.pem",
  "",
].join("\n");
const previousProperties = await readSafe(configFile);
if (previousProperties !== properties)
  await writeFile(configFile, properties, { mode: 0o600 });

const desired: Record<string, string> = {
  SANKHYA_IDENTITY_ISSUER: issuer,
  SANKHYA_IDENTITY_KEYS: jwks,
  SANKHYA_EMBED_ORIGIN: omOrigin,
};
const fileValues = parseEnv(envContent);
let content = envContent;
const added: string[] = [];
const conflicts: string[] = [];
for (const [name, value] of Object.entries(desired)) {
  if (fileValues[name] === undefined) {
    content = `${content.trimEnd()}\n${name}=${name === "SANKHYA_IDENTITY_KEYS" ? `'${value}'` : value}\n`;
    added.push(name);
  } else if (fileValues[name] !== value) conflicts.push(name);
}
if (conflicts.length)
  throw new Error(
    `.env.local already sets ${conflicts.join(", ")} to other values. Remove them (or the development key in ${configDirectory}) and rerun.`,
  );
if (added.length)
  await writeFile(envFile, content.trimStart(), { mode: 0o600 });

process.stdout.write(
  [
    `Development add-on configuration ${previousProperties === properties ? "unchanged" : "written"} in ${configFile}; signing key ${createdKey ? "generated" : "reused"} (not displayed).`,
    added.length
      ? `Added ${added.join(", ")} to the ignored .env.local. Restart the API.`
      : "IA-MNS Sankhya settings already present in .env.local.",
    `Start the web server with ORION_WEB_EMBED_ANCESTORS=${omOrigin} and open the Om at ${omOrigin}/mge.`,
    "",
  ].join("\n"),
);
