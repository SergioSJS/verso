// The note's blocks on a touch screen (ADR 0076 item 7, decided 2026-10-16;
// ADR 0061): no handle and no margin for one, and the keys' bar above the
// keyboard moves, turns and deletes the block at the cursor. On a screen
// with a mouse the handles stay, as ADR 0061 made them.

import { test, expect } from "./fixtures.mjs";

const NOTE = "Primeiro\n\nSegundo\n\nTerceiro\n";

async function openNote(app) {
  await app.open();
  await app.writeOutside("Barra.md", NOTE);
  await app.folderChanged(["Barra.md"], true);
  await app.quickOpen("Barra");
  await expect(app.page.locator(".editor")).toBeAttached();
  await app.key("Mod+e");
  await expect(app.page.locator(".editor.live .cm-content")).toBeVisible();
}

const text = (page) => page.evaluate(() => document.querySelector(".note-sheet .editor").__cmView.state.doc.toString());
const coarse = (page) => page.evaluate(() => matchMedia("(pointer: coarse)").matches);

/** The keyboard, as responsive.spec.mjs stands in for it: a visual viewport
 *  that lost `h` pixels. */
async function keyboard(page, h) {
  await page.evaluate((h) => {
    const fake = { offsetLeft: 0, offsetTop: 0, width: innerWidth, height: innerHeight - h, scale: 1, addEventListener() {}, removeEventListener() {} };
    Object.defineProperty(window, "visualViewport", { configurable: true, value: fake });
    dispatchEvent(new Event("resize"));
  }, h);
}

test("a touch screen: no block handles and no margin for them; a mouse keeps them @layout", async ({ app, page }) => {
  await openNote(app);
  const line = page.locator(".cm-line", { hasText: "Segundo" }).first();
  if (!(await coarse(page))) {
    const box = await line.boundingBox();
    await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 4 });
    await expect(page.locator(".cm-block-grip")).toBeVisible();
    return;
  }
  await line.click();
  await expect(page.locator(".cm-block-handle")).toBeHidden();
  const left = await line.evaluate((e) => e.getBoundingClientRect().left);
  // Measured with the margin the handles used to need, for comparison.
  const sheetPad = (css) =>
    page.evaluate((css) => {
      const s = document.createElement("style");
      s.textContent = css;
      document.head.append(s);
      const x = document.querySelector(".cm-line").getBoundingClientRect().left;
      s.remove();
      return x;
    }, css);
  const before = await sheetPad("html.block-handles .note-sheet { padding-left: calc(clamp(.7rem, 1.5vw, 1.2rem) + 1.9rem) !important; }");
  test.info().annotations.push({ type: "left inset", description: `at ${page.viewportSize().width}px: before ${before.toFixed(1)}, after ${left.toFixed(1)}` });
  expect(left).toBeLessThan(before - 20);
  // On a tablet the sidebar stands beside the note: the text's edge is not the screen's.
  if (page.viewportSize().width < 700) expect(left).toBeLessThanOrEqual(40);
});

test("a touch screen: the keys' bar moves, turns and deletes the block @layout", async ({ app, page }) => {
  await openNote(app);
  if (!(await coarse(page))) {
    await page.locator(".cm-line", { hasText: "Segundo" }).first().click();
    await expect(page.locator(".key-bar")).toBeHidden();
    return;
  }
  await page.locator(".cm-line", { hasText: "Primeiro" }).first().click();
  await keyboard(page, 300);
  const bar = page.locator(".key-bar");
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("role", "toolbar");
  const names = ["Acrescentar um bloco abaixo", "Transformar em…", "Inserir bloco", "Diminuir recuo", "Aumentar recuo", "Mover bloco para cima", "Mover bloco para baixo", "Excluir bloco", "Menu do bloco", "Desfazer", "Refazer", "Esconder o teclado"];
  for (const n of names) {
    const b = bar.getByRole("button", { name: n });
    await expect(b).toHaveCount(1);
    const box = await b.boundingBox();
    expect(box.width, n).toBeGreaterThanOrEqual(43.5);
    expect(box.height, n).toBeGreaterThanOrEqual(43.5);
  }
  // One row that scrolls sideways, never the page.
  if (page.viewportSize().width < 700) expect(await bar.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await bar.getByRole("button", { name: "Mover bloco para baixo" }).click();
  await expect.poll(() => text(page)).toBe("Segundo\n\nPrimeiro\n\nTerceiro\n");
  // The cursor went with the block, and the editor still has the focus.
  await expect(page.locator(".cm-content")).toBeFocused();
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Mover bloco para cima" }).click();
  await expect.poll(() => text(page)).toBe("Primeiro\n\nSegundo\n\nTerceiro\n");

  await bar.getByRole("button", { name: "Transformar em…" }).click();
  const menu = page.locator(".menu:not([hidden])");
  await expect(menu).toBeVisible();
  const m = await menu.boundingBox();
  const b = await bar.boundingBox();
  expect(m.y + m.height).toBeLessThanOrEqual(b.y + 1);
  await menu.getByRole("menuitem", { name: "Título 1" }).click();
  await expect.poll(() => text(page)).toBe("# Primeiro\n\nSegundo\n\nTerceiro\n");
  await expect(bar).toBeVisible();

  await bar.getByRole("button", { name: "Excluir bloco" }).click();
  await expect.poll(() => text(page)).not.toContain("Primeiro");
  expect(await text(page)).toContain("Segundo");

  await bar.getByRole("button", { name: "Menu do bloco" }).click();
  await expect(page.locator(".menu:not([hidden])").getByRole("menuitem", { name: "Duplicar" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("a jump to the end of a long note draws its marks at once, not raw until the parser lands @layout", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("11 - Escrevendo");
  await app.key("Mod+e");
  // A big window shows the note's code samples, which hold `---` themselves.
  if (!(await coarse(page))) return;
  const editor = page.locator(".pane.focused .cm-content").first();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  // One read, two frames after the jump: the note's `---` rules and `## `
  // marks are hidden by then (the syntax tree is parsed up to the screen's end
  // before the marks are drawn), not after the background parse catches up.
  // Judged by the lines themselves, not by the text anywhere: a screen as tall
  // as a tablet's also holds the note's `---` inside code spans, which stay.
  const raw = await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            done([...document.querySelectorAll(".pane.focused .cm-content .cm-line")].some((l) => l.textContent.trim() === "---" || l.textContent.startsWith("## "))),
          ),
        ),
      ),
  );
  expect(raw).toBe(false);
});
