// What a `^id` names (spec Q3, Q21, Q4; decided 2026-10-07): an embed of
// `nota#^id` shows that block alone — a table named by a `^id` alone on
// the line after it, a list item with its nested items — and the same id
// twice in a note is said, the last one counting. The id itself is not
// shown when reading, and is shown quiet in Editar, as in Obsidian.

import { test, expect, modeOn } from "./fixtures.mjs";

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

test("a nested item, by a tab or a blank line, is embedded with its children and as a list", async ({ app, page }) => {
  await open(app, {
    "Fonte.md": "- pai\n\t- filho ^tab\n\t\t- neto\n- tio\n\nSolto.\n\n- um ^solto\n\n  - dentro\n- dois\n",
    "Mostra.md": "![[Fonte#^tab]]\n\n![[Fonte#^solto]]\n",
  }, "Mostra");
  const embeds = page.locator(".preview .embed-note-body");
  await expect(embeds).toHaveCount(2);
  // The tab-indented item with its child, as a list: not the parent, not
  // the sibling, and not an indented code block.
  await expect(embeds.nth(0)).toContainText("filho");
  await expect(embeds.nth(0)).toContainText("neto");
  await expect(embeds.nth(0)).not.toContainText("pai");
  await expect(embeds.nth(0)).not.toContainText("tio");
  await expect(embeds.nth(0).locator("li")).not.toHaveCount(0);
  await expect(embeds.nth(0).locator("pre")).toHaveCount(0);
  // The loose item (a blank line before its sub-list) with its child.
  await expect(embeds.nth(1)).toContainText("um");
  await expect(embeds.nth(1)).toContainText("dentro");
  await expect(embeds.nth(1)).not.toContainText("dois");
  await expect(embeds.nth(1)).not.toContainText("Solto");
});

test("a ^id inside a quote embeds the whole quote", async ({ app, page }) => {
  await open(app, {
    "Fonte.md": "Antes.\n\n> primeira\n>\n> ^cit\n\nDepois.\n",
    "Mostra.md": "![[Fonte#^cit]]\n",
  }, "Mostra");
  const embed = page.locator(".preview .embed-note-body");
  await expect(embed).toHaveCount(1);
  // The harness draws a quote line by line; the core draws one quote.
  await expect(embed.locator("blockquote")).not.toHaveCount(0);
  await expect(embed).toContainText("primeira");
  await expect(embed).not.toContainText("Antes");
  await expect(embed).not.toContainText("Depois");
  await expect(embed).not.toContainText("^cit");
});

test("the same ^id twice in a note is said, the last counting", async ({ app, page }) => {
  await open(app, { "Dup.md": "Primeiro. ^dup\n\nSegundo. ^dup\n" }, "Dup");
  await expect(page.locator(".note-sheet").getByText(/\^dup aparece 2 vezes \(linhas 1, 3\)/)).toBeVisible();
});

test("a block's ^id is hidden when reading and quiet in Editar", async ({ app, page }) => {
  await open(app, {
    "Fonte.md": "Um parágrafo. ^par\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n^tab\n\nFim.\n",
  }, "Fonte");
  const preview = page.locator(".leaf:not([hidden]) .preview");
  await expect(preview).toContainText("Um parágrafo.");
  await expect(preview).not.toContainText("^par");
  await expect(preview).not.toContainText("^tab");
  await modeOn(page, "Editar");
  await expect(page.locator(".leaf:not([hidden]) .cm-blockid")).toHaveText(["^par", "^tab"]);
});
