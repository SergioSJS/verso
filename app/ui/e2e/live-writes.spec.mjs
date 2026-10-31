// Walkthrough, section 10: writes to a live note that are not keystrokes
// (ADR 0082, decided 2026-10-12; roadmap 3.19). A sticker, a base's cell
// and a PDF's quote, written to a synced folder's note that is live, go
// into its room as typing goes — never to the file, which follows the
// room's save — in both situations the walkthrough steps through:
//
// - the note is held live in a tab of this window: the write is an edit
//   of that tab's editor, which the room's binding sends on;
// - the note is live only elsewhere (Bia has it in the room, this window
//   holds it in no tab): the window asks whether someone is in it
//   (`collab_present`), joins, makes its one edit on the room's text,
//   sends it, has the room write the file (`collab_save`) and leaves.
//
// Either way there is no second writer of the note: no `write_note`, no
// conflict shown, no conflict copy in the folder. The harness has no
// server: it plays the server's room (`src/harness/room.ts`), and a test
// says the sync's state (`sync-status`) as the host would (live.spec.mjs).

import { test, expect } from "./fixtures.mjs";
import { pickMenu } from "./menuPath.mjs";

const SYNCED = { key: "harness", on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "editor", state: "synced", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], log: [], last: "2026-10-11T12:00:00Z", message: null, problem: null, versions: null, revoked: null };

/** Say a status as the sync would: the event, and the same status as the
 *  answer to `folder_sync` (see sync.spec.mjs). */
async function say(app, status) {
  await app.page.evaluate((st) => {
    window.__harness.core.handlers.folder_sync = () => st;
  }, status);
  await app.emit("sync-status", status);
}

/** The synced folder online: the room answers, the sync's link is up. */
async function online(app) {
  await app.open();
  await app.page.evaluate(() => (window.__harness.rooms.up = true));
  await say(app, SYNCED);
}

/** Bia comes into the note's room and types a line at its end. */
function biaTypes(app, path, text) {
  return app.page.evaluate(([p, t]) => {
    window.__harness.rooms.present(p, "Bia");
    window.__harness.rooms.type(p, "Bia", t);
  }, [path, text]);
}

/** The note's text as the room has it now. */
const room = (app, path) => app.page.evaluate((p) => window.__harness.rooms.text(p), path);

/** The room writes the note, as sync brings the server's save down. */
const roomSaves = (app, path) => app.page.evaluate((p) => window.__harness.rooms.save(p), path);

/** Open a file with the quick switcher beside the one shown (⌘Enter). */
async function quickOpenAside(app, name) {
  await app.key("Mod+p");
  const field = app.page.getByRole("combobox", { name: "Abrir…" });
  await expect(field).toBeFocused();
  await field.fill(name);
  await expect(app.page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText(name);
  await field.press("ControlOrMeta+Enter");
}

/** No second writer of the note: nothing written with `write_note` or
 *  made with `create_note` — given the time a tab's save would take —
 *  no conflict shown, and no conflict copy in the folder. */
async function noSecondWriter(app) {
  await app.page.waitForTimeout(2000);
  expect(await app.calls("write_note")).toHaveLength(0);
  expect(await app.calls("create_note")).toHaveLength(0);
  await expect(app.page.locator(".conflict:visible")).toHaveCount(0);
  expect((await app.files()).filter((f) => /\((conflito|conflict)\b/.test(f))).toEqual([]);
}

/** Held here: one join, the tab's; no visit to the room. With `path`,
 *  only that file's calls count: a base's own tab is in its own room too
 *  (ADR 0082 item 12). */
async function heldHere(app, path) {
  const of = async (cmd) => (await app.calls(cmd)).filter((a) => !path || a.path === path);
  expect(await of("collab_join")).toHaveLength(1);
  expect(await of("collab_present")).toHaveLength(0);
  expect((await of("collab_update")).length).toBeGreaterThan(0);
}

/** Live only elsewhere: asked, joined, the edit sent, the room asked to
 *  write the file, and left — once each, for the one write. */
async function visited(app, path) {
  // The note's room, joined for the one write; a base's own tab is in its
  // own room besides (ADR 0082 item 12), and leaves it never here.
  for (const cmd of ["collab_present", "collab_join", "collab_save", "collab_leave"]) {
    expect((await app.calls(cmd)).filter((a) => !/\.base$/.test(a.path)), cmd).toEqual([{ path }]);
  }
  const sent = (await app.calls("collab_update")).filter((a) => !/\.base$/.test(a.path));
  expect(sent.length).toBeGreaterThan(0);
  expect(sent.every((a) => a.path === path)).toBe(true);
}

// ---- A sticker -------------------------------------------------------------

const STICKERED = "Sessao com figurinha.md";

test("a sticker set in a note held live here goes into its room, beside what Bia types", async ({ app, page }) => {
  await online(app);
  await app.writeOutside(STICKERED, "---\nestado: rascunho\n---\n# Sessao\n\num\n");
  await app.folderChanged([STICKERED], true);
  await app.quickOpen("Sessao com figurinha");
  await expect(page.locator(".live-mark:visible")).toHaveText("ao vivo, só você");
  await biaTypes(app, STICKERED, "dois, da Bia\n");
  await expect(page.locator(".cm-content").first()).toContainText("dois, da Bia");

  // The note's sticker, from the button by its title: an emoji.
  await page.locator(".note-sticker-btn").click();
  const picker = page.locator(".sticker-picker-popover");
  await picker.locator(".sticker-item-btn").first().click();
  await expect(picker).toHaveCount(0);

  await expect.poll(() => room(app, STICKERED)).toMatch(/^sticker: emoji\/\/\S+$/m);
  const text = await room(app, STICKERED);
  expect(text).toContain("estado: rascunho");
  expect(text).toContain("dois, da Bia");
  await heldHere(app);
  await noSecondWriter(app);
  // The file is the room's to write.
  await roomSaves(app, STICKERED);
  const file = await app.file(STICKERED);
  expect(file).toMatch(/^sticker: emoji\/\//m);
  expect(file).toContain("dois, da Bia");
});

test("a sticker set from the tree on a note live only with Bia joins its room for the write", async ({ app, page }) => {
  await online(app);
  await app.writeOutside(STICKERED, "---\nestado: rascunho\n---\n# Sessao\n\num\n");
  await app.folderChanged([STICKERED], true);
  // Bia has the note open; this window holds it in no tab.
  await biaTypes(app, STICKERED, "dois, da Bia\n");

  // The tree's menu: "Alterar figurinha…", an emoji.
  const row = page.locator(`#notes li[data-path="${STICKERED}"] > button`);
  await row.click({ button: "right" });
  await pickMenu(page, "Personalizar", "Alterar figurinha…");
  const picker = page.locator(".sticker-picker-popover");
  await picker.locator(".sticker-item-btn").first().click();
  await expect(picker).toHaveCount(0);

  await expect.poll(() => app.calls("collab_leave")).toHaveLength(1);
  await visited(app, STICKERED);
  const text = await room(app, STICKERED);
  expect(text).toMatch(/^sticker: emoji\/\/\S+$/m);
  expect(text).toContain("dois, da Bia");
  await noSecondWriter(app);
  // The room wrote the file before the window left; sync brings it down
  // and the tree shows the sticker.
  const file = await app.file(STICKERED);
  expect(file).toMatch(/^sticker: emoji\/\//m);
  expect(file).toContain("dois, da Bia");
  await app.folderChanged([STICKERED], true);
  await expect(row.locator(".entry-sticker")).not.toBeEmpty();
});

// ---- A base's cell ---------------------------------------------------------

const PROJECT = "projetos/Projeto Alpha.md";

/** The status cell of Projeto Alpha in the base's table (the base's order
 *  is name, status, …), its field opened by a double click, a new value
 *  typed and Enter: the cell shows it at once and keeps the focus. */
async function setStatus(app, value) {
  const row = app.page.locator(".base tr", { has: app.page.locator("a.base-file", { hasText: /^Projeto Alpha$/ }) });
  const cell = row.locator("td").nth(1);
  await expect(cell).toHaveText("em_andamento");
  await cell.dblclick();
  const field = cell.locator("input.base-cell-input");
  await field.fill(value);
  await field.press("Enter");
  await expect(cell).toHaveText(value);
  await expect(cell).toBeFocused();
}

test("a base's cell written to a note held live here goes into its room, beside what Bia types", async ({ app, page }) => {
  await online(app);
  await app.quickOpen("Projetos.base");
  await expect(page.locator(".base a.base-file", { hasText: /^Projeto Alpha$/ })).toBeVisible();
  // The note opened beside the base (⌘-click on its name), live.
  await page.locator(".base a.base-file", { hasText: /^Projeto Alpha$/ }).click({ modifiers: ["ControlOrMeta"] });
  // The note's tab says it; the base's own tab is live in its own room.
  await expect(page.getByRole("tabpanel", { name: /^Projeto Alpha/ }).locator(".live-mark")).toHaveText("ao vivo, só você");
  await biaTypes(app, PROJECT, "dois, da Bia\n");
  // Her line lands at the end of a long note, below what the editor
  // draws; the editor is read at the top, where the property is.
  const editor = page.getByRole("tabpanel", { name: /^Projeto Alpha/ }).locator(".cm-content");

  await setStatus(app, "pausado");
  await expect.poll(() => room(app, PROJECT)).toContain("status: pausado");
  const text = await room(app, PROJECT);
  expect(text).not.toContain("em_andamento");
  expect(text).toContain("orcamento: 15000");
  expect(text).toContain("dois, da Bia");
  // The tab's editor holds it as well: the edit went through it.
  await expect(editor).toContainText("status: pausado");
  await heldHere(app, PROJECT);
  await noSecondWriter(app);
  await roomSaves(app, PROJECT);
  const file = await app.file(PROJECT);
  expect(file).toContain("status: pausado");
  expect(file).toContain("dois, da Bia");
});

test("a base's cell written to a note live only with Bia joins its room for the write", async ({ app, page }) => {
  await online(app);
  await biaTypes(app, PROJECT, "dois, da Bia\n");
  await app.quickOpen("Projetos.base");

  await setStatus(app, "pausado");
  await expect.poll(async () => (await app.calls("collab_leave")).filter((a) => a.path === PROJECT)).toHaveLength(1);
  await visited(app, PROJECT);
  const text = await room(app, PROJECT);
  expect(text).toContain("status: pausado");
  expect(text).toContain("orcamento: 15000");
  expect(text).toContain("dois, da Bia");
  await noSecondWriter(app);
  // The room wrote the file before the window left; the base reads it.
  const file = await app.file(PROJECT);
  expect(file).toContain("status: pausado");
  expect(file).toContain("dois, da Bia");
  await app.folderChanged([PROJECT]);
  const row = page.locator(".base tr", { has: page.locator("a.base-file", { hasText: /^Projeto Alpha$/ }) });
  await expect(row.locator("td").nth(1)).toHaveText("pausado");
});

// ---- A PDF's quote ---------------------------------------------------------

const PDF = "assets/manual-verso.pdf";
const COMPANION = "assets/manual-verso — Anotações.md";

/** The companion note, as the first quote makes it. */
const companion = (app) => app.writeOutside(COMPANION, "# Anotações — manual-verso\n\n![[manual-verso.pdf]]\n");

/** The first line of text of the PDF's first page selected in the PDF's
 *  tab (not in the companion's embed of it), and quoted with the bar's
 *  button. */
async function quoteFirstLine(app) {
  const tab = app.page.getByRole("tabpanel", { name: /^manual-verso\.pdf/ });
  const span = tab.locator('.page[data-page-number="1"] .textLayer span', { hasText: "Manual do Verso" }).first();
  await expect(span).toBeVisible({ timeout: 15_000 });
  await span.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await tab.getByRole("button", { name: "Citar seleção nas anotações" }).click();
  await expect(app.page.locator("#status")).toContainText("Trecho citado nas anotações.");
}

/** A quote of page 1 in the note's text: its callout, its line. */
function expectQuote(text) {
  expect(text).toMatch(/^> \[!quote\] \[\[manual-verso\.pdf#page=1&selection=[\d,]+\|manual-verso, página 1\]\]$/m);
  expect(text).toMatch(/^> Manual do Verso/m);
}

test("a PDF's quote into a companion held live here goes into its room, beside what Bia types", async ({ app, page }) => {
  await online(app);
  await companion(app);
  await app.folderChanged([COMPANION], true);
  await app.quickOpen("manual-verso.pdf");
  // The companion beside the PDF, live.
  await quickOpenAside(app, "manual-verso — Anotações");
  await expect(page.locator(".live-mark:visible")).toHaveText("ao vivo, só você");
  await biaTypes(app, COMPANION, "dois, da Bia\n");
  const editor = page.getByRole("tabpanel", { name: /^manual-verso — Anotações/ }).locator(".cm-content");
  await expect(editor).toContainText("dois, da Bia");

  await quoteFirstLine(app);
  await expect.poll(() => room(app, COMPANION)).toContain("[!quote]");
  const text = await room(app, COMPANION);
  expectQuote(text);
  expect(text).toContain("dois, da Bia");
  expect(text.startsWith("# Anotações — manual-verso\n")).toBe(true);
  await expect(editor).toContainText("[!quote]");
  await heldHere(app);
  await noSecondWriter(app);
  await roomSaves(app, COMPANION);
  const file = await app.file(COMPANION);
  expectQuote(file);
  expect(file).toContain("dois, da Bia");
});

test("a PDF's quote into a companion live only with Bia joins its room for the write", async ({ app }) => {
  await online(app);
  await companion(app);
  await app.folderChanged([COMPANION], true);
  // Bia has the companion open; this window shows only the PDF.
  await biaTypes(app, COMPANION, "dois, da Bia\n");
  await app.quickOpen("manual-verso.pdf");

  await quoteFirstLine(app);
  await expect.poll(() => app.calls("collab_leave")).toHaveLength(1);
  await visited(app, COMPANION);
  const text = await room(app, COMPANION);
  expectQuote(text);
  expect(text).toContain("dois, da Bia");
  await noSecondWriter(app);
  // The room wrote the file before the window left.
  const file = await app.file(COMPANION);
  expectQuote(file);
  expect(file).toContain("dois, da Bia");
  // No tab opened on the companion: the PDF's tab is the only one.
  await expect(app.page.locator(".cm-content:visible")).toHaveCount(0);
});
