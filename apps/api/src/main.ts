import { parseServerConfig } from "./config.js";
import { createLogger } from "./logging.js";
import { errorDiagnostics } from "./error-diagnostics.js";
import { shutdownRuntime, withDeadline } from "./lifecycle.js";
import { initializeTelemetry } from "./telemetry.js";

let logger: ReturnType<typeof createLogger> | undefined;
let cleanup: (() => Promise<void>) | undefined;
let startupPhase = "configuration";

try {
  const config = parseServerConfig(process.env);
  startupPhase = "observability";
  logger = createLogger(config);
  const telemetry = initializeTelemetry(config, logger);
  cleanup = () => withDeadline(telemetry.shutdown(), config.shutdownTimeoutMs);
  startupPhase = "composition";
  // Load Fastify and Prisma only after instrumentation is registered.
  const { createApp } = await import("./app.js");
  const { createRepository } =
    await import("./features/approval-requests/prisma-repository.js");
  const { ApprovalRequestService } =
    await import("./features/approval-requests/service.js");
  const { createAccessTokenVerifier } =
    await import("./features/approval-requests/authentication.js");
  const repository = config.databaseUrl
    ? createRepository(config.databaseUrl)
    : undefined;
  const resources = {
    shutdown: async () => {
      // Neither resource may prevent the other from starting its cleanup.
      const results = await Promise.allSettled([
        repository?.db.$disconnect(),
        telemetry.shutdown(),
      ]);
      if (results.some((result) => result.status === "rejected"))
        throw new Error("Runtime cleanup failed");
    },
  };
  cleanup = () => withDeadline(resources.shutdown(), config.shutdownTimeoutMs);
  const feature =
    repository &&
    config.tokenIssuer &&
    config.tokenAudience &&
    config.tokenJwksUrl
      ? {
          service: new ApprovalRequestService(repository),
          checkReady: async () => {
            await repository.db.$queryRaw`SELECT 1`;
            return true;
          },
          verifier: createAccessTokenVerifier({
            issuer: config.tokenIssuer,
            audience: config.tokenAudience,
            jwksUrl: config.tokenJwksUrl,
          }),
        }
      : undefined;
  const { app, lifecycle } = createApp(logger, undefined, feature);
  const runtimeLogger = logger;
  cleanup = () =>
    shutdownRuntime(
      app,
      lifecycle,
      resources,
      config.shutdownTimeoutMs,
      (boundary) =>
        runtimeLogger.warn({ boundary }, "shutdown_deadline_exceeded"),
    );
  const close = cleanup;
  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    runtimeLogger.info({ signal }, "shutdown_started");
    await close();
    process.exitCode = 0;
  }
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  startupPhase = "database";
  if (repository) await repository.db.$queryRaw`SELECT 1`;
  startupPhase = "listen";
  await app.listen({ host: config.host, port: config.port });
  lifecycle.markReady();
  logger.info({ address: app.server.address() }, "api_ready");
} catch (error) {
  const diagnostic = { startupPhase, diagnostic: errorDiagnostics(error) };
  if (logger) logger.fatal(diagnostic, "api_startup_failed");
  else {
    // Configuration or logger initialization may fail before Pino exists.
    // This fixed projection must never include the raw environment/exception.
    process.stderr.write(
      `${JSON.stringify({
        level: 60,
        service: "orion-api",
        msg: "api_startup_failed",
        ...diagnostic,
      })}\n`,
    );
  }
  try {
    await cleanup?.();
  } catch {
    logger?.warn("startup_cleanup_failed");
  }
  process.exitCode = 1;
}
