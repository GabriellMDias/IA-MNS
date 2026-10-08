// Database deployment with ORION_MIGRATION_DATABASE_URL, run explicitly by a
// deployment, never by the server process, which never receives that
// credential:
//   database-deploy [apply]  committed migrations, the declared runtime grants
//                            and their least-privilege check;
//   database-deploy status   the database's migration history compared with
//                            this release, read only, as JSON. Exit code 0 when
//                            this release is compatible (pending migrations
//                            may remain), 3 when it is not.
import { deployDatabase, inspectDatabase } from "../database-deploy.js";

const url = process.env.ORION_MIGRATION_DATABASE_URL;
const [command = "apply", ...rest] = process.argv.slice(2);
if (!["apply", "status"].includes(command) || rest.length) {
  process.stderr.write("Usage: database-deploy [apply|status]\n");
  process.exit(2);
}
if (!url) {
  process.stderr.write("ORION_MIGRATION_DATABASE_URL is required.\n");
  process.exit(2);
}
// Messages of these steps are fixed statements; driver errors are not shown.
const safeMessage = (error: unknown, fallback: string) =>
  error instanceof Error &&
  /^(The runtime role|The database|Prisma migrate deploy failed|Database deployment needs|Unsupported runtime grant)/.test(
    error.message,
  )
    ? error.message
    : fallback;
if (command === "status") {
  try {
    const state = await inspectDatabase(url);
    process.stdout.write(`${JSON.stringify(state)}\n`);
    process.exitCode = state.compatible ? 0 : 3;
  } catch (error) {
    process.stderr.write(
      `${safeMessage(error, "The database migration history could not be read")}.\n`,
    );
    process.exitCode = 1;
  }
} else {
  try {
    const result = await deployDatabase(url, { output: "inherit" });
    process.stdout.write(
      `Database deployed: ${result.applied.length} migrations applied; runtime role holds exactly ${result.privileges} declared privileges on ${result.tables} tables.\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${safeMessage(error, "Database deployment failed while granting or verifying runtime privileges")}.\n`,
    );
    process.exitCode = 1;
  }
}
