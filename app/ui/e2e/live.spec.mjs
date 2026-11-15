// Walkthrough, section 10: a synced folder's note edited together, live,
// while the sync is online (ADR 0082). The harness has no server: it plays
// the server's room (`src/harness/room.ts`), and a test says the sync's
// state (`sync-status`) as the host would.

import { test, expect, modeOn } from "./fixtures.mjs";

const NOTE = "Sessao ao vivo.md";

const SYNCED = { key: "harness", on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "editor", state: "synced", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], cloud_only: [], log: [], last: "2026-10-11T12:00:00Z", message: null, problem: null, versions: null, revoked: null, cloud: null };

/** Say a status as the sync would: the event, and the same status as the
 *  answer to `folder_sync` (see sync.spec.mjs). */
async function say(app, status) {
  await app.page.evaluate((st) => {
    window.__harness.core.handlers.folder_sync = () => st;
  }, status);
  await app.emit("sync-status", status);
}

/** The sync's link up or down: the room answers, and the host's
 *  capabilities say `collab`, only while it is up. */
const link = (app, up) => app.page.evaluate((u) => (window.__harness.rooms.up = u), up);

async function openNote(app) {
  await app.writeOutside(NOTE, "# Sessao\n\num\n");
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Sessao ao vivo");
  await modeOn(app.page, "Editar");
}

test("a synced folder's note is live with the others, goes local when the link drops, and comes back", async ({ app, page }) => {
  await app.open();
  await link(app, true);
  await say(app, SYNCED);
  await openNote(app);
  const mark = page.locator(".live-mark:visible");
  await expect(mark).toHaveText("ao vivo, só você");
  await expect(page.locator("#live-state")).toHaveText("ao vivo, só você");
  expect(await app.calls("collab_join")).toHaveLength(1);

  // Bia comes in and types: her name is said, her text arrives.
  await page.evaluate((n) => {
    window.__harness.rooms.present(n, "Bia");
    window.__harness.rooms.type(n, "Bia", "dois, da Bia\n");
  }, NOTE);
  await expect(mark).toHaveText("ao vivo, com Bia");
  await expect(page.locator("#live-state")).toHaveText("ao vivo, com Bia");
  const editor = page.locator(".cm-content").first();
  await expect(editor).toContainText("dois, da Bia");

  // What is typed here goes to the room, not to the file; the room's save
  // is what reaches it.
  await editor.click();
  await app.key("Mod+End");
  await page.keyboard.type("tres, daqui");
  await expect.poll(async () => (await app.calls("collab_update")).length).toBeGreaterThan(0);
  await page.waitForTimeout(2000);
  expect(await app.calls("write_note")).toHaveLength(0);
  await page.evaluate((n) => window.__harness.rooms.save(n), NOTE);
  expect(await app.file(NOTE)).toContain("tres, daqui");

  // The link drops: the note goes local, its text kept, said in words —
  // and what is typed now is saved on this computer.
  await link(app, false);
  await say(app, { ...SYNCED, state: "offline" });
  await expect(mark).toHaveText("local — sem conexão");
  await expect(page.locator("#status")).toContainText("A nota agora é local: a conexão caiu");
  await expect(editor).toContainText("dois, da Bia");
  await editor.click();
  await app.key("Mod+End");
  await page.keyboard.type(" e quatro, sem rede");
  await expect.poll(() => app.file(NOTE), { timeout: 15_000 }).toContain("quatro, sem rede");
  expect((await app.calls("write_note")).length).toBeGreaterThan(0);

  // Back: the same room, what was typed meanwhile merged into it.
  await link(app, true);
  await say(app, { ...SYNCED, state: "syncing" });
  await expect(mark).toHaveText(/^ao vivo/);
  await expect(page.locator("#status")).toContainText("A nota está ao vivo de novo.");
  expect(await app.calls("collab_join")).toHaveLength(2);
  await expect.poll(() => page.evaluate((n) => window.__harness.rooms.text(n), NOTE)).toContain("quatro, sem rede");

  // Sync paused: local again, and said why.
  await link(app, false);
  await say(app, { ...SYNCED, state: "paused" });
  await expect(mark).toHaveText("local — sincronização pausada");
});

test("back in another room, the note is read anew; with editing together off it stays local", async ({ app, page }) => {
  await app.open();
  await link(app, true);
  await say(app, SYNCED);
  await openNote(app);
  const mark = page.locator(".live-mark:visible");
  await expect(mark).toHaveText("ao vivo, só você");

  // Out, and the room made again meanwhile (another epoch): the tab saves
  // its text here, leaves, and reads the note anew into the new room.
  await link(app, false);
  await say(app, { ...SYNCED, state: "offline" });
  await expect(mark).toHaveText("local — sem conexão");
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await app.key("Mod+End");
  await page.keyboard.type("escrito fora");
  await expect.poll(() => app.file(NOTE), { timeout: 15_000 }).toContain("escrito fora");
  await page.evaluate((n) => window.__harness.rooms.forget(n), NOTE);
  await link(app, true);
  await say(app, { ...SYNCED, state: "syncing" });
  await expect(mark).toHaveText("ao vivo, só você");
  await expect.poll(async () => (await app.calls("collab_join")).length).toBe(3);
  await expect(editor).toContainText("escrito fora");

  // The folder's setting, in its Sync section: off, the note leaves the
  // room and stays this computer's.
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Sincronizar" }).click();
  const together = page.getByRole("checkbox", { name: /Editar notas junto enquanto online/ });
  await expect(together).toBeChecked();
  await together.uncheck();
  await app.key("Escape");
  await expect(mark).toHaveText("local — edição junto desligada");
  expect((await app.calls("collab_leave")).length).toBeGreaterThan(0);
  // Kept across a reload — the person's, in this window's settings: the
  // note opened again joins nothing, and is saved here.
  await page.reload();
  await page.waitForFunction(() => window.__harness?.ready === true);
  await link(app, true);
  await say(app, SYNCED);
  await openNote(app);
  await page.waitForTimeout(500);
  expect(await app.calls("collab_join")).toHaveLength(0);
  await expect(page.locator(".live-mark:visible")).toHaveCount(0);
  await page.locator(".cm-content").first().click();
  await app.key("Mod+End");
  await page.keyboard.type("so aqui");
  await expect.poll(() => app.file(NOTE), { timeout: 15_000 }).toContain("so aqui");
});

test("a property set in the panel of a live note goes into the room, beside what another person types", async ({ app, page }) => {
  // ADR 0082, decided 2026-10-12: the panel's writes go through the room
  // as typing does — never to the file, which follows the room's save.
  const NOTED = "Sessao com estado.md";
  await app.open();
  await link(app, true);
  await say(app, SYNCED);
  await app.writeOutside(NOTED, "---\nestado: rascunho\npronta: false\n---\n# Sessao\n\num\n");
  await app.folderChanged([NOTED], true);
  await app.quickOpen("Sessao com estado");
  await expect(page.locator(".live-mark:visible")).toHaveText("ao vivo, só você");

  // Bia types in the body while the value is changed here.
  await page.evaluate((n) => {
    window.__harness.rooms.present(n, "Bia");
    window.__harness.rooms.type(n, "Bia", "dois, da Bia\n");
  }, NOTED);
  const value = page.locator('.props .prop[data-key="estado"] input');
  await value.fill("pronta");
  await value.press("Enter");
  await page.locator('.props .prop[data-key="pronta"] input[type="checkbox"]').check();
  const room = () => page.evaluate((n) => window.__harness.rooms.text(n), NOTED);
  await expect.poll(room).toContain("estado: pronta");
  await expect.poll(room).toContain("pronta: true");
  expect(await room()).toContain("dois, da Bia");
  await page.waitForTimeout(2000);
  expect(await app.calls("write_note")).toHaveLength(0);
  await page.evaluate((n) => window.__harness.rooms.save(n), NOTED);
  const file = await app.file(NOTED);
  expect(file).toContain("estado: pronta");
  expect(file).toContain("dois, da Bia");
});

/** Two cards, as Obsidian writes a canvas. */
const BOARD = "Mesa ao vivo.canvas";
const TWO = '{\n\t"nodes":[\n\t\t{"id":"a","x":0,"y":0,"width":250,"height":60,"type":"text","text":"Alfa"},\n\t\t{"id":"b","x":400,"y":0,"width":250,"height":60,"type":"text","text":"Beta"}\n\t],\n\t"edges":[]\n}';

/** Drag a card by its middle, as a person does. */
async function drag(app, id, dx, dy) {
  const at = await app.centerOf(id);
  await app.page.mouse.move(at.x, at.y);
  await app.page.mouse.down();
  await app.page.mouse.move(at.x + dx, at.y + dy, { steps: 8 });
  await app.page.mouse.up();
}

const cardY = async (app, text, id) => JSON.parse(text).nodes.find((n) => n.id === id).y;

test("a synced folder's board is live: what is drawn goes to the room, which writes the file; offline it is saved here, and back it is live again", async ({ app, page }) => {
  await app.open();
  await link(app, true);
  await say(app, SYNCED);
  await app.writeOutside(BOARD, TWO);
  await app.folderChanged([BOARD], true);
  await app.quickOpen("Mesa ao vivo");
  await app.boardReady();
  const mark = page.locator(".live-mark:visible");
  await expect(mark).toHaveText("ao vivo, só você");
  expect(await app.calls("collab_join")).toHaveLength(1);

  // A card moved here goes to the room as its element, with the file this
  // window's converter makes of the room; the tab writes nothing itself.
  await drag(app, "b", 60, 120);
  await expect.poll(async () => (await app.calls("collab_canvas")).length, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  expect(await app.calls("write_board")).toHaveLength(0);
  await page.evaluate((n) => window.__harness.rooms.save(n), BOARD);
  await expect.poll(async () => cardY(app, await app.file(BOARD), "b")).toBeGreaterThan(50);

  // The link drops: the board goes local, said in words, and what is
  // drawn now is saved on this computer.
  await link(app, false);
  await say(app, { ...SYNCED, state: "offline" });
  await expect(mark).toHaveText("local — sem conexão");
  await expect(page.locator("#status")).toContainText("O quadro agora é local: a conexão caiu");
  await drag(app, "a", 0, 300);
  await expect.poll(async () => cardY(app, await app.file(BOARD), "a"), { timeout: 15_000 }).toBeGreaterThan(200);
  expect((await app.calls("write_board")).length).toBeGreaterThan(0);

  // Back: the same room, live again, and what was drawn meanwhile handed
  // to it — the room's save has both cards where they were left.
  const handed = (await app.calls("collab_canvas")).length;
  await link(app, true);
  await say(app, { ...SYNCED, state: "syncing" });
  await expect(mark).toHaveText(/^ao vivo/);
  await expect(page.locator("#status")).toContainText("O quadro está ao vivo de novo.");
  await expect.poll(async () => (await app.calls("collab_canvas")).length, { timeout: 15_000 }).toBeGreaterThan(handed);
  await page.evaluate((n) => window.__harness.rooms.save(n), BOARD);
  const saved = await app.file(BOARD);
  expect(await cardY(app, saved, "a")).toBeGreaterThan(200);
  expect(await cardY(app, saved, "b")).toBeGreaterThan(50);
});
