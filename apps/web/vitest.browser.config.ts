import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  plugins: [react({ compiler: true })],
  test: {
    include: ["test/**/*.browser.test.tsx"],
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
