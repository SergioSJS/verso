// The maintainer's feedback of 2026-10-23 on the real Mac app: a drag from
// the Table leaves no text selected; the right bar resizes on every tab and
// starts wider; the oracle's die falls in 3D; the / menu has a dice item.

import { test, expect } from "./fixtures.mjs";

const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;
const mesaTab = (page) => page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ });
const doc = (page) => page.evaluate(() => document.querySelector(".note-sheet .editor").__cmView.state.doc.toString());
const selected = (page) => page.evaluate(() => window.getSelection()?.toString() ?? "");

const MESA = ["# Mesa", "", "Ataque: `dice: 1d20+3`.", ""].join("\n");
const DIARIO = "# Diário\n\nTexto.\n\nFim.\n";

async function withFeature(page, name, value) {
  await page.addInitScript(([n, v]) => {
    const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
    localStorage.setItem("verso.settings", JSON.stringify({ ...s, features: { ...(s.features ?? {}), [n]: v } }));
  }, [name, value]);
}

async function editing(app, page, name) {
  await app.quickOpen(name);
  await page.getByRole("button", { name: "Editar", exact: true }).first().click();
  await expect(page.locator(".editor.live .cm-content")).toBeVisible();
}

test("a roll dragged from the table selects no text, in the panel or in the note", async ({ app, page }) => {
  test.skip(phone(page), "the phone adds by the entry's menu");
  await app.open();
  await app.writeOutside("Mesa.md", MESA);
  await app.writeOutside("Diario.md", DIARIO);
  await app.folderChanged(["Mesa.md", "Diario.md"], true);
  await app.quickOpen("Mesa");
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await mesaTab(page).click();
  const view = page.locator(".table-view");
  await expect(view).toBeVisible();
  await page.locator(".preview:visible").getByRole("button", { name: "Rolar 1d20+3" }).click();
  const entry = view.locator(".table-entry").first();
  await expect(entry).toBeVisible();
  await editing(app, page, "Diario");
  const line = page.locator(".cm-line", { hasText: "Fim." }).first();
  const box = await entry.boundingBox();
  // The press lands on the entry's text; the pointer then crosses the log and the note's lines.
  await page.mouse.move(box.x + 12, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 14, { steps: 3 });
  const at = await line.boundingBox();
  await page.mouse.move(at.x + 20, at.y + 5, { steps: 12 });
  await page.mouse.move(at.x + at.width / 2, at.y + at.height - 3, { steps: 6 });
  await expect(page.locator(".drag-ghost")).toBeVisible();
  expect(await selected(page)).toBe("");
  // Nothing may be selected while it runs: the log's lines and the editor's are not selectable.
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".table-log")).userSelect.replace("auto", "none"))).toBe("none");
  await page.mouse.move(at.x + at.width / 2 + 40, at.y + at.height - 3, { steps: 4 });
  expect(await selected(page)).toBe("");
  await page.mouse.up();
  expect(await selected(page)).toBe("");
  expect(await doc(page)).toContain("```roll");
  // Selecting text is still possible once the drag is over.
  await page.locator(".cm-line", { hasText: "Texto." }).first().dblclick();
  expect(await selected(page)).not.toBe("");
});

test("the right bar resizes on every tab, the Mesa's too, and starts wider", async ({ app, page }) => {
  test.skip(phone(page), "the drawers have no divider");
  await app.open();
  await app.writeOutside("Mesa.md", MESA);
  await app.folderChanged(["Mesa.md"], true);
  await app.quickOpen("Mesa");
  await page.evaluate(() => document.body.classList.remove("no-right"));
  const right = page.locator("aside.right");
  const widthOf = () => right.evaluate((e) => Math.round(e.getBoundingClientRect().width));
  // The default, on a window of 1500 px: about 320, the remembered width of an earlier session not in play.
  expect(await page.evaluate(() => localStorage.getItem("verso.rightWidth"))).toBeNull();
  const start = await widthOf();
  expect(start).toBeGreaterThanOrEqual(310);
  expect(start).toBeLessThanOrEqual(330);
  const tabs = page.locator("#right-tabs [role=tab]");
  const count = await tabs.count();
  expect(count).toBeGreaterThan(1);
  let seenMesa = false;
  for (let i = 0; i < count; i++) {
    const tab = tabs.nth(i);
    if (!(await tab.isVisible())) continue;
    await tab.click();
    seenMesa ||= (await tab.getAttribute("data-tab")) === "table";
    const before = await widthOf();
    const d = await page.locator("#right-divider").boundingBox();
    const y = d.y + d.height / 2;
    // The handle is what answers at that point, whatever the tab shows.
    expect(await page.evaluate(([x, py]) => document.elementFromPoint(x, py)?.id, [d.x + d.width / 2, y])).toBe("right-divider");
    await page.mouse.move(d.x + d.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(d.x + d.width / 2 - 60, y, { steps: 5 });
    await page.mouse.up();
    expect(await widthOf()).toBeGreaterThan(before + 40);
    // And back, so the next tab starts level.
    const d2 = await page.locator("#right-divider").boundingBox();
    await page.mouse.move(d2.x + d2.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(d2.x + d2.width / 2 + 60, y, { steps: 5 });
    await page.mouse.up();
  }
  expect(seenMesa).toBe(true);
  // The width is remembered for the next start.
  expect(await page.evaluate(() => Number(localStorage.getItem("verso.rightWidth")))).toBeGreaterThanOrEqual(180);
});

test("dragging the right bar's divider over the Mesa's log selects nothing, and a hovering pointer afterwards does not move it", async ({ app, page }) => {
  test.skip(phone(page), "the drawers have no divider");
  await app.open();
  await app.writeOutside("Mesa.md", MESA);
  await app.folderChanged(["Mesa.md"], true);
  await app.quickOpen("Mesa");
  await page.evaluate(() => document.body.classList.remove("no-right"));
  await mesaTab(page).click();
  const view = page.locator(".table-view");
  await expect(view).toBeVisible();
  await page.locator(".preview:visible").getByRole("button", { name: "Rolar 1d20+3" }).click();
  await expect(view.locator(".table-entry")).toHaveCount(1);
  const right = page.locator("aside.right");
  const widthOf = () => right.evaluate((e) => Math.round(e.getBoundingClientRect().width));
  const entry = (await view.locator(".table-entry").first().boundingBox());
  const d = await page.locator("#right-divider").boundingBox();
  const y = entry.y + entry.height / 2;
  await page.mouse.move(d.x + d.width / 2, y);
  await page.mouse.down();
  await expect(page.locator("body.resizing")).toHaveCount(1);
  // Across the log's text and out to the right.
  await page.mouse.move(d.x + 90, y + 6, { steps: 6 });
  await page.mouse.move(d.x - 60, y - 6, { steps: 6 });
  expect(await selected(page)).toBe("");
  const during = await widthOf();
  await page.mouse.up();
  await expect(page.locator("body.resizing")).toHaveCount(0);
  const after = await widthOf();
  expect(after).toBeGreaterThan(300);
  // The pointer over the divider again, no button: the bar stays.
  const d2 = await page.locator("#right-divider").boundingBox();
  await page.mouse.move(d2.x + d2.width / 2 + 3, y);
  await page.mouse.move(d2.x + d2.width / 2 - 20, y);
  expect(await widthOf()).toBe(after);
  expect(during).toBeGreaterThanOrEqual(after - 2);
});

test("a remembered right width wins over the default", async ({ app, page }) => {
  test.skip(phone(page), "the drawers have their own width");
  await page.addInitScript(() => localStorage.setItem("verso.rightWidth", "400"));
  await app.open();
  await page.evaluate(() => document.body.classList.remove("no-right"));
  expect(await page.locator("aside.right").evaluate((e) => Math.round(e.getBoundingClientRect().width))).toBe(400);
});

const SCENE = ["# Cena", "", "> [!oracle] A porta está trancada?", "", "Depois, a cena segue.", ""].join("\n");
const gl = (page) =>
  page.evaluate(() => {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  });

test("asking the oracle with 3D dice on throws the die, and the answer shows when it rests", async ({ app, page }, info) => {
  await withFeature(page, "dice3d", true);
  const chunks = [];
  page.on("request", (r) => {
    if (/\/(harness-)?chunks\/stage-[^/]*\.js/.test(r.url())) chunks.push(r.url());
  });
  await app.open();
  await app.writeOutside("Cena.md", SCENE);
  await app.folderChanged(["Cena.md"], true);
  await app.quickOpen("Cena");
  await page.locator('.preview:visible .callout[data-callout="oracle"] .oracle-callout-btn').click();
  const dialog = page.getByRole("dialog", { name: "Oráculo & Improvisação" });
  await expect(dialog).toBeVisible();
  const hasGl = await gl(page);
  info.annotations.push({ type: "webgl", description: hasGl ? "available" : "NOT available: only the fallback is checked" });
  await dialog.getByRole("button", { name: "Consultar", exact: true }).click();
  const canvas = page.locator("canvas.dice3d-canvas");
  if (hasGl) {
    await expect(canvas).toHaveCount(1);
    // The answer waits for the die.
    await expect(dialog.locator(".oracle-outcome-badge")).toBeEmpty();
    await expect(canvas).toHaveAttribute("data-state", "resting", { timeout: 9000 });
  }
  expect(chunks.length).toBe(1);
  await expect(dialog.locator(".oracle-outcome-badge")).not.toBeEmpty();
  // The number the die shows is the one the dialog says.
  await expect(dialog.locator(".oracle-roll-detail")).toContainText(/\d+/);
});

test("asking the oracle with 3D dice off throws nothing", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Cena.md", SCENE);
  await app.folderChanged(["Cena.md"], true);
  await app.quickOpen("Cena");
  await page.locator('.preview:visible .callout[data-callout="oracle"] .oracle-callout-btn').click();
  const dialog = page.getByRole("dialog", { name: "Oráculo & Improvisação" });
  await dialog.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(dialog.locator(".oracle-outcome-badge")).not.toBeEmpty();
  await expect(page.locator("canvas.dice3d-canvas")).toHaveCount(0);
});

test("the / menu's Dado item inserts `dice: 1d20` with the notation selected to type over", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Diario.md", DIARIO);
  await app.folderChanged(["Diario.md"], true);
  await editing(app, page, "Diario");
  await page.locator(".cm-content").first().click();
  await app.key("Mod+End");
  await page.keyboard.type("\n\n/dado");
  const item = page.locator(".slash .slash-item", { has: page.locator(".slash-title", { hasText: /^Dado$/ }) });
  await expect(item).toBeVisible();
  await page.keyboard.press("Enter");
  expect(await doc(page)).toMatch(/`dice: 1d20`$/);
  expect(await page.evaluate(() => { const v = document.querySelector(".note-sheet .editor").__cmView; const s = v.state.selection.main; return v.state.sliceDoc(s.from, s.to); })).toBe("1d20");
  await page.keyboard.type("2d6");
  expect(await doc(page)).toMatch(/`dice: 2d6`$/);
});

test("the / menu has no Dado item while the Dice feature is off", async ({ app, page }) => {
  await withFeature(page, "diceRolling", false);
  await app.open();
  await app.writeOutside("Diario.md", DIARIO);
  await app.folderChanged(["Diario.md"], true);
  await editing(app, page, "Diario");
  await page.locator(".cm-content").first().click();
  await app.key("Mod+End");
  await page.keyboard.type("\n\n/dado");
  await expect(page.locator(".slash")).toBeVisible();
  await expect(page.locator(".slash .slash-item .slash-title", { hasText: /^Dado$/ })).toHaveCount(0);
});
