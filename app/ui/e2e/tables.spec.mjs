// A table edited as a table in Edit mode (ADR 0064): typed into cell by
// cell, its keys, its `+`, its menu, and the Markdown it writes.

import { test, expect } from "./fixtures.mjs";

const text = (page) => page.evaluate(() => document.querySelector(".note-sheet .editor").__cmView.state.doc.toString());
const focused = (page) => page.evaluate(() => { const a = document.activeElement; return a?.classList.contains("cm-table-cell-input") ? `${a.dataset.r},${a.dataset.c}` : null; });

async function openNote(app, body) {
  await app.open();
  await app.writeOutside("Tab.md", body);
  await app.folderChanged(["Tab.md"], true);
  await app.quickOpen("Tab");
  await app.key("Mod+e");
  await expect(app.page.locator(".editor.live .cm-content")).toBeVisible();
}

test("a table made from / is a table: its header empty, typed into cell by cell", async ({ app, page }) => {
  await openNote(app, "Antes\n\n");
  await page.locator(".cm-content").click();
  await app.key("Mod+End");
  await page.keyboard.type("/tabela");
  await page.keyboard.press("Enter");
  await expect.poll(() => focused(page)).toBe("-1,0");
  for (const [i, word] of ["Nome", "Idade", "Cidade", "Ana", "30"].entries()) {
    if (i) await page.keyboard.press("Tab");
    await page.keyboard.type(word);
  }
  await page.keyboard.press("Enter");
  await page.keyboard.type("31");
  await expect.poll(() => text(page)).toBe("Antes\n\n| Nome | Idade | Cidade |\n| ---- | ----- | ------ |\n| Ana  | 30    |        |\n|      | 31    |        |");
  // Never the pipes on screen: the cells are a table's.
  await expect(page.locator(".cm-line", { hasText: "| Nome" })).toHaveCount(0);
  await expect(page.locator(".cm-table-editor th")).toHaveCount(3);
});

test("Tab past the last cell and Enter under the last row add a row; ⌘Z takes it back", async ({ app, page }) => {
  await openNote(app, "| a | b |\n| --- | --- |\n| 1 | 2 |\n");
  await page.locator(".cm-table-editor td").nth(1).click();
  await page.keyboard.press("Tab");
  await expect.poll(() => text(page)).toBe("| a   | b   |\n| --- | --- |\n| 1   | 2   |\n|     |     |\n");
  await expect.poll(() => focused(page)).toBe("1,0");
  await app.key("Mod+z");
  await expect.poll(() => text(page)).toBe("| a | b |\n| --- | --- |\n| 1 | 2 |\n");
});

test("the + buttons add a row and a column; the cell menu aligns and deletes", async ({ app, page }) => {
  await openNote(app, "| a | b |\n| --- | --- |\n| 1 | 2 |\n");
  await page.locator(".cm-table-editor").hover();
  await page.locator(".cm-table-add-col").click();
  await expect.poll(() => text(page)).toContain("| a   | b   |     |");
  await expect.poll(() => focused(page)).toBe("-1,2");
  await page.locator(".cm-table-add-row").click();
  await expect.poll(() => text(page)).toContain("\n|     |     |     |\n");
  await page.locator(".cm-table-editor td").nth(1).click({ button: "right" });
  await page.locator('.menu:not([hidden]) button[role="menuitem"]', { hasText: "Centralizar" }).click();
  await expect.poll(() => text(page)).toContain("| --- | :-: | --- |");
  await page.locator(".cm-table-editor th").nth(2).click({ button: "right" });
  await page.locator('.menu:not([hidden]) button[role="menuitem"]', { hasText: "Excluir coluna" }).click();
  await expect.poll(() => text(page)).toContain("| a   | b   |\n| --- | :-: |\n");
});

test("a | typed in a cell is written \\|; the arrows and Esc leave the table", async ({ app, page }) => {
  await openNote(app, "Antes\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nDepois\n");
  await page.locator(".cm-table-editor td").first().click();
  await page.keyboard.type(" | x");
  await expect.poll(() => text(page)).toContain("| 1 \\| x | 2   |");
  await page.keyboard.press("Escape");
  await expect.poll(() => focused(page)).toBe(null);
  // From the line above, ↓ goes into the header.
  await page.locator(".cm-line", { hasText: "Antes" }).click();
  await app.key("End");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => focused(page)).toBe("-1,0");
});

test("a table in a list stays text, as it was", async ({ app, page }) => {
  await openNote(app, "- item\n\n  | a | b |\n  | --- | --- |\n  | 1 | 2 |\n");
  await expect(page.locator(".cm-table-editor")).toHaveCount(0);
});

test("the toolbar shows the table's tools while a cell has the focus", async ({ app, page }) => {
  await openNote(app, "Antes\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n");
  const tools = page.locator(".toolbar .tool-table");
  await expect(tools).toBeHidden();
  await page.locator(".cm-table-editor td").nth(1).click();
  await expect(tools).toBeVisible();
  await tools.locator('[data-table="alignCenter"]').click();
  await expect.poll(() => text(page)).toContain("| --- | :-: |");
  await expect(tools.locator('[data-table="alignCenter"]')).toHaveAttribute("aria-pressed", "true");
  await tools.locator('[data-table="rowBelow"]').click();
  await expect.poll(() => text(page)).toContain("| 1   | 2   |\n|     |     |\n");
  await expect.poll(() => focused(page)).toBe("1,1");
  await tools.locator('[data-table="colLeft"]').click();
  await expect.poll(() => text(page)).toContain("| a   |     | b   |\n| --- | --- | :-: |\n");
  // The table is drawn anew and the cell takes the focus back on the next
  // frame: Esc leaves the cell the cursor is in.
  await expect.poll(() => focused(page)).toBe("1,1");
  await page.keyboard.press("Escape");
  await expect(tools).toBeHidden();
});

test("a column dragged wider keeps its width in Edit and in Reading, and the file does not change", async ({ app, page }) => {
  const body = "Antes\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n";
  await openNote(app, body);
  const th = page.locator(".cm-table-editor th").first();
  const before = await th.evaluate((e) => e.offsetWidth);
  const grip = th.locator(".table-col-grip");
  const box = await grip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => th.evaluate((e) => e.offsetWidth)).toBeGreaterThan(before + 100);
  const wide = await th.evaluate((e) => e.offsetWidth);
  // Kept by Verso, never written into the note (ADR 0064, revised 2026-10-07).
  expect(await app.file("Tab.md")).toBe(body);
  // Reading draws the same table at the same width.
  await page.getByRole("button", { name: "Leitura", exact: true }).click();
  const read = page.locator(".preview table th").first();
  await expect(read).toBeVisible();
  await expect.poll(() => read.evaluate((e) => e.offsetWidth)).toBe(wide);
  // And Edit again, the note's widget drawn anew.
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect.poll(() => page.locator(".cm-table-editor th").first().evaluate((e) => e.offsetWidth)).toBe(wide);
  expect(await app.file("Tab.md")).toBe(body);
});

test("a column dragged in Reading keeps its width when the note opens again", async ({ app, page }) => {
  const body = "| nome | cidade |\n| --- | --- |\n| Ana | Recife |\n";
  await app.open();
  await app.writeOutside("Larg.md", body);
  await app.folderChanged(["Larg.md"], true);
  await app.quickOpen("Larg");
  const th = page.locator(".preview table th").nth(1);
  await expect(th).toBeVisible();
  const before = await th.evaluate((e) => e.offsetWidth);
  const box = await th.locator(".table-col-grip").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => th.evaluate((e) => e.offsetWidth)).toBeGreaterThan(before + 120);
  const wide = await th.evaluate((e) => e.offsetWidth);
  await app.key("Mod+w");
  await app.quickOpen("Larg");
  await expect.poll(() => page.locator(".preview table th").nth(1).evaluate((e) => e.offsetWidth)).toBe(wide);
  expect(await app.file("Larg.md")).toBe(body);
});

test("a cell's field stays visible while its cell holds the focus, though the field itself does not (the window in the background)", async ({ app, page }) => {
  // The maintainer, 2026-10-31: select text in a cell, click in another app,
  // and the cell looked empty. WebKit drops :focus from the field with the
  // window in the background but keeps :focus-within on its cell; the field
  // was shown by :focus alone while the cell's own look hid under
  // :focus-within, so both were hidden. The browser cannot be sent to the
  // background here, so the same state is made: focus an element of the cell
  // other than the field.
  await openNote(app, "| nome | cidade |\n| --- | --- |\n| Ana | Recife |\n");
  const cell = page.locator(".cm-table-editor td").nth(1);
  await cell.click();
  await app.key("Mod+a");
  const field = cell.locator(".cm-table-cell-input");
  await expect(field).toBeFocused();
  await expect(field).toHaveCSS("opacity", "1");
  const state = await cell.evaluate((td) => {
    const other = document.createElement("button");
    other.type = "button";
    other.className = "test-other-focus";
    td.append(other);
    other.focus();
    const input = td.querySelector(".cm-table-cell-input");
    const view = td.querySelector(".cm-table-cell-view");
    return {
      within: td.matches(":focus-within"),
      fieldFocused: input.matches(":focus"),
      fieldOpacity: getComputedStyle(input).opacity,
      viewVisibility: getComputedStyle(view).visibility,
    };
  });
  expect(state.within).toBe(true);
  expect(state.fieldFocused).toBe(false);
  // The cell's look is hidden, so the field has to show.
  expect(state.viewVisibility).toBe("hidden");
  expect(state.fieldOpacity).toBe("1");
});
