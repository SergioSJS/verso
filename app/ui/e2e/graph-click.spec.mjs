// A click on a graph node centres the graph on it; a double click (a double
// tap on a phone) opens the note; a drag does neither. Enter opens and
// Shift-Enter centres, as before.

import { test, expect } from "./fixtures.mjs";

async function vault(app, page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await app.open("?vault=empty");
  await app.writeOutside("A.md", "# A\n\nVeja [[B]] e [[C]].\n");
  await app.writeOutside("B.md", "# B\n\nVolta a [[A]].\n");
  await app.writeOutside("C.md", "# C\n\nSem link.\n");
  await app.folderChanged(["A.md", "B.md", "C.md"], true);
  await app.command("Grafo do cofre");
  await expect(page.locator("svg.graph .node")).toHaveCount(3);
}
const node = (page, id) => page.locator(`svg.graph .node[data-id="${id}"]`);
const dot = (page, id) => node(page, id).locator("circle");
const depth = (page) => page.locator('.graph-controls [data-role="depth"]');
const tabs = (page) => page.locator('.pane.focused .tab[aria-selected="true"]');

test.describe("a click and a double click on a graph node @layout", () => {
  test("one click centres the graph and opens nothing", async ({ app, page, isMobile }) => {
    await app.open();
    test.skip(isMobile, "the finger has its own test");
    await vault(app, page);
    await expect(depth(page)).toHaveJSProperty("hidden", true);
    await dot(page, "B.md").click();
    await expect(depth(page)).toHaveJSProperty("hidden", false);
    await page.waitForTimeout(600);
    await expect(tabs(page)).not.toContainText("B.md");
    await expect(page.locator("svg.graph")).toBeVisible();
  });

  test("a double click opens the note", async ({ app, page, isMobile }) => {
    await app.open();
    test.skip(isMobile, "the finger has its own test");
    await vault(app, page);
    await dot(page, "B.md").dblclick();
    await expect(tabs(page)).toContainText("B");
  });

  test("a drag opens nothing and centres nothing", async ({ app, page, isMobile }) => {
    await app.open();
    test.skip(isMobile, "the finger has its own test");
    await vault(app, page);
    const box = await dot(page, "C.md").boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y + 30, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    await expect(depth(page)).toHaveJSProperty("hidden", true);
    await expect(tabs(page)).not.toContainText("C");
  });

  test("the keyboard: Enter opens, Shift-Enter centres", async ({ app, page, isMobile }) => {
    await app.open();
    test.skip(isMobile, "no keyboard on a phone");
    await vault(app, page);
    await page.locator("svg.graph .node[tabindex='0']").focus();
    await node(page, "B.md").focus();
    await page.keyboard.press("Shift+Enter");
    await expect(depth(page)).toHaveJSProperty("hidden", false);
    await node(page, "B.md").focus();
    await page.keyboard.press("Enter");
    await expect(tabs(page)).toContainText("B");
  });

  test("a tap centres, a double tap opens", async ({ app, page, isMobile }) => {
    await app.open();
    test.skip(!isMobile, "a finger");
    await vault(app, page);
    const at = async (id) => {
      const b = await dot(page, id).boundingBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    // Let the drawing settle: the node is a few pixels wide.
    await page.waitForTimeout(800);
    let p = await at("B.md");
    await page.touchscreen.tap(p.x, p.y);
    await expect(depth(page)).toHaveJSProperty("hidden", false);
    await page.waitForTimeout(600);
    await expect(tabs(page)).not.toContainText("B.md");
    await page.waitForTimeout(800);
    p = await at("C.md");
    await page.touchscreen.tap(p.x, p.y);
    await page.touchscreen.tap(p.x, p.y);
    await expect(tabs(page)).toContainText("C");
  });
});
