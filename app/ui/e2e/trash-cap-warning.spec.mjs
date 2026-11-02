// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The warning before a deletion that alone passes the server's size cap
// for a bin (ADR 0080, amended 2026-11-01; walkthrough, section 10): the
// cap arrives in the capabilities, the size is what the window knows.

import { expect, test } from "./fixtures.mjs";

const row = (app, p) => app.page.locator(`#notes li[data-path="${p}"] > button`);

async function folderOf(app, files, cap) {
  await app.open();
  for (const [p, text] of Object.entries(files)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(files), true);
  if (cap !== null)
    await app.page.evaluate((c) => {
      window.__harness.core.trashCap = c;
      window.dispatchEvent(new Event("verso:role"));
    }, cap);
}

async function askDelete(app, path) {
  await row(app, path).click({ button: "right" });
  await app.page.locator('.menu:not([hidden]) button[role="menuitem"]', { hasText: "Mover para a lixeira" }).click();
}

test("a deletion that alone passes the server's bin cap is warned before", async ({ app }) => {
  await folderOf(app, { "Grande.md": "x".repeat(300), "Pequena.md": "y\n" }, 100);
  await expect.poll(() => app.page.evaluate(() => window.__harness.core.invoke("capabilities", {}).trash_cap)).toBe(100);
  await askDelete(app, "Grande.md");
  await expect(app.page.getByText(/Atenção: isto tem 300 B, mais que o limite da lixeira do servidor \(100 B\)/)).toBeVisible();
  await expect(app.page.getByText(/sem poder ser restaurado/)).toBeVisible();
  await app.page.getByRole("button", { name: "Cancelar" }).last().click();
  expect(await app.files()).toContain("Grande.md");
  // A small one under the cap: asked as always, no warning.
  await askDelete(app, "Pequena.md");
  await expect(app.page.getByText('Apagar "Pequena"?')).toBeVisible();
  await expect(app.page.getByText(/Atenção: isto tem/)).toHaveCount(0);
});

test("with no cap (the computer's own bin) nothing is warned", async ({ app }) => {
  await folderOf(app, { "Grande.md": "x".repeat(300) }, null);
  await askDelete(app, "Grande.md");
  await expect(app.page.getByText('Apagar "Grande"?')).toBeVisible();
  await expect(app.page.getByText(/Atenção: isto tem/)).toHaveCount(0);
});
