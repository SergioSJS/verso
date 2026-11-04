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
    await app.quickOpen("04 - Escrevendo");
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
    await expectOnScreen(page, tooltip);
  });
}

/** The list where the screen shows it: CodeMirror keeps a list it takes for
 *  out of view at `top: -10000px`, which a locator still calls visible (the
 *  maintainer's phone, 2026-10-16: the list was open, 16 options, and off
 *  the screen). */
async function expectOnScreen(page, tooltip) {
  const shown = await page.evaluate(() => visualViewport.height);
  const box = await tooltip.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(page.viewportSize().width);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(Math.round(box.y + box.height)).toBeLessThanOrEqual(Math.round(shown));
}

// As on the maintainer's phone: the editor is as tall as its note inside the
// sheet that scrolls, and the cursor stands near the note's end with the
// keyboard open. The keyboard's height was taken off the editor's bottom,
// so the editor took the cursor for hidden and put the list off the screen.
for (const [title, lines] of [["a short note", 3], ["the end of a long note", 80]]) {
  test(`\`[[\` at ${title} with the keyboard open: the list is on the screen, above the keyboard @layout`, async ({ app, page, browserName }) => {
    await app.open();
    if (browserName !== "chromium") {
      test.info().annotations.push({ type: "skip", description: "the input method is driven through the DevTools protocol" });
      return;
    }
    await app.writeOutside("Curta.md", `${Array.from({ length: lines }, (_, i) => `Linha ${i + 1}`).join("\n")}\n`);
    await app.folderChanged(["Curta.md"], true);
    await app.quickOpen("Curta");
    await app.key("Mod+e");
    const editor = page.locator(".pane.focused .cm-content").first();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await keyboard(page, 330);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.insertText", { text: "[[" });
    for (const w of ["p", "po", "por"]) await cdp.send("Input.imeSetComposition", { text: w, selectionStart: w.length, selectionEnd: w.length });
    const tooltip = page.locator(".cm-tooltip-autocomplete");
    await expect(tooltip.getByRole("option").first()).toBeAttached();
    await expect.poll(async () => (await tooltip.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
    await expectOnScreen(page, tooltip);
    // The cursor itself above the keyboard and its bar.
    const caret = await page.evaluate(() => getSelection().getRangeAt(0).getBoundingClientRect().bottom);
    // A desktop's window has no keys' bar: the keyboard's top is the limit.
    const bar = page.locator(".key-bar:not([hidden])");
    const limit = (await bar.count()) > 0 ? (await bar.boundingBox()).y : await page.evaluate(() => visualViewport.height);
    expect(caret).toBeLessThanOrEqual(limit);
  });
}

// Android shrinks the window to the keyboard's top, so the keys' bar sits on
// it: Brave's visual viewport alone left a gap (the maintainer's phones,
// 2026-10-16). The key is set on Android only; WebKit warns about it.
test("on Android the window shrinks to the keyboard @layout", async ({ app, page, browserName }) => {
  await app.open();
  const content = await page.locator('meta[name="viewport"]').getAttribute("content");
  if (browserName === "chromium") expect(content).toContain("interactive-widget=resizes-content");
  else expect(content).not.toContain("interactive-widget");
});
