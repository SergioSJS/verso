// The import of maps exported from Watabou's generators (ADR 0120): what
// the files are, the dungeon drawn from its cells with its walls kept, and
// the notes written. The samples in test/watabou/ are exports of
// watabou.github.io (One Page Dungeon v1.2.7, seed 12345; a region of
// Perilous Shores v2.0.1, seed 944459915, cut down to its towns and
// dangers); generated maps are free to use, by Watabou's FAQ.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/watabou/generators.ts", "src/watabou/detect.ts", "src/watabou/draw.ts", "src/watabou/notes.ts", "src/watabou/region.ts", "src/watabou/dungeon.ts", "src/board/model.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outdir: "test/.bundles/watabou",
  outExtension: { ".js": ".mjs" },
  logLevel: "error",
});
const detect = await import("./.bundles/watabou/watabou/detect.mjs");
const draw = await import("./.bundles/watabou/watabou/draw.mjs");
const notes = await import("./.bundles/watabou/watabou/notes.mjs");
const region = await import("./.bundles/watabou/watabou/region.mjs");
const dungeon = await import("./.bundles/watabou/watabou/dungeon.mjs");
const model = await import("./.bundles/watabou/board/model.mjs");
const gens = await import("./.bundles/watabou/watabou/generators.mjs");

const sample = (n) => readFileSync(new URL(`./watabou/${n}`, import.meta.url), "utf8");
const JSON_TEXT = sample("swamp_citadel_of_uadjed.json");
const MD_TEXT = sample("swamp_citadel_of_uadjed.md");
const REGION_TEXT = sample("preter_fjord.trimmed.json");
const given = (name, text) => ({ name, text, size: text?.length ?? 0 });
const EN = { towns: "Towns", dangers: "Dangers", places: "Places", openGenerator: "Open in the generator" };
const PT = { towns: "Cidades", dangers: "Perigos", places: "Lugares", openGenerator: "Abrir no gerador" };

describe("What the files are", () => {
  test("a One Page Dungeon's JSON, its Markdown, a region, a picture", () => {
    assert.equal(detect.see(given("a.json", JSON_TEXT)).kind, "dungeonJson");
    assert.equal(detect.see(given("a.md", MD_TEXT)).kind, "dungeonMd");
    assert.equal(detect.see(given("r.json", REGION_TEXT)).kind, "region");
    assert.equal(detect.see(given("a.png", null)).kind, "picture");
  });

  test("by what they hold, not by their names", () => {
    assert.equal(detect.see(given("whatever.txt", JSON_TEXT)).kind, "dungeonJson");
    assert.equal(detect.see(given("dungeon.json", '{"rooms":[]}')).kind, "unknown");
    assert.equal(detect.see(given("dungeon.json", "{not json")).kind, "unknown");
    assert.equal(detect.see(given("notes.md", "# A note\n\nNothing of a generator.")).kind, "unknown");
  });

  test("a city's GeoJSON and a house are named as other generators", () => {
    const city = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", id: "values", generator: "mfcg", version: "0.11.5" }] });
    assert.deepEqual(detect.see(given("c.json", city)), { kind: "other", generator: "mfcg" });
    assert.deepEqual(detect.see(given("h.json", '{"floors":[]}')), { kind: "other", generator: "dwellings" });
    const p = detect.plan([given("c.json", city)]);
    assert.equal(p.kind, "none");
    assert.equal(p.why, "other");
  });

  test("the JSON and the Markdown of a dungeon make one import, the Markdown giving the seed", () => {
    const p = detect.plan([given("s.json", JSON_TEXT), given("s.md", MD_TEXT), given("s.png", null)]);
    assert.equal(p.kind, "dungeon");
    assert.equal(p.title, "Swamp Citadel of Uadjed");
    assert.equal(p.md.text.seed, "12345");
    assert.equal(p.keys, 4);
    assert.deepEqual(p.pictures, ["s.png"]);
  });

  test("one map at a time", () => {
    assert.equal(detect.plan([given("a.json", JSON_TEXT), given("b.json", JSON_TEXT)]).why, "two");
    assert.equal(detect.plan([given("a.json", JSON_TEXT), given("r.json", REGION_TEXT)]).why, "two");
    assert.equal(detect.plan([]).why, "empty");
  });
});

describe("The dungeon's files, read", () => {
  test("rooms, doors, keys in their numbers' order, columns, water", () => {
    const d = dungeon.readDungeon(JSON.parse(JSON_TEXT));
    assert.equal(d.version, "1.2.7");
    assert.equal(d.rects.length, 70);
    assert.equal(d.rects.filter((r) => r.ending).length, 1);
    assert.equal(d.doors.length, 37);
    assert.deepEqual(d.keys.map((k) => k.ref), ["1", "2", "3", "4"]);
    assert.deepEqual(d.doors[0], { x: 0, y: 0, dx: 1, dy: 0, type: 3 });
    assert.equal(d.columns.length, 8);
    assert.ok(d.water.length > 100);
  });

  test("entries that are not what they should be are left out, one by one", () => {
    const d = dungeon.readDungeon({ title: "T", rects: [{ x: 0, y: 0, w: 2, h: 2 }, { x: "a" }, { x: 0, y: 0, w: 0, h: 3 }, null, { x: 1e9, y: 0, w: 1, h: 1 }], doors: [{ x: 1 }, 5], notes: [{ text: 3 }, { text: "ok", ref: 2 }] });
    assert.equal(d.rects.length, 1);
    assert.equal(d.doors.length, 0);
    assert.deepEqual(d.keys.map((k) => [k.ref, k.text]), [["2", "ok"]]);
  });

  test("a dungeon with no room, or far more than one holds, is none", () => {
    assert.equal(dungeon.readDungeon({ title: "T", rects: [] }), null);
    const many = Array.from({ length: dungeon.MAX_RECTS + 1 }, (_, i) => ({ x: i, y: 0, w: 1, h: 1 }));
    assert.equal(dungeon.readDungeon({ title: "T", rects: many }), null);
  });

  test("the Markdown: title, story, numbered keys, the permalink and its seed", () => {
    const m = dungeon.readDungeonMarkdown(MD_TEXT);
    assert.equal(m.title, "Swamp Citadel of Uadjed");
    assert.match(m.story, /^After being destroyed/);
    assert.equal(m.keys.length, 4);
    assert.equal(m.keys[3].text, "A lavishly decorated door with two keyholes on the western wall of the hall.");
    assert.equal(m.link, "https://watabou.github.io/one-page-dungeon/?seed=12345");
    assert.equal(m.seed, "12345");
  });
});

/** Every edge between a floor cell and a cell that is not floor, in cells. */
function boundary(cells) {
  const out = new Set();
  for (const c of cells) {
    const [x, y] = c.split(",").map(Number);
    if (!cells.has(`${x},${y - 1}`)) out.add(`h${x},${y}`);
    if (!cells.has(`${x},${y + 1}`)) out.add(`h${x},${y + 1}`);
    if (!cells.has(`${x - 1},${y}`)) out.add(`v${x},${y}`);
    if (!cells.has(`${x + 1},${y}`)) out.add(`v${x + 1},${y}`);
  }
  return out;
}

describe("Verso's drawing of the dungeon", () => {
  const d = dungeon.readDungeon(JSON.parse(JSON_TEXT));
  const drawn = draw.drawDungeon(d);
  const C = draw.CELL;

  test("the walls run exactly along the floor's outline, closed, and nowhere else", () => {
    const cells = draw.floorCells(d);
    const want = boundary(cells);
    const got = new Set();
    const minX = Math.min(...d.rects.map((r) => r.x));
    const minY = Math.min(...d.rects.map((r) => r.y));
    for (const [x1, y1, x2, y2] of drawn.walls.lines) {
      assert.ok(x1 === x2 || y1 === y2, "a wall is straight");
      const [ax, bx] = [Math.min(x1, x2) / C + minX, Math.max(x1, x2) / C + minX];
      const [ay, by] = [Math.min(y1, y2) / C + minY, Math.max(y1, y2) / C + minY];
      if (y1 === y2) for (let x = ax; x < bx; x++) got.add(`h${x},${ay}`);
      else for (let y = ay; y < by; y++) got.add(`v${ax},${y}`);
    }
    assert.deepEqual([...got].sort(), [...want].sort());
  });

  test("each outline is one closed line of the drawing", () => {
    const lines = drawn.elements.filter((e) => e.type === "line" && e.strokeWidth === 4);
    assert.ok(lines.length >= 1);
    for (const l of lines) assert.deepEqual(l.points[0], l.points[l.points.length - 1]);
  });

  test("a room and corridor per shape, the keys' numbers at their rooms, one group, ids unique", () => {
    const rects = drawn.elements.filter((e) => e.type === "rectangle" && e.backgroundColor === "#ffffff" && e.strokeColor === "transparent");
    assert.equal(rects.length, d.rects.length);
    const numbers = drawn.elements.filter((e) => e.type === "text" && /^\d+$/.test(e.text));
    assert.deepEqual(numbers.map((n) => n.text).sort(), ["1", "2", "3", "4"]);
    for (const n of numbers) {
      assert.ok(n.x >= 0 && n.y >= 0 && n.x < drawn.box.width && n.y < drawn.box.height, `key ${n.text} inside the drawing`);
    }
    assert.equal(new Set(drawn.elements.map((e) => e.id)).size, drawn.elements.length);
    assert.equal(new Set(drawn.elements.map((e) => JSON.stringify(e.groupIds))).size, 1);
    assert.ok(drawn.elements.some((e) => e.type === "text" && e.text === "Swamp Citadel of Uadjed"));
  });

  test("every door is kept with the generator's number and the segment across its way", () => {
    assert.equal(drawn.walls.doors.length, d.doors.length);
    const first = drawn.walls.doors[0];
    assert.equal(first.type, 3);
    assert.equal(first.kind, "stairs");
    const [x1, y1, x2, y2] = first.line;
    assert.equal(x1, x2, "a way east–west is crossed north–south");
    assert.equal(Math.abs(y2 - y1), C);
    assert.equal(draw.doorKind(9), "open");
    assert.equal(draw.doorKind(1), "door");
  });

  test("two cells meeting at a corner keep their own walls; a hole has its own", () => {
    assert.equal(draw.outline(new Set(["0,0", "1,1"])).length, 2);
    for (const loop of draw.outline(new Set(["0,0", "1,1"]))) assert.equal(loop.length, 5);
    const ring = new Set();
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) if (!(x === 1 && y === 1)) ring.add(`${x},${y}`);
    assert.equal(draw.outline(ring).length, 2);
    const ell = draw.outline(new Set(["0,0", "0,1", "1,1"]));
    assert.equal(ell.length, 1);
    assert.equal(ell[0].length, 7, "an L has six corners");
  });

  test("the board: the drawing, the walls under verso, the note as a card; saved by the board unchanged", () => {
    const doc = draw.dungeonBoard(d, "Maps/Swamp/Swamp.md");
    assert.equal(doc.verso.version, 1);
    assert.equal(doc.verso.walls.generator, "one-page-dungeon");
    assert.deepEqual(doc.nodes.map((n) => [n.type, n.file]), [["file", "Maps/Swamp/Swamp.md"]]);
    assert.ok(doc.nodes[0].x > drawn.box.width, "the card is beside the drawing");
    // Read by the board and written back: the walls stay, and so does
    // every drawn element.
    const els = model.toElements(doc).map((e) => ({ isDeleted: false, ...e }));
    const back = model.fromElements(els, doc);
    assert.deepEqual(back.verso.walls, doc.verso.walls);
    assert.equal(back.verso.drawing.length, doc.verso.drawing.length);
    assert.equal(back.nodes.length, 1);
  });
});

describe("The notes", () => {
  const d = dungeon.readDungeon(JSON.parse(JSON_TEXT));
  const m = dungeon.readDungeonMarkdown(MD_TEXT);

  test("the dungeon's: its properties, then the generator's Markdown as it came", () => {
    const text = notes.dungeonNote({ json: d, md: m, board: "Maps/Swamp/Swamp.canvas", jsonFile: "Maps/Swamp/s.json", pictures: ["Maps/Swamp/s.png"] });
    const [, front, body] = text.split(/^---$/m);
    assert.match(front, /^generator: "one-page-dungeon"$/m);
    assert.match(front, /^generator_version: "1.2.7"$/m);
    assert.match(front, /^seed: 12345$/m);
    assert.match(front, /^generator_link: "https:\/\/watabou.github.io\/one-page-dungeon\/\?seed=12345"$/m);
    assert.match(front, /^map: "\[\[Swamp.canvas\]\]"$/m);
    assert.match(front, /^export: "\[\[s.json\]\]"$/m);
    assert.match(front, /^credit: "Watabou/m);
    assert.ok(body.startsWith(`\n${MD_TEXT.trimEnd()}`));
    assert.ok(text.endsWith("![[s.png]]\n"));
    assert.doesNotMatch(front, /^url:/m, "no url property: that would make it a web page's note");
  });

  test("without the Markdown, the same body from the JSON; no seed is invented", () => {
    const text = notes.dungeonNote({ json: d, md: null, board: null, jsonFile: null, pictures: [] });
    assert.doesNotMatch(text, /^seed:/m);
    assert.match(text, /^# Swamp Citadel of Uadjed$/m);
    for (const k of m.keys) assert.ok(text.includes(`${k.ref}. ${k.text}`), `key ${k.ref}`);
  });

  test("a string in the front matter is quoted, whatever it holds", () => {
    assert.equal(notes.frontMatter([["a", 'say "hi": #1\nnext'], ["b", null], ["c", []], ["d", ["x", "y"]]]), '---\na: "say \\"hi\\": #1\\nnext"\nd: ["x", "y"]\n---\n');
  });

  test("the region's: towns and dangers as links to notes made later, places, in the interface's words", () => {
    const r = region.readRegion(JSON.parse(REGION_TEXT));
    assert.equal(r.name, "Preter Fjord");
    assert.equal(r.seed, "944459915");
    for (const n of ["Westcot", "Sunscale", "Freecross", "Bar"]) assert.ok(r.towns.some((t) => t.name === n), n);
    assert.deepEqual(r.dangers.map((x) => x.name).sort(), ["Den Of Sorrows", "Veiled Palace"]);
    assert.deepEqual(r.places, ["Dark Ridge", "Winterpoint Woodland", "Summerwoods"]);
    const en = notes.regionNote(r, EN, "Preter Fjord/preter_fjord.json");
    assert.match(en, /^## Towns$/m);
    assert.match(en, /^- \[\[Westcot\]\] \(village\): A remote mountain village/m);
    assert.match(en, /^- \[\[Den Of Sorrows\]\]$/m);
    assert.match(en, /^seed: 944459915$/m);
    assert.match(en, /^generator_tags: \["fjord", "difficult", "barren", "neutral"\]$/m);
    const pt = notes.regionNote(r, PT, null);
    assert.match(pt, /^## Cidades$/m);
    assert.match(pt, /A remote mountain village of abundant religion/, "the generator's text is not translated");
  });

  test("a town's note, made when followed: its generator, seed, address and region", () => {
    const r = region.readRegion(JSON.parse(REGION_TEXT));
    const place = notes.placeNamed(r, "sunscale");
    assert.equal(place.town.name, "Sunscale");
    const text = notes.placeNote(place, "Preter Fjord", EN);
    assert.match(text, /^generator: "city-generator"$/m);
    assert.match(text, /^seed: 2021041629$/m);
    assert.match(text, /^settlement: "city"$/m);
    assert.match(text, /^walled: true$/m);
    assert.match(text, /^region: "\[\[Preter Fjord\]\]"$/m);
    assert.match(text, /^# Sunscale$/m);
    assert.match(text, /\[Open in the generator\]\(https:\/\/watabou\.github\.io\/city-generator\/\?size=40&seed=2021041629/);
    const danger = notes.placeNote(notes.placeNamed(r, "Den Of Sorrows"), "Preter Fjord", EN);
    assert.match(danger, /^generator: "one-page-dungeon"$/m);
    assert.equal(notes.placeNamed(r, "Nowhere"), null);
  });

  test("links: a whole address, a path, a path with its parameters apart; never another scheme", () => {
    assert.equal(region.linkOf("https://watabou.github.io/village-generator/?seed=1"), "https://watabou.github.io/village-generator/?seed=1");
    assert.equal(region.linkOf("/city-generator/?seed=2"), "https://watabou.github.io/city-generator/?seed=2");
    assert.equal(region.linkOf({ _link_path: "/one-page-dungeon/", _link_params: { seed: "3", name: "A B" } }), "https://watabou.github.io/one-page-dungeon/?seed=3&name=A+B");
    assert.equal(region.linkOf("javascript:alert(1)"), null);
    assert.equal(region.linkOf(42), null);
    assert.equal(notes.webLink("Open [x]", "https://a.b/c?(d) e"), "[Open \\[x\\]](https://a.b/c?%28d%29%20e)");
    assert.equal(notes.noteLink("A/B: C"), "[[A B C|A/B: C]]");
  });
});

describe("A generated map's note", () => {
  test("the generator embedded at the address with the seed, the seed kept in the properties", () => {
    const text = gens.generatedNote("one-page-dungeon", 12345, "Den of Sorrows", "Den of Sorrows", EN);
    assert.match(text, /^generator: "one-page-dungeon"$/m);
    assert.match(text, /^seed: 12345$/m);
    assert.match(text, /^generator_link: "https:\/\/watabou\.github\.io\/one-page-dungeon\/\?seed=12345&name=Den\+of\+Sorrows"$/m);
    assert.match(text, /^<iframe src="https:\/\/watabou\.github\.io\/one-page-dungeon\/\?seed=12345&amp;name=Den\+of\+Sorrows" style="[^"]*"><\/iframe>$/m);
    assert.match(text, /^# Den of Sorrows$/m);
  });

  test("only the generators listed, only a whole seed in range", () => {
    assert.equal(gens.generatorLink("evil", 1), null);
    assert.equal(gens.generatorLink("dwellings", 0), null);
    assert.equal(gens.generatorLink("dwellings", 1.5), null);
    assert.equal(gens.generatorLink("dwellings", 7), "https://watabou.github.io/dwellings/?seed=7");
    assert.equal(gens.generatedNote("evil", 1, "x", "", EN), null);
  });

  test("a seed is drawn from 1 to the largest the generators take", () => {
    assert.equal(gens.drawSeed(() => 0), 1);
    assert.equal(gens.drawSeed((n) => n - 1), gens.MAX_SEED);
    for (let i = 0; i < 50; i++) {
      const s = gens.drawSeed();
      assert.ok(Number.isInteger(s) && s >= 1 && s <= gens.MAX_SEED);
    }
  });
});
