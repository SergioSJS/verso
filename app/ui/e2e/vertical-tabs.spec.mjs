// Vertical tabs: one tab per row in a column at the pane's left, the pane's
// tools always reachable so the mode can be left with the tab open.

import { test, expect } from "./fixtures.mjs";

const row = (app, path) => app.page.locator(`#notes li[data-path="${path}"] > button`);

test("vertical tabs list the tabs one under another and keep the toggle reachable", async ({ app }) => {
  await app.open();
  for (const p of ["01 - Guia de Markdown e Sintaxe.md", "02 - Links, Âncoras e Notas Incorporadas.md", "03 - Propriedades e Metadados.md"]) {
    await row(app, p).dblclick();
  }
  const page = app.page;
  const tabs = page.locator(".pane .tab");
  await expect(tabs).toHaveCount(3);
  const pane = page.locator(".pane").first();
  await pane.locator(".pane-tools").getByRole("button", { name: "Abas na vertical" }).click();
  await expect(pane).toHaveClass(/vertical/);

  const boxes = [];
  for (let i = 0; i < 3; i++) boxes.push(await tabs.nth(i).boundingBox());
  for (let i = 1; i < 3; i++) {
    expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height - 1);
    expect(Math.abs(boxes[i].x - boxes[0].x)).toBeLessThan(2);
  }
  // Every tab is inside the column, not spilled out of it.
  const col = await pane.locator(".tabs").boundingBox();
  for (const b of boxes) expect(b.y + b.height).toBeLessThanOrEqual(col.y + col.height + 1);
  // The column sits left of the note, and the note is not squeezed out.
  const bodyBox = await pane.locator(".pane-body").boundingBox();
  expect(bodyBox.x).toBeGreaterThanOrEqual(boxes[0].x + boxes[0].width - 1);
  expect(bodyBox.width).toBeGreaterThan(300);

  // The toggle is visible and clickable with the tabs open.
  const toggle = pane.locator(".pane-tools").getByRole("button", { name: "Abas na horizontal" });
  await expect(toggle).toBeVisible();
  const tb = await toggle.boundingBox();
  const pb = await pane.boundingBox();
  expect(tb.x + tb.width).toBeLessThanOrEqual(pb.x + pb.width);
  expect(tb.x).toBeGreaterThanOrEqual(pb.x);
  expect(tb.y).toBeGreaterThanOrEqual(pb.y);
  expect(tb.y + tb.height).toBeLessThanOrEqual(col.y + col.height + 1);
  await toggle.click();
  await expect(pane).not.toHaveClass(/vertical/);
  await expect(tabs).toHaveCount(3);
  const h = [];
  for (let i = 0; i < 3; i++) h.push(await tabs.nth(i).boundingBox());
  expect(h[1].x).toBeGreaterThan(h[0].x);
  expect(Math.abs(h[1].y - h[0].y)).toBeLessThan(2);
});

test("the palette can always leave vertical tabs", async ({ app }) => {
  await app.open();
  await row(app, "01 - Guia de Markdown e Sintaxe.md").dblclick();
  const pane = app.page.locator(".pane").first();
  await pane.locator(".pane-tools").getByRole("button", { name: "Abas na vertical" }).click();
  await expect(pane).toHaveClass(/vertical/);
  await app.command("Abas na horizontal");
  await expect(pane).not.toHaveClass(/vertical/);
});
