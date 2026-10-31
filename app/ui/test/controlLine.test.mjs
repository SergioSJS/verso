// The controls' line (WCAG 1.4.11, A11Y.4): --control-line must reach 3:1
// against every paper of every palette, light and dark, in every dark tone.
// The values are read from css/base.css, not copied here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../css/base.css", import.meta.url), "utf8");

const TONES = { soft: { lift: 4.5, dim: 3.5, up: 4.5 }, deep: { lift: 0, dim: 0, up: 0 }, dusk: { lift: 8, dim: 4.5, up: 8.5 } };
const PALETTES = ["paper", "sepia", "slate", "moss"];

// Find `--name: light-dark(A, B)` in a block of text; returns [A, B].
function lightDark(text, name) {
  const m = text.match(new RegExp(`--${name}:\\s*light-dark\\((oklch\\([^)]*(?:\\([^)]*\\)[^)]*)*\\)),\\s*(oklch\\(.*?\\))\\)\\s*;`));
  if (!m) return null;
  return [m[1], m[2]];
}

function evalOklch(src, tone) {
  const s = src
    .replace(/calc\(([\d.]+)% ([+-]) var\(--dk-(lift|dim|up)\)\)/g, (_, n, op, k) => {
      const v = Number(n) + (op === "+" ? 1 : -1) * tone[k];
      return `${v}%`;
    });
  const m = s.match(/oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/);
  assert.ok(m, `cannot parse ${src}`);
  return { L: Number(m[1]) / 100, C: Number(m[2]), h: Number(m[3]) };
}

function toRgb({ L, C, h }) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v))); // already linear
}

const lum = (c) => { const [r, g, b] = toRgb(c); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

function paperTokens(palette) {
  if (palette === "paper") return css;
  const line = css.split("\n").find((l) => l.startsWith(`:root[data-palette="${palette}"]`));
  assert.ok(line, `palette ${palette}`);
  return line;
}

test("--control-line is defined for light and dark", () => {
  assert.ok(lightDark(css, "control-line"), "--control-line: light-dark(...) in base.css");
});

test("--control-line reaches 3:1 on every paper, palette, mode and tone", () => {
  const [lightLine, darkLine] = lightDark(css, "control-line");
  for (const palette of PALETTES) {
    const src = paperTokens(palette);
    for (const [toneName, tone] of Object.entries(TONES)) {
      for (const [mode, idx, line] of [["light", 0, lightLine], ["dark", 1, darkLine]]) {
        const lineC = evalOklch(line, tone);
        for (const p of ["paper", "paper-2", "paper-3"]) {
          const pair = lightDark(src, p);
          assert.ok(pair, `${palette} ${p}`);
          const r = ratio(lineC, evalOklch(pair[idx], tone));
          assert.ok(r >= 3, `${palette}/${toneName}/${mode}/${p}: ${r.toFixed(2)}:1`);
        }
      }
    }
  }
});

test("the page hairline stays a hairline (under 3:1)", () => {
  const [l] = lightDark(css, "hair");
  assert.ok(ratio(evalOklch(l, TONES.soft), evalOklch(lightDark(css, "paper")[0], TONES.soft)) < 3);
});

if (process.env.PRINT_RATIOS) {
  const [ll, dl] = lightDark(css, "control-line");
  const out = {};
  for (const palette of PALETTES) for (const [tn, tone] of Object.entries(TONES)) for (const [mode, idx, line] of [["light", 0, ll], ["dark", 1, dl]]) for (const p of ["paper", "paper-2", "paper-3"]) {
    const r = ratio(evalOklch(line, tone), evalOklch(lightDark(paperTokens(palette), p)[idx], tone));
    const k = mode + (mode === "dark" ? "/" + tn : "");
    out[k] = Math.min(out[k] ?? 99, r);
  }
  console.log(out);
}
