// Walkthrough, section 10, step 9: the folder's settings (ADR 0070 items
// 1–2) — the bookmarks, the scan rules and the folder note's name — kept
// in the folder's `.verso/settings.json`, which only a change writes.

import { test, expect } from "./fixtures.mjs";

const FILE = ".verso/settings.json";

test("a scan rule says where it is kept, and its first change writes it into the folder", async ({ app }) => {
  await app.open();
  // Opening the folder writes nothing into it.
  expect(await app.file(FILE)).toBeNull();
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Arquivos e links" }).click();
  const row = () => app.page.locator(".setting", { has: app.page.getByText("Ignorar pastas de build", { exact: true }) });
  await expect(row().locator(".setting-scope")).toHaveText("Desta máquina");
  await row().locator("label.switch").click();
  await expect.poll(async () => await app.file(FILE)).toBe('{\n  "ignoreBuildDirs": false\n}\n');
  await expect(row().locator(".setting-scope")).toHaveText("Da pasta");
  await expect(row().locator("input[type=checkbox]")).not.toBeChecked();
});

test("a star is kept in the folder's settings", async ({ app }) => {
  await app.open();
  await app.quickOpen("Busca e Navegação");
  await app.command("Favoritar");
  await expect.poll(async () => JSON.parse((await app.file(FILE)) ?? "{}").bookmarks).toEqual(["12 - Busca e Navegação.md"]);
});
