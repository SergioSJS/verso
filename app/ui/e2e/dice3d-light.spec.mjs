// 3D dice light (ADR 0101, 2026-10-23): the face turned up must stay legible
// — never washed out to white by the sun, the ambient light or the
// reflections — for light and dark bodies, every finish, both themes.
//
// `DICE3D_SHEET=<dir>` writes one picture per case there (the before/after
// pictures under docs/media/test-runs). The studio's reflections are forced
// on (`__dice3dEnv`) so a CPU renderer shows them too.

import { mkdirSync, writeFileSync } from "node:fs";

import { test, expect } from "./fixtures.mjs";

const TEXT = ["# Mesa", "", "Fudge: `dice: 4dF` e `dice: 2d6+1d20`.", ""].join("\n");

const STYLES = {
  violeta: { body: "#8e5bd6", number: "#ffffff", outline: "#2a1550", texture: "none", material: "plastic" },
  branco: { body: "#f4f1ea", number: "#222222", outline: "#222222", texture: "none", material: "plastic" },
  amarelo: { body: "#f2d544", number: "#2a2208", outline: "#2a2208", texture: "none", material: "plastic" },
  verso: {},
  metal: { body: "#14171c", number: "#e5c07b", outline: "#e5c07b", texture: "speckles", material: "metal" },
  vidro: { body: "#bfe6f2", number: "#123a4a", outline: "#0b2733", texture: "ice", material: "glass" },
  madeira: { body: "#7a4a22", number: "#f0dcb8", outline: "#2a1608", texture: "wood", material: "wood" },
  liso: { body: "#e8e0cd", number: "#3a3226", outline: "#3a3226", texture: "none", material: "none" },
};

const seeded = () => {
  let a = 12345;
  Math.random = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
};

/** Of a picture's opaque pixels (the dice, on a transparent page): the share
 *  that is near-white (every channel > 235: a coloured die turned up to white
 *  has lost its face; the white die and the numbers are the few that are
 *  white on purpose, so the guard is made on the violet and the yellow), and
 *  the share that is pale (HSL lightness above 0.8: a washed-out body). */
async function share(b64) {
  const img = new Image();
  img.src = "data:image/png;base64," + b64;
  await img.decode();
  const k = document.createElement("canvas");
  k.width = img.width;
  k.height = img.height;
  const x = k.getContext("2d");
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, k.width, k.height).data;
  let white = 0;
  let pale = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 220) continue;
    n++;
    if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) white++;
    if ((Math.max(d[i], d[i + 1], d[i + 2]) + Math.min(d[i], d[i + 1], d[i + 2])) / 510 > 0.8) pale++;
  }
  return n ? { white: white / n, pale: pale / n } : { white: 0, pale: 0 };
}

async function roll(app, page, name, theme, rolls) {
  await page.addInitScript(seeded);
  await page.addInitScript((look) => {
    globalThis.__dice3dEnv = true;
    const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
    localStorage.setItem("verso.settings", JSON.stringify({ ...s, features: { ...(s.features ?? {}), dice3d: true }, dice3dLook: look }));
  }, { size: 140, styles: { 1: STYLES[name] } });
  await app.open();
  if (!(await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2")))) test.skip(true, "no WebGL");
  await app.writeOutside("Mesa.md", TEXT);
  await app.folderChanged(["Mesa.md"], true);
  await app.quickOpen("Mesa");
  await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
  const c = page.locator("canvas.dice3d-canvas");
  const measures = [];
  let png = null;
  for (let i = 0; i < rolls; i++) {
    if (i > 0) {
      // The dice stay until the person touches something: Escape sends them away.
      await page.keyboard.press("Escape");
      await expect(c).toHaveCount(0);
    }
    await page.locator(".preview:visible").getByRole("button", { name: /^Rolar (4dF|de novo)$/ }).first().click();
    await expect(c).toHaveAttribute("data-state", "resting", { timeout: 9000 });
    const box = await c.boundingBox();
    png ??= await page.screenshot({ clip: box });
    // The dice alone, on a transparent page.
    const style = await page.addStyleTag({ content: "html,body,body *{background:transparent!important} body *:not(canvas.dice3d-canvas){visibility:hidden!important}" });
    const bare = await page.screenshot({ clip: box, omitBackground: true });
    await style.evaluate((e) => e.remove());
    measures.push(await page.evaluate(share, bare.toString("base64")));
  }
  const median = (key) => measures.map((m) => m[key]).sort((p, q) => p - q)[Math.floor(measures.length / 2)];
  return { png, measures, white: median("white"), pale: median("pale") };
}

const dir = process.env.DICE3D_SHEET;
const GUARDED = ["violeta", "amarelo"];

for (const theme of ["light", "dark"]) {
  for (const name of Object.keys(STYLES)) {
    test(`light: ${name} dice on the ${theme} theme`, async ({ app, page }, info) => {
      const r = await roll(app, page, name, theme, GUARDED.includes(name) ? 5 : 1);
      info.annotations.push({ type: "near-white share", description: r.white.toFixed(4) }, { type: "pale share", description: r.pale.toFixed(4) });
      if (dir) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(`${dir}/${name}-${theme}.png`, r.png);
      }
      // The violet die is the maintainer's case (91e65dad6), the yellow its
      // twin. The dice land differently on every roll and the share moves with
      // how they land, so the guarded styles roll five times and the MEDIAN
      // is judged. Two measures, from what the dice are:
      //  - near-white (every channel > 235, the clipped die), median < 0.15.
      //    The lighting from before 91e65dad6, in Docker (SwiftShader,
      //    chromium, 12 single rolls a style, 2026-11-01), read 0.024-0.125 on
      //    the violet and 0.000-0.219 on the yellow: it only catches a die
      //    clipped to white, which that renderer rarely made.
      //  - pale (opaque pixels with HSL lightness above 0.8, a washed-out
      //    body), median of five < PALE. Single rolls overlap (a good violet
      //    reached 0.58 on its own); the medians of five do not. Before the
      //    fix (the same renderer, 6 medians a style): violet 0.58-0.63,
      //    yellow 0.25-0.47. After it: violet 0.10-0.25, yellow 0.00-0.10.
      //    The lines sit in the gap: 0.40 for the violet, 0.17 for the yellow.
      //  Not measured on a real GPU (the Mac's was 0.034-0.082 near-white).
      const PALE = { violeta: 0.4, amarelo: 0.17 };
      if (GUARDED.includes(name)) {
        expect(r.white, `${name} on ${theme}: near-white`).toBeLessThan(0.15);
        expect(r.pale, `${name} on ${theme}: pale`).toBeLessThan(PALE[name]);
      }
    });
  }
}
