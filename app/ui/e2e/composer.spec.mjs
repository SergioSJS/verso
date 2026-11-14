// The table's dice tray (ADR 0107, "The tray made compact", 2026-10-23): ONE
// row under the message field, as Foundry's Dice Tray has it. A click on a
// die writes `/r 1d6` into the field; right click, Shift+Enter, Delete or a
// long press takes one off; KH / KL write `2d20kh1`; Send sends, as Enter
// does (the row has no roll button of its own): the same road as `/r`, the
// local table's and the server's, the "Secreta" mode respected (a button with
// the app's menu behind it, not a native select). The field is several lines tall.
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
  // At 320 px the tab strip keeps the first tabs and puts the rest behind "Mais abas do painel"
  // (the Music tab, ADR 0116, moved the Mesa tab into the strip): take the tab where it is.
  const tab = page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ });
  const more = page.getByRole("button", { name: "Mais abas do painel" });
  // The strip folds its tabs as the panel settles, so which of the two holds the Mesa tab
  // changes for a moment: try again as a whole until one of them takes the click.
  await expect(async () => {
    if (await tab.isVisible()) await tab.click({ timeout: 1500 });
    else {
      await more.click({ timeout: 1500 });
      await page.getByRole("menuitem", { name: /^Mesa/ }).click({ timeout: 1500 });
    }
  }).toPass({ timeout: 20_000 });
  const view = page.locator(".table-view");
  await expect(view).toBeVisible();
  // A phone keeps the dice row behind its button (fix/phone-table-space): open it first.
  const toggle = view.getByRole("button", { name: "Dados", exact: true });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  await expect(view.locator(".tray-row")).toBeVisible();
  return view;
}

const die = (view, d) => view.getByRole("button", { name: `Adicionar um ${d}`, exact: true });
const field = (view) => view.getByRole("textbox", { name: /^Mensagem para a mesa/ });
const send = (view) => view.getByRole("button", { name: "Enviar", exact: true });
const modeButton = (view) => view.getByRole("button", { name: /^Quem vê a rolagem/ });
const mod = (view) => view.getByRole("spinbutton", { name: "Modificador da rolagem" });
const kh = (view) => view.getByRole("button", { name: "Manter o maior (KH)" });
const kl = (view) => view.getByRole("button", { name: "Manter o menor (KL)" });
/** The dots opened when the modifier or KH / KL did not fit the row (the default desktop panel is narrow). */
const reveal = async (view) => {
  if (!(await kh(view).isVisible()) || !(await mod(view).isVisible())) await view.getByRole("button", { name: "Mais dados", exact: true }).click();
};
const log = (view) => view.locator(".table-log .table-entry");

test("the row is one line, the toolbar of the box has the paperclip, the bookmark, who sees the roll and Send; the old controls are gone @layout", async ({ app, page }) => {
  const view = await setup(app, page, { server: true });
  const row = view.locator(".tray-row");
  const box = await row.boundingBox();
  expect(box.height).toBeLessThan(48);
  for (const d of ["d4", "d6", "d8", "d10", "d12", "d20"]) await expect(die(view, d)).toBeVisible();
  await expect(view.getByRole("button", { name: "Mais dados", exact: true })).toBeVisible();
  await expect(send(view)).toBeDisabled();
  // The toolbar on the bottom edge of the box (Discord's, Slack's, Foundry's chat), inside the same box as the text.
  const bar = view.locator(".table-box-bar");
  for (const el of [view.getByRole("button", { name: "Anexar imagem" }), view.getByRole("button", { name: "Rolagens salvas", exact: true }), modeButton(view), view.getByRole("button", { name: "Enviar", exact: true })]) {
    await expect(el).toBeVisible();
    expect(await el.evaluate((e) => Boolean(e.closest(".table-box-bar")))).toBe(true);
  }
  await expect(modeButton(view)).toHaveAccessibleName("Quem vê a rolagem: Pública");
  await expect(view.getByRole("button", { name: "Enviar", exact: true })).toBeDisabled();
  // On a phone the toolbar shares the field's row (display: contents): its controls sit level with the field.
  const textBox = await field(view).boundingBox();
  if (phone(page)) {
    const sendBox = await send(view).boundingBox();
    expect(Math.abs(sendBox.y + sendBox.height / 2 - (textBox.y + textBox.height / 2))).toBeLessThan(textBox.height);
  } else {
    const barBox = await bar.boundingBox();
    expect(barBox.y).toBeGreaterThanOrEqual(textBox.y + textBox.height - 1);
  }
  // The old block and the old row of buttons are gone.
  await expect(view.getByRole("button", { name: "Compor rolagem" })).toHaveCount(0);
  await expect(view.getByRole("textbox", { name: "Notação", exact: true })).toHaveCount(0);
  for (const name of ["Rolar dados…", "Enviar arquivo", /^Secreta$/]) await expect(view.getByRole("button", { name })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // A phone's targets are 40 px tall at least.
  if (phone(page)) {
    for (const b of [die(view, "d6"), view.getByRole("button", { name: "Mais dados", exact: true }), view.getByRole("button", { name: "Enviar", exact: true })]) {
      expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(40);
    }
  }
  // The typed text starts on the top line of the box (nothing above it but the images).
  await field(view).fill("primeira");
  const pad = await field(view).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { top: r.top, boxTop: el.closest(".table-box").getBoundingClientRect().top, paddingTop: parseFloat(cs.paddingTop), scrollTop: el.scrollTop };
  });
  expect(pad.top - pad.boxTop).toBeLessThan(4);
  expect(pad.scrollTop).toBe(0);
  await die(view, "d20").click();
  await shot(page, `${tag(page)}-row`);
});

for (const [w, h, narrow] of [[1280, 800, null], [1280, 800, 230], [390, 844, null], [320, 700, null]]) {
  test(`at ${narrow ?? w} px nothing of the row is clipped: each control is in the row's box or in the dots (a phone's row scrolls)${narrow ? " (a panel narrowed to it)" : ""}`, async ({ app, page }) => {
    await page.setViewportSize({ width: w, height: h });
    const view = await setup(app, page, { server: true });
    if (narrow) await page.evaluate((n) => { document.querySelector("aside.right").style.width = `${n}px`; }, narrow);
    await expect.poll(async () => (await view.locator(".tray-row").boundingBox())?.height ?? 0).toBeLessThan(48 + 1);
    const names = [["Adicionar um d4", "d4"], ["Adicionar um d6", "d6"], ["Adicionar um d8", "d8"], ["Adicionar um d10", "d10"], ["Adicionar um d12", "d12"], ["Adicionar um d20", "d20"]];
    const rowBox = await view.locator(".tray-row").boundingBox();
    const inside = (b, r) => b && b.x >= r.x - 0.5 && b.x + b.width <= r.x + r.width + 0.5 && b.y >= r.y - 0.5 && b.y + b.height <= r.y + r.height + 0.5;
    const controls = [
      ...names.map(([n]) => view.getByRole("button", { name: n, exact: true })),
      view.getByRole("spinbutton", { name: "Modificador da rolagem" }),
      kh(view),
      kl(view),
    ];
    const more = view.getByRole("button", { name: "Mais dados", exact: true });
    await expect(more).toBeVisible();
    // A phone's row (max-width 760px) scrolls sideways inside itself instead
    // of folding (44 px dice, the maintainer's answer of 2026-11-10): every
    // control stays in it, reached by scrolling the row, never the page.
    if (w <= 760 && !narrow) {
      for (const c of [...controls, more]) {
        await c.scrollIntoViewIfNeeded();
        expect(inside(await c.boundingBox(), rowBox), "in the row's box once the row is scrolled to it").toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      return;
    }
    expect(inside(await more.boundingBox(), rowBox)).toBe(true);
    const gone = [];
    for (const c of controls) {
      if (await c.isVisible()) expect(inside(await c.boundingBox(), rowBox), "a visible control inside the row's box").toBe(true);
      else gone.push(c);
    }
    // What the row had no room for is in the dots: reachable, inside the window.
    if (gone.length > 0) {
      await more.click();
      for (const c of gone) {
        await expect(c).toBeVisible();
        const b = await c.boundingBox();
        expect(b.x).toBeGreaterThanOrEqual(-0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(w + 0.5);
      }
      await page.keyboard.press("Escape");
    }
    // The priority: the modifier never leaves before KH / KL.
    if (!(await mod(view).isVisible())) expect(await kh(view).isVisible()).toBe(false);
    if (narrow) expect(gone.length).toBeGreaterThan(0);
    const clipped = await view.locator(".tray-scroll").evaluate((el) => el.scrollWidth > el.clientWidth + 0.5);
    expect(clipped).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Everything of the box's toolbar is inside the window too.
    for (const el of [view.getByRole("button", { name: "Anexar imagem" }), view.getByRole("button", { name: "Rolagens salvas", exact: true }), modeButton(view), view.getByRole("button", { name: "Enviar", exact: true })]) {
      const b = await el.boundingBox();
      expect(b.x + b.width).toBeLessThanOrEqual(w + 0.5);
      expect(b.x).toBeGreaterThanOrEqual(-0.5);
    }
  });
}

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
  await expect(send(view)).toBeDisabled();
});

test("the modifier is a number field: typing, the arrows and the wheel step it; it joins the first die", async ({ app, page }) => {
  const view = await setup(app, page);
  await reveal(view);
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
  await expect(view.locator(".tray-mod")).toHaveValue("2");
  await field(view).fill("/r 4d6kh3");
  await expect(view.locator(".tray-count:visible")).toHaveCount(0);
  await expect(field(view)).toHaveValue("/r 4d6kh3");
  await expect(send(view)).toBeEnabled();
  // A message is not a roll: the row leaves it as it is.
  await field(view).fill("Olá, mesa");
  await die(view, "d6").click();
  await expect(field(view)).toHaveValue("Olá, mesa");
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
  await reveal(view);
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
  await send(view).click();
  await expect(log(view)).toHaveCount(1);
  await expect(log(view).first().locator(".table-notation")).toHaveText("2d20kh1+2");
  await expect(log(view).first().locator(".table-die.dropped")).toHaveCount(1);
});

test("Send sends the dice row's roll as Enter does, at the local table, and empties the field @layout", async ({ app, page }) => {
  const view = await setup(app, page);
  await die(view, "d6").click();
  await die(view, "d6").click();
  await die(view, "d20").click();
  await expect(log(view)).toHaveCount(0);
  await send(view).click();
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
  await send(view).click();
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
  await send(view).click();
  await expect(log(view)).toHaveCount(1);
  expect((await app.calls("table_roll"))[0]).toMatchObject({ notation: "2d8" });
  expect((await app.calls("table_roll"))[0].secret ?? false).toBeFalsy();
  // Secret on: the mode button says so, the roll goes to the owners and its line says so.
  await modeButton(view).click();
  await page.getByRole("menuitem", { name: /^Secreta/ }).click();
  await die(view, "d6").click();
  await expect(modeButton(view)).toHaveAccessibleName("Quem vê a rolagem: Secreta");
  await field(view).fill("/r 4d6kh3");
  await field(view).press("Enter");
  await expect(log(view)).toHaveCount(2);
  expect((await app.calls("table_roll"))[1]).toMatchObject({ notation: "4d6kh3", secret: true });
  await expect(log(view).nth(1).locator(".table-secret")).toHaveText("Secreta");
  // The server's refusal is said beside the field.
  await page.evaluate(() => (window.__harness.table.refuseNext = "too fast: wait 2 s"));
  await die(view, "d4").click();
  await send(view).click();
  await expect(view.locator(".table-compose-error")).toHaveText("Devagar: espere 2 s para enviar de novo.");
  await shot(page, `${tag(page)}-server`);
});

test("the message field is larger and multi-line: Shift+Enter breaks the line, Enter sends, the log shows both lines @layout", async ({ app, page }) => {
  const view = await setup(app, page, { server: true });
  const input = field(view);
  const lineHeight = await input.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  const start = (await input.boundingBox()).height;
  // 3 lines on a desktop, one on a phone (a chat's).
  const lines = phone(page) ? 1 : 3;
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
  expect(await app.calls("table_say")).toEqual([{ text: "primeira linha\nsegunda linha", table: "" }]);
  const text = log(view).first().locator(".table-text");
  await expect(text).toContainText("primeira linha");
  await expect(text).toContainText("segunda linha");
  const h = await text.evaluate((el) => ({ box: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight) }));
  expect(h.box).toBeGreaterThanOrEqual(h.line * 2 - 1);
  await expect(input).toHaveValue("");
  // It grows with its text, up to eight lines (four on a phone), then scrolls.
  const most = phone(page) ? 4 : 8;
  await input.fill(Array.from({ length: 5 }, (_, i) => `linha ${i + 1}`).join("\n"));
  expect((await input.boundingBox()).height).toBeGreaterThan(start);
  await input.fill(Array.from({ length: 14 }, (_, i) => `linha ${i + 1}`).join("\n"));
  const full = await input.evaluate((el) => ({ box: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight), scroll: el.scrollHeight, client: el.clientHeight }));
  expect(full.box).toBeLessThan(full.line * (most + 1));
  expect(full.box).toBeGreaterThan(full.line * (most - 1));
  expect(full.scroll).toBeGreaterThan(full.client);
  // A roll still works from the first line.
  await input.fill("/r 1d6\ncom uma nota");
  await input.press("Enter");
  await expect(log(view)).toHaveCount(2);
  expect((await app.calls("table_roll"))[0]).toMatchObject({ notation: "1d6" });
  await input.fill("linha um\nlinha dois");
  await shot(page, `${tag(page)}-multiline`);
});

for (const [w, h, narrow] of [[1280, 800, 260], [390, 844, null]]) {
  test(`the Pública / Secreta button at ${narrow ?? w} px: icon and label side by side, nothing clipped, the app's focus ring, the menu by mouse and keyboard; no roll button in the row @layout`, async ({ app, page }) => {
    await page.setViewportSize({ width: w, height: h });
    const view = await setup(app, page, { server: true });
    if (narrow) await page.evaluate((n) => { document.querySelector("aside.right").style.width = `${n}px`; }, narrow);
    const mode = modeButton(view);
    await expect(mode).toBeVisible();
    await expect(mode).toHaveAccessibleName("Quem vê a rolagem: Pública");
    await expect(mode).toHaveAttribute("aria-haspopup", "menu");
    // On a phone the button is the icon alone (its name says who sees the roll): the room goes to the log.
    if (w <= 760 && !narrow) {
      await expect(mode.locator(".tray-mode-label")).toBeHidden();
      await expect(mode.locator("svg")).toBeVisible();
    }
    // Icon and label side by side, never overlapping; the label whole; the same height as its neighbours.
    const geo = await mode.evaluate((el) => {
      const i = el.querySelector("svg").getBoundingClientRect();
      const l = el.querySelector(".tray-mode-label");
      const r = l.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return { iconRight: i.right, labelLeft: r.left, labelRight: r.right, boxRight: b.right, clipped: l.scrollWidth > l.clientWidth + 0.5 || el.scrollWidth > el.clientWidth + 0.5, text: l.textContent, h: b.height };
    });
    expect(geo.text).toBe("Pública");
    if (!(w <= 760 && !narrow)) {
      expect(geo.iconRight).toBeLessThanOrEqual(geo.labelLeft + 0.5);
      expect(geo.labelRight).toBeLessThanOrEqual(geo.boxRight + 0.5);
      expect(geo.clipped).toBe(false);
    }
    const saved = await view.getByRole("button", { name: "Rolagens salvas", exact: true }).boundingBox();
    expect(Math.abs(geo.h - saved.height)).toBeLessThanOrEqual(1);
    const bar = await view.locator(w <= 760 && !narrow ? ".table-box" : ".table-box-bar").boundingBox();
    const mb = await mode.boundingBox();
    expect(mb.x + mb.width).toBeLessThanOrEqual(bar.x + bar.width + 0.5);
    // By the keyboard: the app's own focus ring (2 px solid), never the browser's default; Enter opens the menu, arrows move, Enter chooses.
    await mode.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(mode).toBeFocused();
    expect(await mode.evaluate((el) => { const c = getComputedStyle(el); return [c.outlineStyle, c.outlineWidth]; })).toEqual(["solid", "2px"]);
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Quem vê a rolagem" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /^Pública/ })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: /^Secreta/ })).toBeFocused();
    await shot(page, `${tag(page)}-mode-menu-${narrow ?? w}`);
    await page.keyboard.press("Enter");
    await expect(mode).toHaveAccessibleName("Quem vê a rolagem: Secreta");
    await expect(mode).toBeFocused();
    await expect(mode.locator(".tray-mode-label")).toHaveText("Secreta");
    // By the mouse, back to Pública; Escape closes without choosing.
    await mode.click();
    await menu.getByRole("menuitem", { name: /^Pública/ }).click();
    await expect(mode).toHaveAccessibleName("Quem vê a rolagem: Pública");
    await mode.click();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(mode).toHaveAccessibleName("Quem vê a rolagem: Pública");
    // The dice row has no roll button of its own: Send is the one that sends.
    await expect(view.locator(".tray-row").getByRole("button", { name: /^Rolar/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(page, `${tag(page)}-mode-${narrow ?? w}`);
  });
}
