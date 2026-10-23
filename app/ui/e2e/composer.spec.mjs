// The table's dice composer (ADR 0107, "the dice composer", 2026-10-23): a
// click on a die adds it to a roll shown as notation, it does not roll;
// "Rolar" rolls what is in the field, a typed notation too; the same road as
// `/r`, the local table's and the server's, the "Secreta" toggle respected.
// On a phone the tray folds behind its toggle and nothing passes the edge.
// Screenshots for reading by eye go to $HOME/.cache/composer-shots (mounted
// by the runner), when the folder exists.

import { test, expect } from "./fixtures.mjs";
import { existsSync } from "node:fs";

const SHOTS = `${process.env.HOME ?? "/root"}/.cache/composer-shots`;
const shot = async (page, name) => {
  if (existsSync(SHOTS)) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;
const tag = (page) => (phone(page) ? "phone" : "desktop");

/** The folder open, the Mesa tab of the panel showing, the tray open. */
async function setup(app, page, { server = false, role = "owner" } = {}) {
  await app.open();
  await app.writeOutside("Diario.md", "# Diário\n\nTexto.\n");
  await app.folderChanged(["Diario.md"], true);
  if (server) {
    await page.evaluate((r) => {
      const t = window.__harness.table;
      t.role = r;
      t.up = true;
    }, role);
  }
  if (phone(page)) await page.locator(".bar-right").click();
  else await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  await expect(view).toBeVisible();
  const toggle = view.getByRole("button", { name: "Compor rolagem" });
  await expect(toggle).toBeVisible();
  // A phone starts with the tray folded; a desktop window, open.
  await expect(toggle).toHaveAttribute("aria-expanded", phone(page) ? "false" : "true");
  if (phone(page)) await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  return view;
}

const die = (view, d) => view.getByRole("button", { name: `Adicionar um ${d}`, exact: true });
const field = (view) => view.getByRole("textbox", { name: "Notação", exact: true });
const rollButton = (view) => view.locator(".table-tray").getByRole("button", { name: /^Rolar/ });
const log = (view) => view.locator(".table-log .table-entry");

test("dice put a roll together without rolling it; the modifier and Clear edit it; an empty roll cannot be rolled @layout", async ({ app, page }) => {
  const view = await setup(app, page);
  await expect(rollButton(view)).toBeDisabled();
  await expect(view.locator(".pool-empty")).toHaveText("Toque nos dados pra montar a rolagem.");
  await die(view, "d6").click();
  await die(view, "d6").click();
  await die(view, "d20").click();
  await expect(field(view)).toHaveValue("2d6+1d20");
  await expect(view.locator(".pool-chip")).toHaveText(["2d6×", "1d20×"].map((s) => s.replace("×", "")));
  await expect(log(view)).toHaveCount(0);
  await expect(rollButton(view)).toBeEnabled();
  // The modifier.
  await view.getByRole("button", { name: "aumentar" }).click();
  await view.getByRole("button", { name: "aumentar" }).click();
  await expect(field(view)).toHaveValue("2d6+1d20+2");
  await expect(view.getByRole("spinbutton", { name: "Modificador da rolagem" })).toHaveValue("2");
  await view.getByRole("button", { name: "diminuir" }).click();
  await view.getByRole("button", { name: "diminuir" }).click();
  await view.getByRole("button", { name: "diminuir" }).click();
  await expect(field(view)).toHaveValue("2d6+1d20-1");
  // One die off, a whole kind off.
  await view.getByRole("button", { name: "Tirar um d6" }).click();
  await expect(field(view)).toHaveValue("1d6+1d20-1");
  await view.getByRole("button", { name: "Tirar todos os d6" }).click();
  await expect(field(view)).toHaveValue("1d20-1");
  await view.getByRole("button", { name: "Zerar modificador" }).click();
  await expect(field(view)).toHaveValue("1d20");
  await shot(page, `${tag(page)}-composed`);
  // Clear empties it, and Roll is off again.
  await view.getByRole("button", { name: "Limpar" }).click();
  await expect(field(view)).toHaveValue("");
  await expect(rollButton(view)).toBeDisabled();
  expect(await app.calls("table_roll")).toHaveLength(0);
  await expect(log(view)).toHaveCount(0);
});

test("the Fudge die, and a typed notation the buttons cannot show starts again from the die clicked @layout", async ({ app, page }) => {
  const view = await setup(app, page);
  await die(view, "dF").click();
  await die(view, "dF").click();
  await expect(field(view)).toHaveValue("2dF");
  await field(view).fill("4d6kh3");
  await expect(view.locator(".pool-empty")).toBeVisible();
  await die(view, "d8").click();
  await expect(field(view)).toHaveValue("1d8");
  // Cards are not offered: Verso's notation has none.
  await expect(view.getByRole("button", { name: /carta|card/i })).toHaveCount(0);
});

test("Rolar rolls the pool at the local table; a typed 4d6kh3 is rolled as typed", async ({ app, page }) => {
  const view = await setup(app, page);
  await die(view, "d6").click();
  await die(view, "d6").click();
  await die(view, "d20").click();
  await rollButton(view).click();
  await expect(log(view)).toHaveCount(1);
  const first = log(view).first();
  await expect(first.locator(".table-notation")).toHaveText("2d6+1d20");
  await expect(first.locator(".table-die")).toHaveCount(3);
  // The pool stays after a roll, as Rolai's does.
  await expect(field(view)).toHaveValue("2d6+1d20");
  await field(view).fill("4d6kh3");
  await field(view).press("Enter");
  await expect(log(view)).toHaveCount(2);
  const second = log(view).nth(1);
  await expect(second.locator(".table-notation")).toHaveText("4d6kh3");
  await expect(second.locator(".table-die")).toHaveCount(4);
  await expect(second.locator(".table-die.dropped")).toHaveCount(1);
  // Something Verso does not read is said, not rolled.
  await field(view).fill("3d6 vs 2");
  await rollButton(view).click();
  await expect(view.locator(".table-tray-error")).toContainText("Não consegui ler");
  await expect(log(view)).toHaveCount(2);
  await shot(page, `${tag(page)}-rolled`);
});

test("at a server's table the roll is the server's, once, with the Secreta toggle respected @layout", async ({ app, page }) => {
  const view = await setup(app, page, { server: true });
  await expect(view.locator(".table-compose")).toBeVisible();
  await die(view, "d8").click();
  await die(view, "d8").click();
  await rollButton(view).click();
  await expect(log(view)).toHaveCount(1);
  expect((await app.calls("table_roll"))[0]).toMatchObject({ notation: "2d8" });
  expect((await app.calls("table_roll"))[0].secret ?? false).toBeFalsy();
  // Secret on: the roll goes to the owners and its line says so.
  await view.getByRole("button", { name: /^Secreta/ }).click();
  await expect(view.locator(".table-tray-secret")).toBeVisible();
  await expect(view.locator(".table-tray").getByRole("button", { name: "Rolar em segredo" })).toBeEnabled();
  await field(view).fill("4d6kh3");
  await field(view).press("Enter");
  await expect(log(view)).toHaveCount(2);
  expect((await app.calls("table_roll"))[1]).toMatchObject({ notation: "4d6kh3", secret: true });
  await expect(log(view).nth(1).locator(".table-secret")).toHaveText("Secreta");
  // The server's refusal is said beside the tray.
  await page.evaluate(() => (window.__harness.table.refuseNext = "too fast: wait 2 s"));
  await rollButton(view).click();
  await expect(view.locator(".table-tray-error")).toHaveText("Devagar: espere 2 s para enviar de novo.");
  await shot(page, `${tag(page)}-server`);
});

test("the tray folds and opens again, and nothing passes the window's edge @layout", async ({ app, page }) => {
  const view = await setup(app, page, { server: true });
  const toggle = view.getByRole("button", { name: "Compor rolagem" });
  await die(view, "d100").click();
  await shot(page, `${tag(page)}-open`);
  // Every control of the tray and of the input row is inside the window.
  const width = page.viewportSize().width;
  const height = page.viewportSize().height;
  const boxes = await view.locator(".table-tray button:visible, .table-tray input:visible, .table-compose button:visible, .table-compose textarea:visible").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { name: e.getAttribute("aria-label") || e.textContent || e.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }),
  );
  expect(boxes.length).toBeGreaterThan(15);
  for (const b of boxes) {
    expect(b.left, b.name).toBeGreaterThanOrEqual(-0.5);
    expect(b.right, b.name).toBeLessThanOrEqual(width + 0.5);
    expect(b.bottom, b.name).toBeLessThanOrEqual(height + 0.5);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Folded: the dice are gone, the toggle and the message field remain, the pool is kept.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(die(view, "d6")).toBeHidden();
  await expect(view.getByRole("textbox", { name: "Mensagem para a mesa" })).toBeVisible();
  await shot(page, `${tag(page)}-folded`);
  // And the way back.
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(field(view)).toHaveValue("1d100");
  // From the keyboard: Tab reaches a die, Enter adds it.
  await die(view, "d4").focus();
  await page.keyboard.press("Enter");
  await expect(field(view)).toHaveValue("1d100+1d4");
});
