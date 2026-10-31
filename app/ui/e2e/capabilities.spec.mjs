// What means nothing on the side the window talks to is absent (ADR 0076
// item 11; ADR 0027): the harness stands for a browser served by the
// server with `?side=server` (src/harness.ts) — no window of the app, no
// file manager, no full path, no terminal, no updates, no console, no
// child web views — and for a person who only reads the folder with
// `&role=reader`, a role the server may change while the window is open.

import { test, expect } from "./fixtures.mjs";

const row = (page, path) => page.locator(`#notes li[data-path="${path}"] > button`);
const NOTE = "03 - Propriedades e Metadados.md";

/** What the window copies, kept for the test: no permission asked. */
async function clipboard(page) {
  await page.addInitScript(() => {
    window.__copied = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => void window.__copied.push(t), write: async () => {} } });
  });
}

test("on a server: a browser's tab for a window, the note's address for its path, and no Finder", async ({ app, page }) => {
  await clipboard(page);
  await app.open("?side=server");
  const menu = page.locator(".menu:not([hidden])");
  await row(page, NOTE).click({ button: "right" });
  // The location group: here no window, the address instead of a path.
  await menu.getByRole("menuitem", { name: "Janela e localização", exact: true }).click();
  await expect(menu.getByRole("menuitem", { name: "Copiar caminho relativo" })).toBeVisible();
  for (const gone of ["Mostrar no Finder", "Abrir em nova janela", "Copiar caminho completo"]) await expect(menu.getByRole("menuitem", { name: gone })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Abrir numa nova aba do navegador" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Copiar link" }).click();
  await expect.poll(() => page.evaluate(() => window.__copied.at(-1))).toBe(`${new URL(page.url()).origin}/?folder=&note=${encodeURIComponent(NOTE)}`);
  await expect(page.locator("#status")).toHaveText("Link copiado.");
  // The tab's menu says the same.
  await app.quickOpen("03 - Propriedades");
  await page.locator('.tab[aria-selected="true"]').click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "Copiar link" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Abrir em nova janela" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Nova janela nesta pasta" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // No new window in the ribbon or the palette.
  await expect(page.locator('.ribbon-item[data-id="new-window"]')).toHaveCount(0);
  await app.key("Mod+Shift+p");
  await page.keyboard.type("Nova janela");
  await expect(page.locator(".quick.palette:not([hidden]) .quick-list li")).toHaveCount(0);
  await page.keyboard.press("Escape");
  // The settings: no terminal and agents, no console, no updates.
  await app.command("Ajustes");
  await expect(page.locator(".settings-nav-item:visible", { hasText: "Terminal e agentes" })).toHaveCount(0);
  await expect(page.locator(".setting:visible", { hasText: "Console do desenvolvedor" })).toHaveCount(0);
  await expect(page.locator(".setting:visible", { hasText: "Procurar atualizações" })).toHaveCount(0);
});

test("on a server: a web note shows its page in a frame without hint line when frameable", async ({ app, page }) => {
  await page.route("https://jsoncanvas.org/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>JSON Canvas</p>" }));
  await app.open("?side=server");
  await app.quickOpen("jsoncanvas.org");
  // The note has words of its own: it shows them first, the page a click away.
  await page.locator(".web-toggle").click();
  const framed = page.locator(".framed-page");
  await expect(framed).toBeVisible();
  await expect(framed.locator("iframe")).toHaveAttribute("src", "https://jsoncanvas.org/");
  await expect(framed.locator(".framed-line")).toHaveCount(0);
  expect(await app.calls("web_open")).toEqual([]);
});

test("a reader only reads: the editor, the tree's menus, the ribbon and the palette change nothing", async ({ app, page }) => {
  await app.open("?side=server&role=reader");
  // No banner: the closed lock beside the folder's name says it (2026-10-23).
  await expect(page.locator(".read-only-line")).toHaveCount(0);
  await expect(page.locator("#open .folder-lock")).toHaveAttribute("aria-label", "Você só lê esta pasta");
  await app.quickOpen("03 - Propriedades");
  const before = await app.file(NOTE);
  await app.key("Mod+e");
  const editor = page.locator(".pane.focused .cm-content").first();
  await expect(editor).toHaveAttribute("aria-readonly", "true");
  await editor.click();
  await page.keyboard.type("nada aqui");
  await page.waitForTimeout(300);
  expect(await app.file(NOTE)).toBe(before);
  await expect(page.locator(".pane.focused .pane-new")).toBeHidden();
  await expect(page.locator('.ribbon-item[data-id="new"]')).toHaveCount(0);
  const menu = page.locator(".menu:not([hidden])");
  await row(page, NOTE).click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Janela e localização", exact: true }).click();
  await expect(menu.getByRole("menuitem", { name: "Copiar caminho relativo" })).toBeVisible();
  for (const gone of ["Renomear", "Apagar", "Duplicar", "Nova nota nesta pasta", "Mover para…"]) await expect(menu.getByRole("menuitem", { name: gone })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // F2 on a row renames nothing.
  await row(page, NOTE).focus();
  await page.keyboard.press("F2");
  await expect(page.locator("#notes input")).toHaveCount(0);
  await app.key("Mod+Shift+p");
  await page.keyboard.type("Nova nota");
  await expect(page.locator(".quick.palette:not([hidden]) .quick-list li")).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("the role changes while the window is open: the window reads only, then writes again", async ({ app, page }) => {
  await app.open("?side=server");
  await expect(page.locator("#open .folder-lock")).toBeHidden();
  await app.quickOpen("03 - Propriedades");
  await app.key("Mod+e");
  const editor = page.locator(".pane.focused .cm-content").first();
  await expect(editor).not.toHaveAttribute("aria-readonly", "true");
  await page.evaluate(() => window.__harness.setRole("reader"));
  await expect(page.locator("#open .folder-lock")).toBeVisible();
  await expect(page.locator(".pane.focused .cm-content").first()).toHaveAttribute("aria-readonly", "true");
  await page.evaluate(() => window.__harness.setRole("editor"));
  await expect(page.locator("#open .folder-lock")).toBeHidden();
  await expect(page.locator(".pane.focused .cm-content").first()).not.toHaveAttribute("aria-readonly", "true");
});

test("the reader's lock fits a phone, in Portuguese @layout", async ({ app, page }) => {
  await app.open("?side=server&role=reader");
  const line = page.locator("#open .folder-lock");
  await expect(line).toBeVisible();
  const box = await line.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  if (page.viewportSize().width < 760) await expect(page.locator(".bottom-bar .bar-write")).toBeHidden();
});

// A phone of the desktop's local server (ADR 0096) is a window on a server:
// the host refuses what it asks that is the desktop's own, and logs a warning
// for each (item 12). It starts with the desktop's capabilities until the
// side answers, which is how it once asked for the status of the server it
// is a phone of, and told the host its focuses sync.
test("a window on a server does not run the desktop's own commands; the desktop's does", async ({ app }) => {
  await app.open();
  await app.quickOpen("03 - Propriedades");
  expect((await app.calls("local_server_status")).length).toBeGreaterThan(0);
  expect((await app.calls("set_sync_focuses")).length).toBeGreaterThan(0);
  await app.open("?side=server");
  await app.quickOpen("03 - Propriedades");
  expect(await app.calls("local_server_status")).toEqual([]);
  expect(await app.calls("set_sync_focuses")).toEqual([]);
});
