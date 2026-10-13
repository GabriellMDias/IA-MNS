import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import {
  erpAdministrativeKeys,
  parseServerConfig,
  type ServerConfig,
} from "../src/config.js";

type Environment = Readonly<Record<string, string | undefined>>;
export type DiscoveryErp = "sankhya" | "vrmaster";

/** Validate without injecting privileged values into process.env. */
export function discoveryEnvironment(text: string): Environment {
  const values = parseEnv(text);
  if (
    Object.keys(values).some(
      (key) =>
        !erpAdministrativeKeys.includes(
          key as (typeof erpAdministrativeKeys)[number],
        ),
    )
  )
    throw new Error(
      "Discovery configuration accepts only the four ERP FULLACESS keys",
    );
  return values;
}

export function discoveryConfig(
  env: Environment,
  credentials: Environment,
  erp: DiscoveryErp,
): ServerConfig {
  if (env.ORION_ENV !== "development" && env.ORION_ENV !== "test")
    throw new Error(
      "Discovery requires explicit development or test configuration",
    );
  const prefix = erp === "sankhya" ? "SANKHYA" : "VRMASTER";
  const userKey = `${prefix}_DB_USER_FULLACESS`;
  const passwordKey = `${prefix}_DB_PASSWORD_FULLACESS`;
  const user = env[userKey] ?? credentials[userKey];
  const password = env[passwordKey] ?? credentials[passwordKey];
  if (!user || !password)
    throw new Error(
      `Discovery requires ${userKey} and ${passwordKey}; runtime credentials are never a fallback`,
    );
  const selected = { ...env };
  for (const key of erpAdministrativeKeys) delete selected[key];
  selected[`${prefix}_DB_USER`] = user;
  selected[`${prefix}_DB_PASSWORD`] = password;
  return parseServerConfig(selected);
}

/** Called only by an explicitly selected development Discovery command. */
export async function loadDiscoveryConfig(
  erp: DiscoveryErp,
  env: Environment = process.env,
  path?: URL,
): Promise<ServerConfig> {
  if (env.ORION_ENV !== "development" && env.ORION_ENV !== "test")
    throw new Error(
      "Discovery requires explicit development or test configuration",
    );
  let text = "";
  // Deterministic selection, never a merge: support the owner's .env.discovery.
  const paths = path
    ? [path]
    : [
        new URL("../../../.env.discovery.local", import.meta.url),
        new URL("../../../.env.discovery", import.meta.url),
      ];
  for (const candidate of paths) {
    try {
      text = await readFile(candidate, "utf8");
      break;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error("Cannot read local Discovery configuration", { cause });
    }
  }
  return discoveryConfig(env, discoveryEnvironment(text), erp);
}
