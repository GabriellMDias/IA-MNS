import { readFile } from "node:fs/promises";
import type { ServerConfig } from "./config.js";
import {
  loadWebBuild,
  type EmbedOrigins,
  type WebBuild,
} from "./web-hosting.js";

export type RuntimeAssets = Readonly<{
  https?: Readonly<{ key: Buffer; cert: Buffer }>;
  web?: Readonly<{ build: WebBuild; embed: EmbedOrigins }>;
}>;

/**
 * Files the configuration points to: the internal TLS listener material and
 * the web build. Failures name the setting, never its path or file contents.
 */
export async function loadRuntimeAssets(
  config: ServerConfig,
): Promise<RuntimeAssets> {
  let https: RuntimeAssets["https"];
  if (config.tlsCertFile && config.tlsKeyFile) {
    try {
      https = {
        cert: await readFile(config.tlsCertFile),
        key: await readFile(config.tlsKeyFile),
      };
    } catch {
      throw new Error(
        "Invalid runtime asset: ORION_TLS_CERT_FILE or ORION_TLS_KEY_FILE is unreadable",
      );
    }
  }
  let web: RuntimeAssets["web"];
  if (config.webRoot) {
    let build: WebBuild;
    try {
      build = await loadWebBuild(config.webRoot, config.webDocumentation);
    } catch (error) {
      throw error instanceof Error &&
        error.message.startsWith("Invalid web build")
        ? error
        : new Error("Invalid web build: ORION_WEB_ROOT is unreadable");
    }
    web = {
      build,
      embed: {
        ...(config.pdtEmbedOrigin ? { pdt: config.pdtEmbedOrigin } : {}),
        ...(config.sankhyaEmbedOrigin
          ? { sankhya: config.sankhyaEmbedOrigin }
          : {}),
      },
    };
  }
  return { ...(https ? { https } : {}), ...(web ? { web } : {}) };
}
