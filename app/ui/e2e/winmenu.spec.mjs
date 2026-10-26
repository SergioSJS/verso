// The menu of Windows and Linux (ADR 0072, decided 2026-10-22): a button in
// the window's top-left corner opening the Mac bar's menus as submenus, from
// the host's spec, running the palette's own commands. The harness forces
// the frame with ?frame=windows; without a frame there is no button.

import { mkdirSync } from "node:fs";
import { test, expect } from "./fixtures.mjs";

const SHOTS = `${process.env.HOME}/.cache/winmenu-shots`;
mkdirSync(SHOTS, { recursive: true });

const MENUS_PT = ["Arquivo", "Edição", "Visualização", "Ir", "RPG", "Janela", "Ajuda"];
const MENUS_EN = ["File", "Edit", "View", "Go", "RPG", "Window", "Help"];

const button = (page) => page.getByRole("button", { name: "Menu", exact: true });
const names = (list) => list.getByRole("menuitem").allTextContents();

test("the button is in the top-left corner, named Menu, and opens the menus as submenus", async ({ app, page }) => {
  // The keys' labels follow the platform (src/platform.ts): on the Mac host
  // they would read ⌘, where the Windows app reads Ctrl.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "platform", { get: () => "Win32" }));
  await app.open("?frame=windows");
  const b = button(page);
  await expect(b).toBeVisible();
  await expect(b).toHaveAttribute("aria-haspopup", "menu");
  await expect(b).toHaveAttribute("aria-expanded", "false");
  const box = await b.boundingBox();
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.y)).toBe(0);
  // The ribbon starts below it, as on the Mac.
  const ribbonTop = await page.locator("#ribbon").evaluate((el) => (el.firstElementChild ?? el).getBoundingClientRect().top);
  expect(ribbonTop).toBeGreaterThanOrEqual(box.height - 1);
  await b.click();
  await expect(b).toHaveAttribute("aria-expanded", "true");
  const top = page.getByRole("menu", { name: "Menu", exact: true });
  await expect(top).toBeVisible();
  expect((await names(top)).map((s) => s.trim())).toEqual(MENUS_PT);
  await page.screenshot({ path: `${SHOTS}/1-menus.png` });

  // File: the Mac's rows, the shortcut written for this machine, Settings and Quit at the end.
  await top.getByRole("menuitem", { name: "Arquivo" }).click();
  const file = page.getByRole("menu", { name: "Arquivo" });
  await expect(file).toBeVisible();
  const items = (await names(file)).map((s) => s.trim());
  expect(items[0]).toMatch(/^Nova nota\s*Ctrl\+N$/);
  expect(items.slice(-2)).toEqual(["Ajustes…Ctrl+,", "Encerrar o Verso"]);
  await expect(file.getByRole("menuitem", { name: /^Abrir pasta…/ })).toContainText("Ctrl+O");
  await page.screenshot({ path: `${SHOTS}/2-file.png` });
  // Open Recent opens a third panel.
  await file.getByRole("menuitem", { name: "Abrir recente" }).hover();
  await expect(page.locator(".winmenu")).toHaveCount(3);
  await page.screenshot({ path: `${SHOTS}/3-recent.png` });
  await page.keyboard.press("Escape");
  await expect(page.locator(".winmenu")).toHaveCount(2);
});

test("an item runs the palette's own command; the menu closes and the focus goes back", async ({ app, page }) => {
  await app.open("?frame=windows");
  await button(page).click();
  await page.getByRole("menuitem", { name: "Ir", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Paleta de comandos…/ }).click();
  await expect(page.locator(".winmenu")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/4-ran.png` });
  await page.keyboard.press("Escape");

  // A command that makes something: New Note adds a tab.
  const tabs = await page.locator(".tabs .tab").count();
  await button(page).click();
  await page.getByRole("menuitem", { name: "Arquivo" }).click();
  await page.getByRole("menuitem", { name: /^Nova nota\b/ }).first().click();
  await expect.poll(() => page.locator(".tabs .tab").count()).toBeGreaterThan(tabs);
});

test("Alt alone opens the menu bar; the arrows walk it, Enter runs, Esc steps back", async ({ app, page }) => {
  await app.open("?frame=windows");
  await page.keyboard.down("Alt");
  await page.keyboard.up("Alt");
  const top = page.getByRole("menu", { name: "Menu", exact: true });
  await expect(top).toBeVisible();
  await expect(top.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(top.getByRole("menuitem", { name: "Edição" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(top.getByRole("menuitem", { name: "Ajuda" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const help = page.getByRole("menu", { name: "Ajuda" });
  await expect(help).toBeVisible();
  await expect(help.getByRole("menuitem", { disabled: false }).first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(top.getByRole("menuitem", { name: "Ajuda" })).toBeFocused();
  // Enter on a menu opens it, then on its item runs it.
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp");
  await expect(top.getByRole("menuitem", { name: "Ir", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  const go = page.getByRole("menu", { name: "Ir" });
  await expect(go).toBeVisible();
  for (let i = 0; i < 8 && !(await page.evaluate(() => document.activeElement?.textContent?.startsWith("Paleta de comandos"))); i++) await page.keyboard.press("ArrowDown");
  await expect(go.getByRole("menuitem", { name: /^Paleta de comandos…/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".winmenu")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Alt then a key is not a tap: the menu stays shut.
  await page.keyboard.down("Alt");
  await page.keyboard.press("z");
  await page.keyboard.up("Alt");
  await expect(page.locator(".winmenu")).toHaveCount(0);
  // Esc closes from the list of menus.
  await page.keyboard.down("Alt");
  await page.keyboard.up("Alt");
  await expect(top).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".winmenu")).toHaveCount(0);
});

test("Alt and a letter open that menu, in both languages", async ({ app, page }) => {
  await app.open("?frame=windows");
  // Portuguese: Arquivo A, Edição E, Visualização V, Ir I, RPG R, Janela J, Ajuda U.
  for (const [letter, menu] of [["a", "Arquivo"], ["e", "Edição"], ["v", "Visualização"], ["i", "Ir"], ["r", "RPG"], ["j", "Janela"], ["u", "Ajuda"]]) {
    await page.keyboard.press(`Alt+${letter}`);
    const list = page.getByRole("menu", { name: menu, exact: true });
    await expect(list, `Alt+${letter}`).toBeVisible();
    // The first row that can run has the focus.
    await expect(list.getByRole("menuitem", { disabled: false }).first()).toBeFocused();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.locator(".winmenu")).toHaveCount(0);
  }
  await page.addInitScript(() => localStorage.setItem("verso.settings", JSON.stringify({ lang: "en" })));
  await app.open("?frame=windows");
  await button(page).click();
  await expect(page.getByRole("menu", { name: "Menu", exact: true })).toBeVisible();
  expect((await names(page.getByRole("menu", { name: "Menu", exact: true }))).map((s) => s.trim())).toEqual(MENUS_EN);
  await page.keyboard.press("Escape");
  for (const [letter, menu] of [["f", "File"], ["e", "Edit"], ["v", "View"], ["g", "Go"], ["r", "RPG"], ["w", "Window"], ["h", "Help"]]) {
    await page.keyboard.press(`Alt+${letter}`);
    await expect(page.getByRole("menu", { name: menu, exact: true }), `Alt+${letter}`).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  }
  await page.keyboard.press("Alt+f");
  await page.screenshot({ path: `${SHOTS}/5-alt-f-en.png` });
});

test("a feature that is off has no row, and its settings stay; one that is on shows", async ({ app, page }) => {
  await page.addInitScript(() => localStorage.setItem("verso.settings", JSON.stringify({ features: { diceRolling: false, oracles: false, campaignBundles: false } })));
  await app.open("?frame=windows");
  await page.keyboard.press("Alt+r");
  const rpg = page.getByRole("menu", { name: "RPG", exact: true });
  await expect(rpg).toBeVisible();
  expect((await names(rpg)).map((s) => s.trim())).toEqual(["Ajustes de Dados e RPG…"]);
  await page.screenshot({ path: `${SHOTS}/6-rpg-off.png` });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await page.addInitScript(() => localStorage.setItem("verso.settings", JSON.stringify({ features: { diceRolling: true, oracles: true, campaignBundles: false } })));
  await app.open("?frame=windows");
  await page.keyboard.press("Alt+r");
  const on = page.getByRole("menu", { name: "RPG", exact: true });
  await expect(on).toBeVisible();
  expect((await names(on)).map((s) => s.trim())).toEqual(["Rolar dados…", "Perguntar ao oráculo", "Ajustes de Dados e RPG…"]);
  await page.screenshot({ path: `${SHOTS}/7-rpg-on.png` });
  // The item runs the palette's command.
  await on.getByRole("menuitem", { name: "Rolar dados…" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("a command that cannot run here is greyed, and a click on it does nothing", async ({ app, page }) => {
  await app.open("?frame=windows&vault=empty");
  await button(page).click();
  await page.getByRole("menuitem", { name: "Visualização" }).click();
  const edit = page.getByRole("menu", { name: "Visualização" });
  // No note is open: its reading and editing mode needs one.
  const insert = edit.getByRole("menuitem", { name: /^Alternar leitura/ });
  await expect(insert).toHaveAttribute("aria-disabled", "true");
  await insert.click({ force: true });
  await expect(edit).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/8-greyed.png` });
});

test("nothing sits under the button, side bars open or closed, panes split", async ({ app, page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await app.open("?frame=windows");
  const under = () =>
    page.evaluate(() => {
      const row = 2.45 * parseFloat(getComputedStyle(document.documentElement).fontSize);
      const btn = document.querySelector(".frame-menu").getBoundingClientRect();
      const hits = [];
      for (const bar of document.querySelectorAll(".ribbon, .side-head, .spaces, .tabs, .right-tabs")) {
        for (const child of bar.querySelectorAll("button, input, .tab")) {
          const r = child.getBoundingClientRect();
          if (!r.width || !r.height || !child.checkVisibility({ visibilityProperty: true })) continue;
          if (r.top < row && r.bottom > 0 && r.left < btn.right && r.right > btn.left) hits.push(`${bar.className} › ${child.className || child.tagName}`);
        }
      }
      return hits;
    });
  await expect.poll(under).toEqual([]);
  await app.key("Mod+\\");
  await expect.poll(under).toEqual([]);
  await page.locator("#toggle-side").click();
  await expect.poll(under).toEqual([]);
  await page.locator("#toggle-side").click();
  await app.key("Mod+t");
  await expect(page.locator(".spaces")).toBeVisible();
  await expect.poll(under).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/9-layout.png` });
});

test("without the windows frame — a browser, the Mac — there is no menu button", async ({ app, page }) => {
  await app.open();
  await expect(page.locator(".frame-menu")).toHaveCount(0);
  await page.keyboard.down("Alt");
  await page.keyboard.up("Alt");
  await expect(page.locator(".winmenu")).toHaveCount(0);
  await app.open("?frame=mac");
  await expect(page.locator(".frame-menu")).toHaveCount(0);
});
