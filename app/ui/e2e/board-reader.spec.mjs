// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A reader's board (ADR 0090 item 5: a reader is never in a board's room):
// the board follows the file when the server says it changed, it says
// nothing of a newer Verso, it is a viewer from the first frame on every
// host, and a note's two dice of the same notation are two dice.

import { test, expect, modeOn } from "./fixtures.mjs";

const card = (id, text, y) => ({ id, type: "text", text, x: 0, y, width: 300, height: 80 });
const BOARD = (...nodes) => `{\n\t"nodes":[\n${nodes.map((n) => `\t\t${JSON.stringify(n)}`).join(",\n")}\n\t],\n\t"edges":[]\n}`;
const ONE = BOARD(card("a", "Primeiro", 0));
const TWO = BOARD(card("a", "Primeiro", 0), card("b", "Segundo", 200));

async function open(app, query) {
  await app.open(query);
  await app.writeOutside("Grupo.canvas", ONE);
  await app.folderChanged(["Grupo.canvas"], true);
  await expect(app.page.locator("#notes")).toContainText("Grupo.canvas");
  await app.quickOpen("Grupo");
  await app.boardReady();
}

test("a reader's open board shows the cards the owner adds, when the file changes", async ({ app, page }) => {
  await open(app, "?vault=empty&side=server&role=reader");
  await expect(page.locator(".board-card-slot")).toHaveCount(1);
  await app.writeOutside("Grupo.canvas", TWO);
  await app.folderChanged(["Grupo.canvas"], false);
  await expect(page.locator(".board-card-slot")).toHaveCount(2);
  // A reader sends nothing.
  expect(await app.calls("write_text")).toHaveLength(0);
  expect(await app.calls("collab_update")).toHaveLength(0);
});

test("a reader's board says nothing of a newer Verso", async ({ app, page }) => {
  await open(app, "?vault=empty&side=server&role=reader");
  await expect(page.locator("#status")).not.toContainText("mais novo");
  await expect(page.locator(".excalidraw")).toBeVisible();
});

test("a board of a newer Verso says so", async ({ app, page }) => {
  await app.open("?vault=empty");
  await app.writeOutside("Novo.canvas", `{\n\t"nodes":[\n\t\t${JSON.stringify(card("a", "x", 0))}\n\t],\n\t"edges":[],\n\t"verso":{"version":999}\n}`);
  await app.folderChanged(["Novo.canvas"], true);
  await app.quickOpen("Novo");
  await app.boardReady();
  await expect(page.locator("#status")).toContainText("mais novo");
});

test("a reader of a server has no drawing toolbar", async ({ app, page }) => {
  await open(app, "?vault=empty&side=server&role=reader");
  await expect(page.locator(".App-toolbar")).toHaveCount(0);
});

test("a reader of a synced folder on the desktop has no drawing toolbar, from the first frame", async ({ app, page }) => {
  await open(app, "?vault=empty&sync=reader");
  await expect(page.locator(".App-toolbar")).toHaveCount(0);
});

test("a role that arrives after the board is up makes it a viewer", async ({ app, page }) => {
  await open(app, "?vault=empty");
  await expect(page.locator(".App-toolbar").first()).toBeVisible();
  const reader = { key: "harness", on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "reader", state: "synced", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], log: [], last: "2026-10-11T12:00:00Z", message: null, problem: null, versions: null, revoked: null };
  await page.evaluate((st) => {
    window.__harness.core.handlers.folder_sync = () => st;
    window.__harness.core.sync = st;
  }, reader);
  await app.emit("sync-status", reader);
  await expect(page.locator(".App-toolbar")).toHaveCount(0);
});

const NOTE = "# Ficha\n\n- Arco longo: `dice: 1d20+6`\n- Adaga: `dice: 1d20+6`\n";

test("a result stays with the die that was rolled, among dice of the same notation (reading)", async ({ app, page }) => {
  await app.open("?vault=empty");
  await app.writeOutside("Ficha.md", NOTE);
  await app.folderChanged(["Ficha.md"], true);
  await app.quickOpen("Ficha");
  const dice = page.locator(".preview:visible .dice");
  await expect(dice).toHaveCount(2);
  await dice.nth(0).getByRole("button", { name: "Rolar 1d20+6" }).click();
  await expect(dice.nth(0).locator(".dice-total")).toHaveText(/^\d+$/);
  await expect(dice.nth(1).locator(".dice-card")).toBeHidden();
  await dice.nth(1).getByRole("button", { name: "Rolar 1d20+6" }).click();
  await expect(dice.nth(1).locator(".dice-total")).toHaveText(/^\d+$/);
  await expect(dice.nth(0).locator(".dice-card")).toBeVisible();
});

test("a result stays with the die that was rolled (Live Preview)", async ({ app, page }) => {
  await app.open("?vault=empty");
  await app.writeOutside("Ficha.md", NOTE);
  await app.folderChanged(["Ficha.md"], true);
  await app.quickOpen("Ficha");
  await modeOn(page, "Editar");
  await expect(page.locator(".editor.live .cm-content")).toBeVisible();
  const dice = page.locator(".editor.live .cm-content .dice");
  await expect(dice).toHaveCount(2);
  await dice.nth(0).getByRole("button", { name: "Rolar 1d20+6" }).click();
  await expect(dice.nth(0).locator(".dice-total")).toHaveText(/^\d+$/);
  await expect(dice.nth(1).locator(".dice-card")).toBeHidden();
});

test("a result stays with the die that was rolled (board card)", async ({ app, page }) => {
  await app.open("?vault=empty");
  await app.writeOutside("Mesa.canvas", BOARD({ ...card("t", NOTE.split("\n").slice(2, 4).join("\n"), 0), width: 420, height: 220 }));
  await app.folderChanged(["Mesa.canvas"], true);
  await app.quickOpen("Mesa");
  await app.boardReady();
  const dice = page.locator('.board-card-slot[data-card="t"] .dice');
  await expect(dice).toHaveCount(2);
  const b = await dice.nth(0).getByRole("button", { name: "Rolar 1d20+6" }).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(dice.nth(0).locator(".dice-total")).toHaveText(/^\d+$/);
  await expect(dice.nth(1).locator(".dice-card")).toBeHidden();
});
