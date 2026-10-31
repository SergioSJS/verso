// Saved rolls in the table's dice tray (ADR 0107, "saved rolls", 2026-10-23):
// the lines of a note that hold a dice code are buttons; a click fills the
// message field as `/r …` (it does not roll); "Salvar" files the composed roll in
// the note (the note is headed "Rolagens", so the line joins its list); a reader sees no "Salvar"; a player at a campaign table finds
// the note granted to it alone. Screenshots, when $HOME/.cache/composer-shots
// exists (mounted by the runner), for reading by eye.

import { test, expect } from "./fixtures.mjs";
import { existsSync } from "node:fs";

const SHOTS = `${process.env.HOME ?? "/root"}/.cache/composer-shots`;
const shot = async (page, name) => {
  if (existsSync(SHOTS)) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;

const ROLLS = "# Rolagens\n\n- Ataque da Bia: `dice: 1d20+7`\n- Dano: `dice: 2d6+4`\n- Uma frase sem dados.\n";

/** The bookmark's pop-over open (it closes when a roll is picked). */
async function openSaved(view) {
  const bookmark = view.getByRole("button", { name: "Rolagens salvas", exact: true });
  await expect(bookmark).toBeVisible();
  if ((await bookmark.getAttribute("aria-expanded")) !== "true") await bookmark.click();
  await expect(view.locator(".saved-rolls")).toBeVisible();
}

async function showTray(app, page, files) {
  await app.writeOutside("Diario.md", "# Diário\n");
  for (const [p, t] of Object.entries(files)) await app.writeOutside(p, t);
  await app.folderChanged(["Diario.md", ...Object.keys(files)], true);
  if (phone(page)) await page.locator(".bar-right").click();
  else await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  // A phone keeps the dice row behind its button: open it first.
  const toggle = view.getByRole("button", { name: "Dados", exact: true });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  await openSaved(view);
  return view;
}

/** The note picker (the quick switcher) answered with `name`. */
async function chooseNote(page, name) {
  const box = page.getByRole("combobox", { name: "Abrir…" });
  await box.fill(name);
  await expect(page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText(name);
  await box.press("Enter");
}

const field = (view) => view.getByRole("textbox", { name: /^Mensagem para a mesa/ });
const mod = (view) => view.getByRole("spinbutton", { name: "Modificador da rolagem" });
const saved = (view) => view.locator(".saved-rolls");
const rollsOf = (view) => saved(view).locator("button.saved-roll");

test("a note's named rolls are buttons; a click fills the field and does not roll; Salvar files a new one @layout", async ({ app, page }) => {
  await app.open("?vault=empty");
  const view = await showTray(app, page, { "Rolagens.md": ROLLS });
  await expect(saved(view)).toContainText("Escolher nota…");
  await expect(rollsOf(view)).toHaveCount(0);
  await saved(view).getByRole("button", { name: "Escolher nota…" }).click();
  await chooseNote(page, "Rolagens");
  await expect(rollsOf(view)).toHaveCount(2);
  await expect(rollsOf(view).nth(0)).toContainText("Ataque da Bia");
  await expect(rollsOf(view).nth(1)).toContainText("Dano");
  await expect(saved(view).getByRole("button", { name: /^Nota: Rolagens/ })).toBeVisible();
  // A click puts the roll in the field; nothing is rolled.
  await rollsOf(view).nth(0).click();
  await expect(field(view)).toHaveValue("/r 1d20+7");
  await expect(view.locator(".table-log .table-entry")).toHaveCount(0);
  // The pop-over closed on the pick; the modifier steps the line in the field.
  await expect(saved(view)).toBeHidden();
  if (!(await mod(view).isVisible())) await view.getByRole("button", { name: "Mais dados", exact: true }).click();
  await mod(view).press("ArrowUp");
  await page.keyboard.press("Escape");
  await expect(field(view)).toHaveValue("/r 1d20+8");
  await openSaved(view);
  await shot(page, `${phone(page) ? "phone" : "desktop"}-saved`);
  // Salvar: a name and the composed roll, filed at the end of the note.
  await saved(view).getByRole("textbox", { name: "Nome da rolagem" }).fill("Ataque forte");
  await saved(view).getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(rollsOf(view)).toHaveCount(3);
  await expect(rollsOf(view).nth(2)).toContainText("Ataque forte");
  const writes = await app.calls("write_note");
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toBe("Rolagens.md");
  expect(writes[0].text).toBe(ROLLS + "- Ataque forte: `dice: 1d20+8`\n");
  // The status line says it.
  await expect(page.locator("#status")).toContainText("Ataque forte");
});

test("a note with no rolls says so; Salvar needs a readable roll and a name", async ({ app, page }) => {
  await app.open("?vault=empty");
  const view = await showTray(app, page, { "Vazia.md": "# Vazia\n\nNada.\n" });
  await saved(view).getByRole("button", { name: "Escolher nota…" }).click();
  await chooseNote(page, "Vazia");
  await expect(saved(view).locator(".saved-empty")).toContainText("não tem rolagens");
  const save = saved(view).getByRole("button", { name: "Salvar", exact: true });
  await expect(save).toBeDisabled();
  await saved(view).getByRole("textbox", { name: "Nome da rolagem" }).fill("Sorte");
  await expect(save).toBeDisabled();
  await field(view).fill("/r 1d6");
  await expect(save).toBeEnabled();
});

test("a reader of a server sees the rolls and no Salvar", async ({ app, page }) => {
  await app.open("?vault=empty&side=server&role=reader");
  const view = await showTray(app, page, { "Rolagens.md": ROLLS });
  await saved(view).getByRole("button", { name: "Escolher nota…" }).click();
  await chooseNote(page, "Rolagens");
  await expect(rollsOf(view)).toHaveCount(2);
  await expect(saved(view).getByRole("button", { name: "Salvar", exact: true })).toHaveCount(0);
  await expect(saved(view).getByRole("textbox", { name: "Nome da rolagem" })).toHaveCount(0);
});

test("a player at a campaign table finds the note granted to it alone, and the rolls follow the note", async ({ app, page }) => {
  await app.open("?vault=empty&table=player&side=server&role=reader");
  await page.evaluate(() => {
    const c = window.__harness.campaign;
    c.tables = [{ root: "", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }];
    c.notes.set("Ficha da Ana.md", { path: "Ficha da Ana.md", released: true, secret_name: false, grant: { kind: "player", account: "acc-ana" } });
    c.notes.set("Grupo.md", { path: "Grupo.md", released: true, secret_name: false, grant: { kind: "group" } });
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  const sheet = "# Ficha da Ana\n\n- Espada: `dice: 1d20+5`\n";
  const view = await showTray(app, page, { "Ficha da Ana.md": sheet, "Grupo.md": "# Grupo\n\n- Iniciativa: `dice: 1d20`\n" });
  await expect(saved(view).getByRole("button", { name: /^Nota: Ficha da Ana/ })).toBeVisible();
  await expect(rollsOf(view)).toHaveCount(1);
  await expect(rollsOf(view).first()).toContainText("Espada");
  // The note changes (the game master left a roll): the row follows.
  await app.writeOutside("Ficha da Ana.md", `${sheet}- Arco: \`dice: 1d20+3\`\n`);
  await app.folderChanged(["Ficha da Ana.md"], true);
  await expect(rollsOf(view)).toHaveCount(2);
  // A granted note is the player's to write: Salvar is there.
  await expect(saved(view).getByRole("button", { name: "Salvar", exact: true })).toBeVisible();
});
