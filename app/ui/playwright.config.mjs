// The window's end-to-end tests (ADR 0058): the browser harness
// (src/harness.ts) headless, served by e2e/serve.mjs from e2e/.site
// (e2e/build.mjs), never from the app's dist/, in two engines: WebKit, the
// engine of the app's web view on macOS, and Chromium, the engine of
// WebView2 on Windows (ADR 0069, item 8) — what differs between the two is
// most of what will differ in the Windows app. `npm run e2e` builds, then
// runs them; scripts/check-e2e.sh runs them in Docker before every push.
//
// On macOS (ADR 0069 item 8, revised on 2026-10-12): one worker, no
// screenshot and no trace screencast. Playwright's WebKit on a Mac takes
// every screencast frame and every screenshot as a capture of its window
// by the WindowServer, and the window server kept the surfaces: it ran out
// of IOSurfaces and aborted four times in two days. A trace still records
// the DOM of each step, which is what is read after a failure; Linux and
// CI keep the screencast and the screenshots. e2e/preflight.mjs guards the
// run (globalSetup).

import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.HARNESS_PORT ?? 4173);
const mac = process.platform === "darwin";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.mjs",
  outputDir: "e2e/results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: mac ? 1 : undefined,
  globalSetup: "./e2e/preflight.mjs",
  reporter: [["list"]],
  use: {
    ...devices["Desktop Safari"],
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1500, height: 1000 },
    deviceScaleFactor: 1,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: mac ? { mode: "retain-on-failure", screenshots: false, snapshots: true } : "retain-on-failure",
    screenshot: mac ? "off" : "only-on-failure",
  },
  projects: [
    { name: "webkit", use: { browserName: "webkit" } },
    // Desktop Chrome's device, with the same window and scale as above.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 },
    },
    // The window on every screen (ADR 0076 item 13): the tests of the
    // window's layout or touch, tagged `@layout` in their titles, also run
    // at a phone's and a tablet's size — not the whole suite three times.
    // Playwright moves a finger only in Chromium.
    {
      name: "phone-webkit",
      grep: /@layout/,
      use: { browserName: "webkit", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 },
    },
    {
      name: "phone-chromium",
      grep: /@layout/,
      // Desktop Chrome's agent: the keys a test presses are the Mac's, as the window reads its platform.
      use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 },
    },
    {
      name: "tablet-webkit",
      grep: /@layout/,
      use: { browserName: "webkit", viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 },
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
