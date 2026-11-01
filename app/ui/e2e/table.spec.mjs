// The table (ADR 0107, phase 1): a panel of the right side area with one log
// of every roll this window makes and every roll it hears in a shared note,
// newest at the bottom; its switch; the unread count; "hide up to here";
// "add to note"; and the phone's sheet. Screenshots for reading by eye go to
// $HOME/.cache/table-shots (mounted by the runner), when the folder exists.

import { test, expect } from "./fixtures.mjs";
import { existsSync } from "node:fs";

const NOTE = "Mesa.md";
const TEXT = ["# Mesa", "", "Ataque: `dice: 1d20+3` e dano `dice: 2d6`.", "", "Encontro: `dice: [[Mesa#^encontros]]`", "", "| d6 | Encontro |", "| --- | --- |", "| 1–3 | [[Lobos]] |", "| 4–6 | Nada |", "", "^encontros", ""].join("\n");
const SYNCED = { key: "harness", on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "editor", state: "synced", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], log: [], last: "2026-10-11T12:00:00Z", message: null, problem: null, versions: null, revoked: null };
const SHOTS = `${process.env.HOME ?? "/root"}/.cache/table-shots`;

async function shot(page, name) {
  if (existsSync(SHOTS)) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** The Mesa tab of the right panel (not the tab of a note called Mesa). */
const mesaTab = (page) => page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ });

async function withSwitch(page, on) {
  await page.addInitScript((value) => {
    const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
    localStorage.setItem("verso.settings", JSON.stringify({ ...s, features: { ...(s.features ?? {}), table: value } }));
  }, on);
}

async function openNote(app) {
  await app.writeOutside(NOTE, TEXT);
  await app.writeOutside("Lobos.md", "# Lobos\n");
  await app.writeOutside("Diario.md", "# Diário\n\nTexto.\n");
  await app.folderChanged([NOTE, "Lobos.md", "Diario.md"], true);
  await app.quickOpen("Mesa");
}

/** The right panel open on its Mesa tab, on a desktop window. */
async function openTable(page) {
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await mesaTab(page).click();
  const view = page.locator(".table-view");
  await expect(view).toBeVisible();
  return view;
}

async function inRoom(app, page) {
  await page.evaluate(() => (window.__harness.rooms.up = true));
  await page.evaluate((st) => {
    window.__harness.core.handlers.folder_sync = () => st;
  }, SYNCED);
  await app.emit("sync-status", SYNCED);
}

test("a roll in a note is a line of the table: who, when, where, the dice and the total", async ({ app, page }) => {
  await app.open();
  await openNote(app);
  const view = await openTable(page);
  await expect(view.locator(".table-empty")).toBeVisible();
  await page.locator(".preview:visible").getByRole("button", { name: "Rolar 1d20+3" }).click();
  const line = view.locator(".table-entry").first();
  await expect(line).toBeVisible();
  await expect(line.locator(".table-who")).toHaveText("Você");
  await expect(line.locator(".table-time")).toHaveText(/^\d\d:\d\d:\d\d$/);
  await expect(line.locator(".table-where")).toHaveText("Mesa");
  await expect(line.locator(".table-notation")).toHaveText("1d20+3");
  const total = Number(await line.locator(".table-total").textContent());
  expect(total).toBeGreaterThanOrEqual(4);
  expect(total).toBeLessThanOrEqual(23);
  await expect(line.locator(".table-die")).toHaveCount(1);
  // Newest at the bottom; a table roll is its own kind, with the row.
  await page.locator(".preview:visible").getByRole("button", { name: "Rolar na tabela [[Mesa#^encontros]]" }).click();
  await expect(view.locator(".table-entry")).toHaveCount(2);
  const second = view.locator(".table-entry").nth(1);
  await expect(second).toHaveAttribute("data-kind", "table");
  await expect(second.locator(".table-row")).toHaveText(/^(Lobos|Nada)$/);
  // The palette's roller, with no note, is a line too.
  await app.command("Rolar dados");
  const field = page.getByRole("textbox", { name: "Notação, como 1d20+3" });
  await field.fill("2d6");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(view.locator(".table-entry")).toHaveCount(3);
  await expect(view.locator(".table-entry").nth(2).locator(".table-where")).toHaveText("Rolador");
  // The log is a list, named.
  await expect(view.getByRole("list", { name: "Rolagens da mesa" })).toBeVisible();
  await shot(page, "desktop-own");
  // The note itself was never written.
  expect(await app.file(NOTE)).toBe(TEXT);
  expect(await app.calls("write_note")).toHaveLength(0);
});

test("a roll on a board card is a line of the table", async ({ app, page }) => {
  const board = `{\n\t"nodes":[\n\t\t${JSON.stringify({ id: "t", type: "text", text: "Ataque: `dice: 1d20+5`", x: 0, y: 0, width: 420, height: 220 })}\n\t],\n\t"edges":[]\n}`;
  await app.open();
  await app.writeOutside("Quadro.canvas", board);
  await app.folderChanged(["Quadro.canvas"], true);
  await expect(page.locator("#notes")).toContainText("Quadro.canvas");
  await app.quickOpen("Quadro");
  await app.boardReady();
  const view = await openTable(page);
  const slot = page.locator('.board-card-slot[data-card="t"]');
  const die = slot.getByRole("button", { name: "Rolar 1d20+5" });
  await expect(die).toBeVisible();
  const box = await die.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const line = view.locator(".table-entry").first();
  await expect(line.locator(".table-notation")).toHaveText("1d20+5");
  await expect(line.locator(".table-where")).toHaveText("Quadro.canvas");
});

test("the Mesa switch off: no tab, no panel, and the dice still roll", async ({ app, page }) => {
  await withSwitch(page, false);
  await app.open();
  await openNote(app);
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await expect(page.locator("#right-tabs")).toBeVisible();
  await expect(mesaTab(page)).toBeHidden();
  await page.locator(".preview:visible").getByRole("button", { name: "Rolar 1d20+3" }).click();
  await expect(page.locator('.dice[data-dice="1d20+3"] .dice-total')).toHaveText(/^\d+$/);
  await expect(page.locator(".table-view")).toHaveCount(0);
});

test("the switch in Settings (Dice and RPG) shows and hides the tab at once, and the setting for others' dice is there", async ({ app, page }) => {
  await app.open();
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await expect(mesaTab(page)).toBeVisible();
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Dados e RPG" }).click();
  const body = page.locator(".settings-body");
  const row = body.locator(".setting", { has: page.locator(".setting-title", { hasText: /^Mesa$/ }) });
  await expect(row).toHaveCount(1);
  await expect(row.locator("input[type=checkbox]")).toBeChecked();
  await expect(body.locator(".setting-title", { hasText: "Mostrar em 3D as rolagens dos outros" })).toHaveCount(1);
  await row.locator(".switch, label").first().click();
  await expect(row.locator("input[type=checkbox]")).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(mesaTab(page)).toBeHidden();
  // And back on.
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Dados e RPG" }).click();
  await row.locator(".switch, label").first().click();
  await expect(row.locator("input[type=checkbox]")).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(mesaTab(page)).toBeVisible();
});

test("another person's roll in a shared note is a line with their name, said, counted while closed, and falls only when asked", async ({ app, page }) => {
  await app.open();
  await inRoom(app, page);
  await openNote(app);
  await page.locator(".preview:visible").getByRole("button", { name: "Rolar 1d20+3" }).click();
  await expect.poll(async () => (await app.calls("collab_roll")).length).toBe(1);
  // The panel is closed (the right side is hidden): Bia's roll is counted.
  await page.evaluate((n) => window.__harness.rooms.roll(n, "Bia", "1d20+3", null, [14]), NOTE);
  await expect(page.locator("body")).toHaveAttribute("data-table-unread", "1");
  await page.evaluate((n) => window.__harness.rooms.roll(n, "Bia", "4d6kh3", null, [3, 6, 1, 6]), NOTE);
  await expect(page.locator("body")).toHaveAttribute("data-table-unread", "2");
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.evaluate(() => window.dispatchEvent(new Event("verso:table-visibility")));
  const tab = mesaTab(page);
  await expect(tab).toHaveAccessibleName("Mesa, 2 novidades na mesa");
  await tab.click();
  const view = page.locator(".table-view");
  // Mine first (the room's own answer, "Ana" on the server, is "Você" here), then Bia's two.
  await expect(view.locator(".table-entry")).toHaveCount(3);
  const bia = view.locator('.table-entry[data-by="Bia"]');
  await expect(bia).toHaveCount(2);
  await expect(bia.first().locator(".table-who")).toHaveText("Bia");
  await expect(bia.first().locator(".table-total")).toHaveText("17");
  await expect(bia.nth(1).locator(".table-die.dropped")).toHaveCount(1);
  await expect(view.locator('.table-entry[data-by="Ana"] .table-who')).toHaveText("Você");
  // Seen: the count is gone.
  await expect(page.locator("body")).not.toHaveAttribute("data-table-unread", /.*/);
  // The panel's live region says the next one, with the name; the global one stays quiet.
  await page.evaluate((n) => window.__harness.rooms.roll(n, "Bia", "1d6", null, [4]), NOTE);
  await expect(view.locator(".table-said")).toHaveText("Bia rolou: 1d6: 4");
  await expect(page.locator(".dice-said")).not.toHaveText(/Bia rolou 1d6/);
  await shot(page, "desktop-room");
  // An oracle question by Bia is its own kind.
  await page.evaluate((n) => window.__harness.rooms.oracle(n, "Bia", { kind: "question", odds: [10, 30, 10, 10, 30, 10] }), NOTE);
  await expect(view.locator('.table-entry[data-kind="oracle"]')).toHaveCount(1);
  await expect(view.locator('.table-entry[data-kind="oracle"] .table-who')).toHaveText("Bia");
  await expect(view.locator('.table-entry[data-kind="oracle"] .table-label')).toHaveText("Pergunta ao oráculo");
});

test("the room's last rolls, held when this window joins, are on the table and not news", async ({ app, page }) => {
  await app.open();
  await inRoom(app, page);
  await app.writeOutside(NOTE, TEXT);
  await app.folderChanged([NOTE], true);
  // Bia rolled before this window opened the note.
  await page.evaluate((n) => window.__harness.rooms.roll(n, "Bia", "2d6", null, [2, 5]), NOTE);
  await app.quickOpen("Mesa");
  await expect(page.locator(".preview:visible").first()).toBeVisible();
  await expect(page.locator("body")).not.toHaveAttribute("data-table-unread", /.*/);
  const view = await openTable(page);
  await expect(view.locator('.table-entry[data-by="Bia"] .table-total')).toHaveText("7");
});

test("hide up to here hides only here, only what was there, and can be undone", async ({ app, page }) => {
  await app.open();
  await openNote(app);
  const view = await openTable(page);
  const roll = page.locator(".preview:visible").getByRole("button", { name: "Rolar 1d20+3" });
  await roll.click();
  await expect(view.locator(".table-entry")).toHaveCount(1);
  await view.getByRole("button", { name: "Ocultar daqui pra trás" }).click();
  await expect(view.locator(".table-entry")).toHaveCount(0);
  await expect(view.locator(".table-hidden")).toBeVisible();
  await page.waitForTimeout(30);
  await page.locator(".preview:visible").getByRole("button", { name: "Rolar de novo" }).click();
  await expect(view.locator(".table-entry")).toHaveCount(1);
  await view.getByRole("button", { name: "Mostrar de volta" }).click();
  await expect(view.locator(".table-entry")).toHaveCount(2);
  await expect(view.locator(".table-hidden")).toBeHidden();
});

test("add to note (the entry's menu) shows the roll block that will be written, then appends it over the revision read", async ({ app, page }) => {
  await app.open();
  await openNote(app);
  const view = await openTable(page);
  await page.locator(".preview:visible").getByRole("button", { name: "Rolar 1d20+3" }).click();
  const line = view.locator(".table-entry").first();
  await expect(line).toBeVisible();
  const total = await line.locator(".table-total").textContent();
  await expect(line.locator(".table-add")).toHaveCount(0);
  await line.getByRole("button", { name: /^Ações da entrada: 1d20\+3/ }).click();
  await page.getByRole("menuitem", { name: "Adicionar à nota…" }).click();
  const combo = page.getByRole("combobox", { name: "Abrir…" });
  await expect(combo).toBeFocused();
  await combo.fill("Diario");
  await expect(page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText("Diario");
  await combo.press("Enter");
  // What will be added is shown first; a no writes nothing.
  const box = page.locator(".confirm-box");
  await expect(box).toContainText('ao fim de "Diario"');
  await expect(box).toContainText("```roll");
  await expect(box).toContainText(`1d20+3 → [`);
  await expect(box).toContainText(`= ${total}`);
  await expect(box).toContainText("onde: [[Mesa]]");
  await box.getByRole("button", { name: "Cancelar" }).click();
  expect(await app.file("Diario.md")).toBe("# Diário\n\nTexto.\n");
  expect(await app.calls("write_note")).toHaveLength(0);
  // A yes appends one line, the rest of the note as it was.
  await line.getByRole("button", { name: /^Ações da entrada: 1d20\+3/ }).click();
  await page.getByRole("menuitem", { name: "Adicionar à nota…" }).click();
  await combo.fill("Diario");
  await expect(page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText("Diario");
  await combo.press("Enter");
  await page.locator(".confirm-box").getByRole("button", { name: "Adicionar" }).click();
  await expect.poll(async () => await app.file("Diario.md")).toMatch(/^# Diário\n\nTexto\.\n\n```roll\nquem: Você · quando: \d{4}-\d\d-\d\d \d\d:\d\d · onde: \[\[Mesa\]\]\n1d20\+3 → \[\d+\] \+ 3 = \d+\n```\n$/);
  expect(await app.calls("write_note")).toHaveLength(1);
});

test("the phone: the table is a sheet from the bottom, reached from the bottom bar @layout", async ({ app, page }) => {
  await app.open();
  await openNote(app);
  const preview = page.locator(".preview:visible");
  await preview.getByRole("button", { name: "Rolar 1d20+3" }).click();
  await expect(preview.locator('.dice[data-dice="1d20+3"] .dice-total')).toHaveText(/^\d+$/);
  const phone = (page.viewportSize()?.width ?? 1500) <= 760;
  if (!phone) {
    test.info().annotations.push({ type: "note", description: "desktop size: the sheet is only drawn on a phone" });
    return;
  }
  await page.locator(".bar-right").click();
  await mesaTab(page).click();
  const view = page.locator(".table-view");
  await expect(view.locator(".table-entry")).toHaveCount(1);
  const sheet = page.locator("aside.right");
  const box = await sheet.boundingBox();
  const size = page.viewportSize();
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.width)).toBe(size.width);
  // It rests on the bottom bar, which stays in reach (Painel closes it).
  expect(box.y + box.height).toBeLessThanOrEqual(size.height);
  expect(box.y + box.height).toBeGreaterThan(size.height - 100);
  await expect(page.locator(".bar-right")).toBeVisible();
  expect(box.height).toBeLessThan(size.height);
  // Nothing wider than the screen, the entry menu within reach.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const add = view.locator(".table-menu").first();
  const ab = await add.boundingBox();
  expect(ab.width).toBeGreaterThanOrEqual(32);
  expect(ab.x + ab.width).toBeLessThanOrEqual(size.width);
  await shot(page, "phone-sheet");
});

test("a roll heard with the roller's dice is drawn in the roller's colours", async ({ app, page }) => {
  await app.open();
  await inRoom(app, page);
  await openNote(app);
  const view = await openTable(page);
  const style = (body, number) => ({ body, number, outline: "#000000", texture: "none", material: "plastic" });
  const roll = { notation: "1d20+3", source: null, terms: [{ sign: 1, sides: 20, fudge: false, kept: [14], dropped: [] }], modifier: 3, total: 17, by: "Bia", at: new Date().toISOString(), styles: { 1: style("#112233", "#ffeeaa"), 2: style("#445566", "#ffffff"), 3: style("#778899", "#000000") } };
  await app.emit("collab-roll", { path: NOTE, roll });
  const die = view.locator('.table-entry[data-by="Bia"] .table-die');
  await expect(die).toHaveCount(1);
  await expect(die).toHaveCSS("background-color", "rgb(17, 34, 51)");
  await expect(die).toHaveCSS("color", "rgb(255, 238, 170)");
  // A malformed style falls back, field by field, never reaching the page as it came.
  const bad = { ...roll, at: new Date(Date.now() + 1000).toISOString(), styles: { 1: { body: "url(http://x)", number: "red;", outline: 1, texture: "../x", material: "glass" } } };
  await app.emit("collab-roll", { path: NOTE, roll: bad });
  await expect(view.locator('.table-entry[data-by="Bia"]')).toHaveCount(2);
  const style2 = await view.locator('.table-entry[data-by="Bia"] .table-die').nth(1).getAttribute("style");
  expect(style2 ?? "").not.toMatch(/url|red;|\.\./);
});

for (const [name, others, falls] of [
  ["a room roll falls in 3D by default when the 3D dice are on", undefined, true],
  ["and not when 'show others' rolls in 3D' is off", false, false],
]) {
  test(`${name}`, async ({ app, page }) => {
    const chunks = [];
    page.on("request", (r) => /\/(harness-)?chunks\/stage-[^/]*\.js/.test(r.url()) && chunks.push(r.url()));
    await page.addInitScript((o) => {
      const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
      localStorage.setItem("verso.settings", JSON.stringify({ ...s, features: { ...(s.features ?? {}), dice3d: true }, ...(o === undefined ? {} : { others3d: o }) }));
    }, others);
    await app.open();
    await inRoom(app, page);
    await openNote(app);
    // The window hears a room's rolls once it has joined the note's room (the
    // listener is set up on the way, asynchronously): a roll the harness emits
    // before that is lost, as on a loaded Mac (seen 3 in 10 runs, 2026-11-01).
    await expect.poll(async () => (await app.calls("collab_join")).length).toBeGreaterThan(0);
    await page.evaluate((n) => window.__harness.rooms.roll(n, "Bia", "1d20+3", null, [14]), NOTE);
    // The line is on the table either way (the log is not the fall).
    const view = await openTable(page);
    await expect(view.locator('.table-entry[data-by="Bia"]')).toHaveCount(1, { timeout: 20000 });
    if (falls) await expect.poll(() => chunks.length, { timeout: 15000 }).toBeGreaterThan(0);
    else {
      await page.waitForTimeout(1500);
      expect(chunks).toHaveLength(0);
    }
  });
}
