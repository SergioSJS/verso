// A board on a phone (2026-11-15, the maintainer's option C; ADR 0076 item
// 15): the board's verbs move to the ⋯ sheet's "Board" section
// (board/phoneVerbs.ts) — a writer's what-to-put-on-it first, then what reads
// it; a reader keeps only the latter. The layout (css/boardphone.css): held
// upright the tools are one bar at the foot, held sideways one column at the
// right edge — on a phone's screen exactly one of the two, never on a
// desktop's or a tablet's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/board/phoneVerbs.ts"], bundle: true, format: "esm", platform: "node", jsx: "automatic", outfile: "test/.bundles/boardPhone.test-bundle.mjs", logLevel: "error" });
const { boardVerbs } = await import("./.bundles/boardPhone.test-bundle.mjs");
await esbuild.build({ entryPoints: ["src/board/strings.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/boardPhoneStrings.test-bundle.mjs", logLevel: "error" });
const { boardStrings } = await import("./.bundles/boardPhoneStrings.test-bundle.mjs");

const ran = [];
const deps = (over = {}) => ({
  s: boardStrings("pt-BR"),
  writable: true,
  web: false,
  looseOn: false,
  outlineOn: false,
  ...Object.fromEntries(["addText", "addImage", "addFile", "addLink", "addPage", "toggleLoose", "search", "outline", "menu"].map((k) => [k, () => ran.push(k)])),
  ...over,
});

test("a writer's board: what puts on it, the free arrows, then search, outline and Excalidraw's menu", () => {
  const ids = boardVerbs(deps()).map((v) => v.id);
  assert.deepEqual(ids, ["text", "image", "file", "link", "loose", "search", "outline", "menu"]);
});

test("a window that shows web pages offers the page card, after the link", () => {
  const ids = boardVerbs(deps({ web: true })).map((v) => v.id);
  assert.deepEqual(ids.slice(3, 6), ["link", "page", "loose"]);
});

test("a reader's board only reads: search, outline and the menu", () => {
  assert.deepEqual(boardVerbs(deps({ writable: false })).map((v) => v.id), ["search", "outline", "menu"]);
});

test("the free arrows and the outline say whether they are on; each verb runs its own", () => {
  const verbs = boardVerbs(deps({ looseOn: true, outlineOn: false }));
  const by = Object.fromEntries(verbs.map((v) => [v.id, v]));
  assert.equal(by.loose.pressed, true);
  assert.equal(by.outline.pressed, false);
  assert.equal(by.text.pressed, undefined);
  ran.length = 0;
  for (const v of verbs) v.run();
  assert.deepEqual(ran, ["addText", "addImage", "addFile", "addLink", "toggleLoose", "search", "outline", "menu"]);
  for (const v of verbs) assert.ok(v.label.trim().length > 0 && v.icon.startsWith("M"), `${v.id} has a name and an icon`);
});

test("both languages name every verb", () => {
  for (const lang of ["pt-BR", "en"]) {
    const s = boardStrings(lang);
    for (const v of boardVerbs(deps({ s, web: true }))) assert.ok(v.label.length > 0, `${lang} ${v.id}`);
    for (const k of ["sheetImage", "sheetFile", "sheetLink", "sheetMenu", "closeOutline", "looseHintPhone", "looseOnHintPhone", "drawingShort"]) assert.ok(s[k].length > 0, `${lang} ${k}`);
  }
});

// ---- The layout's media blocks ---------------------------------------------

const css = readFileSync(new URL("../css/boardphone.css", import.meta.url), "utf8");
const PHONE = "(max-width: 760px), (pointer: coarse) and (max-height: 500px)";
/** Top-level media blocks: their query and body. */
const blocks = [...css.matchAll(/^@media ([^{]+)\{([\s\S]*?)\n\}/gm)].map((m) => ({ query: m[1].trim(), body: m[2] }));

function matches(query, s) {
  const feature = (f) => {
    const [name, value] = f.replace(/[()]/g, "").split(":").map((x) => x.trim());
    const px = parseFloat(value);
    switch (name) {
      case "pointer": return s.pointer === value;
      case "max-width": return s.w <= px;
      case "max-height": return s.h <= px;
      case "orientation": return (s.w > s.h ? "landscape" : "portrait") === value;
      case "forced-colors": return false;
      default: throw new Error(`unknown feature ${name}`);
    }
  };
  return query.split(",").some((alt) => alt.split(/\band\b/).every((f) => feature(f.trim())));
}

const SCREENS = [
  { name: "phone upright", w: 390, h: 844, pointer: "coarse", phone: true },
  { name: "phone sideways", w: 844, h: 390, pointer: "coarse", phone: true },
  { name: "big phone sideways", w: 932, h: 430, pointer: "coarse", phone: true },
  { name: "narrow desktop window", w: 600, h: 900, pointer: "fine", phone: true },
  { name: "tablet upright", w: 820, h: 1180, pointer: "coarse", phone: false },
  { name: "tablet sideways", w: 1180, h: 820, pointer: "coarse", phone: false },
  { name: "desktop", w: 1500, h: 1000, pointer: "fine", phone: false },
];

test("the bar and the column: exactly one on a phone's screen, neither elsewhere", () => {
  const bar = blocks.find((b) => b.body.includes("flex-direction: column !important; align-items: stretch"));
  const rail = blocks.find((b) => b.body.includes("--rail:"));
  assert.ok(bar && rail, "both blocks found");
  for (const s of SCREENS) {
    assert.equal(matches(PHONE, s), s.phone, `${s.name} is ${s.phone ? "" : "not "}a phone`);
    const n = Number(matches(bar.query, s)) + Number(matches(rail.query, s));
    assert.equal(n, s.phone ? 1 : 0, s.name);
  }
  assert.ok(matches(rail.query, SCREENS[1]) && matches(bar.query, SCREENS[0]), "sideways is the column, upright the bar");
});

test("the app's bottom bar gives way only on a phone, and only to a board that draws", () => {
  const hide = blocks.filter((b) => /\.bottom-bar \{ display: none/.test(b.body));
  assert.equal(hide.length, 1);
  assert.equal(hide[0].query, PHONE);
  assert.match(hide[0].body, /html:has\(\.leaf\.board-face:not\(\[hidden\]\) \.excalidraw--mobile-toolbar\) \.bottom-bar/);
});
