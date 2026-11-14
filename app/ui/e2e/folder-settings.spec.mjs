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
  await expect.poll(async () => JSON.parse((await app.file(FILE)) ?? "{}").bookmarks).toEqual(["09 - Busca e Navegação.md"]);
});

/** The bookmarks' line of Settings › Organização: where they are kept,
 *  and how many. */
async function bookmarksLine(app) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Organização" }).click();
  return app.page.locator(".setting", { has: app.page.locator(".setting-title", { hasText: /^Favoritos$/ }) });
}

/** The star of the open note named `name`. */
const starOf = (app, name) =>
  app.page.locator(".title-row:visible", { has: app.page.locator(".note-title", { hasText: new RegExp(`^${name}$`) }) }).locator("button.star");

test("a reader of a synced folder stars on this computer, never in the folder's file, and keeps the star", async ({ app }) => {
  // The folder syncs with a server where the person only reads (ADR 0079
  // item 1): its own file holds a bookmark of someone who writes it.
  await app.open("?sync=reader");
  await expect(app.page.locator("#sync-state")).toBeVisible();
  const theirs = '{\n  "bookmarks": [\n    "09 - Busca e Navegação.md"\n  ]\n}\n';
  await app.writeOutside(FILE, theirs);
  await app.folderChanged([FILE]);
  await app.quickOpen("Arquivos e Pastas");
  const star = starOf(app, "07 - Arquivos e Pastas");
  await expect(star).toBeVisible();
  await expect(star).not.toHaveClass(/\bon\b/);
  await star.click();
  await expect(star).toHaveClass(/\bon\b/);
  // On this computer: the folder's file as it was, nothing asked to write it.
  expect(await app.file(FILE)).toBe(theirs);
  expect(await app.calls("set_folder_settings")).toEqual([]);
  const line = await bookmarksLine(app);
  await expect(line.locator(".setting-scope")).toHaveText("Desta máquina");
  await expect(line.locator(".setting-value")).toHaveText("1");
  await app.page.locator(".settings-close").click();
  // Opened again (the harness's folder made anew, with no settings file):
  // the star is still this computer's, and a reader's never moves into
  // the folder, however soon sync says the role.
  await app.open("?sync=reader");
  await app.quickOpen("Arquivos e Pastas");
  await expect(star).toHaveClass(/\bon\b/);
  await expect(app.page.locator("#sync-state")).toBeVisible();
  expect(await app.file(FILE)).toBeNull();
  expect(await app.calls("set_folder_settings")).toEqual([]);
  const again = await bookmarksLine(app);
  await expect(again.locator(".setting-scope")).toHaveText("Desta máquina");
  await expect(again.locator(".setting-value")).toHaveText("1");
});
