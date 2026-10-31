// A Markdown file opened without its folder (ADR 0114 item 29): the
// loose-files window draws no tree and no folder commands, its one way back
// is reachable by keyboard, a read-only reason is shown, a stale folder
// command is refused, a link to a sibling opens a tab of its own, and a
// link to nothing says so. The bar above the tabs is the window's top row:
// clear of the window's buttons (`&frame=mac|windows`), on one line from
// 360 px up; the note shows no lone "/" crumb and no empty properties, and
// the status bar nothing one file cannot use. `?loose=1` (src/harness.ts)
// stands for the window the host makes for a double-clicked `.md`.

import { test, expect } from "./fixtures.mjs";

test("the loose window shows the file alone, with no tree and no folder tools", async ({ app, page }) => {
  await app.open("?loose=1");
  await expect(page.locator("html")).toHaveClass(/loose/);
  await expect(page.locator(".tab", { hasText: "Lista de compras" })).toBeVisible();
  await expect(page.locator(".loose-bar .loose-name")).toHaveText("Lista de compras.md");
  await expect(page.locator(".loose-bar .loose-place")).toHaveText("em Downloads");
  // No tree, no ribbon, no search box, no "new note" key.
  await expect(page.locator(".side")).toBeHidden();
  await expect(page.locator("#ribbon")).toBeHidden();
  await expect(page.locator('.status-keys [data-cmd="new"]')).toBeHidden();
  // The capabilities say what the side cannot: the classes are on the page.
  for (const c of ["index", "search", "backlinks", "create", "trash", "sync", "table", "board"]) await expect(page.locator("html")).toHaveClass(new RegExp(`cannot-${c}`));
  // The right panel keeps the outline only.
  await page.locator("#toggle-right").click();
  await expect(page.locator('.right-tabs [data-tab="outline"]')).toBeVisible();
  for (const tab of ["backlinks", "tags", "bookmarks", "focuses", "calendar"]) await expect(page.locator(`.right-tabs [data-tab="${tab}"]`)).toBeHidden();
  // The one way back is a button, reachable by keyboard, its name the folder's.
  const back = page.getByRole("button", { name: "Abrir a pasta inteira “Downloads” no Verso" });
  await expect(back).toBeVisible();
  await back.focus();
  await expect(back).toBeFocused();
  await page.keyboard.press("Enter");
  // A confirmation that names the folder; "Abrir a pasta" asks the host.
  await expect(page.getByText("Abrir a pasta “Downloads” no Verso?")).toBeVisible();
  await page.getByRole("button", { name: "Abrir a pasta", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__harnessOpenedFolder)).toEqual({ name: "Lista de compras.md", known: false });
});

test("a stale folder command is refused in words, and the file is edited and saved by its name", async ({ app, page }) => {
  await app.open("?loose=1");
  // The palette lists no "new note"; a folder command typed anyway is
  // refused by the side, not silently.
  await app.key("Mod+Shift+p");
  await page.keyboard.type("Nova nota");
  await expect(page.locator(".quick.palette:not([hidden]) .quick-list li")).toHaveCount(0);
  await page.keyboard.press("Escape");
  const refused = await page.evaluate(async () => {
    const r = await window.__harness.invoke("list_notes", {}).catch((e) => e);
    return r?.kind ?? "ok";
  });
  expect(refused).toBe("refused");
  // Edited and saved under its own name: the file in memory changes.
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await app.key("Mod+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- leite");
  await expect.poll(() => app.file("Lista de compras.md"), { timeout: 15_000 }).toContain("- leite");
});

test("a link opens a sibling note as a tab of its own; a link to nothing says so", async ({ app, page }) => {
  await app.open("?loose=1");
  await page.getByRole("button", { name: "Leitura", exact: true }).click().catch(() => {});
  await page.locator('.preview a.wikilink[data-target="Vizinha"]').click();
  await expect(page.locator(".tab", { hasText: "Vizinha" })).toBeVisible();
  await expect(page.locator(".loose-bar .loose-name")).toHaveText("Vizinha.md");
  // Back to the first tab: its link to nothing.
  await page.locator(".tab", { hasText: "Lista de compras" }).click();
  await page.locator('.preview a.wikilink[data-target="Longe"]').click();
  await expect(page.locator("#status")).toHaveText("Não há nota com esse nome ao lado deste arquivo. Abra a pasta inteira para seguir links.");
  await expect(page.locator(".tab", { hasText: "Longe" })).toHaveCount(0);
});

test("a read-only reason is shown above the text and the editor is locked", async ({ app, page }) => {
  await app.open("?loose=1&ro=permissions");
  await expect(page.locator(".note-sheet .flags, .flags").first()).toContainText("Só leitura: o sistema não deixa gravar este arquivo");
  // The editor is locked: typing changes nothing on disk.
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await page.keyboard.type("zzz");
  await page.waitForTimeout(1500);
  expect(await app.file("Lista de compras.md")).not.toContain("zzz");
});

test("a file above the bound opens in Source, read only", async ({ app, page }) => {
  await app.open("?loose=1&ro=too_large");
  await expect(page.locator(".flags").first()).toContainText("passa de 8 MiB");
  await expect(page.locator(".cm-content").first()).toBeVisible();
  // Source, not Live Preview: the heading's marks stay in the text.
  await expect(page.locator(".cm-content").first()).toContainText("# Lista de compras");
});

test("a folder opened before that holds the file is offered as one button named after it", async ({ app, page }) => {
  await app.open("?loose=1&known=1");
  const known = page.getByRole("button", { name: "Abrir “Notas”, a pasta que você já abriu no Verso e que guarda este arquivo" });
  await expect(known).toHaveText("Abrir “Notas”");
  // Another folder than the file's own: the whole folder stays offered, by its own name.
  await expect(page.locator(".loose-open-folder")).toBeVisible();
  await expect(page.locator(".loose-open-folder")).toHaveAttribute("aria-label", "Abrir a pasta inteira “Downloads” no Verso");
  await known.click();
  await expect.poll(() => page.evaluate(() => window.__harnessOpenedFolder)).toEqual({ name: "Lista de compras.md", known: true });
});

/** Where the bar's parts sit, and whether any is cut off or wraps. */
function barLayout(page) {
  return page.evaluate(() => {
    const bar = document.querySelector(".loose-bar");
    const box = bar.getBoundingClientRect();
    const parts = [...bar.querySelectorAll(".loose-id, .loose-name, button")].filter((e) => e.checkVisibility());
    const first = bar.querySelector(".loose-id").getBoundingClientRect();
    const tabs = document.querySelector(".pane .tabs").getBoundingClientRect();
    return {
      top: box.top,
      height: box.height,
      firstLeft: first.left,
      overflow: bar.scrollWidth - bar.clientWidth,
      outside: parts.filter((e) => { const r = e.getBoundingClientRect(); return r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5; }).map((e) => e.className),
      lines: new Set(parts.map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2))).size,
      buttonsRight: Math.max(...[...bar.querySelectorAll("button")].filter((e) => e.checkVisibility()).map((e) => e.getBoundingClientRect().right)),
      buttons: [...bar.querySelectorAll("button")].filter((e) => e.checkVisibility()).map((e) => e.getBoundingClientRect().width),
      tabsTop: tabs.top,
      drag: bar.getAttribute("data-tauri-drag-region"),
      width: document.documentElement.clientWidth,
    };
  });
}

for (const width of [1280, 360])
  test(`mac at ${width}px: the bar is the top row, clear of the window's buttons, on one line`, async ({ app, page }) => {
    await page.setViewportSize({ width, height: 800 });
    await app.open("?loose=1&known=1&frame=mac");
    await expect(page.locator("body")).toHaveClass(/framed-mac/);
    // The system's three buttons take 78 px of the top-left corner (frame.ts).
    await expect.poll(async () => (await barLayout(page)).firstLeft).toBeGreaterThanOrEqual(78);
    const l = await barLayout(page);
    expect(l.top).toBe(0);
    expect(l.height).toBeGreaterThanOrEqual(37);
    expect(l.height).toBeLessThan(48);
    expect(l.overflow).toBeLessThanOrEqual(0);
    expect(l.outside).toEqual([]);
    expect(l.lines).toBe(1);
    // Both buttons in view, at least a pointer's target (24 px); the folder
    // opened before keeps its words, the whole folder's is its mark when narrow.
    expect(l.buttons).toHaveLength(2);
    for (const w of l.buttons) expect(w).toBeGreaterThanOrEqual(24);
    expect(l.buttons[0]).toBeGreaterThan(60);
    if (width >= 1280) await expect(page.locator(".loose-open-folder .loose-label")).toBeVisible();
    expect(l.buttonsRight).toBeLessThanOrEqual(l.width);
    // The tab bar beneath is below the row, not pushed down a second time.
    expect(l.tabsTop).toBeGreaterThanOrEqual(l.height - 1);
    expect(await page.locator(".pane .tabs").first().evaluate((e) => e.className)).not.toMatch(/frame-push-t/);
    // The bar drags the window; the strip that carries the row over the ribbon is gone with the ribbon.
    expect(l.drag).toBe("deep");
    await expect(page.locator(".frame-strip")).toBeHidden();
  });

test("windows: the bar keeps clear of the app's own buttons at the right and the menu button at the left", async ({ app, page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await app.open("?loose=1&known=1&frame=windows");
  await expect.poll(async () => (await barLayout(page)).buttonsRight).toBeLessThanOrEqual(900 - 138);
  const l = await barLayout(page);
  const menu = await page.locator(".frame-menu").boundingBox();
  expect(l.firstLeft).toBeGreaterThanOrEqual(menu.x + menu.width);
  expect(l.overflow).toBeLessThanOrEqual(0);
  expect(l.lines).toBe(1);
});

test("the note shows no crumb '/', no empty properties section, and the status bar only what one file can use", async ({ app, page }) => {
  await app.open("?loose=1");
  await expect(page.locator(".loose-bar .loose-name")).toHaveText("Lista de compras.md");
  // The crumbs would say "/" alone: the bar names the folder instead.
  await expect(page.locator(".crumbs").first()).toBeHidden();
  // The mode buttons stay where they were.
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
  // A file without front matter: no properties header, rows or count.
  await expect(page.locator(".props-header")).toHaveCount(0);
  await expect(page.locator(".props .prop")).toHaveCount(0);
  // The status bar: the words, the palette and the right panel; no history
  // (the side keeps none), no split (one pane), no new note, no workspace.
  await expect(page.locator("#words")).toContainText("palavras");
  for (const sel of [".status-history", '.status-keys [data-cmd="split"]', '.status-keys [data-cmd="new"]', '.status-keys [data-cmd="space"]']) await expect(page.locator(sel)).toBeHidden();
  await expect(page.locator('.status-keys [data-cmd="palette"]')).toBeVisible();
  await expect(page.locator("#toggle-right")).toBeVisible();
  // Nor in the palette.
  await app.key("Mod+Shift+p");
  await page.keyboard.type("Dividir");
  await expect(page.locator(".quick.palette:not([hidden]) .quick-list li")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await app.key("Mod+Shift+p");
  await page.keyboard.type("Histórico");
  await expect(page.locator(".quick.palette:not([hidden]) .quick-list li")).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("a narrow window's bottom bar keeps the palette and the panel, not the folder's verbs", async ({ app, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await app.open("?loose=1");
  await expect(page.locator(".bottom-bar")).toBeVisible();
  for (const sel of [".bar-files", ".bar-search", ".bar-new"]) await expect(page.locator(`.bottom-bar ${sel}`)).toBeHidden();
  await expect(page.locator(".bottom-bar .bar-commands")).toBeEnabled();
  await expect(page.locator(".bottom-bar .bar-right")).toBeVisible();
  // The bar above the tabs still fits on one line.
  const l = await barLayout(page);
  expect(l.overflow).toBeLessThanOrEqual(0);
  expect(l.lines).toBe(1);
});

test("the bar's buttons are reached by Tab, with a visible focus, and the bar is a named region", async ({ app, page }) => {
  await app.open("?loose=1&known=1");
  const region = page.getByRole("region", { name: "Arquivo avulso" });
  await expect(region).toContainText("Lista de compras.md");
  await expect(region).toContainText("em Downloads");
  const known = region.getByRole("button", { name: /^Abrir “Notas”/ });
  await known.focus();
  await page.keyboard.press("Tab");
  const whole = region.getByRole("button", { name: /^Abrir a pasta inteira/ });
  await expect(whole).toBeFocused();
  const outline = await whole.evaluate((e) => getComputedStyle(e).outlineStyle);
  expect(outline).not.toBe("none");
});

test("a folded properties header says how many it holds", async ({ app, page }) => {
  await page.addInitScript(() => localStorage.setItem("verso.props.collapsed", "true"));
  await app.open("?vault=empty");
  await app.writeOutside("projetos.md", "---\norder:\n  - a.md\n---\n# projetos\n");
  await app.folderChanged(["projetos.md"], true);
  await app.quickOpen("projetos");
  const toggle = page.locator(".props-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle.locator(".props-count")).toHaveText("1");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle.locator(".props-count")).toBeHidden();
  await expect(page.locator(".props .prop")).toHaveCount(1);
});
