// The table's dice tray (ADR 0107, "The tray made compact", 2026-10-23): ONE
// row under the message field, as Foundry's Dice Tray has it. A click on a
// die writes `/r 1d6` into the field; right click, Shift+Enter, Delete or a
// long press takes one off; KH / KL write `2d20kh1`; the dice button sends,
// as Enter does: the same road as `/r`, the local table's and the server's,
// the "Secreta" toggle respected. The field is several lines tall.
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

/** The folder open, the Mesa tab of the panel showing. */
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
  await expect(view.locator(".tray-row")).toBeVisible();
  return view;
}

const die = (view, d) => view.getByRole("button", { name: `Adicionar um ${d}`, exact: true });
const field = (view) => view.getByRole("textbox", { name: /^Mensagem para a mesa/ });
const go = (view) => view.locator(".tray-row").getByRole("button", { name: /^Rolar/ });
const mod = (view) => view.getByRole("spinbutton", { name: "Modificador da rolagem" });
const kh = (view) => view.getByRole("button", { name: "Manter o maior (KH)" });
const kl = (view) => view.getByRole("button", { name: "Manter o menor (KL)" });
const log = (view) => view.locator(".table-log .table-entry");

test("the row is one line, with the dice, the modifier, KH / KL, the bookmark and the dice button, and nothing passes the edge @layout", async ({ app, page }) => {
  const view = await setup(app, page, { server: true });
  const row = view.locator(".tray-row");
  const box = await row.boundingBox();
  expect(box.height).toBeLessThan(48);
  for (const d of ["d4", "d6", "d8", "d10", "d12", "d20"]) await expect(die(view, d)).toBeVisible();
  await expect(view.getByRole("button", { name: "Mais dados", exact: true })).toBeVisible();
  await expect(mod(view)).toHaveValue("0");
  await expect(kh(view)).toHaveAttribute("aria-pressed", "false");
  await expect(kl(view)).toHaveAttribute("aria-pressed", "false");
  await expect(view.getByRole("button", { name: "Rolagens salvas", exact: true })).toBeVisible();
  await expect(go(view)).toBeDisabled();
  // The old block is gone: no toggle, no pool, no notation field.
  await expect(view.getByRole("button", { name: "Compor rolagem" })).toHaveCount(0);
  await expect(view.getByRole("textbox", { name: "Notação", exact: true })).toHaveCount(0);
  // And so is the old row of buttons under the field: one box, the row, nothing else (Foundry's chat).
  for (const name of ["Rolar dados…", "Enviar imagem", /^Secreta$/]) await expect(view.getByRole("button", { name })).toHaveCount(0);
  await expect(view.getByRole("combobox", { name: "Quem vê a rolagem" })).toHaveValue("public");
  await expect(view.getByRole("button", { name: "Anexar imagem" })).toBeVisible();
  await expect(view.getByRole("button", { name: "Enviar", exact: true })).toBeDisabled();
  // The dice button is inside the window, and the page does not scroll sideways (the row may, inside itself).
  const width = page.viewportSize().width;
  const send = await go(view).boundingBox();
  expect(send.x + send.width).toBeLessThanOrEqual(width + 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // A phone's targets are 40 px tall at least.
  if (phone(page)) {
    for (const b of [die(view, "d6"), kh(view), go(view), view.getByRole("button", { name: "Mais dados", exact: true })]) {
      expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(40);
    }
    expect((await mod(view).boundingBox()).height).toBeGreaterThanOrEqual(40);
  }
  await die(view, "d20").click();
  await shot(page, `${tag(page)}-row`);
});

test("a click writes the roll into the message field, right click takes one off; the badges follow", async ({ app, page }) => {
  const view = await setup(app, page);
  await die(view, "d6").click();
  await die(view, "d6").click();
  await die(view, "d4").click();
  await expect(field(view)).toHaveValue("/r 2d6+1d4");
  await expect(die(view, "d6").locator(".tray-count")).toHaveText("2");
  await expect(die(view, "d4").locator(".tray-count")).toHaveText("1");
  await expect(die(view, "d8").locator(".tray-count")).toBeHidden();
  await expect(log(view)).toHaveCount(0);
  await die(view, "d6").click({ button: "right" });
  await expect(field(view)).toHaveValue("/r 1d6+1d4");
  await die(view, "d4").click({ button: "right" });
  await expect(field(view)).toHaveValue("/r 1d6");
  await die(view, "d6").click({ button: "right" });
  await expect(field(view)).toHaveValue("");
  await expect(go(view)).toBeDisabled();
});

test("the modifier is a number field: typing, the arrows and the wheel step it; it joins the first die", async ({ app, page }) => {
  const view = await setup(app, page);
  await mod(view).fill("3");
  await expect(field(view)).toHaveValue("");
  await die(view, "d20").click();
  await expect(field(view)).toHaveValue("/r 1d20+3");
  await mod(view).press("ArrowUp");
  await expect(field(view)).toHaveValue("/r 1d20+4");
  await mod(view).fill("-2");
  await expect(field(view)).toHaveValue("/r 1d20-2");
  await mod(view).fill("500");
  await expect(field(view)).toHaveValue("/r 1d20+99");
  await mod(view).fill("0");
  await expect(field(view)).toHaveValue("/r 1d20");
  await mod(view).focus();
  await mod(view).hover();
  await page.mouse.wheel(0, -100);
  await expect(field(view)).toHaveValue("/r 1d20+1");
  // Emptying the field clears the modifier too.
  await field(view).fill("");
  await expect(mod(view)).toHaveValue("0");
});

test("typing in the field changes the badges; what the row cannot show is left as typed; a plain message is not touched", async ({ app, page }) => {
  const view = await setup(app, page);
  await field(view).fill("/r 3d8+1d12+2");
  await expect(die(view, "d8").locator(".tray-count")).toHaveText("3");
  await expect(die(view, "d12").locator(".tray-count")).toHaveText("1");
  await expect(mod(view)).toHaveValue("2");
  await field(view).fill("/r 4d6kh3");
  await expect(view.locator(".tray-count:visible")).toHaveCount(0);
  await expect(field(view)).toHaveValue("/r 4d6kh3");
  await expect(go(view)).toBeEnabled();
  // A message is not a roll: the row leaves it as it is and its dice button is off.
  await field(view).fill("Olá, mesa");
  await die(view, "d6").click();
  await expect(field(view)).toHaveValue("Olá, mesa");
  await expect(go(view)).toBeDisabled();
  // Lines after the roll are kept.
  await field(view).fill("/r 1d6\nnota");
  await die(view, "d6").click();
  await expect(field(view)).toHaveValue("/r 2d6\nnota");
});

test("the other dice sit behind the dots; Escape closes them and the focus goes back", async ({ app, page }) => {
  const view = await setup(app, page);
  const more = view.getByRole("button", { name: "Mais dados", exact: true });
  await expect(die(view, "d100")).toBeHidden();
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  for (const d of ["d2", "d3", "d66", "d100", "dF"]) await expect(die(view, d)).toBeVisible();
  await die(view, "d100").click();
  await die(view, "dF").click();
  await expect(field(view)).toHaveValue("/r 1d100+1dF");
  await die(view, "dF").click({ button: "right" });
  await expect(field(view)).toHaveValue("/r 1d100");
  const pop = await view.locator(".tray-more").boundingBox();
  const size = page.viewportSize();
  expect(pop.x).toBeGreaterThanOrEqual(-0.5);
  expect(pop.x + pop.width).toBeLessThanOrEqual(size.width + 0.5);
  expect(pop.y).toBeGreaterThanOrEqual(-0.5);
  // The dots show a dot while an "other" die is in the roll.
  await expect(view.locator(".tray-dot")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(die(view, "d100")).toBeHidden();
  await expect(more).toBeFocused();
});

test("from the keyboard: Enter adds a die, Shift+Enter, Delete and Backspace take one off", async ({ app, page }) => {
  const view = await setup(app, page);
  await die(view, "d4").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(field(view)).toHaveValue("/r 2d4");
  await page.keyboard.press("Shift+Enter");
  await expect(field(view)).toHaveValue("/r 1d4");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Delete");
  await expect(field(view)).toHaveValue("/r 1d4");
  await page.keyboard.press("Backspace");
  await expect(field(view)).toHaveValue("");
  // Tab walks the row in order.
  await die(view, "d4").focus();
  for (const name of ["Adicionar um d6", "Adicionar um d8", "Adicionar um d10", "Adicionar um d12", "Adicionar um d20", "Mais dados"]) {
    await page.keyboard.press("Tab");
    await expect(view.getByRole("button", { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(mod(view)).toBeFocused();
});

test("a long press on a die takes one off (touch)", async ({ app, page }) => {
  const view = await setup(app, page);
  await die(view, "d6").click();
  await die(view, "d6").click();
  await expect(field(view)).toHaveValue("/r 2d6");
  await die(view, "d6").dispatchEvent("pointerdown", { pointerType: "touch", bubbles: true });
  await page.waitForTimeout(650);
  await expect(field(view)).toHaveValue("/r 1d6");
  // The click that ends the press does not add the die back.
  await die(view, "d6").dispatchEvent("pointerup", { pointerType: "touch", bubbles: true });
  await die(view, "d6").dispatchEvent("click");
  await expect(field(view)).toHaveValue("/r 1d6");
});

test("KH / KL as Foundry's: one more die and keep one; again undoes; the other switches @layout", async ({ app, page }) => {
  const view = await setup(app, page);
  // No dice: nothing happens.
  await kh(view).click();
  await expect(field(view)).toHaveValue("");
  await expect(kh(view)).toHaveAttribute("aria-pressed", "false");
  await die(view, "d20").click();
  await kh(view).click();
  await expect(field(view)).toHaveValue("/r 2d20kh1");
  await expect(kh(view)).toHaveAttribute("aria-pressed", "true");
  await expect(kl(view)).toHaveAttribute("aria-pressed", "false");
  await expect(die(view, "d20").locator(".tray-count")).toHaveText("2");
  await kl(view).click();
  await expect(field(view)).toHaveValue("/r 2d20kl1");
  await expect(kl(view)).toHaveAttribute("aria-pressed", "true");
  await expect(kh(view)).toHaveAttribute("aria-pressed", "false");
  await kl(view).click();
  await expect(field(view)).toHaveValue("/r 1d20");
  await expect(kl(view)).toHaveAttribute("aria-pressed", "false");
  // What it wrote is rolled: two dice, one dropped.
  await kh(view).click();
  await mod(view).fill("2");
  await expect(field(view)).toHaveValue("/r 2d20kh1+2");
  await go(view).click();
  await expect(log(view)).toHaveCount(1);
  await expect(log(view).first().locator(".table-notation")).toHaveText("2d20kh1+2");
  await expect(log(view).first().locator(".table-die.dropped")).toHaveCount(1);
});

test("the dice button sends as Enter does, at the local table, and empties the field @layout", async ({ app, page }) => {
  const view = await setup(app, page);
  await die(view, "d6").click();
  await die(view, "d6").click();
  await die(view, "d20").click();
  await expect(log(view)).toHaveCount(0);
  await go(view).click();
  await expect(log(view)).toHaveCount(1);
  const first = log(view).first();
  await expect(first.locator(".table-notation")).toHaveText("2d6+1d20");
  await expect(first.locator(".table-die")).toHaveCount(3);
  await expect(field(view)).toHaveValue("");
  await expect(view.locator(".tray-count:visible")).toHaveCount(0);
  // Enter in the field rolls what is typed, 4d6kh3 as typed.
  await field(view).fill("/r 4d6kh3");
  await field(view).press("Enter");
  await expect(log(view)).toHaveCount(2);
  await expect(log(view).nth(1).locator(".table-die.dropped")).toHaveCount(1);
  // Something Verso does not read is said in the field's error line, not rolled.
  await field(view).fill("/r 3d6 vs 2");
  await go(view).click();
  await expect(view.locator(".table-compose-error")).toContainText("Não entendi");
  await expect(log(view)).toHaveCount(2);
  // Without a server a message has nobody to go to: said, not lost.
  await field(view).fill("Olá");
  await field(view).press("Enter");
  await expect(view.locator(".table-compose-error")).toContainText("só rola dados");
  await expect(field(view)).toHaveValue("Olá");
  await shot(page, `${tag(page)}-local`);
});

test("at a server's table the roll is the server's, once, with the Secreta toggle respected @layout", async ({ app, page }) => {
  const view = await setup(app, page, { server: true });
  await die(view, "d8").click();
  await die(view, "d8").click();
  await go(view).click();
  await expect(log(view)).toHaveCount(1);
  expect((await app.calls("table_roll"))[0]).toMatchObject({ notation: "2d8" });
  expect((await app.calls("table_roll"))[0].secret ?? false).toBeFalsy();
  // Secret on: the dice button says so, the roll goes to the owners and its line says so.
  await view.getByRole("combobox", { name: "Quem vê a rolagem" }).selectOption("secret");
  await die(view, "d6").click();
  await expect(view.locator(".tray-row").getByRole("button", { name: "Rolar em segredo" })).toBeEnabled();
  await field(view).fill("/r 4d6kh3");
  await field(view).press("Enter");
  await expect(log(view)).toHaveCount(2);
  expect((await app.calls("table_roll"))[1]).toMatchObject({ notation: "4d6kh3", secret: true });
  await expect(log(view).nth(1).locator(".table-secret")).toHaveText("Secreta");
  // The server's refusal is said beside the field.
  await page.evaluate(() => (window.__harness.table.refuseNext = "too fast: wait 2 s"));
  await die(view, "d4").click();
  await go(view).click();
  await expect(view.locator(".table-compose-error")).toHaveText("Devagar: espere 2 s para enviar de novo.");
  await shot(page, `${tag(page)}-server`);
});

test("the message field is larger and multi-line: Shift+Enter breaks the line, Enter sends, the log shows both lines @layout", async ({ app, page }) => {
  const view = await setup(app, page, { server: true });
  const input = field(view);
  const lineHeight = await input.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  const start = (await input.boundingBox()).height;
  // 3 lines on a desktop, 2 on a phone.
  const lines = phone(page) ? 2 : 3;
  expect(start).toBeGreaterThanOrEqual(lineHeight * lines);
  expect(start).toBeLessThan(lineHeight * (lines + 1.5));
  await input.click();
  await input.pressSequentially("primeira linha");
  await page.keyboard.press("Shift+Enter");
  await input.pressSequentially("segunda linha");
  await expect(input).toHaveValue("primeira linha\nsegunda linha");
  expect(await app.calls("table_say")).toHaveLength(0);
  // IME: Enter while composing does not send.
  await input.evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true })));
  expect(await app.calls("table_say")).toHaveLength(0);
  await input.press("Enter");
  await expect(log(view)).toHaveCount(1);
  expect(await app.calls("table_say")).toEqual([{ text: "primeira linha\nsegunda linha" }]);
  const text = log(view).first().locator(".table-text");
  await expect(text).toContainText("primeira linha");
  await expect(text).toContainText("segunda linha");
  const h = await text.evaluate((el) => ({ box: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight) }));
  expect(h.box).toBeGreaterThanOrEqual(h.line * 2 - 1);
  await expect(input).toHaveValue("");
  // It grows with its text, up to eight lines, then scrolls.
  await input.fill(Array.from({ length: 5 }, (_, i) => `linha ${i + 1}`).join("\n"));
  expect((await input.boundingBox()).height).toBeGreaterThan(start);
  await input.fill(Array.from({ length: 14 }, (_, i) => `linha ${i + 1}`).join("\n"));
  const full = await input.evaluate((el) => ({ box: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight), scroll: el.scrollHeight, client: el.clientHeight }));
  expect(full.box).toBeLessThan(full.line * 9);
  expect(full.box).toBeGreaterThan(full.line * 7);
  expect(full.scroll).toBeGreaterThan(full.client);
  // A roll still works from the first line.
  await input.fill("/r 1d6\ncom uma nota");
  await input.press("Enter");
  await expect(log(view)).toHaveCount(2);
  expect((await app.calls("table_roll"))[0]).toMatchObject({ notation: "1d6" });
  await input.fill("linha um\nlinha dois");
  await shot(page, `${tag(page)}-multiline`);
});
