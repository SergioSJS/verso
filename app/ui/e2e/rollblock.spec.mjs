// The roll block (ADR 0107, "As built" 2026-10-22): a roll of the Table is
// added to a note as a fenced `roll` block, drawn as a fixed card. Dragged
// from the panel by the pointer onto a note's text (Live and Source) or onto
// a board; or from the entry's "…" menu ("Adicionar à nota…", the phone's
// way). Screenshots for reading by eye go to $HOME/.cache/rollblock-shots
// (mounted by the runner), when the folder exists.

import { test, expect } from "./fixtures.mjs";
import { existsSync } from "node:fs";

const SHOTS = `${process.env.HOME ?? "/root"}/.cache/rollblock-shots`;
const shot = async (page, name) => {
  if (existsSync(SHOTS)) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;
const tag = (page) => (phone(page) ? "phone" : "desktop");

const MESA = ["# Mesa", "", "Ataque: `dice: 1d20+3`.", ""].join("\n");
const DIARIO = "# Diário\n\nTexto.\n\nFim.\n";
const BOARD = `{\n\t"nodes":[\n\t\t${JSON.stringify({ id: "t", type: "text", text: "Anotações", x: -500, y: -300, width: 200, height: 80 })}\n\t],\n\t"edges":[]\n}`;
/** The block as the note holds it, for a roll of `1d20+3` made in the note Mesa. */
const BLOCK = /```roll\nquem: Você · quando: \d{4}-\d\d-\d\d \d\d:\d\d · onde: \[\[Mesa\]\]\n1d20\+3 → \[(\d+)\] \+ 3 = (\d+)\n```/;

/** The folder open, a roll made in Mesa, the panel on its Mesa tab. */
async function setup(app, page) {
  await app.open();
  await app.writeOutside("Mesa.md", MESA);
  await app.writeOutside("Lobos.md", "# Lobos\n");
  await app.writeOutside("Diario.md", DIARIO);
  await app.writeOutside("Quadro.canvas", BOARD);
  await app.folderChanged(["Mesa.md", "Lobos.md", "Diario.md", "Quadro.canvas"], true);
  await app.quickOpen("Mesa");
  if (phone(page)) await page.locator(".bar-right").click();
  else await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  await expect(view).toBeVisible();
  if (phone(page)) await page.locator(".bar-right").click();
  await page.locator(".preview:visible").getByRole("button", { name: "Rolar 1d20+3" }).click();
  if (phone(page)) await page.locator(".bar-right").click();
  await expect(view.locator(".table-entry")).toHaveCount(1);
  return view;
}

const doc = (page) => page.evaluate(() => document.querySelector(".note-sheet .editor").__cmView.state.doc.toString());

/** The note open in the editing view. */
async function editing(app, page, name) {
  await app.quickOpen(name);
  await page.getByRole("button", { name: "Editar", exact: true }).first().click();
  await expect(page.locator(".editor.live .cm-content")).toBeVisible();
}

/** A pointer drag from the entry to a point, stopping before the release when `hold`.
 *  `to` is a point or a function that reads it once the drag is under way: the editor
 *  lays its lines out again as the drag begins, and a point taken before is stale. */
async function dragTo(page, entry, to, { hold = false } = {}) {
  const box = await entry.boundingBox();
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + box.height / 2 - 12, { steps: 3 });
  await page.mouse.move(700, 450, { steps: 6 });
  const { x, y } = typeof to === "function" ? await to() : to;
  await page.mouse.move(x, y, { steps: 12 });
  if (!hold) await page.mouse.up();
}

test("a roll dragged from the table into a note in Live becomes a card, in one undo step; Source shows the text; Reading the card", async ({ app, page }) => {
  test.skip(phone(page), "the phone adds by the entry's menu");
  const view = await setup(app, page);
  const entry = view.locator(".table-entry").first();
  const total = (await entry.locator(".table-total").textContent()) ?? "";
  await editing(app, page, "Diario");
  const line = page.locator(".cm-line", { hasText: "Fim." }).first();
  // Mid-drag: the ghost follows the pointer and a caret shows where the block will land.
  await dragTo(
    page,
    entry,
    async () => {
      const at = await line.boundingBox();
      return { x: at.x + at.width / 2, y: at.y + at.height - 3 };
    },
    { hold: true },
  );
  await expect(page.locator(".drag-ghost")).toBeVisible();
  await expect(page.locator(".roll-drop-caret")).toBeVisible();
  await shot(page, `${tag(page)}-1-dragging`);
  await page.mouse.up();
  await expect(page.locator(".roll-drop-caret")).toHaveCount(0);
  // The text of the note: the block, between blank lines, as the format says.
  const text = await doc(page);
  expect(text).toMatch(new RegExp(`^# Diário\\n\\nTexto\\.\\n\\nFim\\.\\n\\n${BLOCK.source}\\n$`));
  expect(BLOCK.exec(text)[2]).toBe(total);
  // Live: a fixed card in place of the code.
  const card = page.locator(".cm-lp-roll .rb-card");
  await expect(card).toBeVisible();
  await expect(card.locator(".rb-who")).toHaveText("Você");
  await expect(card.locator(".rb-where")).toHaveText("Mesa");
  await expect(card.locator(".rb-notation")).toHaveText("1d20+3");
  await expect(card.locator(".rb-total")).toHaveText(total);
  await expect(card.locator(".rb-die")).toHaveCount(1);
  await shot(page, `${tag(page)}-2-live-card`);
  // The file is the block and nothing else changed.
  await expect.poll(async () => await app.file("Diario.md")).toBe(text);
  // Source: the text itself.
  await page.getByRole("button", { name: "Fonte", exact: true }).first().click();
  await expect(page.locator(".editor .cm-content")).toContainText("```roll");
  await expect(page.locator(".editor .cm-content")).toContainText("1d20+3 →");
  await expect(page.locator(".rb-card:visible")).toHaveCount(0);
  await shot(page, `${tag(page)}-3-source`);
  // Reading: the card again, its note a link.
  await page.getByRole("button", { name: "Leitura", exact: true }).first().click();
  const reading = page.locator(".preview:visible .rb-card");
  await expect(reading).toBeVisible();
  await expect(reading.locator(".rb-total")).toHaveText(total);
  await expect(page.locator(".preview:visible pre")).toHaveCount(0);
  await shot(page, `${tag(page)}-4-reading`);
  // One undo takes the whole block away.
  await page.getByRole("button", { name: "Editar", exact: true }).first().click();
  await expect(page.locator(".editor.live .cm-content")).toBeVisible();
  await page.locator(".cm-line", { hasText: "Fim." }).first().click();
  await app.key("Mod+z");
  await expect.poll(() => doc(page)).toBe(DIARIO);
  await expect(page.locator(".rb-card:visible")).toHaveCount(0);
});

test("a roll dropped between two paragraphs of a note lands there, with a blank line each side", async ({ app, page }) => {
  test.skip(phone(page), "the phone adds by the entry's menu");
  const view = await setup(app, page);
  await editing(app, page, "Diario");
  const line = page.locator(".cm-line", { hasText: "Texto." }).first();
  await dragTo(page, view.locator(".table-entry").first(), async () => {
    const at = await line.boundingBox();
    return { x: at.x + 10, y: at.y + 2 };
  });
  const text = await doc(page);
  expect(text).toMatch(new RegExp(`^# Diário\\n\\n${BLOCK.source}\\n\\nTexto\\.\\n\\nFim\\.\\n$`));
});

test("a roll dropped on a board is a text card that holds the block, drawn as the card", async ({ app, page }) => {
  test.skip(phone(page), "the phone adds by the entry's menu");
  const view = await setup(app, page);
  await app.quickOpen("Quadro");
  await app.boardReady();
  const canvas = page.locator(".board-canvas:visible").first();
  const box = await canvas.boundingBox();
  await dragTo(page, view.locator(".table-entry").first(), { x: box.x + box.width / 2, y: box.y + box.height / 2 + 60 });
  const slot = page.locator(".board-card-slot .rb-card");
  await expect(slot).toBeVisible();
  await expect(slot.locator(".rb-notation")).toHaveText("1d20+3");
  await shot(page, `${tag(page)}-5-board`);
  await expect
    .poll(async () => {
      const nodes = JSON.parse((await app.file("Quadro.canvas")) ?? "{}").nodes ?? [];
      return nodes.find((n) => typeof n.text === "string" && n.text.includes("```roll"))?.text ?? "";
    })
    .toMatch(new RegExp(`^${BLOCK.source}$`));
});

test("the entry has no add button; its menu adds the same block to the note chosen, shown first @layout", async ({ app, page }) => {
  const view = await setup(app, page);
  const entry = view.locator(".table-entry").first();
  await expect(view.locator(".table-add")).toHaveCount(0);
  await entry.getByRole("button", { name: /^Ações da entrada/ }).click();
  await page.getByRole("menuitem", { name: "Adicionar à nota…" }).click();
  const combo = page.getByRole("combobox", { name: "Abrir…" });
  await combo.fill("Diario");
  await expect(page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText("Diario");
  await combo.press("Enter");
  const box = page.locator(".confirm-box");
  await expect(box).toContainText('ao fim de "Diario"');
  await expect(box).toContainText("```roll");
  await expect(box).toContainText("onde: [[Mesa]]");
  await shot(page, `${tag(page)}-6-menu-ask`);
  await box.getByRole("button", { name: "Cancelar" }).click();
  expect(await app.file("Diario.md")).toBe(DIARIO);
  await entry.getByRole("button", { name: /^Ações da entrada/ }).click();
  await page.getByRole("menuitem", { name: "Adicionar à nota…" }).click();
  await combo.fill("Diario");
  await expect(page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText("Diario");
  await combo.press("Enter");
  await page.locator(".confirm-box").getByRole("button", { name: "Adicionar" }).click();
  await expect.poll(async () => await app.file("Diario.md")).toMatch(new RegExp(`^${DIARIO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n${BLOCK.source}\\n$`));
});

test("Reading draws a written roll block as a card, and a block that does not read stays code", async ({ app, page }) => {
  await app.open();
  const good = "```roll\nquem: Ana · quando: 2026-10-22 21:40 · onde: [[Lobos]]\n4d6dl1 → [6, 5, 3, ~2] + 2 = 16\ndados: #1d9e75 #f4f7f5 #0c3527\n```\n";
  await app.writeOutside("Lobos.md", "# Lobos\n");
  await app.writeOutside("Ficha.md", `# Ficha\n\n${good}\n\`\`\`roll\nisto não é uma rolagem\n\`\`\`\n`);
  await app.folderChanged(["Lobos.md", "Ficha.md"], true);
  await app.quickOpen("Ficha");
  const card = page.locator(".preview:visible .rb-card");
  await expect(card).toHaveCount(1);
  await expect(card.locator(".rb-who")).toHaveText("Ana");
  await expect(card.locator(".rb-when")).toHaveText("2026-10-22 21:40");
  await expect(card.locator(".rb-where")).toHaveText("Lobos");
  await expect(card.locator(".rb-die")).toHaveCount(4);
  await expect(card.locator(".rb-die.dropped")).toHaveCount(1);
  await expect(card.locator(".rb-die").first()).toHaveCSS("background-color", "rgb(29, 158, 117)");
  await expect(card.locator(".rb-total")).toHaveText("16");
  // The malformed one is the code it is.
  await expect(page.locator(".preview:visible pre code")).toContainText("isto não é uma rolagem");
  await shot(page, `${tag(page)}-7-reading-written`);
  // The card's note is a link.
  await card.locator(".rb-where").click();
  await expect(page.locator(".tabs .tab.active, .tab[aria-selected=true]").first()).toContainText("Lobos");
});
