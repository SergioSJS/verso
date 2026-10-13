// The hostile-HTML suite in the browsers (ADR 0083 item 16): the cases of
// test/sanitize-cases.mjs — the same list `npm test` runs in node, over
// happy-dom — cleaned by the window's own sanitizer (`__harness.sanitize`,
// the instance main.ts configures; src/harness.ts) and read back by this
// browser's parser, in WebKit and in Chromium. A real parser's quirks are
// the point: mutation XSS, foreign content and its integration points,
// raw-text elements, the CSSOM's own reading of a style. Each output is
// checked against the policy (no script, no handler, no script or page
// address, no element, attribute or class outside the set, ids under the
// prefix, no lifted position, no `url()` to a scheme not allowed), and it
// must parse back to itself, clean to itself, and be what `cleanHtml`'s
// nodes write.

import { test, expect } from "./fixtures.mjs";
import { CASES, POLICY, misses, problems, read } from "../test/sanitize-cases.mjs";

/** `read`, evaluated in the page over `inputs`. Its source travels as
 *  text: it holds no reference outside its own body. */
function readInPage(page, inputs) {
  return page.evaluate(`(${read})(window.__harness.sanitize, ${JSON.stringify(inputs)}, true)`);
}

const short = (text, max) => (text.length > max ? `${text.slice(0, max)}… (${text.length} chars)` : text);

test("the window's sanitizer is the policy's, and the configured one", async ({ app }) => {
  await app.open();
  const policy = await app.page.evaluate(() => JSON.parse(JSON.stringify(window.__harness.sanitize.POLICY)));
  expect(policy, "the policy test/sanitize-cases.mjs prints").toEqual(POLICY);
  // The instance main.ts configured, not a copy: an unconfigured module
  // makes a bare link of a page on the web, the window's makes a gate.
  const out = await app.page.evaluate(() => window.__harness.sanitize.cleanHtmlText('<iframe src="https://example.org/"></iframe>'));
  expect(out).toContain('class="embed-gate"');
  expect(out).not.toContain("data-embed-web");
});

test("hostile notes, cleaned and read back by this browser", async ({ app }) => {
  await app.open();
  const results = await readInPage(app.page, CASES.map((c) => c[1]));
  expect(results).toHaveLength(CASES.length);
  const failures = [];
  CASES.forEach((c, i) => {
    const r = results[i];
    const found = [...problems(r), ...misses(c, r.out ?? "")];
    if (found.length > 0) failures.push([`${c[0]}`, `  in:  ${short(c[1], 300)}`, `  out: ${short(r.out ?? "", 600)}`, ...found.map((f) => `  - ${f}`)].join("\n"));
  });
  expect(failures.join("\n\n"), `cases outside the policy in this browser (${failures.length} of ${CASES.length})`).toBe("");
  expect(CASES.length).toBeGreaterThanOrEqual(100);
});
