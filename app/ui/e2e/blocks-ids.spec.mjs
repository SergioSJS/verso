// What a `^id` names (spec Q3, Q21, Q4; decided 2026-10-07): an embed of
// `nota#^id` shows that block alone — a table named by a `^id` alone on
// the line after it, a list item with its nested items — and the same id
// twice in a note is said, the last one counting.

import { test, expect } from "./fixtures.mjs";

async function open(app, files, note) {
  await app.open();
  for (const [p, text] of Object.entries(files)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(files), true);
  await app.quickOpen(note);
}

test("an embed of a block shows that block alone", async ({ app, page }) => {
  await open(app, {
    "Fonte.md": "Introdução.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n^tab\n\n- item um ^item\n  - filho\n- item dois\n\nFim.\n",
    "Mostra.md": "![[Fonte#^tab]]\n\n![[Fonte#^item]]\n",
  }, "Mostra");
  const embeds = page.locator(".preview .embed-note-body");
  await expect(embeds).toHaveCount(2);
  // The table the `^tab` alone after it names, and nothing else of the note.
  await expect(embeds.nth(0).locator("table")).toHaveCount(1);
  await expect(embeds.nth(0)).not.toContainText("Introdução");
  await expect(embeds.nth(0)).not.toContainText("Fim");
  // The list item with its nested item, not the next item.
  await expect(embeds.nth(1)).toContainText("item um");
  await expect(embeds.nth(1)).toContainText("filho");
  await expect(embeds.nth(1)).not.toContainText("item dois");
});

test("the same ^id twice in a note is said, the last counting", async ({ app, page }) => {
  await open(app, { "Dup.md": "Primeiro. ^dup\n\nSegundo. ^dup\n" }, "Dup");
  await expect(page.locator(".note-sheet").getByText(/\^dup aparece 2 vezes \(linhas 1, 3\)/)).toBeVisible();
});
