import type { FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import type { ServerConfig } from "./config.js";
const loopback = new Set(["127.0.0.1", "::1", "localhost", "[::1]"]);
/** Explicit developer access, with browser cross-site requests rejected. */
export function isLocalRequest(request: FastifyRequest) {
  if (
    !loopback.has(request.ip) ||
    !loopback.has(request.hostname) ||
    request.headers["x-ia-mns-client"] !== "web" ||
    request.headers["sec-fetch-site"] === "cross-site"
  )
    return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      loopback.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/** Temporary device access to the loopback API through its development proxy. */
export function isDevelopmentTokenRequest(
  request: FastifyRequest,
  config: ServerConfig,
) {
  if (
    config.environment === "production" ||
    !config.devAccessToken ||
    !config.devAccessExpiresAt ||
    config.devAccessExpiresAt <= Math.floor(Date.now() / 1000) ||
    !loopback.has(request.ip) ||
    !loopback.has(request.hostname) ||
    request.headers["x-ia-mns-client"] !== "web" ||
    request.headers["sec-fetch-site"] === "cross-site"
  )
    return false;
  if (
    request.headers.origin &&
    request.headers.origin !== config.devAccessOrigin
  )
    return false;
  const authorization = request.headers.authorization;
  if (!authorization || !/^Bearer [a-f0-9]{64}$/.test(authorization))
    return false;
  return timingSafeEqual(
    Buffer.from(authorization.slice(7)),
    Buffer.from(config.devAccessToken),
  );
}
