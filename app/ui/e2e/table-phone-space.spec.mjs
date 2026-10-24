// The Mesa's room on a phone (fix/phone-table-space, 2026-10-24): the sheet takes the height above the bottom
// bar, the header is one row, the composer one line (growing), the dice row behind a button that remembers its
// state; a seeded log shows at least 7 entries at 390x844; no control is lost, no sideways scroll.

import { test, expect } from "./fixtures.mjs";

const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;

async function seeded(app, page) {
  await app.open("?vault=empty&table=owner");
  await app.writeOutside("Diario.md", "# Diário\n");
  await app.folderChanged(["Diario.md"], true);
  await page.evaluate(() => {
    const t = window.__harness.table;
    t.role = "owner";
    t.up = true;
    t.join("Bia", "#1565c0", "editor");
    const h = window.__harness;
    h.campaign.tables = [{ root: "", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }];
    h.emit("campaign-changed", { paths: [] });
    for (let i = 0; i < 14; i++) {
      if (i % 2) t.roll(i % 4 === 1 ? "Bia" : "Ana", "1d20+3");
      else t.say(i % 4 === 0 ? "Bia" : "Ana", `Mensagem ${i}`);
    }
  });
  if (phone(page)) await page.locator(".bar-right").click();
  else await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  await expect(view.locator(".table-entry").first()).toBeVisible();
  return view;
}

test("the Mesa log shows at least 7 entries on a phone, the header is one row, nothing scrolls sideways @layout", async ({ app, page }) => {
  const view = await seeded(app, page);
  if (!phone(page)) return;
  const entries = await view.locator(".table-log .table-entry").evaluateAll((els) => {
    const log = els[0].parentElement.getBoundingClientRect();
    return els.filter((e) => {
      const r = e.getBoundingClientRect();
      return r.top >= log.top - 1 && r.bottom <= log.bottom + 1;
    }).length;
  });
  expect(entries).toBeGreaterThanOrEqual(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // The sheet starts near the top; no title row of its own.
  const sheet = await page.locator("aside.right").boundingBox();
  expect(sheet.y).toBeLessThan(20);
  await expect(page.locator("#right-title")).toBeHidden();
  // The close is named, reachable, 44 px, inside the screen.
  const close = page.getByRole("button", { name: /fechar|close/i }).first();
  const box = await page.locator("#right-close").boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  await expect(page.locator("#right-close")).toHaveAccessibleName(/.+/);
  void close;
  // The name and the roster / window / hide / menu share ONE row.
  const rows = await view.locator(".table-head").evaluate((head) => {
    const tops = [...head.querySelectorAll(".table-title-name, .table-roster-button, .table-win-button, .table-hide, .table-menu-button")].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
    return Math.max(...tops) - Math.min(...tops);
  });
  expect(rows).toBeLessThan(10);
  // The table's name (truncated, never dropped) and, for the owner, the icon button to the Mesa window, named.
  await expect(view.locator(".table-title-name")).toBeVisible();
  await expect(view.locator(".table-title-name")).toContainText("Mesa:");
  const win = view.getByRole("button", { name: "Abrir a janela da Mesa" });
  await expect(win).toBeVisible();
  const wb = await win.boundingBox();
  expect(wb.width).toBeGreaterThanOrEqual(40);
  expect(wb.x + wb.width).toBeLessThanOrEqual(page.viewportSize().width);
  const tb = await view.locator(".table-title-name").boundingBox();
  expect(tb.width).toBeGreaterThan(40);
  await expect(view.locator(".table-win-label")).toBeHidden();
  // Every control of the box named and finger-sized, in the field's row.
  const field = view.getByRole("textbox", { name: "Mensagem para a mesa" });
  const f = await field.boundingBox();
  for (const name of ["Anexar imagem", "Enviar", "Dados", /^Quem vê/, /salvas/i]) {
    const b = await view.getByRole("button", typeof name === "string" ? { name, exact: true } : { name }).first().boundingBox();
    expect(b.width).toBeGreaterThanOrEqual(34);
    expect(b.height).toBeGreaterThanOrEqual(40 - 1);
    expect(Math.abs(b.y + b.height / 2 - (f.y + f.height / 2))).toBeLessThan(30);
  }
  expect(f.height).toBeLessThan(50);
});

test("the composer grows with its text up to four lines and keeps line breaks @layout", async ({ app, page }) => {
  const view = await seeded(app, page);
  const field = view.getByRole("textbox", { name: "Mensagem para a mesa" });
  const h0 = (await field.boundingBox()).height;
  await field.fill("um\ndois\ntrês\nquatro\ncinco\nseis\nsete\noito\nnove");
  const h1 = (await field.boundingBox()).height;
  expect(h1).toBeGreaterThan(h0 + 20);
  if (phone(page)) expect(h1).toBeLessThan(h0 + 4 * 25);
  await field.fill("");
  await field.focus();
  await page.keyboard.type("a");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("b");
  await expect(field).toHaveValue("a\nb");
});

test("the dice row is behind a button on a phone, and the choice stays @layout", async ({ app, page }) => {
  const view = await seeded(app, page);
  const row = view.locator(".tray-row");
  if (!phone(page)) {
    await expect(row).toBeVisible();
    await expect(view.getByRole("button", { name: "Dados", exact: true })).toBeHidden();
    return;
  }
  const toggle = view.getByRole("button", { name: "Dados", exact: true });
  await expect(row).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(row).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await view.getByRole("button", { name: "Adicionar um d20", exact: true }).click();
  await expect(view.getByRole("textbox", { name: "Mensagem para a mesa" })).toHaveValue(/d20/);
  // Remembered on this device; closed again, it hides the row.
  expect(await page.evaluate(() => localStorage.getItem("verso.table.diceRow"))).toBe("1");
  await toggle.click();
  await expect(row).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("verso.table.diceRow"))).toBe("0");
});
