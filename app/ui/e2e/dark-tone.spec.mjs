// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The dark theme's tone (css/base.css, Settings › Appearance): soft by
// default, deep, dusk. In every palette and tone the text reads at a
// reading app's contrast — soft not above the near-black's 13.7:1 — and
// the secondary text and the accents keep 4.5:1 on every paper and wash.
// The colors are measured as the browser paints them, through a canvas.
import { expect, test } from "./fixtures.mjs";

/** Each token's painted sRGB, and the contrast of a pair. */
function measure(names) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const probe = document.createElement("div");
  document.body.append(probe);
  const rgb = {};
  for (const n of names) {
    probe.style.color = `var(${n})`;
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = getComputedStyle(probe).color;
    g.fillRect(0, 0, 1, 1);
    rgb[n] = Array.from(g.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }
  probe.remove();
  const lum = (c) => {
    const [r, gg, b] = c.map((v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(rgb[a]), lum(rgb[b])].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  return { rgb, ratio };
}

const PAPERS = ["--paper", "--paper-2", "--paper-3", "--seal-wash", "--brass-wash"];
const SECONDARY = ["--ink-2", "--ink-3", "--seal", "--brass-ink"];

test("the dark theme's tones read comfortably and keep 4.5:1 for the secondary text", async ({ app, page }) => {
  await app.open();
  const results = await page.evaluate(({ PAPERS, SECONDARY, measure }) => {
    const m = new Function(`return (${measure})`)();
    const out = [];
    const root = document.documentElement;
    root.dataset.theme = "dark";
    for (const palette of ["paper", "sepia", "slate", "moss"]) {
      for (const tone of ["soft", "deep", "dusk"]) {
        root.dataset.palette = palette;
        root.dataset.dark = tone;
        const { rgb, ratio } = m(["--ink", ...SECONDARY, ...PAPERS]);
        const worst = Math.min(...SECONDARY.flatMap((fg) => PAPERS.map((bg) => ratio(fg, bg))));
        out.push({ palette, tone, ink: ratio("--ink", "--paper"), worst, paper: rgb["--paper"] });
      }
    }
    return out;
  }, { PAPERS, SECONDARY, measure: measure.toString() });
  for (const r of results) {
    const at = `${r.palette}/${r.tone}`;
    expect(r.worst, at).toBeGreaterThanOrEqual(4.5);
    expect(r.ink, at).toBeGreaterThanOrEqual(9);
    if (r.tone === "soft") expect(r.ink, at).toBeLessThan(12);
  }
  // The tones differ: deep is the darkest paper, dusk the lightest.
  const paper = (tone) => results.find((r) => r.palette === "paper" && r.tone === tone).paper.reduce((a, b) => a + b);
  expect(paper("deep")).toBeLessThan(paper("soft"));
  expect(paper("soft")).toBeLessThan(paper("dusk"));
});

test("the tone is chosen in Settings › Appearance", async ({ app, page }) => {
  await app.open();
  await expect(page.locator("html")).toHaveAttribute("data-dark", "soft");
  await page.locator('.ribbon-item[data-id="settings"]').click();
  await page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  await page.getByLabel("Tom do escuro").selectOption("deep");
  await expect(page.locator("html")).toHaveAttribute("data-dark", "deep");
});
