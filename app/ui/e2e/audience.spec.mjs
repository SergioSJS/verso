// Who sees and who edits a file of a table (ADR 0113): the one "Acesso…"
// dialog — Não vê | Vê | Edita for the whole table and for each player, from
// the tree's right click (one row, no submenus), from a folder (applied with
// a button, its exceptions listed) and from a selection — and the access
// indicator in the file's title row: a click opens the dialog, hovering shows
// the summary. The server's commands are played by the harness
// (`src/harness/campaign.ts`, which answers from the shared vectors); the
// server's own rules are tried in `crates/verso-server`.

import { test, expect } from "./fixtures.mjs";

const SHOTS = process.env.SHOTS;
const shot = async (page, info, name) => {
  if (!SHOTS || info.project.name !== "chromium") return;
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const PLAYERS = [
  { id: "acc-ana", name: "Ana" },
  { id: "acc-bia", name: "Bia" },
  { id: "acc-caio", name: "Caio" },
  { id: "acc-dora", name: "Dora" },
];
const TABLE = { root: "Mundo", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 };

/** The harness's table at "Mundo", `notes` as { path: audience } (and a grant), seen as `who`. */
async function setup(app, who, notes, o = {}) {
  if (o.phone) await app.page.setViewportSize({ width: 390, height: 844 });
  await app.open(`?vault=empty&table=${who}` + (who === "player" ? "&side=server&role=reader" : ""));
  const paths = Object.keys(notes);
  for (const p of paths) await app.writeOutside(p, `# ${p.split("/").pop().replace(/\.md$/, "")}\n\nUm lugar frio.\n`);
  await app.folderChanged(paths, true);
  await app.page.evaluate(
    ([table, players, given, seat]) => {
      const c = window.__harness.campaign;
      c.tables = [table];
      c.players = seat === "player" ? players.slice(0, 3) : players;
      for (const [path, v] of Object.entries(given)) {
        c.notes.set(path, { path, released: v.audience.kind !== "hidden", audience: v.audience, secret_name: false, grant: v.grant ?? { kind: "none" } });
      }
      window.__harness.emit("campaign-changed", { paths: [] });
    },
    [TABLE, PLAYERS, notes, who],
  );
  await app.folderChanged(paths, true);
}

const players = (...accounts) => ({ audience: { kind: "players", accounts } });
const row = (app, path) => app.page.locator(`#notes li[data-path="${path}"] > button`);

async function open(app, path = "Mundo/Cripta.md") {
  const page = app.page;
  if ((page.viewportSize()?.width ?? 1500) <= 760) await page.getByRole("button", { name: "Arquivos" }).click();
  if (!(await row(app, path).isVisible())) await page.locator('#notes summary[data-folder="Mundo"]').click();
  await row(app, path).click();
  await expect(page.locator(".note-sheet")).toBeVisible();
}

const button = (app) => app.page.locator(".note-access-btn");
const pop = (app) => app.page.getByRole("dialog", { name: /Quem vê esta nota/ });


const dialogOf = (app, name = /^Acesso · /) => app.page.getByRole("dialog", { name });
const VALUE = { "Não vê": "none", Vê: "see", Edita: "edit" };
const select = (d, who) => d.getByRole("combobox", { name: who, exact: true });
/** A level is chosen from the row's select. */
const choose = (d, who, word) => select(d, who).selectOption({ label: word });
const expectLevel = (d, who, word) => expect(select(d, who)).toHaveValue(VALUE[word]);
const calls = async (app) => (await app.calls("access_set")).map((c) => c);
const lastSet = async (app) => (await app.calls("access_set")).at(-1);
const openDialog = async (app, path) => {
  await row(app, path).click({ button: "right" });
  await app.page.getByRole("menuitem", { name: /^Acesso…/ }).click();
  const d = dialogOf(app);
  await expect(d).toBeVisible();
  return d;
};

test("the tree's right click has ONE access row, no submenus, and none of the old ones", async ({ app }) => {
  await setup(app, "owner", { "Mundo/Cripta.md": players("acc-bia"), "Mundo/Diario.md": { audience: { kind: "hidden" } } });
  await row(app, "Mundo/Cripta.md").click({ button: "right" });
  // The summary is in the row: who edits, how many see.
  await expect(app.page.getByRole("menuitem", { name: "Acesso… · 1 vê" })).toBeVisible();
  for (const old of ["Liberar para…", /^Editável por/, "Alterar o acesso…"]) await expect(app.page.getByRole("menuitem", { name: old })).toHaveCount(0);
  await expect(app.page.locator(".menu [aria-haspopup='menu'], .menu [aria-haspopup='true']").filter({ hasText: /Acesso/ })).toHaveCount(0);
  await app.page.keyboard.press("Escape");
  await row(app, "Mundo/Diario.md").click({ button: "right" });
  await expect(app.page.getByRole("menuitem", { name: "Acesso… · oculto" })).toBeVisible();
});

test("the dialog gives Não vê | Vê | Edita to the whole table and to each player, and saves at once", async ({ app }, info) => {
  await setup(app, "owner", { "Mundo/Cripta.md": { audience: { kind: "hidden" } } });
  const d = await openDialog(app, "Mundo/Cripta.md");
  await expect(d).toContainText("Mesa: Mundo");
  await expectLevel(d, "Toda a mesa", "Não vê");
  for (const who of ["Bia", "Caio", "Dora"]) {
    await expect(select(d, who)).toBeVisible();
    await expectLevel(d, who, "Não vê");
  }
  await expect(d.getByText("segue a mesa")).toHaveCount(3);
  await expect(d).toContainText("O mestre sempre vê e edita.");
  await shot(app.page, info, "140-depois-acesso-arquivo-claro");
  await app.page.emulateMedia({ colorScheme: "dark" });
  await shot(app.page, info, "141-depois-acesso-arquivo-escuro");
  await app.page.emulateMedia({ colorScheme: "light" });
  // One player sees it: saved at once, answered beside the control.
  await choose(d, "Bia", "Vê");
  await expect.poll(() => lastSet(app)).toMatchObject({ paths: ["Mundo/Cripta.md"], change: { kind: "set", set: { whole: "none", rows: [{ account: "acc-bia", level: "see" }] } } });
  await expect(d.getByRole("status")).toContainText("Salvo ✓");
  await expectLevel(d, "Bia", "Vê");
  await expect(d.getByText("acesso próprio", { exact: true })).toHaveCount(1);
  // Another edits it, together: one list, one set.
  await choose(d, "Caio", "Edita");
  await expect.poll(() => lastSet(app)).toMatchObject({ change: { set: { whole: "none", rows: [{ account: "acc-bia", level: "see" }, { account: "acc-caio", level: "edit" }] } } });
  // The whole table: the rows that read "segue a mesa" follow; the ones of their own stay.
  await choose(d, "Toda a mesa", "Vê");
  await expect.poll(() => lastSet(app)).toMatchObject({ change: { set: { whole: "see", rows: [{ account: "acc-caio", level: "edit" }] } } });
  await expectLevel(d, "Dora", "Vê");
  await expectLevel(d, "Bia", "Vê");
  // Choosing the whole table's value returns a player to it: no row of their own.
  await choose(d, "Caio", "Vê");
  await expect.poll(() => lastSet(app)).toMatchObject({ change: { set: { whole: "see", rows: [] } } });
  await expectLevel(d, "Caio", "Vê");
  // Below the default is allowed: "toda a mesa vê, menos o Caio".
  await choose(d, "Caio", "Não vê");
  await expect.poll(() => lastSet(app)).toMatchObject({ change: { set: { whole: "see", rows: [{ account: "acc-caio", level: "none" }] } } });
});

test("the arrow keys change the choice of a row, and Escape gives the focus back", async ({ app }) => {
  await setup(app, "owner", { "Mundo/Cripta.md": { audience: { kind: "hidden" } } });
  const d = await openDialog(app, "Mundo/Cripta.md");
  await select(d, "Dora").focus();
  // Type-ahead (the first letter of the option) changes a closed select on every platform; on macOS arrows only open its menu.
  await app.page.keyboard.press("V");
  await expectLevel(d, "Dora", "Vê");
  await expect.poll(() => lastSet(app)).toMatchObject({ change: { set: { rows: [{ account: "acc-dora", level: "see" }] } } });
  await app.page.keyboard.press("E");
  await expectLevel(d, "Dora", "Edita");
  await app.page.keyboard.press("V");
  await expectLevel(d, "Dora", "Vê");
  await app.page.keyboard.press("Escape");
  await expect(d).toBeHidden();
});

test("giving Edita on a note or a board with secret blocks asks first; a player who edits a board sees its text cards whole", async ({ app }) => {
  await setup(app, "owner", { "Mundo/Cripta.md": players("acc-bia"), "Mundo/Quadro.canvas": players("acc-bia") });
  await app.page.evaluate(() => {
    window.__harness.core.files.get("Mundo/Cripta.md").bytes = new TextEncoder().encode("# Cripta\n\n> [!secret]\n> o cofre\n\n> [!secret]\n> a chave\n");
    const board = { nodes: [{ id: "t", type: "text", text: "> [!secret]\n> o cofre do mestre", x: 0, y: 0, width: 200, height: 60 }, { id: "pin", type: "text", text: "> [!secret]\n> so do pin", verso: { secret: true }, x: 300, y: 0, width: 40, height: 40 }], edges: [] };
    window.__harness.core.files.get("Mundo/Quadro.canvas").bytes = new TextEncoder().encode(JSON.stringify(board));
  });
  const d = await openDialog(app, "Mundo/Cripta.md");
  await expect(d).toContainText("Esta nota tem 2 blocos secretos: quem edita os vê.");
  await choose(d, "Bia", "Edita");
  const ask = app.page.locator(".confirm");
  await expect(ask).toContainText("Quem edita esta nota vê os 2 blocos secretos dela");
  await ask.getByRole("button", { name: "Cancelar" }).click();
  await expectLevel(d, "Bia", "Vê");
  expect((await app.calls("access_set")).length).toBe(0);
  await choose(d, "Bia", "Edita");
  await app.page.locator(".confirm").getByRole("button", { name: "Dar edição" }).click();
  await expect.poll(() => lastSet(app)).toMatchObject({ change: { set: { rows: [{ account: "acc-bia", level: "edit" }] } } });
  await app.page.keyboard.press("Escape");
  // A board is given like any file: its text cards' secret blocks count (a
  // secret pin's do not), and the dialog says what the player is shown.
  const board = await openDialog(app, "Mundo/Quadro.canvas");
  await expect(board).toContainText("Quem edita este board vê os cartões de texto inteiros");
  await expect(board).toContainText("Este board tem 1 bloco secreto em cartões de texto: quem edita o vê.");
  await expect(select(board, "Bia")).toBeEnabled();
  await expect(select(board, "Toda a mesa")).toBeEnabled();
  await choose(board, "Bia", "Edita");
  await expect(app.page.locator(".confirm")).toContainText("Quem edita este board vê o bloco secreto de seus cartões de texto");
  await app.page.locator(".confirm").getByRole("button", { name: "Dar edição" }).click();
  await expect.poll(() => lastSet(app)).toMatchObject({ paths: ["Mundo/Quadro.canvas"], change: { set: { rows: [{ account: "acc-bia", level: "edit" }] } } });
});

test("a folder is applied with a button that says how many files change; its exceptions are listed with a way back", async ({ app }) => {
  await setup(app, "owner", { "Mundo/Cripta.md": players("acc-bia"), "Mundo/Diario.md": { audience: { kind: "hidden" } }, "Mundo/Sala/Eco.md": { audience: { kind: "hidden" } } });
  await app.page.locator('#notes summary[data-folder="Mundo/Sala"]').click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Acesso…" }).click();
  const d = dialogOf(app, /^Acesso · pasta “Sala”/);
  await expect(d).toContainText("Mesa: Mundo · 1 arquivo");
  await choose(d, "Toda a mesa", "Vê");
  // Nothing is written until Aplicar.
  expect((await app.calls("access_set")).length).toBe(0);
  // Eco has an access of its own: the folder asks, and here it follows the folder.
  await expect(d.getByText("1 arquivo aqui dentro tem acesso próprio.")).toBeVisible();
  await d.getByRole("radio", { name: "Seguir a pasta em todos" }).check();
  await d.getByRole("button", { name: "Aplicar" }).click();
  await expect.poll(() => lastSet(app)).toMatchObject({ paths: ["Mundo/Sala"], change: { kind: "set", set: { whole: "see", rows: [] } } });
  await expect(d.getByRole("status")).toContainText("Aplicado a 1 arquivo.");
  await expect(row(app, "Mundo/Sala/Eco.md").locator(".hidden-mark")).toHaveCount(0);
  // The big folder lists the exceptions: Cripta has an access of its own.
  await app.page.keyboard.press("Escape");
  await app.page.locator('#notes summary[data-folder="Mundo"]').click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Acesso…" }).click();
  const big = dialogOf(app, /^Acesso · pasta “Mundo”/);
  await big.getByRole("button", { name: /com acesso próprio/ }).click();
  await expect(big.getByText("Cripta", { exact: true })).toBeVisible();
  await big.getByRole("button", { name: "↺ Seguir a pasta: Mundo/Cripta.md" }).click();
  await expect.poll(() => lastSet(app)).toEqual({ paths: ["Mundo/Cripta.md"], change: { kind: "follow" } });
  await expect(big.getByText("Cripta", { exact: true })).toHaveCount(0);
});

test("a selection has one row, 'Acesso de N arquivos…', and applies to all of it", async ({ app }) => {
  await setup(app, "owner", { "Mundo/Cripta.md": { audience: { kind: "hidden" } }, "Mundo/Diario.md": { audience: { kind: "hidden" } } });
  await row(app, "Mundo/Cripta.md").click({ modifiers: ["ControlOrMeta"] });
  await row(app, "Mundo/Diario.md").click({ modifiers: ["ControlOrMeta"] });
  await row(app, "Mundo/Diario.md").click({ button: "right" });
  for (const old of ["Ocultar da mesa", "Liberar para a mesa"]) await expect(app.page.getByRole("menuitem", { name: old })).toHaveCount(0);
  await app.page.getByRole("menuitem", { name: "Acesso de 2 arquivos…" }).click();
  const d = dialogOf(app, /^Acesso de 2 arquivos/);
  await expect(d).toContainText("Mesa: Mundo");
  await choose(d, "Bia", "Edita");
  await expect(d).toContainText("Altera 2 arquivos");
  await d.getByRole("button", { name: "Aplicar" }).click();
  await expect.poll(() => lastSet(app)).toMatchObject({ paths: ["Mundo/Cripta.md", "Mundo/Diario.md"], change: { set: { rows: [{ account: "acc-bia", level: "edit" }] } } });
  expect(await app.calls("campaign_release")).toHaveLength(0);
  expect(await app.calls("campaign_audience")).toHaveLength(0);
});

test("a file with an access of its own can follow its folder again", async ({ app }) => {
  await setup(app, "owner", { "Mundo/Cripta.md": players("acc-bia") });
  await app.page.evaluate(() => {
    window.__harness.campaign.sets.set("Mundo", { whole: "see", rows: new Map() });
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  const d = await openDialog(app, "Mundo/Cripta.md");
  await expect(d).toContainText("Acesso próprio (exceção de “Mundo”).");
  await d.getByRole("button", { name: "↺ Seguir a pasta" }).click();
  await expect.poll(() => lastSet(app)).toEqual({ paths: ["Mundo/Cripta.md"], change: { kind: "follow" } });
  await expect(d).toContainText("Segue a pasta Mundo");
});

test("the game master's indicator: count, name, a hover summary with every player, and a click that opens the dialog", async ({ app }, info) => {
  test.skip(/phone|tablet/.test(info.project.name), "a finger has no hover: its tap is the dialog");
  await setup(app, "owner", { "Mundo/Cripta.md": players("acc-bia", "acc-caio") });
  await open(app);
  const b = button(app);
  await expect(b).toBeVisible();
  await expect(b).toHaveAccessibleName("Quem vê esta nota: 2 de 3 jogadores");
  await expect(b.locator(".note-access-count")).toHaveText("2/3");
  await expect(b).toHaveAttribute("aria-expanded", "false");
  await expect(b).toHaveAttribute("aria-haspopup", "dialog");
  await shot(app.page, info, "92-depois-nota-mestre-fechado-desktop-claro");
  // Hovering shows the summary: every player with an icon and a word, and the way to change.
  await b.hover();
  const p = pop(app);
  await expect(p).toBeVisible();
  const rows = p.getByRole("list", { name: "Jogadores" }).getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveText(/Bia\s*✓\s*vê/);
  await expect(rows.nth(1)).toHaveText(/Caio\s*✓\s*vê/);
  await expect(rows.nth(2)).toHaveText(/Dora\s*✗\s*não vê/);
  await expect(p.getByRole("button", { name: "Alterar o acesso…" })).toBeVisible();
  await shot(app.page, info, "93-depois-nota-mestre-popover-desktop-claro");
  await app.page.emulateMedia({ colorScheme: "dark" });
  await shot(app.page, info, "94-depois-nota-mestre-popover-desktop-escuro");
  await app.page.emulateMedia({ colorScheme: "light" });
  // Its button opens the dialog, and the summary gives way.
  await p.getByRole("button", { name: "Alterar o acesso…" }).click();
  await expect(dialogOf(app)).toBeVisible();
  await expect(p).toBeHidden();
  await app.page.keyboard.press("Escape");
  await expect(dialogOf(app)).toBeHidden();
  await expect(b).toBeFocused();
  // A click on the button, and Enter and Space, are the dialog.
  await app.page.mouse.move(700, 600);
  await b.click();
  await expect(dialogOf(app)).toBeVisible();
  await app.page.keyboard.press("Escape");
  await b.focus();
  await app.page.keyboard.press("Enter");
  await expect(dialogOf(app)).toBeVisible();
  await app.page.keyboard.press("Escape");
});

test("hovering the indicator opens its popover after a moment, and leaving it closes", async ({ app }, info) => {
  test.skip(/phone|tablet/.test(info.project.name), "a finger has no hover");
  await setup(app, "owner", { "Mundo/Cripta.md": players("acc-bia") });
  await open(app);
  await button(app).hover();
  await expect(pop(app)).toBeVisible();
  await expect(button(app)).toHaveAttribute("aria-expanded", "true");
  await app.page.mouse.move(700, 600);
  await expect(pop(app)).toBeHidden();
  // A click is the dialog, and it stays when the pointer leaves.
  await button(app).hover();
  await button(app).click();
  await app.page.mouse.move(700, 600);
  await app.page.waitForTimeout(500);
  await expect(dialogOf(app)).toBeVisible();
});

test("the indicator and its summary repaint with what the dialog saves", async ({ app }, info) => {
  test.skip(/phone|tablet/.test(info.project.name), "a finger has no hover");
  await setup(app, "owner", { "Mundo/Cripta.md": players("acc-bia") });
  await open(app);
  await expect(button(app).locator(".note-access-count")).toHaveText("1/3");
  await button(app).click();
  const d = dialogOf(app);
  await choose(d, "Caio", "Vê");
  await expect(d.getByRole("status")).toContainText("Salvo ✓");
  await app.page.keyboard.press("Escape");
  await expect(button(app).locator(".note-access-count")).toHaveText("2/3");
  await expect(button(app)).toHaveAccessibleName("Quem vê esta nota: 2 de 3 jogadores");
  await button(app).hover();
  await expect(pop(app).getByRole("listitem").filter({ hasText: "Caio" })).toHaveText(/✓\s*vê/);
  // Another window hides it: the event repaints the open summary.
  await app.page.evaluate(() => {
    const c = window.__harness.campaign;
    c.sets.delete("Mundo/Cripta.md");
    const s = c.notes.get("Mundo/Cripta.md");
    s.audience = { kind: "hidden" };
    s.released = false;
    window.__harness.emit("access-changed", { paths: ["Mundo/Cripta.md"] });
  });
  await expect(button(app).locator(".note-access-count")).toHaveText("0/3");
  await expect(pop(app).getByRole("listitem").filter({ hasText: "Bia" })).toHaveText(/✗\s*não vê/);
  await expect(pop(app)).toContainText("Só o mestre vê esta nota.");
});

test("an edit grant shows as 'edita', and the indicator is absent where it means nothing", async ({ app }) => {
  await setup(app, "owner", { "Mundo/Cripta.md": players("acc-bia", "acc-caio"), "Fora.md": { audience: { kind: "hidden" } } });
  await app.page.evaluate(() => {
    window.__harness.campaign.notes.get("Mundo/Cripta.md").grant = { kind: "player", account: "acc-caio" };
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  await open(app);
  await button(app).hover();
  await expect(pop(app).getByRole("listitem").filter({ hasText: "Caio" })).toHaveText(/✓\s*edita/);
  await app.page.mouse.move(700, 600);
  // A note outside the table has no indicator.
  await app.writeOutside("Fora.md", "# Fora\n");
  await app.folderChanged(["Fora.md"], true);
  await row(app, "Fora.md").click();
  await expect(app.page.locator(".note-sheet .note-title").first()).toBeVisible();
  await expect(app.page.locator(".note-access:not([hidden])")).toHaveCount(0);
});

test("on a folder of this computer alone, no indicator", async ({ app }) => {
  await app.open("?vault=empty");
  await app.writeOutside("Nota.md", "# Nota\n");
  await app.folderChanged(["Nota.md"], true);
  await row(app, "Nota.md").click();
  await expect(app.page.locator(".note-sheet .note-title").first()).toBeVisible();
  await expect(app.page.locator(".note-access:not([hidden])")).toHaveCount(0);
});

test("a table with no player yet has no indicator for the game master", async ({ app }) => {
  await setup(app, "owner", { "Mundo/Cripta.md": { audience: { kind: "hidden" } } });
  await app.page.evaluate(() => {
    window.__harness.campaign.players = [{ id: "acc-ana", name: "Ana" }];
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  await open(app);
  await expect(app.page.locator(".note-access:not([hidden])")).toHaveCount(0);
});

test("a player's indicator says who sees the note, never a game-master control or a name of someone who does not", async ({ app }, info) => {
  await setup(app, "player", { "Mundo/Cripta.md": players("acc-ana", "acc-bia") });
  await open(app);
  const b = button(app);
  await expect(b).toBeVisible();
  // The one asking is "Você", first.
  await expect(b).toHaveAccessibleName("Quem vê esta nota: Você, Bia e o mestre");
  await expect(b.locator(".note-access-count")).toHaveText("3");
  await shot(app.page, info, "95-depois-nota-jogador-fechado-desktop-claro");
  await b.click();
  const p = pop(app);
  await expect(p).toBeVisible();
  await expect(p).toContainText("Você");
  await expect(p).not.toContainText("Ana");
  await expect(p).toContainText("Bia");
  await expect(p).toContainText("Mestre Ravena");
  await expect(p).not.toContainText("Caio");
  await expect(p.getByRole("button", { name: "Alterar o acesso…" })).toHaveCount(0);
  await expect(p.getByText(/não vê/)).toHaveCount(0);
  await shot(app.page, info, "96-depois-nota-jogador-popover-desktop-claro");
  await app.page.emulateMedia({ colorScheme: "dark" });
  await shot(app.page, info, "97-depois-nota-jogador-popover-desktop-escuro");
  await app.page.emulateMedia({ colorScheme: "light" });
  await app.page.keyboard.press("Escape");
  await expect(b).toBeFocused();
  // The audience widens to the whole table: the name and the popover repaint, with no names.
  await app.page.evaluate(() => {
    const s = window.__harness.campaign.notes.get("Mundo/Cripta.md");
    s.audience = { kind: "table" };
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  await expect(b).toHaveAccessibleName("Quem vê esta nota: toda a mesa");
  await expect(b.locator(".note-access-count")).toHaveText("Mesa");
  await b.click();
  await expect(pop(app)).toContainText("Toda a mesa vê esta nota.");
  await expect(pop(app)).not.toContainText("Caio");
  await app.page.keyboard.press("Escape");
  // Narrowed to the player alone: only the player and the game master.
  await app.page.evaluate(() => {
    window.__harness.campaign.notes.get("Mundo/Cripta.md").audience = { kind: "players", accounts: ["acc-ana"] };
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  await expect(b).toHaveAccessibleName("Quem vê esta nota: só você e o mestre");
});

test("a player cannot reach a note it cannot see, so there is no indicator for it", async ({ app }) => {
  await setup(app, "player", { "Mundo/Cripta.md": players("acc-ana"), "Mundo/Diario.md": players("acc-bia") });
  await expect(row(app, "Mundo/Diario.md")).toHaveCount(0);
  await open(app);
  await expect(button(app)).toBeVisible();
});

test("the indicator fits at any width: no horizontal overflow, a touch-sized button, a popover on the screen @layout", async ({ app }) => {
  await setup(app, "owner", { "Mundo/Cripta.md": players("acc-bia", "acc-caio") });
  await open(app);
  const b = button(app);
  await expect(b).toBeVisible();
  const box = await b.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(36);
  expect(box.height).toBeGreaterThanOrEqual(36);
  const view = app.page.viewportSize();
  expect(box.x + box.width).toBeLessThanOrEqual(view.width + 1);
  await b.click();
  const p = await app.page.locator(".access-pop").boundingBox();
  expect(p.x).toBeGreaterThanOrEqual(-1);
  expect(p.x + p.width).toBeLessThanOrEqual(view.width + 1);
  expect(p.y + p.height).toBeLessThanOrEqual(view.height + 1);
  expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("on a phone the dialog is a bottom sheet with a close button and 44 px targets, and nothing overflows", async ({ app }, info) => {
  await setup(app, "owner", { "Mundo/Cripta.md": players("acc-bia", "acc-caio") }, { phone: true });
  await open(app);
  const b = button(app);
  await expect(b).toBeVisible();
  const box = await b.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await shot(app.page, info, "101-depois-nota-mestre-telefone-fechado-claro");
  await b.click();
  const d = dialogOf(app);
  await expect(d).toHaveClass(/is-sheet/);
  const sheet = await d.boundingBox();
  expect(sheet.x).toBeLessThanOrEqual(1);
  expect(sheet.x + sheet.width).toBeGreaterThanOrEqual(389);
  expect(sheet.y + sheet.height).toBeGreaterThanOrEqual(843);
  // A dialog the finger opened: its close button has the focus.
  const close = d.getByRole("button", { name: "Fechar" });
  await expect(close).toBeFocused();
  for (const who of ["Toda a mesa", "Bia", "Caio", "Dora"]) {
    const sel = await select(d, who).boundingBox();
    expect(sel.height).toBeGreaterThanOrEqual(43.5);
    const li = await select(d, who).locator("xpath=ancestor::li").boundingBox();
    expect(li.height).toBeGreaterThanOrEqual(55.5);
  }
  expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await shot(app.page, info, "142-depois-acesso-telefone-claro");
  await app.page.emulateMedia({ colorScheme: "dark" });
  await shot(app.page, info, "143-depois-acesso-telefone-escuro");
  await app.page.emulateMedia({ colorScheme: "light" });
  await choose(d, "Dora", "Vê");
  await expect.poll(() => lastSet(app)).toMatchObject({ change: { set: { rows: expect.arrayContaining([{ account: "acc-dora", level: "see" }]) } } });
  await expect(b.locator(".note-access-count")).toHaveText("3/3");
  await close.click();
  await expect(d).toBeHidden();
  await expect(b).toBeFocused();
});

test("a player's phone sheet shows who sees it, with no control", async ({ app }, info) => {
  await setup(app, "player", { "Mundo/Cripta.md": players("acc-ana", "acc-bia") }, { phone: true });
  await open(app);
  await button(app).click();
  const p = pop(app);
  await expect(p).toHaveClass(/is-sheet/);
  // A dialog the finger opened: its close button has the focus.
  await expect(p.getByRole("button", { name: "Fechar" })).toBeFocused();
  await expect(p.getByRole("button", { name: "Alterar o acesso…" })).toHaveCount(0);
  await expect(p).toContainText("Bia");
  // The one asking is "Você", first; the button carries no native tooltip beside the popover.
  await expect(p.getByRole("listitem").first()).toHaveText("Você");
  await expect(p.getByRole("listitem").nth(1)).toHaveText("Bia");
  await expect(button(app)).not.toHaveAttribute("title", /./);
  await shot(app.page, info, "104-depois-nota-jogador-telefone-folha-claro");
  await p.getByRole("button", { name: "Fechar" }).click();
  await expect(p).toBeHidden();
});

test("in a narrow pane the count gives way and the icon and its name stay; a long title does not push it out", async ({ app }, info) => {
  test.skip(/phone|tablet/.test(info.project.name), "the pane's width is driven on a wide window");
  await app.page.setViewportSize({ width: 1440, height: 900 });
  await setup(app, "owner", { "Mundo/Cripta.md": players("acc-bia", "acc-caio") });
  await open(app);
  const b = button(app);
  await expect(b.locator(".note-access-count")).toBeVisible();
  // A pane 300 px wide, and a title that cannot fit.
  await app.page.evaluate(() => {
    const sheet = document.querySelector(".note-sheet");
    sheet.style.width = "300px";
    sheet.style.maxWidth = "300px";
    sheet.querySelector(".note-title").textContent = "Uma cripta com um nome muito comprido que nunca cabe numa linha só ".repeat(2);
  });
  await expect(b.locator(".note-access-count")).toBeHidden();
  await expect(b).toBeVisible();
  await expect(b).toHaveAccessibleName("Quem vê esta nota: 2 de 3 jogadores");
  const row = await app.page.locator(".note-sheet .title-row").first().boundingBox();
  const at = await b.boundingBox();
  expect(at.x + at.width).toBeLessThanOrEqual(row.x + row.width + 1);
  const star = await app.page.locator(".note-sheet .star").first().boundingBox();
  expect(star.x + star.width).toBeLessThanOrEqual(row.x + row.width + 1);
  await shot(app.page, info, "98-depois-nota-mestre-painel-estreito-claro");
  await b.hover();
  const p = await pop(app).boundingBox();
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x + p.width).toBeLessThanOrEqual(1440);
  await shot(app.page, info, "99-depois-nota-mestre-painel-estreito-popover-claro");
  await app.page.keyboard.press("Escape");
});

test("in a narrow pane a player's popover stays whole", async ({ app }, info) => {
  test.skip(/phone|tablet/.test(info.project.name), "the pane's width is driven on a wide window");
  await app.page.setViewportSize({ width: 1440, height: 900 });
  await setup(app, "player", { "Mundo/Cripta.md": players("acc-ana", "acc-bia") });
  await open(app);
  await app.page.evaluate(() => {
    const sheet = document.querySelector(".note-sheet");
    sheet.style.width = "300px";
    sheet.style.maxWidth = "300px";
  });
  await button(app).click();
  await expect(pop(app)).toContainText("Bia");
  await shot(app.page, info, "100-depois-nota-jogador-painel-estreito-popover-claro");
});
