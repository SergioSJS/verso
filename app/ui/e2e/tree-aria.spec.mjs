// The file tree is a WAI-ARIA tree (A11Y.15, accessibility review section 1
// finding 6): roles, levels and sizes, one Tab stop that remembers its
// item, and the pattern's keys, plus type-ahead and the menu by keyboard.

import { test, expect } from "./fixtures.mjs";

const FILES = {
  "Zeta/Alfa.md": "a\n",
  "Zeta/Sub/Deep.md": "d\n",
  "Zeta/Sub2/Other.md": "o\n",
  "Beta.md": "b\n",
  "Gama.md": "g\n",
};

async function tree(app) {
  await app.open("?vault=empty");
  for (const [p, text] of Object.entries(FILES)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(FILES), true);
  await expect(app.page.locator('#notes summary[data-folder="Zeta"]')).toBeVisible();
}
const folder = (page, f) => page.locator(`#notes summary[data-folder="${f}"]`);
const file = (page, p) => page.locator(`#notes li[data-path="${p}"] > button`);
const active = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a?.dataset?.folder ?? a?.closest?.("li[data-path]")?.dataset.path ?? null;
});

test("the tree and its items carry the tree pattern's roles and numbers", async ({ app, page }) => {
  await tree(app);
  const root = page.locator("#notes");
  await expect(root).toHaveAttribute("role", "tree");
  await expect(root).toHaveAttribute("aria-multiselectable", "true");
  await expect(root).toHaveAttribute("aria-label", /Arquivos|Files/);
  const z = folder(page, "Zeta");
  await expect(z).toHaveAttribute("role", "treeitem");
  await expect(z).toHaveAttribute("aria-level", "1");
  await expect(z).toHaveAttribute("aria-expanded", "true");
  await expect(z).toHaveAttribute("aria-setsize", "3");
  await expect(z).toHaveAttribute("aria-posinset", "1");
  const sub = folder(page, "Zeta/Sub");
  await expect(sub).toHaveAttribute("aria-level", "2");
  await expect(sub).toHaveAttribute("aria-expanded", "false");
  await expect(sub).toHaveAttribute("aria-setsize", "3");
  await expect(sub).toHaveAttribute("aria-posinset", "1");
  const alfa = file(page, "Zeta/Alfa.md");
  await expect(alfa).toHaveAttribute("role", "treeitem");
  await expect(alfa).toHaveAttribute("aria-level", "2");
  await expect(alfa).toHaveAttribute("aria-posinset", "3");
  await expect(alfa).not.toHaveAttribute("aria-expanded", /.*/);
  await expect(file(page, "Gama.md")).toHaveAttribute("aria-posinset", "3");
  // Children sit in a group, the structure around them presentational.
  await expect(page.locator('#notes li[data-path="Zeta/Alfa.md"]').locator("xpath=..")).toHaveAttribute("role", "group");
  await expect(alfa.locator("xpath=..")).toHaveAttribute("role", "none");
  // A folder opened later draws its items with their numbers.
  await folder(page, "Zeta/Sub").locator(".chev").click();
  const deep = file(page, "Zeta/Sub/Deep.md");
  await expect(deep).toHaveAttribute("aria-level", "3");
  await expect(deep).toHaveAttribute("aria-setsize", "1");
  await expect(sub).toHaveAttribute("aria-expanded", "true");
});

test("the whole tree is one Tab stop and remembers its item", async ({ app, page }) => {
  await tree(app);
  const items = page.locator('#notes [role="treeitem"]');
  const tabbable = () => items.evaluateAll((els) => els.filter((e) => e.tabIndex >= 0).length);
  expect(await tabbable()).toBe(1);
  await folder(page, "Zeta").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  expect(await active(page)).toBe("Zeta/Alfa.md");
  expect(await tabbable()).toBe(1);
  await expect(file(page, "Zeta/Alfa.md")).toHaveAttribute("tabindex", "0");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest("#notes") !== null)).toBe(false);
  await page.keyboard.press("Shift+Tab");
  expect(await active(page)).toBe("Zeta/Alfa.md");
  // Redrawn (a file written outside), the tree keeps its one stop.
  await app.writeOutside("Zz.md", "z\n");
  await app.folderChanged(["Zz.md"], true);
  await expect(file(page, "Zz.md")).toBeVisible();
  expect(await tabbable()).toBe(1);
});

test("arrows, Home, End, Enter and Space follow the tree pattern", async ({ app, page }) => {
  await tree(app);
  await folder(page, "Zeta").focus();
  await page.keyboard.press("ArrowDown");
  expect(await active(page)).toBe("Zeta/Sub");
  // Right opens a closed folder, and stays on it.
  await page.keyboard.press("ArrowRight");
  await expect(folder(page, "Zeta/Sub")).toHaveAttribute("aria-expanded", "true");
  expect(await active(page)).toBe("Zeta/Sub");
  // Right on an open folder goes to its first child.
  await page.keyboard.press("ArrowRight");
  expect(await active(page)).toBe("Zeta/Sub/Deep.md");
  // Left on an item goes to its parent; on an open folder it closes it.
  await page.keyboard.press("ArrowLeft");
  expect(await active(page)).toBe("Zeta/Sub");
  await page.keyboard.press("ArrowLeft");
  await expect(folder(page, "Zeta/Sub")).toHaveAttribute("aria-expanded", "false");
  expect(await active(page)).toBe("Zeta/Sub");
  await page.keyboard.press("ArrowLeft");
  expect(await active(page)).toBe("Zeta");
  await page.keyboard.press("End");
  expect(await active(page)).toBe("Gama.md");
  await page.keyboard.press("Home");
  expect(await active(page)).toBe("Zeta");
  // Enter toggles a folder, opens a file.
  await page.keyboard.press("Enter");
  await expect(folder(page, "Zeta")).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(folder(page, "Zeta")).toHaveAttribute("aria-expanded", "true");
  await file(page, "Beta.md").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".tab", { hasText: "Beta" })).toHaveCount(1);
  // Space selects (and opens nothing); again, it takes the item out.
  await file(page, "Gama.md").focus();
  await page.keyboard.press("Space");
  await expect(file(page, "Gama.md")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".tab", { hasText: "Gama" })).toHaveCount(0);
  await folder(page, "Zeta").focus();
  await page.keyboard.press("Space");
  await expect(folder(page, "Zeta")).toHaveAttribute("aria-selected", "true");
  await expect(folder(page, "Zeta")).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(folder(page, "Zeta")).not.toHaveAttribute("aria-selected", "true");
});

test("typing letters jumps to the next item that starts with them", async ({ app, page }) => {
  await tree(app);
  await folder(page, "Zeta").focus();
  await page.keyboard.type("g");
  expect(await active(page)).toBe("Gama.md");
  await page.waitForTimeout(900);
  await page.keyboard.type("b");
  expect(await active(page)).toBe("Beta.md");
  await page.waitForTimeout(900);
  await page.keyboard.type("su");
  expect(await active(page)).toBe("Zeta/Sub");
  // The same letter again walks the matches: Sub, then Sub2.
  await page.waitForTimeout(900);
  await page.keyboard.type("s");
  expect(await active(page)).toBe("Zeta/Sub2");
});

test("* opens every folder beside the item", async ({ app, page }) => {
  await tree(app);
  await folder(page, "Zeta/Sub").focus();
  await page.keyboard.press("*");
  await expect(folder(page, "Zeta/Sub")).toHaveAttribute("aria-expanded", "true");
  await expect(folder(page, "Zeta/Sub2")).toHaveAttribute("aria-expanded", "true");
  await expect(file(page, "Zeta/Sub2/Other.md")).toBeVisible();
});

test("the item's menu opens from the keyboard", async ({ app, page }) => {
  await tree(app);
  await file(page, "Beta.md").focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.locator(".menu:not([hidden])")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".menu:not([hidden])")).toHaveCount(0);
  await folder(page, "Zeta").focus();
  await page.keyboard.press("ContextMenu");
  await expect(page.locator(".menu:not([hidden])")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("a click still opens a note", async ({ app, page }) => {
  await tree(app);
  await file(page, "Gama.md").click();
  await expect(page.locator(".tab", { hasText: "Gama" })).toHaveCount(1);
  await expect(file(page, "Gama.md")).toHaveAttribute("aria-current", "true");
});
