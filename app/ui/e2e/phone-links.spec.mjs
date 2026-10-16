// The list of notes after `[[` on an Android phone (the maintainer,
// 2026-10-16: "digitei [[por e nao sugeriu nada"). Gboard composes the whole
// word (underlined) until a space, and CodeMirror takes the Android agent's
// input through its own paths; the phone project's Desktop Chrome agent never
// reaches them, so this file asks for a Pixel's. Chromium only: the input
// method is driven through the DevTools protocol.

import { devices } from "@playwright/test";
import { test, expect } from "./fixtures.mjs";

test.use({ userAgent: devices["Pixel 7"].userAgent });

/** Chrome on Android keeps the layout viewport when the keyboard opens and
 *  shrinks only the visual one, which is all the window reads of it: the
 *  keyboard is stood in for by a visual viewport that lost `h` pixels. */
async function keyboard(page, h) {
  await page.evaluate((h) => {
    const vv = {
      offsetLeft: 0, offsetTop: 0, scale: 1, pageLeft: 0, pageTop: 0,
      width: window.innerWidth, height: window.innerHeight - h,
      listeners: new Set(),
      addEventListener(_t, fn) { this.listeners.add(fn); },
      removeEventListener(_t, fn) { this.listeners.delete(fn); },
    };
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    window.dispatchEvent(new Event("resize"));
  }, h);
}

const steps = [
  ["both brackets committed, the word composing", [["[", "["], ["[", "["]], ["p", "po", "por"], null],
  ["both brackets composed as one word, the word composing", [["[[", "[["]], ["p", "po", "por"], null],
  ["the word composing, then committed", [["[", "["], ["[", "["]], ["p", "po", "por"], "por"],
  ["the brackets typed by key, the word composing", "keys", ["p", "po", "por"], null],
  ["the brackets and the word as one composition", [], ["[[p", "[[po", "[[por"], null],
  ["the second bracket and the word as one composition", [["[", "["]], ["[p", "[po", "[por"], null],
  ["the keyboard open, the word composing", [["[", "["], ["[", "["]], ["p", "po", "por"], null, 330],
  ["the keyboard open, the brackets typed by key", "keys", ["p", "po", "por"], null, 330],
];

for (const [title, brackets, word, commit, keyboardHeight] of steps) {
  test(`\`[[por\` on an Android keyboard lists the notes: ${title} @layout`, async ({ app, page, browserName }) => {
    await app.open();
    if (browserName !== "chromium") {
      test.info().annotations.push({ type: "skip", description: "the input method is driven through the DevTools protocol" });
      return;
    }
    expect(await page.evaluate(() => navigator.userAgent)).toContain("Android");
    await app.quickOpen("11 - Escrevendo");
    await app.key("Mod+e");
    const editor = page.locator(".pane.focused .cm-content").first();
    await editor.click();
    // The editor takes its input through an EditContext, as Chrome on Android does.
    expect(await editor.evaluate((e) => Boolean(e.editContext))).toBe(true);
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    if (keyboardHeight) await keyboard(page, keyboardHeight);
    const cdp = await page.context().newCDPSession(page);
    if (brackets === "keys") {
      await page.keyboard.type("[[");
    } else {
      for (const [composing, commitText] of brackets) {
        await cdp.send("Input.imeSetComposition", { text: composing, selectionStart: composing.length, selectionEnd: composing.length });
        if (commitText !== null) await cdp.send("Input.insertText", { text: commitText });
      }
    }
    const tooltip = page.locator(".cm-tooltip-autocomplete");
    // Brackets typed alone list the notes; brackets that ride the word's own composition list with it.
    if (!word[0].startsWith("[")) await expect(tooltip).toBeVisible();
    const labels = () => tooltip.getByRole("option").allTextContents();
    // Each letter the keyboard underlines: the list follows it.
    let typed = "";
    for (const w of word) {
      typed = w.replace(/^\[+/, "");
      await cdp.send("Input.imeSetComposition", { text: w, selectionStart: w.length, selectionEnd: w.length });
      await expect.poll(async () => (await tooltip.isVisible()) && (await labels()).length > 0, { message: `list after "${w}"` }).toBe(true);
      // Filtered by what is typed: the best option holds its letters.
      await expect.poll(async () => ((await labels())[0] ?? "").toLowerCase().includes(typed)).toBe(true);
    }
    if (commit !== null) {
      await cdp.send("Input.insertText", { text: commit });
      await expect(tooltip).toBeVisible();
      await expect.poll(async () => ((await labels())[0] ?? "").toLowerCase().includes("por")).toBe(true);
    }
    expect(await editor.textContent()).toContain("[[por");
    const box = await tooltip.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(page.viewportSize().width);
    expect(Math.round(box.y + box.height)).toBeLessThanOrEqual(page.viewportSize().height);
  });
}
