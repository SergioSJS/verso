// An ordered list past item 9 in Edit (the maintainer, 2026-10-30: "12."
// was drawn as "1" on one line and "2." on the next). The number keeps to
// one line whatever its digits, and every item's text starts at the same
// place as item 1's.

import { test, expect } from "./fixtures.mjs";

test("a two- or three-digit number stays on its line and the texts line up", async ({ app }) => {
  const { page } = app;
  await app.open();
  const items = Array.from({ length: 120 }, (_, i) => `${i + 1}. item ${i + 1}`).join("\n");
  await app.writeOutside("Lista longa.md", `# Lista\n\n${items}\n`);
  await app.quickOpen("Lista longa");
  await app.key("Mod+e");
  const marks = page.locator(".editor .cm-lp-order-mark");
  await expect(marks.first()).toBeVisible();
  const lineHeight = await page.locator(".editor .cm-line.cm-lp-ordered").first().evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  for (const n of [1, 9, 12, 100]) {
    const mark = page.locator(".editor .cm-line.cm-lp-ordered", { hasText: `item ${n}` }).first().locator(".cm-lp-order-mark");
    await mark.scrollIntoViewIfNeeded();
    const box = await mark.boundingBox();
    expect(box, `mark ${n}`).not.toBeNull();
    expect(box.height, `mark ${n} on one line`).toBeLessThan(lineHeight * 1.5);
  }
  // The text after the number starts where item 1's does.
  const textStart = async (n) => {
    const line = page.locator(".editor .cm-line.cm-lp-ordered", { hasText: `item ${n}` }).first();
    await line.scrollIntoViewIfNeeded();
    return line.evaluate((el) => {
      const mark = el.querySelector(".cm-lp-order-mark");
      return mark ? mark.getBoundingClientRect().right : NaN;
    });
  };
  const first = await textStart(1);
  for (const n of [9, 12, 100]) expect(Math.abs((await textStart(n)) - first), `item ${n}`).toBeLessThan(1.5);
});
