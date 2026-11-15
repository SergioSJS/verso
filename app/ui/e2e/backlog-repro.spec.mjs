// The backlog's reports that no test covered (Backlog, 2026-09-24;
// Backlog2, 2026-09-27), tried by machine: the arrow keys and the caret on
// bullets and checkboxes in Editar, ⌘Z, a tab dragged with both side bars
// open, and a narrow window.

import { test, expect } from "./fixtures.mjs";

// The lists of Backlog2, as the maintainer wrote them.
const LISTS = "# Listas\n\n- linha 1\n- linha 2\n- linha 3\n\n- Linha 1 nível 1\n- Linha 2 nível 1\n\t- Linha 1 nível 2\n\t- Linha 2 nível 2\n\nteste\n\n- [ ] Check 1\n- [ ] Check 2\n\t- [ ] Check 3\n\t\t- [ ] Check 4\n\nfim\n";

async function openNote(app, text, name = "Listas") {
  await app.open();
  await app.writeOutside(`${name}.md`, text);
  await app.folderChanged([`${name}.md`], true);
  await app.quickOpen(name);
  await expect(app.page.locator(".editor")).toBeAttached();
  await app.key("Mod+e");
  await expect(app.page.locator(".editor.live .cm-content")).toBeVisible();
  // The editor shows the note before its text arrives: wait for its last
  // line, or a line lookup can find nothing (seen once in Chromium).
  const last = text.trim().split("\n").pop();
  await expect.poll(() => app.page.evaluate(`${view}.state.doc.toString()`)).toContain(last);
}

const view = "document.querySelector('.leaf:not([hidden]) .note-sheet .editor').__cmView";
/** The caret's line number (1-based). */
const caretLine = (page) => page.evaluate(`${view}.state.doc.lineAt(${view}.state.selection.main.head).number`);
/** The note's text in the editor. */
const text = (page) => page.evaluate(`${view}.state.doc.toString()`);
/** The line number holding `words`. */
const lineOf = (page, words) => page.evaluate(`${view}.state.doc.toString().split("\\n").findIndex((l) => l.includes(${JSON.stringify(words)})) + 1`);
/** Put the caret at the end of line `n`, by the editor. */
const caretAt = (page, n) => page.evaluate(`(() => { const v = ${view}; const l = v.state.doc.line(${n}); v.dispatch({ selection: { anchor: l.to } }); v.focus(); })()`);
/** Where the words of a line start on screen. */
async function wordsX(page, words) {
  return page.evaluate((w) => {
    const line = [...document.querySelectorAll(".leaf:not([hidden]) .cm-line")].find((l) => l.textContent.includes(w));
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.textContent.indexOf(w);
      if (at < 0) continue;
      const r = document.createRange();
      r.setStart(n, at);
      r.setEnd(n, at + 1);
      return r.getBoundingClientRect().x;
    }
    return null;
  }, words);
}

test("↓ and ↑ walk bullets and checkboxes one line at a time", async ({ app, page }) => {
  await openNote(app, LISTS);
  for (const [from, to] of [["linha 1", "linha 3"], ["Linha 1 nível 1", "Linha 2 nível 2"], ["Check 1", "Check 4"]]) {
    const a = await lineOf(page, from);
    const b = await lineOf(page, to);
    await caretAt(page, a);
    for (let n = a + 1; n <= b; n++) {
      await page.keyboard.press("ArrowDown");
      expect(await caretLine(page), `↓ from ${from}`).toBe(n);
    }
    for (let n = b - 1; n >= a; n--) {
      await page.keyboard.press("ArrowUp");
      expect(await caretLine(page), `↑ to ${from}`).toBe(n);
    }
  }
});

test("the caret's line keeps its words where they were", async ({ app, page }) => {
  await openNote(app, LISTS);
  for (const words of ["linha 2", "Linha 1 nível 2", "Check 2", "Check 3"]) {
    await caretAt(page, await lineOf(page, "fim"));
    const before = await wordsX(page, words);
    await caretAt(page, await lineOf(page, words));
    const after = await wordsX(page, words);
    expect(Math.abs(after - before), `${words}: ${before} → ${after}`).toBeLessThanOrEqual(2);
  }
});

test("a click on a bullet's or a checkbox's words puts the caret on that line", async ({ app, page }) => {
  await openNote(app, LISTS);
  for (const words of ["linha 2", "Linha 2 nível 1", "Linha 1 nível 2", "Check 2", "Check 3", "Check 4"]) {
    await caretAt(page, await lineOf(page, "fim"));
    await page.locator(".leaf:not([hidden]) .cm-line", { hasText: words }).first().getByText(words, { exact: false }).first().click();
    expect(await caretLine(page), words).toBe(await lineOf(page, words));
  }
});

test("the caret's line shows its bullet or its box, not the `-` under it", async ({ app, page }) => {
  await openNote(app, LISTS);
  for (const words of ["linha 2", "Linha 1 nível 2", "Check 2", "Check 4"]) {
    await caretAt(page, await lineOf(page, words));
    const shown = await page.evaluate(() => document.querySelector(".leaf:not([hidden]) .cm-activeLine")?.textContent ?? "");
    expect(shown.trim(), words).toBe(words);
  }
});

/** Edit › Undo of the macOS menu, as the host sends it to this window. */
const menuUndo = (app, command = "undo") => app.page.evaluate((c) => window.__harness.emit("menu-edit", [window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? "main", c]), command);

test("⌘Z from the menu, the focus on a button, undoes the note's last changes in order", async ({ app, page }) => {
  await openNote(app, "# Desfazer\n\n- [ ] tarefa\n\nTexto\n", "Desfazer");
  await caretAt(page, await lineOf(page, "Texto"));
  await page.keyboard.type(" um");
  // Past the editor's pause: two steps of its history.
  await page.waitForTimeout(700);
  await page.keyboard.type(" dois");
  await expect.poll(() => text(page)).toContain("Texto um dois");
  // The focus leaves the editor: the mode's button.
  await page.locator(".leaf:not([hidden]) .modes button", { hasText: "Editar" }).focus();
  await menuUndo(app);
  await expect.poll(() => text(page)).toContain("Texto um\n");
  await menuUndo(app);
  await expect.poll(() => text(page)).toContain("Texto\n");
  await menuUndo(app, "redo");
  await expect.poll(() => text(page)).toContain("Texto um\n");
});

test("a tab dragged to the right edge, both side bars open, shows where it lands and lands there", async ({ app, page }) => {
  await app.open();
  // Two tabs kept: the one dragged and the one left behind.
  for (const name of ["01 - Guia de Markdown e Sintaxe.md", "02 - Links, Âncoras e Notas Incorporadas.md"]) {
    await page.locator(`#tree-root li[data-path="${name}"]`).dblclick();
  }
  await expect(page.locator(".pane .tab")).toHaveCount(2);
  await app.key("Mod+Alt+ArrowRight");
  await expect(page.locator("#right-tabs")).toBeVisible();
  await expect(page.locator("#tree-root")).toBeVisible();
  const tab = page.locator(".pane .tab").last();
  const body = page.locator(".pane-body").first();
  const t = await tab.boundingBox();
  const b = await body.boundingBox();
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  const x = b.x + b.width - 6;
  const y = b.y + b.height / 2;
  for (let i = 1; i <= 12; i++) await page.mouse.move(t.x + (x - t.x) * (i / 12), t.y + (y - t.y) * (i / 12));
  // The preview: the right half of the pane, inside it, between the bars.
  const shown = await page.evaluate(() => {
    const el = document.querySelector(".pane-body.drop-hint");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const after = getComputedStyle(el, "::after");
    return { right: el.classList.contains("drop-right"), left: r.left, width: r.width, afterLeft: after.left, content: after.content };
  });
  expect(shown, "a preview while dragging").not.toBeNull();
  expect(shown.right).toBe(true);
  const side = await page.locator("#right-tabs").boundingBox();
  expect(shown.left + shown.width).toBeLessThanOrEqual(side.x + 1);
  await page.mouse.up();
  await expect(page.locator(".pane")).toHaveCount(2);
  const [p1, p2] = [await page.locator(".pane").nth(0).boundingBox(), await page.locator(".pane").nth(1).boundingBox()];
  expect(p2.x).toBeGreaterThan(p1.x);
});

test("nothing stands past the window's edge, wide or narrow, with a side bar open or not", async ({ app, page }) => {
  for (const [w, right] of [[1280, false], [1280, true], [700, false], [520, false], [420, false]]) {
    await page.setViewportSize({ width: w, height: 760 });
    await app.open();
    await app.quickOpen("01 - Guia");
    if (right) await app.key("Mod+Alt+ArrowRight");
    const out = await page.evaluate(() => ({ W: window.innerWidth, scroll: document.documentElement.scrollWidth }));
    expect(out.scroll, `${w}px${right ? ", right bar open" : ""}`).toBeLessThanOrEqual(out.W);
    // The mode's buttons and the tab bar's own buttons stay on screen; on a
    // phone the modes fold into the one top bar (2026-11-14), which is measured.
    for (const sel of [".leaf:not([hidden]) .modes", ".pane .tabs", ".pane .phone-head"]) {
      const loc = page.locator(sel).first();
      if (!(await loc.isVisible())) continue;
      const r = await loc.boundingBox();
      expect(r.x + r.width, `${sel} at ${w}px`).toBeLessThanOrEqual(w + 1);
    }
  }
});

test("an SVG with no size of its own shows, in Leitura and in Editar, selected or not", async ({ app, page }) => {
  await openNote(app, "# Imagens\n\nAntes.\n\n![[assets/diagrama.svg]]\n\n![](assets/diagrama.svg)\n\nDepois.\n", "Imagens");
  const sizes = () => page.evaluate(() => [...document.querySelectorAll(".leaf:not([hidden]) img")].filter((i) => i.src.includes("diagrama") && i.offsetParent !== null).map((i) => Math.round(i.getBoundingClientRect().width)));
  // Editar, then the two images selected with the text around them.
  await expect.poll(sizes).toHaveLength(2);
  await expect.poll(async () => Math.min(...(await sizes()))).toBeGreaterThan(200);
  await page.evaluate(`${view}.dispatch({ selection: { anchor: 0, head: ${view}.state.doc.length } })`);
  await expect.poll(async () => Math.min(...(await sizes()))).toBeGreaterThan(200);
  // Leitura.
  await app.mode("Leitura");
  await expect.poll(sizes).toHaveLength(2);
  await expect.poll(async () => Math.min(...(await sizes()))).toBeGreaterThan(200);
});
