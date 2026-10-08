// The window's end-to-end tests (ADR 0058): the browser harness
// (src/harness.ts) headless, served by e2e/serve.mjs from e2e/.site
// (e2e/build.mjs), never from the app's dist/, in two engines: WebKit, the
// engine of the app's web view on macOS, and Chromium, the engine of
// WebView2 on Windows (ADR 0069, item 8) — what differs between the two is
// most of what will differ in the Windows app. `npm run e2e` builds, then
// runs them; scripts/check.sh runs them before every push.

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
  projects: [
    { name: "webkit", use: { browserName: "webkit" } },
    // Desktop Chrome's device, with the same window and scale as above.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: {
    command: "node e2e/build.mjs && node e2e/serve.mjs",
    url: `http://127.0.0.1:${port}/harness.html`,
    // Never another checkout's server on the same port: a busy port fails.
    reuseExistingServer: false,
    env: { PORT: String(port) },
  },
});
