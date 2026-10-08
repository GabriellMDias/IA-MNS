// Issues a one-time, 30-minute invitation to create the first IA-MNS owner.
// Runs on the server with the runtime database configuration; refuses when an
// active owner exists unless --break-glass is given (audited either way).
// The printed URL carries the secret in the fragment, which browsers do not send.
import { parseServerConfig } from "../config.js";
import { createDatabase } from "../database.js";
import { identityService } from "../modules.js";

const breakGlass = process.argv.includes("--break-glass");
const unknown = process.argv
  .slice(2)
  .filter((argument) => argument !== "--break-glass");
if (unknown.length) {
  process.stderr.write("Usage: identity-bootstrap [--break-glass]\n");
  process.exit(2);
}
delete process.env.ORION_MIGRATION_DATABASE_URL;
const config = parseServerConfig(process.env);
if (!config.databaseUrl || !config.publicOrigin) {
  process.stderr.write(
    "Identity is not configured (database, IA_MNS_PUBLIC_ORIGIN and identity keys).\n",
  );
  process.exit(1);
}
const database = createDatabase(config.databaseUrl);
try {
  const service = identityService(config, database);
  if (!service) throw new Error("Identity is not configured");
  const token = await service.createBootstrapTicket(breakGlass);
  process.stdout.write(
    `Open within 30 minutes, once, on a trusted device:\n${config.publicOrigin}/identidade/inicial#${token}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error && error.message.startsWith("An active owner") ? error.message : "Bootstrap invitation failed"}\n`,
  );
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
