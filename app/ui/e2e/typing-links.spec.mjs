// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The suggestion while typing (ADR 0089 item 5, revised 2026-10-15;
// walkthrough, section 3): off by default, a setting in Settings › Editor;
// on, the words just typed that are a note's name or alias show "Ligar a
// [[Nome]]" at the cursor, which never changes the text by itself — Tab or
// Enter writes the link, Escape or typing on dismisses it, and a name
// dismissed is not offered again in the paragraph. Never in code, in the
// frontmatter or inside a link; never the note itself; the ignored folders
// and names left out; a screen reader hears it politely; a touch screen
// taps the chip; in a live note the accepted link is an edit through the
// room; a reader gets none.

import { test, expect } from "./fixtures.mjs";

const FILES = {
  "Capitão Ruy.md": "---\naliases: [O Capitão]\n---\n# Capitão Ruy\n",
  "Porto.md": "# Porto\n",
  "Porto Alegre.md": "# Porto Alegre\n",
  "Porto Cinzento.md": "# Porto Cinzento\n",
  "Mesa.md": "# Mesa\n",
  "Arquivo/Velho.md": "# Velho\n",
  "Rascunho.md": "# Rascunho\n\n",
  "Codigo.md": "# Codigo\n\n```\nver ",
};
const DRAFT = "Rascunho.md";
const chip = (page) => page.locator(".cm-link-suggest");

/** The folder, the person's settings (the suggestion on unless said), the
 *  draft open in Edit with the cursor at its end. */
async function seeded(app, settings = {}, { open = DRAFT, query = "?vault=empty" } = {}) {
  await app.page.addInitScript((s) => localStorage.setItem("verso.settings", JSON.stringify(s)), { suggestLinks: true, ...settings });
  await app.open(query);
  for (const [path, text] of Object.entries(FILES)) await app.writeOutside(path, text);
  await app.folderChanged(Object.keys(FILES), true);
  await app.quickOpen(open.replace(/\.md$/, ""));
  await app.page.getByRole("button", { name: "Editar", exact: true }).click();
  await atEnd(app.page);
}

async function atEnd(page) {
  const editor = page.locator(".pane.focused .cm-content").first();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
}

/** The file as saved: ⌘S, then the file's text. */
async function saved(app, path = DRAFT) {
  await app.key("Mod+s");
  await expect.poll(async () => (await app.file(path)).includes("Fomos") || (await app.file(path)).includes("ver")).toBe(true);
  return app.file(path);
}

test("off by default: typing a note's name shows nothing", async ({ app, page }) => {
  await seeded(app, { suggestLinks: false });
  await page.keyboard.type("Fomos ao Capitão Ruy");
  await expect(page.locator(".pane.focused .cm-content").first()).toContainText("Fomos ao Capitão Ruy");
  await expect(chip(page)).toHaveCount(0);
});

test("typing a name shows the chip and a screen reader hears it; the text is untouched", async ({ app, page }) => {
  await seeded(app);
  await page.keyboard.type("Fomos ao Capitão Ruy");
  await expect(chip(page)).toHaveText("Ligar a [[Capitão Ruy]]Tab");
  await expect(page.locator("#link-suggest-live")).toHaveText("Sugestão de link: Capitão Ruy, Tab para aceitar");
  await expect(page.locator("#link-suggest-live")).toHaveAttribute("aria-live", "polite");
  // Nothing was written by the suggestion.
  await expect(page.locator(".pane.focused .cm-content").first()).toContainText("Fomos ao Capitão Ruy");
  await expect(page.locator(".pane.focused .cm-content").first()).not.toContainText("[[");
  // Nothing else in the folder was touched either.
  expect(await app.calls("write_text")).toHaveLength(0);
});

test("Tab writes the link over the typed words, the cursor after it", async ({ app, page }) => {
  await seeded(app);
  await page.keyboard.type("Fomos ao Capitão Ruy");
  await page.keyboard.press("Tab");
  await expect(chip(page)).toHaveCount(0);
  await page.keyboard.type(" ver");
  expect(await saved(app)).toBe("# Rascunho\n\nFomos ao [[Capitão Ruy]] ver");
  await expect(page.locator("#link-suggest-live")).toHaveText("Link criado para Capitão Ruy.");
});

test("the case or an alias typed is kept as the link's text; Enter accepts too", async ({ app, page }) => {
  await seeded(app);
  await page.keyboard.type("Fomos ao capitão ruy");
  await page.keyboard.press("Enter");
  await page.keyboard.type(" e a O Capitão");
  await expect(chip(page)).toHaveText("Ligar a [[Capitão Ruy]]Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.type(" ver");
  // Enter took the suggestion: no new line was made.
  expect(await saved(app)).toBe("# Rascunho\n\nFomos ao [[Capitão Ruy|capitão ruy]] e a [[Capitão Ruy|O Capitão]] ver");
});

test("a click on the chip accepts it, and the editor keeps the focus", async ({ app, page }) => {
  await seeded(app);
  await page.keyboard.type("Fomos ao Capitão Ruy");
  await chip(page).locator("button").click();
  await page.keyboard.type(" ver");
  expect(await saved(app)).toBe("# Rascunho\n\nFomos ao [[Capitão Ruy]] ver");
});

test("Escape dismisses it, and the name is not offered again in the paragraph", async ({ app, page }) => {
  await seeded(app);
  await page.keyboard.type("Fomos ao Capitão Ruy");
  await expect(chip(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(chip(page)).toHaveCount(0);
  await page.keyboard.type(" e de novo o Capitão Ruy");
  await expect(chip(page)).toHaveCount(0);
  await expect(page.locator(".pane.focused .cm-content").first()).not.toContainText("[[");
  // Another paragraph offers it again.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Outro dia, o Capitão Ruy");
  await expect(chip(page)).toHaveCount(1);
});

test("typing on dismisses it; the longest name wins as the words come", async ({ app, page }) => {
  await seeded(app);
  await page.keyboard.type("Fomos a Porto");
  await expect(chip(page)).toHaveText("Ligar a [[Porto]]Tab");
  await page.keyboard.type(" Alegre");
  await expect(chip(page)).toHaveText("Ligar a [[Porto Alegre]]Tab");
  await page.keyboard.type("s");
  await expect(chip(page)).toHaveCount(0);
  await expect(page.locator(".pane.focused .cm-content").first()).toContainText("Fomos a Porto Alegres");
});

test("an accent kept: without it nothing is offered", async ({ app, page }) => {
  await seeded(app);
  await page.keyboard.type("Fomos ao Capitao Ruy");
  await expect(chip(page)).toHaveCount(0);
});

test("the note itself is never suggested", async ({ app, page }) => {
  await seeded(app, {}, { open: "Capitão Ruy.md" });
  await page.keyboard.type("O Capitão Ruy e o Porto");
  await expect(chip(page)).toHaveText("Ligar a [[Porto]]Tab");
  await page.keyboard.press("Escape");
  await page.keyboard.type(" e o Capitão Ruy");
  await expect(chip(page)).toHaveCount(0);
});

test("never in inline code or inside a link being written", async ({ app, page }) => {
  await seeded(app);
  await page.keyboard.type("em `Capitão Ruy");
  await expect(chip(page)).toHaveCount(0);
  await page.keyboard.press("End");
  await page.keyboard.type(" e veja [[Capitão Ruy");
  await expect(chip(page)).toHaveCount(0);
});

test("never in a code block", async ({ app, page }) => {
  await seeded(app, {}, { open: "Codigo.md" });
  await page.keyboard.type("Capitão Ruy");
  await expect(chip(page)).toHaveCount(0);
});

test("the ignored folders and names are left out", async ({ app, page }) => {
  await seeded(app, { suggestIgnoreFolders: ["Arquivo"], suggestIgnoreNames: ["mesa"] });
  await page.keyboard.type("Um Velho");
  await expect(chip(page)).toHaveCount(0);
  await page.keyboard.type(" e a Mesa");
  await expect(chip(page)).toHaveCount(0);
  await page.keyboard.type(" e o Porto");
  await expect(chip(page)).toHaveText("Ligar a [[Porto]]Tab");
});

test("the setting is in Settings › Editor, off, with its two lists, and turning it on works at once", async ({ app, page }) => {
  await page.addInitScript(() => localStorage.removeItem("verso.settings"));
  await app.open("?vault=empty");
  for (const [path, text] of Object.entries(FILES)) await app.writeOutside(path, text);
  await app.folderChanged(Object.keys(FILES), true);
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Editor" }).click();
  const row = page.locator(".settings-body .setting", { hasText: "Sugerir links enquanto escrevo" });
  await expect(row.locator("input[type=checkbox]")).not.toBeChecked();
  await expect(page.getByLabel("Pastas ignoradas")).toBeVisible();
  await expect(page.getByLabel("Nomes ignorados")).toBeVisible();
  await row.locator(".switch").click();
  await expect(row.locator("input[type=checkbox]")).toBeChecked();
  await page.getByLabel("Nomes ignorados").fill("Mesa\nmesa\n\nPorto");
  await page.getByLabel("Nomes ignorados").blur();
  await expect(page.getByLabel("Nomes ignorados")).toHaveValue("Mesa\nmesa\nPorto");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("verso.settings")));
  expect(stored.suggestLinks).toBe(true);
  expect(stored.suggestIgnoreNames).toEqual(["Mesa", "mesa", "Porto"]);
  await page.keyboard.press("Escape");
  await app.quickOpen("Rascunho");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await atEnd(page);
  await page.keyboard.type("Um Porto");
  // The name is ignored: no chip (the longer names it begins are listed).
  await expect(page.locator(".link-suggest-chip")).toHaveCount(0);
  await page.keyboard.type(" e o Capitão Ruy");
  await expect(chip(page)).toHaveCount(1);
});

test("a reader gets no suggestion", async ({ app, page }) => {
  await app.page.addInitScript(() => localStorage.setItem("verso.settings", JSON.stringify({ suggestLinks: true })));
  await app.open("?side=server&role=reader");
  await app.quickOpen("03 - Propriedades");
  await app.key("Mod+e");
  const editor = page.locator(".pane.focused .cm-content").first();
  await expect(editor).toHaveAttribute("aria-readonly", "true");
  await editor.click();
  await page.keyboard.type("Capitão Ruy");
  await expect(chip(page)).toHaveCount(0);
});

const SYNCED = { key: "harness", on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "editor", state: "synced", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], log: [], last: "2026-10-11T12:00:00Z", message: null, problem: null, versions: null, revoked: null };

test("in a live note the accepted link is an edit through the room", async ({ app, page }) => {
  await page.addInitScript(() => localStorage.setItem("verso.settings", JSON.stringify({ suggestLinks: true })));
  await app.open("?vault=empty");
  await page.evaluate(() => (window.__harness.rooms.up = true));
  await page.evaluate((st) => {
    window.__harness.core.handlers.folder_sync = () => st;
  }, SYNCED);
  await app.emit("sync-status", SYNCED);
  for (const [path, text] of Object.entries(FILES)) await app.writeOutside(path, text);
  await app.folderChanged(Object.keys(FILES), true);
  await app.quickOpen("Rascunho");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.locator(".live-mark:visible")).toContainText("ao vivo");
  await atEnd(page);
  await page.keyboard.type("Fomos ao Capitão Ruy");
  await expect(chip(page)).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate((p) => window.__harness.rooms.text(p), DRAFT)).toContain("Fomos ao [[Capitão Ruy]]");
  // Bia is in the room and sees it as an ordinary edit; the file is the room's to write.
  expect(await app.calls("write_text")).toHaveLength(0);
});

test.describe("a phone", () => {
  test.use({ hasTouch: true });
  test.skip(({ browserName }) => browserName !== "chromium", "a tap needs Chromium's touch emulation");

  test("the suggestion is a chip to tap, with no key to press @layout", async ({ app, page }) => {
    await seeded(app);
    await page.keyboard.type("Fomos ao Capitão Ruy");
    await expect(chip(page)).toHaveText("Ligar a [[Capitão Ruy]]");
    await expect(chip(page).locator("kbd")).toHaveCount(0);
    await expect(page.locator("#link-suggest-live")).toHaveText("Sugestão de link: Capitão Ruy, toque para aceitar");
    // A finger-sized target.
    expect((await chip(page).locator("button").boundingBox()).height).toBeGreaterThanOrEqual(44);
    await chip(page).locator("button").tap();
    await page.keyboard.type(" ver");
    expect(await saved(app)).toBe("# Rascunho\n\nFomos ao [[Capitão Ruy]] ver");
  });
});

// ADR 0089 item 5, revised 2026-10-20.
const list = (page) => page.locator(".cm-link-suggest .link-suggest-item");
const mentions = (page) => page.locator(".cm-tooltip-autocomplete li");

test("a partial name lists the notes that begin with it; Tab writes the link over the typed words", async ({ app, page }) => {
  await seeded(app);
  await page.keyboard.type("Fomos a Porto C");
  await expect(list(page)).toHaveCount(1);
  await expect(list(page).first()).toContainText("Porto Cinzento");
  await expect(page.locator("#link-suggest-live")).toContainText("1 sugestão de link");
  await page.keyboard.press("Tab");
  await expect(list(page)).toHaveCount(0);
  await page.keyboard.type(" ver");
  expect(await saved(app)).toBe("# Rascunho\n\nFomos a [[Porto Cinzento]] ver");
});

test("the list narrows, the arrows choose, Esc dismisses it for the word", async ({ app, page }) => {
  await seeded(app);
  await page.keyboard.type("Fomos a Por");
  await expect(list(page).first()).toBeVisible();
  expect(await list(page).count()).toBeGreaterThan(2);
  await page.keyboard.press("ArrowDown");
  await expect(list(page).nth(1)).toHaveClass(/selected/);
  await page.keyboard.type("to A");
  await expect(list(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(list(page)).toHaveCount(0);
  await page.keyboard.type("leg");
  await expect(list(page)).toHaveCount(0);
  await expect(page.locator(".pane.focused .cm-content").first()).toContainText("Fomos a Porto Aleg");
  await expect(page.locator(".pane.focused .cm-content").first()).not.toContainText("[[");
});

test("a lowercase word, or two letters, lists nothing", async ({ app, page }) => {
  await seeded(app);
  await page.keyboard.type("Fomos a por");
  await expect(list(page)).toHaveCount(0);
  await page.keyboard.type(" Po");
  await expect(list(page)).toHaveCount(0);
});

test("the chip stays after a space and Tab still links the name, not the space", async ({ app, page }) => {
  await seeded(app);
  await page.keyboard.type("Fomos ao Capitão Ruy ");
  await expect(chip(page)).toHaveText("Ligar a [[Capitão Ruy]]Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.type("ver");
  expect(await saved(app)).toBe("# Rascunho\n\nFomos ao [[Capitão Ruy]] ver");
});

test("@ opens the note list and choosing writes [[Name]] over the @ and what was typed", async ({ app, page }) => {
  await seeded(app, { suggestLinks: false });
  await page.keyboard.type("Fomos a @Porto C");
  await expect(mentions(page)).toHaveCount(1);
  await expect(mentions(page).first()).toContainText("Porto Cinzento");
  // The completion list ignores a key within its interaction delay.
  await page.waitForTimeout(250);
  await page.keyboard.press("Enter");
  await page.keyboard.type(" ver");
  expect(await saved(app)).toBe("# Rascunho\n\nFomos a [[Porto Cinzento]] ver");
});

test("@ then Esc leaves the text as typed; an e-mail never opens it; the setting turns it off", async ({ app, page }) => {
  await seeded(app, { suggestLinks: false });
  await page.keyboard.type("@Por");
  await expect(mentions(page).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mentions(page)).toHaveCount(0);
  await page.keyboard.type(" e fulano@mail");
  await expect(mentions(page)).toHaveCount(0);
  await expect(page.locator(".pane.focused .cm-content").first()).toContainText("@Por e fulano@mail");
  await expect(page.locator(".pane.focused .cm-content").first()).not.toContainText("[[");
});

test("after Esc the @ list stays closed for the rest of that word; a new @ opens it again (0089.a)", async ({ app, page }) => {
  await seeded(app, { suggestLinks: false });
  await page.keyboard.type("Ir a @Por");
  await expect(mentions(page).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mentions(page)).toHaveCount(0);
  // more characters of the same word do not bring it back
  await page.keyboard.type("to C");
  await page.waitForTimeout(400);
  await expect(mentions(page)).toHaveCount(0);
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(300);
  await expect(mentions(page)).toHaveCount(0);
  // moving the caret away and back does not either
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("i");
  await page.waitForTimeout(300);
  await expect(mentions(page)).toHaveCount(0);
  // a new @ is a new word
  await page.keyboard.type(" e @Mes");
  await expect(mentions(page).first()).toBeVisible();
  await expect(mentions(page).first()).toContainText("Mesa");
});

test("@ is never beside the partial list; the [[ list comes first", async ({ app, page }) => {
  await seeded(app);
  await page.keyboard.type("Ir a @Porto C");
  await expect(mentions(page).first()).toBeVisible();
  await expect(list(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.type(" e [[Porto");
  await expect(mentions(page).first()).toBeVisible();
  await expect(list(page)).toHaveCount(0);
});

test("the @ setting is in Settings › Editor, on by default", async ({ app, page }) => {
  await page.addInitScript(() => localStorage.removeItem("verso.settings"));
  await app.open("?vault=empty");
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Editor" }).click();
  const row = page.locator(".settings-body .setting", { hasText: "Citar uma nota com @" });
  await expect(row.locator("input[type=checkbox]")).toBeChecked();
});

test("the letters before the list are a setting: 2 lists 'Po', and the field is in Settings › Editor", async ({ app, page }) => {
  await seeded(app, { suggestMinLetters: 2 });
  await page.keyboard.type("Fomos a Po");
  await expect(list(page).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Editor" }).click();
  const row = page.locator(".settings-body .setting", { hasText: "Letras para sugerir" });
  await expect(row.locator("input[type=number]")).toHaveValue("2");
  await row.getByRole("button", { name: "Mais uma letra" }).click();
  await expect(row.locator("input[type=number]")).toHaveValue("3");
  await expect(page.locator(".settings-body .setting", { hasText: "Só em palavras com maiúscula" }).locator("input[type=checkbox]")).toBeChecked();
});
