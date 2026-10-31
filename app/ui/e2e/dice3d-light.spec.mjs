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

async function roll(app, page, name, theme) {
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
  await page.locator(".preview:visible").getByRole("button", { name: /^Rolar (4dF|de novo)$/ }).first().click();
  const c = page.locator("canvas.dice3d-canvas");
  await expect(c).toHaveAttribute("data-state", "resting", { timeout: 9000 });
  const box = await c.boundingBox();
  const png = await page.screenshot({ clip: box });
  // The dice alone, on a transparent page: the share of their opaque pixels
  // that are near-white (every channel > 235). A coloured die turned up to
  // white has lost its face; the white die and the numbers are the few that
  // are white on purpose, so the guard is made on the violet and the yellow.
  await page.addStyleTag({ content: "html,body,body *{background:transparent!important} body *:not(canvas.dice3d-canvas){visibility:hidden!important}" });
  const bare = await page.screenshot({ clip: box, omitBackground: true });
  const white = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const k = document.createElement("canvas");
    k.width = img.width;
    k.height = img.height;
    const x = k.getContext("2d");
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, k.width, k.height).data;
    let w = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 220) continue;
      n++;
      if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) w++;
    }
    return n ? w / n : 0;
  }, bare.toString("base64"));
  return { png, white };
}

const dir = process.env.DICE3D_SHEET;

for (const theme of ["light", "dark"]) {
  for (const name of Object.keys(STYLES)) {
    test(`light: ${name} dice on the ${theme} theme`, async ({ app, page }, info) => {
      const r = await roll(app, page, name, theme);
      info.annotations.push({ type: "near-white share", description: r.white.toFixed(4) });
      if (dir) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(`${dir}/${name}-${theme}.png`, r.png);
      }
      // The violet die on the light theme is the maintainer's case.
      if (name === "violeta" || name === "amarelo") expect(r.white, `${name} on ${theme}`).toBeLessThan(0.08);
    });
  }
}
