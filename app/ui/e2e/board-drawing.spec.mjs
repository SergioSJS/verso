// A drawing of Obsidian's Excalidraw plugin (`.excalidraw.md`) opens on its
// drawing, shown as drawn and never changed; its text is a click away, and
// "Converter em board" makes a board beside it (ADR 0057 point 5).

import { test, expect } from "./fixtures.mjs";

const DEMO = "Desenho do Excalidraw";

/** The drawing shown, as its elements. */
const shown = (page) =>
  page.evaluate(() => {
    const host = document.querySelector(".drawing-host:not([hidden]) .excalidraw");
    return host ? true : false;
  });

test("a plugin drawing opens on its drawing; its text is a click away; the file is not touched", async ({ app, page }) => {
  await app.open();
  const before = await app.file(`${DEMO}.excalidraw.md`);
  await app.quickOpen(DEMO);
  await expect(page.locator(".drawing-bar")).toBeVisible();
  await expect(page.locator(".drawing-host .excalidraw")).toBeVisible();
  await expect(page.locator(".note-sheet")).toBeHidden();
  // Excalidraw's view mode: a drawing to look at, no tools.
  await expect(page.locator(".drawing-host .App-toolbar")).toHaveCount(0);
  await page.getByRole("button", { name: "Ver o texto" }).click();
  await expect(page.locator(".note-sheet")).toBeVisible();
  await expect(page.locator(".drawing-host")).toBeHidden();
  await page.getByRole("button", { name: "Ver o desenho" }).click();
  await expect.poll(() => shown(page)).toBe(true);
  // A mode of the text shows the text.
  await page.locator(".modes button", { hasText: "Editar" }).click();
  await expect(page.locator(".note-sheet")).toBeVisible();
  expect(await app.file(`${DEMO}.excalidraw.md`)).toBe(before);
  expect(await app.calls("write_note")).toEqual([]);
});

test("Converter em board, from the drawing's bar, makes the board beside it", async ({ app, page }) => {
  await app.open();
  await app.quickOpen(DEMO);
  await page.locator(".drawing-bar").getByRole("button", { name: "Converter em board" }).click();
  const plan = page.getByRole("dialog", { name: "Converter o desenho do plugin Excalidraw num board" });
  await expect(plan).toBeVisible();
  await plan.getByRole("button", { name: "Criar o board" }).click();
  await app.boardReady();
  await expect(page.locator(".tab.active, .tab[aria-selected=true]").first()).toContainText(DEMO);
  const types = (await app.scene()).map((e) => e.type);
  expect(types.filter((t) => t === "arrow").length).toBe(2);
});

/** A drawing in the plugin's current format: arrows bound at points of the
 *  shapes, one on the outline (orbit), one inside. */
const POINTS = `---
excalidraw-plugin: parsed
tags: [excalidraw]
---

# Excalidraw Data

## Text Elements
%%
## Drawing
\`\`\`json
${JSON.stringify({
  type: "excalidraw",
  version: 2,
  elements: [
    { id: "r1", type: "rectangle", x: 0, y: 0, width: 200, height: 100, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1, version: 1, versionNonce: 1, isDeleted: false, boundElements: [{ id: "a1", type: "arrow" }, { id: "a2", type: "arrow" }], updated: 1, link: null, locked: false },
    { id: "r2", type: "rectangle", x: 400, y: 0, width: 200, height: 100, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 2, version: 1, versionNonce: 2, isDeleted: false, boundElements: [{ id: "a1", type: "arrow" }, { id: "a2", type: "arrow" }], updated: 1, link: null, locked: false },
    { id: "a1", type: "arrow", x: 200, y: 50, width: 200, height: 0, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 3, version: 1, versionNonce: 3, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false, points: [[0, 0], [200, 0]], startBinding: { elementId: "r1", mode: "orbit", fixedPoint: [1, 0.5001] }, endBinding: { elementId: "r2", mode: "orbit", fixedPoint: [0, 0.5001] }, startArrowhead: null, endArrowhead: "arrow", elbowed: false },
    { id: "a2", type: "arrow", x: 180, y: 20, width: 330, height: 60, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 4, version: 1, versionNonce: 4, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false, points: [[0, 0], [330, 60]], startBinding: { elementId: "r1", mode: "inside", fixedPoint: [0.9, 0.2] }, endBinding: { elementId: "r2", mode: "inside", fixedPoint: [0.55, 0.8] }, startArrowhead: null, endArrowhead: "arrow", elbowed: false },
  ],
  appState: {},
  files: {},
}, null, 1)}
\`\`\`
%%
`;

test("a drawing in the plugin's current format converts with its arrows bound at the same points", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Pontos.excalidraw.md", POINTS);
  await app.folderChanged(["Pontos.excalidraw.md"], true);
  await app.quickOpen("Pontos");
  await expect(page.locator(".drawing-host .excalidraw")).toBeVisible();
  await page.locator(".drawing-bar").getByRole("button", { name: "Converter em board" }).click();
  await page.getByRole("dialog", { name: "Converter o desenho do plugin Excalidraw num board" }).getByRole("button", { name: "Criar o board" }).click();
  await app.boardReady();
  const arrows = await page.evaluate(() =>
    Object.fromEntries(
      window.__VERSO_TEST__.board
        .getSceneElements()
        .filter((e) => e.type === "arrow")
        .map((e) => [e.id, [e.startBinding?.fixedPoint, e.startBinding?.mode, e.endBinding?.fixedPoint, e.endBinding?.mode]]),
    ),
  );
  expect(arrows).toEqual({
    a1: [[1, 0.5001], "orbit", [0, 0.5001], "orbit"],
    a2: [[0.9, 0.2], "inside", [0.55, 0.8], "inside"],
  });
});
