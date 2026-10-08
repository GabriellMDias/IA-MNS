import { parseServerConfig } from "./config.js";
import { createLogger } from "./logging.js";
import { errorDiagnostics } from "./error-diagnostics.js";
import { shutdownRuntime, withDeadline } from "./lifecycle.js";
import { initializeTelemetry } from "./telemetry.js";
import { serviceName } from "./service-identity.js";

let logger: ReturnType<typeof createLogger> | undefined;
let cleanup: (() => Promise<void>) | undefined;
let startupPhase = "configuration";

try {
  // Migration credentials belong to CLI tooling, never the runtime.
  delete process.env.ORION_MIGRATION_DATABASE_URL;
  const config = parseServerConfig(process.env);
  startupPhase = "observability";
  logger = createLogger(config);
  const telemetry = initializeTelemetry(config, logger);
  cleanup = () => withDeadline(telemetry.shutdown(), config.shutdownTimeoutMs);
  startupPhase = "assets";
  const { loadRuntimeAssets } = await import("./runtime-assets.js");
  const assets = await loadRuntimeAssets(config);
  startupPhase = "composition";
  // Load Fastify, Prisma, and modules only after instrumentation is registered.
  const { createApp } = await import("./app.js");
  const { createDatabase, checkDatabase } = await import("./database.js");
  const { composeModules } = await import("./composition.js");
  const database = config.databaseUrl
    ? createDatabase(config.databaseUrl)
    : undefined;
  const resources = {
    shutdown: async () => {
      // Neither resource may prevent the other from starting its cleanup.
      const results = await Promise.allSettled([
        database?.$disconnect(),
        telemetry.shutdown(),
      ]);
      if (results.some((result) => result.status === "rejected"))
        throw new Error("Runtime cleanup failed");
    },
  };
  cleanup = () => withDeadline(resources.shutdown(), config.shutdownTimeoutMs);
  const { modules } = await composeModules(config, database);
  const { app, lifecycle } = createApp(logger, undefined, {
    modules,
    ...(database ? { checkReady: () => checkDatabase(database) } : {}),
    ...(config.trustedProxies ? { trustedProxies: config.trustedProxies } : {}),
    ...assets,
  });
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
  if (database) await checkDatabase(database);
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
        service: serviceName,
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
