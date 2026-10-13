import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { erpAdministrativeKeys, parseServerConfig } from "../src/config.js";
import {
  discoveryConfig,
  discoveryEnvironment,
  loadDiscoveryConfig,
} from "../scripts/discovery-config.js";
import { loadLocalEnvironment } from "../scripts/local-environment.js";

const env = {
  ORION_ENV: "test",
  SANKHYA_DB_USER: "synthetic_reader",
  SANKHYA_DB_PASSWORD: "synthetic-runtime-password",
  SANKHYA_DB_CONNECT_STRING: "example.test/service",
  VRMASTER_DB_USER: "synthetic_reader",
  VRMASTER_DB_PASSWORD: "synthetic-runtime-password",
  VRMASTER_DB_HOST: "example.test",
  VRMASTER_DB_NAME: "synthetic",
};
const administrative = {
  SANKHYA_DB_USER_FULLACESS: "synthetic_oracle_admin",
  SANKHYA_DB_PASSWORD_FULLACESS: "synthetic-oracle-admin-password",
  VRMASTER_DB_USER_FULLACESS: "synthetic_pg_admin",
  VRMASTER_DB_PASSWORD_FULLACESS: "synthetic-pg-admin-password",
};

describe("ERP credential isolation", () => {
  it("the normal local loader excludes administrative credentials from file and inherited environment", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ia-mns-runtime-env-test-"));
    try {
      const file = join(directory, ".env.local");
      await writeFile(
        file,
        `ORION_ENV=test\nSANKHYA_DB_USER=synthetic_reader\n${Object.entries(
          administrative,
        )
          .map(([key, value]) => `${key}=${value}`)
          .join("\n")}\n`,
      );
      const loaded = await loadLocalEnvironment(
        { ...administrative, SANKHYA_DB_USER: "synthetic_shell_reader" },
        pathToFileURL(file),
      );
      expect(loaded.SANKHYA_DB_USER).toBe("synthetic_shell_reader");
      for (const key of erpAdministrativeKeys)
        expect(loaded[key]).toBeUndefined();
      expect(JSON.stringify(loaded)).not.toContain("admin-password");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it.each(erpAdministrativeKeys)(
    "refuses %s at the runtime boundary without exposing its value",
    (key) => {
      expect(() =>
        parseServerConfig({ ...env, [key]: administrative[key] }),
      ).toThrow(
        "administrative ERP credentials belong in .env.discovery.local",
      );
      try {
        parseServerConfig({ ...env, [key]: administrative[key] });
      } catch (cause) {
        expect(String(cause)).not.toContain(administrative[key]);
      }
    },
  );
  it("selects each existing administrative identity only for the requested ERP", () => {
    const oracle = discoveryConfig(env, administrative, "sankhya");
    const pg = discoveryConfig(env, administrative, "vrmaster");
    expect(oracle.sankhyaUser).toBe(administrative.SANKHYA_DB_USER_FULLACESS);
    expect(oracle.vrmasterUser).toBe(env.VRMASTER_DB_USER);
    expect(pg.vrmasterPassword).toBe(
      administrative.VRMASTER_DB_PASSWORD_FULLACESS,
    );
    expect(pg.sankhyaPassword).toBe(env.SANKHYA_DB_PASSWORD);
    expect(parseServerConfig(env).sankhyaUser).toBe(env.SANKHYA_DB_USER);
  });
  it("never falls back to runtime credentials, including incomplete admin pairs", () => {
    expect(() => discoveryConfig(env, {}, "sankhya")).toThrow(
      "runtime credentials are never a fallback",
    );
    expect(() =>
      discoveryConfig(
        env,
        { VRMASTER_DB_USER_FULLACESS: "synthetic" },
        "vrmaster",
      ),
    ).toThrow("runtime credentials are never a fallback");
  });
  it("refuses production before reading the privileged file", async () => {
    await expect(
      loadDiscoveryConfig(
        "sankhya",
        { ORION_ENV: "production" },
        pathToFileURL(join(tmpdir(), "nonexistent-discovery-test")),
      ),
    ).rejects.toThrow("explicit development or test");
    expect(() => discoveryConfig({}, administrative, "vrmaster")).toThrow(
      "explicit development or test",
    );
  });
  it("rejects runtime/target overrides in the Discovery file", () => {
    for (const key of [
      "ORION_ENV",
      "SANKHYA_DB_USER",
      "VRMASTER_DB_HOST",
      "OPENAI_API_KEY",
    ])
      expect(() => discoveryEnvironment(`${key}=synthetic`)).toThrow(
        "only the four ERP FULLACESS keys",
      );
  });
  it("loads explicit local credentials without populating process.env; shell values win", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ia-mns-discovery-test-"));
    try {
      const file = join(directory, ".env.discovery.local");
      await writeFile(
        file,
        'SANKHYA_DB_USER_FULLACESS=synthetic_file_admin\nSANKHYA_DB_PASSWORD_FULLACESS="synthetic # password"\n',
      );
      const before = process.env.SANKHYA_DB_PASSWORD_FULLACESS;
      const config = await loadDiscoveryConfig(
        "sankhya",
        { ...env, SANKHYA_DB_USER_FULLACESS: "synthetic_shell_admin" },
        pathToFileURL(file),
      );
      expect(config.sankhyaUser).toBe("synthetic_shell_admin");
      expect(config.sankhyaPassword).toBe("synthetic # password");
      expect(process.env.SANKHYA_DB_PASSWORD_FULLACESS).toBe(before);
      expect(parseServerConfig(env).sankhyaPassword).toBe(
        env.SANKHYA_DB_PASSWORD,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
