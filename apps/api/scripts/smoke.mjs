import { execFile, spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executable = resolve(appDirectory, "dist/main.js");

async function freePort() {
  const server = createServer();
  await new Promise((resolveReady) =>
    server.listen(0, "127.0.0.1", resolveReady),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No free port");
  await new Promise((resolveClosed) => server.close(resolveClosed));
  return address.port;
}

async function waitForExit(child, timeoutMs) {
  return await Promise.race([
    new Promise((resolveExit) =>
      child.once("exit", (code, signal) => resolveExit({ code, signal })),
    ),
    delay(timeoutMs).then(() => {
      child.kill();
      throw new Error("API process did not exit in time");
    }),
  ]);
}

const invalid = spawn(process.execPath, [executable], {
  cwd: appDirectory,
  env: { ...process.env, ORION_ENV: "invalid", ORION_API_PORT: "0" },
  stdio: "ignore",
});
const invalidExit = await waitForExit(invalid, 5000);
if (invalidExit.code === 0) throw new Error("Invalid configuration accepted");

const port = await freePort();
let rejectedExports = 0;
let exportedPayload = "";
const collector = createHttpServer((request, response) => {
  if (request.url === "/v1/traces") rejectedExports += 1;
  request.on("data", (chunk) => {
    exportedPayload += String(chunk);
  });
  request.resume();
  response.writeHead(503).end();
});
await new Promise((resolveReady) =>
  collector.listen(0, "127.0.0.1", resolveReady),
);
const collectorAddress = collector.address();
if (!collectorAddress || typeof collectorAddress === "string")
  throw new Error("No collector address");
const child = spawn(process.execPath, [executable], {
  cwd: appDirectory,
  env: {
    ...process.env,
    ORION_ENV: "test",
    ORION_API_PORT: String(port),
    ORION_OTLP_ENDPOINT: `http://127.0.0.1:${collectorAddress.port}`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => {
  output += String(chunk);
});
child.stderr.on("data", (chunk) => {
  output += String(chunk);
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health/ready`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Startup has not opened the listener yet. */
    }
    if (child.exitCode !== null)
      throw new Error(`API exited during startup: ${output}`);
    await delay(100);
  }
  if (!ready) throw new Error(`API did not become ready: ${output}`);
  const traceIds = [
    "11111111111111111111111111111111",
    "33333333333333333333333333333333",
  ];
  const responses = await Promise.all(
    traceIds.map((traceId) =>
      fetch(`http://127.0.0.1:${port}/missing?secret=do-not-export`, {
        headers: {
          traceparent: `00-${traceId}-2222222222222222-01`,
          authorization: "Bearer do-not-log",
        },
      }),
    ),
  );
  const requestIds = [];
  for (const [index, response] of responses.entries()) {
    const body = await response.json();
    if (response.status !== 404 || body.error.code !== "RESOURCE_NOT_FOUND")
      throw new Error(`Unexpected HTTP boundary: ${JSON.stringify(body)}`);
    if (body.error.requestId !== response.headers.get("x-request-id"))
      throw new Error("Request correlation mismatch");
    if (body.error.traceId !== traceIds[index])
      throw new Error(`Trace propagation mismatch: ${JSON.stringify(body)}`);
    requestIds.push(body.error.requestId);
  }
  await delay(20);
  const records = output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return {};
      }
    });
  for (const [index, requestId] of requestIds.entries()) {
    if (
      !records.some(
        (record) =>
          record.request_id === requestId &&
          record.trace_id === traceIds[index],
      )
    )
      throw new Error(`Missing correlated log for ${requestId}`);
  }
  if (output.includes("do-not-log"))
    throw new Error("Sensitive header escaped into logs");
  for (let attempt = 0; attempt < 80 && rejectedExports === 0; attempt += 1)
    await delay(100);
  if (rejectedExports === 0)
    throw new Error("OTLP exporter did not attempt delivery");
  for (
    let attempt = 0;
    attempt < 30 && !output.includes("telemetry_export_failed");
    attempt += 1
  )
    await delay(100);
  if (!output.includes("telemetry_export_failed"))
    throw new Error("OTLP failure was not observed");
  if (
    exportedPayload.includes("do-not-export") ||
    exportedPayload.includes("do-not-log")
  )
    throw new Error("Sensitive request data escaped into telemetry export");
  const afterExportFailure = await fetch(
    `http://127.0.0.1:${port}/health/ready`,
  );
  if (!afterExportFailure.ok)
    throw new Error("Telemetry export failure affected HTTP readiness");
  process.stdout.write(
    "Built API startup, HTTP boundary, W3C propagation, and failed OTLP export smoke passed\n",
  );
} finally {
  child.kill();
  await waitForExit(child, 5000).catch(() => undefined);
  await new Promise((resolveClosed) => collector.close(resolveClosed));
}

// Production runtime shape (ADR-0029) against the emitted API and web builds:
// compiled operational commands, then the web build served at the same origin
// over the internal HTTPS listener behind a trusted proxy.
const run = promisify(execFile);
const webRoot = resolve(appDirectory, "../web/dist");
const work = await mkdtemp(resolve(tmpdir(), "ia-mns-smoke-"));
async function command(name, args = [], env = {}) {
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      [resolve(appDirectory, `dist/cli/${name}.js`), ...args],
      {
        cwd: appDirectory,
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          ...env,
        },
        timeout: 30_000,
      },
    );
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    return { code: error.code, output: `${error.stdout}${error.stderr}` };
  }
}
function fetchTls(port, path, ca, headers = {}) {
  return new Promise((resolveResponse, reject) => {
    const outgoing = httpsRequest(
      { host: "127.0.0.1", port, path, ca, servername: "localhost", headers },
      (response) => {
        let body = "";
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () =>
          resolveResponse({
            status: response.statusCode,
            headers: response.headers,
            body,
          }),
        );
      },
    );
    outgoing.once("error", reject);
    outgoing.end();
  });
}
let served;
try {
  const keysFile = resolve(work, "identity.env");
  const keys = await command("identity-keys", ["--output", keysFile]);
  if (keys.code !== 0 || !/no key material displayed/.test(keys.output))
    throw new Error(`identity-keys failed: ${keys.output}`);
  const keyText = await readFile(keysFile, "utf8");
  if (keys.output.includes(keyText.split("=")[1].slice(0, 12)))
    throw new Error("identity-keys displayed key material");
  if (
    process.platform !== "win32" &&
    ((await stat(keysFile)).mode & 0o077) !== 0
  )
    throw new Error("identity-keys file is readable by other users");
  if ((await command("identity-keys", ["--output", keysFile])).code === 0)
    throw new Error("identity-keys overwrote an existing file");
  const identity = Object.fromEntries(
    keyText
      .trim()
      .split("\n")
      .map((line) => line.split(/=(.*)/s).slice(0, 2)),
  );

  const valid = await command("config-check", [], {
    ORION_ENV: "test",
    ORION_WEB_ROOT: webRoot,
    // Composition never connects, so an unreachable database is enough.
    ORION_DATABASE_URL: "postgresql://smoke:unused@127.0.0.1:9/smoke",
    IA_MNS_PUBLIC_ORIGIN: "http://127.0.0.1:5173",
    ...identity,
  });
  if (valid.code !== 0 || !/Configuration valid for test/.test(valid.output))
    throw new Error(
      `config-check rejected a valid configuration: ${valid.output}`,
    );
  for (const [env, expected] of [
    [{ ORION_ENV: "invalid" }, "Invalid API configuration."],
    [
      { ORION_ENV: "production" },
      "requires authentication and providers in production",
    ],
    [
      {
        ORION_ENV: "test",
        ORION_WEB_ROOT: webRoot,
        ORION_WEB_DOCS: "disabled",
      },
      "contains the /docs portal",
    ],
    [
      {
        ORION_ENV: "test",
        ORION_TLS_CERT_FILE: resolve(work, "missing.pem"),
        ORION_TLS_KEY_FILE: resolve(work, "missing.pem"),
      },
      "ORION_TLS_CERT_FILE or ORION_TLS_KEY_FILE is unreadable",
    ],
  ]) {
    const result = await command("config-check", [], env);
    if (result.code !== 1 || !result.output.includes(expected))
      throw new Error(
        `config-check did not refuse ${JSON.stringify(env)}: ${result.output}`,
      );
  }
  const deploy = await command("database-deploy");
  if (
    deploy.code !== 2 ||
    !/ORION_MIGRATION_DATABASE_URL is required/.test(deploy.output)
  )
    throw new Error(
      `database-deploy ran without a migration credential: ${deploy.output}`,
    );
  const bootstrap = await command("identity-bootstrap", [], {
    ORION_ENV: "test",
  });
  if (
    bootstrap.code !== 1 ||
    !/Identity is not configured/.test(bootstrap.output)
  )
    throw new Error(
      `identity-bootstrap ran without identity: ${bootstrap.output}`,
    );

  const cert = resolve(work, "cert.pem");
  const key = resolve(work, "key.pem");
  await run("openssl", [
    "req",
    "-x509",
    "-newkey",
    "ec",
    "-pkeyopt",
    "ec_paramgen_curve:P-256",
    "-nodes",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost",
  ]).catch(() => {
    throw new Error(
      "The TLS smoke needs the openssl command to create a disposable certificate",
    );
  });
  const ca = await readFile(cert);
  const tlsPort = await freePort();
  let tlsOutput = "";
  served = spawn(process.execPath, [executable], {
    cwd: appDirectory,
    env: {
      ...process.env,
      ORION_ENV: "test",
      ORION_API_PORT: String(tlsPort),
      ORION_WEB_ROOT: webRoot,
      ORION_TLS_CERT_FILE: cert,
      ORION_TLS_KEY_FILE: key,
      ORION_TRUSTED_PROXIES: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  served.stdout.on("data", (chunk) => (tlsOutput += String(chunk)));
  served.stderr.on("data", (chunk) => (tlsOutput += String(chunk)));
  let ready;
  for (let attempt = 0; attempt < 80 && !ready; attempt += 1) {
    ready = await fetchTls(tlsPort, "/health/ready", ca).catch(() => undefined);
    if (served.exitCode !== null)
      throw new Error(`Served API exited during startup: ${tlsOutput}`);
    if (!ready) await delay(100);
  }
  if (ready?.status !== 200)
    throw new Error(`HTTPS API did not become ready: ${tlsOutput}`);
  const page = await fetchTls(tlsPort, "/entrar", ca, { accept: "text/html" });
  if (
    page.status !== 200 ||
    !page.body.includes('id="root"') ||
    page.headers["content-security-policy"] !== "frame-ancestors 'none'"
  )
    throw new Error("The web shell was not served at the same origin");
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(page.body)?.[1];
  const asset = script ? await fetchTls(tlsPort, script, ca) : undefined;
  if (
    asset?.status !== 200 ||
    !String(asset.headers["cache-control"]).includes("immutable")
  )
    throw new Error("Hashed web assets were not served immutably");
  const api = await fetchTls(tlsPort, "/api/health/ready", ca);
  const unknown = await fetchTls(tlsPort, "/api/unknown", ca, {
    accept: "text/html",
  });
  if (
    api.status !== 200 ||
    unknown.status !== 404 ||
    !unknown.body.includes("RESOURCE_NOT_FOUND")
  )
    throw new Error("The API was not routed under /api");
  process.stdout.write(
    "Built operational commands and same-origin web over internal HTTPS smoke passed\n",
  );
} finally {
  served?.kill();
  if (served) await waitForExit(served, 5000).catch(() => undefined);
  await rm(work, { recursive: true, force: true });
}

// Modules add process smokes as apps/api/scripts/smoke/*.ts; they run after
// the shared runtime checks against the same emitted build.
const moduleSmokes = resolve(appDirectory, "scripts/smoke");
const smokes = (
  await readdir(moduleSmokes).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  })
)
  .filter((name) => name.endsWith(".ts"))
  .sort();
for (const name of smokes) {
  const smoke = spawn(
    process.execPath,
    ["--import", "tsx", resolve(moduleSmokes, name)],
    { cwd: appDirectory, stdio: "inherit" },
  );
  const result = await new Promise((resolveExit, reject) => {
    smoke.once("error", reject);
    smoke.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
  if (result.code !== 0)
    throw new Error(
      `Module smoke ${name} failed (${result.code ?? result.signal})`,
    );
}
