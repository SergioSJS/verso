// Ordered lists keep their numbering in Reading: one <ol> per list, items
// 1..n (or from the list's own start), nested and in a callout, loose too.

import { test, expect } from "./fixtures.mjs";

const NOTE = "Listas.md";
const TEXT = [
  "# Listas", "",
  "Texto:", "",
  "1. um", "2. dois", "3. tres", "4. quatro", "",
  "Depois:", "",
  "3. tres", "4. quatro", "5. cinco", "",
  "Aninhada:", "",
  "1. a", "   1. a1", "   2. a2", "2. b", "",
  "Solta:", "",
  "1. p", "", "2. q", "", "3. r", "",
].join("\n");

test("ordered lists number 1, 2, 3 in Reading", async ({ app, page }) => {
  await app.open();
  await app.writeOutside(NOTE, TEXT);
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Listas");
  const pv = page.locator("div.preview:visible");
  await expect(pv.locator("ol").first()).toBeVisible();
  const info = await pv.evaluate((root) =>
    [...root.querySelectorAll("ol")].map((ol) => ({
      start: ol.start,
      nested: !!ol.parentElement.closest("ol"),
      values: [...ol.children].map((li, n) => ol.start + n),
      html: ol.outerHTML.slice(0, 160),
    })));
  const top = info.filter((o) => !o.nested);
  expect(top.map((o) => o.values)).toEqual([[1, 2, 3, 4], [3, 4, 5], [1, 2], [1, 2, 3]]);
  expect(info.find((o) => o.nested).values).toEqual([1, 2]);
});
