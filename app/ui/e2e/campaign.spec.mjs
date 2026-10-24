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
  await expect(app.page.locator('summary[data-folder="Mundo"] .table-mark')).toHaveAttribute("aria-label", "Mesa “Mundo”: abrir as configurações");
  const cripta = row(app, "Mundo/Cripta.md");
  await expect(cripta.locator(".hidden-mark")).toHaveAttribute("aria-label", "Oculta da mesa");
  // A note outside the table has no mark.
  await expect(row(app, "Aberta.md").locator(".campaign-mark")).toHaveCount(0);
  // Release it to the whole table from its menu: a submenu with the table, each player and nobody.
  await cripta.click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Liberar para…" }).click();
  await app.page.getByRole("menuitemcheckbox", { name: "Toda a mesa" }).click();
  await expect(app.page.locator("#status")).toHaveText("Liberada para toda a mesa.");
  await expect.poll(() => app.calls("campaign_audience")).toEqual([{ paths: ["Mundo/Cripta.md"], audience: { kind: "table" } }]);
  await expect(cripta.locator(".hidden-mark")).toHaveCount(0);
  // And hide it again.
  await cripta.click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Liberar para…" }).click();
  await app.page.getByRole("menuitemcheckbox", { name: "Ninguém (oculta)" }).click();
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

const shot = async (page, name) => {
  // The switch and its colours settle (150 ms) before the picture.
  if (process.env.SHOTS) await page.waitForTimeout(400);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("the table's window: a switch that saves at once, cards, limits under Advanced, a quiet red undo", async ({ app }) => {
  await furnish(app, "?vault=empty&table=owner");
  // The list's background: a menu of the tree itself.
  await app.page.locator("#tree-root").dispatchEvent("contextmenu", { clientX: 40, clientY: 40 });
  await app.page.getByRole("menuitem", { name: "Tornar a pasta toda uma mesa" }).click();
  const dialog = app.page.getByRole("dialog", { name: /^Mesa da pasta/ });
  await expect(dialog).toBeVisible();
  // A real switch with its status pill; closing saves at once and the chip says so.
  const open = dialog.getByRole("switch", { name: "Mesa aberta" });
  await expect(open).toBeChecked();
  await expect(dialog.locator(".cd-pill")).toHaveText("Aberta");
  await shot(app.page, "74-janela-da-mesa-aberta-claro");
  await open.uncheck({ force: true });
  await expect.poll(async () => (await app.calls("campaign_settings")).at(-1)).toMatchObject({ root: "", open: false });
  await expect(dialog.locator(".cd-pill")).toHaveText("Fechada");
  await expect(open).not.toBeChecked();
  await expect(open).toHaveAttribute("aria-checked", "false");
  await expect(dialog.locator(".cd-feedback").first()).toContainText("Mesa fechada");
  await expect(app.page.locator(".table-chip")).toContainText("(fechada)");
  await shot(app.page, "75-janela-da-mesa-fechada-claro");
  await open.check({ force: true });
  await expect(dialog.locator(".cd-pill")).toHaveText("Aberta");
  // The invitation: a link of the server, in a field with Copy and its expiry.
  await dialog.getByRole("button", { name: "Gerar link" }).click();
  const link = dialog.getByRole("textbox", { name: "Link do convite" });
  await expect(link).toHaveValue(/\/invite\/harness-1$/);
  await expect(dialog.getByRole("button", { name: "Copiar o link" })).toBeVisible();
  await expect(dialog.getByText(/Uso único, vale até/)).toBeVisible();
  // The players the server counts, with what is granted to them.
  const grid = dialog.getByRole("table", { name: "Jogadores da mesa e o que cada um pode fazer" });
  await expect(grid).toContainText("Bia");
  await expect(grid.getByRole("switch", { name: "Bia pode enviar imagens" })).not.toBeChecked();
  // Release everything asks first.
  await dialog.getByRole("button", { name: "Liberar tudo" }).click();
  await expect(dialog.getByText(/Liberar todas as notas desta mesa agora\?/)).toBeVisible();
  expect(await app.calls("campaign_release_all")).toHaveLength(0);
  await dialog.getByRole("button", { name: "Sim" }).click();
  await expect(dialog.getByText("Todas as notas foram liberadas.")).toBeVisible();
  await expect.poll(() => app.calls("campaign_release_all")).toEqual([{ root: "" }]);
  // The limits are folded; a field saves when Enter is pressed and says so beside itself.
  const log = dialog.getByLabel("Entradas do registro da mesa");
  await expect(log).toBeHidden();
  await dialog.getByText("Avançado: limites da mesa").click();
  await log.fill("5000");
  await log.press("Enter");
  await expect(dialog.getByText("Salvo")).toBeVisible();
  expect((await app.calls("campaign_settings")).at(-1)).toEqual({ root: "", open: null, logMax: 5000, imageMax: null });
  const image = dialog.getByLabel("Tamanho de uma imagem na mesa (MB)");
  await image.fill("20");
  await image.press("Tab");
  await expect.poll(async () => (await app.calls("campaign_settings")).at(-1)).toEqual({ root: "", open: null, logMax: null, imageMax: 20 * 1024 * 1024 });
  await log.fill("10");
  await log.press("Enter");
  await expect(dialog.getByText(/Não deu certo/)).toBeVisible();
  // Undo is a quiet red action, never the primary; it asks first and says the files never change.
  const undo = dialog.getByRole("button", { name: "Desfazer mesa" });
  await expect(undo).not.toHaveClass(/primary|solid/);
  await expect(dialog.getByText(/os arquivos nunca mudam/).first()).toBeVisible();
  await undo.click();
  await expect(dialog.getByText(/Desfazer a mesa\?/)).toBeVisible();
  expect(await app.calls("campaign_unmake")).toHaveLength(0);
  await dialog.getByRole("button", { name: "Sim" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => app.calls("campaign_unmake")).toEqual([{ root: "" }]);
  await expect(app.page.locator("#status")).toHaveText("A pasta não é mais uma mesa.");
  app.expectFault(/refused|1000/);
});

async function made(app) {
  await furnish(app, "?vault=empty&table=owner");
  await app.page.locator("#tree-root").dispatchEvent("contextmenu", { clientX: 40, clientY: 40 });
  await app.page.getByRole("menuitem", { name: "Tornar a pasta toda uma mesa" }).click();
  const dialog = app.page.getByRole("dialog", { name: /^Mesa da pasta/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("the table's window closes with Escape, and on a phone it is a sheet with everything reachable", async ({ app }) => {
  const dialog = await made(app);
  await app.page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await app.page.setViewportSize({ width: 390, height: 844 });
  // The folder's chip is in the side panel on a phone.
  await app.page.getByRole("button", { name: "Arquivos" }).click();
  await app.page.locator(".table-chip").click();
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844 + 1);
  await shot(app.page, "76-janela-da-mesa-telefone-claro");
  // The last control is reachable by scrolling the sheet.
  await dialog.getByRole("button", { name: "Fechar" }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "Desfazer mesa" })).toBeInViewport();
  await app.page.emulateMedia({ colorScheme: "dark" });
  await shot(app.page, "77-janela-da-mesa-telefone-escuro");
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(dialog).toBeHidden();
});

test("the table's window in the dark theme", async ({ app }) => {
  await app.page.emulateMedia({ colorScheme: "dark" });
  const dialog = await made(app);
  await dialog.getByRole("switch", { name: "Mesa aberta" }).uncheck({ force: true });
  await expect(dialog.locator(".cd-pill")).toHaveText("Fechada");
  await shot(app.page, "78-janela-da-mesa-fechada-escuro");
});

test("the folder's page carries the table card: the game master's switch, a player's line, a way to make one", async ({ app }) => {
  await furnish(app, "?vault=empty&table=owner");
  const page = app.page;
  // A folder that is not a table yet: one call to action under the title.
  await page.locator('#notes summary[data-folder="Mundo"] .folder-label').click();
  const cta = page.locator(".table-card-make");
  await expect(cta).toBeVisible();
  await shot(page, "79-pagina-da-pasta-sem-mesa-claro");
  await cta.getByRole("button", { name: "Tornar esta pasta uma mesa" }).click();
  await expect.poll(() => app.calls("campaign_make")).toEqual([{ root: "Mundo" }]);
  await page.getByRole("dialog", { name: "Mesa “Mundo”" }).waitFor();
  await page.keyboard.press("Escape");
  // It is a table now: the card has the switch, the players, the notes and the settings.
  const card = page.locator(".table-card-owner");
  await expect(card).toBeVisible();
  await expect(cta).toHaveCount(0);
  await expect(card.locator(".table-card-summary")).toContainText("1 jogador");
  const open = card.getByRole("switch", { name: "Mesa aberta" });
  await expect(open).toBeChecked();
  await open.uncheck({ force: true });
  await expect.poll(async () => (await app.calls("campaign_settings")).at(-1)).toMatchObject({ root: "Mundo", open: false });
  await expect(card.locator(".cd-pill")).toHaveText("Fechada");
  await expect(open).not.toBeChecked();
  await shot(page, "80-pagina-da-pasta-mesa-fechada-claro");
  await card.getByText("Convidar").click();
  await card.getByRole("button", { name: "Gerar link" }).click();
  await expect(card.getByRole("textbox", { name: "Link do convite" })).toHaveValue(/\/invite\//);
  await shot(page, "81-pagina-da-pasta-convite-claro");
  // Folded away, and the fold is remembered for this folder.
  await card.getByRole("button", { name: "Recolher a mesa" }).click();
  await expect(card.getByRole("switch")).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("verso.tableCard.folded"))).toBe('["Mundo"]');
  await card.getByRole("button", { name: "Mostrar a mesa" }).click();
  await expect(card.getByRole("switch")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("verso.tableCard.folded"))).toBe("[]");
  // The settings button opens the whole window.
  await card.getByRole("button", { name: "Configurações da mesa" }).click();
  await expect(page.getByRole("dialog", { name: "Mesa “Mundo”" })).toBeVisible();
});

test("a local folder shows no table card; a player sees one read-only line", async ({ app }) => {
  await furnish(app, "?vault=empty");
  await app.page.locator('#notes summary[data-folder="Mundo"] .folder-label').click();
  await expect(app.page.locator(".sheet")).toBeVisible();
  await expect(app.page.locator(".table-card")).toHaveCount(0);
});

test("a player sees the table card as one line, with the notes granted to them as links", async ({ app }) => {
  await furnish(app, "?vault=empty&table=player&side=server&role=reader");
  await app.page.evaluate(() => {
    const c = window.__harness.campaign;
    c.tables = [{ root: "Mundo", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }];
    c.notes.set("Mundo/Cripta.md", { path: "Mundo/Cripta.md", released: true, secret_name: false, grant: { kind: "group" } });
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  await app.folderChanged(["Mundo/Cripta.md"], true);
  await app.page.locator('#notes summary[data-folder="Mundo"] .folder-label').click();
  const card = app.page.locator(".table-card-player");
  await expect(card).toContainText("Mesa · jogador");
  await expect(card).toContainText("A mesa está aberta.");
  await expect(card.getByRole("button", { name: "Cripta" })).toBeVisible();
  await expect(card.getByRole("switch")).toHaveCount(0);
  await shot(app.page, "82-pagina-da-pasta-jogador-claro");
});

test("a player outside a closed table is told so, in the folder's place, and gets in when it opens", async ({ app }) => {
  await app.page.setViewportSize({ width: 390, height: 844 });
  await app.open("?vault=empty&table=player&side=server&role=reader&closed=1");
  const state = app.page.locator(".table-closed-state");
  await expect(state).toContainText("A mesa está fechada pelo mestre. Você entra quando ela abrir.");
  await expect(state.getByRole("button", { name: "Tentar agora" })).toBeVisible();
  await shot(app.page, "83-jogador-mesa-fechada-telefone-claro");
  // Still closed: it stays.
  await state.getByRole("button", { name: "Tentar agora" }).click();
  await expect(state).toBeVisible();
  // The game master opens the table: the next try gets in.
  await app.page.evaluate(() => (window.__harnessShutOut = false));
  // The window also tries by itself: that try may get in before the click.
  await state.getByRole("button", { name: "Tentar agora" }).click({ timeout: 2000 }).catch(() => {});
  await expect(app.page.locator(".table-closed-state")).toHaveCount(0);
  await expect(app.page.locator("#folder")).not.toBeEmpty();
  app.expectFault(/mesa está fechada/);
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

// The folder-to-table step in the Mesa panel (ADR 0110, the maintainer 2026-10-23: "um botãozinho ali que me deixa
// transformar a pasta em mesa, sem ter que clicar com o botão direito").
async function showMesa(app) {
  const page = app.page;
  const phone = (page.viewportSize()?.width ?? 1500) <= 760;
  if (phone) await page.locator(".bar-right").click();
  else await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  await expect(view).toBeVisible();
  return view;
}

test("the owner makes the open folder a table from the Mesa panel, with no right click; then a way to its window @layout", async ({ app }) => {
  await furnish(app, "?vault=empty&table=owner");
  const view = await showMesa(app);
  const make = view.getByRole("button", { name: "Tornar esta pasta uma mesa" });
  await expect(make).toBeVisible();
  await make.click();
  await expect.poll(() => app.calls("campaign_make")).toEqual([{ root: "" }]);
  const dialog = app.page.getByRole("dialog", { name: /^Mesa da pasta/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(make).toBeHidden();
  const open = view.getByRole("button", { name: "Abrir a janela da Mesa" });
  await expect(open).toBeVisible();
  await open.click();
  await expect(app.page.getByRole("dialog", { name: /^Mesa da pasta/ })).toBeVisible();
});

test("a player sees no button to make a table", async ({ app }) => {
  await furnish(app, "?vault=empty&table=player&side=server&role=reader");
  const view = await showMesa(app);
  await expect(view.getByRole("button", { name: "Tornar esta pasta uma mesa" })).toHaveCount(0);
  await expect(view.getByRole("button", { name: "Abrir a janela da Mesa" })).toHaveCount(0);
});

test("a folder only on this computer says in one line why there is no table", async ({ app }) => {
  await furnish(app, "?vault=empty");
  const view = await showMesa(app);
  await expect(view.getByRole("button", { name: "Tornar esta pasta uma mesa" })).toHaveCount(0);
  await expect(view.locator(".table-make")).toContainText("só está neste computador");
});
