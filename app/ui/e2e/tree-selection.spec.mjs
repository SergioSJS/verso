// Several rows of the file tree selected at once (ADR 0048, revised
// 2026-10-07): ⌘-click and ⇧-click select, Esc clears, a plain click opens;
// dragged onto a folder the selection moves together with one plan of
// link rewrites; its menu moves it or sends it to the bin.

import { test, expect } from "./fixtures.mjs";

const row = (app, p) => app.page.locator(`#notes li[data-path="${p}"] > button`);
const folderRow = (app, f) => app.page.locator(`#notes summary[data-folder="${f}"]`);
const selected = (app) => app.page.locator("#notes .selected").evaluateAll((els) => els.map((e) => e.dataset.folder ?? e.parentElement.dataset.path));

async function folderOf(app, files) {
  await app.open();
  for (const [p, text] of Object.entries(files)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(files), true);
}

async function dragOnto(app, from, to) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  await app.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await app.page.mouse.down();
  await app.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 8, { steps: 4 });
  await app.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await app.page.mouse.up();
}

test("⌘-click adds and takes out rows, ⇧-click selects a range, Esc clears, a plain click opens", async ({ app }) => {
  await folderOf(app, { "Sa.md": "a\n", "Sb.md": "b\n", "Sc.md": "c\n", "Sd.md": "d\n" });
  await row(app, "Sa.md").click();
  await expect(app.page.locator(".tab", { hasText: "Sa" })).toHaveCount(1);
  // ⌘-click: the row clicked before joins the selection it starts.
  await row(app, "Sc.md").click({ modifiers: ["Meta"] });
  await expect.poll(() => selected(app)).toEqual(["Sa.md", "Sc.md"]);
  await row(app, "Sa.md").click({ modifiers: ["Meta"] });
  await expect.poll(() => selected(app)).toEqual(["Sc.md"]);
  // ⇧-click: every row from the last one clicked (Sa, taken out just now).
  await row(app, "Sc.md").click({ modifiers: ["Shift"] });
  await expect.poll(() => selected(app)).toEqual(["Sa.md", "Sb.md", "Sc.md"]);
  // Nothing opened by the selecting clicks.
  await expect(app.page.locator(".tab", { hasText: "Sc" })).toHaveCount(0);
  await app.page.keyboard.press("Escape");
  await expect.poll(() => selected(app)).toEqual([]);
  // A plain click clears it, and opens.
  await row(app, "Sb.md").click({ modifiers: ["Meta"] });
  await row(app, "Sd.md").click({ modifiers: ["Meta"] });
  await expect.poll(() => selected(app)).toHaveLength(2);
  await row(app, "Sc.md").click();
  await expect.poll(() => selected(app)).toEqual([]);
  await expect(app.page.locator(".tab", { hasText: "Sc" })).toHaveCount(1);
});

test("a selection dragged onto a folder moves together, in one call", async ({ app }) => {
  // Side by side in one folder: the folder they go into, then the two.
  await folderOf(app, {
    "Zona/Destino/Fica.md": "fica\n",
    "Zona/Ma.md": "a\n",
    "Zona/Mb.md": "b\n",
    "Ref.md": "[[Ma]] e [[Mb]]\n",
  });
  await folderRow(app, "Zona").evaluate((s) => {
    const d = s.parentElement;
    d.open = true;
    d.dispatchEvent(new Event("toggle"));
  });
  await row(app, "Zona/Ma.md").scrollIntoViewIfNeeded();
  await row(app, "Zona/Ma.md").click();
  await row(app, "Zona/Mb.md").click({ modifiers: ["Meta"] });
  await expect.poll(() => selected(app)).toEqual(["Zona/Ma.md", "Zona/Mb.md"]);
  await dragOnto(app, row(app, "Zona/Mb.md"), folderRow(app, "Zona/Destino"));
  // One call for both: one plan over where everything ended.
  await expect.poll(async () => (await app.calls("move_entries")).length).toBe(1);
  expect((await app.calls("move_entries"))[0]).toEqual({ paths: ["Zona/Ma.md", "Zona/Mb.md"], folder: "Zona/Destino" });
  await expect.poll(() => app.files()).toEqual(expect.arrayContaining(["Zona/Destino/Ma.md", "Zona/Destino/Mb.md"]));
  expect(await app.files()).not.toContain("Zona/Ma.md");
  // Bare names stay bare: the names still say which notes they are, so
  // Ref needs no rewrite.
  expect(await app.file("Ref.md")).toBe("[[Ma]] e [[Mb]]\n");
  // The selection follows the rows where they went.
  await expect.poll(() => selected(app)).toEqual(["Zona/Destino/Ma.md", "Zona/Destino/Mb.md"]);
});

const menuEdit = (app, command) => app.page.evaluate((c) => window.__harness.emit("menu-edit", [window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? "main", c]), command);

test("⌘Z takes back the last move, ⌘⇧Z does it again (backlog 2026-11-02)", async ({ app }) => {
  await folderOf(app, { "Zona/Destino/Fica.md": "fica\n", "Zona/Ma.md": "a\n", "Zona/Mb.md": "b\n" });
  await folderRow(app, "Zona").evaluate((s) => {
    const d = s.parentElement;
    d.open = true;
    d.dispatchEvent(new Event("toggle"));
  });
  await row(app, "Zona/Ma.md").scrollIntoViewIfNeeded();
  await row(app, "Zona/Ma.md").click();
  await row(app, "Zona/Mb.md").click({ modifiers: ["Meta"] });
  await dragOnto(app, row(app, "Zona/Mb.md"), folderRow(app, "Zona/Destino"));
  await expect.poll(() => app.files()).toEqual(expect.arrayContaining(["Zona/Destino/Ma.md", "Zona/Destino/Mb.md"]));
  // Undo: both go back where they were, together.
  await menuEdit(app, "undo");
  await expect.poll(() => app.files()).toEqual(expect.arrayContaining(["Zona/Ma.md", "Zona/Mb.md"]));
  expect(await app.files()).not.toContain("Zona/Destino/Ma.md");
  await expect(app.page.locator("#status")).toContainText(/Movimento desfeito|Move undone/);
  // Redo: they move again; a second undo takes them back again.
  await menuEdit(app, "redo");
  await expect.poll(() => app.files()).toEqual(expect.arrayContaining(["Zona/Destino/Ma.md", "Zona/Destino/Mb.md"]));
  await menuEdit(app, "undo");
  await expect.poll(() => app.files()).toEqual(expect.arrayContaining(["Zona/Ma.md", "Zona/Mb.md"]));
  // Nothing left to undo: a third ⌘Z moves nothing.
  const calls = (await app.calls("move_entries")).length;
  await menuEdit(app, "undo");
  await app.page.waitForTimeout(200);
  expect((await app.calls("move_entries")).length).toBe(calls);
});

test("once a note's editor has had the focus, ⌘Z is the note's, not the move's", async ({ app }) => {
  await folderOf(app, { "Zona/Destino/Fica.md": "fica\n", "Zona/Ma.md": "a\n" });
  await folderRow(app, "Zona").evaluate((s) => {
    const d = s.parentElement;
    d.open = true;
    d.dispatchEvent(new Event("toggle"));
  });
  await row(app, "Zona/Ma.md").scrollIntoViewIfNeeded();
  await row(app, "Zona/Ma.md").click();
  await dragOnto(app, row(app, "Zona/Ma.md"), folderRow(app, "Zona/Destino"));
  await expect.poll(() => app.files()).toContain("Zona/Destino/Ma.md");
  // The moved note opened in Editar, the caret in it.
  await app.quickOpen("Ma");
  await app.key("Mod+e");
  await app.page.locator(".editor.live .cm-content").click();
  await expect(app.page.locator(".editor.live .cm-content")).toBeFocused();
  await menuEdit(app, "undo");
  await app.page.waitForTimeout(300);
  expect(await app.files()).toContain("Zona/Destino/Ma.md");
});

test("links written by path get one rewrite for the whole selection", async ({ app }) => {
  await folderOf(app, {
    "Velha/Pa.md": "a\n",
    "Velha/Pb.md": "b\n",
    "Nova/Fica.md": "fica\n",
    "Ref2.md": "[[Velha/Pa]] e [[Velha/Pb]]\n",
  });
  await folderRow(app, "Velha").evaluate((s) => {
    const d = s.parentElement;
    d.open = true;
    d.dispatchEvent(new Event("toggle"));
  });
  await row(app, "Velha/Pa.md").click({ modifiers: ["Meta"] });
  await row(app, "Velha/Pb.md").click({ modifiers: ["Meta"] });
  await row(app, "Velha/Pb.md").click({ button: "right" });
  await app.page.locator('.menu:not([hidden]) button[role="menuitem"]', { hasText: "Mover para…" }).click();
  const field = app.page.locator("input.new-note");
  await field.fill("Nova");
  await field.press("Enter");
  // One plan, one rewrite of Ref2 with both links.
  await expect(app.page.locator(".plan")).toBeVisible();
  await app.page.locator(".plan button.save").click();
  await expect.poll(() => app.file("Ref2.md")).toBe("[[Nova/Pa]] e [[Nova/Pb]]\n");
  expect(await app.files()).toEqual(expect.arrayContaining(["Nova/Pa.md", "Nova/Pb.md"]));
});

test("the selection's menu sends all of it to the bin, asked once", async ({ app }) => {
  await folderOf(app, { "Lx.md": "x\n", "Ly.md": "y\n", "Lz.md": "z\n" });
  await row(app, "Lx.md").click({ modifiers: ["Meta"] });
  await row(app, "Ly.md").click({ modifiers: ["Meta"] });
  await row(app, "Ly.md").click({ button: "right" });
  await app.page.locator('.menu:not([hidden]) button[role="menuitem"]', { hasText: "Mover para a lixeira" }).click();
  await expect(app.page.getByText("Mover 2 itens")).toBeVisible();
  await app.page.getByRole("button", { name: "Mover para a lixeira" }).last().click();
  await expect.poll(() => app.files()).not.toContain("Lx.md");
  const files = await app.files();
  expect(files).not.toContain("Ly.md");
  expect(files).toContain("Lz.md");
});
