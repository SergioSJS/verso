// The table and the campaign's controls in a synced folder (ADR 0107 item 9,
// ADR 0110): a folder of this computer that syncs with a UniVerso reaches the
// server's table over the sync's link, as a note joins its room (ADR 0082).
// The harness plays the server's table and campaign (`src/harness/table.ts`,
// `campaign.ts`) and the link (`rooms.up`); the host's forwarding and the
// server's rules are tried in `src-tauri/src/tests_live_table.rs`.

import { test, expect } from "./fixtures.mjs";

const SYNCED = { key: "harness", on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "owner", state: "synced", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], log: [], last: "2026-10-11T12:00:00Z", message: null, problem: null, versions: null, revoked: null };

/** Say a status as the sync would: the event, and the same status as the answer to `folder_sync`. */
async function say(app, status) {
  await app.page.evaluate((st) => {
    window.__harness.core.handlers.folder_sync = () => st;
    // The harness's own sync state, which the table and the campaign read.
    window.__harness.core.sync = st;
  }, status);
  await app.emit("sync-status", status);
}

/** The sync's link up or down: the table answers only while it is up. */
const link = (app, up) => app.page.evaluate((u) => (window.__harness.rooms.up = u), up);

async function synced(app) {
  await app.open("?vault=empty");
  await app.writeOutside("Mundo/Cripta.md", "# Cripta\n");
  await app.writeOutside("Diario.md", "# Diário\n");
  await app.folderChanged(["Mundo/Cripta.md", "Diario.md"], true);
  await link(app, true);
  await say(app, SYNCED);
}

async function openTable(page) {
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  return page.locator(".table-view");
}

test("a synced folder is at the server's table while the link is up, and the folder menu offers a table", async ({ app, page }) => {
  await synced(app);
  const view = await openTable(page);
  // The server's panel: the input row and the roster, not the local log's note.
  await expect(view.locator(".table-compose")).toBeVisible();
  await expect(view.locator(".table-roster .table-member")).toHaveCount(1);
  await expect.poll(async () => (await app.calls("table_join")).length).toBeGreaterThan(0);
  await expect(view.getByText("Mesa indisponível sem conexão")).toBeHidden();
  // A message goes to the server's table through the same commands.
  await view.getByRole("textbox", { name: "Mensagem para a mesa" }).fill("Boa noite, mesa");
  await page.keyboard.press("Enter");
  await expect(view.locator(".table-log .table-entry")).toContainText("Boa noite, mesa");
  await expect.poll(() => app.calls("table_say")).toEqual([{ text: "Boa noite, mesa", table: "" }]);

  // The campaign's controls are the owner's, in the synced folder's window.
  await page.locator('summary[data-folder="Mundo"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Tornar esta pasta uma mesa" }).click();
  await expect(page.getByRole("dialog", { name: "Mesa “Mundo”" })).toBeVisible();
  await expect.poll(() => app.calls("campaign_make")).toEqual([{ root: "Mundo" }]);
});

test("with the link down the table is unavailable, the rolls stay here not shared, and it comes back", async ({ app, page }) => {
  await synced(app);
  const view = await openTable(page);
  await expect(view.locator(".table-compose")).toBeVisible();

  // The link drops: said in words, no input row, no game master's rows.
  await link(app, false);
  await say(app, { ...SYNCED, state: "offline" });
  await expect(view.getByText("Mesa indisponível sem conexão")).toBeVisible();
  await expect(view.locator(".tray-mode")).toBeHidden();
  await page.locator('summary[data-folder="Mundo"]').click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Tornar esta pasta uma mesa" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Back: joined again, the note gone, the rows back.
  await link(app, true);
  await say(app, { ...SYNCED, state: "syncing" });
  await expect(view.locator(".table-compose")).toBeVisible();
  await expect(view.getByText("Mesa indisponível sem conexão")).toBeHidden();
  // Joined again on the state change (the first attempt, with the link down, was not made).
  expect((await app.calls("table_join")).length).toBeGreaterThanOrEqual(2);
  await page.locator('summary[data-folder="Mundo"]').click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Tornar esta pasta uma mesa" })).toBeVisible();
});

test("sync paused says so, and a folder that does not sync keeps the plain note", async ({ app, page }) => {
  await synced(app);
  const view = await openTable(page);
  await link(app, false);
  await say(app, { ...SYNCED, state: "paused" });
  await expect(view.getByText("Mesa indisponível com a sincronização pausada")).toBeVisible();
  await say(app, { ...SYNCED, on: false, state: "off" });
  await expect(view.getByText(/Só as suas rolagens/)).toBeVisible();
});
