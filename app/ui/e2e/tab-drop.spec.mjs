// A tab dragged with the pointer lands where it is let go: on a pane's
// tab bar or body (a split at the body's edges), or nowhere — let go over
// the file tree, the right panel or the status bar, it used to split the
// nearest pane. Escape gives a drag up. And a hidden tab bar comes back
// with a double click on the pane's own ground.

import { test, expect } from "./fixtures.mjs";

/** The pointer pressed on `tab` and moved far enough to start its drag. */
async function pickUp(page, tab) {
  const box = await tab.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20, { steps: 4 });
  await expect(page.locator(".drag-ghost")).toBeVisible();
}

test("a tab let go over the file tree lands nowhere; Escape gives a drag up", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("01 - Guia");
  const panes = page.locator(".pane");
  await expect(panes).toHaveCount(1);
  // Two tabs: a pane's only tab is never split off itself (drop(), on
  // purpose), so with one tab no drop could split and nothing here would
  // tell a drop that lands nowhere from one refused.
  const tabs = page.locator(".pane .tab");
  await tabs.first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Duplicar aba" }).click();
  await expect(tabs).toHaveCount(2);
  const tab = tabs.first();

  // Over the tree: no pane offered, and nothing split at the release.
  await pickUp(page, tab);
  const tree = await page.locator("#notes").boundingBox();
  await page.mouse.move(tree.x + tree.width / 2, tree.y + Math.min(160, tree.height / 2), { steps: 10 });
  await expect(page.locator(".pane-body.drop-hint")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator(".drag-ghost")).toBeHidden();
  await expect(panes).toHaveCount(1);
  await expect(tabs).toHaveCount(2);

  // At the pane's right edge, where it would split: Escape, and the
  // release after it does nothing.
  await pickUp(page, tab);
  const body = await page.locator(".pane-body").first().boundingBox();
  await page.mouse.move(body.x + body.width - 12, body.y + body.height / 2, { steps: 10 });
  await expect(page.locator(".pane-body.drop-hint")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".drag-ghost")).toBeHidden();
  await expect(page.locator(".pane-body.drop-hint")).toHaveCount(0);
  await page.mouse.up();
  await expect(panes).toHaveCount(1);

  // The same drag let go there still splits: the drop itself works.
  await pickUp(page, tab);
  await page.mouse.move(body.x + body.width - 12, body.y + body.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(panes).toHaveCount(2);
  await expect(page.locator(".pane .tab")).toHaveCount(2);
});

test("a hidden tab bar comes back with a double click on the pane's ground", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("01 - Guia");
  await app.command("Ocultar barra de abas");
  await expect(page.locator(".pane.tabs-hidden")).toHaveCount(1);
  // On the note's own text a double click is its own (a word selected).
  await page.locator(".leaf:not([hidden]) .cm-content, .leaf:not([hidden]) .preview").first().dblclick();
  await expect(page.locator(".pane.tabs-hidden")).toHaveCount(1);
  // The bare area of the tab's view, around what it shows.
  await page.locator(".pane-body > .leaf:not([hidden])").first().dispatchEvent("dblclick");
  await expect(page.locator(".pane.tabs-hidden")).toHaveCount(0);
});
