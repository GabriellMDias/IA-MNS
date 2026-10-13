import { spawn } from "node:child_process";
import { loadLocalEnvironment } from "./local-environment.js";

// Keep main.ts's instrumentation/import ordering in its own fresh process.
const child = spawn(
  process.execPath,
  ["--import", "tsx", ...process.argv.slice(2)],
  {
    env: await loadLocalEnvironment(),
    stdio: "inherit",
    windowsHide: true,
  },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => child.kill(signal));
child.once("error", () => {
  console.error("Local application process could not start");
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
