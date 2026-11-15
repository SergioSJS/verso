// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The phone's one top bar (2026-11-14): the row of tabs, the note's row of
// folder and modes and the bottom bar of verbs gave way to one bar — the
// tabs behind their count, the note's name over its folder, a mode button —
// and a sheet under it with the tabs, the folder, the three modes, the verbs
// and whether the bottom bar stays. The bottom bar is on by default.

import { expect, test } from "./fixtures.mjs";

const PHONE = "(max-width: 760px), (pointer: coarse) and (max-height: 500px)";

/** The bottom bar hidden, as a person may keep it: the top bar and its sheet
 *  are then the way to the verbs. Once per tab, so that a reload keeps what
 *  the test chose. */
async function barOff(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("bar-set")) return;
    const raw = localStorage.getItem("verso.settings");
    const saved = raw ? JSON.parse(raw) : {};
    localStorage.setItem("verso.settings", JSON.stringify({ ...saved, phoneBottomBar: false }));
    sessionStorage.setItem("bar-set", "1");
  });
}

test("one top bar on a phone: the text gets the room, the sheet has the rest @layout", async ({ app, page }) => {
  await barOff(page);
  await app.open();
  test.skip(!(await page.evaluate((m) => matchMedia(m).matches, PHONE)), "a phone's frame");
  const bar = page.locator(".bottom-bar");
  await expect(bar).toBeHidden();
  // No tab open: the bar stays, with the folder's name — the way to the verbs.
  const count = page.locator(".pane.focused .phone-tabs, .pane .phone-tabs").first();
  await expect(count).toBeVisible();
  await expect(count).toHaveAttribute("aria-label", "0 abas abertas");
  await app.quickOpen("04 - Escrevendo no Editor");
  const head = page.locator(".pane .phone-head").first();
  await expect(head.locator(".phone-title-name")).toHaveText("04 - Escrevendo no Editor");
  await expect(head.locator(".phone-title-path")).toHaveText("demo-vault");
  await expect(count).toHaveAttribute("aria-label", "1 aba aberta");
  // The tab row and the note's own head are gone: one row of 44px above the text.
  await expect(page.locator(".pane .tab-list").first()).toBeHidden();
  await expect(page.locator(".leaf:not([hidden]) .note-head")).toBeHidden();
  const tabs = await page.locator(".pane .tabs").first().boundingBox();
  expect(tabs.height).toBeLessThanOrEqual(45);
  // Each of its buttons is a finger's target.
  for (const b of await head.locator("button:visible").all()) {
    const box = await b.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(43.5);
  }

  // The mode button: Reading to Edit and back.
  const mode = head.locator(".phone-mode");
  await expect(mode).toHaveAttribute("aria-label", "Leitura. Tocar para editar");
  await mode.click();
  await expect(mode).toHaveAttribute("aria-label", "Edição. Tocar para ler");
  await expect(page.locator(".leaf:not([hidden]) .cm-editor")).toBeVisible();
  await mode.click();
  await expect(mode).toHaveAttribute("aria-label", "Leitura. Tocar para editar");

  // The sheet: the tab, the folder, the modes by name, the verbs.
  await count.click();
  const sheet = page.getByRole("dialog", { name: "Abas e opções" });
  await expect(sheet).toBeVisible();
  await expect(count).toHaveAttribute("aria-expanded", "true");
  await expect(sheet.locator('.phone-sheet-tab-go[aria-current="page"]')).toContainText("04 - Escrevendo no Editor");
  await expect(sheet.locator(".crumb").first()).toHaveText("demo-vault");
  await expect(sheet.getByRole("button", { name: "Leitura" })).toHaveAttribute("aria-pressed", "true");
  for (const verb of ["Arquivos", "Buscar", "Nova nota", "Comandos", "Painel"]) await expect(sheet.getByRole("button", { name: verb })).toBeVisible();
  // Nothing in it wider than the screen, and its targets are a finger's.
  const bad = await sheet.evaluate((s) => {
    const out = [];
    if (s.scrollWidth > s.clientWidth + 1) out.push(`the sheet is ${s.scrollWidth}px wide in ${s.clientWidth}px`);
    for (const b of s.querySelectorAll("button")) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height < 43.5) out.push(`${(b.getAttribute("aria-label") || b.textContent || "").trim()}: ${Math.round(r.height)}px high`);
    }
    return out;
  });
  expect(bad).toEqual([]);
  // Edit from the sheet: it closes, the note is in Edit.
  await sheet.getByRole("button", { name: "Editar" }).click();
  await expect(sheet).toBeHidden();
  await expect(count).toHaveAttribute("aria-expanded", "false");
  await expect(mode).toHaveAttribute("aria-label", "Edição. Tocar para ler");

  // Escape (Android's Back) closes the sheet; a verb runs and closes it.
  await count.click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await count.click();
  await sheet.getByRole("button", { name: "Arquivos" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator("body")).toHaveClass(/side-open/);
});

test("the bottom bar is on by default; the sheet's switch hides it, ⋯ brings it back, and each stays @layout", async ({ app, page }) => {
  await app.open();
  test.skip(!(await page.evaluate((m) => matchMedia(m).matches, PHONE)), "a phone's frame");
  await app.quickOpen("04 - Escrevendo no Editor");
  const bar = page.locator(".bottom-bar");
  await expect(bar).toBeVisible();
  const count = page.locator(".pane .phone-tabs").first();
  await count.click();
  const sheet = page.getByRole("dialog", { name: "Abas e opções" });
  const toggle = sheet.getByRole("switch", { name: "Barra inferior sempre visível" });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(bar).toBeHidden();
  await page.keyboard.press("Escape");
  // Kept for the next start.
  await page.reload();
  await page.waitForFunction(() => window.__harness?.ready === true);
  await expect(bar).toBeHidden();
  // And back from the pane's ⋯, kept too.
  await page.locator(".pane .pane-fold").first().click();
  await page.getByRole("menuitem", { name: "Mostrar a barra inferior" }).click();
  await expect(bar).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => window.__harness?.ready === true);
  await expect(bar).toBeVisible();
});

test("a desktop window keeps its tabs and the note's own row @layout", async ({ app, page }) => {
  await app.open();
  test.skip(await page.evaluate((m) => matchMedia(m).matches, PHONE), "a wide window");
  await app.quickOpen("04 - Escrevendo no Editor");
  await expect(page.locator(".pane .phone-head").first()).toBeHidden();
  await expect(page.locator(".pane .tab-list").first()).toBeVisible();
  await expect(page.locator(".leaf:not([hidden]) .note-head")).toBeVisible();
});
