import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import rateLimit from "@fastify/rate-limit";
import pino from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { RegisteredModule } from "../src/module.js";
import {
  framePolicy,
  loadWebBuild,
  resolveWebFile,
  type WebBuild,
} from "../src/web-hosting.js";

// Same-origin hosting of the web build (ADR-0029): exact files only, the SPA
// shell for page navigations, the API under /api, and per-surface framing.
const pdt = "https://pdt.example.test";
const sankhya = "https://om.example.test";
let root = "";

function logger(lines: string[] = []) {
  return pino(
    { level: "info" },
    new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    }),
  );
}

async function writeBuild(
  directory: string,
  manifest: unknown = { schemaVersion: 1, documentation: false },
) {
  await mkdir(join(directory, "assets"), { recursive: true });
  await writeFile(
    join(directory, "index.html"),
    "<!doctype html><title>IA-MNS</title><div id=root></div>",
  );
  await writeFile(join(directory, "assets/app-abc123.js"), "console.log(1);");
  await writeFile(join(directory, "favicon.svg"), "<svg/>");
  await writeFile(join(directory, ".hidden"), "never served");
  if (manifest !== undefined)
    await writeFile(
      join(directory, "ia-mns-web.json"),
      JSON.stringify(manifest),
    );
}

/** A module whose route proves where module operations are mounted. */
const probeModule: RegisteredModule = {
  name: "probe",
  register(app) {
    app.get("/probe/item", () => ({ ok: true }));
  },
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "ia-mns-web-"));
  await writeBuild(root);
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function servedApp(
  build: WebBuild,
  embed = { pdt, sankhya } as { pdt?: string; sankhya?: string },
  lines: string[] = [],
) {
  const { app, lifecycle } = createApp(logger(lines), undefined, {
    modules: [probeModule],
    web: { build, embed },
  });
  lifecycle.markReady();
  return { app, lifecycle };
}

const html = { accept: "text/html,application/xhtml+xml" };

describe("web build index", () => {
  it("indexes only the regular files of an IA-MNS build", async () => {
    const build = await loadWebBuild(root, "disabled");
    expect([...build.files.keys()].sort()).toEqual([
      "/assets/app-abc123.js",
      "/favicon.svg",
      "/index.html",
    ]);
    expect(build.files.get("/assets/app-abc123.js")).toMatchObject({
      type: "text/javascript; charset=utf-8",
      immutable: true,
    });
    expect(build.documentation).toBe(false);
  });

  it("refuses foreign directories and a portal build when documentation is disabled", async () => {
    const empty = await mkdtemp(join(tmpdir(), "ia-mns-web-"));
    const portal = await mkdtemp(join(tmpdir(), "ia-mns-web-"));
    const shell = await mkdtemp(join(tmpdir(), "ia-mns-web-"));
    try {
      await expect(loadWebBuild(empty, "enabled")).rejects.toThrow(
        "Invalid web build: ORION_WEB_ROOT is not an IA-MNS build",
      );
      await writeBuild(portal, { schemaVersion: 1, documentation: true });
      await expect(loadWebBuild(portal, "disabled")).rejects.toThrow(
        "contains the /docs portal",
      );
      await expect(loadWebBuild(portal, "enabled")).resolves.toMatchObject({
        documentation: true,
      });
      await writeBuild(shell, { schemaVersion: 2, documentation: false });
      await expect(loadWebBuild(shell, "enabled")).rejects.toThrow(
        "unsupported build manifest",
      );
      await rm(join(shell, "index.html"));
      await writeFile(
        join(shell, "ia-mns-web.json"),
        JSON.stringify({ schemaVersion: 1, documentation: false }),
      );
      await expect(loadWebBuild(shell, "enabled")).rejects.toThrow(
        "index.html is missing",
      );
    } finally {
      for (const directory of [empty, portal, shell])
        await rm(directory, { recursive: true, force: true });
    }
  });

  it("frames only the embedded surfaces, each by its own host", () => {
    const embed = { pdt, sankhya };
    expect(framePolicy("/", embed)).toBe("frame-ancestors 'none'");
    expect(framePolicy("/entrar", embed)).toBe("frame-ancestors 'none'");
    expect(framePolicy("/embed/pdt", embed)).toBe(`frame-ancestors ${pdt}`);
    expect(framePolicy("/embed/pdt/chat/1", embed)).toBe(
      `frame-ancestors ${pdt}`,
    );
    expect(framePolicy("/embed/sankhya", embed)).toBe(
      `frame-ancestors ${sankhya}`,
    );
    expect(framePolicy("/embed/pdtx", embed)).toBe("frame-ancestors 'none'");
    expect(framePolicy("/embed/sankhya", { pdt })).toBe(
      "frame-ancestors 'none'",
    );
    expect(framePolicy("/x/embed/pdt", embed)).toBe("frame-ancestors 'none'");
  });

  it("never resolves server paths, missing assets or non-page requests to the shell", async () => {
    const build = await loadWebBuild(root, "disabled");
    expect(resolveWebFile(build, "/conta", html.accept)).toBe(build.index);
    expect(resolveWebFile(build, "/api/identity/status", html.accept)).toBe(
      undefined,
    );
    expect(resolveWebFile(build, "/api", html.accept)).toBe(undefined);
    expect(resolveWebFile(build, "/health/ready", html.accept)).toBe(undefined);
    expect(resolveWebFile(build, "/assets/missing.js", html.accept)).toBe(
      undefined,
    );
    expect(resolveWebFile(build, "/conta", "*/*")).toBe(undefined);
    expect(resolveWebFile(build, "/ia-mns-web.json", "*/*")).toBe(undefined);
    expect(resolveWebFile(build, "/.hidden", "*/*")).toBe(undefined);
  });
});

describe("same-origin web and API", () => {
  it("serves the shell for page routes with per-surface framing", async () => {
    const { app } = servedApp(await loadWebBuild(root, "disabled"));
    for (const [url, ancestors] of [
      ["/", "'none'"],
      ["/entrar", "'none'"],
      ["/identidade/inicial", "'none'"],
      ["/chat/7d0e9a5e-0000-4000-8000-000000000000?x=1", "'none'"],
      ["/embed/pdt", pdt],
      ["/embed/pdt/conta", pdt],
      ["/embed/pdt?theme=dark", pdt],
      ["/embed/sankhya", sankhya],
    ] as const) {
      const response = await app.inject({ url, headers: html });
      expect(response.statusCode, url).toBe(200);
      expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(response.body).toContain("<div id=root>");
      expect(response.headers["content-security-policy"], url).toBe(
        `frame-ancestors ${ancestors}`,
      );
      expect(response.headers["cache-control"]).toBe("no-cache");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
    }
    await app.close();
  });

  it("serves hashed assets immutably with validators and HEAD", async () => {
    const { app } = servedApp(await loadWebBuild(root, "disabled"));
    const asset = await app.inject({ url: "/assets/app-abc123.js" });
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toBe("console.log(1);");
    expect(asset.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(asset.headers["content-security-policy"]).toBe(
      "frame-ancestors 'none'",
    );
    expect(asset.headers["referrer-policy"]).toBe("no-referrer");
    const cached = await app.inject({
      url: "/assets/app-abc123.js",
      headers: { "if-none-match": String(asset.headers.etag) },
    });
    expect(cached.statusCode).toBe(304);
    expect(cached.body).toBe("");
    const head = await app.inject({ method: "HEAD", url: "/", headers: html });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe("");
    expect(head.headers["content-length"]).toBe(
      String(
        Buffer.byteLength(
          "<!doctype html><title>IA-MNS</title><div id=root></div>",
        ),
      ),
    );
    const favicon = await app.inject({ url: "/favicon.svg" });
    expect(favicon.headers["content-type"]).toBe("image/svg+xml");
    expect(favicon.headers["cache-control"]).toBe("no-cache");
    await app.close();
  });

  it("mounts module operations and health under /api and keeps root probes", async () => {
    const { app } = servedApp(await loadWebBuild(root, "disabled"));
    const operation = await app.inject({ url: "/api/probe/item" });
    expect(operation.json()).toEqual({ ok: true });
    expect(operation.headers["referrer-policy"]).toBe("no-referrer");
    expect(operation.headers["content-security-policy"]).toBe(
      "frame-ancestors 'none'",
    );
    for (const url of [
      "/health/live",
      "/health/ready",
      "/api/health/live",
      "/api/health/ready",
    ])
      expect((await app.inject({ url })).statusCode, url).toBe(200);
    // Outside /api the module route is just another page, never the API.
    const page = await app.inject({ url: "/probe/item", headers: html });
    expect(page.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect((await app.inject({ url: "/probe/item" })).statusCode).toBe(404);
    await app.close();
  });

  it("answers unknown API paths, writes and foreign files with the JSON envelope", async () => {
    const { app } = servedApp(await loadWebBuild(root, "disabled"));
    for (const request of [
      { url: "/api/unknown", headers: html },
      { url: "/api", headers: html },
      { url: "/health/unknown", headers: html },
      { url: "/assets/missing.js", headers: html },
      { url: "/ia-mns-web.json" },
      { url: "/.hidden" },
      { url: "/../package.json" },
      { url: "/assets/..%2f..%2fpackage.json" },
      { url: "/%2e%2e%2fpackage.json" },
      { method: "POST" as const, url: "/entrar", headers: html },
      { method: "DELETE" as const, url: "/", headers: html },
    ]) {
      const response = await app.inject(request);
      expect(response.statusCode, request.url).toBe(404);
      expect(response.json<{ error: { code: string } }>().error.code).toBe(
        "RESOURCE_NOT_FOUND",
      );
    }
    await app.close();
  });

  it("logs failures but not successful file responses, and drains web traffic", async () => {
    const lines: string[] = [];
    const { app, lifecycle } = servedApp(
      await loadWebBuild(root, "disabled"),
      { pdt, sankhya },
      lines,
    );
    await app.inject({ url: "/", headers: html });
    await app.inject({ url: "/assets/app-abc123.js" });
    expect(lines.filter((line) => line.includes("http_request"))).toEqual([]);
    await app.inject({ url: "/assets/missing.js" });
    expect(lines.filter((line) => line.includes("http_request"))).toHaveLength(
      1,
    );
    lifecycle.beginDrain();
    expect((await app.inject({ url: "/", headers: html })).statusCode).toBe(
      503,
    );
    expect((await app.inject({ url: "/api/health/live" })).statusCode).toBe(
      200,
    );
    await app.close();
  });

  it("keeps API-only operation unchanged without a web build", async () => {
    const { app, lifecycle } = createApp(logger(), undefined, {
      modules: [probeModule],
    });
    lifecycle.markReady();
    expect((await app.inject({ url: "/probe/item" })).json()).toEqual({
      ok: true,
    });
    const missing = await app.inject({ url: "/", headers: html });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers["content-security-policy"]).toBe(
      "frame-ancestors 'none'",
    );
    expect((await app.inject({ url: "/api/probe/item" })).statusCode).toBe(404);
    await app.close();
  });
});

describe("trusted proxies", () => {
  /** Rate limited by client address, as the identity endpoints are. */
  const limited: RegisteredModule = {
    name: "limited",
    register(app) {
      void app.register(async (scope) => {
        await scope.register(rateLimit, { global: false });
        scope.get(
          "/limited",
          { config: { rateLimit: { max: 2, timeWindow: "1 minute" } } },
          (request) => ({ ip: request.ip, protocol: request.protocol }),
        );
      });
    },
  };

  async function call(
    app: ReturnType<typeof createApp>["app"],
    remoteAddress: string,
    forwardedFor?: string,
  ) {
    return app.inject({
      url: "/limited",
      remoteAddress,
      headers: forwardedFor
        ? { "x-forwarded-for": forwardedFor, "x-forwarded-proto": "https" }
        : {},
    });
  }

  it("uses the forwarded client only through a configured proxy", async () => {
    const { app, lifecycle } = createApp(logger(), undefined, {
      modules: [limited],
      trustedProxies: ["10.0.0.5"],
    });
    lifecycle.markReady();
    const forwarded = await call(app, "10.0.0.5", "203.0.113.7");
    expect(forwarded.json()).toEqual({ ip: "203.0.113.7", protocol: "https" });
    // A spoofed left-most entry is ignored; the proxy appended the real peer.
    expect(
      (await call(app, "10.0.0.5", "198.51.100.1, 203.0.113.8")).json(),
    ).toMatchObject({ ip: "203.0.113.8" });
    // An untrusted peer cannot choose its address.
    expect((await call(app, "192.0.2.9", "203.0.113.7")).json()).toEqual({
      ip: "192.0.2.9",
      protocol: "http",
    });
    await app.close();
  });

  it("limits each forwarded client separately instead of the whole proxy", async () => {
    const { app, lifecycle } = createApp(logger(), undefined, {
      modules: [limited],
      trustedProxies: ["10.0.0.5"],
    });
    lifecycle.markReady();
    for (let i = 0; i < 2; i++)
      expect((await call(app, "10.0.0.5", "203.0.113.1")).statusCode).toBe(200);
    expect((await call(app, "10.0.0.5", "203.0.113.1")).statusCode).toBe(429);
    expect((await call(app, "10.0.0.5", "203.0.113.2")).statusCode).toBe(200);
    await app.close();
  });

  it("trusts no forwarding headers by default", async () => {
    const { app, lifecycle } = createApp(logger(), undefined, {
      modules: [limited],
    });
    lifecycle.markReady();
    for (let i = 0; i < 2; i++)
      expect(
        (await call(app, "10.0.0.5", `203.0.113.${i + 1}`)).json(),
      ).toEqual({ ip: "10.0.0.5", protocol: "http" });
    // Without trust every client behind a proxy shares the proxy's limit.
    expect((await call(app, "10.0.0.5", "203.0.113.9")).statusCode).toBe(429);
    await app.close();
  });
});
