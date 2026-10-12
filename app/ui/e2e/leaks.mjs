// What a test leaves open (ADR 0069 item 8, revised on 2026-10-12): a
// browser context a test opened with `browser.newContext()` outlives the
// test — Playwright closes only the context it made — and stays alive,
// with its pages and their surfaces, until the worker's browser closes.
// Every test of both suites ends here: what it left is closed and logged,
// and a test that passed fails for it (fix the test, not this). Pages and
// frames of the test's own context are counted too, for the record: they
// close with it.
//
// VERSO_E2E_LEAKS=<file> appends one JSON line per test to that file.

import { appendFileSync } from "node:fs";

function record(line) {
  const file = process.env.VERSO_E2E_LEAKS;
  if (file) appendFileSync(file, `${JSON.stringify(line)}\n`);
}

export const leakFixtures = {
  // Set up before the test's context and torn down after it: what is
  // still open in the browser then, the test opened itself.
  _contextsLeft: [
    async ({ browser }, use, testInfo) => {
      const before = new Set(browser.contexts());
      await use();
      const left = browser.contexts().filter((c) => !before.has(c));
      const pages = left.reduce((n, c) => n + c.pages().length, 0);
      record({ project: testInfo.project.name, test: testInfo.titlePath.slice(1).join(" › "), status: testInfo.status, contextsLeft: left.length, pagesLeft: pages });
      if (left.length === 0) return;
      await Promise.all(left.map((c) => c.close().catch(() => {})));
      const what = `${left.length} browser context(s) with ${pages} page(s) left open by the test`;
      console.log(`[leaks] ${testInfo.project.name} › ${testInfo.title}: ${what}, closed`);
      if (testInfo.status === testInfo.expectedStatus) throw new Error(`${what}: close what the test opens`);
    },
    { auto: true },
  ],
  // The test's own context, at its end: its pages and their frames.
  _pagesAtEnd: [
    async ({ context }, use, testInfo) => {
      await use();
      const pages = context.pages();
      const frames = pages.reduce((n, p) => n + p.frames().length, 0);
      record({ project: testInfo.project.name, test: testInfo.titlePath.slice(1).join(" › "), pagesAtEnd: pages.length, framesAtEnd: frames });
    },
    { auto: true },
  ],
};
