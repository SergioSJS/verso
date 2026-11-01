// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A data file on the board (ADR 0057 point 10, ADR 0106): a file card of a
// .json, .yaml… shows the file's text, or its diagram when "Diagrama de
// dados" is on, switched on the card and kept in the node's own `verso`.
// The card only reads: no test here writes the data file. It used to be an
// empty box.

import { test, expect } from "./fixtures.mjs";

const NPCS = JSON.stringify(
  { campaign: "Aurora", npcs: [{ name: "Rowan", gear: { weapon: "sword" } }, { name: "Mira", gear: { weapon: "staff" } }] },
  null,
  2,
) + "\n";
const YAML_TEXT = "party:\n  - name: Rowan\n  - name: Mira\ncount: 2\n";
const BIG = `{"lines": [${Array.from({ length: 20000 }, (_, i) => `"linha numero ${i}"`).join(",\n")}]}\n`;

// The layout Obsidian writes (anything else asks to be rewritten first).
const BOARD = (nodes) => `{\n\t"nodes":[\n${nodes.map((n) => `\t\t${JSON.stringify(n)}`).join(",\n")}\n\t],\n\t"edges":[]\n}`;
const FILE = (id, file, y = 0, extra = {}) => ({ id, type: "file", file, x: 0, y, width: 520, height: 420, ...extra });

async function openBoard(app, page, files, nodes) {
  await app.open();
  for (const [p, text] of Object.entries({ ...files, "Mesa.canvas": BOARD(nodes) })) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(files).concat("Mesa.canvas"), true);
  await expect(page.locator("#notes")).toContainText("Mesa.canvas");
  await app.quickOpen("Mesa");
  await app.boardReady();
}

/** A button of a card that is not entered, pressed as a hand does: the
 *  board answers the pointer there, so the click goes to the point. */
async function press(page, locator) {
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const card = (page, id) => page.locator(`.board-card-slot[data-card="${id}"]`);
const verso = async (app, i = 0) => JSON.parse(await app.file("Mesa.canvas")).nodes[i].verso;

test("a .json file card shows the file's text, coloured, never an empty box; the file is not written", async ({ app, page }) => {
  await openBoard(app, page, { "dados.json": NPCS }, [FILE("d", "dados.json")]);
  const c = card(page, "d");
  const text = c.locator("[data-testid=board-data-text]");
  await expect(text).toContainText('"campaign": "Aurora"');
  await expect(text).toContainText('"weapon": "staff"');
  // The source editor's colours, once its language has loaded.
  await expect(text.locator("span[class^=tok-]").first()).toBeVisible();
  await expect(c.locator(".dg-box")).toHaveCount(0);
  await expect(c.locator("button.board-card-mode[data-mode=text]")).toHaveAttribute("aria-pressed", "true");
  await expect(c.locator("button.board-card-mode[data-mode=diagram]")).toHaveAttribute("aria-pressed", "false");
  expect(await app.file("dados.json")).toBe(NPCS);
  expect(await app.calls("write_text")).toHaveLength(0);
});

test("the card toggles to the diagram, the mode is kept in verso and survives a reload; the file is never written", async ({ app, page }) => {
  await openBoard(app, page, { "dados.json": NPCS }, [FILE("d", "dados.json")]);
  const c = card(page, "d");
  await expect(c.locator("[data-testid=board-data-text]")).toContainText("Aurora");
  await press(page, c.locator("button.board-card-mode[data-mode=diagram]"));
  await expect(c.locator(".dg-box").first()).toBeVisible();
  await expect(c.locator("[data-testid=board-data-text]")).toHaveCount(0);
  await expect(c.locator("button.board-card-mode[data-mode=diagram]")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => verso(app)).toEqual({ view: "diagram" });
  // The node is still a plain file node for Obsidian: only `verso` is added.
  const node = JSON.parse(await app.file("Mesa.canvas")).nodes[0];
  expect({ ...node, verso: undefined }).toEqual({ ...FILE("d", "dados.json"), verso: undefined });
  // Closed and opened again: still the diagram.
  await app.key("Mod+w");
  await app.quickOpen("Mesa");
  await app.boardReady();
  await expect(card(page, "d").locator(".dg-box").first()).toBeVisible();
  // Back to the text: the default is not written.
  await press(page, card(page, "d").locator("button.board-card-mode[data-mode=text]"));
  await expect(card(page, "d").locator("[data-testid=board-data-text]")).toContainText("Aurora");
  await expect.poll(() => verso(app)).toBeUndefined();
  expect(await app.file("dados.json")).toBe(NPCS);
  expect(await app.calls("write_text")).toHaveLength(0);
});

test("a diagram takes the pointer only while the card is entered: it pans without moving the card; Esc leaves", async ({ app, page }) => {
  await openBoard(app, page, { "dados.json": NPCS }, [FILE("d", "dados.json", 0, { verso: { view: "diagram" } })]);
  const c = card(page, "d");
  await expect(c.locator(".dg-box").first()).toBeVisible();
  const stage = c.locator(".dg-stage");
  const events = () => stage.evaluate((el) => getComputedStyle(el).pointerEvents);
  const layer = () => c.locator(".dg-layer").evaluate((el) => el.style.transform);
  const enter = c.locator("button.board-card-interact");
  await expect(enter).toHaveAttribute("aria-pressed", "false");
  expect(await events()).toBe("none");
  // Not entered, the diagram is no Tab stop and takes no key.
  expect(await c.locator(".board-card-dg-mount").evaluate((el) => el.inert)).toBe(true);
  const before = (await app.scene()).find((e) => e.id === "d");
  const wasLayer = await layer();
  await press(page, enter);
  await expect(enter).toHaveAttribute("aria-pressed", "true");
  await expect.poll(events).toBe("auto");
  expect(await c.locator(".board-card-dg-mount").evaluate((el) => el.inert)).toBe(false);
  // A drag on the stage's empty corner pans the diagram, not the card.
  const s = await stage.boundingBox();
  const x = s.x + s.width - 14;
  const y = s.y + s.height - 14;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 40, y - 30, { steps: 5 });
  await page.mouse.up();
  await expect.poll(layer).not.toBe(wasLayer);
  const after = (await app.scene()).find((e) => e.id === "d");
  expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
  // Esc leaves, and the board has the keyboard again.
  await page.keyboard.press("Escape");
  await expect(enter).toHaveAttribute("aria-pressed", "false");
  await expect.poll(events).toBe("none");
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest(".excalidraw"))).toBe(true);
});

test("a .yaml card has both views too, and Abrir opens the file in the mode the card shows", async ({ app, page }) => {
  await openBoard(app, page, { "grupo.yaml": YAML_TEXT }, [FILE("y", "grupo.yaml")]);
  const c = card(page, "y");
  await expect(c.locator("[data-testid=board-data-text]")).toContainText("party:");
  await press(page, c.locator("button.board-card-mode[data-mode=diagram]"));
  await expect(c.locator(".dg-box").first()).toBeVisible();
  await press(page, c.locator(".board-card-head button[aria-label^='Abrir']"));
  // The tab opens as the diagram, as the card shows it.
  await expect(page.locator(".leaf:visible .dg-box").first()).toBeVisible();
  expect(await app.file("grupo.yaml")).toBe(YAML_TEXT);
});

test("with Diagrama de dados off a data card is text only, with no toggle; on again brings it back", async ({ app, page }) => {
  await openBoard(app, page, { "dados.json": NPCS }, [FILE("d", "dados.json", 0, { verso: { view: "diagram" } })]);
  const c = card(page, "d");
  await expect(c.locator(".dg-box").first()).toBeVisible();
  const flip = async () => {
    await app.key("Mod+,");
    await page.locator(".settings-nav-item", { hasText: "Recursos" }).click();
    const row = page.locator(".setting", { has: page.locator(".setting-title", { hasText: /^Diagrama de dados$/ }) });
    await row.locator("label.switch").click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".settings:not([hidden])")).toHaveCount(0);
  };
  await flip();
  await expect(c.locator("[data-testid=board-data-text]")).toContainText("Aurora");
  await expect(c.locator(".dg-box")).toHaveCount(0);
  await expect(c.locator("button.board-card-mode")).toHaveCount(0);
  // The node still says diagram: switching the feature off changes no file.
  expect(await verso(app)).toEqual({ view: "diagram" });
  await flip();
  await expect(c.locator(".dg-box").first()).toBeVisible();
  await expect(c.locator("button.board-card-mode")).toHaveCount(2);
});

test("the card follows the file when it changes on disk, in both views", async ({ app, page }) => {
  await openBoard(app, page, { "dados.json": NPCS }, [FILE("d", "dados.json")]);
  const c = card(page, "d");
  await expect(c.locator("[data-testid=board-data-text]")).toContainText("Aurora");
  await app.writeOutside("dados.json", NPCS.replace("Aurora", "Crepusculo"));
  await app.folderChanged(["dados.json"]);
  await expect(c.locator("[data-testid=board-data-text]")).toContainText("Crepusculo");
  await press(page, c.locator("button.board-card-mode[data-mode=diagram]"));
  await expect(c.locator(".dg-box").first()).toBeVisible();
  await app.writeOutside("dados.json", NPCS.replace("Aurora", "Madrugada"));
  await app.folderChanged(["dados.json"]);
  await expect(c.locator(".dg-box", { hasText: "Madrugada" }).first()).toBeVisible();
});

test("a large file shows only its first 64 KB with an ellipsis", async ({ app, page }) => {
  await openBoard(app, page, { "grande.json": BIG }, [FILE("g", "grande.json")]);
  const c = card(page, "g");
  const text = c.locator("[data-testid=board-data-text]");
  await expect(text).toContainText("linha numero 0");
  await expect(c.locator(".board-card-cut")).toContainText("64 KB");
  const shown = await text.evaluate((el) => el.textContent.length);
  expect(shown).toBeLessThanOrEqual(64 * 1024);
  expect(await text.evaluate((el) => el.textContent.includes("linha numero 19999"))).toBe(false);
});

// (A sound file is not one of these any more: its card is the audio player, ADR 0116.)
test("a file with no body of its own says what it is, never an empty box", async ({ app, page }) => {
  await openBoard(app, page, { "dados.json": NPCS, "pacote.zip": "x", "tela.html": "<p>oi</p>", "outra.canvas": BOARD([]), "vista.base": "views: []\n" }, [
    FILE("a", "pacote.zip", 0),
    FILE("h", "tela.html", 500),
    FILE("c", "outra.canvas", 1000),
    FILE("b", "vista.base", 1500),
  ]);
  for (const id of ["a", "h", "c", "b"]) await expect(card(page, id).locator(".board-card-generic")).toContainText("abra-o", { timeout: 5000 });
});
