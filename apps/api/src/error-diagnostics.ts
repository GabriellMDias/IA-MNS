import { existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = dirname(fileURLToPath(import.meta.url));
const safeTypes = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "AuthenticationUnavailableError",
]);
const safeCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EADDRINUSE",
  "EACCES",
  "ERR_JWKS_TIMEOUT",
  "ERR_JWKS_INVALID",
  "ERR_JWK_INVALID",
]);

type SafeDiagnostic = {
  type: string;
  code?: string;
  frames: { module: string; line: number; column: number }[];
};

// Keep source locations and bounded cause categories, never messages, arbitrary
// properties, local machine paths, dependency stacks, or raw stack text.
export function errorDiagnostics(error: unknown): { causes: SafeDiagnostic[] } {
  const causes: SafeDiagnostic[] = [];
  const seen = new Set<Error>();
  let current = error;
  while (current instanceof Error && !seen.has(current) && causes.length < 4) {
    seen.add(current);
    const code = "code" in current ? current.code : undefined;
    const frames: SafeDiagnostic["frames"] = [];
    for (const line of (current.stack ?? "").split("\n").slice(1, 40)) {
      const match = line.match(
        /(?:\(|\s)((?:file:\/\/\/|[A-Za-z]:[\\/]|\/)[^()]+):(\d+):(\d+)\)?$/,
      );
      if (!match) continue;
      let path: string;
      try {
        path = match[1].startsWith("file:")
          ? fileURLToPath(match[1])
          : match[1];
      } catch {
        continue;
      }
      const module = relative(moduleRoot, path).replaceAll("\\", "/");
      if (
        module.startsWith("../") ||
        !/^[a-zA-Z0-9_/-]+\.(?:ts|js)$/.test(module) ||
        module.length > 160 ||
        !existsSync(resolve(moduleRoot, module))
      )
        continue;
      frames.push({ module, line: Number(match[2]), column: Number(match[3]) });
      if (frames.length === 8) break;
    }
    causes.push({
      type: safeTypes.has(current.name) ? current.name : "UnhandledError",
      ...(typeof code === "string" && safeCodes.has(code) ? { code } : {}),
      frames,
    });
    current = current.cause;
  }
  return { causes };
}
