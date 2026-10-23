// One chat per table (ADR 0107 as amended 2026-10-23; the maintainer: "o
// chat deve ser 1 por mesa"). A folder with two tables, `Cripta` and
// `Sala`: the Mesa panel is at the table of the active note, names it in its
// header, switches when the active note is in the other table (presence
// leaves one and joins the other), lists the tables when no note says which
// and nothing was chosen, and remembers the last one chosen in the folder.

import { test, expect } from "./fixtures.mjs";

const NOTES = { "Cripta/Ata da Cripta.md": "# Cripta\n", "Sala/Ata da Sala.md": "# Sala\n", "Fora.md": "# Fora\n", "Solta.md": "# Solta\n" };

/** The folder's table is up with two tables; Bia is at Cripta, Cris at Sala. */
async function serve(app, page) {
  await app.open("?vault=empty&table=owner");
  for (const [p, text] of Object.entries(NOTES)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(NOTES), true);
  await page.evaluate(() => {
    const h = window.__harness;
    h.table.role = "owner";
    h.table.up = true;
    h.table.join("Bia", "#1565c0", "editor", null, "Cripta");
    h.table.join("Cris", "#ad1457", "reader", null, "Sala");
    h.table.join("Dan", "#2e7d32", "editor", null, "Sala");
    h.campaign.tables = ["Cripta", "Sala"].map((root) => ({ root, open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }));
    h.emit("campaign-changed", { paths: [] });
  });
}

async function openPanel(page) {
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  return page.locator(".table-view");
}

const log = (view) => view.locator(".table-log .table-entry");
const field = (view) => view.getByRole("textbox", { name: "Mensagem para a mesa" });
const title = (view) => view.locator(".table-title");
const says = (view) => log(view).locator(".table-text");

test("the panel names the table of the active note and follows it to the other table", async ({ app, page }) => {
  await serve(app, page);
  await page.evaluate(() => {
    const t = window.__harness.table;
    t.say("Bia", "alô, cripta", "Cripta");
    t.say("Cris", "alô, sala", "Sala");
  });
  await app.quickOpen("Ata da Cripta");
  const view = await openPanel(page);
  await expect(title(view)).toHaveText("Mesa: Cripta");
  await expect(says(view)).toHaveText(["alô, cripta"]);
  // Bia is the only other at Cripta: two at the table with this window.
  await expect(view.locator(".table-roster-count")).toHaveText("2");
  // The window writes: it is the Cripta's entry.
  await field(view).fill("falei na cripta");
  await field(view).press("Enter");
  await expect(says(view)).toHaveText(["alô, cripta", "falei na cripta"]);

  // The active note is in the other table: the panel goes there, and only there.
  await app.quickOpen("Ata da Sala");
  await expect(title(view)).toHaveText("Mesa: Sala");
  await expect(says(view)).toHaveText(["alô, sala"]);
  await expect(view.locator(".table-roster-count")).toHaveText("3");
  // The presence left one and joined the other.
  const names = await app.calls("table_join");
  const joined = names.map((a) => a.table).filter((t, i, all) => t !== null && t !== all[i - 1]);
  expect(joined).toEqual(["Cripta", "Sala"]);
  expect((await app.calls("table_leave")).map((a) => a.table)).toContain("Cripta");
  // And a message of the Cripta, told now, does not reach this log.
  await page.evaluate(() => window.__harness.table.say("Bia", "ainda na cripta", "Cripta"));
  await expect(says(view)).toHaveText(["alô, sala"]);
  // Back: the Cripta's log has what was said there.
  await app.quickOpen("Ata da Cripta");
  await expect(title(view)).toHaveText("Mesa: Cripta");
  await expect(says(view)).toHaveText(["alô, cripta", "falei na cripta", "ainda na cripta"]);
});

test("a note in no table: the panel lists the tables, and the one chosen is remembered for the folder", async ({ app, page }) => {
  await serve(app, page);
  await app.quickOpen("Fora");
  const view = await openPanel(page);
  const choose = view.locator(".table-choose");
  await expect(choose).toBeVisible();
  await expect(choose.locator(".table-choose-option")).toHaveText(["Cripta", "Sala"]);
  await expect(view.locator(".table-compose")).toBeHidden();
  await choose.getByRole("button", { name: "Entrar na mesa Sala" }).click();
  await expect(choose).toBeHidden();
  await expect(title(view)).toHaveText("Mesa: Sala");
  await expect(view.locator(".table-compose")).toBeVisible();
  // Another note in no table: still at the last table chosen, with the way to the other.
  await app.quickOpen("Solta");
  await expect(title(view)).toHaveText("Mesa: Sala");
  await view.getByRole("button", { name: "Trocar de mesa" }).click();
  await page.getByRole("menuitem", { name: "Cripta" }).click();
  await expect(title(view)).toHaveText("Mesa: Cripta");
  // A note of a table wins over the choice.
  await app.quickOpen("Ata da Sala");
  await expect(title(view)).toHaveText("Mesa: Sala");
});

test("dice rolled at the panel go to the log of its table", async ({ app, page }) => {
  await serve(app, page);
  await app.quickOpen("Ata da Cripta");
  const view = await openPanel(page);
  await field(view).fill("/r 1d6");
  await field(view).press("Enter");
  await expect(log(view).locator(".table-notation")).toHaveText(["1d6"]);
  const named = (await app.calls("table_roll")).map((a) => a.table);
  expect(named).toEqual(["Cripta"]);
  await app.quickOpen("Ata da Sala");
  await expect(title(view)).toHaveText("Mesa: Sala");
  await expect(log(view)).toHaveCount(0);
});

test("a folder with no table has the one panel it always had", async ({ app, page }) => {
  await app.open("?vault=empty");
  await app.writeOutside("Diario.md", "# Diário\n");
  await app.folderChanged(["Diario.md"], true);
  await page.evaluate(() => {
    window.__harness.table.up = true;
  });
  const view = await openPanel(page);
  await expect(view.locator(".table-compose")).toBeVisible();
  await expect(view.locator(".table-title")).toBeHidden();
  await expect(view.locator(".table-choose")).toBeHidden();
});
