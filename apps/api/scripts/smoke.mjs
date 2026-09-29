import { spawn } from "node:child_process";
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
