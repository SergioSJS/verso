// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A file's version history (ADR 0091; walkthrough, section 10): the
// versions listed with who and when, a version's diff read as lines that
// go and come, a version restored over the current text — asked first,
// said after —, refused when the file changed meanwhile, through the room
// when the note is live; a copy beside the file; a reader has none; a
// synced folder whose server is out of reach says what it shows.

import { expect, test, modeOn } from "./fixtures.mjs";

const NOTE = "Diario.md";

async function note(app, text = "# Diário\n\num\n") {
  await app.open("?vault=empty");
  await app.writeOutside(NOTE, text);
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Diario");
}

/** Type `text` at the end of the note in the editor, and wait for its save. */
async function typed(app, text) {
  const { page } = app;
  await modeOn(page, "Editar");
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await app.key("Mod+End");
  await page.keyboard.type(text);
  await expect.poll(() => app.file(NOTE), { timeout: 15_000 }).toContain(text.trim());
}

const dialog = (page) => page.getByRole("dialog", { name: "Histórico de versões — Diario" });

test("a note's versions are listed with who and when, read as a diff and one restored @layout", async ({ app, page }) => {
  await note(app);
  await typed(app, "dois\n");
  await app.command("Histórico de versões");
  const d = dialog(page);
  await expect(d).toBeVisible();
  // A table with a header row (item 10).
  await expect(d.locator("thead th")).toHaveText(["Quando", "Quem", "Mudança", "Tamanho"]);
  await expect(d.locator("tbody tr")).toHaveCount(2);
  await expect(d.locator("tbody tr").nth(0).locator("td").nth(1)).toHaveText("Mac de Teste (este computador)");
  await expect(d.locator("tbody tr").nth(0).locator("td").nth(2)).toHaveAttribute("aria-label", "1 linha adicionada, 0 removidas");
  // Written by another program before the window opened it: nobody's.
  await expect(d.locator("tbody tr").nth(1).locator("td").nth(1)).toHaveText("fora do Verso");
  await expect(d.locator(".history-sentence")).toContainText("2 versões, guardadas por 365 dias");
  // The older one: what restoring it would take out, as lines with − and +.
  await d.locator("tbody tr").nth(1).getByRole("button", { name: /^Ver a versão de / }).click();
  await expect(d.locator(".history-diff-said")).toHaveText("Restaurar traz de volta 0 linhas e tira 1 do texto atual.");
  await expect(d.locator("pre.diff")).toContainText("- dois");
  // Against the version before: the first has none.
  await d.getByRole("radio", { name: "a versão anterior" }).check();
  await expect(d.locator(".history-diff")).toHaveText("A primeira versão do histórico: nada antes dela.");
  await d.getByRole("radio", { name: "o texto atual" }).check();
  // Restore: asked first, said after; the editor shows it, and the
  // history keeps the text it replaced.
  await d.getByRole("button", { name: "Restaurar esta versão" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("O texto atual continua no histórico.");
  await page.getByRole("alertdialog").getByRole("button", { name: "Restaurar" }).click();
  await expect(d.locator(".history-said")).toHaveText(/^Versão de .+ restaurada\.$/);
  expect(await app.file(NOTE)).toBe("# Diário\n\num\n");
  await expect(d.locator("tbody tr")).toHaveCount(3);
  await expect(d.locator("tbody tr").nth(0).locator(".history-tag")).toHaveText("restauração");
  await d.getByRole("button", { name: "Fechar" }).click();
  await expect(d).toBeHidden();
  await expect(page.locator(".cm-content").first()).not.toContainText("dois");
});

test("a restore over a file changed meanwhile writes nothing and makes the diff again", async ({ app, page }) => {
  await note(app);
  await typed(app, "dois\n");
  // From the status bar.
  await page.locator(".status-history").click();
  const d = dialog(page);
  await d.locator("tbody tr").nth(1).getByRole("button", { name: /^Ver a versão de / }).click();
  await expect(d.locator("pre.diff")).toContainText("- dois");
  // Another program writes the file while the diff is on screen.
  await app.writeOutside(NOTE, "# Diário\n\noutra coisa\n");
  await d.getByRole("button", { name: "Restaurar esta versão" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Restaurar" }).click();
  await expect(d.locator(".history-said")).toHaveText("O arquivo mudou enquanto você olhava: nada foi escrito. A diferença foi atualizada — confira e restaure de novo.");
  expect(await app.file(NOTE)).toBe("# Diário\n\noutra coisa\n");
  await expect(d.locator("pre.diff")).toContainText("- outra coisa");
});

test("a version copied beside its file, from the tab's menu", async ({ app, page }) => {
  await note(app);
  await typed(app, "dois\n");
  await page.locator(".tab", { hasText: "Diario" }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Histórico de versões" }).click();
  const d = dialog(page);
  await d.locator("tbody tr").nth(1).getByRole("button", { name: /^Ver a versão de / }).click();
  await d.getByRole("button", { name: "Copiar como nova nota" }).click();
  await expect(d.locator(".history-said")).toHaveText(/^Cópia da versão criada em Diario \(versão \d{4}-\d{2}-\d{2} \d{2}h\d{2}\)\.md\.$/);
  const copy = (await app.files()).find((f) => f.startsWith("Diario (versão "));
  expect(await app.file(copy)).toBe("# Diário\n\num\n");
  expect(await app.file(NOTE)).toContain("dois");
});

test("a reader of a server's folder has no history", async ({ app, page }) => {
  await app.open("?side=server&role=reader");
  await app.quickOpen("00 - Bem-vindo");
  await expect(page.locator(".status-history")).toBeHidden();
  await app.key("Mod+Shift+p");
  await page.keyboard.type("Histórico de versões");
  await expect(page.locator(".quick:not([hidden]) .quick-list li")).toHaveCount(0);
  await app.key("Escape");
  const refused = await page.evaluate(() => {
    try {
      window.__harness.core.invoke("history_list", { path: "00 - Bem-vindo ao Verso.md" });
      return null;
    } catch (e) {
      return e.kind;
    }
  });
  expect(refused).toBe("refused");
});

const SYNCED = { key: "harness", on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "editor", state: "synced", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], log: [], last: "2026-10-14T12:00:00Z", message: null, problem: null, versions: null, revoked: null };

async function say(app, status) {
  await app.page.evaluate((st) => {
    window.__harness.core.sync = st;
    window.__harness.core.handlers.folder_sync = () => st;
  }, status);
  await app.emit("sync-status", status);
}

test("a restore over a live note goes through its room, and the others see it", async ({ app, page }) => {
  await app.open("?vault=empty");
  await page.evaluate(() => (window.__harness.rooms.up = true));
  await say(app, SYNCED);
  await app.writeOutside(NOTE, "# Diário\n\num\n");
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Diario");
  await modeOn(page, "Editar");
  await expect(page.locator(".live-mark:visible")).toHaveText(/^ao vivo/);
  // Bia types; the room saves.
  await page.evaluate((n) => {
    window.__harness.rooms.present(n, "Bia");
    window.__harness.rooms.type(n, "Bia", "dois, da Bia\n");
    window.__harness.versions.roomSave(n);
  }, NOTE);
  const editor = page.locator(".cm-content").first();
  await expect(editor).toContainText("dois, da Bia");
  await app.command("Histórico de versões");
  const d = dialog(page);
  await expect(d.locator("tbody tr").nth(0).locator("td").nth(1)).toContainText("Ana, Bia");
  await expect(d.locator("tbody tr").nth(0).locator(".history-tag")).toHaveText("editada junto");
  await d.locator("tbody tr").nth(1).getByRole("button", { name: /^Ver a versão de / }).click();
  await d.getByRole("button", { name: "Restaurar esta versão" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Restaurar" }).click();
  await expect(d.locator(".history-said")).toHaveText(/restaurada\.$/);
  // The room holds it, the editor shows it, the file has it; no conflict.
  expect(await page.evaluate((n) => window.__harness.rooms.text(n), NOTE)).toBe("# Diário\n\num\n");
  expect(await app.file(NOTE)).toBe("# Diário\n\num\n");
  await d.getByRole("button", { name: "Fechar" }).click();
  await expect(editor).not.toContainText("dois, da Bia");
  await expect(page.locator(".conflict:visible")).toHaveCount(0);
});

test("a synced folder whose server is out of reach shows this computer's versions, and says so", async ({ app, page }) => {
  await note(app);
  await say(app, { ...SYNCED, state: "offline" });
  await app.command("Histórico de versões");
  await expect(dialog(page).locator(".history-partial")).toHaveText("Mostrando só as versões deste computador: o servidor está fora de alcance. As versões dele voltam quando ele voltar.");
  await expect(dialog(page).locator("tbody tr")).toHaveCount(1);
});

test("a deleted note's history is reached from its entry in the trash, and a version brings it back", async ({ app, page }) => {
  await note(app);
  await typed(app, "dois\n");
  await page.evaluate((p) => window.__harness.core.invoke("delete_note", { path: p }), NOTE);
  await app.command("Abrir a lixeira");
  const row = page.locator(".settings-body tr[data-path='.trash/Diario.md']");
  await row.getByRole("button", { name: "Histórico de versões — Diario" }).click();
  const d = dialog(page);
  await expect(d.locator(".web-warn")).toContainText("Este arquivo está na lixeira desde");
  await expect(d.locator("tbody tr")).toHaveCount(2);
  await d.locator("tbody tr").nth(0).getByRole("button", { name: /^Ver a versão de / }).click();
  await expect(d.locator(".history-diff")).toContainText("O arquivo não está na pasta agora.");
  await d.getByRole("button", { name: "Restaurar esta versão" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Restaurar" }).click();
  await expect(d.locator(".history-said")).toHaveText(/restaurada\.$/);
  expect(await app.file(NOTE)).toContain("dois");
});
