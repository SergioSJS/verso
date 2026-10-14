// The hover preview (ADR 0085), as the demo vault teaches it in note 02,
// "Prévia ao Passar o Mouse": the note a link names in a card where the
// pointer rests — in Reading on a plain hover, in Edit with ⌘ or Ctrl
// held — scrolled to its heading or block; a missing note said, and made
// by no hover; the panel's rows, the graph's nodes, a board's card; the
// command's card a dialog that Escape closes, the focus given back; the
// setting off; a finger's card above Open and Edit link.

import { test, expect } from "./fixtures.mjs";

const LINKS = "02 - Links, Âncoras e Notas Incorporadas";
const card = (page) => page.locator(".hover-preview");

/** Rest the pointer on `locator`, a moment after arriving on it. */
async function rest(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  await page.mouse.move(b.x + Math.min(8, b.width / 2), b.y + b.height / 2);
  await page.mouse.move(b.x + Math.min(10, b.width / 2), b.y + b.height / 2);
}

/** The pointer in the window's corner, where no card ever lies (a card
 *  keeps a margin from the edges). */
async function away(page) {
  await page.mouse.move(4, 4);
  await page.mouse.move(3, 3);
}

/** Note 02 in Reading, the way the tutorial opens it. */
async function links(app, page) {
  await app.open();
  await app.quickOpen(LINKS);
  await expect(page.locator(".leaf:not([hidden]) .preview a.wikilink").first()).toBeVisible();
}

test("Reading: a link rested on shows its note, at its heading; away, the card goes; a click opens the note", async ({ app, page }) => {
  await links(app, page);
  const link = page.locator(".leaf:not([hidden]) .preview a.wikilink", { hasText: "as fórmulas do Guia de Sintaxe" });
  await rest(page, link);
  // Not at once: half a second of rest.
  await page.waitForTimeout(150);
  await expect(card(page)).toHaveCount(0);
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toHaveAttribute("role", "dialog");
  await expect(card(page)).toHaveAttribute("aria-label", "Prévia de 01 - Guia de Markdown e Sintaxe › Fórmulas Matemáticas em KaTeX");
  // The heading the link names, marked and scrolled into the card's view.
  const target = card(page).locator(".hover-preview-target");
  await expect(target).toHaveText(/Fórmulas Matemáticas em KaTeX/);
  await expect(target).toBeInViewport();
  // The hover takes no focus from the note.
  expect(await page.evaluate(() => document.activeElement?.closest(".hover-preview") === null)).toBe(true);
  // Away from the link and the card: gone.
  await away(page);
  await expect(card(page)).toHaveCount(0);
  // Back, into the card, and a click: the note opens, the card goes.
  await rest(page, link);
  await expect(card(page)).toBeVisible();
  await card(page).locator(".hover-preview-head").click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('.pane.focused .tab[aria-selected="true"]')).toContainText("01 - Guia de Markdown");
});

test("Reading: a link to a block shows the block marked; a missing note is said, and no note is made", async ({ app, page }) => {
  await links(app, page);
  await rest(page, page.locator(".leaf:not([hidden]) .preview a.wikilink", { hasText: "a descoberta da escrita atômica" }));
  await expect(card(page).locator(".hover-preview-target")).toContainText("Escrita Atômica");
  await rest(page, page.locator(".leaf:not([hidden]) .preview a.wikilink", { hasText: "Nova Ideia de Projeto" }));
  await expect(card(page).locator(".hover-preview-message")).toHaveText(/Nenhuma nota responde por \[\[Nova Ideia de Projeto\]\] ainda/);
  expect(await app.file("Nova Ideia de Projeto.md")).toBeNull();
});

test("Edit mode: a plain hover shows nothing; with ⌘ or Ctrl held, the card", async ({ app, page }) => {
  const TEXT = "Veja [[00 - Bem-vindo ao Verso]] aqui.\n\nE [o guia](01%20-%20Guia%20de%20Markdown%20e%20Sintaxe.md) também.\n";
  await app.open();
  await app.writeOutside("Ligações.md", TEXT);
  await app.folderChanged(["Ligações.md"], true);
  await app.quickOpen("Ligações");
  await app.key("Mod+e");
  const link = page.locator(".cm-lp-wikilink", { hasText: "00 - Bem-vindo ao Verso" }).first();
  await rest(page, link);
  await page.waitForTimeout(900);
  await expect(card(page)).toHaveCount(0);
  // ⌘ pressed with the pointer resting there.
  await page.keyboard.down("Control");
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toHaveAttribute("aria-label", "Prévia de 00 - Bem-vindo ao Verso");
  await page.keyboard.up("Control");
  await page.keyboard.press("Escape");
  await expect(card(page)).toHaveCount(0);
  // A Markdown link to a note of the folder, the same way.
  await away(page);
  const md = page.locator(".cm-lp-link", { hasText: "o guia" }).first();
  await rest(page, md);
  await page.keyboard.down("Control");
  await expect(card(page)).toHaveAttribute("aria-label", "Prévia de 01 - Guia de Markdown e Sintaxe");
  await page.keyboard.up("Control");
  await page.keyboard.press("Escape");
  expect(await app.file("Ligações.md")).toBe(TEXT);
});

test("the command: the link at the cursor in a dialog with the focus; Escape gives the focus back", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Ligações.md", "Veja [[00 - Bem-vindo ao Verso]] aqui.\n");
  await app.folderChanged(["Ligações.md"], true);
  await app.quickOpen("Ligações");
  await app.key("Mod+e");
  // The cursor in the link (a plain click in Edit places it).
  await page.locator(".cm-lp-wikilink", { hasText: "00 - Bem-vindo ao Verso" }).first().click();
  await app.command("Ver a prévia do link sob o cursor");
  const dialog = page.getByRole("dialog", { name: "Prévia de 00 - Bem-vindo ao Verso" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  // The pointer moving off does not close a card opened from the keys.
  await away(page);
  await page.waitForTimeout(500);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator(".leaf:not([hidden]) .cm-content")).toBeFocused();
  // Nothing under the cursor: said.
  await page.keyboard.press("End");
  await app.command("Ver a prévia do link sob o cursor");
  await expect(page.locator("#status")).toHaveText("Nenhum link sob o cursor para mostrar.");
  await expect(card(page)).toHaveCount(0);
});

test("the setting off: no card on a hover, the command still shows it", async ({ app, page }) => {
  await page.addInitScript(() => {
    const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
    localStorage.setItem("verso.settings", JSON.stringify({ ...s, hoverPreview: false }));
  });
  await links(app, page);
  const link = page.locator(".leaf:not([hidden]) .preview a.wikilink", { hasText: "as fórmulas do Guia de Sintaxe" });
  await rest(page, link);
  await page.waitForTimeout(1000);
  await expect(card(page)).toHaveCount(0);
  await link.focus();
  await app.command("Ver a prévia do link sob o cursor");
  await expect(card(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(link).toBeFocused();
});

test("the panel's backlinks and the graph's nodes preview their notes", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("01 - Guia de Markdown");
  await app.key("Mod+Alt+ArrowRight");
  await page.locator("#verso-right-backlinks").click();
  const row = page.locator(".links-back button.row", { hasText: LINKS }).first();
  await expect(row).toBeVisible();
  await rest(page, row);
  await expect(card(page)).toHaveAttribute("aria-label", `Prévia de ${LINKS}`);
  await away(page);
  await expect(card(page)).toHaveCount(0);
  await app.key("Mod+Shift+g");
  const node = page.locator(`svg.graph g.node[data-id="${LINKS}.md"]`);
  await expect(node).toBeVisible();
  // The graph settles before its node is still under the pointer.
  await page.waitForTimeout(1500);
  await rest(page, node.locator("circle"));
  await expect(card(page)).toHaveAttribute("aria-label", `Prévia de ${LINKS}`);
});

test("a board's card previews its note from its name", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("Board de Demonstração");
  await app.boardReady();
  const name = page.locator('.board-card-title[data-preview-path="projetos/Projeto Alpha.md"]').first();
  await expect(name).toBeVisible();
  const b = await name.boundingBox();
  await page.mouse.move(b.x + 4, b.y + b.height / 2);
  await page.mouse.move(b.x + 6, b.y + b.height / 2);
  await expect(card(page)).toHaveAttribute("aria-label", "Prévia de Projeto Alpha");
  // Off the card's name, onto the board: gone.
  const board = await page.locator(".board-canvas").boundingBox();
  await page.mouse.move(board.x + board.width - 20, board.y + board.height / 2);
  await page.mouse.move(board.x + board.width - 22, board.y + board.height / 2);
  await expect(card(page)).toHaveCount(0);
});

test.describe("by touch", () => {
  test.skip(({ browserName, hasTouch }) => browserName !== "chromium" || !hasTouch, "a finger moves only in Chromium with touch");

  test("Edit mode: the link card shows the note above Open and Edit link @layout", async ({ app, page }) => {
    await app.open();
    await app.writeOutside("Ligações.md", "Veja [[00 - Bem-vindo ao Verso]] aqui.\n");
    await app.folderChanged(["Ligações.md"], true);
    await app.quickOpen("Ligações");
    await app.key("Mod+e");
    await page.locator(".cm-lp-wikilink", { hasText: "00 - Bem-vindo ao Verso" }).first().tap();
    const linkCard = page.locator(".cm-link-card");
    await expect(linkCard.locator(".cm-link-card-preview .hover-preview-title")).toHaveText("00 - Bem-vindo ao Verso");
    await expect(linkCard.locator(".cm-link-card-preview .hover-preview-body")).toContainText("Verso");
    await expect(linkCard.getByRole("button", { name: "Abrir" })).toBeVisible();
    await expect(linkCard.getByRole("button", { name: "Editar link" })).toBeVisible();
  });

  test("the graph: a finger held still on a node shows its note, and opens nothing @layout", async ({ app, page }) => {
    await app.open();
    await app.quickOpen(LINKS);
    await app.command("Grafo do cofre");
    const node = page.locator(`svg.graph g.node[data-id="${LINKS}.md"] circle`);
    await expect(node).toBeVisible();
    await page.waitForTimeout(1500);
    const b = await node.boundingBox();
    const tabs = await page.locator(".pane.focused .tab").count();
    const cdp = await page.context().newCDPSession(page);
    const at = [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at });
    await page.waitForTimeout(700);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await expect(card(page)).toHaveAttribute("aria-label", `Prévia de ${LINKS}`);
    // The lift was the press's: the graph is still in front, no note opened.
    await expect(page.locator('.pane.focused .tab[aria-selected="true"]')).toContainText(/Grafo/);
    expect(await page.locator(".pane.focused .tab").count()).toBe(tabs);
  });
});
