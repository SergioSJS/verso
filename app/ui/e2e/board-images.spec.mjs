// Pictures and files on a board: dropped from outside, pasted, picked with
// the button, or dragged from the tree (ADR 0063). Each becomes a file card
// whose file is in the folder, never a picture kept inside the drawing.

import { test, expect } from "./fixtures.mjs";

const EMPTY = '{\n\t"nodes":[],\n\t"edges":[]\n}';
/** A 1x1 PNG. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==", "base64");

async function openBoard(app, path = "Mesa.canvas") {
  await app.open();
  await app.writeOutside(path, EMPTY);
  await app.folderChanged([path], true);
  await expect(app.page.locator("#notes")).toContainText(path);
  await app.quickOpen(path.replace(/\.canvas$/, ""));
  await app.page.waitForFunction(() => window.__VERSO_TEST__?.board && window.__VERSO_TEST__.board.getAppState().width > 0);
}

const nodesOf = async (app, path = "Mesa.canvas") => JSON.parse(await app.file(path)).nodes;

/** A file dropped or pasted on the board, as the system hands it over. */
async function hand(app, kind, name, type) {
  await app.page.evaluate(
    async ([kind, name, type, b64]) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type }));
      const box = document.querySelector(".board-canvas").getBoundingClientRect();
      const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, bubbles: true, cancelable: true };
      const target = document.querySelector(".board-canvas .excalidraw") ?? document.querySelector(".board-canvas");
      if (kind === "drop") target.dispatchEvent(new DragEvent("drop", { ...at, dataTransfer: dt }));
      else target.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
    },
    [kind, name, type, PNG.toString("base64")],
  );
}

for (const kind of ["drop", "paste"]) {
  test(`a picture ${kind === "drop" ? "dropped on" : "pasted into"} the board becomes a file card`, async ({ app }) => {
    await openBoard(app);
    await hand(app, kind, "foto.png", "image/png");
    await expect.poll(async () => (await nodesOf(app)).length).toBe(1);
    const [node] = await nodesOf(app);
    expect(node.type).toBe("file");
    expect(node.file).toMatch(/^assets\/foto.*\.png$/);
    // The file is in the folder, and no picture is kept in the drawing.
    expect(await app.page.evaluate((p) => window.__harness.bytes(p) !== null, node.file)).toBe(true);
    expect(await app.file("Mesa.canvas")).not.toContain("dataURL");
  });
}

test("a file that is not a picture or a PDF is refused, and said", async ({ app }) => {
  await openBoard(app);
  await hand(app, "drop", "dados.zip", "application/zip");
  await expect(app.page.locator("#status")).toContainText("Só imagens e PDFs");
  expect(await nodesOf(app)).toEqual([]);
});

test("Insert, in Excalidraw's own toolbar, picks pictures from the computer", async ({ app, page }) => {
  await openBoard(app);
  // One button among Excalidraw's tools, not a bar of Verso's beside them.
  await expect(page.locator(".App-toolbar [data-testid=board-tool-insert]")).toHaveCount(1);
  await expect(page.locator(".board-ex-leftbar, .board-bar")).toHaveCount(0);
  await page.getByTestId("board-tool-insert").click();
  await expect(page.getByRole("menu", { name: "Inserir" })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("board-tool-image").click();
  await (await chooser).setFiles({ name: "capa.png", mimeType: "image/png", buffer: PNG });
  await expect.poll(async () => (await nodesOf(app)).length).toBe(1);
  expect((await nodesOf(app))[0].file).toMatch(/capa.*\.png$/);
  // The menu closed when it was used.
  await expect(page.getByRole("menu", { name: "Inserir" })).toHaveCount(0);
});

test("a picture card is the picture alone: no frame, head or title", async ({ app, page }) => {
  await openBoard(app);
  await hand(app, "drop", "foto.png", "image/png");
  await expect.poll(async () => (await nodesOf(app)).length).toBe(1);
  const card = page.locator(".board-card-bare");
  await expect(card).toHaveCount(1);
  await expect(card.locator(".board-card-head")).toHaveCount(0);
  await expect(card.locator("img").first()).toHaveAttribute("alt", /foto/);
});

test("a note dragged from the tree onto the board becomes a card, not a tab", async ({ app, page }) => {
  await openBoard(app);
  await app.writeOutside("Ideias.md", "# Ideias\n");
  await app.folderChanged(["Ideias.md"], true);
  const row = page.locator('#notes li[data-path="Ideias.md"]');
  await row.scrollIntoViewIfNeeded();
  const from = await row.boundingBox();
  const box = await page.locator(".board-canvas").boundingBox();
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await nodesOf(app)).map((n) => n.file)).toEqual(["Ideias.md"]);
  await expect(page.locator(".tab")).toHaveCount(1);
});

test.describe("in a tall, narrow window", () => {
  test.use({ viewport: { width: 440, height: 1000 } });

  test("Excalidraw's toolbar and Verso's tools both fit, each on its own line", async ({ app, page }) => {
    await openBoard(app);
    const canvas = await page.locator(".board-canvas").boundingBox();
    const bar = await page.locator(".App-toolbar").first().boundingBox();
    const tools = await page.locator(".board-ex-tools").boundingBox();
    for (const b of [bar, tools]) {
      expect(b.x).toBeGreaterThanOrEqual(canvas.x);
      expect(b.x + b.width).toBeLessThanOrEqual(canvas.x + canvas.width);
    }
    // Verso's tools under the toolbar, not beside it.
    expect(tools.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    await expect(page.getByTestId("board-tool-insert")).toBeVisible();
  });
});

test.describe("a board narrowed by the side bar, in a wide window", () => {
  test.use({ viewport: { width: 1070, height: 770 } });

  test("Verso's tools go to the footer, whole and usable, and Excalidraw's toolbar keeps its row", async ({ app, page }) => {
    await openBoard(app);
    // The window is wide enough for Excalidraw's desktop layout; the board,
    // beside the side bar, is not wide enough for the tools on the top row.
    await expect(page.locator(".excalidraw--mobile")).toHaveCount(0);
    const tools = page.locator(".footer-center > .board-ex-tools");
    await expect(tools).toBeVisible();
    const canvas = await page.locator(".board-canvas").boundingBox();
    const box = await tools.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(canvas.x);
    expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width);
    // They take the pointer: the outline opens, the search field types.
    await page.getByTestId("board-tool-outline").click();
    await expect(page.getByTestId("board-tool-outline")).toHaveAttribute("aria-pressed", "true");
    // The outline beside it narrows the board into Excalidraw's phone
    // layout: the tools follow, under the toolbar, never lost.
    await expect(page.locator(".excalidraw--mobile")).toHaveCount(1);
    await expect(page.locator(".App-toolbar-container > .board-ex-tools")).toBeVisible();
    await page.getByTestId("board-tool-outline").click();
    await expect(page.locator(".excalidraw--mobile")).toHaveCount(0);
    const back = page.locator(".footer-center > .board-ex-tools");
    await back.locator("input").fill("abc");
    await expect(back.locator("input")).toHaveValue("abc");
  });
});

test.describe("both side bars open, the board narrowest", () => {
  test.use({ viewport: { width: 900, height: 760 } });

  test("every tool of Excalidraw's toolbar is whole on the board, clear of the lock and the hand", async ({ app, page }) => {
    await openBoard(app);
    await app.key("Mod+Alt+ArrowRight");
    await expect(page.locator(".excalidraw--mobile")).toHaveCount(1);
    const canvas = await page.locator(".board-canvas").boundingBox();
    const lock = await page.locator(".ToolIcon__lock").boundingBox();
    const tools = page.locator(".App-toolbar .ToolIcon, .App-toolbar [data-testid=board-tool-insert], .App-toolbar .App-toolbar__extra-tools-trigger");
    const n = await tools.count();
    expect(n).toBeGreaterThan(8);
    for (let i = 0; i < n; i++) {
      const b = await tools.nth(i).boundingBox();
      if (!b || b.width === 0) continue;
      expect(b.x).toBeGreaterThanOrEqual(canvas.x);
      expect(b.x + b.width).toBeLessThanOrEqual(lock.x);
    }
    await expect(page.locator(".App-toolbar-container > .board-ex-tools")).toBeVisible();
  });
});

test("a picture card is cropped on the card: the node keeps the crop, the file is untouched, and it is undone", async ({ app, page }) => {
  await app.open();
  // Obsidian's own layout: the first save rewrites nothing else.
  await app.writeOutside("Mesa.canvas", '{\n\t"nodes":[\n\t\t{"id":"p","type":"file","file":"assets/diagrama.svg","x":0,"y":0,"width":400,"height":300}\n\t],\n\t"edges":[]\n}');
  await app.folderChanged(["Mesa.canvas"], true);
  const before = await page.evaluate(() => window.__harness.bytes("assets/diagrama.svg")?.length);
  await app.quickOpen("Mesa");
  await app.boardReady();
  const c = await app.centerOf("p");
  await page.mouse.click(c.x, c.y);
  await page.getByTestId("board-tool-crop").click();
  const rect = page.getByTestId("board-crop-rect");
  await expect(rect).toBeVisible();
  // The bottom-right corner dragged up and left: half of each side kept.
  const r = await rect.boundingBox();
  const h = page.locator('.board-crop-handle[data-handle="se"]');
  const hb = await h.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.screenshot({ path: "/private/tmp/claude-502/-Users-sergio-sousa-Projects-person-apps-verso/58b8519c-6850-4e5b-9e41-fd329849e27c/scratchpad/crop.png" });
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect.poll(async () => JSON.parse(await app.file("Mesa.canvas")).nodes[0].verso?.crop).toMatchObject({ x: 0, y: 0 });
  const node = JSON.parse(await app.file("Mesa.canvas")).nodes[0];
  expect(node.verso.crop.w).toBeGreaterThan(0.4);
  expect(node.verso.crop.w).toBeLessThan(0.6);
  await expect(page.locator(".board-card-image.cropped .board-crop-view")).toBeVisible();
  // At once, without a redraw: the part shown fits the card, at the crop's
  // proportions (the card took them).
  const card = await page.locator(".board-card-image.cropped").boundingBox();
  const view = await page.locator(".board-crop-view").boundingBox();
  expect(view.width).toBeLessThanOrEqual(card.width + 1);
  expect(view.height).toBeLessThanOrEqual(card.height + 1);
  expect(Math.abs(view.width / view.height - card.width / card.height)).toBeLessThan(0.05);
  // The picture's file was not written.
  expect(await page.evaluate(() => window.__harness.bytes("assets/diagrama.svg")?.length)).toBe(before);
  // Restored: the crop goes from the node.
  await page.mouse.click(c.x, (await app.centerOf("p")).y);
  await page.getByTestId("board-tool-crop").click();
  await page.getByRole("button", { name: "Restaurar original" }).click();
  await expect.poll(async () => JSON.parse(await app.file("Mesa.canvas")).nodes[0].verso?.crop).toBeUndefined();
});
