// The server's end-to-end tests (ADR 0073): the window in a browser,
// served by a real `verso serve` (e2e-server/serve.mjs) — signing in, the
// folders, the contract over the WebSocket, invitations and roles. In
// Chromium and WebKit, as the harness's. `npm run e2e:server`, after
// `cargo build -p verso-cli` and `npm run build`; scripts/check-e2e.sh runs it.
// On macOS, no screenshot and no trace screencast, as the harness's
// (playwright.config.mjs; ADR 0069 item 8, revised on 2026-10-12).

import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.SERVER_PORT ?? 4174);
const mac = process.platform === "darwin";

export default defineConfig({
  testDir: "e2e-server",
  testMatch: "*.spec.mjs",
  outputDir: "e2e-server/results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One server, one database: tests that sign in and invite run in order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  globalSetup: "./e2e/preflight.mjs",
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1400, height: 900 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: mac ? { mode: "retain-on-failure", screenshots: false, snapshots: true } : "retain-on-failure",
    screenshot: mac ? "off" : "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1400, height: 900 } } },
    { name: "phone", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  webServer: {
    command: "node e2e-server/serve.mjs",
    url: `http://localhost:${port}/api/state`,
    reuseExistingServer: false,
    env: { PORT: String(port) },
  },
});
