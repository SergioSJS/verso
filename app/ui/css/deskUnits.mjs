// The units of a phone shown the desktop site (src/deskOnPhone.ts). The
// window is zoomed there, and a zoom leaves `vw`, `vh` and `dvh` as they
// were: a dialog of `min(44rem, 92vw)` is wider than the screen it is
// scaled onto. The bundle (css/bundle.mjs) therefore ends with a copy of
// every rule that uses those units, under `:where(html.desk-on-phone)` — no added specificity, so a later rule of the
// same weight (`body.no-right`) still wins as it did — written
// with `--u-vw` / `--u-vh` — one percent of the zoomed viewport — which
// touch.css defines. Nothing is written by hand twice: a new rule in vh
// has its copy at the next build.

const UNIT = /(-?\d*\.?\d+)(dvh|svh|lvh|vh|dvw|svw|lvw|vw)\b/g;

/** `92vw` → `calc(92 * var(--u-vw))`. */
export function scaleUnits(value) {
  return value.replace(UNIT, (_m, n, u) => `calc(${n} * var(--u-${u.endsWith("w") ? "vw" : "vh"}))`);
}

function blocks(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") depth--;
      j++;
    }
    out.push({ head: src.slice(i, open).trim(), body: src.slice(open + 1, j - 1) });
    i = j;
  }
  return out;
}

function scope(selector) {
  const s = selector.trim();
  if (/^(:root|html)\b/.test(s)) return s.startsWith(":root") ? "" : s.replace(/^html/, "html:where(.desk-on-phone)");
  return `:where(html.desk-on-phone) ${s}`;
}

function copy(src) {
  let out = "";
  for (const { head, body } of blocks(src)) {
    if (/^@(media|container|supports)/.test(head)) {
      const inner = copy(body);
      if (inner) out += `${head} {\n${inner}}\n`;
    } else if (!head.startsWith("@")) {
      const used = body.split(";").map((d) => d.trim()).filter((d) => d && !d.includes("--u-") && new RegExp(UNIT.source).test(d));
      if (!used.length) continue;
      const sels = head.split(",").map(scope).filter(Boolean);
      if (!sels.length) continue;
      out += `${sels.join(", ")} { ${used.map(scaleUnits).join("; ")}; }\n`;
    }
  }
  return out;
}

/** The copy of `css` for the zoomed page, comments left out. */
export function deskCopy(css) {
  return copy(css.replace(/\/\*[\s\S]*?\*\//g, ""));
}
