// The window's end-to-end tests (ADR 0058): the browser harness
// (src/harness.ts) in WebKit — the engine of the app's web view — headless,
// served by e2e/serve.mjs. `npm run e2e` builds, then runs them;
// scripts/check.sh runs them before every push.

import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.HARNESS_PORT ?? 4173);

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.mjs",
  outputDir: "e2e/results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Safari"],
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1500, height: 1000 },
    deviceScaleFactor: 1,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "webkit", use: { browserName: "webkit" } }],
  webServer: {
    command: "node e2e/serve.mjs",
    url: `http://127.0.0.1:${port}/harness.html`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(port) },
  },
});
