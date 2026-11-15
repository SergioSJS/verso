// The window on every screen (ADR 0076): a phone's frame, one pane at a
// time, a pane that folds its tools, the graph's panel, the kanban, the
// keyboard's bar, the tree's selection by touch, targets and words. Each
// test is tagged `@layout`: it runs at the desktop's size and, by the
// projects of playwright.config.mjs, at 390 × 844 (WebKit), 412 × 915
// (Chromium, touch) and 820 × 1180 (WebKit) — and asks the size it got.
// A finger moves only in Chromium (its DevTools protocol).

import { test, expect } from "./fixtures.mjs";

const PHONE = 760;
const phone = (page) => page.viewportSize().width < PHONE;
/** A finger, as Playwright moves one: Chromium with touch only. */
const finger = (browserName, testInfo) => browserName === "chromium" && Boolean(testInfo.project.use.hasTouch);

/** The drawer open on a phone, so that the tree can be tapped. */
async function tree(app) {
  if (!phone(app.page)) return;
  if (await app.page.locator("body.side-open").count()) return;
  await app.page.locator(".bottom-bar .bar-files").click();
  await expect(app.page.locator("body.side-open")).toHaveCount(1);
  await app.page.locator("aside.side").evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
}

/** Touches through Chromium's DevTools protocol: `points` is a list of
 *  steps, each the fingers' places; the first step presses them, the
 *  last lifts them; `holdMs` still after the press. */
async function touches(page, steps, holdMs = 0) {
  const cdp = await page.context().newCDPSession(page);
  const at = (pts) => pts.map(([x, y], i) => ({ x, y, id: i + 1 }));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(steps[0]) });
  if (holdMs) await page.waitForTimeout(holdMs);
  for (const pts of steps.slice(1)) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(pts) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

const center = async (locator) => {
  const b = await locator.boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};

test("the frame follows the screen: a phone's bar of six verbs, the desktop's ribbon and status bar @layout", async ({ app, page }) => {
  await app.open();
  const width = page.viewportSize().width;
  if (phone(page)) {
    await expect(page.locator(".ribbon")).toBeHidden();
    await expect(page.locator(".status-bar")).toBeHidden();
    const items = page.locator(".bottom-bar .bottom-bar-item");
    await expect(items).toHaveCount(6);
    for (const b of await items.all()) {
      const box = await b.boundingBox();
      expect(Math.round(box.height), "a target of 44 px at least").toBeGreaterThanOrEqual(44);
      // Every word whole at this width, in Portuguese (ADR 0076 item 12).
      const cut = await b.locator(".bottom-bar-label").evaluate((e) => e.scrollWidth > e.clientWidth + 1);
      expect(cut, await b.textContent()).toBe(false);
    }
    // The bar sits at the bottom of the window.
    const bar = await page.locator(".bottom-bar").boundingBox();
    expect(Math.round(bar.y + bar.height)).toBe(page.viewportSize().height);
  } else {
    await expect(page.locator(".bottom-bar")).toBeHidden();
    await expect(page.locator(".ribbon")).toBeVisible();
    await expect(page.locator(".status-bar")).toBeVisible();
  }
  // Nothing wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
});

test.describe("a phone's", () => {
  test.skip(({ viewport }) => viewport.width >= PHONE, "the bottom bar is a phone's");
  test("the phone's bar: the drawer, the search, the palette, a new note and back @layout", async ({ app, page }) => {
  await app.open();
  const bar = page.locator(".bottom-bar");
  await bar.locator(".bar-files").click();
  await expect(page.locator("body.side-open")).toHaveCount(1);
  await bar.locator(".bar-files").click();
  await expect(page.locator("body.side-open")).toHaveCount(0);
  await bar.getByRole("button", { name: "Buscar" }).click();
  await expect(page.locator("body.side-open")).toHaveCount(1);
  await expect(page.locator("#search")).toBeFocused();
  await page.keyboard.press("Escape");
  await bar.locator(".bar-files").click();
  await bar.getByRole("button", { name: "Comandos" }).click();
  await expect(page.locator(".quick.palette:not([hidden])")).toBeVisible();
  await page.keyboard.press("Escape");
  // Back: disabled until the pane has somewhere to go back to.
  const back = bar.getByRole("button", { name: "Voltar" });
  await expect(back).toBeDisabled();
  await app.quickOpen("01 - Guia");
  await app.quickOpen("02 - Links");
  await expect(back).toBeEnabled();
  await back.click();
  await expect(page.locator('.pane.focused .tab[aria-selected="true"]')).toContainText("01 - Guia");
  // A new note, where the focus is.
  const before = (await app.files()).length;
  await bar.getByRole("button", { name: "Nova nota" }).click();
  await expect.poll(async () => (await app.files()).length).toBe(before + 1);
  });
});

test("a split layout on a phone: one pane at a time, a switcher, the layout kept for a wider window @layout", async ({ app, page }) => {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 1200, height: 900 });
  await app.open();
  await app.quickOpen("01 - Guia");
  await app.command("Dividir à direita");
  await expect(page.locator(".pane")).toHaveCount(2);
  await app.quickOpen("02 - Links");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".pane:visible")).toHaveCount(1);
  const switcher = page.locator(".pane.focused .pane-switch");
  await expect(switcher).toBeVisible();
  await expect(switcher).toHaveText("2/2");
  await expect(switcher).toHaveAttribute("aria-label", "Painel 2 de 2");
  await switcher.click();
  const menu = page.locator(".menu:not([hidden])");
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  await menu.getByRole("menuitem", { name: /Painel 1: 01 - Guia/ }).click();
  await expect(page.locator(".pane:visible")).toHaveCount(1);
  // The tab in front, named in the one top bar (the tabs fold into it, 2026-11-14).
  await expect(page.locator(".pane:visible .phone-title-name")).toHaveText(/01 - Guia/);
  // On a phone the split commands are absent: from the palette and from a tab.
  await app.key("Mod+Shift+p");
  // A touch screen's field waits for a tap (screen/openFocus.ts).
  await page.locator(".quick.palette:not([hidden]) input").click();
  await page.keyboard.type("Dividir");
  await expect(page.locator(".quick.palette:not([hidden]) .quick-list li")).toHaveCount(0);
  await page.keyboard.press("Escape");
  // The tab's own menu, through the pane's ⋯ (what a long press on the tab opened).
  await page.locator(".pane:visible .pane-fold").click();
  await menu.getByRole("menuitem", { name: "Ações da aba…" }).click();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Dividir à direita" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // A wider window: both panes again, as they were.
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.locator(".pane:visible")).toHaveCount(2);
  await page.setViewportSize(size);
});

test("a pane under 520 px folds its tools into one button, which also reaches the tab's menu @layout", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("01 - Guia");
  const pane = page.locator(".pane.focused");
  const width = (await pane.boundingBox()).width;
  const fold = pane.locator(".pane-fold");
  if (width >= 520) {
    await expect(fold).toBeHidden();
    await expect(pane.locator(".pane-new")).toBeVisible();
    return;
  }
  await expect(fold).toBeVisible();
  await expect(pane.locator(".pane-new")).toBeHidden();
  await fold.click();
  const menu = page.locator(".menu:not([hidden])");
  await expect(menu.getByRole("menuitem", { name: "Nova nota" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Ações da aba…" }).click();
  await expect(menu.getByRole("menuitem", { name: "Fechar aba" })).toBeVisible();
});

test("the graph: its controls a panel on a phone, opened by a button; help for the input the screen has @layout", async ({ app, page }) => {
  await app.open();
  await app.command("Grafo do cofre");
  const toggle = page.locator(".graph-controls-toggle");
  const controls = page.locator(".graph-controls");
  const pane = await page.locator(".pane.focused").boundingBox();
  if (phone(page) || pane.width < 520) {
    await expect(controls).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(controls).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    // The graph keeps most of the pane's width.
    const svg = await page.locator("svg.graph").boundingBox();
    expect(svg.width).toBeGreaterThan(pane.width * 0.8);
  } else {
    await expect(toggle).toBeHidden();
    await expect(controls).toBeVisible();
  }
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  await expect(page.locator(".graph-hint")).toContainText(coarse ? "pinça amplia" : "roda amplia");
});

test.describe("a finger's", () => {
  test.skip(({ browserName, hasTouch }) => browserName !== "chromium" || !hasTouch, "a finger moves only in Chromium with touch");

test("the graph: two fingers pinch it and pan it @layout", async ({ app, page }) => {
  await app.open();
  await app.command("Grafo do cofre");
  const svg = page.locator("svg.graph");
  await expect(page.locator("svg.graph .node").first()).toBeVisible();
  const scale = () => page.locator("svg.graph > g").first().evaluate((g) => g.getAttribute("transform") ?? "");
  const before = await scale();
  const [x, y] = await center(svg);
  await touches(page, [
    [[x - 30, y], [x + 30, y]],
    [[x - 50, y], [x + 50, y]],
    [[x - 80, y], [x + 80, y]],
    [[x - 110, y], [x + 110, y]],
  ]);
  await expect.poll(scale).not.toBe(before);
  const zoomOf = (tr) => Number(/scale\(([\d.]+)/.exec(tr)?.[1] ?? "1");
  expect(zoomOf(await scale())).toBeGreaterThan(zoomOf(before));
});

test("Edit mode on a touch screen: a tap on a link places the cursor and a card offers to open or edit it @layout", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Ligações.md", "Veja [[00 - Bem-vindo ao Verso]] aqui.\n");
  await app.folderChanged(["Ligações.md"], true);
  await app.quickOpen("Ligações");
  await app.key("Mod+e");
  const link = page.locator(".cm-lp-wikilink", { hasText: "00 - Bem-vindo ao Verso" }).first();
  await link.tap();
  const card = page.locator(".cm-link-card");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("aria-label", "Link: 00 - Bem-vindo ao Verso");
  // Still in the note: the tap took nobody anywhere.
  await expect(page.locator('.pane.focused .tab[aria-selected="true"]')).toContainText("Ligações");
  await card.getByRole("button", { name: "Abrir" }).tap();
  await expect(page.locator('.pane.focused .tab[aria-selected="true"]')).toContainText("00 - Bem-vindo");
});
});

test("the kanban by touch: a swipe scrolls, a long press opens the card's menu with Move to column @layout", async ({ app, page, browserName }, testInfo) => {
  await app.open();
  await app.quickOpen("Projetos.base");
  await page.locator(".base-views").click();
  await page.locator(".menu:not([hidden])").getByRole("menuitem", { name: /Por Status/ }).click();
  const card = page.locator(".base-column .base-card").first();
  await expect(card).toBeVisible();
  if (phone(page)) {
    // A column the width of the screen less a margin that shows the next.
    const wrap = await page.locator(".base-kanban-wrap").boundingBox();
    const col = await page.locator(".base-column").first().boundingBox();
    expect(col.width).toBeGreaterThan(wrap.width * 0.75);
    expect(col.width).toBeLessThan(wrap.width);
    expect(await page.locator(".base-kanban-wrap").evaluate((e) => getComputedStyle(e).scrollSnapType)).toContain("x");
  }
  if (!finger(browserName, testInfo)) {
    // A mouse: the card's own menu by the right click, the same items.
    await card.click({ button: "right" });
    await expect(page.locator(".menu:not([hidden])").getByRole("menuitem", { name: "Mover para a coluna…" })).toBeVisible();
    return;
  }
  // A long press and a lift: the card's menu, and from it the columns.
  const [x, y] = await center(card);
  await touches(page, [[[x, y]]], 700);
  const menu = page.locator(".menu:not([hidden])");
  await expect(menu.getByRole("menuitem", { name: "Mover para a coluna…" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Mover para a coluna…" }).click();
  await expect(menu.getByRole("menuitem", { name: /Mover para “/ }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  // A swipe across a card moves nothing: the board scrolls.
  const files = await app.files();
  const wrap = page.locator(".base-kanban-wrap");
  const scrolled = await wrap.evaluate((e) => e.scrollLeft);
  await touches(page, [[[x, y]], [[x - 40, y]], [[x - 80, y]], [[x - 140, y]], [[x - 200, y]]]);
  await expect(page.locator(".drag-ghost:not([hidden])")).toHaveCount(0);
  expect(await app.files()).toEqual(files);
  await expect(menu).toHaveCount(0);
  if (phone(page)) await expect.poll(() => wrap.evaluate((e) => e.scrollLeft)).toBeGreaterThan(scrolled);
});

test("the keyboard's bar: shown while the editor has the focus on a touch screen, its keys act on the text @layout", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("04 - Escrevendo");
  await app.key("Mod+e");
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  const editor = page.locator(".pane.focused .cm-content").first();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  const bar = page.locator(".key-bar");
  if (!coarse) {
    await expect(bar).toBeHidden();
    return;
  }
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("role", "toolbar");
  for (const b of await bar.locator("button:visible").all()) expect(Math.round((await b.boundingBox()).height)).toBeGreaterThanOrEqual(44);
  // Inside the screen, at its bottom.
  const box = await bar.boundingBox();
  expect(Math.round(box.y + box.height)).toBeLessThanOrEqual(page.viewportSize().height);
  // The note's whole text (its state), not the lines the editor happens to draw: those follow the scroll.
  const text = () => page.evaluate(() => document.querySelector(".pane.focused .leaf:not([hidden]) .note-sheet .editor").__cmView.state.doc.toString());
  const was = await text();
  await bar.getByRole("button", { name: "Link interno [[ ]]" }).click();
  await expect(editor).toBeFocused();
  await expect.poll(text).toContain("[[");
  await expect(page.locator(".cm-tooltip-autocomplete")).toBeVisible();
  await page.keyboard.press("Escape");
  await bar.getByRole("button", { name: "Desfazer" }).click();
  await expect.poll(text).toBe(was);
  await bar.getByRole("button", { name: "Esconder o teclado" }).click();
  await expect(editor).not.toBeFocused();
  await expect(bar).toBeHidden();
});

test("the tree by touch: Select turns it into a selection with a bar; Keep open and Open stand for a double click @layout", async ({ app, page }) => {
  await app.open();
  await tree(app);
  const row = (p) => page.locator(`#notes li[data-path="${p}"] > button`);
  // The row's menu from the keys: WebKit's phone emulation sends a right
  // click's menu to the row above the one clicked.
  const menuOf = async (el) => {
    // A tab folds into the phone's one top bar (2026-11-14): its menu is the
    // pane's ⋯ › "Ações da aba…", what a long press on the tab opened.
    if (!(await el.isVisible()) && (await el.evaluate((e) => e.classList.contains("tab")))) {
      await page.locator(".pane.focused .pane-fold").click();
      await page.locator(".menu:not([hidden])").getByRole("menuitem", { name: "Ações da aba…" }).click();
      return;
    }
    await el.focus();
    await page.keyboard.press("Shift+F10");
  };
  await menuOf(row("01 - Guia de Markdown e Sintaxe.md"));
  const menu = page.locator(".menu:not([hidden])");
  await menu.getByRole("menuitem", { name: "Organizar", exact: true }).click();
  await menu.getByRole("menuitem", { name: "Selecionar" }).click();
  await expect(page.locator("#notes.select-mode")).toHaveCount(1);
  await expect(row("01 - Guia de Markdown e Sintaxe.md")).toHaveAttribute("aria-selected", "true");
  await row("03 - Propriedades e Metadados.md").click();
  await expect(row("03 - Propriedades e Metadados.md")).toHaveAttribute("aria-selected", "true");
  const bar = page.locator(".select-bar");
  await expect(bar).toBeVisible();
  await expect(bar).toContainText("2");
  // A tap in the mode chooses, and opens nothing.
  await expect(page.locator(".tab")).toHaveCount(0);
  for (const b of await bar.locator("button:visible").all()) expect(Math.round((await b.boundingBox()).height)).toBeGreaterThanOrEqual(44);
  await bar.getByRole("button", { name: "Concluir" }).click();
  await expect(bar).toBeHidden();
  await expect(page.locator("#notes.select-mode")).toHaveCount(0);
  // A tap opens a preview tab; "Keep open" in its menu keeps it. The bar
  // leaving gives the list its height back and the rows settle (the scroll
  // clamps): a press and a lift on two different rows make no click, as
  // seen in WebKit on 1 run of 45. Click once the row stands still.
  await row("02 - Links, Âncoras e Notas Incorporadas.md").scrollIntoViewIfNeeded();
  await row("02 - Links, Âncoras e Notas Incorporadas.md").evaluate(
    (el) =>
      new Promise((done) => {
        let last = "";
        let still = 0;
        const look = () => {
          const r = el.getBoundingClientRect();
          const now = `${r.top}/${r.left}/${r.height}`;
          still = now === last ? still + 1 : 0;
          last = now;
          if (still >= 10) done(undefined);
          else requestAnimationFrame(look);
        };
        look();
      }),
  );
  await row("02 - Links, Âncoras e Notas Incorporadas.md").click();
  await expect(page.locator(".tab.preview")).toHaveCount(1);
  await menuOf(page.locator(".tab.preview"));
  await menu.getByRole("menuitem", { name: "Manter aberta" }).click();
  await expect(page.locator(".tab.preview")).toHaveCount(0);
  // "Open" in a note's menu opens it without the preview.
  await tree(app);
  await menuOf(row("15 - Visualização de Grafo e Conexões.md"));
  await menu.getByRole("menuitem", { name: "Abrir", exact: true }).click();
  await expect(page.locator(".tab", { hasText: "15 - Visualização" })).toHaveCount(1);
  await expect(page.locator(".tab.preview")).toHaveCount(0);
});

test("no action only by a gesture: on a touch screen a visible … beside the row in front opens its menu @layout", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("03 - Propriedades");
  await tree(app);
  const more = page.locator(".row-more");
  const hoverless = await page.evaluate(() => matchMedia("(hover: none)").matches);
  if (!hoverless) {
    await expect(more).toBeHidden();
    return;
  }
  await expect(more).toBeVisible();
  await expect(more).toHaveAttribute("aria-label", "Mais ações: 03 - Propriedades e Metadados.md");
  expect(Math.round((await more.boundingBox()).width)).toBeGreaterThanOrEqual(44);
  await more.click();
  await expect(page.locator(".menu:not([hidden])").getByRole("menuitem", { name: "Renomear" })).toBeVisible();
});

test("targets and words: rows of 44 px on a phone, 40 on a tablet; no text under 12 px on a touch screen @layout", async ({ app, page }) => {
  await app.open();
  await tree(app);
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  const row = page.locator("#notes li[data-path] > button").first();
  const height = (await row.boundingBox()).height;
  if (phone(page)) expect(Math.round(height)).toBeGreaterThanOrEqual(44);
  else if (coarse) expect(Math.round(height)).toBeGreaterThanOrEqual(40);
  if (!coarse) return;
  const sizes = await page.evaluate(() =>
    [".side-title", ".status-bar", ".bottom-bar-label"]
      .map((s) => document.querySelector(s))
      .filter((e) => e && e.getClientRects().length > 0)
      .map((e) => parseFloat(getComputedStyle(e).fontSize)),
  );
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(12);
});

test("the on-screen keyboard: the menus, the / menu and the cursor stay above it @layout", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Teclado.md", `${Array.from({ length: 120 }, (_, i) => `Linha ${i + 1}`).join("\n")}\n`);
  await app.folderChanged(["Teclado.md"], true);
  await app.quickOpen("Teclado");
  await app.key("Mod+e");
  await page.locator(".pane.focused .cm-content").first().click();
  // A keyboard of 300 px, as iOS opens one: the window keeps its height,
  // only what the screen shows of it (the visual viewport) shrinks. The
  // harness cannot open the system's keyboard; it stands in for it here.
  const shown = await page.evaluate(() => {
    const height = innerHeight - 300;
    const fake = { offsetLeft: 0, offsetTop: 0, width: innerWidth, height, scale: 1, addEventListener() {}, removeEventListener() {} };
    Object.defineProperty(window, "visualViewport", { configurable: true, value: fake });
    // What the window hears when the keyboard opens.
    dispatchEvent(new Event("resize"));
    return height;
  });
  await page.keyboard.press("ControlOrMeta+End");
  const caret = () => page.evaluate(() => getSelection()?.getRangeAt(0).getBoundingClientRect().bottom ?? Infinity);
  await expect.poll(caret).toBeLessThanOrEqual(shown);
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  const slash = page.locator(".slash:not([hidden])");
  await expect(slash).toBeVisible();
  const s = await slash.boundingBox();
  expect(s.y + s.height).toBeLessThanOrEqual(shown);
  await page.keyboard.press("Escape");
  // The tab's menu: by its tab, or on a phone through the pane's ⋯ (the tabs fold into the one top bar).
  const front = page.locator('.pane.focused .tab[aria-selected="true"]');
  if (await front.isVisible()) await front.click({ button: "right" });
  else {
    await page.locator(".pane.focused .pane-fold").click();
    await page.locator(".menu:not([hidden])").getByRole("menuitem", { name: "Ações da aba…" }).click();
  }
  const menu = await page.locator(".menu:not([hidden])").boundingBox();
  expect(menu.y + menu.height).toBeLessThanOrEqual(shown);
  await page.keyboard.press("Escape");
});

test("a failure: at the top of the pane on a phone, where the status bar has gone @layout", async ({ app, page }) => {
  await app.open();
  await page.evaluate(() => dispatchEvent(new CustomEvent("verso:failed", { detail: "Nada gravado: o disco recusou." })));
  const line = page.locator(".failed-line");
  if (!phone(page)) {
    await expect(line).toBeHidden();
    return;
  }
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("role", "alert");
  await expect(line).toContainText("Nada gravado");
  const box = await line.boundingBox();
  expect(box.y).toBeLessThan(80);
  await line.getByRole("button", { name: "Dispensar" }).click();
  await expect(line).toBeHidden();
});

test("line numbers in Source: a desktop's default, off on a phone unless the person turned them on @layout", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("01 - Guia");
  await app.command("Fonte");
  const gutter = page.locator(".pane.focused .cm-lineNumbers");
  if (!phone(page)) {
    await expect(gutter.first()).toBeVisible();
    return;
  }
  await expect(gutter).toHaveCount(0);
  // Turned off and on again in the settings: the person's choice, kept on
  // a phone too.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
    localStorage.setItem("verso.settings", JSON.stringify({ ...raw, lineNumbersSource: true, lineNumbersSourceChosen: true }));
  });
  await page.reload();
  await page.waitForFunction(() => window.__harness?.ready === true);
  await app.quickOpen("01 - Guia");
  await app.command("Fonte");
  await expect(gutter.first()).toBeVisible();
});

test("the settings on a phone: a list of the groups, a page after a tap, a way back; opened straight to a section it shows the page @layout", async ({ app, page }) => {
  await app.open();
  // A folder that syncs: its state, wherever the window shows it, opens
  // the settings straight to Sincronizar.
  const off = await page.evaluate(() => window.__harness.core.sync);
  await app.emit("sync-status", { ...off, on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "owner", state: "synced" });
  await page.locator("#sync-state").evaluate((b) => b.click());
  const back = page.locator(".settings-back");
  if ((page.viewportSize()?.width ?? 1500) > 760) {
    await expect(page.locator('.settings-nav-item[aria-current="true"]')).toHaveText("Sincronizar");
    await expect(back).toBeHidden();
    return;
  }
  // Straight to the page: its title, the way back, no row of tabs.
  await expect(page.locator(".settings-title")).toHaveText("Sincronizar");
  await expect(page.locator(".settings-nav")).toBeHidden();
  await expect(back).toBeVisible();
  expect((await back.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await back.click();
  // The list: every group named, every page a row of 44 px or more, the page not shown.
  await expect(page.locator(".settings-body")).toBeHidden();
  await expect(page.locator(".settings-nav-group-header")).not.toHaveCount(0);
  const rows = page.locator(".settings-nav-item");
  for (const h of await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(Math.round(h)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth)).toBe(true);
  // A tap opens the page; the search shows its results over the list.
  await rows.nth(1).click();
  await expect(page.locator(".settings-title")).toBeVisible();
  await back.click();
  await page.locator(".settings-search").fill("idioma");
  await expect(page.locator(".settings-body")).toBeVisible();
  await expect(page.locator(".settings-nav")).toBeHidden();
});

// Android keyboards (Gboard, Samsung) type through composition: the `[[` that
// opens the list of notes arrives as composing text the keyboard then
// commits, not as two key presses (the maintainer, 2026-10-15: on a phone
// nothing listed after `[[`). Chromium only: it is the engine that lets a
// test drive the input method.
for (const [title, steps] of [
  ["each bracket composed, then committed", [["[", "["], ["[", "["]]],
  ["both brackets composed as one word, then committed", [["[[", "[["]]],
  ["the second bracket still composing when the list is due", [["[", "["], ["[", null]]],
  ["a bracket committed by the next composition", [["[", null], ["[[", "[["]]],
]) {
  test(`\`[[\` typed through the keyboard's composition lists the notes: ${title} @layout`, async ({ app, page, browserName }) => {
    await app.open();
    // The input method is driven through the DevTools protocol: Chromium only.
    if (browserName !== "chromium") {
      test.info().annotations.push({ type: "skip", description: "the input method is driven through the DevTools protocol" });
      return;
    }
    await app.quickOpen("04 - Escrevendo");
    await app.key("Mod+e");
    const editor = page.locator(".pane.focused .cm-content").first();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    const cdp = await page.context().newCDPSession(page);
    for (const [composing, commit] of steps) {
      await cdp.send("Input.imeSetComposition", { text: composing, selectionStart: composing.length, selectionEnd: composing.length });
      if (commit !== null) await cdp.send("Input.insertText", { text: commit });
    }
    await expect.poll(() => editor.textContent()).toContain("[[");
    const tooltip = page.locator(".cm-tooltip-autocomplete");
    await expect(tooltip).toBeVisible();
    await expect(tooltip.getByRole("option").first()).toBeVisible();
    // Inside the screen, not under the keyboard or off its edge.
    const box = await tooltip.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(page.viewportSize().width);
    expect(Math.round(box.y + box.height)).toBeLessThanOrEqual(page.viewportSize().height);
  });
}

test("a phone with every drawer closed has no shadow on its edges and no empty tab row @layout", async ({ app, page }) => {
  await app.open();
  if ((page.viewportSize()?.width ?? 1500) > 760) test.skip(true, "phone only");
  await page.evaluate(() => document.body.classList.remove("side-open", "right-open"));
  for (const sel of ["aside.side", "aside.right"]) {
    expect(await page.locator(sel).evaluate((e) => getComputedStyle(e).boxShadow)).toBe("none");
  }
  if ((await page.locator(".pane .tab").count()) === 0) await expect(page.locator(".pane .tabs")).toBeHidden();
  if (process.env.PHONE_SHOTS) await page.screenshot({ path: `${process.env.PHONE_SHOTS}/closed-${process.env.SHOT_TAG ?? "after"}-390.png` });
});

test("a phone's one top bar: the name over its folder, the mode, ⋯, the tabs and the bell in one row of 44 px, each whole and inside the screen @layout", async ({ app, page }) => {
  await app.open();
  if ((page.viewportSize()?.width ?? 1500) > 760) test.skip(true, "phone only");
  await app.quickOpen("01 - Guia");
  const vw = page.viewportSize().width;
  const bar = await page.locator(".pane.focused .tabs").boundingBox();
  expect(bar.height).toBeGreaterThanOrEqual(44);
  expect(bar.height).toBeLessThanOrEqual(45);
  // The note's own row of folder and modes folds into the bar (2026-11-14).
  await expect(page.locator(".leaf:not([hidden]) .note-head")).toBeHidden();
  const parts = [".pane.focused .phone-title", ".pane.focused .phone-mode", ".pane.focused .pane-fold", ".pane.focused .phone-tabs", ".notify-bell-phone"];
  const boxes = [];
  for (const sel of parts) {
    const b = await page.locator(sel).first().boundingBox();
    expect(b, sel).not.toBeNull();
    expect(b.x, sel).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, sel).toBeLessThanOrEqual(vw + 1);
    expect(b.height, sel).toBeGreaterThanOrEqual(43.5);
    boxes.push(b);
  }
  // In that order, left to right, none over the next: the tabs at the thumb's end, by the bell.
  for (let i = 1; i < boxes.length; i++) expect(boxes[i - 1].x + boxes[i - 1].width, parts[i]).toBeLessThanOrEqual(boxes[i].x + 1);
  await expect(page.locator(".pane.focused .phone-title-name")).toContainText("01 - Guia");
  expect(await page.locator(".pane-fold").first().getAttribute("title")).toBeTruthy();
});

test("a phone's search: a 44 px field, a long name beside its icon, a title without .md, a snippet as plain text; the palette has no key hints @layout", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Um nome de arquivo muito longo para caber numa gaveta de celular inteira.md", "---\ntitle: Dragão\n---\n\nO **dragão** dorme no [[Porto]].\n");
  await tree(app);
  const search = page.locator("#search");
  await search.fill("dorme");
  const row = page.locator('#notes li[data-path^="Um nome de arquivo"] > button.row');
  await expect(row).toBeVisible();
  await expect(row.locator(".row-name")).not.toContainText(".md");
  const snippet = await row.locator(".snippet").innerText();
  expect(snippet).not.toMatch(/\*\*|title:|---|\[\[/);
  await expect(row.locator(".snippet mark")).toHaveCount(1);
  const icon = await row.locator(".icon").first().boundingBox();
  const label = await row.locator(".row-name").boundingBox();
  expect(Math.abs(icon.y + icon.height / 2 - (label.y + label.height / 2))).toBeLessThan(12);
  if (phone(page)) expect((await search.boundingBox()).height).toBeGreaterThanOrEqual(43);
  await search.fill("");
  await app.key("Mod+Shift+p");
  await expect(page.locator(".palette .quick-list li").first()).toBeVisible();
  await expect(page.locator(".palette .quick-list kbd")).toHaveCount(phone(page) ? 0 : await page.locator(".palette .quick-list kbd").count());
  if (phone(page)) await expect(page.locator(".palette .quick-list li", { hasText: /console/i })).toHaveCount(0);
});
