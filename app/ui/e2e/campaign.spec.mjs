// A table is a campaign folder (ADR 0110), the window's part: the game
// master turns a folder into a table, releases and hides notes, marks a
// name secret, grants a note, invites, sets the limits and undoes it; a
// player sees only what is released, with a lock where a link leads to a
// note not yet revealed. The server's commands are played by the harness
// (`src/harness/campaign.ts`, `?table=owner` and `?table=player`); the
// server's own rules are tried in `crates/verso-server/src/tests_campaign.rs`.

import { test, expect } from "./fixtures.mjs";

const ABERTA = "# Aberta\n\nVeja [[Barão]], [[Mundo/Cripta|um lugar]] e [[Mapa Mestre]] e [[Livre]].\n\n![[Mundo/Cripta]]\n";

async function furnish(app, query) {
  await app.open(query);
  const files = {
    "Aberta.md": ABERTA,
    "Livre.md": "# Livre\n",
    "Barão.md": "# Barão\n\nsegredo do barão\n",
    "Mundo/Cripta.md": "# Cripta\n",
    "Mapa Mestre.md": "# Mapa\n",
  };
  for (const [p, text] of Object.entries(files)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(files), true);
}

const row = (app, path) => app.page.locator(`#notes li[data-path="${path}"] > button`);

test("the game master makes a folder a table, releases and hides notes, and the tree marks the hidden", async ({ app }) => {
  await furnish(app, "?vault=empty&table=owner");
  const folder = app.page.locator('summary[data-folder="Mundo"]');
  await folder.click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Tornar esta pasta uma mesa" }).click();
  // The table's dialog opens, and the status line says it.
  const dialog = app.page.getByRole("dialog", { name: "Mesa “Mundo”" });
  await expect(dialog).toBeVisible();
  await expect(app.page.locator("#status")).toHaveText("A pasta virou uma mesa. As notas começam ocultas.");
  await expect.poll(() => app.calls("campaign_make")).toEqual([{ root: "Mundo" }]);
  await dialog.getByRole("button", { name: "Fechar" }).click();
  // The folder is marked as a table, and its note is hidden, with a mark that a screen reader names.
  await expect(app.page.locator('summary[data-folder="Mundo"] .table-mark')).toHaveAttribute("aria-label", "Mesa");
  const cripta = row(app, "Mundo/Cripta.md");
  await expect(cripta.locator(".hidden-mark")).toHaveAttribute("aria-label", "Oculta da mesa");
  // A note outside the table has no mark.
  await expect(row(app, "Aberta.md").locator(".campaign-mark")).toHaveCount(0);
  // Release it from its menu.
  await cripta.click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Liberar para a mesa" }).click();
  await expect(app.page.locator("#status")).toHaveText("Liberada para a mesa.");
  await expect.poll(() => app.calls("campaign_release")).toEqual([{ paths: ["Mundo/Cripta.md"], released: true }]);
  await expect(cripta.locator(".hidden-mark")).toHaveCount(0);
  // And hide it again.
  await cripta.click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Ocultar da mesa" }).click();
  await expect(cripta.locator(".hidden-mark")).toHaveCount(1);
  await expect(app.page.locator("#status")).toHaveText("Oculta da mesa.");
});

test("a name made secret, a note granted, and the folder's rows", async ({ app }) => {
  await furnish(app, "?vault=empty&table=owner");
  await app.page.evaluate(() => {
    const c = window.__harness.campaign;
    c.tables = [{ root: "", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }];
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  await expect(row(app, "Barão.md").locator(".hidden-mark")).toHaveCount(1);
  await row(app, "Barão.md").click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Nome secreto" }).click();
  await expect.poll(() => app.calls("campaign_secret_name")).toEqual([{ path: "Barão.md", on: true }]);
  await expect(app.page.locator("#status")).toHaveText("O nome desta nota agora é secreto: os links a ela aparecem como ▒▒▒▒.");
  // Now marked, and offered to undo.
  await row(app, "Barão.md").click({ button: "right" });
  await expect(app.page.getByRole("menuitem", { name: "✓ Nome secreto" })).toBeVisible();
  await app.page.keyboard.press("Escape");
  // Granted to the group, then to a player.
  await row(app, "Aberta.md").click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Editável por: ninguém" }).click();
  await app.page.getByRole("menuitem", { name: "o grupo" }).click();
  await expect.poll(() => app.calls("campaign_grant")).toEqual([{ path: "Aberta.md", grant: { kind: "group" } }]);
  await expect(app.page.locator("#status")).toHaveText("Todos os jogadores editam esta nota.");
  // A granted note is released with it: no hidden mark.
  await expect(row(app, "Aberta.md").locator(".hidden-mark")).toHaveCount(0);
  await row(app, "Aberta.md").click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Editável por: o grupo" }).click();
  await app.page.getByRole("menuitem", { name: "Bia" }).click();
  await expect(app.page.locator("#status")).toHaveText("Só Bia edita esta nota.");
  // The folder inside a table releases and hides what is under it.
  await app.page.locator('summary[data-folder="Mundo"]').click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Liberar tudo daqui" }).click();
  await expect.poll(async () => (await app.calls("campaign_release")).at(-1)).toEqual({ paths: ["Mundo"], released: true });
  await expect(row(app, "Mundo/Cripta.md").locator(".hidden-mark")).toHaveCount(0);
});

test("a selection of notes is released at once", async ({ app }) => {
  await furnish(app, "?vault=empty&table=owner");
  await app.page.evaluate(() => {
    window.__harness.campaign.tables = [{ root: "", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }];
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  await row(app, "Livre.md").click({ modifiers: ["ControlOrMeta"] });
  await row(app, "Barão.md").click({ modifiers: ["ControlOrMeta"] });
  await row(app, "Barão.md").click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Liberar para a mesa" }).click();
  await expect.poll(async () => (await app.calls("campaign_release")).length).toBe(1);
  const calls = await app.calls("campaign_release");
  expect([...calls[0].paths].sort()).toEqual(["Barão.md", "Livre.md"]);
  await expect(app.page.locator("#status")).toHaveText("2 notas liberadas para a mesa.");
  await expect(row(app, "Livre.md").locator(".hidden-mark")).toHaveCount(0);
});

test("the table's dialog: open or closed, the invitation link, release everything, limits, undo", async ({ app }) => {
  await furnish(app, "?vault=empty&table=owner");
  // The list's background: a menu of the tree itself.
  await app.page.locator("#tree-root").dispatchEvent("contextmenu", { clientX: 40, clientY: 40 });
  await app.page.getByRole("menuitem", { name: "Tornar a pasta toda uma mesa" }).click();
  const dialog = app.page.getByRole("dialog", { name: /^Mesa da pasta/ });
  await expect(dialog).toBeVisible();
  // Closed: players cannot open the folder; the toggle says so.
  const open = dialog.getByRole("checkbox", { name: "Mesa aberta" });
  await expect(open).toBeChecked();
  await open.uncheck();
  await expect.poll(async () => (await app.calls("campaign_settings")).at(-1)).toMatchObject({ root: "", open: false });
  await open.check();
  // The invitation: a link of the server, to copy.
  await dialog.getByRole("button", { name: "Gerar link" }).click();
  const link = dialog.getByRole("textbox", { name: "Link do convite" });
  await expect(link).toHaveValue(/\/invite\/harness-1$/);
  await expect(dialog.getByRole("button", { name: "Copiar o link" })).toBeVisible();
  // The players the server counts.
  await expect(dialog.getByRole("list", { name: "Jogadores" })).toContainText("Bia");
  // Release everything asks first.
  await dialog.getByRole("button", { name: "Liberar tudo" }).click();
  await expect(dialog.getByText(/Liberar todas as notas desta mesa agora\?/)).toBeVisible();
  expect(await app.calls("campaign_release_all")).toHaveLength(0);
  await dialog.getByRole("button", { name: "Sim" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Todas as notas foram liberadas.");
  await expect.poll(() => app.calls("campaign_release_all")).toEqual([{ root: "" }]);
  // The limits, within their bounds.
  await dialog.getByLabel("Entradas do registro da mesa").fill("5000");
  await dialog.getByLabel("Tamanho de uma imagem na mesa (MB)").fill("20");
  await dialog.getByRole("button", { name: "Salvar limites" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Salvo.");
  expect((await app.calls("campaign_settings")).at(-1)).toEqual({ root: "", open: null, logMax: 5000, imageMax: 20 * 1024 * 1024 });
  await dialog.getByLabel("Entradas do registro da mesa").fill("10");
  await dialog.getByRole("button", { name: "Salvar limites" }).click();
  await expect(dialog.getByRole("status")).toContainText("Não deu certo");
  // Undo asks first, and the folder is a folder again.
  await dialog.getByRole("button", { name: "Desfazer mesa" }).click();
  await expect(dialog.getByText(/Desfazer a mesa\?/)).toBeVisible();
  expect(await app.calls("campaign_unmake")).toHaveLength(0);
  await dialog.getByRole("button", { name: "Sim" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => app.calls("campaign_unmake")).toEqual([{ root: "" }]);
  await expect(app.page.locator("#status")).toHaveText("A pasta não é mais uma mesa.");
  app.expectFault(/refused|1000/);
});

test("on a folder of this computer alone nothing of the table shows", async ({ app }) => {
  await furnish(app, "?vault=empty");
  await app.page.locator('summary[data-folder="Mundo"]').click({ button: "right" });
  await expect(app.page.getByRole("menuitem", { name: /mesa/i })).toHaveCount(0);
  await app.page.keyboard.press("Escape");
  await expect(app.page.locator(".campaign-mark")).toHaveCount(0);
});

test("a player sees only what is released, with a lock where a link leads to a hidden note", async ({ app }) => {
  await furnish(app, "?vault=empty&table=player&side=server&role=reader");
  await app.page.evaluate(() => {
    const c = window.__harness.campaign;
    c.tables = [{ root: "", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }];
    c.notes.set("Aberta.md", { path: "Aberta.md", released: true, secret_name: false, grant: { kind: "none" } });
    c.notes.set("Livre.md", { path: "Livre.md", released: true, secret_name: false, grant: { kind: "none" } });
    c.notes.set("Mapa Mestre.md", { path: "Mapa Mestre.md", released: false, secret_name: true, grant: { kind: "none" } });
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  await app.folderChanged(["Aberta.md"], true);
  // The tree lacks what is hidden; nothing of the game master's marks.
  await expect(row(app, "Aberta.md")).toBeVisible();
  await expect(row(app, "Livre.md")).toBeVisible();
  await expect(row(app, "Barão.md")).toHaveCount(0);
  await expect(row(app, "Mundo/Cripta.md")).toHaveCount(0);
  await expect(app.page.locator('summary[data-folder="Mundo"]')).toHaveCount(0);
  await expect(app.page.locator(".campaign-mark")).toHaveCount(0);
  // The note reads with locks: the name and a lock, an alias and a lock, four blocks, and a link that stays one.
  await row(app, "Aberta.md").click();
  const preview = app.page.locator(".note-sheet > .preview:visible");
  await expect(preview).toContainText("Barão 🔒");
  await expect(preview).toContainText("um lugar 🔒");
  await expect(preview).toContainText("▒▒▒▒");
  await expect(preview).toContainText("🔒 (ainda não revelado)");
  await expect(preview.locator('a.wikilink[data-target="Livre"]')).toHaveCount(1);
  await expect(preview).not.toContainText("Cripta");
  await expect(preview).not.toContainText("Mapa Mestre");
  // A player's menu has none of the game master's rows.
  await row(app, "Livre.md").click({ button: "right" });
  await expect(app.page.getByRole("menuitem", { name: /mesa/i })).toHaveCount(0);
  await app.page.keyboard.press("Escape");
  // What is hidden is not found by name, and is released later.
  await app.key("Mod+p");
  await app.page.getByRole("combobox", { name: "Abrir…" }).fill("Barão");
  await expect(app.page.locator(".quick:not([hidden]) .quick-list li")).toHaveCount(0);
  await app.page.keyboard.press("Escape");
  await app.page.evaluate(() => {
    window.__harness.campaign.notes.set("Barão.md", { path: "Barão.md", released: true, secret_name: false, grant: { kind: "none" } });
  });
  await app.folderChanged(["Barão.md"], true);
  await expect(row(app, "Barão.md")).toBeVisible();
});

test("a note granted to a player is its to edit; the others it only reads", async ({ app }) => {
  await furnish(app, "?vault=empty&table=player&side=server&role=reader");
  await app.page.evaluate(() => {
    const c = window.__harness.campaign;
    c.tables = [{ root: "", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }];
    c.notes.set("Livre.md", { path: "Livre.md", released: true, secret_name: false, grant: { kind: "none" } });
    c.notes.set("Aberta.md", { path: "Aberta.md", released: true, secret_name: false, grant: { kind: "group" } });
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  await app.folderChanged(["Aberta.md"], true);
  // The granted note takes what is typed; the other refuses it, as a reader's does.
  await row(app, "Aberta.md").click();
  await app.key("Mod+e");
  const editor = app.page.locator(".cm-content:visible").first();
  await editor.click();
  await app.page.keyboard.type("ZZ");
  await expect(editor).toContainText("ZZ");
  await expect.poll(async () => (await app.calls("write_note")).length).toBeGreaterThan(0);
  await row(app, "Livre.md").click();
  await app.key("Mod+e");
  const other = app.page.locator(".cm-content:visible").first();
  await other.click();
  await app.page.keyboard.type("ZZ");
  await expect(other).not.toContainText("ZZ");
});
