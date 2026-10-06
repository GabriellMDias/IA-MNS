import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { parseServerConfig } from "../src/config.js";
import {
  combineVerifiers,
  createLocalAccessTokenVerifier,
  issuerPublicJwk,
} from "../src/authentication.js";
import {
  effectivePermissions,
  lockoutMs,
  normalizeLogin,
  parseProviderGrants,
  passwordProblem,
  providerGrantPolicy,
  validateCatalog,
  type PermissionDescriptor,
} from "../src/features/identity/domain.js";
import {
  base32Encode,
  hashPassword,
  matchTotp,
  normalizeRecoveryCode,
  recoveryCodes,
  seal,
  totpCode,
  unseal,
  verifyPassword,
} from "../src/features/identity/secrets.js";
import {
  SankhyaAssertionVerifier,
  SankhyaFailure,
} from "../src/features/identity/sankhya.js";
import { PdtFailure, PdtIdentityClient } from "../src/features/identity/pdt.js";
import { AccessTokenIssuer } from "../src/features/identity/tokens.js";
import { escapeLike } from "../src/features/identity/sankhya-directory.js";
import {
  defaultSecurityPolicy,
  effectivePolicy,
  normalizeEmail,
  policyProblems,
  policyWarnings,
  rememberDeviceDaysFor,
  secondFactorRequired,
} from "../src/features/identity/domain.js";
import { signingKey } from "./identity-helpers.js";

const catalog: PermissionDescriptor[] = [
  {
    permission: "sales:read",
    title: "Sales",
    access: "read",
    autoGrantProviders: ["sankhya"],
  },
  {
    permission: "orders:write",
    title: "Orders",
    access: "write",
    autoGrantProviders: [],
  },
];

describe("identity secrets", () => {
  it("matches the RFC 6238 SHA-1 test vectors and rejects reuse and drift", () => {
    const secret = Buffer.from("12345678901234567890");
    // RFC 6238 Appendix B (8 digits); the 6-digit code is the low six digits.
    expect(totpCode(secret, Math.floor(59 / 30))).toBe("287082");
    expect(totpCode(secret, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpCode(secret, Math.floor(1234567890 / 30))).toBe("005924");
    const at = 1234567890_000;
    const step = Math.floor(at / 30_000);
    expect(matchTotp(secret, "005924", at, null)).toBe(step);
    expect(matchTotp(secret, "005924", at, step)).toBeNull();
    expect(matchTotp(secret, totpCode(secret, step - 1), at, null)).toBe(
      step - 1,
    );
    expect(matchTotp(secret, totpCode(secret, step - 2), at, null)).toBeNull();
    expect(matchTotp(secret, "12345a", at, null)).toBeNull();
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
  });

  it("hashes passwords with scrypt, seals TOTP secrets and normalizes recovery codes", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^scrypt\$15\$8\$1\$/);
    expect(hash).not.toContain("correct");
    await expect(
      verifyPassword("correct horse battery staple", hash),
    ).resolves.toBe(true);
    await expect(
      verifyPassword("correct horse battery stapl", hash),
    ).resolves.toBe(false);
    await expect(verifyPassword("x", "plain$text")).resolves.toBe(false);
    const key = randomBytes(32);
    const sealed = seal(key, Buffer.from("secret-material"));
    expect(sealed).not.toContain("secret");
    expect(unseal(key, sealed).toString()).toBe("secret-material");
    expect(() => unseal(randomBytes(32), sealed)).toThrow();
    const codes = recoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(normalizeRecoveryCode(codes[0].toUpperCase())).toHaveLength(10);
  });
});

describe("identity policy", () => {
  it("derives permissions only from catalog grants, provider policy and roles", () => {
    const policy = providerGrantPolicy(catalog);
    expect(policy).toEqual([{ provider: "sankhya", permission: "sales:read" }]);
    expect(
      effectivePermissions({
        catalog,
        policy,
        grants: [],
        linkedProviders: ["pdt"],
        roles: [],
      }),
    ).toEqual([]);
    expect(
      effectivePermissions({
        catalog,
        policy,
        grants: [],
        linkedProviders: ["sankhya"],
        roles: [],
      }),
    ).toEqual(["sales:read"]);
    expect(
      effectivePermissions({
        catalog,
        policy,
        grants: ["orders:write", "unknown:thing"],
        linkedProviders: [],
        roles: [],
      }),
    ).toEqual(["orders:write"]);
    expect(
      effectivePermissions({
        catalog,
        policy,
        grants: [],
        linkedProviders: [],
        roles: ["owner"],
      }),
    ).toEqual(["identity:admin", "orders:write", "sales:read"]);
    expect(
      effectivePermissions({
        catalog,
        policy: providerGrantPolicy(catalog, []),
        grants: [],
        linkedProviders: ["sankhya"],
        roles: [],
      }),
    ).toEqual([]);
  });

  it("rejects automatic grants of write capabilities and unknown overrides", () => {
    expect(() =>
      validateCatalog([
        {
          permission: "orders:write",
          title: "x",
          access: "write",
          autoGrantProviders: ["pdt"],
        },
      ]),
    ).toThrow("Only read permissions");
    expect(() =>
      validateCatalog([
        {
          permission: "identity:admin",
          title: "x",
          access: "read",
          autoGrantProviders: [],
        },
      ]),
    ).toThrow();
    expect(() =>
      providerGrantPolicy(catalog, parseProviderGrants("pdt:sales:read")),
    ).toThrow("not an eligible");
    expect(() =>
      providerGrantPolicy(catalog, parseProviderGrants("sankhya:orders:write")),
    ).toThrow();
    expect(parseProviderGrants("none")).toEqual([]);
    expect(() => parseProviderGrants("sankhya:SALES")).toThrow();
  });

  it("validates logins, passwords and progressive lockout", () => {
    expect(normalizeLogin(" Ana.Souza ")).toBe("ana.souza");
    expect(normalizeLogin("a")).toBeNull();
    expect(normalizeLogin("ana souza")).toBeNull();
    expect(passwordProblem("short", "ana")).toBe("too_short");
    expect(passwordProblem("ana-is-my-password", "ana")).toBe("contains_login");
    expect(passwordProblem("aaaaaaaaaaaaaa", "ana")).toBe("repetitive");
    expect(passwordProblem("uma frase longa e segura", "ana.souza")).toBeNull();
    expect([4, 5, 6, 30].map(lockoutMs)).toEqual([
      0, 60_000, 120_000, 3_600_000,
    ]);
  });
});

describe("authentication policy", () => {
  it("accepts the secure defaults and reports nothing to warn about", () => {
    expect(policyProblems(defaultSecurityPolicy, true)).toEqual([]);
    expect(policyWarnings(defaultSecurityPolicy)).toEqual([]);
  });

  it("refuses values outside the hard limits and inconsistent windows", () => {
    const base = { ...defaultSecurityPolicy };
    expect(
      policyProblems(
        { ...base, sessionMaxMinutes: 59, idleTimeoutMinutes: 15 },
        false,
      ),
    ).toEqual(["out_of_range"]);
    expect(policyProblems({ ...base, rememberDeviceDays: 1.5 }, false)).toEqual(
      ["out_of_range"],
    );
    expect(
      policyProblems(
        { ...base, sessionMaxMinutes: 60, idleTimeoutMinutes: 120 },
        false,
      ),
    ).toEqual(["idle_exceeds_session"]);
    expect(
      policyProblems(
        {
          ...base,
          sessionMaxMinutes: 60,
          idleTimeoutMinutes: 15,
          recentAuthMinutes: 61,
        },
        false,
      ),
    ).toEqual(["recent_exceeds_session"]);
  });

  it("never lets production administrators skip the second factor", () => {
    const optional = {
      ...defaultSecurityPolicy,
      mfaRequirement: "none" as const,
    };
    expect(policyProblems(optional, false)).toEqual([]);
    expect(policyProblems(optional, true)).toEqual(["mfa_none_in_production"]);
    expect(policyWarnings(optional)).toEqual(["mfaRequirement"]);
    // A permissive policy stored elsewhere is still enforced safely in production.
    expect(effectivePolicy(optional, true).mfaRequirement).toBe(
      "administrators",
    );
    expect(effectivePolicy(optional, false).mfaRequirement).toBe("none");
  });

  it("warns about each setting beyond its recommendation", () => {
    expect(
      policyWarnings({
        sessionMaxMinutes: 25 * 60,
        idleTimeoutMinutes: 9 * 60,
        recentAuthMinutes: 61,
        adminRecentAuthMinutes: 61,
        mfaRequirement: "everyone",
        rememberDeviceDays: 31,
      }).sort(),
    ).toEqual([
      "adminRecentAuthMinutes",
      "idleTimeoutMinutes",
      "recentAuthMinutes",
      "rememberDeviceDays",
      "sessionMaxMinutes",
    ]);
  });

  it("remembers owners' browsers only while the second factor is optional", () => {
    const policy = (
      mfaRequirement: "everyone" | "administrators" | "none",
    ) => ({
      ...defaultSecurityPolicy,
      mfaRequirement,
      rememberDeviceDays: 30,
    });
    expect(rememberDeviceDaysFor(policy("administrators"), false, true)).toBe(
      30,
    );
    expect(rememberDeviceDaysFor(policy("administrators"), true, true)).toBe(0);
    expect(rememberDeviceDaysFor(policy("everyone"), true, true)).toBe(0);
    expect(rememberDeviceDaysFor(policy("none"), true, true)).toBe(30);
    // Never inside a host page.
    expect(rememberDeviceDaysFor(policy("none"), false, false)).toBe(0);
    // Production enforces "none" as "administrators": owners are asked again.
    expect(
      rememberDeviceDaysFor(effectivePolicy(policy("none"), true), true, true),
    ).toBe(0);
  });

  it("requires a second factor according to the requirement and the role", () => {
    const policy = (
      mfaRequirement: "everyone" | "administrators" | "none",
    ) => ({
      ...defaultSecurityPolicy,
      mfaRequirement,
    });
    expect(secondFactorRequired(policy("everyone"), false)).toBe(true);
    expect(secondFactorRequired(policy("administrators"), true)).toBe(true);
    expect(secondFactorRequired(policy("administrators"), false)).toBe(false);
    expect(secondFactorRequired(policy("none"), true)).toBe(false);
  });
});

describe("duplicate hints and directory input", () => {
  it("normalizes e-mail hints and escapes directory search patterns", () => {
    expect(normalizeEmail("  Ana@MNS.Example.TEST ")).toBe(
      "ana@mns.example.test",
    );
    for (const invalid of [
      null,
      7,
      "",
      "sem-arroba",
      `${"a".repeat(250)}@x.io`,
    ])
      expect(normalizeEmail(invalid)).toBeNull();
    expect(escapeLike(String.raw`50%_A\B`)).toBe(String.raw`50\%\_A\\B`);
  });
});

describe("Sankhya session assertion connector", () => {
  async function setup(alg: "ES256" | "RS256" = "ES256") {
    const { privateKey, publicKey } = await generateKeyPair(alg);
    const verifier = new SankhyaAssertionVerifier({
      issuer: "urn:mns:sankhya-om:test",
      audience: "ia-mns-api",
      keys: { keys: [{ ...(await exportJWK(publicKey)), kid: "om-1", alg }] },
    });
    const sign = (
      claims: Record<string, unknown>,
      options: {
        iss?: string;
        aud?: string;
        lifetime?: number;
        typ?: string;
      } = {},
    ) =>
      new SignJWT({ nonce: "nonce-1", ...claims })
        .setProtectedHeader({ alg, typ: options.typ ?? "JWT", kid: "om-1" })
        .setIssuer(options.iss ?? "urn:mns:sankhya-om:test")
        .setAudience(options.aud ?? "ia-mns-api")
        .setSubject(typeof claims.sub === "string" ? claims.sub : "42")
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime(`${options.lifetime ?? 60}s`)
        .sign(privateKey);
    return { verifier, sign };
  }

  it("accepts a bound assertion and yields the stable CODUSU identity", async () => {
    for (const alg of ["ES256", "RS256"] as const) {
      const { verifier, sign } = await setup(alg);
      const identity = await verifier.verify(
        await sign({ sub: "42", name: " Ana " }),
        "nonce-1",
      );
      expect(identity).toMatchObject({
        issuer: "urn:mns:sankhya-om:test",
        subject: "42",
        name: "Ana",
      });
    }
  });

  it("rejects wrong nonce, issuer, audience, subject, lifetime, type and foreign keys", async () => {
    const { verifier, sign } = await setup();
    const reason = (promise: Promise<unknown>) =>
      promise.then(
        () => "accepted",
        (error: unknown) =>
          error instanceof SankhyaFailure ? error.reason : "other",
      );
    expect(
      await reason(verifier.verify(await sign({ sub: "42" }), "other-nonce")),
    ).toBe("nonce_mismatch");
    expect(
      await reason(
        verifier.verify(
          await sign({ sub: "42" }, { iss: "urn:other" }),
          "nonce-1",
        ),
      ),
    ).toBe("invalid_assertion");
    expect(
      await reason(
        verifier.verify(await sign({ sub: "42" }, { aud: "pdt" }), "nonce-1"),
      ),
    ).toBe("invalid_assertion");
    expect(
      await reason(verifier.verify(await sign({ sub: "0" }), "nonce-1")),
    ).toBe("bad_subject");
    expect(
      await reason(verifier.verify(await sign({ sub: "ana" }), "nonce-1")),
    ).toBe("bad_subject");
    expect(
      await reason(
        verifier.verify(
          await sign({ sub: "42" }, { lifetime: 600 }),
          "nonce-1",
        ),
      ),
    ).toBe("bad_lifetime");
    expect(
      await reason(
        verifier.verify(
          await sign({ sub: "42" }, { typ: "at+jwt" }),
          "nonce-1",
        ),
      ),
    ).toBe("invalid_assertion");
    const other = await setup();
    expect(
      await reason(verifier.verify(await other.sign({ sub: "42" }), "nonce-1")),
    ).toBe("invalid_assertion");
    const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from('{"sub":"42"}').toString("base64url")}.`;
    expect(await reason(verifier.verify(unsigned, "nonce-1"))).toBe(
      "invalid_assertion",
    );
  });
});

describe("PDT identity contract client", () => {
  const config = {
    baseUrl: "https://pdt.example.test",
    issuer: "https://pdt.example.test",
    clientId: "ia-mns",
    clientSecret: "s".repeat(43),
    redirectUri: "https://ia.example.test/api/identity/pdt/callback",
  };
  function fakePdt(identity: Record<string, unknown> = {}) {
    const calls: {
      path: string;
      headers: Record<string, string>;
      body?: string;
    }[] = [];
    const handle = (input: URL | RequestInfo, init?: RequestInit): Response => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
      );
      const headers = Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>),
      );
      calls.push({
        path: url.pathname,
        headers,
        ...(typeof init?.body === "string" ? { body: init.body } : {}),
      });
      if (url.pathname.endsWith("/token"))
        return Response.json({
          accessToken: "opaque",
          tokenType: "Bearer",
          expiresIn: 300,
          scope: "identity:read",
        });
      if (url.pathname.endsWith("/identity"))
        return Response.json({
          contractVersion: 1,
          issuer: config.issuer,
          subject: "37C261AD-A457-49C5-B578-456A1CC127D3",
          audience: "ia-mns",
          authenticated: true,
          user: { id: 7, name: "Pessoa", activeStatus: true },
          authorization: { superAdmin: false, permissions: [{ code: "x" }] },
          ...identity,
        });
      return Response.json({ revoked: true });
    };
    const fetcher = ((input: URL | RequestInfo, init?: RequestInit) =>
      Promise.resolve(handle(input, init))) as typeof fetch;
    return { client: new PdtIdentityClient(config, fetcher), calls };
  }

  it("redeems with PKCE and client headers, normalizes the subject and revokes the token", async () => {
    const { client, calls } = fakePdt();
    const url = new URL(client.authorizeUrl("state-value", "challenge"));
    expect(url.pathname).toBe("/integrations/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const identity = await client.redeem(
      "c".repeat(43),
      "verifier",
      config.issuer,
    );
    expect(identity).toEqual({
      issuer: config.issuer,
      email: null,
      subject: "37c261ad-a457-49c5-b578-456a1cc127d3",
      name: "Pessoa",
      permissionCount: 1,
      superAdmin: false,
    });
    expect(calls.map((call) => call.path)).toEqual([
      "/api/auth/integrations/token",
      "/api/auth/integrations/identity",
      "/api/auth/integrations/revoke",
    ]);
    expect(calls[0].headers["X-PDT-Client-Secret"]).toBe(config.clientSecret);
    expect(JSON.parse(calls[0].body!)).toEqual({
      code: "c".repeat(43),
      redirect_uri: config.redirectUri,
      code_verifier: "verifier",
    });
  });

  it("fails closed on issuer, audience, inactive user and malformed codes", async () => {
    await expect(
      fakePdt().client.redeem("c".repeat(43), "v", "https://evil.test"),
    ).rejects.toThrow(PdtFailure);
    await expect(
      fakePdt().client.redeem("short", "v", config.issuer),
    ).rejects.toThrow(PdtFailure);
    const wrongAudience = fakePdt({ audience: "other" });
    await expect(
      wrongAudience.client.redeem("c".repeat(43), "v", config.issuer),
    ).rejects.toThrow("identity_binding_mismatch");
    expect(wrongAudience.calls.at(-1)!.path).toBe(
      "/api/auth/integrations/revoke",
    );
    await expect(
      fakePdt({ user: { activeStatus: false } }).client.redeem(
        "c".repeat(43),
        "v",
        config.issuer,
      ),
    ).rejects.toThrow(PdtFailure);
  });
});

describe("identity configuration and verifier", () => {
  const base = {
    ORION_ENV: "test",
    IA_MNS_PUBLIC_ORIGIN: "http://localhost:5173",
    IA_MNS_IDENTITY_SIGNING_KEY: signingKey(),
    IA_MNS_IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
  };
  it("requires complete, secure identity and provider settings", () => {
    expect(parseServerConfig(base).publicOrigin).toBe("http://localhost:5173");
    expect(() =>
      parseServerConfig({ ...base, IA_MNS_IDENTITY_ENCRYPTION_KEY: undefined }),
    ).toThrow("incomplete identity");
    expect(() =>
      parseServerConfig({ ...base, IA_MNS_LOCAL_ACCESS: "true" }),
    ).toThrow("cannot be combined with identity");
    expect(() =>
      parseServerConfig({ ...base, ORION_ENV: "production" }),
    ).toThrow("IA_MNS_PUBLIC_ORIGIN");
    expect(() =>
      parseServerConfig({
        ...base,
        IA_MNS_PUBLIC_ORIGIN: "http://ia.example.test",
      }),
    ).toThrow();
    expect(() =>
      parseServerConfig({ ...base, PDT_IDENTITY_BASE_URL: "https://pdt.test" }),
    ).toThrow("incomplete PDT");
    const sankhya = {
      ...base,
      SANKHYA_IDENTITY_ISSUER: "urn:mns:sankhya-om:test",
      SANKHYA_IDENTITY_KEYS: JSON.stringify({
        keys: [{ kty: "EC", crv: "P-256", x: "a", y: "b" }],
      }),
    };
    expect(parseServerConfig(sankhya).sankhyaSessionTrust).toBe("pending");
    // The installation issuer alone (owner directory association) signs no one in.
    const issuerOnly = {
      ...base,
      ORION_ENV: "production",
      IA_MNS_PUBLIC_ORIGIN: "https://ia.example.test",
      SANKHYA_IDENTITY_ISSUER: "urn:mns:sankhya-om:test",
    };
    expect(parseServerConfig(issuerOnly).sankhyaIdentityIssuer).toBe(
      "urn:mns:sankhya-om:test",
    );
    expect(() =>
      parseServerConfig({ ...issuerOnly, SANKHYA_DIRECTORY_VIEW: "IA_USERS" }),
    ).toThrow("SANKHYA_DIRECTORY_VIEW requires");
    const connection = {
      SANKHYA_DB_USER: "reader",
      SANKHYA_DB_PASSWORD: "synthetic",
      SANKHYA_DB_CONNECT_STRING: "db.example.test/ERP",
    };
    expect(
      parseServerConfig({
        ...issuerOnly,
        ...connection,
        SANKHYA_DIRECTORY_VIEW: "ERP.IA_USERS",
      }).sankhyaDirectoryView,
    ).toBe("ERP.IA_USERS");
    expect(() =>
      parseServerConfig({
        ...issuerOnly,
        ...connection,
        SANKHYA_DIRECTORY_VIEW: "TSIUSU; DROP",
      }),
    ).toThrow();
    expect(() =>
      parseServerConfig({
        ORION_ENV: "test",
        SANKHYA_IDENTITY_ISSUER: "urn:mns:sankhya-om:test",
      }),
    ).toThrow("incomplete Sankhya identity");
    expect(() =>
      parseServerConfig({
        ...sankhya,
        SANKHYA_IDENTITY_KEYS: JSON.stringify({
          keys: [{ kty: "EC", d: "private" }],
        }),
      }),
    ).toThrow("public keys only");
    const production = {
      ...sankhya,
      ORION_ENV: "production",
      IA_MNS_PUBLIC_ORIGIN: "https://ia.example.test",
    };
    expect(() => parseServerConfig(production)).toThrow(
      "SANKHYA_SESSION_TRUST=approved",
    );
    expect(
      parseServerConfig({ ...production, SANKHYA_SESSION_TRUST: "approved" })
        .sankhyaSessionTrust,
    ).toBe("approved");
  });

  it("verifies IA-MNS tokens in process and keeps issuers separate", async () => {
    const key = signingKey();
    const issuer = new AccessTokenIssuer({
      signingKey: key,
      issuer: "http://localhost:5173",
      audience: "ia-mns-api",
    });
    const sessionId = randomUUID();
    const personId = randomUUID();
    const { accessToken } = await issuer.issue({
      personId,
      sessionId,
      permissions: ["sales:read"],
      assurance: "mfa",
      authTime: new Date(),
    });
    const local = createLocalAccessTokenVerifier({
      issuer: "http://localhost:5173",
      audience: "ia-mns-api",
      keys: { keys: [issuerPublicJwk(key)] },
    });
    await expect(local.verify(`Bearer ${accessToken}`)).resolves.toEqual({
      id: personId,
      scopes: new Set(["sales:read"]),
      sessionId,
    });
    const otherIssuer = createLocalAccessTokenVerifier({
      issuer: "http://localhost:5173",
      audience: "ia-mns-api",
      keys: { keys: [issuerPublicJwk(signingKey())] },
    });
    await expect(
      otherIssuer.verify(`Bearer ${accessToken}`),
    ).resolves.toBeNull();
    await expect(
      combineVerifiers([otherIssuer, local]).verify(`Bearer ${accessToken}`),
    ).resolves.toMatchObject({ id: personId });
    expect(issuer.publicJwk.kid).toBe(issuerPublicJwk(key).kid);
  });
});

describe("identity cookies", () => {
  it("uses __Host- Secure cookies with flow-specific SameSite on HTTPS origins", async () => {
    const { createApp } = await import("../src/app.js");
    const { createIdentityModule } =
      await import("../src/features/identity/module.js");
    const pino = (await import("pino")).default;
    const config = parseServerConfig({
      ORION_ENV: "test",
      IA_MNS_PUBLIC_ORIGIN: "https://ia.example.test",
      IA_MNS_IDENTITY_SIGNING_KEY: signingKey(),
      IA_MNS_IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
    });
    const fake = {
      providers: {},
      loginLocal: () =>
        Promise.resolve({
          kind: "authenticated",
          accessToken: "a",
          expiresIn: 600,
          refreshToken: "refresh-value",
          sessionId: "s",
          provisioned: false,
          linked: null,
          resumeFirstAccess: false,
        }),
      close: () => Promise.resolve(),
      startDirect: (provider: string) =>
        Promise.resolve({
          url: `https://${provider}.example.test/authorize`,
          binding: "binding-value",
        }),
    };
    const module = createIdentityModule(
      catalog,
      { transferOwnership: () => Promise.resolve("transferred") },
      () => fake as never,
    ).activate({
      config,
      database: {} as never,
    });
    const { app } = createApp(pino({ level: "silent" }), undefined, {
      modules: [module],
    });
    try {
      const login = await app.inject({
        method: "POST",
        url: "/identity/login/local",
        payload: { login: "ana", password: "x" },
      });
      expect(login.headers["set-cookie"]).toEqual([
        "__Host-ia-mns-session=refresh-value; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200",
      ]);
      expect(login.headers["cache-control"]).toBe("no-store");
      expect(login.json()).toEqual({
        kind: "authenticated",
        accessToken: "a",
        expiresIn: 600,
        provisioned: false,
      });
      const pdt = await app.inject({
        method: "POST",
        url: "/identity/providers/pdt/start",
        payload: { intent: "login", mode: "direct" },
      });
      expect(pdt.headers["set-cookie"]).toEqual([
        "__Host-ia-mns-pdt=binding-value; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300",
      ]);
      const om = await app.inject({
        method: "POST",
        url: "/identity/providers/sankhya/start",
        payload: { intent: "login", mode: "direct" },
      });
      expect(om.headers["set-cookie"]).toEqual([
        "__Host-ia-mns-sankhya=binding-value; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=300",
      ]);
      const refresh = await app.inject({
        method: "POST",
        url: "/identity/session/refresh",
        payload: {},
        headers: {
          cookie: "__Host-ia-mns-session=x",
          origin: "https://evil.example",
          "x-ia-mns-client": "web",
        },
      });
      expect(refresh.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
