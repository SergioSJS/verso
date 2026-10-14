// Dice and random tables (ADR 0088): a `dice:` code rolls in the reading
// view and in Live Preview, a table or a list with an `^id` gives a row,
// nothing is written; in a room the server rolls and another member's roll
// shows with their name; the palette's roller rolls without a note. The
// harness plays the server's room (`src/harness/room.ts`).

import { test, expect } from "./fixtures.mjs";

const NOTE = "Mesa.md";
const TEXT = [
  "# Mesa",
  "",
  "Ataque: `dice: 1d20+3` e dano `dice: 2d6`.",
  "",
  "Encontro: `dice: [[Mesa#^encontros]]`",
  "",
  "| d6 | Encontro |",
  "| --- | --- |",
  "| 1–3 | [[Lobos]] |",
  "| 4–6 | Nada |",
  "",
  "^encontros",
  "",
  "Código: `dice: 1d20*2` e `1d6`.",
  "",
].join("\n");

const SYNCED = { key: "harness", on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "editor", state: "synced", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], log: [], last: "2026-10-11T12:00:00Z", message: null, problem: null, versions: null, revoked: null };

async function openNote(app) {
  await app.writeOutside(NOTE, TEXT);
  await app.writeOutside("Lobos.md", "# Lobos\n");
  await app.folderChanged([NOTE, "Lobos.md"], true);
  await app.quickOpen("Mesa");
}

test("a dice code rolls in the reading view and in Live Preview, and the note is never written", async ({ app, page }) => {
  await app.open();
  await openNote(app);
  const preview = page.locator(".preview:visible");
  const attack = preview.getByRole("button", { name: "Rolar 1d20+3" });
  await expect(attack).toBeVisible();
  // A code Verso does not read stays code (item 1).
  await expect(preview.locator("code", { hasText: "dice: 1d20*2" })).toBeVisible();
  await attack.click();
  const card = preview.locator('.dice[data-dice="1d20+3"] .dice-card');
  await expect(card).toBeVisible();
  const total = Number(await card.locator(".dice-total").textContent());
  expect(total).toBeGreaterThanOrEqual(4);
  expect(total).toBeLessThanOrEqual(23);
  await expect(page.locator(".dice-said")).toHaveText(new RegExp(`^1d20\\+3: ${total} — \\d+ mais 3$`));
  // By the keyboard: Enter on "Rolar de novo".
  await card.getByRole("button", { name: "Rolar de novo" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".dice-said")).toHaveText(/^1d20\+3: \d+/);

  // A random table: the row the die chose, its link followed with a click.
  const table = preview.getByRole("button", { name: "Rolar na tabela [[Mesa#^encontros]]" });
  await table.click();
  const row = preview.locator('.dice[data-dice="[[Mesa#^encontros]]"] .dice-row');
  await expect(row).toHaveText(/^(Lobos|Nada)$/);

  // Live Preview: the die off the caret's line, a click rolls.
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const editor = page.locator(".cm-content").first();
  const die = editor.getByRole("button", { name: "Rolar 2d6" });
  await expect(die).toBeVisible();
  await die.click();
  await expect(editor.locator('.dice[data-dice="2d6"] .dice-total')).toHaveText(/^\d+$/);
  await expect(page.locator(".dice-said")).toHaveText(/^2d6: \d+ — \d+, \d+$/);

  await page.waitForTimeout(1500);
  expect(await app.file(NOTE)).toBe(TEXT);
  expect(await app.calls("write_note")).toHaveLength(0);
  // Alone, the window rolled: the server was never asked.
  expect(await app.calls("collab_roll")).toHaveLength(0);
});

test("a table that is not there says so", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Sem.md", "Sorte: `dice: [[Nenhuma#^tabela]]` e `dice: [[Sem#^falta]]`\n");
  await app.folderChanged(["Sem.md"], true);
  await app.quickOpen("Sem");
  const preview = page.locator(".preview:visible");
  await preview.getByRole("button", { name: "Rolar na tabela [[Nenhuma#^tabela]]" }).click();
  await expect(preview.locator(".dice-failed").first()).toHaveText("A tabela [[Nenhuma#^tabela]] não foi encontrada.");
  await preview.getByRole("button", { name: "Rolar na tabela [[Sem#^falta]]" }).click();
  await expect(preview.locator(".dice-failed").nth(1)).toHaveText("Nenhum bloco ^falta nessa nota.");
  await expect(page.locator(".dice-said")).toHaveText("Nenhum bloco ^falta nessa nota.");
});

test("in a room the server rolls, and another member's roll shows with their name", async ({ app, page }) => {
  await app.open();
  await page.evaluate(() => (window.__harness.rooms.up = true));
  await page.evaluate((st) => {
    window.__harness.core.handlers.folder_sync = () => st;
  }, SYNCED);
  await app.emit("sync-status", SYNCED);
  await openNote(app);
  const preview = page.locator(".preview:visible");
  const attack = preview.getByRole("button", { name: "Rolar 1d20+3" });
  await attack.click();
  await expect.poll(async () => (await app.calls("collab_roll")).length).toBe(1);
  expect((await app.calls("collab_roll"))[0]).toEqual({ path: NOTE, notation: "1d20+3", source: null });
  const card = preview.locator('.dice[data-dice="1d20+3"] .dice-card');
  await expect(card.locator(".dice-total")).toHaveText(/^\d+$/);
  // This window's own roll does not say whose it is.
  await expect(card.locator(".dice-who")).toHaveCount(0);

  // Bia rolls the same die: her roll, by the server, shown and said.
  await page.evaluate((n) => window.__harness.rooms.roll(n, "Bia", "1d20+3", null, [14]), NOTE);
  await expect(card.locator(".dice-who")).toHaveText("Bia rolou");
  await expect(card.locator(".dice-total")).toHaveText("17");
  await expect(page.locator(".dice-said")).toHaveText("Bia rolou 1d20+3: 17 — 14 mais 3");
  // A die the note does not show: a notice, with her name.
  await page.evaluate((n) => window.__harness.rooms.roll(n, "Bia", "4d6kh3", null, [3, 6, 1, 6]), NOTE);
  const toast = page.locator(".notify-toast").filter({ hasText: "Bia rolou 4d6kh3" });
  await expect(toast.locator(".notify-toast-title")).toHaveText("Mesa");
  await expect(toast.locator(".notify-toast-sentence")).toHaveText("Bia rolou 4d6kh3: 15 — 3, 6, 6 (descartados 1)");
  expect(await app.file(NOTE)).toBe(TEXT);
});

test("the palette's roller rolls a typed notation and says what it does not read", async ({ app, page }) => {
  await app.open();
  await app.command("Rolar dados");
  const dialog = page.getByRole("dialog", { name: "Rolar dados" });
  await expect(dialog).toBeVisible();
  const field = dialog.getByRole("textbox", { name: "Notação, como 1d20+3" });
  await expect(field).toBeFocused();
  await field.fill("2d6 + 1");
  await page.keyboard.press("Enter");
  await expect(dialog.locator(".dice-roller-out")).toHaveText(/^\d+2d6\+1: \d+ — \d+, \d+ mais 1$/);
  await field.fill("1d20*2");
  await page.keyboard.press("Enter");
  await expect(dialog.locator(".dice-roller-out")).toHaveText("Verso não lê “1d20*2” como dados: tente 1d20+3, 4d6kh3 ou 4dF.");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the tutorial's note 24 rolls its dice and its tables, and stays as it was (walkthrough 3.13)", async ({ app, page }) => {
  await app.open();
  const path = "24 - Dados e Tabelas Sorteadas.md";
  const before = await app.file(path);
  await app.quickOpen("24 - Dados e Tabelas");
  const preview = page.locator(".preview:visible");
  await preview.getByRole("button", { name: "Rolar 1d20+5" }).click();
  await expect(preview.locator('.dice[data-dice="1d20+5"] .dice-total')).toHaveText(/^\d+$/);
  await expect(preview.locator("code", { hasText: "dice: 1d20*2" }).first()).toBeVisible();
  await preview.getByRole("button", { name: "Rolar na tabela [[24 - Dados e Tabelas Sorteadas#^encontros]]" }).click();
  const row = preview.locator('.dice[data-dice="[[24 - Dados e Tabelas Sorteadas#^encontros]]"] .dice-row');
  await expect(row).toHaveText(/^(Uma patrulha da guarda, desconfiada|Um mercador com a carroça atolada|Lobos famintos, e Capitão Ruy chega para ajudar|Nada; só o vento)$/);
  await preview.getByRole("button", { name: "Rolar na tabela [[24 - Dados e Tabelas Sorteadas#^tempo]]" }).click();
  await expect(preview.locator('.dice[data-dice="[[24 - Dados e Tabelas Sorteadas#^tempo]]"] .dice-row')).toHaveText(/^(Sol forte|Garoa fina|Neblina até o meio-dia|Tempestade à noite)$/);
  await page.waitForTimeout(1000);
  expect(await app.file(path)).toBe(before);
  expect(await app.calls("write_note")).toHaveLength(0);
});
