// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The twenty textures of the 3D dice, drawn by our own code on a canvas
// (ADR 0101, appearance) as a fallback for the original pictures, which
// are what the dice use (loadTextureImages). Each takes
// the canvas already filled with the body colour and paints over it, mostly
// with `multiply` so the body colour tints the pattern (as Rolai's textures
// do) and with `source-over` for what shines (glitter, stars, ice). Sizes
// are in units of one atlas cell (128 px), so a texture looks alike at any
// atlas size. Needs the 2D canvas only: the settings draw their swatches
// with it too, without loading three.js.

import { TEXTURE_FILES, type TextureId } from "./look";

export type Rng = () => number;

/** A small seeded generator, so a texture is the same each time it is drawn
 *  at the same size (and a test can say so). */
export function seeded(seed: number): Rng {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;
const U = 128;

function blot(c: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.globalAlpha = alpha;
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
  c.globalAlpha = 1;
}

type RGB3 = [number, number, number];

/** hsl (degrees, percent, percent) as 0-255 channels. */
function hsl(h: number, sat: number, l: number): RGB3 {
  const s = sat / 100;
  const lt = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(lt, 1 - lt);
  const f = (n: number) => Math.round(255 * (lt - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return [f(0), f(8), f(4)];
}

/** A cell pattern: each pixel takes the colour of the nearest of `n`
 *  jittered points, and the `lead` colour where the second nearest is
 *  almost as near (the cell's edge). */
function cells(c: Ctx, w: number, h: number, n: number, r: Rng, color: (i: number) => RGB3, dark: RGB3, leadAt: number): void {
  const step = Math.sqrt((w * h) / n);
  const sites: [number, number][] = [];
  for (let y = step / 2; y < h + step; y += step) for (let x = step / 2; x < w + step; x += step) sites.push([x + (r() - 0.5) * step * 0.9, y + (r() - 0.5) * step * 0.9]);
  const img = c.createImageData(w, h);
  const rgba = sites.map((_, i) => color(i));
  let gx = 0;
  for (let x = step / 2; x < w + step; x += step) gx++;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let d1 = Infinity;
      let d2 = Infinity;
      let k = 0;
      const cx = Math.floor(x / step);
      const cy = Math.floor(y / step);
      for (let j = Math.max(0, cy - 1); j <= cy + 2; j++) {
        for (let i = Math.max(0, cx - 1); i <= cx + 2; i++) {
          const idx = j * gx + i;
          const s = sites[idx];
          if (!s) continue;
          const d = Math.hypot(s[0] - x, s[1] - y);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            k = idx;
          } else if (d < d2) d2 = d;
        }
      }
      const o = (y * w + x) * 4;
      const edge = d2 - d1 < leadAt;
      const col = edge ? dark : (rgba[k] ?? ([128, 128, 128] as RGB3));
      img.data[o] = col[0] as number;
      img.data[o + 1] = col[1] as number;
      img.data[o + 2] = col[2] as number;
      img.data[o + 3] = 255;
    }
  }
  const layer = document.createElement("canvas");
  layer.width = w;
  layer.height = h;
  layer.getContext("2d")?.putImageData(img, 0, 0);
  c.drawImage(layer, 0, 0);
}

const PAINTERS: Record<Exclude<TextureId, "none">, (c: Ctx, w: number, h: number, r: Rng) => void> = {
  marble(c, w, h, r) {
    c.globalCompositeOperation = "multiply";
    blot(c, w * 0.3, h * 0.3, w * 0.6, "#ddd", 0.5);
    c.lineCap = "round";
    for (let i = 0; i < 12; i++) {
      c.beginPath();
      let x = r() * w;
      let y = r() * h;
      c.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += (r() - 0.35) * w * 0.3;
        y += (r() - 0.5) * h * 0.3;
        c.quadraticCurveTo(x - (r() - 0.5) * 40, y - (r() - 0.5) * 40, x, y);
      }
      c.globalAlpha = 0.25 + r() * 0.35;
      c.lineWidth = 0.6 + r() * 2.4;
      c.strokeStyle = r() < 0.7 ? "#6a6a72" : "#a8a8b0";
      c.stroke();
    }
    c.globalAlpha = 1;
  },
  speckles(c, w, h, r) {
    c.globalCompositeOperation = "multiply";
    for (let i = 0; i < (w * h) / 40; i++) {
      c.fillStyle = r() < 0.6 ? "#555" : "#bbb";
      c.globalAlpha = 0.4 + r() * 0.5;
      const d = 0.8 + r() * 2.2;
      c.fillRect(r() * w, r() * h, d, d);
    }
    c.globalAlpha = 1;
  },
  glitter(c, w, h, r) {
    for (let i = 0; i < (w * h) / 36; i++) {
      c.globalAlpha = 0.35 + r() * 0.65;
      c.fillStyle = ["#ffffff", "#fff3b0", "#bfe9ff", "#ffd1f0"][Math.floor(r() * 4)] as string;
      const d = 0.8 + r() * 2.4;
      c.fillRect(r() * w, r() * h, d, d);
    }
    c.globalAlpha = 1;
  },
  stars(c, w, h, r) {
    for (let i = 0; i < (w * h) / 900; i++) {
      const x = r() * w;
      const y = r() * h;
      const s = 2.5 + r() * 5;
      c.globalAlpha = 0.7 + r() * 0.3;
      c.fillStyle = r() < 0.5 ? "#ffe9a8" : "#ffffff";
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI) / 5 - Math.PI / 2;
        const rad = k % 2 === 0 ? s : s * 0.42;
        c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      }
      c.closePath();
      c.fill();
    }
    c.globalAlpha = 1;
  },
  astral(c, w, h, r) {
    c.globalCompositeOperation = "multiply";
    for (let i = 0; i < 9; i++) blot(c, r() * w, r() * h, w * (0.25 + r() * 0.3), ["#5b3fa8", "#2a5fc4", "#a33fa0", "#1f9fb0"][i % 4] as string, 0.75);
    c.globalCompositeOperation = "source-over";
    for (let i = 0; i < (w * h) / 500; i++) {
      c.globalAlpha = 0.4 + r() * 0.6;
      c.fillStyle = "#fff";
      const d = 0.7 + r() * 1.6;
      c.fillRect(r() * w, r() * h, d, d);
    }
    c.globalAlpha = 1;
  },
  cloudy(c, w, h, r) {
    c.globalCompositeOperation = "multiply";
    for (let i = 0; i < 10; i++) blot(c, r() * w, r() * h, w * (0.18 + r() * 0.22), "#8f98a8", 0.5);
    c.globalCompositeOperation = "source-over";
    for (let i = 0; i < 14; i++) blot(c, r() * w, r() * h, w * (0.12 + r() * 0.2), "#ffffff", 0.55);
  },
  fire(c, w, h, r) {
    c.globalCompositeOperation = "multiply";
    const g = c.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, "#c8281a");
    g.addColorStop(0.5, "#ff7a14");
    g.addColorStop(1, "#ffd23a");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = "source-over";
    for (let i = 0; i < w / 14; i++) {
      const x = r() * w;
      const y = h * (0.35 + r() * 0.65);
      const hh = h * (0.25 + r() * 0.4);
      c.beginPath();
      c.moveTo(x - 7, y);
      c.quadraticCurveTo(x - 3, y - hh * 0.5, x + (r() - 0.5) * 8, y - hh);
      c.quadraticCurveTo(x + 4, y - hh * 0.5, x + 7, y);
      c.closePath();
      c.fillStyle = r() < 0.5 ? "rgba(255,235,120,.75)" : "rgba(255,140,30,.6)";
      c.fill();
    }
  },
  water(c, w, h, r) {
    c.globalCompositeOperation = "multiply";
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#b7e0ff");
    g.addColorStop(1, "#6fb4f0");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = "source-over";
    c.lineCap = "round";
    for (let y = 4; y < h; y += 7 + r() * 6) {
      c.beginPath();
      c.moveTo(0, y);
      for (let x = 0; x <= w; x += 8) c.lineTo(x, y + Math.sin(x / 13 + y) * 3.2);
      c.strokeStyle = r() < 0.5 ? "rgba(255,255,255,.5)" : "rgba(20,70,140,.3)";
      c.lineWidth = 0.8 + r() * 1.8;
      c.stroke();
    }
  },
  ice(c, w, h, r) {
    c.globalCompositeOperation = "source-over";
    blot(c, w * 0.3, h * 0.25, w * 0.7, "#ffffff", 0.5);
    for (let i = 0; i < 16; i++) {
      let x = r() * w;
      let y = r() * h;
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (r() - 0.5) * w * 0.3;
        y += (r() - 0.5) * h * 0.3;
        c.lineTo(x, y);
      }
      c.strokeStyle = r() < 0.6 ? "rgba(255,255,255,.75)" : "rgba(60,140,190,.4)";
      c.lineWidth = 0.6 + r() * 1.4;
      c.stroke();
    }
    for (let i = 0; i < (w * h) / 600; i++) blot(c, r() * w, r() * h, 3 + r() * 5, "#ffffff", 0.7);
  },
  paper(c, w, h, r) {
    c.globalCompositeOperation = "multiply";
    c.fillStyle = "#f2e6c9";
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 22; i++) {
      c.globalAlpha = 0.05 + r() * 0.12;
      c.fillStyle = r() < 0.5 ? "#8a7a55" : "#fff";
      c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    for (let i = 0; i < 28; i++) {
      const x = r() * w;
      const y = r() * h;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.5) * 18);
      c.strokeStyle = "#9a8a62";
      c.globalAlpha = 0.25;
      c.lineWidth = 0.6;
      c.stroke();
    }
    c.globalAlpha = 1;
  },
  wood(c, w, h, r) {
    c.globalCompositeOperation = "multiply";
    c.fillStyle = "#d9a867";
    c.fillRect(0, 0, w, h);
    for (let y = -4; y < h + 4; y += 2.5 + r() * 4) {
      c.beginPath();
      c.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) c.lineTo(x, y + Math.sin(x / 29 + y * 0.7) * 2.4 + (r() - 0.5));
      c.globalAlpha = 0.2 + r() * 0.35;
      c.lineWidth = 0.6 + r() * 1.8;
      c.strokeStyle = r() < 0.7 ? "#5d3a17" : "#f0cf9a";
      c.stroke();
    }
    c.globalAlpha = 1;
  },
  metal(c, w, h, r) {
    c.globalCompositeOperation = "multiply";
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#f4f6f8");
    g.addColorStop(0.5, "#aab0b8");
    g.addColorStop(1, "#e8ebee");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 1 + r() * 1.6) {
      c.globalAlpha = 0.08 + r() * 0.2;
      c.fillStyle = r() < 0.5 ? "#444" : "#fff";
      c.fillRect(0, y, w, 1);
    }
    c.globalAlpha = 1;
  },
  stainedglass(c, w, h, r) {
    cells(c, w, h, Math.round((w * h) / 1500), r, (i) => hsl((i * 47) % 360, 70, 58 + (i % 3) * 8), [26, 26, 34], 3.2);
  },
  skulls(c, w, h, r) {
    const s = U * 0.2;
    for (let row = 0; row * s * 1.6 < h + s; row++) {
      for (let col = 0; col * s * 1.4 < w + s; col++) {
        const x = col * s * 1.4 + (row % 2 ? s * 0.7 : 0);
        const y = row * s * 1.6;
        c.globalAlpha = 0.5 + r() * 0.15;
        c.fillStyle = "#e9e5d6";
        c.beginPath();
        c.arc(x, y, s * 0.5, Math.PI, 0);
        c.lineTo(x + s * 0.34, y + s * 0.35);
        c.lineTo(x + s * 0.34, y + s * 0.55);
        c.lineTo(x - s * 0.34, y + s * 0.55);
        c.lineTo(x - s * 0.34, y + s * 0.35);
        c.closePath();
        c.fill();
        c.fillStyle = "#1a1a1a";
        c.beginPath();
        c.arc(x - s * 0.19, y, s * 0.12, 0, Math.PI * 2);
        c.arc(x + s * 0.19, y, s * 0.12, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.globalAlpha = 1;
  },
  dragon(c, w, h, r) {
    c.globalCompositeOperation = "multiply";
    const s = U * 0.16;
    for (let row = 0; row * s * 0.55 < h + s; row++) {
      for (let col = -1; col * s < w + s; col++) {
        const x = col * s + (row % 2 ? s / 2 : 0);
        const y = row * s * 0.55;
        const g = c.createRadialGradient(x, y + s * 0.2, 0, x, y + s * 0.2, s * 0.6);
        g.addColorStop(0, "#f4ecb8");
        g.addColorStop(1, r() < 0.5 ? "#7fa860" : "#5f8a48");
        c.fillStyle = g;
        c.strokeStyle = "rgba(20,40,20,.8)";
        c.lineWidth = 1;
        c.beginPath();
        c.arc(x, y, s / 2, 0, Math.PI);
        c.closePath();
        c.fill();
        c.stroke();
      }
    }
  },
  leopard(c, w, h, r) {
    c.globalCompositeOperation = "multiply";
    c.fillStyle = "#f0c47a";
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 900; i++) {
      const x = r() * w;
      const y = r() * h;
      const s = 4 + r() * 5;
      c.strokeStyle = "#3a2410";
      c.lineWidth = 1.6 + r();
      c.beginPath();
      c.arc(x, y, s, 0.3, Math.PI * 1.7);
      c.stroke();
      c.fillStyle = "rgba(160,100,40,.5)";
      c.beginPath();
      c.arc(x, y, s * 0.7, 0, Math.PI * 2);
      c.fill();
    }
  },
  tiger(c, w, h, r) {
    c.globalCompositeOperation = "multiply";
    c.fillStyle = "#f4a04a";
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < w / 9; i++) {
      const x = r() * w;
      c.beginPath();
      c.moveTo(x, -4);
      for (let y = 0; y <= h + 8; y += 12) c.lineTo(x + Math.sin(y / 17 + i) * 6, y);
      c.lineTo(x + 5, h + 4);
      for (let y = h + 8; y >= 0; y -= 12) c.lineTo(x + 3 + Math.sin(y / 17 + i) * 6, y);
      c.fillStyle = "#1a0f08";
      c.globalAlpha = 0.65 + r() * 0.3;
      c.fill();
    }
    c.globalAlpha = 1;
  },
  lizard(c, w, h, r) {
    c.globalCompositeOperation = "multiply";
    cells(c, w, h, Math.round((w * h) / 130), r, (i) => hsl(70 + ((i * 13) % 40), 35 + (i % 4) * 8, 48 + (i % 5) * 5), [35, 48, 24], 1.6);
  },
  bird(c, w, h, r) {
    c.globalCompositeOperation = "multiply";
    c.fillStyle = "#e9dcc0";
    c.fillRect(0, 0, w, h);
    c.lineCap = "round";
    for (let f = 0; f < 4; f++) {
      const x0 = r() * w;
      const y0 = h * (0.9 + r() * 0.3);
      const len = h * (0.9 + r() * 0.5);
      const lean = (r() - 0.5) * 0.6;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x0 + lean * len, y0 - len);
      c.strokeStyle = "#6b5a3a";
      c.lineWidth = 1.4;
      c.stroke();
      for (let t = 0.05; t < 1; t += 0.035) {
        const px = x0 + lean * len * t;
        const py = y0 - len * t;
        const b = 9 * (1 - t * 0.6);
        for (const side of [-1, 1]) {
          c.beginPath();
          c.moveTo(px, py);
          c.lineTo(px + side * b, py - b * 0.7);
          c.strokeStyle = r() < 0.5 ? "rgba(90,70,40,.55)" : "rgba(180,150,100,.5)";
          c.lineWidth = 0.9;
          c.stroke();
        }
      }
    }
  },
};

/** The original picture of each texture (MajorVictory's 3DDiceRoller, The
 *  Unlicense): loaded from the app's own `dice-textures/` folder, nothing
 *  from the network, once each. A picture that does not load is left out and
 *  its texture is drawn by the painters above, so a die never lacks one. */
export async function loadTextureImages(kinds: readonly TextureId[]): Promise<Map<TextureId, HTMLImageElement>> {
  const out = new Map<TextureId, HTMLImageElement>();
  await Promise.all(
    [...new Set(kinds)].map(
      (kind) =>
        new Promise<void>((done) => {
          const file = TEXTURE_FILES[kind];
          if (!file) return done();
          const img = new Image();
          img.onload = () => {
            out.set(kind, img);
            done();
          };
          img.onerror = () => done();
          img.src = new URL(`dice-textures/${file}`, document.baseURI).href;
        }),
    ),
  );
  return out;
}

/** Textures whose picture lets the body show through: laid over it, not
 *  multiplied. */
const OVERLAY: ReadonlySet<TextureId> = new Set(["cloudy", "water", "ice"]);

/** Paint texture `kind` over the body colour already on `c` (`w` x `h`):
 *  with the original `image` when one is given, else with our painter. A
 *  seeded run: the same texture twice gives the same picture. */
export function paintTexture(c: CanvasRenderingContext2D, w: number, h: number, kind: TextureId, seed = 7, image?: HTMLImageElement): void {
  if (kind === "none") return;
  c.save();
  if (image) {
    const pattern = c.createPattern(image, "repeat");
    if (pattern) {
      // One picture covers one atlas cell, whatever its own size.
      pattern.setTransform(new DOMMatrix().scale(U / image.width, U / image.height));
      c.globalCompositeOperation = OVERLAY.has(kind) ? "source-over" : "multiply";
      c.globalAlpha = OVERLAY.has(kind) ? 0.6 : 1;
      c.fillStyle = pattern;
      c.fillRect(0, 0, w, h);
    }
  } else PAINTERS[kind](c, w, h, seeded(seed + kind.length * 131 + w));
  c.restore();
}

/** The textures this module can paint, for a test to compare with the list. */
export const PAINTED: readonly string[] = Object.keys(PAINTERS);
