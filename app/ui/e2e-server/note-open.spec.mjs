// Opening a note on a server's folder is quick: the text shows when the
// file is read, not when the room is joined (perf/note-open, 2026-10-26).
// The budget is generous (CI machines are slow); the maintainer's target on
// a LAN server is 400 ms for a fresh note and 200 ms for one whose tab is
// open. The breakdown of a slow open is in the log (`slow open …`).

import { expect, test } from "@playwright/test";

import { ADMIN, api, invoke, signedIn } from "./access-helpers.mjs";

const BUDGET_MS = 1000;

test("a note opens within the budget, fresh and from an open tab, and is not unsaved", async ({ page }, info) => {
  await signedIn(page, ADMIN.email, ADMIN.password);
  const folder = await api(page, "POST", "/api/folders", { name: `Zz abrir ${info.project.name}` });
  await page.goto(`/?folder=${folder.id}`);
  await expect(page.locator("#folder")).toHaveText(`Zz abrir ${info.project.name}`, { timeout: 30_000 });
  for (const n of ["Um", "Dois"]) await invoke(page, "create_note", { name: n, text: `# ${n}\n\ntexto de ${n}\n` });

  const open = async (name) => {
    const box = page.getByRole("combobox", { name: "Abrir…" });
    // The index may not have the new notes yet: asked again until it lists them.
    await expect(async () => {
      await page.keyboard.press("Escape");
      await page.keyboard.press("ControlOrMeta+p");
      await expect(box).toBeFocused({ timeout: 2000 });
      await box.fill(name);
      await expect(page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText(name, { timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    const began = Date.now();
    await box.press("Enter");
    await expect(page.locator(".leaf:not([hidden])")).toContainText(`texto de ${name}`, { timeout: 15_000 });
    return Date.now() - began;
  };

  const fresh = await open("Um");
  const second = await open("Dois");
  const again = await open("Um");
  info.annotations.push({ type: "open ms", description: `fresh ${fresh}, second ${second}, open tab ${again}` });
  console.log(`open ms: fresh ${fresh}, second ${second}, open tab ${again}`);
  expect(fresh).toBeLessThan(BUDGET_MS);
  expect(second).toBeLessThan(BUDGET_MS);
  expect(again).toBeLessThan(BUDGET_MS);
  // Nobody typed: no tab is unsaved.
  await expect(page.getByRole("tab", { name: /unsaved|salv/i })).toHaveCount(0);
});
