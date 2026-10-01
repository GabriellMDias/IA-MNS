import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { withMigratedDatabase } from "../migrated-database.js";

async function freePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No free port");
  await new Promise<void>((closed) => server.close(() => closed()));
  return address.port;
}

await withMigratedDatabase(async (runtimeUrl) => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const jwks = createServer((_request, reply) =>
    reply.setHeader("content-type", "application/json").end(
      JSON.stringify({
        keys: [{ ...jwk, alg: "RS256", kid: "smoke", use: "sig" }],
      }),
    ),
  );
  await new Promise<void>((ready) => jwks.listen(0, "127.0.0.1", ready));
  const address = jwks.address();
  if (!address || typeof address === "string") throw new Error("No JWKS port");
  const issuer = "https://synthetic-issuer.example.test/";
  const port = await freePort();
  const executable = resolve(import.meta.dirname, "../../dist/main.js");
  const childEnvironment = {
    ...process.env,
    ORION_ENV: "test",
    ORION_API_PORT: String(port),
    ORION_DATABASE_URL: runtimeUrl,
    ORION_TOKEN_ISSUER: issuer,
    ORION_TOKEN_AUDIENCE: "orion-api",
    ORION_TOKEN_JWKS_URL: `http://127.0.0.1:${address.port}/jwks`,
  };
  const child = spawn(process.execPath, [executable], {
    cwd: resolve(import.meta.dirname, "../.."),
    env: childEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let restarted: ReturnType<typeof spawn> | undefined;
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const ownerId = randomUUID();
  const reviewerId = randomUUID();
  async function token(id: string, review: boolean): Promise<string> {
    return await new SignJWT({
      sub: `synthetic-${id}`,
      orion_principal_id: id,
      orion_actor_type: "human",
      scope: review ? "approval:review" : "",
    })
      .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "smoke" })
      .setIssuer(issuer)
      .setAudience("orion-api")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }
  async function request(
    method: string,
    path: string,
    bearer: string,
    body?: object,
    key?: string,
  ) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${bearer}`,
        ...(body ? { "content-type": "application/json" } : {}),
        ...(key ? { "idempotency-key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(5000),
    });
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  }
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null)
        throw new Error(`Feature API exited: ${output}`);
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
      await delay(100);
    }
    if (!ready) throw new Error(`Feature API did not become ready: ${output}`);
    const ownerToken = await token(ownerId, false);
    const reviewerToken = await token(reviewerId, true);
    const creationKey = randomUUID();
    const created = await request(
      "POST",
      "/approval-requests",
      ownerToken,
      { title: "Synthetic approval" },
      creationKey,
    );
    if (
      created.status !== 201 ||
      created.body.status !== "DRAFT" ||
      created.body.creatorId !== ownerId
    )
      throw new Error(`Feature create failed: ${JSON.stringify(created.body)}`);
    const id = created.body.id as string;
    const submitted = await request(
      "POST",
      `/approval-requests/${id}/submit`,
      ownerToken,
      { expectedVersion: 1 },
    );
    if (submitted.status !== 200 || submitted.body.status !== "SUBMITTED")
      throw new Error(
        `Feature submit failed: ${JSON.stringify(submitted.body)}`,
      );
    const denied = await request(
      "POST",
      `/approval-requests/${id}/approve`,
      ownerToken,
      { expectedVersion: 2 },
    );
    if (denied.status !== 403)
      throw new Error("Owner self-review was not denied");
    const approved = await request(
      "POST",
      `/approval-requests/${id}/approve`,
      reviewerToken,
      { expectedVersion: 2 },
    );
    if (approved.status !== 200 || approved.body.status !== "APPROVED")
      throw new Error(
        `Feature approval failed: ${JSON.stringify(approved.body)}`,
      );
    // A process can disappear after committing a write. The migrated database
    // must remain authoritative when a new process takes over the same port.
    const interrupted = new Promise<void>((resolveExit) =>
      child.once("exit", () => resolveExit()),
    );
    if (!child.kill("SIGKILL"))
      throw new Error("Could not interrupt feature API");
    await interrupted;
    restarted = spawn(process.execPath, [executable], {
      cwd: resolve(import.meta.dirname, "../.."),
      env: childEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    restarted.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    restarted.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (restarted.exitCode !== null || restarted.signalCode !== null)
        throw new Error(`Restarted feature API exited: ${output}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health/ready`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        /* Restart has not opened the listener yet. */
      }
      await delay(100);
    }
    if (!ready) throw new Error(`Feature API did not restart: ${output}`);
    const recovered = await request(
      "GET",
      `/approval-requests/${id}`,
      ownerToken,
    );
    if (
      recovered.status !== 200 ||
      recovered.body.status !== "APPROVED" ||
      recovered.body.version !== 3
    )
      throw new Error("Committed Approval Request was not recovered");
    const replayed = await request(
      "POST",
      "/approval-requests",
      ownerToken,
      { title: "Synthetic approval" },
      creationKey,
    );
    if (replayed.status !== 201 || replayed.body.id !== id)
      throw new Error("Creation intent did not replay after process restart");
    process.stdout.write(
      "Built Approval Request API, restricted PostgreSQL role, signed-token boundary, HTTP workflow, and process-interruption recovery smoke passed\n",
    );
  } finally {
    const active = restarted ?? child;
    if (active.exitCode === null && active.signalCode === null) {
      const stopped = new Promise<void>((resolveExit) =>
        active.once("exit", () => resolveExit()),
      );
      active.kill();
      await Promise.race([stopped, delay(5000)]);
    }
    await new Promise<void>((closed) => jwks.close(() => closed()));
  }
});
