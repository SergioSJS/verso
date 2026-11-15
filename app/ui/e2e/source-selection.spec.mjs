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
