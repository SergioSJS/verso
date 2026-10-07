// Compiles a compact emoji dataset from cldr-annotations-modern (Unicode-3.0)
// for pt-BR and EN search and sticker rendering in Verso (ADR 0060, S1).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cldrDir = path.resolve(__dirname, "../app/ui/node_modules/cldr-annotations-modern/annotations");

const ptRaw = JSON.parse(fs.readFileSync(path.join(cldrDir, "pt/annotations.json"), "utf8"));
const enRaw = JSON.parse(fs.readFileSync(path.join(cldrDir, "en/annotations.json"), "utf8"));

const ptAnno = ptRaw.annotations.annotations;
const enAnno = enRaw.annotations.annotations;

function toHex(char) {
  const points = [];
  for (const sym of char) {
    points.push(sym.codePointAt(0).toString(16));
  }
  return points.join("-");
}

const emojis = [];
for (const [char, ptData] of Object.entries(ptAnno)) {
  if (char.codePointAt(0) < 128) continue;
  const cp = char.codePointAt(0);
  if (cp >= 0x1f3fb && cp <= 0x1f3ff) continue;
  if (!/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(char)) continue;

  const enData = enAnno[char] || { default: [], tts: [] };
  const hex = toHex(char);
  const namePt = (ptData.tts && ptData.tts[0]) || "";
  const nameEn = (enData.tts && enData.tts[0]) || "";
  const ptKw = Array.isArray(ptData.default) ? ptData.default : [];
  const enKw = Array.isArray(enData.default) ? enData.default : [];
  const kwSet = new Set(
    [...ptKw, ...enKw, namePt, nameEn]
      .map((k) => k.toLowerCase().trim())
      .filter(Boolean)
  );
  emojis.push({
    c: char,
    h: hex,
    pt: namePt,
    en: nameEn,
    kw: Array.from(kwSet).join(" "),
  });
}

const outPath = path.resolve(__dirname, "../app/ui/src/emoji-data.json");
fs.writeFileSync(outPath, JSON.stringify(emojis));
console.log(`Wrote ${emojis.length} emojis to ${outPath}`);
