// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// In Fonte, a word selected inside one line shows (the maintainer,
// 2026-11-15: "selecionei um trecho no mac e não dá pra ver nada"). The
// drawn selection lies under the lines, and Fonte paints the caret's line:
// that paint hid a selection inside the line, while one over several lines
// showed on the others. With text selected the line is not painted.

import { expect, test } from "./fixtures.mjs";

const view = "document.querySelector('.leaf:not([hidden]) .note-sheet .editor').__cmView";

test("a word selected in Fonte shows: the caret's line is not painted over it @layout", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("04 - Escrevendo no Editor");
  await app.mode("Fonte");
  const editor = page.locator(".leaf:not([hidden]) .editor.source .cm-editor");
  await expect(editor).toBeVisible();
  const paint = () => page.evaluate(() => {
    const line = document.querySelector(".leaf:not([hidden]) .editor.source .cm-activeLine");
    return line ? getComputedStyle(line).backgroundColor : null;
  });
  const clear = (c) => c === null || c === "transparent" || /rgba\(0, 0, 0, 0\)/.test(c);
  // A caret alone: the line is painted, as Fonte shows where the caret is.
  await page.evaluate(`${view}.focus(); ${view}.dispatch({ selection: { anchor: ${view}.state.doc.line(13).from + 2 } })`);
  await expect.poll(paint).not.toBe(null);
  expect(clear(await paint())).toBe(false);
  // A word inside that line: its rectangle drawn, and the line not painted over it.
  await page.evaluate(`(() => { const l = ${view}.state.doc.line(13); ${view}.dispatch({ selection: { anchor: l.from + 2, head: Math.min(l.to, l.from + 7) } }); })()`);
  await expect(editor.locator(".cm-evenSelection .cm-selectionBackground").first()).toBeVisible();
  await expect.poll(async () => clear(await paint())).toBe(true);
});

// In Live Preview a line that paints its own background hides the drawn
// selection under it, so there the browser's own selection must show
// (css/reading.css). Rosé Pine draws quotes as a panel (--paper-2): a word
// selected in a quote was invisible (review of 2026-11-15). A callout drawn
// outlined paints nothing, and keeps the one drawn layer (no second shade).
// The ::selection read back is Chromium's: WebKit does not answer it.
test("a word selected in a quote drawn as a panel (Rosé Pine) shows in Live Preview", async ({ app, page, browserName }) => {
  const NOTE = "Citação.md";
  const TEXT = "# Citação\n\n> uma frase citada aqui\n\n> [!note] Aviso\n> dentro do aviso\n\ntexto comum\n";
  await app.open();
  await app.writeOutside(NOTE, TEXT);
  await app.folderChanged([NOTE], true);
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  const more = page.locator(".themes").getByRole("button", { name: "Mais temas…" });
  await more.scrollIntoViewIfNeeded();
  await more.click();
  const dialog = page.getByRole("dialog", { name: "Mais temas" });
  await dialog.locator('[data-theme-card="Rosé Pine"] .theme-pick').click();
  await expect(page.locator("html")).toHaveAttribute("data-blockquote-style", "panel");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.keyboard.press("Escape");
  await app.quickOpen("Citação");
  await app.mode("Editar");
  const quote = page.locator(".leaf:not([hidden]) .cm-line.cm-lp-quote").first();
  await expect(quote).toBeVisible();
  // The quote paints its panel.
  const clear = (c) => c === null || c === "transparent" || /rgba\(0, 0, 0, 0\)/.test(c);
  expect(clear(await quote.evaluate((l) => getComputedStyle(l).backgroundColor))).toBe(false);
  await page.evaluate(`(() => { const l = ${view}.state.doc.line(3); ${view}.focus(); ${view}.dispatch({ selection: { anchor: l.from + 2, head: l.from + 6 } }); })()`);
  await expect(page.locator(".leaf:not([hidden]) .cm-evenSelection .cm-selectionBackground").first()).toBeAttached();
  test.skip(browserName !== "chromium", "getComputedStyle(…, '::selection') is read in Chromium only");
  const selection = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? getComputedStyle(el, "::selection").backgroundColor : null;
  }, sel);
  // The quote's line shows the browser's selection; a plain line keeps it clear.
  expect(clear(await selection(".leaf:not([hidden]) .cm-line.cm-lp-quote"))).toBe(false);
  expect(clear(await selection(".leaf:not([hidden]) .cm-line:not(.cm-lp-quote):not(.cm-lp-callout):not(.cm-lp-fence)"))).toBe(true);
  // A callout drawn outlined paints nothing: its line keeps the selection clear too.
  expect(clear(await selection(".leaf:not([hidden]) .cm-line.cm-lp-callout:not(.cm-lp-callout-head)"))).toBe(false);
  await page.evaluate(() => (document.documentElement.dataset["calloutStyle"] = "outlined"));
  expect(clear(await selection(".leaf:not([hidden]) .cm-line.cm-lp-callout:not(.cm-lp-callout-head)"))).toBe(true);
  expect(await app.file(NOTE)).toBe(TEXT);
});
