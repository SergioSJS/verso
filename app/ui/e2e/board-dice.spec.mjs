// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A `dice:` code in a board's text card is a die, as in a note (ADR 0088):
// pressed at rest, as a hand does, it rolls and the result shows in the
// card; the board file is not written.

import { test, expect } from "./fixtures.mjs";

const BOARD = (nodes) => `{\n\t"nodes":[\n${nodes.map((n) => `\t\t${JSON.stringify(n)}`).join(",\n")}\n\t],\n\t"edges":[]\n}`;
const FILE = BOARD([{ id: "t", type: "text", text: "Ataque: `dice: 1d20+3` e `dice: 1d20*2`", x: 0, y: 0, width: 420, height: 220 }]);

test("a dice code in a text card rolls from the board, at rest, and writes nothing @layout", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Mesa.canvas", FILE);
  await app.folderChanged(["Mesa.canvas"], true);
  await expect(page.locator("#notes")).toContainText("Mesa.canvas");
  await app.quickOpen("Mesa");
  await app.boardReady();
  const slot = page.locator('.board-card-slot[data-card="t"]');
  const die = slot.getByRole("button", { name: "Rolar 1d20+3" });
  await expect(die).toBeVisible();
  // A code Verso does not read stays code.
  await expect(slot.locator("code", { hasText: "dice: 1d20*2" })).toBeVisible();
  // The card is not entered: the press goes to the point, under the canvas.
  const box = await die.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const total = slot.locator('.dice[data-dice="1d20+3"] .dice-total');
  await expect(total).toHaveText(/^\d+$/);
  const n = Number(await total.textContent());
  expect(n).toBeGreaterThanOrEqual(4);
  expect(n).toBeLessThanOrEqual(23);
  await page.waitForTimeout(1500);
  expect(await app.file("Mesa.canvas")).toBe(FILE);
  expect(await app.calls("write_note")).toHaveLength(0);
});

const LIST = "- Ataque com espada: `dice: 1d20+5`";
const NOTE = "# Ficha\n\n- Ataque com espada: `dice: 1d20+5`\n";

async function rollsAtRest(app, page, id, board, extra) {
  await app.open();
  await app.writeOutside("Mesa.canvas", board);
  if (extra) await app.writeOutside(extra[0], extra[1]);
  await app.folderChanged(["Mesa.canvas", ...(extra ? [extra[0]] : [])], true);
  await expect(page.locator("#notes")).toContainText("Mesa.canvas");
  await app.quickOpen("Mesa");
  await app.boardReady();
  const slot = page.locator(`.board-card-slot[data-card="${id}"]`);
  const die = slot.getByRole("button", { name: "Rolar 1d20+5" });
  await expect(die).toBeVisible();
  const box = await die.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const total = slot.locator('.dice[data-dice="1d20+5"] .dice-total');
  await expect(total).toHaveText(/^\d+$/);
  const n = Number(await total.textContent());
  expect(n).toBeGreaterThanOrEqual(6);
  expect(n).toBeLessThanOrEqual(25);
  await page.waitForTimeout(1500);
  expect(await app.file("Mesa.canvas")).toBe(board);
  if (extra) expect(await app.file(extra[0])).toBe(extra[1]);
  expect(await app.calls("write_note")).toHaveLength(0);
}

test("a list item with a dice code in a text card rolls at rest @layout", async ({ app, page }) => {
  await rollsAtRest(app, page, "t", BOARD([{ id: "t", type: "text", text: LIST, x: 0, y: 0, width: 420, height: 220 }]));
});

test("a dice code in a note shown by a file card rolls at rest, the note unchanged @layout", async ({ app, page }) => {
  await rollsAtRest(app, page, "f", BOARD([{ id: "f", type: "file", file: "Ficha.md", x: 0, y: 0, width: 420, height: 260 }]), ["Ficha.md", NOTE]);
});

test("a dice code typed into a text card afterwards rolls at rest @layout", async ({ app, page }) => {
  const board = BOARD([{ id: "t", type: "text", text: "Nada", x: 0, y: 0, width: 420, height: 220 }]);
  await app.open();
  await app.writeOutside("Mesa.canvas", board);
  await app.folderChanged(["Mesa.canvas"], true);
  await expect(page.locator("#notes")).toContainText("Mesa.canvas");
  await app.quickOpen("Mesa");
  await app.boardReady();
  const at = await app.centerOf("t");
  await page.mouse.dblclick(at.x, at.y);
  const field = page.locator(".prompt-field");
  await expect(field).toBeVisible();
  await field.fill(LIST);
  await page.locator(".prompt-box button.save").click();
  const slot = page.locator('.board-card-slot[data-card="t"]');
  const die = slot.getByRole("button", { name: "Rolar 1d20+5" });
  await expect(die).toBeVisible();
  const box = await die.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(slot.locator('.dice[data-dice="1d20+5"] .dice-total')).toHaveText(/^\d+$/);
});
