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
  "APIError",
  "AuthenticationError",
  "PermissionDeniedError",
  "RateLimitError",
  "NotFoundError",
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
  "invalid_api_key",
  "insufficient_quota",
  "model_not_found",
  "rate_limit_exceeded",
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
    const candidate = "code" in current ? current.code : undefined;
    const oracleCode =
      typeof candidate === "string"
        ? candidate.match(/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/)?.[0]
        : current.message.match(/^(ORA-\d{5}|NJS-\d{3}|DPI-\d{4}):/)?.[1];
    const code =
      oracleCode ??
      (typeof candidate === "string" && safeCodes.has(candidate)
        ? candidate
        : undefined);
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
      ...(code ? { code } : {}),
      frames,
    });
    current = current.cause;
  }
  return { causes };
}
