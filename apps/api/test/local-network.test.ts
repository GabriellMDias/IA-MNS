import { expect, it } from "vitest";
import pino from "pino";
import { createApp } from "../src/app.js";
import { parseServerConfig } from "../src/config.js";
import { createAgentModule } from "../src/features/agent/module.js";
import { createSalesModule } from "../src/features/sales/module.js";
import { isDevelopmentTokenRequest } from "../src/local-access.js";
it("requires an unexpired temporary bearer on every protected route, including loopback calls, and rejects cross-site use", async () => {
  const token = "a".repeat(64);
  const origin = "http://192.168.1.12:5174";
  const config = parseServerConfig({
    ORION_ENV: "test",
    IA_MNS_DEV_ACCESS_TOKEN: token,
    IA_MNS_DEV_ACCESS_ORIGIN: origin,
    IA_MNS_DEV_ACCESS_EXPIRES_AT: String(Math.floor(Date.now() / 1000) + 3600),
  });
  const { app } = createApp(pino({ level: "silent" }), undefined, {
    modules: [
      createAgentModule(() => []).activate({ config }),
      createSalesModule().activate({ config }),
    ],
  });
  app.get("/test/access", (request) => ({
    accepted: isDevelopmentTokenRequest(request, config),
    expired: isDevelopmentTokenRequest(request, {
      ...config,
      devAccessExpiresAt: 1,
    }),
  }));
  try {
    expect((await app.inject({ url: "/agent/status" })).json()).toMatchObject({
      accessMode: "token",
    });
    const headers = {
      "x-ia-mns-client": "web",
      authorization: `Bearer ${token}`,
      origin,
    };
    expect((await app.inject({ url: "/test/access", headers })).json()).toEqual(
      { accepted: true, expired: false },
    );
    for (const invalid of [
      { authorization: undefined },
      { authorization: `Bearer ${"b".repeat(64)}` },
      { origin: "https://attacker.example" },
      { "sec-fetch-site": "cross-site" },
      { "x-ia-mns-client": undefined },
    ]) {
      const requestHeaders: Record<string, string> = { ...headers };
      for (const [key, value] of Object.entries(invalid)) {
        if (value === undefined) delete requestHeaders[key];
        else requestHeaders[key] = value;
      }
      expect(
        (
          await app.inject({ url: "/test/access", headers: requestHeaders })
        ).json(),
      ).toMatchObject({ accepted: false });
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/agent/conversations",
            headers: requestHeaders,
            payload: {},
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/sales/chat",
            headers: requestHeaders,
            payload: { message: "Hi" },
          })
        ).statusCode,
      ).toBe(401);
    }
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/agent/conversations",
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(503);
    expect(
      (
        await app.inject({
          url: "/test/access",
          headers,
          remoteAddress: "192.168.1.20",
        })
      ).json(),
    ).toMatchObject({ accepted: false });
  } finally {
    await app.close();
  }
});
