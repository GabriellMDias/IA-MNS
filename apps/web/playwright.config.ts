import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  globalSetup: "./test/e2e/setup.ts",
  use: { browserName: "chromium", trace: "retain-on-failure" },
  workers: 1,
  retries: 0,
  timeout: 30_000,
  projects: [
    // The Vite development server proxying /api to the emitted API.
    { name: "vite" },
    // The production shape: the emitted API serving the emitted web build.
    { name: "served", testMatch: ["identity.spec.ts"] },
  ],
});
