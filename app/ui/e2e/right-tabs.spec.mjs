// The right panel's tab bar on Windows and Linux (ADR 0072; the maintainer,
// 2026-10-23: "no windows os botões no topo tão bem ruim e encavalado.
// deveria ter opção de reordenar com drag and drop como noutras partes do
// sistema"). The window draws its own minimize, maximize and close at the
// top right: the tab bar keeps clear of them, its tabs keep their size and
// their gap, the ones without room go into a "⋯" menu, and the person
// reorders the tabs by drag, by Alt+←/→ or from the tab's menu — kept after
// a reload.

import { test, expect } from "./fixtures.mjs";
import { shot } from "./shots.mjs";

const win = (page) => page.addInitScript(() => Object.defineProperty(Navigator.prototype, "platform", { get: () => "Win32" }));

async function openRight(app, page, width) {
  await win(page);
  await app.open("?vault=empty&table=owner&frame=windows");
  await page.evaluate((w) => {
    document.body.classList.remove("no-right");
    document.documentElement.style.setProperty("--right-w", `${w}px`);
  }, width);
  await expect(page.locator("#right-tabs")).toBeVisible();
  await page.waitForTimeout(250);
}

/** The tabs shown (not folded into the "⋯"), with their boxes, left to right. */
async function shown(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("#right-tabs > button")]
      .filter((b) => !b.hidden && getComputedStyle(b).display !== "none")
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { id: b.dataset.tab ?? "more", left: r.left, right: r.right, width: r.width, top: r.top, bottom: r.bottom };
      }),
  );
}

async function ids(page) {
  return page.evaluate(() => [...document.querySelectorAll('#right-tabs > button[role="tab"]')].filter((b) => !b.hidden).map((b) => b.dataset.tab));
}

async function noOverlap(page) {
  const controls = await page.locator(".frame-controls").boundingBox();
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  const boxes = await shown(page);
  expect(boxes.length).toBeGreaterThan(1);
  for (const b of boxes) {
    expect(b.right).toBeLessThanOrEqual(controls.x + 0.5);
    // The icons keep their size: 2.25rem.
    expect(b.width).toBeGreaterThanOrEqual(2.25 * rem - 0.5);
  }
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].right + 1);
}

test("with Windows' own buttons the tabs stay clear of them, keep their size, and the rest fold into a menu", async ({ app, page }) => {
  await openRight(app, page, 320);
  await page.screenshot({ path: shot("65-abas-direita-windows-1500-depois") });
  await noOverlap(page);
  const more = page.getByRole("button", { name: "Mais abas do painel" });
  await expect(more).toBeVisible();
  const menu = page.locator(".menu:not([hidden])");
  await more.click();
  await expect(menu).toBeVisible();
  // The menu lists the folded tabs, then the way back to the hidden ones
  // (right-tabs-hide.spec.mjs): reset, tab settings.
  const foldedItems = menu.getByRole("menuitem").filter({ hasNotText: /^(Restaurar abas|Ajustar abas|Mostrar )/ });
  const folded = await foldedItems.count();
  expect(folded).toBeGreaterThan(0);
  expect((await shown(page)).length - 1 + folded).toBe((await ids(page)).length);
  await page.screenshot({ path: shot("66-abas-direita-windows-lista") });
  // Choosing a folded tab chooses it and keeps it in the bar.
  await foldedItems.last().click();
  const chosen = await page.locator('#right-tabs [role="tab"][aria-selected="true"]').getAttribute("data-tab");
  await expect(page.locator(`#right-tabs [data-tab="${chosen}"]`)).toBeVisible();
  await noOverlap(page);
});

test("a narrow panel keeps clear too, and a wide one shows every tab with no menu", async ({ app, page }) => {
  await openRight(app, page, 240);
  await page.screenshot({ path: shot("67-abas-direita-windows-estreito-depois") });
  await noOverlap(page);
  await page.evaluate(() => document.documentElement.style.setProperty("--right-w", "700px"));
  await page.waitForTimeout(300);
  await noOverlap(page);
  await expect(page.getByRole("button", { name: "Mais abas do painel" })).toBeHidden();
  expect((await shown(page)).length).toBe((await ids(page)).length);
  await page.screenshot({ path: shot("68-abas-direita-windows-largo") });
});

test("the tabs are reordered by dragging, and the order is kept after a reload", async ({ app, page }) => {
  await openRight(app, page, 700);
  const before = await ids(page);
  expect(before.slice(0, 3)).toEqual(["outline", "backlinks", "tags"]);
  const from = page.locator('#right-tabs [data-tab="outline"]');
  const to = page.locator('#right-tabs [data-tab="tags"]');
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 3 });
  await page.mouse.move(b.x + b.width - 4, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  const after = await ids(page);
  expect(after.slice(0, 3)).toEqual(["backlinks", "tags", "outline"]);
  // A drag chooses nothing.
  await expect(page.locator('#right-tabs [aria-selected="true"]')).toHaveAttribute("data-tab", "outline");
  await page.reload();
  await page.waitForFunction(() => window.__harness?.ready === true);
  await page.evaluate(() => {
    document.body.classList.remove("no-right");
    document.documentElement.style.setProperty("--right-w", "700px");
  });
  expect((await ids(page)).slice(0, 3)).toEqual(["backlinks", "tags", "outline"]);
});

test("Alt+arrows on a focused tab and the tab's menu move it, and the order is kept", async ({ app, page }) => {
  await openRight(app, page, 700);
  const tab = (id) => page.locator(`#right-tabs [data-tab="${id}"]`);
  await tab("backlinks").focus();
  await page.keyboard.press("Alt+ArrowRight");
  expect((await ids(page)).slice(0, 3)).toEqual(["outline", "tags", "backlinks"]);
  await expect(tab("backlinks")).toBeFocused();
  await page.keyboard.press("Alt+ArrowLeft");
  await page.keyboard.press("Alt+ArrowLeft");
  expect((await ids(page)).slice(0, 3)).toEqual(["backlinks", "outline", "tags"]);
  // Plain arrows still choose.
  await page.keyboard.press("ArrowRight");
  await expect(tab("outline")).toHaveAttribute("aria-selected", "true");
  // The menu: right, then left.
  await tab("tags").click({ button: "right" });
  const menu = page.locator(".menu:not([hidden])");
  await expect(menu.getByRole("menuitem", { name: "Mover para a esquerda" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Mover para a esquerda" }).click();
  expect((await ids(page)).slice(0, 3)).toEqual(["backlinks", "tags", "outline"]);
  await page.reload();
  await page.waitForFunction(() => window.__harness?.ready === true);
  expect((await ids(page)).slice(0, 3)).toEqual(["backlinks", "tags", "outline"]);
});
