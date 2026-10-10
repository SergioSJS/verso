// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A new note's name nobody chose (src/files.ts, newUntitled): when
// another member made "Sem título" a moment before and the window's list
// does not know it yet, ⌘N moves on to the next name instead of failing.
import { expect, test } from "./fixtures.mjs";

test("⌘N takes the next free name when the first was just taken elsewhere", async ({ app, page }) => {
  await app.open();
  await page.evaluate(() => window.__harness.writeOutside("Sem título.md", "# De outra pessoa\n"));
  await app.key("Mod+n");
  await expect(page.locator("input.title-input")).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__harness.files().filter((f) => f.startsWith("Sem título")))).toEqual(["Sem título 2.md", "Sem título.md"]);
  // The other person's note is untouched.
  expect(await page.evaluate(() => window.__harness.read("Sem título.md"))).toBe("# De outra pessoa\n");
});
