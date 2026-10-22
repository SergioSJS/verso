// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Edit" on a built-in layout writes a copy into the folder before the layout
// editor mounts. A person (or a test, on a slow disk) who goes on meanwhile —
// ⌘P at once — must not have the editor appear later, take the focus and
// leave the switcher inert beneath it (seen on the Mac in language-sweep).
import { expect, test } from "./fixtures.mjs";

async function openSettingsGallery(app, page) {
  await app.open("?vault=empty");
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Fichas" }).click();
}

test("⌘P pressed while the layout's copy is being written keeps the switcher", async ({ app, page }) => {
  await openSettingsGallery(app, page);
  await page.evaluate(() => {
    const edit = Array.from(document.querySelectorAll(".statblock-gallery-card button")).find((b) => b.textContent?.trim() === "Editar");
    const mac = /Mac/.test(navigator.platform);
    edit.click();
    // In the same turn: the copy is still being written, the editor not there.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyP", ctrlKey: !mac, metaKey: mac, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(800);
  await expect(page.locator(".sbe-shade")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Abrir…" })).toBeFocused();
});

test("⌘P opens the switcher after the layout editor and Settings close", async ({ app, page }) => {
  await openSettingsGallery(app, page);
  await page.locator(".statblock-gallery-card").getByRole("button", { name: "Editar", exact: true }).first().click();
  await expect(page.locator(".sbe-shade")).toBeVisible();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("Escape");
  await expect(page.locator(".sbe-shade")).toHaveCount(0);
  await app.key("Mod+p");
  await expect(page.getByRole("combobox", { name: "Abrir…" })).toBeFocused();
});
