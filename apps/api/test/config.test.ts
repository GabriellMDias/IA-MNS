import { describe, expect, it } from "vitest";
import {
  clientConfigFrom,
  configReference,
  parseServerConfig,
  serverConfigSchema,
} from "../src/config.js";

describe("API configuration boundary", () => {
  it("documents every schema field exactly once", () => {
    expect(configReference.map((entry) => entry.key).sort()).toEqual(
      Object.keys(serverConfigSchema.properties).sort(),
    );
    expect(new Set(configReference.map((entry) => entry.name)).size).toBe(
      configReference.length,
    );
  });
  it("requires an explicit environment before startup", () => {
    expect(() => parseServerConfig({})).toThrow("Invalid API configuration");
  });

  it("parses typed values, uses loopback defaults, and freezes the result", () => {
    const config = parseServerConfig({
      ORION_ENV: "test",
      ORION_API_PORT: "0",
      ORION_TRACE_SAMPLE_RATIO: "0.25",
    });
    expect(config).toMatchObject({
      environment: "test",
      releaseId: "local",
      host: "127.0.0.1",
      port: 0,
      traceSampleRatio: 0.25,
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(() => Object.assign(config, { port: 42 })).toThrow();
    expect(clientConfigFrom(config)).toEqual({});
    expect(Object.isFrozen(clientConfigFrom(config))).toBe(true);
  });

  it.each([
    { ORION_ENV: "other" },
    { ORION_ENV: "test", ORION_API_PORT: "abc" },
    { ORION_ENV: "test", ORION_API_PORT: "-1" },
    { ORION_ENV: "test", ORION_SHUTDOWN_TIMEOUT_MS: "0" },
    { ORION_ENV: "test", ORION_TRACE_SAMPLE_RATIO: "2" },
    { ORION_ENV: "test", ORION_RELEASE_ID: "candidate with spaces" },
    {
      ORION_ENV: "test",
      ORION_OTLP_ENDPOINT: "https://user:secret@example.test",
    },
    { ORION_ENV: "test", ORION_OTLP_ENDPOINT: "file:///tmp/collector" },
  ])("rejects unsafe or malformed configuration %#", (env) => {
    expect(() => parseServerConfig(env)).toThrow("Invalid API configuration");
  });

  it("classifies every setting and keeps the database credential restricted", () => {
    expect(
      configReference.every((item) => typeof item.secret === "boolean"),
    ).toBe(true);
    expect(
      configReference.find((item) => item.name === "ORION_DATABASE_URL"),
    ).toMatchObject({
      classification: "RESTRICTED",
      secret: true,
      visibility: "server",
    });
    expect(
      parseServerConfig({ ORION_ENV: "test", ORION_RELEASE_ID: "build.42" })
        .releaseId,
    ).toBe("build.42");
  });
});
