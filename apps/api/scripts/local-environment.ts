import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { erpAdministrativeKeys } from "../src/config.js";

/** The spawned application never receives administrative ERP credentials. */
export function runtimeEnvironment(
  local: NodeJS.ProcessEnv,
  inherited: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const env = { ...local, ...inherited };
  for (const key of erpAdministrativeKeys) delete env[key];
  return env;
}

export async function loadLocalEnvironment(
  inherited: NodeJS.ProcessEnv = process.env,
  path = new URL("../../../.env.local", import.meta.url),
): Promise<NodeJS.ProcessEnv> {
  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error("Cannot read local runtime configuration", { cause });
  }
  return runtimeEnvironment(parseEnv(text), inherited);
}
