import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile, lstat, unlink, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { isPrivateIpv4, parseServerConfig } from "../src/config.js";

const root = resolve(import.meta.dirname, "../../..");
const apiRoot = resolve(root, "apps/api");
const webRoot = resolve(root, "apps/web");
const tokenFile = resolve(root, "infra/local/.env.lan");
const children: ChildProcess[] = [];
let stopping = false;
let ownsFile = false;
let expiry: NodeJS.Timeout | undefined;
async function stop(failed = false) {
  if (stopping) return;
  stopping = true;
  clearTimeout(expiry);
  for (const child of children) child.kill("SIGTERM");
  if (ownsFile) await unlink(tokenFile).catch(() => {});
  process.exitCode = failed ? 1 : 0;
}
async function available(host: string, port: number) {
  const server = createServer();
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(port, host, done);
  });
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
}
function start(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  name: "api" | "web",
) {
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  // Application diagnostics remain in ignored local logs, never chat/terminal.
  const output = createWriteStream(
    resolve(root, `test-results/network-test-${name}.log`),
    { flags: "w" },
  );
  output.on("error", () => {
    void stop(true);
  });
  child.stdout?.pipe(output, { end: false });
  child.stderr?.pipe(output, { end: false });
  child.once("close", () => output.end());
  child.once("error", () => {
    process.stderr.write("Network test service failed to start.\n");
    void stop(true);
  });
  child.once("close", () => {
    if (!stopping) {
      process.stderr.write("Network test service stopped.\n");
      void stop(true);
    }
  });
  return child;
}
async function ready(url: string) {
  for (let attempt = 0; attempt < 100 && !stopping; attempt++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {
      /* Startup in progress. */
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error("Network test startup unavailable");
}
process.once("SIGINT", () => {
  void stop();
});
process.once("SIGTERM", () => {
  void stop();
});
try {
  const host = process.argv[2];
  if (
    !host ||
    !isPrivateIpv4(host) ||
    !Object.values(networkInterfaces())
      .flat()
      .some((item) => item?.address === host)
  )
    throw new Error("An assigned private IPv4 address is required");
  const local = parseEnv(await readFile(resolve(root, ".env.local"), "utf8"));
  const base = { ...local, ...process.env };
  if (base.ORION_ENV !== "development")
    throw new Error("Development environment required");
  await mkdir(resolve(root, "test-results"), { recursive: true });
  await available("127.0.0.1", 3002);
  await available(host, 5174);
  const stat = await lstat(tokenFile).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  });
  if (stat) throw new Error("Previous network test credential still exists");
  const token = randomBytes(32).toString("hex");
  const expiresAt = Math.floor(Date.now() / 1000) + 7200;
  const origin = `http://${host}:5174`;
  const env: NodeJS.ProcessEnv = {
    ...base,
    ORION_API_HOST: "127.0.0.1",
    ORION_API_PORT: "3002",
    IA_MNS_LOCAL_ACCESS: "false",
    IA_MNS_DEV_ACCESS_TOKEN: token,
    IA_MNS_DEV_ACCESS_ORIGIN: origin,
    IA_MNS_DEV_ACCESS_EXPIRES_AT: String(expiresAt),
  };
  parseServerConfig(env);
  delete env.ORION_MIGRATION_DATABASE_URL;
  await writeFile(
    tokenFile,
    `IA_MNS_DEV_ACCESS_TOKEN=${token}\nIA_MNS_DEV_ACCESS_ORIGIN=${origin}\nIA_MNS_DEV_ACCESS_EXPIRES_AT=${expiresAt}\n`,
    { flag: "wx", mode: 0o600 },
  );
  ownsFile = true;
  start(apiRoot, ["--import", "tsx", "src/main.ts"], env, "api");
  await ready("http://127.0.0.1:3002/health/ready");
  // Web receives no database/OpenAI/Oracle/temporary credential configuration.
  const webEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ORION_WEB_API_TARGET: "http://127.0.0.1:3002",
  };
  for (const key of Object.keys(webEnv))
    if (
      /^(OPENAI_|SANKHYA_|IA_MNS_DEV_ACCESS_|ORION_(DATABASE|MIGRATION_DATABASE|TOKEN)_)/.test(
        key,
      )
    )
      delete webEnv[key];
  start(
    webRoot,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      host,
      "--port",
      "5174",
      "--strictPort",
    ],
    webEnv,
    "web",
  );
  await ready(origin);
  process.stdout.write(
    `Network test ready: ${origin}\nEnter the temporary token from ${tokenFile} in the application's access field. It expires in two hours. Ctrl+C stops this test; default desktop services and .env.local remain unchanged.\n`,
  );
  expiry = setTimeout(() => {
    process.stdout.write("Network test expired.\n");
    void stop();
  }, 7200000);
} catch {
  process.stderr.write(
    "Network test could not start. Check the assigned private IPv4 argument, development .env.local, ports 3002/5174 and absence of an active infra/local/.env.lan. No existing service or configuration was replaced.\n",
  );
  await stop(true);
}
