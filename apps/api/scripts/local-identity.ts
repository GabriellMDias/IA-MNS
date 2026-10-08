// Generates local-only identity keys into the ignored root .env.local when absent.
// Never prints key material. Production keys are provisioned through the secret
// store (see docs/domains/identity.md); never copy local keys to shared environments.
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { generateIdentityKeys } from "../src/identity-keys.js";

const root = resolve(import.meta.dirname, "../../..");
const envFile = resolve(root, ".env.local");

async function readSafe(path: string) {
  const stat = await lstat(path).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  });
  if (!stat) return "";
  if (stat.isSymbolicLink() || !stat.isFile())
    throw new Error("Unsafe local environment file");
  if ((await realpath(path)).toLowerCase() !== path.toLowerCase())
    throw new Error("Unexpected local environment file destination");
  return readFile(path, "utf8");
}

let content = await readSafe(envFile);
const existing = parseEnv(content);
const generated = generateIdentityKeys();
const values: Record<string, string> = {
  IA_MNS_PUBLIC_ORIGIN:
    existing.IA_MNS_PUBLIC_ORIGIN ?? "http://127.0.0.1:5173",
  IA_MNS_IDENTITY_SIGNING_KEY:
    existing.IA_MNS_IDENTITY_SIGNING_KEY ??
    generated.IA_MNS_IDENTITY_SIGNING_KEY,
  IA_MNS_IDENTITY_ENCRYPTION_KEY:
    existing.IA_MNS_IDENTITY_ENCRYPTION_KEY ??
    generated.IA_MNS_IDENTITY_ENCRYPTION_KEY,
};
const added: string[] = [];
for (const [name, value] of Object.entries(values)) {
  if (existing[name] !== undefined) continue;
  content = `${content.trimEnd()}\n${name}=${value}\n`;
  added.push(name);
}
if (added.length)
  await writeFile(envFile, content.trimStart(), { mode: 0o600 });
if (existing.IA_MNS_LOCAL_ACCESS === "true")
  process.stdout.write(
    "Set IA_MNS_LOCAL_ACCESS=false in .env.local: credential-free local access cannot be combined with identity sign-in.\n",
  );
process.stdout.write(
  added.length
    ? `Local identity configured in ignored .env.local (${added.join(", ")}); no key material displayed.\n`
    : "Local identity already configured in .env.local; nothing changed.\n",
);
