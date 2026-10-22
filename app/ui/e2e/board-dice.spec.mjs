// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A `dice:` code in a board's text card is a die, as in a note (ADR 0088):
// pressed at rest, as a hand does, it rolls and the result shows in the
// card; the board file is not written.

import { test, expect } from "./fixtures.mjs";

const BOARD = (nodes) => `{\n\t"nodes":[\n${nodes.map((n) => `\t\t${JSON.stringify(n)}`).join(",\n")}\n\t],\n\t"edges":[]\n}`;
const FILE = BOARD([{ id: "t", type: "text", text: "Ataque: `dice: 1d20+3` e `dice: 1d20*2`", x: 0, y: 0, width: 420, height: 220 }]);

test("a dice code in a text card rolls from the board, at rest, and writes nothing", async ({ app, page }) => {
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
