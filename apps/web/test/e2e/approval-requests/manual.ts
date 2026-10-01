import { startApprovalRequestsStack } from "./stack.ts";

// Manual Orion reference workflow: `pnpm build`, then
// `node apps/web/test/e2e/approval-requests/manual.ts`. Foundation-only.
let reportExit!: (error: Error) => void;
const serviceExit = new Promise<Error>((resolve) => {
  reportExit = resolve;
});
let interrupt!: () => void;
const interrupted = new Promise<null>((resolve) => {
  interrupt = () => resolve(null);
});
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);

let stack: Awaited<ReturnType<typeof startApprovalRequestsStack>> | undefined;
try {
  stack = await startApprovalRequestsStack({
    apiEnvironment: "development",
    tokenLifetime: "1h",
    onUnexpectedExit: reportExit,
  });
  process.stdout.write(
    `Approval Request web: ${stack.webUrl}/approval-requests\n` +
      `Approval Request API: ${stack.apiUrl}\n` +
      "Use the local owner/reviewer buttons in the web app.\n" +
      "Synthetic tokens expire after one hour. Press Ctrl+C to stop.\n",
  );
  const failure = await Promise.race([interrupted, serviceExit]);
  if (failure) throw failure;
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
} finally {
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
  await stack?.stop();
}
