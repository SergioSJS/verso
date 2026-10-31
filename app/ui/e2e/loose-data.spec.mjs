// A structured-data file opened without its folder (ADR 0114 items 31–33,
// amended 2026-10-31): the loose window opens a `.json` or a `.yaml` in the
// diagram of ADR 0106, with its Text | Diagram switch; the text is edited
// and saved by the file's name, and follows a change made outside; a file
// the diagram cannot read opens as its text with the diagram's own line;
// "Save as board" (a new file beside it) is not offered. `?loose=1&file=`
// (src/harness.ts) stands for the window the host makes for a
// double-clicked data file.

import { test, expect } from "./fixtures.mjs";

const NAME = "Inventário.json";

/** The key the host gave the loose file (`folder-changed` names it). */
const looseKey = (page) => page.evaluate(async () => (await window.__harness.invoke("loose_files", {}))[0].key);

test("a loose JSON opens in the diagram, alone, with no Save as board", async ({ app, page }) => {
  await app.open(`?loose=1&file=${encodeURIComponent(NAME)}`);
  await expect(page.locator("html")).toHaveClass(/loose/);
  await expect(page.locator(".loose-bar .loose-name")).toHaveText(NAME);
  await expect(page.locator(".loose-bar .loose-place")).toHaveText("em Downloads");
  await expect(page.locator(".loose-bar svg[data-icon=diagram]")).toHaveCount(1);
  await expect(page.locator(".dg-box").first()).toBeVisible();
  await expect(page.locator(".dg")).toContainText("Ana");
  await expect(page.locator(".dg")).toContainText("lanterna");
  // The switch is there, on the diagram.
  await expect(page.locator(".leaf:visible .data-modes button[data-mode=diagram]")).toHaveAttribute("aria-pressed", "true");
  // Making a board would write a new file beside it: absent here.
  await expect(page.locator(".dg").getByRole("button", { name: "Salvar como board…" })).toHaveCount(0);
  // No tree, no folder tools, as for a note.
  await expect(page.locator(".side")).toBeHidden();
  for (const c of ["index", "search", "create", "board"]) await expect(page.locator("html")).toHaveClass(new RegExp(`cannot-${c}`));
});

test("its text is edited and saved by its name, and the diagram follows", async ({ app, page }) => {
  await app.open(`?loose=1&file=${encodeURIComponent(NAME)}`);
  await expect(page.locator(".dg-box").first()).toBeVisible();
  const before = await app.files();
  await page.locator(".leaf:visible .data-modes button[data-mode=text]").click();
  const editor = page.locator(".leaf:visible .editor.source .cm-content");
  await expect(editor).toContainText('"personagem": "Ana"');
  await editor.click();
  await app.key("Mod+Home");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type('"moedas": 12,');
  await expect.poll(() => app.file(NAME), { timeout: 15_000 }).toContain('"moedas": 12,');
  // Nothing new beside it in the folder in memory.
  expect(await app.files()).toEqual(before);
  await page.locator(".leaf:visible .data-modes button[data-mode=diagram]").click();
  await expect(page.locator(".dg")).toContainText("moedas");
});

test("a change made outside is read into the text tab when nothing was typed", async ({ app, page }) => {
  await app.open(`?loose=1&file=${encodeURIComponent(NAME)}`);
  await expect(page.locator(".dg-box").first()).toBeVisible();
  await page.locator(".leaf:visible .data-modes button[data-mode=text]").click();
  const editor = page.locator(".leaf:visible .editor.source .cm-content");
  await expect(editor).toContainText("corda");
  await app.writeOutside(NAME, '{ "personagem": "Bia" }\n');
  const key = await looseKey(page);
  await app.emit("folder-changed", { key, changed: [NAME], removed: [], moved: [], listing: false, index: { indexed: 0, unchanged: 0, removed: 0, placeholders: 0, problems: [], unwatched: null, unindexed: null } });
  await expect(editor).toContainText('"personagem": "Bia"');
  await expect(editor).not.toContainText("corda");
});

test("a YAML file opens in the diagram too", async ({ app, page }) => {
  await app.open("?loose=1&file=config.yaml");
  await expect(page.locator(".loose-bar .loose-name")).toHaveText("config.yaml");
  await expect(page.locator(".dg-box").first()).toBeVisible();
  await expect(page.locator(".dg")).toContainText("Mesa");
});

test("a file the diagram cannot read opens as its text, with the diagram's line", async ({ app, page }) => {
  await app.open("?loose=1&file=quebrado.json");
  await expect(page.locator(".loose-bar .loose-name")).toHaveText("quebrado.json");
  const editor = page.locator(".leaf:visible .editor.source .cm-content");
  await expect(editor).toContainText('"aberto"');
  const flags = page.locator(".leaf:visible .flags");
  await expect(flags).toBeVisible();
  await expect(flags).toContainText("O texto não é válido");
  await expect(flags).toContainText("Aberto como texto.");
  await expect(page.locator(".dg-box")).toHaveCount(0);
  // The switch still leads to the diagram, which says why it draws nothing.
  await expect(page.locator(".leaf:visible .data-modes button[data-mode=text]")).toHaveAttribute("aria-pressed", "true");
});
