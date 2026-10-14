// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Linking unlinked mentions (ADR 0089; walkthrough, section 3): the side
// panel lists each place another note writes a note's name — or an alias
// — without a link, with "Linkar" on each and "Linkar todas" over the
// list. One link is written at once over the revision it read; a mention
// that moved since the list is refused and the list drawn again; "Linkar
// todas" shows the plan as a diff and skips, by name, a note changed
// meanwhile; a link made in an open tab is undone there with ⌘Z; a note
// live with someone else takes the link through its room; a reader sees
// the list and no button, and no mention inside a secret block.

import { test, expect } from "./fixtures.mjs";

const PORTO = "---\naliases: [Cidade Invicta]\n---\n# Porto\n";
const VIAGEM = "# Viagem\n\nFomos ao porto de manhã.\n";
const BORDO = "# Bordo\n\nA Cidade Invicta é linda. `Porto` em código.\n";

/** The folder with Porto and two notes that name it, Porto open, the
 *  right panel on its links. */
async function seeded(app, query = "", extra = {}, open = true) {
  await app.open(`?vault=empty${query}`);
  const files = { "Porto.md": PORTO, "Viagem.md": VIAGEM, "Bordo.md": BORDO, ...extra };
  for (const [path, text] of Object.entries(files)) await app.writeOutside(path, text);
  await app.folderChanged(Object.keys(files), true);
  if (!open) return;
  await app.quickOpen("Porto");
  await showLinks(app);
}

async function showLinks(app) {
  const tab = app.page.locator('#right-tabs button[data-tab="backlinks"]');
  if (!(await tab.isVisible())) await app.key("Mod+Alt+ArrowRight");
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

const rows = (page) => page.locator(".mentions-list li.mention");

test("Linkar makes the one mention a link, the alias kept as its text, and the list follows", async ({ app, page }) => {
  await seeded(app);
  await expect(rows(page)).toHaveCount(2);
  await expect(page.locator(".mentions-head .panel-sub")).toHaveText("Menções sem link · 2");
  // The row shows where and what: the note, the line, the words around.
  await expect(rows(page).filter({ hasText: "Viagem" }).locator(".snippet")).toHaveText("Fomos ao porto de manhã.");

  await page.getByRole("button", { name: "Linkar “porto” em Viagem" }).click();
  await expect.poll(() => app.file("Viagem.md")).toBe("# Viagem\n\nFomos ao [[Porto|porto]] de manhã.\n");
  await expect(page.locator("#status")).toHaveText("“porto” agora é um link em Viagem.");
  await expect(rows(page)).toHaveCount(1);
  // The note that now links is a backlink.
  await expect(page.locator(".links-back li")).toContainText(["Viagem"]);
  // The keyboard stays in the list: the next row's button has the focus.
  await expect(page.getByRole("button", { name: "Linkar “Cidade Invicta” em Bordo" })).toBeFocused();

  await page.keyboard.press("Enter");
  await expect.poll(() => app.file("Bordo.md")).toBe("# Bordo\n\nA [[Porto|Cidade Invicta]] é linda. `Porto` em código.\n");
  await expect(page.locator(".mentions-list")).toHaveCount(0);
  // Written through the contract, over the revision read.
  expect((await app.calls("write_text")).map((a) => a.path)).toEqual(["Viagem.md", "Bordo.md"]);
});

test("a mention moved since the list was drawn is refused, nothing written, and the list drawn again", async ({ app, page }) => {
  await seeded(app);
  await expect(rows(page)).toHaveCount(2);
  // Another program adds a line above the mention.
  const moved = "# Viagem\n\nUma linha nova.\n\nFomos ao porto de manhã.\n";
  await app.writeOutside("Viagem.md", moved);
  await page.getByRole("button", { name: "Linkar “porto” em Viagem" }).click();
  await expect(page.locator("#status")).toHaveText("A menção em Viagem mudou desde que a lista foi feita; nada foi escrito. A lista foi atualizada.");
  expect(await app.file("Viagem.md")).toBe(moved);
  // The list read again: the mention where it is now.
  await expect(rows(page).filter({ hasText: "Viagem" }).locator(".path")).toHaveText("linha 5");
  expect(await app.calls("write_text")).toHaveLength(0);
});

test("Linkar todas shows the plan as a diff and skips, by name, a note changed meanwhile", async ({ app, page }) => {
  await seeded(app);
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Linkar as 2 menções desta lista" }).click();
  const dialog = page.locator(".plan:not([hidden])");
  await expect(dialog.locator("#plan-title")).toHaveText("Linkar 2 menções em 2 notas?");
  // Every note and every line it changes, as a list a keyboard reaches.
  await expect(dialog.locator("summary")).toHaveText(["Bordo.md", "Viagem.md"]);
  const viagem = dialog.getByRole("list", { name: "Viagem.md" });
  await expect(viagem.locator(".del")).toHaveText("- Fomos ao porto de manhã.\n");
  await expect(viagem.locator(".add")).toHaveText("+ Fomos ao [[Porto|porto]] de manhã.\n");
  await expect(viagem).toHaveAttribute("tabindex", "0");
  // Nothing written before the confirmation.
  expect(await app.file("Viagem.md")).toBe(VIAGEM);

  // Bordo changes on disk while the plan is on screen.
  const changed = "# Bordo\n\nA Cidade Invicta é linda. `Porto` em código.\n\nOutra linha.\n";
  await app.writeOutside("Bordo.md", changed);
  await dialog.getByRole("button", { name: "Linkar todas" }).click();
  await expect.poll(() => app.file("Viagem.md")).toBe("# Viagem\n\nFomos ao [[Porto|porto]] de manhã.\n");
  expect(await app.file("Bordo.md")).toBe(changed);
  await expect(page.locator(".plan-notice")).toContainText("Não atualizada: Bordo. Mudou em disco enquanto isso.");
  await expect(page.locator("#status")).toHaveText("1 atualizada, 1 não.");
});

test("a link made in a note open in a tab is undone there with ⌘Z", async ({ app, page }) => {
  await seeded(app, "", {}, false);
  // Viagem open, and Porto beside it (⌘Enter in the quick switcher): the
  // panel shows Porto's links.
  await app.quickOpen("Viagem");
  const viagem = page.getByRole("tabpanel", { name: /^Viagem/ }).locator(".cm-content");
  await expect(viagem).toContainText("Fomos ao porto");
  await app.key("Mod+p");
  await page.getByRole("combobox", { name: "Abrir…" }).fill("Porto");
  await expect(page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText("Porto");
  await page.getByRole("combobox", { name: "Abrir…" }).press("ControlOrMeta+Enter");
  await expect(page.getByRole("tabpanel", { name: /^Porto/ })).toBeVisible();
  await showLinks(app);

  await page.getByRole("button", { name: "Linkar “porto” em Viagem" }).click();
  await expect(viagem).toContainText("[[Porto|porto]]");
  await expect.poll(() => app.file("Viagem.md")).toBe("# Viagem\n\nFomos ao [[Porto|porto]] de manhã.\n");
  // Saved from the tab, over the revision the tab read.
  expect((await app.calls("write_note")).map((a) => a.path)).toEqual(["Viagem.md"]);

  // Viagem's tab, in Editar: its editor keeps the edit in its history.
  await page.getByRole("tabpanel", { name: /^Viagem/ }).getByRole("button", { name: "Editar", exact: true }).click();
  await viagem.click();
  await app.key("Mod+z");
  await expect(viagem).toContainText("Fomos ao porto de manhã.");
  await expect.poll(() => app.file("Viagem.md"), { timeout: 15_000 }).toBe(VIAGEM);
});

const SYNCED = { key: "harness", on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "editor", state: "synced", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], log: [], last: "2026-10-11T12:00:00Z", message: null, problem: null, versions: null, revoked: null };

test("a note live only with someone else takes the link through its room, beside what she types", async ({ app, page }) => {
  await seeded(app, "", {}, false);
  // The synced folder online (live-writes.spec.mjs): the room answers.
  await page.evaluate((st) => {
    window.__harness.rooms.up = true;
    window.__harness.core.handlers.folder_sync = () => st;
  }, SYNCED);
  await app.emit("sync-status", SYNCED);
  // Bia has Viagem open and types in it; this window holds it in no tab.
  await page.evaluate(() => {
    window.__harness.rooms.present("Viagem.md", "Bia");
    window.__harness.rooms.type("Viagem.md", "Bia", "dois, da Bia\n");
  });
  await app.quickOpen("Porto");
  await showLinks(app);

  await page.getByRole("button", { name: "Linkar “porto” em Viagem" }).click();
  await expect(page.locator("#status")).toHaveText("“porto” agora é um link em Viagem.");
  const of = async (cmd) => (await app.calls(cmd)).filter((a) => a.path === "Viagem.md");
  await expect.poll(() => of("collab_leave")).toHaveLength(1);
  for (const cmd of ["collab_present", "collab_join", "collab_save"]) expect(await of(cmd), cmd).toHaveLength(1);
  const room = await page.evaluate(() => window.__harness.rooms.text("Viagem.md"));
  expect(room).toContain("Fomos ao [[Porto|porto]] de manhã.");
  expect(room).toContain("dois, da Bia");
  // No second writer of the note: the room wrote it.
  expect(await app.calls("write_text")).toHaveLength(0);
  expect(await app.calls("write_note")).toHaveLength(0);
  expect(await app.file("Viagem.md")).toContain("[[Porto|porto]]");
});

test("a reader sees the mentions without the buttons, and none inside a secret block", async ({ app, page }) => {
  await seeded(app, "&side=server&role=reader", { "Mesa.md": "# Mesa\n\n> [!secret] Só a mestra\n> O Porto esconde.\n" });
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: "Mesa" })).toHaveCount(0);
  await expect(page.locator(".mention-link")).toHaveCount(0);
  await expect(page.locator(".mentions-all")).toHaveCount(0);
});

test("the owner sees the mention inside a secret block, marked as any other", async ({ app, page }) => {
  await seeded(app, "&side=server", { "Mesa.md": "# Mesa\n\n> [!secret] Só a mestra\n> O Porto esconde.\n" });
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Linkar “Porto” em Mesa" })).toBeVisible();
});
