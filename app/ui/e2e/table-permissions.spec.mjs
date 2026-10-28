// The players' access table of the table's window (ADR 0110; ADR 0113 K.6):
// a real table with the columns Jogador, Vê, Edita and Direitos; the count of
// rights opens, under the row, four switches (Imagens, Arquivos, Cria notas,
// Cria boards) that save at once; under the table a "todos" box per right that
// is mixed when the players differ; the lists behind the counts, the
// keyboard, a card per player on a phone; and the player's window learning
// the permission live (the attach button appears and goes). The
// server's commands are played by the harness (`src/harness/campaign.ts`);
// the server's own rules are tried in `crates/verso-server/src/tests_table_images.rs`.

import { test, expect } from "./fixtures.mjs";

const SHOTS = process.env.SHOTS;
const shot = async (page, info, name) => {
  if (!SHOTS || !/^(chromium|phone-webkit)$/.test(info.project.name)) return;
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==", "base64");
const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;
const tag = (page) => (phone(page) ? "telefone" : "desktop");

const PLAYERS = [
  { id: "acc-ana", name: "Ana" },
  { id: "acc-bia", name: "Bia" },
  { id: "acc-caio", name: "Caio" },
  { id: "acc-dora", name: "Dora" },
];
const TABLE = { root: "", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 };

async function showMesa(app) {
  const page = app.page;
  if (phone(page)) await page.locator(".bar-right").click();
  else await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  await expect(view).toBeVisible();
  return view;
}

/** The owner's window on a table of three players, the dialog open. */
async function owner(app) {
  if (!phone(app.page) && (app.page.viewportSize()?.width ?? 0) > 1400) await app.page.setViewportSize({ width: 1440, height: 900 });
  await app.open("?vault=empty&table=owner");
  const files = { "Aberta.md": "# Aberta\n", "Livre.md": "# Livre\n", "Cripta.md": "# Cripta\n" };
  for (const [p, text] of Object.entries(files)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(files), true);
  await app.page.evaluate(
    ([table, players]) => {
      const c = window.__harness.campaign;
      c.tables = [table];
      c.players = players;
      c.notes.set("Aberta.md", { path: "Aberta.md", released: true, audience: { kind: "table" }, secret_name: false, grant: { kind: "none" } });
      c.notes.set("Livre.md", { path: "Livre.md", released: true, audience: { kind: "players", accounts: ["acc-bia"] }, secret_name: false, grant: { kind: "none" } });
      c.notes.set("Cripta.md", { path: "Cripta.md", released: true, audience: { kind: "players", accounts: ["acc-bia"] }, secret_name: false, grant: { kind: "player", account: "acc-bia" } });
      window.__harness.emit("campaign-changed", { paths: [] });
    },
    [TABLE, PLAYERS],
  );
  const view = await showMesa(app);
  await view.getByRole("button", { name: "Abrir a janela da Mesa" }).click();
  const dialog = app.page.getByRole("dialog", { name: /^Mesa da pasta/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

const grid = (dialog) => dialog.getByRole("table", { name: "Jogadores da mesa e o que cada um pode fazer" });

/** The count of rights of a player, which opens the four switches. */
const rightsBtn = (dialog, name) => dialog.getByRole("button", { name: new RegExp(`^${name} tem \\d de 4 direitos`) });
/** A player's switch for a right: "imagens", "arquivos", "criar notas", "criar boards". */
const sw = (dialog, name, what = "enviar imagens") => dialog.getByRole("switch", { name: `${name} pode ${what}` });

test("the players are a table with columns, and the rights of each save at once @layout", async ({ app }, info) => {
  const dialog = await owner(app);
  const t = grid(dialog);
  await expect(t).toBeVisible();
  // Real column and row headers (a phone keeps the icons, and the name for readers).
  for (const col of ["Jogador", "Vê", "Edita", "Direitos"]) {
    if (phone(app.page) && col === "Jogador") continue;
    await expect(t.getByRole("columnheader", { name: col })).toBeVisible();
  }
  const rows = t.getByRole("row").filter({ has: app.page.getByRole("rowheader") });
  await expect(rows).toHaveCount(3);
  await expect(t.getByRole("rowheader", { name: /^Bia/ })).toBeVisible();
  // What each sees and edits, as counts that open the lists.
  const bia = rows.filter({ hasText: "Bia" });
  await expect(bia.getByRole("button", { name: "Bia vê 3 notas; mostrar a lista" })).toHaveText("3");
  await expect(bia.getByRole("button", { name: "Bia edita 1 nota; mostrar a lista" })).toHaveText("1");
  await expect(rows.filter({ hasText: "Caio" }).getByRole("button", { name: "Caio vê 1 nota; mostrar a lista" })).toHaveText("1");
  await expect(bia.getByRole("button", { name: /^Bia vê/ })).toHaveAttribute("aria-controls", /^cd-detail-\d+-\d+$/);
  await bia.getByRole("button", { name: /^Bia vê/ }).click();
  await expect(dialog.getByText("Notas que Bia vê")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cripta" }).first()).toBeVisible();
  await expect(bia.getByRole("button", { name: /^Bia vê/ })).toHaveAttribute("aria-expanded", "true");
  await bia.getByRole("button", { name: /^Bia vê/ }).click();
  await expect(dialog.getByText("Notas que Bia vê")).toHaveCount(0);

  // Every right starts off: nobody sends or creates anything until the game master says.
  await expect(bia.getByRole("button", { name: "Bia tem 0 de 4 direitos; mostrar a lista" })).toHaveText("0/4");
  await bia.getByRole("button", { name: /^Bia tem/ }).click();
  await expect(dialog.getByText("Direitos de Bia")).toBeVisible();
  for (const what of ["enviar imagens", "enviar arquivos", "criar notas", "criar boards"]) await expect(sw(dialog, "Bia", what)).not.toBeChecked();
  await shot(app.page, info, `114-depois-acesso-jogadores-${tag(app.page)}-claro`);
  // It saves at once and says so beside the switch; the call names the table, the player and the right.
  await sw(dialog, "Bia").check({ force: true });
  await expect.poll(() => app.calls("table_rights_set")).toEqual([{ root: "", accounts: ["acc-bia"], right: "images", on: true }]);
  await expect(sw(dialog, "Bia")).toBeChecked();
  await expect(dialog.locator(".cd-right").filter({ has: app.page.getByRole("switch", { name: "Bia pode enviar imagens" }) }).locator(".cd-feedback")).toHaveText("Salvo");
  await expect(app.page.locator("#status")).toHaveText("Bia pode enviar imagens agora.");
  await expect(bia.getByRole("button", { name: /^Bia tem/ })).toHaveText("1/4");
  // The four rights are four calls of one command.
  await sw(dialog, "Bia", "enviar arquivos").check({ force: true });
  await sw(dialog, "Bia", "criar notas").check({ force: true });
  await sw(dialog, "Bia", "criar boards").check({ force: true });
  await expect.poll(async () => (await app.calls("table_rights_set")).map((c) => c.right)).toEqual(["images", "files", "create_notes", "create_boards"]);
  await expect(bia.getByRole("button", { name: /^Bia tem/ })).toHaveText("4/4");
  await sw(dialog, "Bia", "criar boards").uncheck({ force: true });
  await expect.poll(async () => (await app.calls("table_rights_set")).at(-1)).toEqual({ root: "", accounts: ["acc-bia"], right: "create_boards", on: false });
  // Under the table, a box per right for everyone: mixed while the players differ; ticking it gives everyone, unticking takes it from everyone.
  const all = dialog.getByRole("checkbox", { name: "Todos podem enviar imagens" });
  await expect(all).toHaveJSProperty("indeterminate", true);
  await all.check({ force: true });
  await expect.poll(async () => (await app.calls("table_rights_set")).at(-1)).toEqual({ root: "", accounts: ["acc-bia", "acc-caio", "acc-dora"], right: "images", on: true });
  await expect(all).toBeChecked();
  await expect(all).toHaveJSProperty("indeterminate", false);
  await expect(app.page.locator("#status")).toHaveText("Todos os jogadores podem enviar imagens.");
  await shot(app.page, info, `115-depois-acesso-jogadores-imagens-${tag(app.page)}-claro`);
  const caio = rows.filter({ hasText: "Caio" });
  await caio.getByRole("button", { name: /^Caio tem/ }).click();
  await expect(sw(dialog, "Caio")).toBeChecked();
  await sw(dialog, "Caio").uncheck({ force: true });
  await expect.poll(async () => (await app.calls("table_rights_set")).at(-1)).toEqual({ root: "", accounts: ["acc-caio"], right: "images", on: false });
  await expect(all).toHaveJSProperty("indeterminate", true);
  await expect(app.page.locator("#status")).toHaveText("Caio não envia mais imagens.");
  // No sideways scroll anywhere, on a phone least of all.
  const wide = await app.page.evaluate(() => {
    const d = document.querySelector(".campaign-dialog");
    return [document.documentElement.scrollWidth - document.documentElement.clientWidth, d.scrollWidth - d.clientWidth];
  });
  expect(wide[0]).toBeLessThanOrEqual(0);
  expect(wide[1]).toBeLessThanOrEqual(0);
  if (phone(app.page)) {
    // A slim row per player; the switches open under it, each a 44 px target.
    const box = await rows.first().boundingBox();
    const dlg = await dialog.boundingBox();
    expect(box.width).toBeLessThanOrEqual(dlg.width);
    await expect(sw(dialog, "Bia")).toBeVisible();
    const label = await dialog.locator(".cd-right-label").first().boundingBox();
    expect(label.height).toBeGreaterThanOrEqual(43);
  }
});

test("the keyboard reaches every control of the table and the dark theme reads", async ({ app }, info) => {
  test.skip(phone(app.page), "a finger has no keys");
  const dialog = await owner(app);
  // The count of rights opens with Enter; Tab goes to the first switch, which Space turns on.
  const count = rightsBtn(dialog, "Bia");
  await count.focus();
  await app.page.keyboard.press("Enter");
  await expect(count).toHaveAttribute("aria-expanded", "true");
  await app.page.keyboard.press("Tab");
  const first = sw(dialog, "Bia");
  await expect(first).toBeFocused();
  await app.page.keyboard.press("Space");
  await expect.poll(() => app.calls("table_rights_set")).toEqual([{ root: "", accounts: ["acc-bia"], right: "images", on: true }]);
  // The focus stays on the switch after it saves, to carry on.
  await expect(first).toBeFocused();
  // Tab goes on through the other three switches to the next player's counts, in reading order.
  const seen = [];
  for (let i = 0; i < 8; i++) {
    await app.page.keyboard.press("Tab");
    seen.push(await app.page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? ""));
  }
  expect(seen.some((s) => /Caio vê/.test(s))).toBe(true);
  // The count opens its list with Enter and the list's link is reachable.
  const sees = dialog.getByRole("button", { name: /^Caio vê/ });
  await sees.focus();
  await app.page.keyboard.press("Enter");
  await expect(sees).toHaveAttribute("aria-expanded", "true");
  await expect(sees).toBeFocused();
  await app.page.keyboard.press("Tab");
  await expect(dialog.getByText("Notas que Caio vê")).toBeVisible();
  await app.page.emulateMedia({ colorScheme: "dark" });
  await shot(app.page, info, `116-depois-acesso-jogadores-${tag(app.page)}-escuro`);
  await app.page.emulateMedia({ colorScheme: "light" });
  // Escape closes the window.
  await app.page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("a refused change puts the switch back and says why", async ({ app }) => {
  const dialog = await owner(app);
  await app.page.evaluate(() => {
    window.__harness.core.handlers["table_rights_set"] = () => {
      throw { kind: "refused", message: "not a player of this table" };
    };
  });
  await rightsBtn(dialog, "Dora").click();
  const dora = sw(dialog, "Dora");
  app.expected.push(/refused: not a player of this table/);
  await dora.click({ force: true });
  await expect(dora).not.toBeChecked();
  await expect(dialog.locator(".cd-feedback.is-bad").first()).toContainText("Não deu certo");
});

test("a player learns the permission live: the attach button comes and goes, and a send is let through", async ({ app, page }) => {
  await app.open("?vault=empty");
  await page.evaluate(([table]) => {
    const h = window.__harness;
    h.campaign.tables = [table];
    h.campaign.viewer = "player";
    h.campaign.up = true;
    h.table.role = "reader";
    h.table.up = true;
  }, [TABLE]);
  const view = await showMesa(app);
  await expect(view.locator(".table-compose")).toBeVisible();
  const attach = view.getByRole("button", { name: "Anexar imagem" });
  // Off by default: a reader only writes.
  await expect(attach).toBeHidden();
  await page.evaluate(() => window.__harness.campaign.grantImages("", "acc-ana", true));
  await expect(attach).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await attach.click();
  await (await chooser).setFiles({ name: "mapa.png", mimeType: "image/png", buffer: PNG });
  await expect(view.locator(".table-chip")).toHaveCount(1);
  const field = view.getByRole("textbox", { name: "Mensagem para a mesa" });
  await field.fill("Olhem o mapa");
  await field.press("Enter");
  await expect(view.locator(".table-log .table-entry img.table-thumb")).toHaveCount(1);
  expect(await app.calls("table_send_image")).toHaveLength(1);
  // Taken back: the button goes at once, and a send is refused.
  await page.evaluate(() => window.__harness.campaign.grantImages("", "acc-ana", false));
  await expect(attach).toBeHidden();
  const refused = await page.evaluate(async () => {
    try {
      await window.__harness.core.handlers["table_send_image"]({ table: "", base64: "iVBORw0KGgo=" });
      return "sent";
    } catch (e) {
      return e.message;
    }
  });
  expect(refused).toBe("you may only read this folder");
});
