import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  AuthenticationUnavailableError,
  createAccessTokenVerifier,
} from "../src/features/approval-requests/authentication.js";

describe("provider-independent access-token boundary", () => {
  const issuer = "https://issuer.example.test/";
  const audience = "orion-api";
  const id = randomUUID();
  let server: ReturnType<typeof createServer>;
  let verifier: ReturnType<typeof createAccessTokenVerifier>;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    const publicJwk = await exportJWK(pair.publicKey);
    server = createServer((_request, reply) =>
      reply.setHeader("content-type", "application/json").end(
        JSON.stringify({
          keys: [{ ...publicJwk, kid: "test-key", alg: "RS256", use: "sig" }],
        }),
      ),
    );
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No local JWKS address");
    verifier = createAccessTokenVerifier({
      issuer,
      audience,
      jwksUrl: `http://127.0.0.1:${address.port}/jwks`,
    });
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  async function sign(claims: Record<string, unknown>, expire = "5m") {
    return new SignJWT({
      sub: "provider-subject",
      orion_principal_id: id,
      orion_actor_type: "human",
      scope: "approval:review",
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "test-key" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expire)
      .sign(privateKey);
  }
  it("maps only verified identity and scope to application concepts", async () => {
    const principal = await verifier.verify(`Bearer ${await sign({})}`);
    expect(principal?.id).toBe(id);
    expect(principal?.capabilities.has("approval:review")).toBe(true);
    expect(await verifier.verify(undefined)).toBeNull();
    expect(
      await verifier.verify(
        `Bearer ${await sign({ orion_principal_id: "not-a-uuid" })}`,
      ),
    ).toBeNull();
    expect(
      await verifier.verify(
        `Bearer ${await sign({ orion_actor_type: "service" })}`,
      ),
    ).toBeNull();
    expect(
      await verifier.verify(`Bearer ${await sign({ scope: "other" })}`),
    ).toMatchObject({ id });
    expect(
      (await verifier.verify(`Bearer ${await sign({ scope: "other" })}`))
        ?.capabilities.size,
    ).toBe(0);
  });
  it("rejects expired, wrong-audience, and untrusted tokens", async () => {
    expect(await verifier.verify(`Bearer ${await sign({}, "-1s")}`)).toBeNull();
    const wrong = new SignJWT({
      sub: "subject",
      orion_principal_id: id,
      orion_actor_type: "human",
      scope: "approval:review",
    })
      .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "test-key" })
      .setIssuer(issuer)
      .setAudience("other")
      .setIssuedAt()
      .setExpirationTime("5m");
    expect(
      await verifier.verify(`Bearer ${await wrong.sign(privateKey)}`),
    ).toBeNull();
    expect(await verifier.verify("Bearer garbage")).toBeNull();
  });

  it("distinguishes a trusted-key endpoint outage from invalid credentials", async () => {
    const unavailable = createServer((_request, reply) =>
      reply.writeHead(503).end("synthetic-secret-key-service-detail"),
    );
    await new Promise<void>((resolve) =>
      unavailable.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = unavailable.address();
      if (!address || typeof address === "string")
        throw new Error("No local JWKS address");
      const interrupted = createAccessTokenVerifier({
        issuer,
        audience,
        jwksUrl: `http://127.0.0.1:${address.port}/jwks`,
      });
      await expect(
        interrupted.verify(`Bearer ${await sign({})}`),
      ).rejects.toBeInstanceOf(AuthenticationUnavailableError);
      expect(await interrupted.verify("Bearer malformed")).toBeNull();
    } finally {
      await new Promise<void>((resolve) => unavailable.close(() => resolve()));
    }
  });
});
