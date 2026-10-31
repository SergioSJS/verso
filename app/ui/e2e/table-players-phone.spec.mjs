// The players' card of the table's window, compact (fix/phone-table-space, 2026-10-24): on a phone ONE slim row per
// player (avatar and name, the two counts with their icons, the images switch) under a header of the same columns;
// "Todos" over the switch column, "Salvo" in a slot that moves nothing. Also the before / after pictures
// (SHOTS=<dir> SHOT_PREFIX=antes|depois; SHOT_ONLY=1 skips the assertions, for the old code).

import { test, expect } from "./fixtures.mjs";

const SHOTS = process.env.SHOTS;
const PFX = process.env.SHOT_PREFIX ?? "x";
const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;

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


for (const theme of ["light", "dark"]) {
  test(`the players' card, ${theme} @layout`, async ({ app, page }, info) => {
    await page.addInitScript((th) => {
      const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
      localStorage.setItem("verso.settings", JSON.stringify({ ...s, theme: th }));
    }, theme);
    const dialog = await owner(app);
    // K.6: the switches (Imagens, Arquivos, Cria notas, Cria boards) open under the player's row, from the count of rights.
    const sw = (name) => dialog.getByRole("switch", { name: `${name} pode enviar imagens` });
    const rightsOf = (name) => dialog.getByRole("button", { name: new RegExp(`^${name} tem \\d de 4 direitos`) });
    await rightsOf("Bia").click();
    await sw("Bia").check({ force: true });
    await expect(dialog.getByRole("switch", { name: "Bia pode enviar imagens" })).toBeChecked();
    if (SHOTS && /^(chromium|phone-webkit)$/.test(info.project.name) && (theme === "light" || phone(page))) {
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/${PFX}-jogadores-${phone(page) ? "telefone" : "desktop"}-${theme}.png` });
    }
    if (process.env.SHOT_ONLY || !phone(page)) return;
    const t = dialog.getByRole("table", { name: "Jogadores da mesa e o que cada um pode fazer" });
    // The switches are folded again, so the list of players is what is measured.
    await rightsOf("Bia").click();
    await expect(dialog.getByText("Direitos de Bia")).toBeHidden();
    const rows = t.locator("tr.cd-player");
    await expect(rows).toHaveCount(3);
    const boxes = await rows.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height }; }));
    for (const b of boxes) expect(b.h).toBeLessThanOrEqual(64);
    const card = await dialog.locator(".cd-access").evaluate((el) => ({ over: el.scrollHeight - el.clientHeight, h: el.getBoundingClientRect().height }));
    expect(card.over).toBeLessThanOrEqual(0);
    // The players' list stays as slim as before K.6 (the box per right for everyone sits under it, outside the bound).
    expect((await t.boundingBox()).height).toBeLessThan(3 * 64 + 90);
    // One row each: the name, the two counts and the count of rights share a line.
    const line = await rows.first().evaluate((tr) => {
      const mid = (s) => { const r = tr.querySelector(s).getBoundingClientRect(); return r.top + r.height / 2; };
      return [mid(".cd-avatar"), mid(".cd-count-btn"), mid(".cd-count-btn[data-key^='rights:']")];
    });
    expect(Math.max(...line) - Math.min(...line)).toBeLessThan(8);
    // Named counts and switch, still opening the lists; 44 px targets.
    await expect(t.getByRole("button", { name: "Bia vê 3 notas; mostrar a lista" })).toBeVisible();
    await expect(t.getByRole("button", { name: "Bia edita 1 nota; mostrar a lista" })).toBeVisible();
    for (const name of [/^Bia vê/, /^Bia edita/, /^Bia tem/]) {
      const b = await t.getByRole("button", { name }).boundingBox();
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.width).toBeGreaterThanOrEqual(44);
    }
    await rightsOf("Caio").click();
    const sb = await dialog.locator(".cd-right-label:visible").first().boundingBox();
    expect(sb.height).toBeGreaterThanOrEqual(43);
    // A box per right for everyone, "Todos podem enviar imagens", is reachable.
    await expect(dialog.getByRole("checkbox", { name: "Todos podem enviar imagens" })).toBeVisible();
    // "Salvo" moves nothing: the rows' tops are the same with it shown and gone.
    await sw("Caio").check({ force: true });
    const during = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    await expect(dialog.locator(".cd-feedback:not(:empty):visible").first()).toBeVisible();
    await expect(dialog.locator(".cd-feedback:not(:empty)")).toHaveCount(0, { timeout: 6000 });
    const after = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(after).toEqual(during);
    // No sideways scroll.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
