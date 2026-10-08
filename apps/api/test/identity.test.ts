import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import pino from "pino";
import {
  decodeJwt,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
} from "jose";
import { withMigratedDatabase } from "../scripts/migrated-database.js";
import { createDatabase, type Database } from "../src/database.js";
import { createApp } from "../src/app.js";
import { parseServerConfig } from "../src/config.js";
import {
  createLocalAccessTokenVerifier,
  issuerPublicJwk,
} from "../src/authentication.js";
import {
  createIdentityModule,
  identityServiceFor,
} from "../src/features/identity/module.js";
import { operationalParameters, permissionCatalog } from "../src/modules.js";
import { totpCode } from "../src/features/identity/secrets.js";
import { createAgentModule } from "../src/features/agent/module.js";
import { CorporateAgent } from "../src/features/agent/application.js";
import {
  AgentRepository,
  transferConversations,
} from "../src/features/agent/prisma-repository.js";
import type { SankhyaUser } from "../src/features/identity/sankhya-directory.js";
import { signingKey } from "./identity-helpers.js";

const ORIGIN = "http://localhost:5173";
const PDT = "https://pdt.example.test";
const SANKHYA_ISSUER = "urn:mns:sankhya-om:test";
const web = { "x-ia-mns-client": "web" };
type ErrorBody = { error: { code: string } };

function base32Decode(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let current = 0;
  const bytes: number[] = [];
  for (const char of value) {
    current = (current << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Synthetic PDT installation implementing contract v1 semantics (single-use codes, PKCE, revocation). */
function fakePdt() {
  const codes = new Map<
    string,
    { challenge: string; subject: string; name: string; email?: string }
  >();
  const tokens = new Map<string, string>();
  const handle = (input: URL | RequestInfo, init?: RequestInit): Response => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (
      headers["X-PDT-Client-Id"] !== "ia-mns" ||
      headers["X-PDT-Client-Secret"] !== "c".repeat(40)
    )
      return new Response("{}", { status: 401 });
    if (url.pathname === "/api/auth/integrations/token") {
      const body = JSON.parse(
        typeof init?.body === "string" ? init.body : "{}",
      ) as {
        code: string;
        code_verifier: string;
      };
      const entry = codes.get(body.code);
      codes.delete(body.code);
      if (
        !entry ||
        createHash("sha256").update(body.code_verifier).digest("base64url") !==
          entry.challenge
      )
        return new Response("{}", { status: 401 });
      const token = randomBytes(32).toString("base64url");
      tokens.set(token, JSON.stringify(entry));
      return Response.json({
        accessToken: token,
        tokenType: "Bearer",
        expiresIn: 300,
        scope: "identity:read",
      });
    }
    const token = String(headers.Authorization).slice(7);
    if (url.pathname === "/api/auth/integrations/identity") {
      const entry = tokens.get(token);
      if (!entry) return new Response("{}", { status: 401 });
      const { subject, name, email } = JSON.parse(entry) as {
        subject: string;
        name: string;
        email?: string;
      };
      return Response.json({
        contractVersion: 1,
        issuer: PDT,
        subject,
        audience: "ia-mns",
        authenticated: true,
        user: { id: 7, name, email, activeStatus: true },
        authorization: { superAdmin: false, permissions: [] },
      });
    }
    tokens.delete(token);
    return Response.json({ revoked: true });
  };
  const fetcher = ((input: URL | RequestInfo, init?: RequestInit) =>
    Promise.resolve(handle(input, init))) as typeof fetch;
  return {
    fetcher,
    /** What the PDT host bridge obtains from POST /api/auth/integrations/authorize. */
    authorize(
      challenge: string,
      subject: string,
      name = "Pessoa PDT",
      email?: string,
    ) {
      const code = randomBytes(32).toString("base64url");
      codes.set(code, { challenge, subject, name, email });
      return code;
    },
  };
}

/** Synthetic ERP user directory (the real one reads a DBA-provided view). */
const directoryUsers: SankhyaUser[] = [
  {
    codusu: "321",
    login: "MARIA",
    name: "Maria Om",
    email: null,
    accessExpired: false,
  },
  {
    codusu: "4321",
    login: "JOANA",
    name: "Joana Diretório",
    email: "joana@mns.example.test",
    accessExpired: false,
  },
  {
    codusu: "4322",
    login: "ANTIGA",
    name: "Conta Expirada",
    email: null,
    accessExpired: true,
  },
];
const fakeDirectory = () => ({
  search: (query: string) =>
    Promise.resolve(
      directoryUsers.filter((user) =>
        `${user.login} ${user.name}`
          .toUpperCase()
          .includes(query.toUpperCase()),
      ),
    ),
  find: (codusu: string) =>
    Promise.resolve(
      directoryUsers.find((user) => user.codusu === codusu) ?? null,
    ),
  close: () => Promise.resolve(),
});

async function setup(runtimeUrl: string) {
  const omKeys = await generateKeyPair("ES256");
  const key = signingKey();
  const config = parseServerConfig({
    ORION_ENV: "test",
    ORION_DATABASE_URL: runtimeUrl,
    IA_MNS_PUBLIC_ORIGIN: ORIGIN,
    IA_MNS_IDENTITY_SIGNING_KEY: key,
    IA_MNS_IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
    PDT_IDENTITY_BASE_URL: PDT,
    PDT_IDENTITY_ISSUER: PDT,
    PDT_IDENTITY_CLIENT_ID: "ia-mns",
    PDT_IDENTITY_CLIENT_SECRET: "c".repeat(40),
    PDT_IDENTITY_REDIRECT_URI: `${ORIGIN}/api/identity/pdt/callback`,
    PDT_EMBED_ORIGIN: PDT,
    SANKHYA_IDENTITY_ISSUER: SANKHYA_ISSUER,
    SANKHYA_IDENTITY_KEYS: JSON.stringify({
      keys: [
        { ...(await exportJWK(omKeys.publicKey)), kid: "om", alg: "ES256" },
      ],
    }),
    SANKHYA_IDENTITY_AUTHORIZE_URL:
      "https://om.example.test/mge/ia-mns/authorize.jsp",
    SANKHYA_EMBED_ORIGIN: "https://om.example.test",
    SANKHYA_DIRECTORY_VIEW: "IA_MNS_USERS",
    SANKHYA_DB_USER: "reader",
    SANKHYA_DB_PASSWORD: "synthetic",
    SANKHYA_DB_CONNECT_STRING: "erp.example.test/ERP",
  });
  const database = createDatabase(runtimeUrl);
  const clock = { now: Date.now() };
  const pdt = fakePdt();
  const verifier = createLocalAccessTokenVerifier({
    issuer: ORIGIN,
    audience: config.identityAudience,
    keys: { keys: [issuerPublicJwk(key)] },
  });
  const resources = { config, database, verifier };
  const ports = {
    transferOwnership: transferConversations,
    parameters: operationalParameters,
    sankhyaDirectory: fakeDirectory,
  };
  const service = identityServiceFor(
    config,
    resources,
    permissionCatalog,
    ports,
    { fetcher: pdt.fetcher, now: () => new Date(clock.now) },
  )!;
  const identity = createIdentityModule(
    permissionCatalog,
    ports,
    () => service,
  ).activate(resources);
  const agent = createAgentModule(
    () => [],
    new CorporateAgent(new AgentRepository(database), undefined, []),
  ).activate(resources);
  const { app } = createApp(pino({ level: "silent" }), undefined, {
    modules: [identity, agent],
  });
  await app.ready();
  const sankhyaAssertion = (
    nonce: string,
    sub: string,
    signer: CryptoKey = omKeys.privateKey,
    email?: string,
  ) =>
    new SignJWT({ nonce, name: "Usuária Om", ...(email ? { email } : {}) })
      .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: "om" })
      .setIssuer(SANKHYA_ISSUER)
      .setAudience(config.identityAudience)
      .setSubject(sub)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(signer);
  return { app, database, clock, pdt, service, sankhyaAssertion, config };
}

type App = Awaited<ReturnType<typeof setup>>["app"];
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
async function personId(app: App, token: string) {
  const response = await app.inject({
    method: "GET",
    url: "/identity/me",
    headers: bearer(token),
  });
  return response.json<{ person: { id: string } }>().person.id;
}
const cookies = (response: { headers: Record<string, unknown> }) =>
  ([] as string[]).concat(
    (response.headers["set-cookie"] as string | string[] | undefined) ?? [],
  );
// The journeys simulate many people and browsers; each request gets its own
// client address so per-client rate limits (not under test here) do not trip.
let client = 0;
async function post(
  app: App,
  url: string,
  payload: unknown,
  headers: Record<string, string> = {},
) {
  client += 1;
  return app.inject({
    method: "POST",
    url,
    payload: payload as object,
    headers,
    remoteAddress: `198.51.${Math.floor(client / 250) % 250}.${(client % 250) + 1}`,
  });
}

async function embeddedPdt(
  app: App,
  pdt: ReturnType<typeof fakePdt>,
  subject: string,
  extra: Record<string, string> = {},
  intent = "login",
  email?: string,
) {
  const started = (
    await post(
      app,
      "/identity/providers/pdt/start",
      { intent, mode: "embedded" },
      extra,
    )
  ).json<{
    pendingId: string;
    state: string;
    codeChallenge: string;
    hostOrigin: string;
  }>();
  expect(started.hostOrigin).toBe(PDT);
  const code = pdt.authorize(
    started.codeChallenge,
    subject,
    "Pessoa PDT",
    email,
  );
  return post(app, "/identity/providers/pdt/complete", {
    pendingId: started.pendingId,
    state: started.state,
    code,
    iss: PDT,
  });
}

async function embeddedSankhya(
  app: App,
  mint: (nonce: string) => Promise<string>,
) {
  const started = (
    await post(app, "/identity/providers/sankhya/start", {
      intent: "login",
      mode: "embedded",
    })
  ).json<{
    pendingId: string;
    nonce: string;
  }>();
  return post(app, "/identity/providers/sankhya/complete", {
    pendingId: started.pendingId,
    assertion: await mint(started.nonce),
  });
}

it("provisions, links and authorizes one Person across local, PDT and Sankhya sign-in", async () => {
  await withMigratedDatabase(async (runtimeUrl) => {
    const { app, database, clock, pdt, service, sankhyaAssertion } =
      await setup(runtimeUrl);
    try {
      // ---- bootstrap: server-issued invitation creates the first owner ----
      const bootstrapToken = await service.createBootstrapTicket(false);
      await expect(service.createBootstrapTicket(false)).resolves.toBeTypeOf(
        "string",
      );
      expect(
        (
          await post(app, "/identity/invitations/inspect", {
            purpose: "bootstrap",
            token: bootstrapToken,
          })
        ).statusCode,
      ).toBe(200);
      const weak = await post(app, "/identity/bootstrap", {
        token: bootstrapToken,
        displayName: "Admin",
        login: "admin",
        password: "short",
      });
      expect(weak.json<ErrorBody>().error.code).toBe("IDENTITY_WEAK_PASSWORD");
      const boot = await post(app, "/identity/bootstrap", {
        token: bootstrapToken,
        displayName: "Administradora",
        login: "admin",
        password: "uma frase de acesso segura",
      });
      expect(boot.statusCode).toBe(200);
      expect(String(boot.headers["set-cookie"])).toMatch(
        /^ia-mns-session=.+; Path=\/; HttpOnly; SameSite=Strict/,
      );
      let adminToken = boot.json<{ accessToken: string }>().accessToken;
      expect(
        (
          await post(app, "/identity/bootstrap", {
            token: bootstrapToken,
            displayName: "X",
            login: "other",
            password: "uma frase de acesso segura",
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_FLOW_EXPIRED");
      await expect(service.createBootstrapTicket(false)).rejects.toThrow(
        "active owner",
      );

      // ---- owners must enroll a second factor before administration ----
      const denied = await app.inject({
        method: "GET",
        url: "/identity/admin/persons",
        headers: bearer(adminToken),
      });
      expect(denied.json<ErrorBody>().error.code).toBe(
        "IDENTITY_STRONG_AUTHENTICATION_REQUIRED",
      );
      const setup = (
        await post(app, "/identity/me/totp", {}, bearer(adminToken))
      ).json<{ setup: string; secret: string; otpauthUri: string }>();
      expect(setup.otpauthUri).toContain("otpauth://totp/IA-MNS%3Aadmin");
      const secret = base32Decode(setup.secret);
      const step = () => Math.floor(clock.now / 30_000);
      expect(
        (
          await post(
            app,
            "/identity/me/totp/confirm",
            { setup: setup.setup, code: "000000" },
            bearer(adminToken),
          )
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_INVALID_CODE");
      const confirmed = await post(
        app,
        "/identity/me/totp/confirm",
        { setup: setup.setup, code: totpCode(secret, step()) },
        bearer(adminToken),
      );
      expect(confirmed.statusCode).toBe(200);
      const recoveryCodes = confirmed.json<{ recoveryCodes: string[] }>()
        .recoveryCodes;
      adminToken = confirmed.json<{ accessToken: string }>().accessToken;
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/identity/admin/persons",
            headers: bearer(adminToken),
          })
        ).statusCode,
      ).toBe(200);

      // ---- local sign-in with second factor; reuse of a TOTP step is refused ----
      clock.now += 31_000;
      const wrong = await post(app, "/identity/login/local", {
        login: "admin",
        password: "wrong password here",
      });
      const unknown = await post(app, "/identity/login/local", {
        login: "nobody",
        password: "wrong password here",
      });
      // Unknown login and wrong password are indistinguishable.
      expect(wrong.json<ErrorBody>()).toMatchObject({
        error: { code: unknown.json<ErrorBody>().error.code },
      });
      expect(unknown.json<ErrorBody>().error.code).toBe(
        "IDENTITY_INVALID_CREDENTIALS",
      );
      const first = (
        await post(app, "/identity/login/local", {
          login: "Admin",
          password: "uma frase de acesso segura",
        })
      ).json<{ kind: string; challenge: string }>();
      expect(first.kind).toBe("mfa_required");
      const code = totpCode(secret, step());
      const mfa = await post(app, "/identity/login/mfa", {
        challenge: first.challenge,
        code,
      });
      expect(mfa.json<{ kind: string }>().kind).toBe("authenticated");
      const again = (
        await post(app, "/identity/login/local", {
          login: "admin",
          password: "uma frase de acesso segura",
        })
      ).json<{ challenge: string }>();
      expect(
        (
          await post(app, "/identity/login/mfa", {
            challenge: again.challenge,
            code,
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_INVALID_CODE");
      const viaRecovery = await post(app, "/identity/login/mfa", {
        challenge: again.challenge,
        code: recoveryCodes[0].toUpperCase(),
      });
      expect(viaRecovery.json<{ kind: string }>().kind).toBe("authenticated");

      // ---- refresh rotation; presenting a rotated credential revokes the session ----
      const cookie = String(mfa.headers["set-cookie"]).split(";")[0];
      expect(
        (await post(app, "/identity/session/refresh", {}, { cookie }))
          .statusCode,
      ).toBe(401);
      const rotated = await post(
        app,
        "/identity/session/refresh",
        {},
        { cookie, ...web },
      );
      expect(rotated.statusCode).toBe(200);
      const nextCookie = String(rotated.headers["set-cookie"]).split(";")[0];
      expect(nextCookie).not.toBe(cookie);
      // Another tab renewing with the same credential moments later is not an
      // attack: it gets a token and keeps the cookie the first tab received.
      const raced = await post(
        app,
        "/identity/session/refresh",
        {},
        { cookie, ...web },
      );
      expect(raced.statusCode).toBe(200);
      expect(raced.headers["set-cookie"]).toBeUndefined();
      // After the grace window the replaced credential is reuse: the session ends.
      clock.now += 31_000;
      expect(
        (await post(app, "/identity/session/refresh", {}, { cookie, ...web }))
          .statusCode,
      ).toBe(401);
      expect(
        (
          await post(
            app,
            "/identity/session/refresh",
            {},
            { cookie: nextCookie, ...web },
          )
        ).statusCode,
      ).toBe(401);

      // ---- PDT embedded first access creates the Person automatically ----
      const pdtSubject = randomUUID();
      const created = await embeddedPdt(app, pdt, pdtSubject);
      expect(created.json()).toMatchObject({
        kind: "authenticated",
        provisioned: true,
      });
      expect(created.headers["set-cookie"]).toBeUndefined();
      const pdtToken = created.json<{ accessToken: string }>().accessToken;
      const me = (
        await app.inject({
          method: "GET",
          url: "/identity/me",
          headers: bearer(pdtToken),
        })
      ).json<{
        person: {
          id: string;
          permissions: string[];
          links: { id: string; provider: string }[];
        };
        session: { surface: string };
      }>();
      expect(me.session.surface).toBe("pdt");
      expect(me.person.permissions).toEqual([]);
      const conversation = (
        await post(app, "/agent/conversations", {}, bearer(pdtToken))
      ).json<{ id: string }>();
      const second = (await embeddedPdt(app, pdt, pdtSubject)).json<{
        kind: string;
        provisioned: boolean;
        accessToken: string;
      }>();
      expect(second).toMatchObject({
        kind: "authenticated",
        provisioned: false,
      });
      const listed = (
        await app.inject({
          method: "GET",
          url: "/agent/conversations",
          headers: bearer(second.accessToken),
        })
      ).json<{ items: { id: string }[] }>();
      expect(listed.items.map((item) => item.id)).toEqual([conversation.id]);

      // ---- link Sankhya to the same Person: requires recent authentication ----
      const linkStart = (
        await post(
          app,
          "/identity/providers/sankhya/start",
          { intent: "link", mode: "embedded" },
          bearer(second.accessToken),
        )
      ).json<{ pendingId: string; nonce: string }>();
      const linked = await post(app, "/identity/providers/sankhya/complete", {
        pendingId: linkStart.pendingId,
        assertion: await sankhyaAssertion(linkStart.nonce, "321"),
      });
      expect(linked.json()).toEqual({ kind: "linked", provider: "sankhya" });
      // Sankhya-linked Person now receives the read capability by policy, from the Om surface too.
      const fromOm = (
        await embeddedSankhya(app, (nonce) => sankhyaAssertion(nonce, "321"))
      ).json<{ kind: string; accessToken: string }>();
      expect(fromOm.kind).toBe("authenticated");
      const omMe = (
        await app.inject({
          method: "GET",
          url: "/identity/me",
          headers: bearer(fromOm.accessToken),
        })
      ).json<{
        person: {
          id: string;
          permissions: string[];
          links: { id: string; provider: string }[];
        };
      }>();
      expect(omMe.person.id).toBe(me.person.id);
      expect(omMe.person.permissions).toEqual(["sales:read"]);
      const omConversations = (
        await app.inject({
          method: "GET",
          url: "/agent/conversations",
          headers: bearer(fromOm.accessToken),
        })
      ).json<{ items: { id: string }[] }>();
      expect(omConversations.items.map((item) => item.id)).toEqual([
        conversation.id,
      ]);

      // ---- replayed or forged host proofs are rejected ----
      const replayStart = (
        await post(app, "/identity/providers/sankhya/start", {
          intent: "login",
          mode: "embedded",
        })
      ).json<{ pendingId: string; nonce: string }>();
      const assertion = await sankhyaAssertion(replayStart.nonce, "321");
      expect(
        (
          await post(app, "/identity/providers/sankhya/complete", {
            pendingId: replayStart.pendingId,
            assertion,
          })
        ).statusCode,
      ).toBe(200);
      const replayAgain = (
        await post(app, "/identity/providers/sankhya/start", {
          intent: "login",
          mode: "embedded",
        })
      ).json<{ pendingId: string }>();
      expect(
        (
          await post(app, "/identity/providers/sankhya/complete", {
            pendingId: replayAgain.pendingId,
            assertion,
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_PROOF_REJECTED");
      const foreignKey = await generateKeyPair("ES256");
      expect(
        (
          await embeddedSankhya(app, (nonce) =>
            sankhyaAssertion(nonce, "321", foreignKey.privateKey),
          )
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_PROOF_REJECTED");

      // ---- a different Sankhya user is a different Person; no merge by coincidence ----
      const strangerAccount = await embeddedSankhya(app, (nonce) =>
        sankhyaAssertion(nonce, "999"),
      );
      expect(strangerAccount.json()).toMatchObject({
        kind: "authenticated",
        provisioned: true,
      });
      const strangerToken = strangerAccount.json<{ accessToken: string }>()
        .accessToken;
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/agent/conversations",
            headers: bearer(strangerToken),
          })
        ).json<{ items: unknown[] }>().items,
      ).toEqual([]);
      const strangerId = await personId(app, strangerToken);
      expect(strangerId).not.toBe(me.person.id);
      // The stranger's account cannot be attached to the first Person by any flow.
      const conflictStart = (
        await post(
          app,
          "/identity/providers/pdt/start",
          { intent: "link", mode: "embedded" },
          bearer(strangerToken),
        )
      ).json<{ pendingId: string; state: string; codeChallenge: string }>();
      const conflict = await post(app, "/identity/providers/pdt/complete", {
        pendingId: conflictStart.pendingId,
        state: conflictStart.state,
        code: pdt.authorize(conflictStart.codeChallenge, pdtSubject),
        iss: PDT,
      });
      expect(conflict.json<ErrorBody>().error.code).toBe(
        "IDENTITY_LINK_CONFLICT",
      );

      // ---- embedded sessions renew by a new host proof; last-method protection ----
      const pdtLink = omMe.person.links.find(
        (link) => link.provider === "pdt",
      )!;
      const sankhyaLink = omMe.person.links.find(
        (link) => link.provider === "sankhya",
      )!;
      clock.now += 11 * 60_000;
      const expired = await app.inject({
        method: "GET",
        url: "/identity/me",
        headers: bearer(fromOm.accessToken),
      });
      expect(expired.statusCode).toBe(401);
      expect(expired.json<ErrorBody>().error.code).toBe(
        "IDENTITY_SESSION_EXPIRED",
      );
      const renewed = (
        await embeddedSankhya(app, (nonce) => sankhyaAssertion(nonce, "321"))
      ).json<{ accessToken: string }>();
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/identity/me/links/${pdtLink.id}`,
            headers: bearer(renewed.accessToken),
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/identity/me/links/${sankhyaLink.id}`,
            headers: bearer(renewed.accessToken),
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_LAST_METHOD");

      // ---- the unlinked PDT account signs in alone: a new profile, then consolidation by proof ----
      const alone = (await embeddedPdt(app, pdt, pdtSubject)).json<{
        provisioned: boolean;
        accessToken: string;
      }>();
      expect(alone.provisioned).toBe(true);
      const aloneConversation = (
        await post(app, "/agent/conversations", {}, bearer(alone.accessToken))
      ).json<{ id: string }>();
      const relink = (
        await embeddedPdt(
          app,
          pdt,
          pdtSubject,
          bearer(renewed.accessToken),
          "link",
        )
      ).json<{ kind: string; ticket: string }>();
      expect(relink).toMatchObject({
        kind: "merge_available",
        provider: "pdt",
      });
      // Only the session that proved both profiles can confirm, and others cannot burn it.
      expect(
        (
          await post(
            app,
            "/identity/merge",
            { ticket: relink.ticket },
            bearer(alone.accessToken),
          )
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_FLOW_EXPIRED");
      expect(
        (
          await post(
            app,
            "/identity/merge",
            { ticket: relink.ticket },
            bearer(renewed.accessToken),
          )
        ).json(),
      ).toEqual({ kind: "linked", provider: "pdt" });
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/identity/me",
            headers: bearer(alone.accessToken),
          })
        ).statusCode,
      ).toBe(401);
      const consolidated = (
        await app.inject({
          method: "GET",
          url: "/agent/conversations",
          headers: bearer(renewed.accessToken),
        })
      ).json<{ items: { id: string }[] }>();
      expect(consolidated.items.map((item) => item.id).sort()).toEqual(
        [conversation.id, aloneConversation.id].sort(),
      );
      const back = (await embeddedPdt(app, pdt, pdtSubject)).json<{
        accessToken: string;
      }>();
      expect(await personId(app, back.accessToken)).toBe(me.person.id);

      // ---- e-mail is only a hint: a matching profile stops automatic creation ----
      const anaSankhya = (
        await embeddedSankhya(app, (nonce) =>
          sankhyaAssertion(nonce, "555", undefined, "Ana@MNS.example.test"),
        )
      ).json<{ provisioned: boolean; accessToken: string }>();
      expect(anaSankhya.provisioned).toBe(true);
      const anaPdt = randomUUID();
      const candidate = (
        await embeddedPdt(app, pdt, anaPdt, {}, "login", "ana@mns.example.test")
      ).json<{ kind: string; ticket: string }>();
      expect(candidate).toMatchObject({
        kind: "provision_required",
        reason: "candidate",
        methods: ["sankhya"],
      });
      expect(
        (
          await post(app, "/identity/provision/inspect", {
            ticket: candidate.ticket,
          })
        ).json(),
      ).toEqual({
        provider: "pdt",
        label: "Pessoa PDT",
        reason: "candidate",
        methods: ["sankhya"],
      });
      // A Person that already has a PDT account cannot take this one.
      expect(
        (
          await post(
            app,
            "/identity/provision/link",
            { ticket: candidate.ticket },
            bearer(back.accessToken),
          )
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_PROVIDER_ALREADY_LINKED");
      // Proving the suggested profile attaches the account to it.
      const anaCandidate = (
        await embeddedPdt(app, pdt, anaPdt, {}, "login", "ana@mns.example.test")
      ).json<{ ticket: string }>();
      const anaProof = (
        await embeddedSankhya(app, (nonce) => sankhyaAssertion(nonce, "555"))
      ).json<{ accessToken: string }>();
      expect(
        (
          await post(
            app,
            "/identity/provision/link",
            { ticket: anaCandidate.ticket },
            bearer(anaProof.accessToken),
          )
        ).json(),
      ).toEqual({ kind: "linked", provider: "pdt" });
      const anaAgain = (await embeddedPdt(app, pdt, anaPdt)).json<{
        provisioned: boolean;
        accessToken: string;
      }>();
      expect(anaAgain.provisioned).toBe(false);
      expect(await personId(app, anaAgain.accessToken)).toBe(
        await personId(app, anaProof.accessToken),
      );
      // Ana's profile already has a PDT account, so another PDT account with
      // the same e-mail cannot be hers: it is created without asking.
      expect(
        (
          await embeddedPdt(
            app,
            pdt,
            randomUUID(),
            {},
            "login",
            "ana@mns.example.test",
          )
        ).json(),
      ).toMatchObject({ kind: "authenticated", provisioned: true });

      // ---- owner administration: grants, last owner, disable revokes access ----
      clock.now += 31_000;
      const adminLogin = (
        await post(app, "/identity/login/local", {
          login: "admin",
          password: "uma frase de acesso segura",
        })
      ).json<{ challenge: string }>();
      const admin = (
        await post(app, "/identity/login/mfa", {
          challenge: adminLogin.challenge,
          code: totpCode(secret, Math.floor(clock.now / 30_000)),
        })
      ).json<{ accessToken: string }>();
      const strangerFresh = (
        await embeddedSankhya(app, (nonce) => sankhyaAssertion(nonce, "999"))
      ).json<{ accessToken: string }>().accessToken;
      const adminMe = (
        await app.inject({
          method: "GET",
          url: "/identity/me",
          headers: bearer(admin.accessToken),
        })
      ).json<{ person: { id: string; permissions: string[] } }>();
      expect(adminMe.person.permissions).toEqual([
        "identity:admin",
        "sales:read",
      ]);
      expect(
        (
          await app.inject({
            method: "PUT",
            url: `/identity/admin/persons/${strangerId}/grants/identity:admin`,
            headers: bearer(admin.accessToken),
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_UNKNOWN_PERMISSION");
      expect(
        (
          await app.inject({
            method: "PUT",
            url: `/identity/admin/persons/${strangerId}/grants/sales:read`,
            headers: bearer(admin.accessToken),
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: "PUT",
            url: `/identity/admin/persons/${strangerId}/grants/sales:read`,
            headers: bearer(strangerFresh),
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_ACCESS_DENIED");
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/identity/admin/persons/${adminMe.person.id}/owner`,
            headers: bearer(admin.accessToken),
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_LAST_OWNER");
      const detail = (
        await app.inject({
          method: "GET",
          url: `/identity/admin/persons/${strangerId}`,
          headers: bearer(admin.accessToken),
        })
      ).json<{
        person: { grants: string[] };
        catalog: { permission: string; autoGrantProviders: string[] }[];
        audit: { action: string }[];
      }>();
      expect(detail.person.grants).toEqual(["sales:read"]);
      expect(detail.catalog).toEqual([
        expect.objectContaining({
          permission: "sales:read",
          autoGrantProviders: ["sankhya"],
        }),
      ]);
      expect(detail.audit.map((event) => event.action)).toContain(
        "grant.added",
      );
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/identity/admin/persons/${strangerId}`,
            headers: bearer(admin.accessToken),
            payload: { status: "disabled" },
          })
        ).statusCode,
      ).toBe(200);
      // Disabling revokes the Person's sessions immediately for identity operations.
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/identity/me",
            headers: bearer(strangerFresh),
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_SESSION_EXPIRED");
      expect(
        (
          await embeddedSankhya(app, (nonce) => sankhyaAssertion(nonce, "999"))
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_ACCOUNT_DISABLED");

      // ---- administrative mutations require recent strong authentication ----
      clock.now += 31 * 60_000;
      const stale = await app.inject({
        method: "PUT",
        url: `/identity/admin/persons/${strangerId}/grants/sales:read`,
        headers: bearer(admin.accessToken),
      });
      expect(stale.json<ErrorBody>().error.code).toBe(
        "IDENTITY_RECENT_AUTHENTICATION_REQUIRED",
      );
      const stepped = await post(
        app,
        "/identity/me/reauthenticate",
        {
          password: "uma frase de acesso segura",
          code: totpCode(secret, Math.floor(clock.now / 30_000)),
        },
        bearer(admin.accessToken),
      );
      expect(stepped.statusCode).toBe(200);
      admin.accessToken = stepped.json<{ accessToken: string }>().accessToken;

      // ---- no public account creation: only the owner creates Persons ----
      expect(
        (
          await post(
            app,
            "/identity/admin/persons",
            { displayName: "Intrusa", localInvitation: true },
            bearer(strangerToken),
          )
        ).statusCode,
      ).toBe(401);

      // ---- owner-created Person: local invitation plus a PDT link invitation ----
      const lateSubject = randomUUID();
      const late = (await embeddedPdt(app, pdt, lateSubject)).json<{
        provisioned: boolean;
        accessToken: string;
      }>();
      expect(late.provisioned).toBe(true);
      const lateConversation = (
        await post(app, "/agent/conversations", {}, bearer(late.accessToken))
      ).json<{ id: string }>();
      const invited = (
        await post(
          app,
          "/identity/admin/persons",
          {
            displayName: "Convidada",
            localInvitation: true,
            linkInvitations: ["pdt"],
          },
          bearer(admin.accessToken),
        )
      ).json<{
        personId: string;
        enrollmentToken: string;
        linkInvitations: { provider: string; token: string }[];
      }>();
      expect(invited.linkInvitations.map((item) => item.provider)).toEqual([
        "pdt",
      ]);
      const linkToken = invited.linkInvitations[0].token;
      expect(
        (
          await post(app, "/identity/invitations/inspect", {
            purpose: "link",
            token: linkToken,
          })
        ).json(),
      ).toEqual({ displayName: "Convidada", provider: "pdt" });
      const enrolled = await post(app, "/identity/invitations/complete", {
        purpose: "enrollment",
        token: invited.enrollmentToken,
        login: "convidada",
        password: "outra frase longa e segura",
      });
      expect(enrolled.json<{ kind: string }>().kind).toBe("authenticated");
      expect(
        (
          await post(app, "/identity/invitations/complete", {
            purpose: "enrollment",
            token: invited.enrollmentToken,
            login: "x2y",
            password: "outra frase longa e segura",
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_FLOW_EXPIRED");
      // The invited person proves the PDT account they had already used on
      // their own; that automatic profile is consolidated into the invited one.
      const invitedStart = (
        await post(app, "/identity/providers/pdt/start", {
          intent: "invite",
          mode: "embedded",
          invitation: linkToken,
        })
      ).json<{ pendingId: string; state: string; codeChallenge: string }>();
      const accepted = await post(app, "/identity/providers/pdt/complete", {
        pendingId: invitedStart.pendingId,
        state: invitedStart.state,
        code: pdt.authorize(invitedStart.codeChallenge, lateSubject),
        iss: PDT,
      });
      expect(accepted.json()).toMatchObject({
        kind: "authenticated",
        provisioned: false,
      });
      const acceptedToken = accepted.json<{ accessToken: string }>()
        .accessToken;
      const acceptedMe = (
        await app.inject({
          method: "GET",
          url: "/identity/me",
          headers: bearer(acceptedToken),
        })
      ).json<{
        person: {
          id: string;
          local: { login: string } | null;
          links: { provider: string }[];
        };
      }>();
      expect(acceptedMe.person.id).toBe(invited.personId);
      expect(acceptedMe.person.local?.login).toBe("convidada");
      expect(acceptedMe.person.links.map((link) => link.provider)).toEqual([
        "pdt",
      ]);
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/agent/conversations",
            headers: bearer(acceptedToken),
          })
        )
          .json<{ items: { id: string }[] }>()
          .items.map((item) => item.id),
      ).toEqual([lateConversation.id]);
      expect(
        (
          await post(app, "/identity/providers/pdt/start", {
            intent: "invite",
            mode: "embedded",
            invitation: linkToken,
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_FLOW_EXPIRED");

      // ---- Sankhya association from the ERP directory, validated server-side ----
      const found = (
        await app.inject({
          method: "GET",
          url: "/identity/admin/sankhya-users?query=ma",
          headers: bearer(admin.accessToken),
        })
      ).json<{
        items: { codusu: string; linkedTo: { personId: string } | null }[];
      }>();
      expect(
        found.items.map((item) => [item.codusu, item.linkedTo?.personId]),
      ).toEqual([["321", me.person.id]]);
      for (const [codusu, code] of [
        ["4322", "IDENTITY_EXTERNAL_ACCOUNT_INACTIVE"],
        ["4399", "IDENTITY_EXTERNAL_ACCOUNT_NOT_FOUND"],
        ["321", "IDENTITY_LINK_CONFLICT"],
      ])
        expect(
          (
            await post(
              app,
              "/identity/admin/persons",
              {
                displayName: "Errada",
                localInvitation: false,
                sankhyaUser: codusu,
              },
              bearer(admin.accessToken),
            )
          ).json<ErrorBody>().error.code,
        ).toBe(code);
      expect(
        await database.identityPerson.count({
          where: { displayName: "Errada" },
        }),
      ).toBe(0);
      const attested = (
        await post(
          app,
          "/identity/admin/persons",
          { displayName: "Joana", localInvitation: false, sankhyaUser: "4321" },
          bearer(admin.accessToken),
        )
      ).json<{ personId: string; enrollmentToken: string | null }>();
      expect(attested.enrollmentToken).toBeNull();
      const joanaOm = (
        await embeddedSankhya(app, (nonce) => sankhyaAssertion(nonce, "4321"))
      ).json<{ provisioned: boolean; accessToken: string }>();
      expect(joanaOm.provisioned).toBe(false);
      const joanaMe = (
        await app.inject({
          method: "GET",
          url: "/identity/me",
          headers: bearer(joanaOm.accessToken),
        })
      ).json<{
        person: {
          id: string;
          permissions: string[];
          links: { establishedBy: string }[];
        };
      }>();
      expect(joanaMe.person.id).toBe(attested.personId);
      expect(joanaMe.person.links).toEqual([
        expect.objectContaining({ establishedBy: "directory" }),
      ]);
      expect(joanaMe.person.permissions).toEqual(["sales:read"]);
      // A PDT account reporting Joana's directory e-mail is asked for proof;
      // this person declares the profile is not theirs and gets a separate one.
      const namesake = (
        await embeddedPdt(
          app,
          pdt,
          randomUUID(),
          {},
          "login",
          "joana@mns.example.test",
        )
      ).json<{ ticket: string; reason: string; methods: string[] }>();
      expect(namesake).toMatchObject({
        reason: "candidate",
        methods: ["sankhya"],
      });
      const separate = await post(app, "/identity/provision/create", {
        ticket: namesake.ticket,
      });
      expect(separate.json()).toMatchObject({
        kind: "authenticated",
        provisioned: true,
      });
      const namesakeToken = separate.json<{ accessToken: string }>()
        .accessToken;
      const namesakeId = await personId(app, namesakeToken);
      expect(namesakeId).not.toBe(attested.personId);

      // ---- owner consolidation of two profiles of the same individual ----
      const merge = (target: string, source: string) =>
        post(
          app,
          `/identity/admin/persons/${target}/merge`,
          { sourcePersonId: source },
          bearer(admin.accessToken),
        );
      expect(
        (await merge(attested.personId, adminMe.person.id)).json<ErrorBody>()
          .error.code,
      ).toBe("IDENTITY_MERGE_NOT_ALLOWED");
      expect(
        (await merge(invited.personId, namesakeId)).json<ErrorBody>().error
          .code,
      ).toBe("IDENTITY_PROVIDER_ALREADY_LINKED");
      expect((await merge(attested.personId, namesakeId)).statusCode).toBe(200);
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/identity/admin/persons/${namesakeId}`,
            headers: bearer(admin.accessToken),
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_PERSON_NOT_FOUND");
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/identity/me",
            headers: bearer(namesakeToken),
          })
        ).statusCode,
      ).toBe(401);

      // ---- audit evidence is append-only for the runtime role and contains no secrets ----
      await expect(
        database.$executeRaw`DELETE FROM identity_audit_events`,
      ).rejects.toThrow();
      const audit = JSON.stringify(
        await database.identityAuditEvent.findMany(),
      );
      for (const secretValue of [
        bootstrapToken,
        linkToken,
        invited.enrollmentToken,
        recoveryCodes[1],
        "uma frase de acesso segura",
        setup.secret,
      ])
        expect(audit).not.toContain(secretValue);
      const stored = JSON.stringify(
        await database.identityLocalCredential.findMany(),
        (_key, value: unknown) =>
          typeof value === "bigint" ? String(value) : value,
      );
      expect(stored).not.toContain("uma frase");
      expect(stored).not.toContain(setup.secret);
    } finally {
      await app.close();
      await database.$disconnect();
    }
  });
}, 180_000);

it("binds direct-URL provider callbacks to the browser and redirects without exposing proofs", async () => {
  await withMigratedDatabase(async (runtimeUrl) => {
    const { app, database, pdt, sankhyaAssertion, clock } =
      await setup(runtimeUrl);
    try {
      const start = await post(app, "/identity/providers/pdt/start", {
        intent: "login",
        mode: "direct",
      });
      const redirectUrl = new URL(
        start.json<{ redirectUrl: string }>().redirectUrl,
      );
      expect(redirectUrl.origin).toBe(PDT);
      expect(redirectUrl.searchParams.get("client_id")).toBe("ia-mns");
      const binding = String(start.headers["set-cookie"]);
      expect(binding).toMatch(
        /^ia-mns-pdt=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=300/,
      );
      const state = redirectUrl.searchParams.get("state")!;
      const code = pdt.authorize(
        redirectUrl.searchParams.get("code_challenge")!,
        randomUUID(),
      );
      const query = `code=${code}&state=${state}&iss=${encodeURIComponent(PDT)}`;
      // Without the binding cookie (another browser) the code is useless.
      const stolen = await app.inject({
        method: "GET",
        url: `/identity/pdt/callback?${query}`,
      });
      expect(stolen.statusCode).toBe(303);
      expect(stolen.headers.location).toBe(
        `${ORIGIN}/entrar?erro=IDENTITY_FLOW_EXPIRED`,
      );
      const restart = await post(app, "/identity/providers/pdt/start", {
        intent: "login",
        mode: "direct",
      });
      const restartUrl = new URL(
        restart.json<{ redirectUrl: string }>().redirectUrl,
      );
      const subjectOfDirect = randomUUID();
      const restartCode = pdt.authorize(
        restartUrl.searchParams.get("code_challenge")!,
        subjectOfDirect,
      );
      const callback = await app.inject({
        method: "GET",
        url: `/identity/pdt/callback?code=${restartCode}&state=${restartUrl.searchParams.get("state")}&iss=${encodeURIComponent(PDT)}`,
        headers: {
          cookie: String(restart.headers["set-cookie"]).split(";")[0],
        },
      });
      expect(callback.statusCode).toBe(303);
      // Unknown account, no profile signed in on this browser: created automatically.
      expect(callback.headers.location).toBe(`${ORIGIN}/conta?novo=1`);
      expect(callback.headers["referrer-policy"]).toBe("no-referrer");
      const sessionCookie = cookies(callback)
        .find((item) => item.startsWith("ia-mns-session="))!
        .split(";")[0];
      const refreshed = await post(
        app,
        "/identity/session/refresh",
        {},
        { cookie: sessionCookie, ...web },
      );
      const directToken = refreshed.json<{ accessToken: string }>().accessToken;
      const browserCookie = cookies(refreshed)[0].split(";")[0];
      // Direct sessions reauthenticate through the same provider before sensitive changes.
      clock.now += 11 * 60_000;
      const me = (
        await app.inject({
          method: "GET",
          url: "/identity/me",
          headers: bearer(directToken),
        })
      ).json<{ person: { links: { id: string }[] } }>();
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/identity/me/links/${me.person.links[0].id}`,
            headers: bearer(directToken),
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_RECENT_AUTHENTICATION_REQUIRED");
      const reauth = await post(
        app,
        "/identity/providers/pdt/start",
        { intent: "reauth", mode: "direct" },
        bearer(directToken),
      );
      const reauthUrl = new URL(
        reauth.json<{ redirectUrl: string }>().redirectUrl,
      );
      const reauthed = await app.inject({
        method: "GET",
        url: `/identity/pdt/callback?code=${pdt.authorize(reauthUrl.searchParams.get("code_challenge")!, subjectOfDirect)}&state=${reauthUrl.searchParams.get("state")}&iss=${encodeURIComponent(PDT)}`,
        headers: {
          cookie: String(reauth.headers["set-cookie"]).split(";")[0],
        },
      });
      expect(reauthed.headers.location).toBe(`${ORIGIN}/conta?confirmado=1`);
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/identity/me/links/${me.person.links[0].id}`,
            headers: bearer(directToken),
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_LAST_METHOD");

      // Proving a suggested profile from a pending first access returns there.
      const resume = await post(app, "/identity/providers/pdt/start", {
        intent: "login",
        mode: "direct",
        resumeFirstAccess: true,
      });
      const resumeUrl = new URL(
        resume.json<{ redirectUrl: string }>().redirectUrl,
      );
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/identity/pdt/callback?code=${pdt.authorize(resumeUrl.searchParams.get("code_challenge")!, subjectOfDirect)}&state=${resumeUrl.searchParams.get("state")}&iss=${encodeURIComponent(PDT)}`,
            headers: { cookie: cookies(resume)[0].split(";")[0] },
          })
        ).headers.location,
      ).toBe(`${ORIGIN}/entrar/primeiro-acesso`);

      // A browser already signed in never silently gets a second profile.
      const second = await post(
        app,
        "/identity/providers/pdt/start",
        { intent: "login", mode: "direct" },
        { cookie: browserCookie, ...web },
      );
      const secondUrl = new URL(
        second.json<{ redirectUrl: string }>().redirectUrl,
      );
      const secondCallback = await app.inject({
        method: "GET",
        url: `/identity/pdt/callback?code=${pdt.authorize(secondUrl.searchParams.get("code_challenge")!, randomUUID())}&state=${secondUrl.searchParams.get("state")}&iss=${encodeURIComponent(PDT)}`,
        headers: { cookie: cookies(second)[0].split(";")[0] },
      });
      expect(secondCallback.headers.location).toBe(
        `${ORIGIN}/entrar/primeiro-acesso`,
      );
      const provisionCookie = cookies(secondCallback)
        .find((item) => item.startsWith("ia-mns-provision="))!
        .split(";")[0];
      expect(
        (
          await post(
            app,
            "/identity/provision/inspect",
            {},
            { cookie: provisionCookie, ...web, origin: ORIGIN },
          )
        ).json(),
      ).toEqual({
        provider: "pdt",
        label: "Pessoa PDT",
        reason: "signed_in",
        methods: [],
      });
      const separate = await post(
        app,
        "/identity/provision/create",
        {},
        { cookie: provisionCookie, ...web, origin: ORIGIN },
      );
      expect(separate.json()).toMatchObject({
        kind: "authenticated",
        provisioned: true,
      });

      // Sankhya direct: the Om form-posts cross-site, so the binding cookie is SameSite=None.
      const sankhyaStart = await post(
        app,
        "/identity/providers/sankhya/start",
        { intent: "login", mode: "direct" },
      );
      const om = new URL(
        sankhyaStart.json<{ redirectUrl: string }>().redirectUrl,
      );
      expect(om.origin + om.pathname).toBe(
        "https://om.example.test/mge/ia-mns/authorize.jsp",
      );
      // Over plain-HTTP development the cross-site binding degrades to Lax; HTTPS uses None + Secure.
      expect(String(sankhyaStart.headers["set-cookie"])).toContain(
        "ia-mns-sankhya=",
      );
      const form = new URLSearchParams({
        assertion: await sankhyaAssertion(om.searchParams.get("nonce")!, "77"),
        state: om.searchParams.get("state")!,
      });
      const posted = await app.inject({
        method: "POST",
        url: "/identity/sankhya/callback",
        payload: form.toString(),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: String(sankhyaStart.headers["set-cookie"]).split(";")[0],
        },
      });
      expect(posted.statusCode).toBe(303);
      expect(posted.headers.location).toBe(`${ORIGIN}/conta?novo=1`);

      // Proving that Sankhya account from the first profile offers consolidation.
      const linkStart = await post(
        app,
        "/identity/providers/sankhya/start",
        { intent: "link", mode: "direct" },
        bearer(directToken),
      );
      const linkOm = new URL(
        linkStart.json<{ redirectUrl: string }>().redirectUrl,
      );
      const linkPosted = await app.inject({
        method: "POST",
        url: "/identity/sankhya/callback",
        payload: new URLSearchParams({
          assertion: await sankhyaAssertion(
            linkOm.searchParams.get("nonce")!,
            "77",
          ),
          state: linkOm.searchParams.get("state")!,
        }).toString(),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: cookies(linkStart)[0].split(";")[0],
        },
      });
      expect(linkPosted.headers.location).toBe(
        `${ORIGIN}/conta?unificar=sankhya`,
      );
      const mergeCookie = cookies(linkPosted)
        .find((item) => item.startsWith("ia-mns-merge="))!
        .split(";")[0];
      expect(
        (
          await post(
            app,
            "/identity/merge",
            {},
            {
              cookie: mergeCookie,
              ...web,
              origin: ORIGIN,
              ...bearer(directToken),
            },
          )
        ).json(),
      ).toEqual({ kind: "linked", provider: "sankhya" });
    } finally {
      await app.close();
      await database.$disconnect();
    }
  });
}, 180_000);

it("lets owners administer the authentication policy and applies it to sessions, inactivity and the second factor", async () => {
  await withMigratedDatabase(async (runtimeUrl) => {
    const { app, database, clock, pdt, service } = await setup(runtimeUrl);
    try {
      const passphrase = "uma frase de acesso segura";
      const step = () => Math.floor(clock.now / 30_000);
      const cookieOf = (response: { headers: Record<string, unknown> }) =>
        cookies(response)
          .find((item) => item.startsWith("ia-mns-session="))!
          .split(";")[0];

      // ---- an owner with a second factor ----
      const boot = await post(app, "/identity/bootstrap", {
        token: await service.createBootstrapTicket(false),
        displayName: "Dona",
        login: "dona",
        password: passphrase,
      });
      const ownerCookie = cookieOf(boot);
      const setupTotp = (
        await post(
          app,
          "/identity/me/totp",
          {},
          bearer(boot.json<{ accessToken: string }>().accessToken),
        )
      ).json<{ setup: string; secret: string }>();
      const ownerSecret = base32Decode(setupTotp.secret);
      const owner = (
        await post(
          app,
          "/identity/me/totp/confirm",
          { setup: setupTotp.setup, code: totpCode(ownerSecret, step()) },
          bearer(boot.json<{ accessToken: string }>().accessToken),
        )
      ).json<{ accessToken: string }>().accessToken;
      const readPolicy = (token: string) =>
        app.inject({
          method: "GET",
          url: "/identity/admin/security-policy",
          headers: bearer(token),
        });
      const writePolicy = (token: string, payload: object) =>
        app.inject({
          method: "PUT",
          url: "/identity/admin/security-policy",
          headers: bearer(token),
          payload,
        });

      // ---- secure defaults, readable only by owners ----
      const initial = (await readPolicy(owner)).json<{
        configured: Record<string, unknown>;
        effective: Record<string, unknown>;
        production: boolean;
        warnings: string[];
        updatedAt: string | null;
      }>();
      const defaults = {
        sessionMaxMinutes: 720,
        idleTimeoutMinutes: 120,
        recentAuthMinutes: 10,
        adminRecentAuthMinutes: 30,
        mfaRequirement: "administrators",
        rememberDeviceDays: 0,
      };
      expect(initial).toMatchObject({
        configured: defaults,
        effective: defaults,
        production: false,
        warnings: [],
        updatedAt: null,
      });
      const visitor = (await embeddedPdt(app, pdt, randomUUID())).json<{
        accessToken: string;
      }>().accessToken;
      expect((await readPolicy(visitor)).json<ErrorBody>().error.code).toBe(
        "IDENTITY_ACCESS_DENIED",
      );
      expect(
        (await writePolicy(visitor, defaults)).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_ACCESS_DENIED");

      // ---- hard limits, and explicit acknowledgement of reduced security ----
      for (const invalid of [
        { ...defaults, sessionMaxMinutes: 10 },
        { ...defaults, idleTimeoutMinutes: 800 },
        { ...defaults, recentAuthMinutes: 2 },
        { ...defaults, adminRecentAuthMinutes: 600 },
        { ...defaults, rememberDeviceDays: 365 },
      ])
        expect(
          (await writePolicy(owner, invalid)).json<ErrorBody>().error.code,
        ).toBe("IDENTITY_POLICY_INVALID");
      const permissive = {
        sessionMaxMinutes: 30 * 24 * 60,
        idleTimeoutMinutes: 7 * 24 * 60,
        recentAuthMinutes: 24 * 60,
        adminRecentAuthMinutes: 240,
        mfaRequirement: "administrators",
        rememberDeviceDays: 30,
      };
      expect(
        (await writePolicy(owner, permissive)).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_POLICY_CONFIRMATION_REQUIRED");
      expect(
        (
          await writePolicy(owner, {
            ...permissive,
            acknowledgeReducedSecurity: true,
          })
        ).json(),
      ).toEqual({ endedSessions: 0, currentSessionEnded: false });
      const changed = (await readPolicy(owner)).json<{
        configured: Record<string, unknown>;
        warnings: string[];
        updatedBy: string;
        history: { actorName: string; details: Record<string, unknown> }[];
      }>();
      expect(changed.configured).toEqual(permissive);
      expect(changed.warnings.sort()).toEqual([
        "adminRecentAuthMinutes",
        "idleTimeoutMinutes",
        "recentAuthMinutes",
        "sessionMaxMinutes",
      ]);
      expect(changed.updatedBy).toBe("Dona");
      expect(changed.history[0]).toMatchObject({
        actorName: "Dona",
        details: {
          sessionMaxMinutesFrom: 720,
          sessionMaxMinutesTo: 43200,
          rememberDeviceDaysFrom: 0,
          rememberDeviceDaysTo: 30,
          reducedSecurity: true,
        },
      });

      // ---- open sessions follow the new duration at once ----
      const ownerSession = await database.identitySession.findFirstOrThrow({
        where: { method: "bootstrap" },
      });
      expect(
        ownerSession.expiresAt.getTime() - ownerSession.createdAt.getTime(),
      ).toBe(30 * 24 * 3600_000);

      // ---- a person required to use a second factor sets it up at sign-in ----
      const enrollment = (
        await post(
          app,
          "/identity/admin/persons",
          { displayName: "Bia", localInvitation: true },
          bearer(owner),
        )
      ).json<{ enrollmentToken: string }>().enrollmentToken;
      await post(app, "/identity/invitations/complete", {
        purpose: "enrollment",
        token: enrollment,
        login: "bia",
        password: passphrase,
      });
      expect(
        (
          await writePolicy(owner, {
            ...permissive,
            mfaRequirement: "everyone",
            acknowledgeReducedSecurity: true,
          })
        ).statusCode,
      ).toBe(200);
      const required = (
        await post(app, "/identity/login/local", {
          login: "bia",
          password: passphrase,
        })
      ).json<{ kind: string; challenge: string }>();
      expect(required.kind).toBe("mfa_enrollment_required");
      const biaSetup = (
        await post(app, "/identity/login/mfa-enrollment", {
          challenge: required.challenge,
        })
      ).json<{ setup: string; secret: string }>();
      const biaSecret = base32Decode(biaSetup.secret);
      const enrolled = await post(
        app,
        "/identity/login/mfa-enrollment/confirm",
        {
          challenge: required.challenge,
          setup: biaSetup.setup,
          code: totpCode(biaSecret, step()),
        },
      );
      expect(enrolled.statusCode).toBe(200);
      expect(
        enrolled.json<{ recoveryCodes: string[] }>().recoveryCodes,
      ).toHaveLength(10);
      const bia = enrolled.json<{ accessToken: string }>().accessToken;
      // A password set from an invitation also waits for the authenticator.
      const invitedLater = (
        await post(
          app,
          "/identity/admin/persons",
          { displayName: "Caio", localInvitation: true },
          bearer(owner),
        )
      ).json<{ enrollmentToken: string }>().enrollmentToken;
      expect(
        (
          await post(app, "/identity/invitations/complete", {
            purpose: "enrollment",
            token: invitedLater,
            login: "caio",
            password: passphrase,
          })
        ).json<{ kind: string }>().kind,
      ).toBe("mfa_enrollment_required");
      // While the policy requires it, the factor cannot be removed.
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: "/identity/me/totp",
            headers: bearer(bia),
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_TOTP_REQUIRED");

      // ---- remembered browsers skip the code, never for owners ----
      clock.now += 31_000;
      const challenged = (
        await post(app, "/identity/login/local", {
          login: "bia",
          password: passphrase,
        })
      ).json<{ kind: string; challenge: string; rememberDeviceDays: number }>();
      expect(challenged).toMatchObject({
        kind: "mfa_required",
        rememberDeviceDays: 30,
      });
      const remembered = await post(
        app,
        "/identity/login/mfa",
        {
          challenge: challenged.challenge,
          code: totpCode(biaSecret, step()),
          rememberDevice: true,
        },
        { ...web, origin: ORIGIN },
      );
      const device = cookies(remembered).find((item) =>
        item.startsWith("ia-mns-device="),
      )!;
      expect(device).toMatch(/HttpOnly; SameSite=Strict; Max-Age=2592000$/);
      const again = await post(
        app,
        "/identity/login/local",
        { login: "bia", password: passphrase },
        { cookie: device.split(";")[0], ...web, origin: ORIGIN },
      );
      expect(again.json<{ kind: string }>().kind).toBe("authenticated");
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/identity/me",
            headers: bearer(again.json<{ accessToken: string }>().accessToken),
          })
        ).json<{ rememberedDevices: number }>().rememberedDevices,
      ).toBe(1);
      expect(
        (
          await post(app, "/identity/login/local", {
            login: "dona",
            password: passphrase,
          })
        ).json(),
      ).toMatchObject({ kind: "mfa_required", rememberDeviceDays: 0 });
      // Forgetting browsers brings the code back.
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: "/identity/me/remembered-devices",
            headers: bearer(bia),
          })
        ).json(),
      ).toEqual({ forgotten: 1 });
      expect(
        (
          await post(
            app,
            "/identity/login/local",
            { login: "bia", password: passphrase },
            { cookie: device.split(";")[0], ...web, origin: ORIGIN },
          )
        ).json<{ kind: string }>().kind,
      ).toBe("mfa_required");

      // ---- outside production, an optional second factor lets owners be remembered too ----
      expect(
        (
          await writePolicy(owner, {
            ...permissive,
            mfaRequirement: "none",
            acknowledgeReducedSecurity: true,
          })
        ).statusCode,
      ).toBe(200);
      clock.now += 31_000;
      const ownerChallenge = (
        await post(app, "/identity/login/local", {
          login: "dona",
          password: passphrase,
        })
      ).json<{ kind: string; challenge: string; rememberDeviceDays: number }>();
      expect(ownerChallenge).toMatchObject({
        kind: "mfa_required",
        rememberDeviceDays: 30,
      });
      const ownerRemembered = await post(
        app,
        "/identity/login/mfa",
        {
          challenge: ownerChallenge.challenge,
          code: totpCode(ownerSecret, step()),
          rememberDevice: true,
        },
        { ...web, origin: ORIGIN },
      );
      const ownerDevice = cookies(ownerRemembered)
        .find((item) => item.startsWith("ia-mns-device="))!
        .split(";")[0];
      // Signing out and in again on this browser asks only for the password.
      const ownerWithoutCode = await post(
        app,
        "/identity/login/local",
        { login: "dona", password: passphrase },
        { cookie: ownerDevice, ...web, origin: ORIGIN },
      );
      expect(ownerWithoutCode.json<{ kind: string }>().kind).toBe(
        "authenticated",
      );
      expect(
        (
          await readPolicy(
            ownerWithoutCode.json<{ accessToken: string }>().accessToken,
          )
        ).statusCode,
      ).toBe(200);
      // Requiring the factor for administrators again ends that shortcut.
      expect(
        (
          await writePolicy(owner, {
            ...permissive,
            mfaRequirement: "administrators",
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await post(
            app,
            "/identity/login/local",
            { login: "dona", password: passphrase },
            { cookie: ownerDevice, ...web, origin: ORIGIN },
          )
        ).json(),
      ).toMatchObject({ kind: "mfa_required", rememberDeviceDays: 0 });

      // ---- inactivity: only reported activity postpones the deadline ----
      expect(
        (
          await writePolicy(owner, {
            ...defaults,
            sessionMaxMinutes: 24 * 60,
            idleTimeoutMinutes: 15,
          })
        ).statusCode,
      ).toBe(200);
      clock.now += 31_000;
      const biaLogin = (
        await post(app, "/identity/login/local", {
          login: "bia",
          password: passphrase,
        })
      ).json<{ challenge: string }>();
      const active = await post(app, "/identity/login/mfa", {
        challenge: biaLogin.challenge,
        code: totpCode(biaSecret, step()),
      });
      let biaCookie = cookieOf(active);
      const renew = async (activity: boolean) => {
        const response = await post(
          app,
          "/identity/session/refresh",
          { active: activity },
          { cookie: biaCookie, ...web },
        );
        if (response.statusCode === 200) biaCookie = cookieOf(response);
        return response.statusCode;
      };
      clock.now += 10 * 60_000;
      expect(await renew(true)).toBe(200);
      clock.now += 10 * 60_000;
      expect(await renew(false)).toBe(200);
      clock.now += 6 * 60_000;
      // 16 minutes without activity: the session ended.
      expect(await renew(true)).toBe(401);

      // ---- shortening the duration ends sessions that are already too old ----
      const ownerLogin = async () => {
        clock.now += 31_000;
        const first = (
          await post(app, "/identity/login/local", {
            login: "dona",
            password: passphrase,
          })
        ).json<{ challenge: string }>();
        const done = await post(app, "/identity/login/mfa", {
          challenge: first.challenge,
          code: totpCode(ownerSecret, step()),
        });
        return {
          token: done.json<{ accessToken: string }>().accessToken,
          cookie: cookieOf(done),
        };
      };
      const relaxed = await ownerLogin();
      expect(
        (
          await writePolicy(relaxed.token, {
            ...defaults,
            sessionMaxMinutes: 24 * 60,
            idleTimeoutMinutes: 8 * 60,
          })
        ).statusCode,
      ).toBe(200);
      clock.now += 2 * 3600_000;
      const current = await ownerLogin();
      const shortened = (
        await writePolicy(current.token, {
          ...defaults,
          sessionMaxMinutes: 60,
          idleTimeoutMinutes: 15,
        })
      ).json<{ endedSessions: number; currentSessionEnded: boolean }>();
      expect(shortened.endedSessions).toBeGreaterThanOrEqual(1);
      expect(shortened.currentSessionEnded).toBe(false);
      // The two-hour-old session is over; the new one continues.
      expect(
        (
          await post(
            app,
            "/identity/session/refresh",
            {},
            { cookie: relaxed.cookie, ...web },
          )
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await post(
            app,
            "/identity/session/refresh",
            {},
            { cookie: current.cookie, ...web },
          )
        ).statusCode,
      ).toBe(200);
      expect(ownerCookie).not.toBe(current.cookie);
      expect(
        await database.identityAuditEvent.count({
          where: { action: "policy.updated" },
        }),
      ).toBe(7);
    } finally {
      await app.close();
      await database.$disconnect();
    }
  });
}, 180_000);

export type { Database };

it("lets only owners read and change operational parameters, audits changes and applies them without a restart", async () => {
  await withMigratedDatabase(async (runtimeUrl) => {
    const { app, database, clock, service, sankhyaAssertion, config } =
      await setup(runtimeUrl);
    try {
      const step = () => Math.floor(clock.now / 30_000);
      const boot = await post(app, "/identity/bootstrap", {
        token: await service.createBootstrapTicket(false),
        displayName: "Dona",
        login: "dona",
        password: "uma frase de acesso segura",
      });
      const bootToken = boot.json<{ accessToken: string }>().accessToken;
      const totp = (
        await post(app, "/identity/me/totp", {}, bearer(bootToken))
      ).json<{ setup: string; secret: string }>();
      const owner = (
        await post(
          app,
          "/identity/me/totp/confirm",
          {
            setup: totp.setup,
            code: totpCode(base32Decode(totp.secret), step()),
          },
          bearer(bootToken),
        )
      ).json<{ accessToken: string }>().accessToken;
      const read = (headers: Record<string, string> = {}) =>
        app.inject({
          method: "GET",
          url: "/identity/admin/parameters",
          headers,
        });
      const write = (
        key: string,
        payload: object,
        headers: Record<string, string>,
      ) =>
        app.inject({
          method: "PUT",
          url: `/identity/admin/parameters/${key}`,
          headers,
          payload,
        });
      type View = {
        production: boolean;
        parameters: {
          key: string;
          value: unknown;
          defaultValue: unknown;
          source: string;
          version: number;
          updatedBy: string | null;
          effect: string;
        }[];
        history: { actorName: string; details: Record<string, unknown> }[];
      };
      const scopes = (token: string) =>
        String(decodeJwt(token).scope).split(" ");

      // ---- a Sankhya-linked person receives sales by the default policy ----
      const sankhyaToken = async () =>
        (
          await embeddedSankhya(app, (nonce) => sankhyaAssertion(nonce, "321"))
        ).json<{ accessToken: string }>().accessToken;
      const person = await sankhyaToken();
      expect(scopes(person)).toContain("sales:read");

      // ---- people without the owner role cannot list, read or change ----
      expect((await read()).statusCode).toBe(401);
      for (const response of [
        await read(bearer(person)),
        await write(
          "access.providerGrants",
          { value: [], version: 0 },
          bearer(person),
        ),
        await write(
          "OPENAI_API_KEY",
          { value: "x", version: 0 },
          bearer(person),
        ),
      ])
        expect(response.json<ErrorBody>().error.code).toBe(
          "IDENTITY_ACCESS_DENIED",
        );

      // ---- the owner reads defaults, never secrets or bootstrap settings ----
      const initial = await read(bearer(owner));
      expect(initial.statusCode).toBe(200);
      const view = initial.json<View>();
      expect(view.production).toBe(false);
      expect(view.parameters).toEqual([
        expect.objectContaining({
          key: "ai.model",
          value: "gpt-6.1-sol",
          source: "default",
          version: 0,
          effect: "next_turn",
        }),
        expect.objectContaining({ key: "ai.traceLevel", value: "metadata" }),
        expect.objectContaining({
          key: "access.providerGrants",
          value: ["sankhya:sales:read"],
          defaultValue: ["sankhya:sales:read"],
          effect: "next_access_token",
        }),
      ]);
      for (const secret of [
        config.pdtClientSecret!,
        config.identitySigningKey!,
        config.identityEncryptionKey!,
        config.sankhyaPassword!,
        config.databaseUrl!,
      ])
        expect(initial.body).not.toContain(secret);
      expect(initial.body).not.toMatch(/PASSWORD|SECRET|API_KEY|DATABASE_URL/);

      // ---- secrets and unknown keys cannot be written; invalid values are refused ----
      for (const key of ["OPENAI_API_KEY", "databaseUrl", "pdtClientSecret"])
        expect(
          (
            await write(key, { value: "x", version: 0 }, bearer(owner))
          ).json<ErrorBody>().error.code,
        ).toBe("IDENTITY_PARAMETER_NOT_FOUND");
      for (const [key, value] of [
        ["ai.model", "modelo com espaço"],
        ["ai.traceLevel", "verbose"],
        ["access.providerGrants", ["pdt:sales:read"]],
        ["access.providerGrants", "sankhya:sales:read"],
      ] as const)
        expect(
          (
            await write(key, { value, version: 0 }, bearer(owner))
          ).json<ErrorBody>().error.code,
        ).toBe("IDENTITY_PARAMETER_INVALID");
      expect(
        (
          await write("ai.model", { value: "gpt-x", version: 3 }, bearer(owner))
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_PARAMETER_CONFLICT");
      expect(await database.operationalParameter.count()).toBe(0);
      expect(
        await database.identityAuditEvent.count({
          where: { action: "parameter.updated" },
        }),
      ).toBe(0);

      // ---- a valid change persists, is audited and reaches the consumer ----
      const saved = await write(
        "access.providerGrants",
        { value: [], version: 0 },
        bearer(owner),
      );
      expect(saved.json()).toEqual({ version: 1 });
      const after = (await read(bearer(owner))).json<View>();
      expect(
        after.parameters.find((item) => item.key === "access.providerGrants"),
      ).toMatchObject({
        value: [],
        defaultValue: ["sankhya:sales:read"],
        source: "administration",
        version: 1,
        updatedBy: "Dona",
      });
      expect(after.history[0]).toMatchObject({
        actorName: "Dona",
        details: {
          parameter: "access.providerGrants",
          from: "sankhya:sales:read",
          to: "",
          reset: false,
          version: 1,
        },
      });
      // The next access token of the Sankhya-linked person no longer carries
      // the automatic grant; no restart is involved.
      expect(scopes(await sankhyaToken())).not.toContain("sales:read");

      // ---- the model applies to the next read; a reset restores the default ----
      expect(
        (
          await write(
            "ai.model",
            { value: " gpt-6.2-mini ", version: 0 },
            bearer(owner),
          )
        ).json(),
      ).toEqual({ version: 1 });
      await expect(service.parameters.get("ai.model")).resolves.toBe(
        "gpt-6.2-mini",
      );
      expect(
        (
          await write(
            "access.providerGrants",
            { value: null, version: 1 },
            bearer(owner),
          )
        ).json(),
      ).toEqual({ version: 2 });
      expect(scopes(await sankhyaToken())).toContain("sales:read");
      const audit = await database.identityAuditEvent.findMany({
        where: { action: "parameter.updated" },
        orderBy: { occurredAt: "asc" },
      });
      expect(audit.map((item) => item.details)).toEqual([
        expect.objectContaining({ parameter: "access.providerGrants", to: "" }),
        expect.objectContaining({
          parameter: "ai.model",
          from: "gpt-6.1-sol",
          to: "gpt-6.2-mini",
        }),
        expect.objectContaining({
          parameter: "access.providerGrants",
          from: "",
          to: "sankhya:sales:read",
          reset: true,
        }),
      ]);
      expect(audit.every((item) => item.actorPersonId !== null)).toBe(true);

      // ---- changes need a recent strong confirmation; reading does not ----
      clock.now += 31 * 60_000;
      expect(
        (
          await write(
            "ai.model",
            { value: "gpt-later", version: 1 },
            bearer(owner),
          )
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_RECENT_AUTHENTICATION_REQUIRED");
      expect((await read(bearer(owner))).statusCode).toBe(200);

      // ---- the database refuses untyped values and unknown keys from any writer ----
      await expect(
        database.$executeRaw`INSERT INTO operational_parameters (key, value, version, updated_by, updated_at) VALUES ('ai.traceLevel', '"verbose"'::jsonb, 1, gen_random_uuid(), now())`,
      ).rejects.toThrow();
      await expect(
        database.$executeRaw`INSERT INTO operational_parameters (key, value, version, updated_by, updated_at) VALUES ('openai.apiKey', '"sk-x"'::jsonb, 1, gen_random_uuid(), now())`,
      ).rejects.toThrow();
      await expect(
        database.$executeRaw`UPDATE operational_parameters SET value = '[1]'::jsonb WHERE key = 'access.providerGrants'`,
      ).rejects.toThrow();
    } finally {
      await app.close();
      await database.$disconnect();
    }
  });
}, 180000);

it("refuses to become ready against a schema without the operational parameters", async () => {
  await withMigratedDatabase(async (runtimeUrl, migrationUrl) => {
    // An installation that skipped the latest migration.
    const migration = createDatabase(migrationUrl);
    await migration.$executeRaw`DROP TABLE operational_parameters`;
    await migration.$disconnect();
    await expect(setup(runtimeUrl)).rejects.toThrow();
  });
}, 120000);
