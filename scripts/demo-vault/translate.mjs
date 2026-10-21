// The boards' words in the language of the vault being built (ADR 0058,
// point 15). The modules `tour.mjs` and `treino.mjs` are written once, in
// Portuguese; the English board is the same drawing with each text said
// by `en-boards.mjs` — a list of [Portuguese text, English text] — and each
// file path said by `names.mjs`. A text the list does not hold is an
// error that names it (so a lesson changed in Portuguese fails the English
// build until its twin is changed), and so is a text the list holds that no
// board says any more.
//
// A text without a word in it (a key cap's arrow, a number, ✕) is left as
// it is. A text may start with a mark that is not a word (① , 1 · , 🧭 ):
// it is kept, and the rest is looked up. A Portuguese text with `{n}` in
// it stands for the same text with any whole number there.

import { NAMES, english } from "./names.mjs";
import { PAIRS } from "./en-boards.mjs";

const hasWord = (s) => /\p{L}{3,}/u.test(s);

/** `{ tr, name, missing, unused }` for `lang`: "pt" is the identity. */
export function translator(lang) {
  if (lang === "pt") return { tr: (s) => s, name: (p) => p, missing: () => [], unused: () => [] };
  const exact = new Map();
  const patterns = [];
  const used = new Set();
  for (const [pt, en] of PAIRS) {
    if (!pt.includes("{n}")) exact.set(pt, en);
    else {
      const escaped = pt.split("{n}").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      patterns.push({ pt, en, re: new RegExp(`^${escaped.join("(\\d+)")}$`) });
    }
  }
  const missing = new Set();
  const lookup = (s) => {
    if (exact.has(s)) {
      used.add(s);
      return exact.get(s);
    }
    for (const p of patterns) {
      const m = p.re.exec(s);
      if (m) {
        used.add(p.pt);
        return p.en.replace("{n}", m[1]);
      }
    }
    return undefined;
  };
  const tr = (s) => {
    if (!hasWord(s)) return s;
    const whole = lookup(s);
    if (whole !== undefined) return whole;
    const [, mark, rest] = /^([^\p{L}]*\s)?([\s\S]*)$/u.exec(s);
    if (mark && rest !== "") {
      const part = lookup(rest);
      if (part !== undefined) return mark + part;
    }
    missing.add(mark && rest !== "" ? rest : s);
    return s;
  };
  const name = (p) => {
    const to = english(p);
    if (to === undefined) {
      missing.add(`file ${p}`);
      return p;
    }
    return to;
  };
  return {
    tr,
    name,
    missing: () => [...missing],
    unused: () => PAIRS.map(([pt]) => pt).filter((pt) => !used.has(pt)),
  };
}

export { NAMES };
