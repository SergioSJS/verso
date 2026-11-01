// The right panel's tabs hidden, reordered and brought back (ADR 0072's
// amendment of 2026-11-01; the maintainer: "bom mas deveria ser possível
// esconder e reordenar e reaparecer abas"). A tab is hidden from its menu
// (the right click, or the long press that makes one: touch.ts) and comes
// back from the "⋯" menu, from "Restaurar abas" and from Settings ›
// Aparência, where every tab has a switch and up/down; the order and the
// hidden set are kept after a reload; the last tab cannot be hidden; a
// hidden tab shows while it is the chosen one (the mini-player's name
// opens Music) and the Table's sound still shows in the status bar. The
// bar's drag and Alt+arrows are right-tabs.spec.mjs's. Screenshots for the
// maintainer go to /logs/shots/tabs when the tests run in the Docker e2e.

import { existsSync, mkdirSync } from "node:fs";

import { test, expect } from "./fixtures.mjs";

const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;
/** The panel is a drawer (a phone, a tablet) where the ribbon-less bar has a button for it. */
const drawer = (page) => page.locator(".bar-right").isVisible();
async function showPanel(page) {
  if (await drawer(page)) {
    if (!(await page.locator("body.right-open").count())) await page.locator(".bar-right").click();
  } else {
    // On a wide window the panel is widened so that every tab fits; a tablet keeps its own width.
    const wide = (page.viewportSize()?.width ?? 1500) >= 1000;
    await page.evaluate((wide) => {
      document.body.classList.remove("no-right");
      if (wide) document.documentElement.style.setProperty("--right-w", "700px");
    }, wide);
  }
}
const SHOTS = "/logs/shots/tabs";
async function shot(page, name, info) {
  if (!existsSync("/logs")) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${info.project.name}.png` });
}

async function openPanel(app, page) {
  await app.open("?vault=empty&table=owner");
  await showPanel(page);
  await expect(page.locator("#right-tabs")).toBeVisible();
  // The bar is measured once the panel has its room.
  await expect.poll(async () => (await onBar(page)).length).toBeGreaterThan(2);
}

/** The tabs in the bar (not folded into the "⋯", not hidden), left to right. */
const onBar = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#right-tabs > button[role="tab"]')]
      .filter((b) => !b.hidden && !b.hasAttribute("data-gone") && !b.hasAttribute("data-overflow"))
      .map((b) => b.dataset.tab),
  );
/** Every tab the person has not hidden, in order, folded or not. */
const unhidden = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#right-tabs > button[role="tab"]')]
      .filter((b) => !b.hidden && !b.hasAttribute("data-gone"))
      .map((b) => b.dataset.tab),
  );
const saved = (page) => page.evaluate(() => ({ order: localStorage.getItem("verso.rightTabOrder"), off: localStorage.getItem("verso.rightTabsOff") }));
const menu = (page) => page.locator(".menu:not([hidden])");
const more = (page) => page.getByRole("button", { name: "Mais abas do painel" });
const tab = (page, id) => page.locator(`#right-tabs [data-tab="${id}"]`);

/** A tab in the bar that is not the chosen one. */
async function aSpare(page) {
  const chosen = await page.locator('#right-tabs [role="tab"][aria-selected="true"]').getAttribute("data-tab");
  const bar = (await onBar(page)).filter((x) => x !== chosen);
  // On a phone the bar holds the chosen tab and the game's two: any is hidden alike.
  const id = bar.find((x) => x !== "table" && x !== "music") ?? bar[0];
  expect(id).toBeTruthy();
  return id;
}

async function settingsTabs(app, page) {
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  const group = page.getByRole("group", { name: "Abas do painel direito" });
  await group.scrollIntoViewIfNeeded();
  await expect(group).toBeVisible();
  return group;
}

test("a tab is hidden from its menu, comes back from the ⋯ menu, and the choice is kept after a reload @layout", async ({ app, page }, info) => {
  await openPanel(app, page);
  const id = await aSpare(page);
  const before = await unhidden(page);
  await tab(page, id).click({ button: "right" });
  await expect(menu(page).getByRole("menuitem", { name: "Ocultar esta aba" })).toBeVisible();
  await shot(page, "menu", info);
  await menu(page).getByRole("menuitem", { name: "Ocultar esta aba" }).click();
  await expect(tab(page, id)).toBeHidden();
  expect(await unhidden(page)).toEqual(before.filter((x) => x !== id));
  await expect(page.locator("#status")).toContainText("oculta");
  // The ⋯ is now the way back, even when everything else fits.
  await expect(more(page)).toBeVisible();
  await more(page).click();
  const back = menu(page).getByRole("menuitem", { name: /^Mostrar “/ });
  await expect(back).toHaveCount(1);
  await shot(page, "more-with-hidden", info);
  await page.keyboard.press("Escape");
  // Kept after a reload.
  expect((await saved(page)).off).toContain(id);
  await page.reload();
  await page.waitForFunction(() => window.__harness?.ready === true);
  await showPanel(page);
  await expect(tab(page, id)).toBeHidden();
  await more(page).click();
  await menu(page).getByRole("menuitem", { name: /^Mostrar “/ }).click();
  await expect(tab(page, id)).toBeVisible();
  await expect(tab(page, id)).toHaveAttribute("aria-selected", "true");
  expect((await saved(page)).off).not.toContain(id);
});

test("Restaurar abas brings every tab back in the default order @layout", async ({ app, page }) => {
  await openPanel(app, page);
  const before = await unhidden(page);
  const id = await aSpare(page);
  await tab(page, id).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Ocultar esta aba" }).click();
  await tab(page, await aSpare(page)).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Mover para a esquerda" }).or(menu(page).getByRole("menuitem", { name: "Mover para a direita" })).first().click();
  await more(page).click();
  await menu(page).getByRole("menuitem", { name: "Restaurar abas" }).click();
  expect(await unhidden(page)).toEqual(before);
  expect(JSON.parse((await saved(page)).off)).toEqual([]);
  expect((await unhidden(page)).slice(0, 3)).toEqual(["outline", "backlinks", "tags"]);
});

test("hiding the chosen tab hands the choice to its neighbour, and the last tab cannot be hidden", async ({ app, page }) => {
  test.skip((page.viewportSize()?.width ?? 1500) < 1000, "the bar folds on a phone and a tablet: the tabs are hidden one by one on the desktop");
  await openPanel(app, page);
  expect((await onBar(page)).length).toBe((await unhidden(page)).length);
  await tab(page, "outline").click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Ocultar esta aba" }).click();
  // The neighbour is chosen; the hidden tab is gone from the bar.
  await expect(tab(page, "outline")).toBeHidden();
  await expect(page.locator('#right-tabs [aria-selected="true"]')).toHaveAttribute("data-tab", "backlinks");
  // Hide the others until one is left.
  for (;;) {
    const ids = await unhidden(page);
    if (ids.length === 1) break;
    await tab(page, ids[0]).click({ button: "right" });
    await menu(page).getByRole("menuitem", { name: "Ocultar esta aba" }).click();
  }
  const [last] = await unhidden(page);
  await tab(page, last).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Ocultar esta aba" }).click();
  await expect(page.locator("#status")).toHaveText("A última aba não pode ser ocultada.");
  await expect(tab(page, last)).toBeVisible();
});

test("Settings lists every tab with a switch and up/down: hide, reorder, bring back; kept after a reload @layout", async ({ app, page }, info) => {
  await openPanel(app, page);
  const group = await settingsTabs(app, page);
  await shot(page, "settings", info);
  const rows = group.locator(".tabs-settings-row");
  const names = await rows.locator(".tabs-settings-name").allTextContents();
  expect(names.length).toBeGreaterThanOrEqual(6);
  // Every switch on; the bar has them all (folded or not).
  const total = (await unhidden(page)).length;
  expect(total).toBe(names.length);
  // The first moves down one place: the order in the bar follows.
  const firstId = await rows.nth(0).getAttribute("data-tab");
  await rows.nth(0).getByRole("button", { name: /^Mover .* para baixo$/ }).click();
  await expect(rows.nth(1)).toHaveAttribute("data-tab", firstId);
  expect((await unhidden(page)).indexOf(firstId)).toBe(1);
  // The pressed button keeps the focus (or its twin, at the end).
  await expect(group.locator(":focus")).toHaveCount(1);
  // The one now first is hidden from its switch.
  const secondId = await rows.nth(0).getAttribute("data-tab");
  await rows.nth(0).getByRole("checkbox").uncheck();
  await expect(group.locator(`.tabs-settings-row[data-tab="${secondId}"] input`)).not.toBeChecked();
  expect(await unhidden(page)).not.toContain(secondId);
  // A reload keeps both.
  await page.reload();
  await page.waitForFunction(() => window.__harness?.ready === true);
  const again = await settingsTabs(app, page);
  const rows2 = again.locator(".tabs-settings-row");
  await expect(rows2.nth(1)).toHaveAttribute("data-tab", firstId);
  await expect(again.locator(`.tabs-settings-row[data-tab="${secondId}"] input`)).not.toBeChecked();
  // The sure way back: switch it on again.
  await again.locator(`.tabs-settings-row[data-tab="${secondId}"] input`).check();
  expect(await unhidden(page)).toContain(secondId);
  await again.getByRole("button", { name: "Restaurar abas" }).click();
  await expect(rows2.first()).toHaveAttribute("data-tab", "outline");
  expect(await unhidden(page)).toContain(secondId);
});

test("a mouse drag along the bar reorders, with the dragged tab lifted; a hidden tab keeps its place", async ({ app, page }, info) => {
  test.skip((page.viewportSize()?.width ?? 1500) < 1000, "a finger scrolls and long-presses: the drag is the mouse's");
  await openPanel(app, page);
  // Hide Tags: the tab after it takes its place in the drag, which skips the hidden one.
  await tab(page, "tags").click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Ocultar esta aba" }).click();
  const a = await tab(page, "outline").boundingBox();
  const b = await tab(page, "bookmarks").boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 3 });
  await page.mouse.move(b.x + b.width - 4, b.y + b.height / 2, { steps: 8 });
  await expect(tab(page, "outline")).toHaveClass(/dragging/);
  await shot(page, "drag", info);
  await page.mouse.up();
  const order = await unhidden(page);
  expect(order.slice(0, 3)).toEqual(["backlinks", "bookmarks", "outline"]);
  // Tags is still hidden, and still between where it was.
  const all = JSON.parse((await saved(page)).order);
  expect(all.indexOf("tags")).toBeGreaterThan(all.indexOf("backlinks"));
});

/** A WAV of silence: what every engine of the tests decodes. */
function wav(seconds = 60) {
  const rate = 4000;
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write("data", 36);
  b.writeUInt32LE(n, 40);
  b.fill(128, 44);
  return b.toString("base64");
}

test("a hidden tab shows while it is the chosen one: the status bar keeps the sound and opens Music, and it goes again with the next tab", async ({ app, page }, info) => {
  test.skip((page.viewportSize()?.width ?? 1500) < 1000, "the status bar is the desktop's");
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
  });
  app.expectFault(/request failed: \/__vault\/Música\//);
  await app.open("?vault=empty");
  await page.evaluate(
    ([b64]) => {
      const h = window.__harness;
      for (const name of ["taverna", "estrada"]) h.core.handlers.create_file({ path: `Música/${name}.wav`, base64: b64 });
      h.table.role = "owner";
      h.table.up = true;
    },
    [wav()],
  );
  await app.folderChanged(["Música/taverna.wav", "Música/estrada.wav"], true);
  await showPanel(page);
  await expect(tab(page, "music")).toBeVisible();
  // Hide the Table's and the Music's tabs.
  for (const id of ["music", "table"]) {
    await tab(page, id).click({ button: "right" });
    await menu(page).getByRole("menuitem", { name: "Ocultar esta aba" }).click();
    await expect(tab(page, id)).toBeHidden();
  }
  await page.evaluate(() => window.__harness.tableSound.masterPlays("Música/estrada.wav", { durationMs: 60000 }));
  // The sound is still heard of: the status bar names it, and opens the Music tab.
  const item = page.locator(".status-bar .status-sound");
  await expect(item).toBeVisible();
  await expect(item).toContainText("estrada");
  await item.click();
  await expect(page.locator(".music-view")).toBeVisible();
  await expect(tab(page, "music")).toBeVisible();
  await expect(tab(page, "music")).toHaveAttribute("aria-selected", "true");
  await shot(page, "hidden-tab-chosen", info);
  // Another tab chosen: it goes again, as the person left it.
  await tab(page, "outline").click();
  await expect(tab(page, "music")).toBeHidden();
  await more(page).click();
  await expect(menu(page).getByRole("menuitem", { name: /^Mostrar “Música”$/ })).toBeVisible();
});
