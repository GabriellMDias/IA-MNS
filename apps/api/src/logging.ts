import pino, { type DestinationStream, type Logger } from "pino";
import type { ServerConfig } from "./config.js";
import { currentTraceContext } from "./request-context.js";

// All application logs are structured and originate from allowlisted fields.
// These paths provide a second defense against accidental object logging.
export const redactionPaths = Object.freeze([
  "authorization",
  "cookie",
  "token",
  "password",
  "secret",
  "accessToken",
  "refreshToken",
  "clientSecret",
  "apiKey",
  "*.authorization",
  "*.cookie",
  "*.set-cookie",
  "*.token",
  "*.password",
  "*.secret",
  "*.accessToken",
  "*.refreshToken",
  "*.clientSecret",
  "*.apiKey",
  "req.headers",
  "res.headers",
  "request.headers",
  "request.body",
  "response.body",
  "config",
  "env",
]);

export function createLogger(
  config: ServerConfig,
  destination?: DestinationStream,
): Logger {
  const options = {
    level: config.logLevel,
    base: {
      service: "orion-api",
      environment: config.environment,
      release: config.releaseId,
    },
    mixin: currentTraceContext,
    redact: { paths: [...redactionPaths], censor: "[REDACTED]" },
    serializers: {},
  };
  return destination ? pino(options, destination) : pino(options);
}
