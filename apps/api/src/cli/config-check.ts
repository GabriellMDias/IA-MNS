// Validates the server configuration exactly as startup does (environment,
// files it names, token verification and module production requirements)
// without listening or opening connections. A deployment runs it with the new
// artifact before replacing the running version.
import { parseServerConfig } from "../config.js";

delete process.env.ORION_MIGRATION_DATABASE_URL;
try {
  const config = parseServerConfig(process.env);
  const { loadRuntimeAssets } = await import("../runtime-assets.js");
  const assets = await loadRuntimeAssets(config);
  const { createDatabase } = await import("../database.js");
  const { composeModules } = await import("../composition.js");
  const database = config.databaseUrl
    ? createDatabase(config.databaseUrl)
    : undefined;
  try {
    const { modules } = await composeModules(config, database);
    process.stdout.write(
      `Configuration valid for ${config.environment}: ${modules.length} modules, web ${assets.web ? "served" : "not served"}, ${assets.https ? "HTTPS" : "HTTP"} listener.\n`,
    );
  } finally {
    await database?.$disconnect();
  }
} catch (error) {
  // Configuration errors name settings, never their values.
  const message =
    error instanceof Error &&
    /^Invalid (API configuration|runtime asset|web build)/.test(error.message)
      ? error.message
      : "Invalid API configuration";
  process.stderr.write(`${message}.\n`);
  process.exitCode = 1;
}
