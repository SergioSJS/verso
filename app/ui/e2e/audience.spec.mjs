// Who sees a note of a table (ADR 0110 item 4, amended 2026-10-23): the
// note's menu "Liberar para…" (the whole table, each player, nobody) and the
// access indicator in the note's title row — a button with the users icon
// and a count whose popover says who sees the note. The server's commands
// are played by the harness (`src/harness/campaign.ts`); the server's own
// rules are tried in `crates/verso-server`.

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

test("the note's menu releases it to the whole table, to some players, or to nobody, and stays open while players are ticked", async ({ app }) => {
  await setup(app, "owner", { "Mundo/Cripta.md": { audience: { kind: "hidden" } }, "Mundo/Diario.md": { audience: { kind: "hidden" } } });
  const menuOf = async () => {
    await row(app, "Mundo/Cripta.md").click({ button: "right" });
    await app.page.getByRole("menuitem", { name: "Liberar para…" }).click();
  };
  // A row of this menu is a check box: it says whether it is on.
  const item = (name, checked) => app.page.getByRole("menuitemcheckbox", checked === undefined ? { name } : { name, checked });
  const last = async () => (await app.calls("campaign_audience")).at(-1);
  // A hidden note: only "Ninguém (oculta)" is checked; no "Toda a mesa" yet; every player offered.
  await menuOf();
  await expect(item("Ninguém (oculta)", true)).toBeVisible();
  for (const n of ["Toda a mesa", "Bia", "Caio", "Dora"]) await expect(item(n, false)).toBeVisible();
  await shot(app.page, test.info(), "105-depois-menu-liberar-para-claro");
  // One player: the audience is that player alone, and the status line says whom.
  await item("Bia").click();
  await expect.poll(last).toEqual({ paths: ["Mundo/Cripta.md"], audience: { kind: "players", accounts: ["acc-bia"] } });
  await expect(app.page.locator("#status")).toHaveText("Liberada para Bia.");
  // The menu is still there: Caio is ticked in it too, Bia stays checked, the table row is not,
  // and nothing turns into "table" by itself.
  await expect(item("Bia", true)).toBeVisible();
  await item("Caio").click();
  await expect.poll(last).toEqual({ paths: ["Mundo/Cripta.md"], audience: { kind: "players", accounts: ["acc-bia", "acc-caio"] } });
  await expect(item("Bia", true)).toBeVisible();
  await expect(item("Caio", true)).toBeVisible();
  await expect(item("Toda a mesa", false)).toBeVisible();
  await expect(item("Ninguém (oculta)", false)).toBeVisible();
  // The whole table: every player is checked; clicking one takes that player out and leaves the others.
  await item("Toda a mesa").click();
  await expect(app.page.locator("#status")).toHaveText("Liberada para toda a mesa.");
  for (const n of ["Toda a mesa", "Bia", "Caio", "Dora"]) await expect(item(n, true)).toBeVisible();
  await item("Caio").click();
  await expect.poll(last).toEqual({ paths: ["Mundo/Cripta.md"], audience: { kind: "players", accounts: ["acc-bia", "acc-dora"] } });
  await expect(item("Caio", false)).toBeVisible();
  // Unchecking the last player hides the note; so does "Ninguém (oculta)".
  await item("Bia").click();
  await item("Dora").click();
  await expect.poll(last).toEqual({ paths: ["Mundo/Cripta.md"], audience: { kind: "hidden" } });
  await expect(item("Ninguém (oculta)", true)).toBeVisible();
  await expect(row(app, "Mundo/Cripta.md").locator(".hidden-mark")).toHaveCount(1);
  await item("Toda a mesa").click();
  await item("Ninguém (oculta)").click();
  await expect(app.page.locator("#status")).toHaveText("Oculta da mesa.");
  await expect(row(app, "Mundo/Cripta.md").locator(".hidden-mark")).toHaveCount(1);
  // The keyboard ticks too: Space on a focused row; Escape leaves the menu.
  await item("Bia").focus();
  await app.page.keyboard.press("Space");
  await expect(item("Bia", true)).toBeVisible();
  await app.page.keyboard.press("Escape");
  await expect(item("Bia")).toHaveCount(0);
});

test("a selection and a folder are still released and hidden for the whole table", async ({ app }) => {
  await setup(app, "owner", { "Mundo/Cripta.md": { audience: { kind: "hidden" } }, "Mundo/Diario.md": { audience: { kind: "hidden" } }, "Mundo/Sala/Eco.md": { audience: { kind: "hidden" } } });
  await app.page.locator('#notes summary[data-folder="Mundo/Sala"]').click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Liberar tudo daqui" }).click();
  await expect.poll(async () => (await app.calls("campaign_release")).at(-1)).toEqual({ paths: ["Mundo/Sala"], released: true });
  await expect(row(app, "Mundo/Sala/Eco.md").locator(".hidden-mark")).toHaveCount(0);
  await row(app, "Mundo/Cripta.md").click({ modifiers: ["ControlOrMeta"] });
  await row(app, "Mundo/Diario.md").click({ modifiers: ["ControlOrMeta"] });
  await row(app, "Mundo/Diario.md").click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Ocultar da mesa" }).click();
  await expect.poll(async () => (await app.calls("campaign_release")).at(-1)).toMatchObject({ released: false });
  await expect(app.page.locator("#status")).toHaveText("2 notas ocultas da mesa.");
  expect(await app.calls("campaign_audience")).toHaveLength(0);
});

test("an edit grant to a player who could not see the note adds them, and the status line says so", async ({ app }) => {
  await setup(app, "owner", { "Mundo/Cripta.md": players("acc-bia") });
  await row(app, "Mundo/Cripta.md").click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Editável por: ninguém" }).click();
  await app.page.getByRole("menuitem", { name: "Caio" }).click();
  await expect(app.page.locator("#status")).toHaveText("Só Caio edita esta nota. Caio também passou a ver esta nota.");
  await row(app, "Mundo/Cripta.md").click({ button: "right" });
  await app.page.getByRole("menuitem", { name: "Liberar para…" }).click();
  await expect(app.page.getByRole("menuitemcheckbox", { name: "Caio", checked: true })).toBeVisible();
  await expect(app.page.getByRole("menuitemcheckbox", { name: "Bia", checked: true })).toBeVisible();
});

test("the game master's indicator: count, name, popover with every player, keyboard and pointer", async ({ app }, info) => {
  await setup(app, "owner", { "Mundo/Cripta.md": players("acc-bia", "acc-caio") });
  await open(app);
  const b = button(app);
  await expect(b).toBeVisible();
  await expect(b).toHaveAccessibleName("Quem vê esta nota: 2 de 3 jogadores");
  await expect(b.locator(".note-access-count")).toHaveText("2/3");
  await expect(b).toHaveAttribute("aria-expanded", "false");
  await expect(b).toHaveAttribute("aria-haspopup", "dialog");
  await shot(app.page, info, "92-depois-nota-mestre-fechado-desktop-claro");
  // A click opens it pinned; it lists every player with an icon and a word, and the way to change.
  await b.click();
  await expect(b).toHaveAttribute("aria-expanded", "true");
  const p = pop(app);
  await expect(p).toBeVisible();
  const rows = p.getByRole("list", { name: "Jogadores" }).getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveText(/Bia\s*✓\s*vê/);
  await expect(rows.nth(1)).toHaveText(/Caio\s*✓\s*vê/);
  await expect(rows.nth(2)).toHaveText(/Dora\s*✗\s*não vê/);
  await expect(p.getByRole("button", { name: "Alterar quem vê…" })).toBeVisible();
  await shot(app.page, info, "93-depois-nota-mestre-popover-desktop-claro");
  await app.page.emulateMedia({ colorScheme: "dark" });
  await shot(app.page, info, "94-depois-nota-mestre-popover-desktop-escuro");
  await app.page.emulateMedia({ colorScheme: "light" });
  // Opening it moved nothing: the title row is where it was.
  // Escape closes it and the focus goes back to the button.
  await app.page.keyboard.press("Escape");
  await expect(p).toBeHidden();
  await expect(b).toBeFocused();
  await expect(b).toHaveAttribute("aria-expanded", "false");
  // Enter and Space open it from the keyboard.
  await app.page.keyboard.press("Enter");
  await expect(p).toBeVisible();
  await app.page.keyboard.press("Escape");
  await expect(p).toBeHidden();
  await app.page.keyboard.press("Space");
  await expect(p).toBeVisible();
  // Tab goes into it (the way to change), and Escape comes back out to the button.
  await app.page.keyboard.press("Tab");
  await expect(p.getByRole("button", { name: "Alterar quem vê…" })).toBeFocused();
  await app.page.keyboard.press("Escape");
  await expect(p).toBeHidden();
  await expect(b).toBeFocused();
  // A click outside closes it.
  await b.click();
  await expect(p).toBeVisible();
  await app.page.locator(".note-sheet .preview").first().click({ position: { x: 5, y: 5 } });
  await expect(p).toBeHidden();
  // Clicking the button twice closes it.
  await b.click();
  await b.click();
  await expect(p).toBeHidden();
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
  // A click while hovering pins it: it stays when the pointer leaves.
  await button(app).hover();
  await expect(pop(app)).toBeVisible();
  await button(app).click();
  await app.page.mouse.move(700, 600);
  await app.page.waitForTimeout(500);
  await expect(pop(app)).toBeVisible();
});

test("its shortcut opens the same menu, and the indicator and popover repaint with the audience", async ({ app }) => {
  await setup(app, "owner", { "Mundo/Cripta.md": players("acc-bia") });
  await open(app);
  await expect(button(app).locator(".note-access-count")).toHaveText("1/3");
  await button(app).click();
  await pop(app).getByRole("button", { name: "Alterar quem vê…" }).click();
  await app.page.getByRole("menuitemcheckbox", { name: "Caio" }).click();
  // The popover stays and says it now: both see it; the count and the name follow.
  await expect(pop(app)).toBeVisible();
  await expect(pop(app).getByRole("listitem").filter({ hasText: "Caio" })).toHaveText(/✓\s*vê/);
  await expect(button(app).locator(".note-access-count")).toHaveText("2/3");
  await expect(button(app)).toHaveAccessibleName("Quem vê esta nota: 2 de 3 jogadores");
  // Another window hides it: the status event repaints the open popover.
  await app.page.evaluate(() => {
    const c = window.__harness.campaign;
    const s = c.notes.get("Mundo/Cripta.md");
    s.audience = { kind: "hidden" };
    s.released = false;
    window.__harness.emit("campaign-changed", { paths: ["Mundo/Cripta.md"] });
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
  await button(app).click();
  await expect(pop(app).getByRole("listitem").filter({ hasText: "Caio" })).toHaveText(/✓\s*edita/);
  await app.page.keyboard.press("Escape");
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
  await expect(b).toHaveAccessibleName("Quem vê esta nota: Ana, Bia e o mestre");
  await expect(b.locator(".note-access-count")).toHaveText("3");
  await shot(app.page, info, "95-depois-nota-jogador-fechado-desktop-claro");
  await b.click();
  const p = pop(app);
  await expect(p).toBeVisible();
  await expect(p).toContainText("Ana");
  await expect(p).toContainText("Bia");
  await expect(p).toContainText("Mestre Ravena");
  await expect(p).not.toContainText("Caio");
  await expect(p.getByRole("button", { name: "Alterar quem vê…" })).toHaveCount(0);
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
  const p = await pop(app).boundingBox();
  expect(p.x).toBeGreaterThanOrEqual(-1);
  expect(p.x + p.width).toBeLessThanOrEqual(view.width + 1);
  expect(p.y + p.height).toBeLessThanOrEqual(view.height + 1);
  expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("on a phone the popover is a bottom sheet with a close button, and nothing overflows", async ({ app }, info) => {
  await setup(app, "owner", { "Mundo/Cripta.md": players("acc-bia", "acc-caio") }, { phone: true });
  await open(app);
  const b = button(app);
  await expect(b).toBeVisible();
  const box = await b.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await shot(app.page, info, "101-depois-nota-mestre-telefone-fechado-claro");
  await b.click();
  const p = pop(app);
  await expect(p).toHaveClass(/is-sheet/);
  const sheet = await p.boundingBox();
  expect(sheet.x).toBeLessThanOrEqual(1);
  expect(sheet.x + sheet.width).toBeGreaterThanOrEqual(389);
  expect(sheet.y + sheet.height).toBeGreaterThanOrEqual(843);
  const close = p.getByRole("button", { name: "Fechar" });
  await expect(close).toBeVisible();
  await expect(p.getByRole("button", { name: "Alterar quem vê…" })).toBeInViewport();
  expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await shot(app.page, info, "102-depois-nota-mestre-telefone-folha-claro");
  await app.page.emulateMedia({ colorScheme: "dark" });
  await shot(app.page, info, "103-depois-nota-mestre-telefone-folha-escuro");
  await app.page.emulateMedia({ colorScheme: "light" });
  // The shortcut's menu opens over the sheet and the sheet stays.
  await p.getByRole("button", { name: "Alterar quem vê…" }).click();
  await expect(app.page.getByRole("menuitemcheckbox", { name: "Toda a mesa" })).toBeVisible();
  await app.page.getByRole("menuitemcheckbox", { name: "Dora" }).click();
  await expect(p).toBeVisible();
  await expect(b.locator(".note-access-count")).toHaveText("3/3");
  await close.click();
  await expect(p).toBeHidden();
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
  await expect(p.getByRole("button", { name: "Alterar quem vê…" })).toHaveCount(0);
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
  await b.click();
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
