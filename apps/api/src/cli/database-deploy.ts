// Applies committed migrations, the declared runtime grants and their
// least-privilege check with ORION_MIGRATION_DATABASE_URL. Run explicitly by a
// deployment, never by the server process, which never receives that credential.
import { deployDatabase } from "../database-deploy.js";

const url = process.env.ORION_MIGRATION_DATABASE_URL;
if (process.argv.length > 2) {
  process.stderr.write("Usage: database-deploy (no arguments)\n");
  process.exit(2);
}
if (!url) {
  process.stderr.write("ORION_MIGRATION_DATABASE_URL is required.\n");
  process.exit(2);
}
try {
  const result = await deployDatabase(url, { output: "inherit" });
  process.stdout.write(
    `Database deployed: runtime role holds exactly ${result.privileges} declared privileges on ${result.tables} tables.\n`,
  );
} catch (error) {
  // Messages of this step are fixed statements; driver errors are not shown.
  const message =
    error instanceof Error &&
    /^(The runtime role|Prisma migrate deploy failed|Database deployment needs|Unsupported runtime grant)/.test(
      error.message,
    )
      ? error.message
      : "Database deployment failed while granting or verifying runtime privileges";
  process.stderr.write(`${message}.\n`);
  process.exitCode = 1;
}
