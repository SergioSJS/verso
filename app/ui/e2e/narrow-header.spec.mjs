// The pane's head on narrow windows (fix/narrow-header, 2026-10-30): with both side bars open, nothing the
// head holds paints outside the pane's column — nor under a side bar — and the bars' toggles stay in
// sight and clickable, at every width down to a phone's (ADR 0076). Notes, boards, bases.

import { test, expect } from "./fixtures.mjs";

const SYNCED = { key: "harness", on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "editor", state: "synced", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], log: [], last: "2026-10-11T12:00:00Z", message: null, problem: null, versions: null, revoked: null };
const NOTE = "Sessao ao vivo com um nome bem comprido para a aba.md";
const BOARD = "Quadro do grupo.canvas";
const PEOPLE = ["Bruno", "Ana", "Caio", "Dora", "Eduardo", "Fabíola"];

async function setup(app, page, width) {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 751 });
  await app.open("?vault=empty");
  await app.writeOutside(NOTE, "# Sessao ao vivo com um titulo comprido\n\num\n");
  await app.writeOutside(BOARD, '{"nodes":[{"id":"a","x":0,"y":0,"width":250,"height":60,"type":"text","text":"Alfa"}],"edges":[]}');
  await app.writeOutside("Projetos.base", "views:\n  - type: table\n    name: Tabela\n");
  await app.folderChanged([NOTE, BOARD, "Projetos.base"], true);
  await page.evaluate(async (st) => {
    window.__harness.rooms.up = true;
    window.__harness.core.handlers.folder_sync = () => st;
    await window.__harness.emit("sync-status", st);
  }, SYNCED);
}

/** The box of an element, or null while it is not shown. */
const boxOf = (loc) => loc.boundingBox();

/** Every visible thing the head holds lies inside the column between the bars. */
async function inColumn(page) {
  const work = await boxOf(page.locator("main.work"));
  const bars = [];
  for (const sel of ["aside.side", "aside.right"]) {
    const el = page.locator(sel);
    if (await el.isVisible()) bars.push([sel, await boxOf(el)]);
  }
  const boxes = await page.evaluate(() => {
    const out = [];
    for (const head of document.querySelectorAll(".leaf-head, .note-sheet .title-row")) {
      if (!head.closest(".leaf")?.offsetParent) continue;
      for (const el of head.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || getComputedStyle(el).position === "fixed") continue;
        if (el.closest("[hidden], .sr-only")) continue;
        // The place's box has a fade zone of padding on its left (a mask, nothing painted in it): its content is what counts.
        const cs = getComputedStyle(el);
        const pad = cs.maskImage !== "none" ? parseFloat(cs.paddingLeft) : 0;
        out.push({ tag: `${el.tagName.toLowerCase()}.${el.className}`, x: r.x + pad, y: r.y, w: r.width - pad, h: r.height });
      }
    }
    return out;
  });
  expect(boxes.length).toBeGreaterThan(0);
  for (const b of boxes) {
    expect(b.x, `${b.tag} starts left of the column`).toBeGreaterThanOrEqual(work.x - 1);
    expect(b.x + b.w, `${b.tag} ends right of the column`).toBeLessThanOrEqual(work.x + work.width + 1);
    for (const [name, bar] of bars) {
      const apart = b.x + b.w <= bar.x + 1 || b.x >= bar.x + bar.width - 1 || b.y + b.h <= bar.y || b.y >= bar.y + bar.height;
      expect(apart, `${b.tag} is under ${name}`).toBe(true);
    }
  }
}

for (const width of [1440, 1073, 900, 761]) {
  test(`both bars open at ${width} px: the heads stay in their column, the toggles stay clickable`, async ({ app, page }) => {
    await setup(app, page, width);
    await page.evaluate(() => document.body.classList.remove("no-right", "no-side"));
    for (const [open, file] of [
      [NOTE, NOTE],
      [BOARD, BOARD],
      ["Projetos.base", "Projetos.base"],
    ]) {
      await app.quickOpen(file.replace(/\.(md|canvas)$/, ""));
      if (file.endsWith(".canvas")) await app.boardReady();
      if (file === NOTE) {
        await page.evaluate(([p, names]) => names.forEach((n) => window.__harness.rooms.present(p, n)), [open, PEOPLE]);
      }
      await page.waitForTimeout(300);
      await inColumn(page);
      if (file === NOTE) {
        // Compact: the place and the modes share one short row, and the title follows closely.
        const head = await boxOf(page.locator(".leaf-head:visible").first());
        const title = await boxOf(page.locator(".note-title:visible").first());
        expect(head.height, "head row height").toBeLessThanOrEqual(40);
        expect(title.y - (head.y + head.height), "gap from the head to the title").toBeLessThanOrEqual(24);
        const crumbs = await boxOf(page.locator(".leaf-head:visible .crumbs").first());
        const modes = await boxOf(page.locator(".leaf-head:visible .modes").first());
        expect(Math.abs(crumbs.y + crumbs.height / 2 - (modes.y + modes.height / 2)), "crumbs and modes on one row").toBeLessThan(14);
      }
      for (const id of ["toggle-side", "toggle-right"]) {
        const b = page.locator(`#${id}`);
        await expect(b).toBeVisible();
        const r = await boxOf(b);
        const work = await boxOf(page.locator("main.work"));
        expect(r.x).toBeGreaterThanOrEqual(work.x - 1);
        expect(r.x + r.width).toBeLessThanOrEqual(work.x + work.width + 1);
      }
    }
    // Clickable: the right bar closes and opens again from its toggle.
    const toggle = page.locator("#toggle-right");
    await toggle.click();
    await expect(page.locator("body")).toHaveClass(/no-right/);
    await toggle.click();
    await expect(page.locator("body")).not.toHaveClass(/no-right/);
  });
}

test("at 760 px, a phone-sized drawer layout: the bars' toggles are in sight", async ({ app, page }) => {
  await setup(app, page, 760);
  await app.quickOpen(BOARD.replace(/\.canvas$/, ""));
  await app.boardReady();
  // A board at phone size has no head row of its own (its verbs are in the
  // top bar's sheet, ADR 0076 item 6): the one top bar is what is in sight.
  await expect(page.locator(".pane .phone-head").first()).toBeVisible();
  // A board you draw on gives the bottom bar's place to its tools (ADR 0076
  // item 6, option C): the panel is one tap away on the edge's tab.
  await expect(page.locator(".bar-right")).toBeHidden();
  const tab = page.locator(".edge-handle.edge-right");
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(page.locator("body")).toHaveClass(/right-open/);
  await expect(page.locator("#right")).toBeVisible();
});
