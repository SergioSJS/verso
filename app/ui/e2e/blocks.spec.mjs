// Blocks in Edit mode (ADR 0061): the handle beside a block, dragged by
// the pointer, clicked for the block menu; the `+`; Notion's keys; the
// settings; `[] ` and the Toggle of `/`.

import { test, expect } from "./fixtures.mjs";

const NOTE = "# Título\n\nPrimeiro parágrafo\ncom duas linhas.\n\n- item a\n- item b\n- item c\n\n1. um\n2. dois\n3. três\n\nÚltimo.\n";

async function openNote(app, text = NOTE) {
  await app.open();
  await app.writeOutside("Blocos.md", text);
  await app.folderChanged(["Blocos.md"], true);
  await app.quickOpen("Blocos");
  await expect(app.page.locator(".editor")).toBeAttached();
  await app.key("Mod+e");
  await expect(app.page.locator(".editor.live .cm-content")).toBeVisible();
}

/** The note's text as the editor holds it now. */
const text = (page) => page.evaluate(() => document.querySelector(".note-sheet .editor").__cmView.state.doc.toString());

/** Put the caret in the line holding `words`. */
async function caretIn(page, words) {
  await page.locator(".cm-line", { hasText: words }).first().click();
}

/** Hover a line and return the handle's grip, shown beside its block. */
async function gripOf(page, words) {
  const line = page.locator(".cm-line", { hasText: words }).first();
  const box = await line.boundingBox();
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  const grip = page.locator(".cm-block-grip");
  await expect(grip).toBeVisible();
  return grip;
}

/** Drag a block's grip to a line, by the pointer, landing before it (or
 *  after it with `below`), `dx` pixels to the right of the text's edge. */
async function dragTo(page, grip, words, { below = false, dx = 0 } = {}) {
  const g = await grip.boundingBox();
  const line = await page.locator(".cm-line", { hasText: words }).first().boundingBox();
  const content = await page.locator(".cm-content").boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  const y = below ? line.y + line.height + 2 : line.y + 2;
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(g.x + (content.x + dx - g.x) * (i / steps), g.y + (y - g.y) * (i / steps));
  }
  await page.mouse.up();
}

test("hovering a block shows the + and the handle in the margin, never over the text", async ({ app, page }) => {
  await openNote(app);
  const grip = await gripOf(page, "Primeiro parágrafo");
  const text0 = await page.locator(".cm-line", { hasText: "Primeiro parágrafo" }).boundingBox();
  const g = await grip.boundingBox();
  const plus = await page.locator(".cm-block-plus").boundingBox();
  expect(g.x + g.width).toBeLessThanOrEqual(text0.x);
  expect(plus.x + plus.width).toBeLessThanOrEqual(g.x + 1);
  // The outline takes the paragraph's two lines.
  const frame = await page.locator(".cm-block-outline").boundingBox();
  const second = await page.locator(".cm-line", { hasText: "com duas linhas" }).boundingBox();
  expect(frame.y + frame.height).toBeGreaterThanOrEqual(second.y + second.height - 1);
});

test("a paragraph dragged below a list moves whole, and one ⌘Z undoes it", async ({ app, page }) => {
  await openNote(app);
  const grip = await gripOf(page, "Primeiro parágrafo");
  await dragTo(page, grip, "Último.");
  await expect.poll(() => text(page)).toBe("# Título\n\n- item a\n- item b\n- item c\n\n1. um\n2. dois\n3. três\n\nPrimeiro parágrafo\ncom duas linhas.\n\nÚltimo.\n");
  await app.key("Mod+z");
  await expect.poll(() => text(page)).toBe(NOTE);
});

test("an item moved inside an ordered list renumbers it", async ({ app, page }) => {
  await openNote(app);
  const grip = await gripOf(page, "três");
  await dragTo(page, grip, "um");
  await expect.poll(() => text(page)).toContain("1. três\n2. um\n3. dois\n");
});

test("an item dragged to the right of the item above nests under it (S2)", async ({ app, page }) => {
  await openNote(app);
  const grip = await gripOf(page, "item c");
  await dragTo(page, grip, "item c", { dx: 30 });
  await expect.poll(() => text(page)).toContain("- item b\n  - item c\n");
});

test("Esc while dragging drops nothing", async ({ app, page }) => {
  await openNote(app);
  const grip = await gripOf(page, "Primeiro parágrafo");
  const g = await grip.boundingBox();
  const end = await page.locator(".cm-line", { hasText: "Último." }).boundingBox();
  await page.mouse.move(g.x + 5, g.y + 5);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(g.x + 5, g.y + 5 + ((end.y - g.y) * i) / 8);
  await expect(page.locator(".cm-block-drop")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".cm-block-drop")).toBeHidden();
  expect(await text(page)).toBe(NOTE);
});

test("the handle clicked opens the block menu: turn into, duplicate, delete", async ({ app, page }) => {
  await openNote(app);
  let grip = await gripOf(page, "Último.");
  await grip.click();
  await expect(page.locator(".menu:not([hidden])")).toBeVisible();
  await page.locator('.menu:not([hidden]) button[role="menuitem"]', { hasText: "Transformar em" }).click();
  await page.locator('.menu:not([hidden]) button[role="menuitem"]', { hasText: "Título 2" }).click();
  await expect.poll(() => text(page)).toContain("\n## Último.\n");
  grip = await gripOf(page, "item b");
  await grip.click();
  await page.locator('.menu:not([hidden]) button[role="menuitem"]', { hasText: "Duplicar" }).click();
  await expect.poll(() => text(page)).toContain("- item b\n- item b\n- item c");
  grip = await gripOf(page, "item a");
  await grip.click();
  await page.locator('.menu:not([hidden]) button[role="menuitem"]', { hasText: "Excluir" }).click();
  await expect.poll(() => text(page)).toContain("\n\n- item b\n- item b\n");
  expect(await text(page)).not.toContain("item a");
});

test("copy link to block writes one ^id at the block's end", async ({ app, page }) => {
  await openNote(app);
  const grip = await gripOf(page, "Primeiro parágrafo");
  await grip.click();
  await page.locator('.menu:not([hidden]) button[role="menuitem"]', { hasText: "Copiar link do bloco" }).click();
  await expect.poll(() => text(page)).toMatch(/com duas linhas\. \^[a-z0-9]{6}\n/);
});

test("Notion's keys: ⌘⇧↓ moves the block, ⌘D duplicates it, ⌘/ turns it into", async ({ app, page }) => {
  await openNote(app);
  await caretIn(page, "Primeiro parágrafo");
  await app.key("Mod+Shift+ArrowDown");
  await expect.poll(() => text(page)).toContain("- item c\n\nPrimeiro parágrafo\ncom duas linhas.\n\n1. um");
  await app.key("Mod+Shift+ArrowUp");
  await expect.poll(() => text(page)).toBe(NOTE);
  await caretIn(page, "Último.");
  await app.key("Mod+d");
  await expect.poll(() => text(page)).toContain("Último.\n\nÚltimo.");
  await app.key("Mod+/");
  await expect(page.locator('.menu:not([hidden]) button[role="menuitem"]', { hasText: "Tarefa" })).toBeVisible();
});

test("the keys leave a field alone: ⌘⇧↑ in the search box is the field's", async ({ app, page }) => {
  await openNote(app);
  await page.locator("#search").fill("abc");
  await page.locator("#search").press("ControlOrMeta+Shift+ArrowUp");
  expect(await text(page)).toBe(NOTE);
});

test("+ adds a block below with the / menu open; Esc takes it back", async ({ app, page }) => {
  await openNote(app);
  await gripOf(page, "Último.");
  await page.locator(".cm-block-plus").click();
  await expect(page.locator(".slash:not([hidden])")).toBeVisible();
  await expect.poll(() => text(page)).toBe(NOTE.replace("Último.\n", "Último.\n\n/\n"));
  await page.keyboard.press("Escape");
  await expect.poll(() => text(page)).toBe(NOTE);
  // On a list item, the new block is the list's next item.
  await gripOf(page, "três");
  await page.locator(".cm-block-plus").click();
  await expect(page.locator(".slash:not([hidden])")).toBeVisible();
  await expect.poll(() => text(page)).toContain("3. três\n4. /\n");
});

test("[] at a line's start becomes a task; / offers the Toggle", async ({ app, page }) => {
  await openNote(app, "Texto\n\n");
  await page.locator(".cm-content").click();
  await app.key("Mod+End");
  await page.keyboard.type("[] comprar pão");
  await expect.poll(() => text(page)).toContain("- [ ] comprar pão");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/recolh");
  await page.locator(".slash-item", { hasText: "Recolhível" }).click();
  await expect.poll(() => text(page)).toContain("> [!note]- ");
});

test("the settings: no handles when off; Enter starts a new block when on", async ({ app, page }) => {
  await page.addInitScript(() => {
    const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
    localStorage.setItem("verso.settings", JSON.stringify({ ...s, blockHandles: false, enterNewBlock: true }));
  });
  await openNote(app, "Um parágrafo\n");
  const line = await page.locator(".cm-line", { hasText: "Um parágrafo" }).first().boundingBox();
  await page.mouse.move(line.x + 30, line.y + 5);
  await expect(page.locator(".cm-block-handle")).toBeHidden();
  await caretIn(page, "Um parágrafo");
  await app.key("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Dois");
  await expect.poll(() => text(page)).toBe("Um parágrafo\n\nDois\n");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("linha");
  await expect.poll(() => text(page)).toBe("Um parágrafo\n\nDois\nlinha\n");
});

test("an empty line shows the + alone; it writes a block there with the / menu, Esc takes it back", async ({ app, page }) => {
  await openNote(app, "Um\n\n\n\nDois\n");
  const lines = page.locator(".cm-line");
  const empty = await lines.nth(2).boundingBox();
  await page.mouse.move(empty.x + 40, empty.y + empty.height / 2);
  await expect(page.locator(".cm-block-plus")).toBeVisible();
  await expect(page.locator(".cm-block-grip")).toBeHidden();
  await page.locator(".cm-block-plus").click();
  await expect(page.locator(".slash:not([hidden])")).toBeVisible();
  await expect.poll(() => text(page)).toBe("Um\n\n/\n\nDois\n");
  await page.keyboard.press("Escape");
  await expect.poll(() => text(page)).toBe("Um\n\n\n\nDois\n");
});
