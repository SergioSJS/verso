// Maps on the board (ADR 0090), as the tutorial's "Treino do Board" teaches
// them: a picture used as a map (locked, at the back), pins that keep their
// size at any zoom and open their note on a click and preview it on hover,
// "Send to back" and "Bring to front", a note dropped on a map pinned
// there, a large picture drawn from tiles and never loaded whole, secret
// cards (a lock for a writer, the writer's "view as a reader", left out of
// what a reader receives) and the pins as a list in the outline.

import { test, expect } from "./fixtures.mjs";

/** A 1x1 PNG: the map's picture. */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==";

/** A canvas as Verso writes one: a container of scalars on one line, any
 *  other one entry per line, tabs, no final newline (the harness's own). */
function layout(value, depth = 0) {
  const scalar = (v) => v === null || typeof v !== "object";
  const tab = (n) => "\t".repeat(n);
  if (Array.isArray(value)) {
    if (value.every(scalar)) return `[${value.map((v) => layout(v, depth + 1)).join(",")}]`;
    return `[\n${value.map((v) => tab(depth + 1) + layout(v, depth + 1)).join(",\n")}\n${tab(depth)}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.every(([, v]) => scalar(v))) return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${layout(v, depth + 1)}`).join(",")}}`;
    return `{\n${entries.map(([k, v]) => `${tab(depth + 1)}${JSON.stringify(k)}:${layout(v, depth + 1)}`).join(",\n")}\n${tab(depth)}}`;
  }
  return JSON.stringify(value);
}

const canvas = (nodes, extra = {}) => layout({ nodes, edges: [], ...extra });

const MAP = { id: "mapa", type: "file", file: "Mapa.png", x: 0, y: 0, width: 1000, height: 800, verso: { map: true, locked: true, groups: ["g"] } };
const TAVERNA = { id: "taverna", type: "file", file: "Taverna.md", x: 300, y: 300, width: 32, height: 32, verso: { pin: true, groups: ["g"] } };
const CRIPTA = { id: "cripta", type: "file", file: "Cripta.md", x: 700, y: 500, width: 32, height: 32, verso: { pin: true, secret: true, groups: ["g"] } };
const BOARD = canvas([MAP, TAVERNA, CRIPTA]);

const mark = (page, id) => page.locator(`.board-pin[data-pin="${id}"] .board-pin-mark`);
const nodesOf = async (app, path = "Mapa.canvas") => JSON.parse(await app.file(path)).nodes;
const nodeOf = async (app, id, path) => (await nodesOf(app, path)).find((n) => n.id === id);

async function putPicture(app, path, b64 = PNG) {
  await app.page.evaluate(([p, b]) => window.__harness.core.put(p, Uint8Array.from(atob(b), (c) => c.charCodeAt(0))), [path, b64]);
}

async function openBoard(app, text = BOARD, { query = "", large } = {}) {
  await app.open(query);
  if (large) await app.page.evaluate(([p, size]) => window.__harness.core.maps.big.set(p, size), ["Mapa.png", large]);
  await putPicture(app, "Mapa.png");
  await app.writeOutside("Taverna.md", "# Taverna\n\nO barão governa o distrito norte.\n");
  await app.writeOutside("Cripta.md", "# Cripta\n\nO que dorme sob a cidade.\n");
  await app.writeOutside("Alvo.md", "# Alvo\n");
  await app.writeOutside("Mapa.canvas", text);
  await app.folderChanged(["Mapa.canvas", "Taverna.md", "Cripta.md", "Alvo.md", "Mapa.png"], true);
  await expect(app.page.locator("#notes")).toContainText("Mapa.canvas");
  await app.quickOpen("Mapa");
  await app.boardReady();
}

/** The middle of a pin's mark on the page, and its size. */
async function markBox(page, id) {
  const b = await mark(page, id).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
}

/** The board's view set to a zoom, looking at the point (x, y) of the board. */
async function look(app, zoom, x, y) {
  // The view is the user's from their first touch: until then the board
  // follows its pane and shows all of itself again.
  await app.page.evaluate(() => document.querySelector(".board-canvas").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  await app.page.evaluate(
    ([z, px, py]) => {
      const a = window.__VERSO_TEST__.board;
      const s = a.getAppState();
      a.updateScene({ appState: { zoom: { value: z }, scrollX: s.width / (2 * z) - px, scrollY: s.height / (2 * z) - py } });
    },
    [zoom, x, y],
  );
  const now = await app.settledView();
  if (Math.abs(now.zoom - zoom) > 0.01) throw new Error(`the view is at ${now.zoom}, not ${zoom}`);
}

const bySave = async (app, check) => expect.poll(check, { timeout: 8000 }).toBeTruthy();

test("a pin keeps its size at any zoom and stays on its point", async ({ app, page }) => {
  await openBoard(app);
  await expect(page.locator(".board-pin")).toHaveCount(2);
  const sizes = [];
  for (const z of [0.3, 1, 3]) {
    await look(app, z, 316, 316);
    const m = await markBox(page, "taverna");
    const where = await app.toPage(316, 316);
    sizes.push(Math.round(m.w));
    expect(Math.abs(m.x - where.x), `zoom ${z}: the mark is on its point`).toBeLessThan(2);
    expect(Math.abs(m.y - where.y)).toBeLessThan(2);
  }
  expect(new Set(sizes).size, `one size at every zoom: ${sizes}`).toBe(1);
  expect(await app.calls("write_board")).toEqual([]);
});

test("a click on a pin opens its note; Tab reaches it, named after its note, and Enter opens it too", async ({ app, page }) => {
  await openBoard(app);
  await look(app, 1, 316, 316);
  const m = await markBox(page, "taverna");
  await page.mouse.click(m.x, m.y);
  await expect(page.locator('.pane.focused .tab[aria-selected="true"]')).toContainText("Taverna");
  // Nothing of the click is written to the board.
  expect(await app.calls("write_board")).toEqual([]);
  await app.quickOpen("Mapa");
  await app.boardReady();
  const pin = page.getByRole("button", { name: "Abrir Taverna" });
  await pin.focus();
  await expect(pin).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('.pane.focused .tab[aria-selected="true"]')).toContainText("Taverna");
});

test("a pin rested on previews its note; away, the card goes", async ({ app, page }) => {
  await openBoard(app);
  await look(app, 1, 316, 316);
  const m = await markBox(page, "taverna");
  await page.mouse.move(m.x - 3, m.y);
  await page.mouse.move(m.x, m.y);
  await expect(page.locator(".hover-preview")).toBeVisible();
  await expect(page.locator(".hover-preview")).toContainText("O barão governa");
  await page.mouse.move(4, 4);
  await page.mouse.move(3, 3);
  await expect(page.locator(".hover-preview")).toHaveCount(0);
});

test("a pin dragged moves where the board is written; a click that does not move writes nothing", async ({ app, page }) => {
  await openBoard(app);
  await look(app, 1, 316, 316);
  const before = await nodeOf(app, "taverna");
  const m = await markBox(page, "taverna");
  await page.mouse.move(m.x, m.y);
  await page.mouse.down();
  await page.mouse.move(m.x + 60, m.y + 30, { steps: 6 });
  await page.mouse.up();
  await bySave(app, async () => (await nodeOf(app, "taverna")).x !== before.x);
  const after = await nodeOf(app, "taverna");
  expect(after.x - before.x).toBeGreaterThan(55);
  expect(after.x - before.x).toBeLessThan(65);
  expect(after.y - before.y).toBeGreaterThan(25);
  // The pin stays a pin of the map's group.
  expect(after.verso).toEqual({ pin: true, groups: ["g"] });
  // Still no tab opened by a drag.
  await expect(page.locator(".tab")).toHaveCount(1);
});

test("Delete on a focused pin removes it, and the history brings it back", async ({ app, page }) => {
  await openBoard(app);
  await expect(page.locator(".board-pin")).toHaveCount(2);
  await page.getByRole("button", { name: "Abrir Taverna" }).focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".board-pin")).toHaveCount(1);
  await expect(page.locator("#status")).toContainText("removido do mapa");
  await bySave(app, async () => !(await nodesOf(app)).some((n) => n.id === "taverna"));
  // The focus is back on the board: ⌘Z reaches it.
  await app.key("Mod+z");
  await expect(page.locator(".board-pin")).toHaveCount(2);
});

test("a picture used as a map is locked, at the back and marked; stopping undoes the three", async ({ app, page }) => {
  const picture = { id: "foto", type: "file", file: "Mapa.png", x: 0, y: 0, width: 600, height: 400 };
  const card = { id: "nota", type: "text", text: "Uma nota", x: 700, y: 0, width: 200, height: 80 };
  await openBoard(app, canvas([card, picture]));
  await app.select("foto");
  await page.getByTestId("board-tool-map").click();
  await bySave(app, async () => (await nodeOf(app, "foto"))?.verso?.map === true);
  const nodes = await nodesOf(app);
  expect(nodes[0].id, "sent to the bottom").toBe("foto");
  expect(nodes[0].verso).toMatchObject({ map: true, locked: true });
  // Locked: a drag over it does not move it.
  const v = await app.view();
  await page.mouse.move(v.left + 200, v.top + 300);
  await page.mouse.down();
  await page.mouse.move(v.left + 300, v.top + 340, { steps: 5 });
  await page.mouse.up();
  expect((await app.scene()).find((e) => e.id === "foto").x).toBe(0);
  // The outline lists the map and the way back; a locked picture cannot be selected for it.
  await page.getByTestId("board-tool-outline").click();
  const panel = page.getByTestId("board-maps-panel");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Deixar de usar como mapa" }).click();
  await bySave(app, async () => (await nodeOf(app, "foto"))?.verso === undefined);
  const free = await nodeOf(app, "foto");
  expect(free.verso).toBeUndefined();
});

test("Send to back and Bring to front reorder any card, and the file keeps the order", async ({ app, page }) => {
  const a = { id: "a", type: "text", text: "Alfa", x: 0, y: 0, width: 200, height: 80 };
  const b = { id: "b", type: "text", text: "Beta", x: 300, y: 0, width: 200, height: 80 };
  const c = { id: "c", type: "text", text: "Gama", x: 600, y: 0, width: 200, height: 80 };
  await openBoard(app, canvas([a, b, c]));
  await app.select("c");
  await page.getByTestId("board-tool-back").click();
  await bySave(app, async () => (await nodesOf(app))[0].id === "c");
  expect((await nodesOf(app)).map((n) => n.id)).toEqual(["c", "a", "b"]);
  await app.select("c");
  await page.getByTestId("board-tool-front").click();
  await bySave(app, async () => (await nodesOf(app)).at(-1).id === "c");
  expect((await nodesOf(app)).map((n) => n.id)).toEqual(["a", "b", "c"]);
});

test("a note dragged from the tree onto a map is pinned there, in the map's group; elsewhere it is a card", async ({ app, page }) => {
  await openBoard(app, canvas([{ ...MAP, verso: { map: true, locked: true } }]));
  const row = page.locator('#notes li[data-path="Alvo.md"]');
  await row.scrollIntoViewIfNeeded();
  const from = await row.boundingBox();
  const to = await app.toPage(400, 300);
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await bySave(app, async () => (await nodesOf(app)).some((n) => n.file === "Alvo.md"));
  const pin = (await nodesOf(app)).find((n) => n.file === "Alvo.md");
  expect(pin.verso.pin).toBe(true);
  expect(pin.width).toBe(32);
  expect(Math.abs(pin.x + 16 - 400)).toBeLessThan(40);
  const map = await nodeOf(app, "mapa");
  expect(pin.verso.groups).toEqual(map.verso.groups);
  expect(map.verso).toMatchObject({ map: true, locked: true });
  await expect(page.locator(".board-pin")).toHaveCount(1);
});

test("Pin a note here… chooses a note and pins it in the middle of the view", async ({ app, page }) => {
  await openBoard(app, canvas([MAP]));
  await look(app, 1, 500, 400);
  await page.getByTestId("board-tool-pin").click();
  const field = page.getByRole("combobox").last();
  await field.fill("Alvo");
  await expect(page.locator(".quick:not([hidden]) .quick-list li").first()).toContainText("Alvo");
  await field.press("Enter");
  await bySave(app, async () => (await nodesOf(app)).some((n) => n.file === "Alvo.md"));
  const pin = (await nodesOf(app)).find((n) => n.file === "Alvo.md");
  expect(Math.abs(pin.x + 16 - 500)).toBeLessThan(40);
  expect(Math.abs(pin.y + 16 - 400)).toBeLessThan(40);
  expect(pin.verso.pin).toBe(true);
});

test("the outline lists the pins in reading order as links, and a link opens the note", async ({ app, page }) => {
  const high = { ...TAVERNA, id: "alto", file: "Alvo.md", x: 700, y: 100 };
  await openBoard(app, canvas([MAP, TAVERNA, high]));
  await page.getByTestId("board-tool-outline").click();
  const list = page.getByRole("list", { name: "Alfinetes do mapa" });
  await expect(list.getByRole("link")).toHaveText(["Alvo", "Taverna"]);
  await list.getByRole("link", { name: "Taverna" }).click();
  await expect(page.locator('.pane.focused .tab[aria-selected="true"]')).toContainText("Taverna");
});

test("a large picture is drawn from tiles, the ones in view at the zoom shown, and is never loaded whole", async ({ app, page }) => {
  const asked = [];
  page.on("request", (r) => {
    if (r.url().includes("Mapa.png")) asked.push(r.url());
  });
  await openBoard(app, canvas([{ ...MAP, width: 1600, height: 1200 }]), { large: { width: 16000, height: 12000 } });
  await expect(page.locator(".map-tiles")).toHaveCount(1);
  await expect(page.locator("img.map-tile").first()).toBeVisible();
  // Zoomed out the whole map fits: the coarsest level is enough.
  const levelsSeen = async () => page.evaluate(() => [...new Set([...document.querySelectorAll("img.map-tile")].map((i) => Number(i.dataset.level)))].sort());
  const top = Number(await page.locator(".map-tiles").getAttribute("data-levels")) - 1;
  expect(top).toBe(6);
  // Looking at one corner at the picture's own pixels: level 0, a few tiles, not all.
  await look(app, 6, 100, 100);
  await expect.poll(levelsSeen).toContain(0);
  const count = await page.locator("img.map-tile").count();
  expect(count).toBeGreaterThan(1);
  expect(count).toBeLessThan(80);
  const askedAfter = await page.evaluate(() => window.__harness.core.maps.asked.filter((a) => a.includes(" 0/")).length);
  expect(askedAfter).toBeGreaterThan(0);
  expect(askedAfter, "not the 3,000 tiles of level 0").toBeLessThan(120);
  // Moving the view asks for the tiles there.
  const before = await page.evaluate(() => window.__harness.core.maps.asked.length);
  await look(app, 6, 1500, 1100);
  await expect.poll(() => page.evaluate(() => window.__harness.core.maps.asked.length)).toBeGreaterThan(before);
  expect(asked, "the picture itself was never asked for").toEqual([]);
});

test("a map being cut says so and waits; one that cannot be cut is drawn whole, said", async ({ app, page }) => {
  await app.open();
  await app.page.evaluate(() => {
    const maps = window.__harness.core.maps;
    maps.big.set("Mapa.png", { width: 16000, height: 12000 });
    maps.progress = 0.4;
  });
  await putPicture(app, "Mapa.png");
  await app.writeOutside("Mapa.canvas", canvas([{ ...MAP, width: 1600, height: 1200 }]));
  await app.folderChanged(["Mapa.canvas", "Mapa.png"], true);
  await app.quickOpen("Mapa");
  await app.boardReady();
  await expect(page.locator(".map-tiles-wait")).toContainText("Preparando o mapa… 40%");
  await expect(page.locator("img.map-tile")).toHaveCount(0);
  await page.evaluate(() => (window.__harness.core.maps.progress = 1));
  await expect(page.locator("img.map-tile").first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".map-tiles-wait")).toHaveCount(0);
});

test("a map the core could not cut is drawn whole, and the card says why", async ({ app, page }) => {
  await app.open();
  await app.page.evaluate(() => window.__harness.core.maps.failing.set("Mapa.png", "an interlaced PNG is decoded whole"));
  await putPicture(app, "Mapa.png");
  await app.writeOutside("Mapa.canvas", canvas([MAP]));
  await app.folderChanged(["Mapa.canvas", "Mapa.png"], true);
  await app.quickOpen("Mapa");
  await app.boardReady();
  await expect(page.locator(".board-map-note")).toContainText("Não deu para cortar o mapa em ladrilhos: an interlaced PNG is decoded whole");
  await expect(page.locator(".board-card-image img").first()).toBeVisible();
});

test("a secret pin shows a lock to a writer, who can view the board as a reader and come back", async ({ app, page }) => {
  await openBoard(app, BOARD, { query: "?side=server" });
  await expect(page.locator(".board-pin")).toHaveCount(2);
  const secret = page.locator('.board-pin[data-pin="cripta"]');
  await expect(secret.locator(".board-secret-badge")).toHaveAttribute("title", "Oculto para leitores");
  await expect(page.locator('.board-pin[data-pin="taverna"] .board-secret-badge')).toHaveCount(0);
  await page.getByTestId("board-tool-reader").click();
  await expect(page.getByTestId("board-reader-banner")).toContainText("Vendo como um leitor");
  await expect(page.locator(".board-pin")).toHaveCount(1);
  expect((await app.scene()).map((e) => e.id)).not.toContain("cripta");
  // Nothing of it is written, whatever is done there.
  await page.waitForTimeout(1200);
  expect(await app.calls("write_board")).toEqual([]);
  await page.getByTestId("board-reader-banner").getByRole("button", { name: "Ver o board inteiro" }).click();
  await expect(page.getByTestId("board-reader-banner")).toHaveCount(0);
  await expect.poll(async () => (await app.scene()).map((e) => e.id).join()).toContain("cripta");
  await expect(page.locator(".board-pin")).toHaveCount(2);
  expect(await app.file("Mapa.canvas")).toBe(BOARD);
});

test("in a folder of this computer the lock says the card is visible to anyone with the file", async ({ app, page }) => {
  await openBoard(app);
  await expect(page.locator('.board-pin[data-pin="cripta"] .board-secret-badge')).toHaveAttribute("title", "Visível para quem tiver o arquivo");
});

test("a card is marked secret and unmarked from the toolbar; the mark is the file's", async ({ app, page }) => {
  await openBoard(app, BOARD, { query: "?side=server" });
  await app.select("taverna");
  const tool = page.getByTestId("board-tool-secret");
  await expect(tool).toHaveAttribute("aria-pressed", "false");
  await tool.click();
  await bySave(app, async () => (await nodeOf(app, "taverna"))?.verso?.secret === true);
  expect((await nodeOf(app, "taverna")).verso).toEqual({ pin: true, groups: ["g"], secret: true });
  await expect(tool).toHaveAttribute("aria-pressed", "true");
  await tool.click();
  await bySave(app, async () => (await nodeOf(app, "taverna"))?.verso?.secret === undefined);
  expect((await nodeOf(app, "taverna")).verso).toEqual({ pin: true, groups: ["g"] });
});

test("one who only reads receives the board without its secret pin and cannot write it", async ({ app, page }) => {
  await openBoard(app, BOARD, { query: "?side=server&role=reader" });
  await expect(page.locator(".board-pin")).toHaveCount(1);
  expect((await app.scene()).map((e) => e.id)).not.toContain("cripta");
  expect(await page.locator(".board-canvas").innerHTML()).not.toContain("Cripta");
  expect(await page.getByTestId("board-tool-reader").count()).toBe(0);
  expect(await page.getByTestId("board-tool-secret").count()).toBe(0);
  // The pin still opens its note, and a drag does not write.
  await look(app, 1, 316, 316);
  const m = await markBox(page, "taverna");
  await page.mouse.move(m.x, m.y);
  await page.mouse.down();
  await page.mouse.move(m.x + 50, m.y + 50, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  expect(await app.calls("write_board")).toEqual([]);
  expect((await app.scene()).find((e) => e.id === "taverna").x).toBe(300);
});

test("an exported picture asks whether to leave the secret cards out, left out by default", async ({ app, page }) => {
  await openBoard(app, BOARD, { query: "?side=server" });
  await page.locator(".board-canvas .excalidraw").focus();
  await app.key("Mod+Shift+e");
  const box = page.getByTestId("board-export-secret");
  await expect(box).toBeChecked();
  // The preview is drawn, then drawn again without the secret cards: one
  // preview at a time, so none is revoked while it loads.
  const preview = page.locator(".board-export-preview img");
  const drawn = () => preview.evaluate((i) => i.complete && i.naturalWidth > 0);
  await expect(preview).toBeVisible({ timeout: 15000 });
  await expect.poll(drawn).toBe(true);
  const first = await preview.getAttribute("src");
  await box.uncheck();
  await expect(preview).not.toHaveAttribute("src", first ?? "", { timeout: 15000 });
  await expect.poll(drawn).toBe(true);
});

test("@layout on a phone a pin is one size on the screen, and a tap on it opens its note", async ({ app, page, isMobile, browserName }) => {
  // The window up first: the fixture reads its log at the end, skipped or not.
  await app.open();
  test.skip(!isMobile || browserName !== "chromium", "a finger is Playwright's in Chromium on a phone only");
  await openBoard(app);
  await look(app, 0.5, 316, 316);
  const small = await markBox(page, "taverna");
  await look(app, 2, 316, 316);
  const big = await markBox(page, "taverna");
  expect(Math.round(big.w)).toBe(Math.round(small.w));
  expect(big.w, "a mark a finger can hit").toBeGreaterThanOrEqual(24);
  await page.touchscreen.tap(big.x, big.y);
  await expect(page.locator('.pane.focused .tab[aria-selected="true"]')).toContainText("Taverna");
});
