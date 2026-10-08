import { createServer } from "node:net";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";

// The browser runner's API server otherwise uses the fixed port 63315, which
// Windows may place in a dynamically excluded (Hyper-V/WinNAT) range and then
// refuse with EACCES. A port the operating system assigns on the same loopback
// name is never in such a range; strictPort fails loudly instead of drifting.
async function ephemeralPort(host: string): Promise<number> {
  const server = createServer();
  await new Promise<void>((ready, fail) => {
    server.once("error", fail);
    server.listen(0, host, ready);
  });
  const address = server.address();
  await new Promise<void>((closed) => server.close(() => closed()));
  if (!address || typeof address === "string")
    throw new Error("No ephemeral port for the browser test server.");
  return address.port;
}

const port = await ephemeralPort("localhost");

export default defineConfig({
  plugins: [react({ compiler: true })],
  test: {
    include: ["test/**/*.browser.test.tsx"],
    // Vitest 5 serves the browser runner from this API server.
    api: {
      host: "localhost",
      port,
      strictPort: true,
    },
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions:
          process.platform === "win32" ? { channel: "msedge" } : {},
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
