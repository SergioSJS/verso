// What a person folded stays folded: a section folded in Reading or in Edit
// mode is still folded when the note is closed and opened again, and a
// click in the outline on a heading inside a folded section opens the
// sections round it (Obsidian does both).

import { test, expect } from "./fixtures.mjs";

const NOTE = "Dobras.md";
const TEXT = [
  "# Dobras", "",
  "Abertura da nota.", "",
  "## Alfa", "",
  "corpo do alfa", "",
  "### Alfa filho", "",
  "corpo do filho", "",
  "## Beta", "",
  "corpo do beta", "",
].join("\n");

async function openNote(app) {
  await app.open();
  await app.writeOutside(NOTE, TEXT);
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Dobras");
  await expect(app.page.locator("div.preview:visible h2", { hasText: "Alfa" })).toBeVisible();
}

const pv = (page) => page.locator("div.preview:visible");
const reopen = async (app) => {
  await app.key("Mod+w");
  await expect(app.page.locator(".tab", { hasText: "Dobras" })).toHaveCount(0);
  await app.quickOpen("Dobras");
  await expect(app.page.locator(".tab", { hasText: "Dobras" })).toHaveCount(1);
};

test("a section folded in Reading is still folded when the note is opened again, in Reading and in Edit", async ({ app, page }) => {
  await openNote(app);
  await pv(page).locator("h2", { hasText: "Alfa" }).locator(".heading-fold-btn").click();
  await expect(pv(page).getByText("corpo do filho")).toBeHidden();
  await reopen(app);
  await expect(pv(page).locator("h2", { hasText: "Alfa" })).toBeVisible();
  await expect(pv(page).locator("h2", { hasText: "Alfa" })).toHaveClass(/heading-folded/);
  await expect(pv(page).getByText("corpo do filho")).toBeHidden();
  await expect(pv(page).getByText("corpo do beta")).toBeVisible();
  // Edit mode shows the same fold.
  await app.key("Mod+e");
  await expect(page.locator(".cm-content")).toContainText("corpo do beta");
  await expect(page.locator(".cm-content")).not.toContainText("corpo do alfa");
  await expect(page.locator(".cm-foldPlaceholder")).toHaveCount(1);
  // The note is not rewritten.
  expect(await app.file(NOTE)).toBe(TEXT);
});

test("a section folded in Edit mode is still folded when the note is opened again, in Edit and in Reading", async ({ app, page }) => {
  await openNote(app);
  await app.key("Mod+e");
  await expect(page.locator(".cm-content")).toContainText("corpo do alfa");
  await app.command("Contrair todas as seções");
  await expect(page.locator(".cm-content")).not.toContainText("corpo do beta");
  await reopen(app);
  const editing = await page.locator(".cm-content:visible").count();
  if (editing === 0) await app.key("Mod+e");
  await expect(page.locator(".cm-content")).not.toContainText("corpo do beta");
  await expect(page.locator(".cm-content")).not.toContainText("corpo do alfa");
  await app.key("Mod+e");
  // Every section was folded, the title's too: only the title is left.
  await expect(pv(page).locator("h1", { hasText: "Dobras" })).toHaveClass(/heading-folded/);
  await expect(pv(page).locator("h2", { hasText: "Beta" })).toBeHidden();
  await expect(pv(page).getByText("corpo do beta")).toBeHidden();
  expect(await app.file(NOTE)).toBe(TEXT);
});

test("the outline opens the sections round a heading it goes to, in Reading", async ({ app, page }) => {
  await openNote(app);
  await pv(page).locator("h2", { hasText: "Alfa" }).locator(".heading-fold-btn").click();
  await expect(pv(page).locator("h3", { hasText: "Alfa filho" })).toBeHidden();
  await app.key("Mod+Alt+ArrowRight");
  await page.locator('#right-tabs button[data-tab="outline"]').click();
  await page.locator("#right-body button", { hasText: "Alfa filho" }).click();
  await expect(pv(page).locator("h3", { hasText: "Alfa filho" })).toBeVisible();
  await expect(pv(page).locator("h2", { hasText: "Alfa" })).not.toHaveClass(/heading-folded/);
  await expect(pv(page).getByText("corpo do filho")).toBeVisible();
});

test("a section opened for the outline keeps a folded sibling folded, in Reading", async ({ app, page }) => {
  await openNote(app);
  await pv(page).locator("h3", { hasText: "Alfa filho" }).locator(".heading-fold-btn").click();
  await pv(page).locator("h2", { hasText: "Alfa" }).locator(".heading-fold-btn").click();
  await pv(page).locator("h2", { hasText: "Alfa" }).locator(".heading-fold-btn").click();
  await expect(pv(page).getByText("corpo do alfa")).toBeVisible();
  // The child was folded before: opening the parent leaves it so.
  await expect(pv(page).getByText("corpo do filho")).toBeHidden();
});

test("the outline opens the sections round a heading it goes to, in Edit mode", async ({ app, page }) => {
  await openNote(app);
  await app.key("Mod+e");
  await expect(page.locator(".cm-content")).toContainText("corpo do alfa");
  await app.command("Contrair todas as seções");
  await expect(page.locator(".cm-content")).not.toContainText("corpo do alfa");
  await app.key("Mod+Alt+ArrowRight");
  await page.locator('#right-tabs button[data-tab="outline"]').click();
  await page.locator("#right-body button", { hasText: "Alfa filho" }).click();
  await expect(page.locator(".cm-line", { hasText: "### Alfa filho" })).toBeVisible();
  // The section of Alfa is open, and Alfa filho's own text hidden or
  // shown as it was: the heading itself is in view and the caret in it.
  await expect(page.locator(".cm-content")).toContainText("corpo do alfa");
});
