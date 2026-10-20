// A picture card holding an SVG with a filtered group (a drop shadow) stays
// sharp when the board is zoomed in: WebKit drew filtered SVG content at the
// size of the image's own raster, which a sizeless SVG (width="100%") left small.

import { test, expect } from "./fixtures.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const SHOTS = process.env.SHOT_DIR ?? "/w/app/ui/e2e/results/shots";
const TEXT = "Arquivos Locais MMMM";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
  <defs><filter id="shadow" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#3d2a1d" flood-opacity="0.08"/></filter></defs>
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="200" y="60" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="600" fill="#000000">${TEXT}</text>
  <g filter="url(#shadow)"><rect x="20" y="130" width="360" height="120" fill="#ffffff"/>
  <text x="200" y="200" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="600" fill="#000000">${TEXT}</text></g>
</svg>`;

/** The sharpest step of luminance between neighbouring pixels, in a band of the picture (0-1 of its height). */
async function sharpness(page, png, from, to) {
  return page.evaluate(
    async ([b64, from, to]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const y0 = Math.floor(from * c.height);
      const y1 = Math.floor(to * c.height);
      const d = g.getImageData(0, y0, c.width, y1 - y0).data;
      const w = c.width;
      const lum = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const rows = (y1 - y0);
      // The mean of the strongest 2 % of the horizontal steps: robust to one odd pixel.
      const steps = [];
      for (let y = 0; y < rows; y++) for (let x = 1; x < w; x++) steps.push(Math.abs(lum((y * w + x) * 4) - lum((y * w + x - 1) * 4)));
      steps.sort((a, b) => b - a);
      const top = steps.slice(0, Math.max(1, Math.floor(steps.length * 0.02)));
      return top.reduce((a, b) => a + b, 0) / top.length;
    },
    [png.toString("base64"), from, to],
  );
}

test("an SVG picture card with a filtered group is as sharp as its plain text at 300 %", async ({ app, page }, info) => {
  await app.open();
  await app.writeOutside("assets/sombra.svg", SVG);
  await app.writeOutside("Mesa.canvas", '{\n\t"nodes":[\n\t\t{"id":"p","type":"file","file":"assets/sombra.svg","x":0,"y":0,"width":400,"height":300}\n\t],\n\t"edges":[]\n}');
  await app.folderChanged(["Mesa.canvas", "assets/sombra.svg"], true);
  await app.quickOpen("Mesa");
  await app.boardReady();
  await page.evaluate(() => document.querySelector(".board-canvas").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  await page.evaluate(() => {
    const a = window.__VERSO_TEST__.board;
    const s = a.getAppState();
    a.updateScene({ appState: { zoom: { value: 3 }, scrollX: s.width / 6 - 200, scrollY: s.height / 6 - 150 } });
  });
  await app.settledView();
  const img = page.locator(".board-card-image img").first();
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  await page.waitForTimeout(800);
  // The card is clipped by the pane: look at its middle slice.
  const box = await page.locator(".board-card-image").first().boundingBox();
  const png = await page.screenshot({ clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(box.width, 1400), height: Math.min(box.height, 900) } });
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(`${SHOTS}/${process.env.SHOT_TAG ?? "run"}-${info.project.name}.png`, png);
  // Title band 12-28 %, filtered band 55-75 % of the card (SVG y 60 and 200 of 300 at the card's height).
  const rect = await page.evaluate(() => 0);
  void rect;
  const plain = await sharpness(page, png, 0.1, 0.27);
  const filtered = await sharpness(page, png, 0.57, 0.74);
  console.log(`${info.project.name}: plain ${plain.toFixed(1)} filtered ${filtered.toFixed(1)} ratio ${(filtered / plain).toFixed(2)}`);
  expect(filtered / plain).toBeGreaterThan(0.85);
});
