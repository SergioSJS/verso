// A house exported from Watabou's Dwellings (ADR 0120, the maintainer's
// answer to Q3 of 2026-11-12): what the file is, the house drawn floor by
// floor with its walls kept, and the note that is the drawing's text
// equivalent. Also the region's town note embedding its generator (Q1).
// The samples in test/watabou/ are exports of watabou.github.io/dwellings
// (v1.4.x, captured 2026-11-12: castle_by_the_sea.json at seed 777001,
// tags medium,spiral,tall; house_by_the_sea.json at seed 12345, tags
// tall,basement); generated maps are free to use, by Watabou's FAQ.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/watabou/detect.ts", "src/watabou/dwelling.ts", "src/watabou/drawHouse.ts", "src/watabou/houseNote.ts", "src/watabou/notes.ts", "src/watabou/region.ts", "src/watabou/words.ts", "src/board/model.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outdir: "test/.bundles/watabouHouse",
  outExtension: { ".js": ".mjs" },
  logLevel: "error",
});
const detect = await import("./.bundles/watabouHouse/watabou/detect.mjs");
const dw = await import("./.bundles/watabouHouse/watabou/dwelling.mjs");
const dh = await import("./.bundles/watabouHouse/watabou/drawHouse.mjs");
const hn = await import("./.bundles/watabouHouse/watabou/houseNote.mjs");
const notes = await import("./.bundles/watabouHouse/watabou/notes.mjs");
const region = await import("./.bundles/watabouHouse/watabou/region.mjs");
const { wordsByLang } = await import("./.bundles/watabouHouse/watabou/words.mjs");
const model = await import("./.bundles/watabouHouse/board/model.mjs");

const sample = (n) => readFileSync(new URL(`./watabou/${n}`, import.meta.url), "utf8");
const CASTLE = sample("castle_by_the_sea.json");
const HOUSE = sample("house_by_the_sea.json");
const given = (name, text) => ({ name, text, size: text?.length ?? 0 });
const EN = wordsByLang.en.house;
const PT = wordsByLang.pt.house;
const C = dh.CELL ?? 40;

describe("A Dwellings export, recognised and read", () => {
  test("by what it holds; its name from the file's, as the generator names it", () => {
    assert.equal(detect.see(given("whatever.txt", CASTLE)).kind, "dwelling");
    const p = detect.plan([given("castle_by_the_sea.json", CASTLE), given("castle_by_the_sea.png", null)]);
    assert.equal(p.kind, "dwelling");
    assert.equal(p.title, "Castle By The Sea");
    assert.equal(p.floors, 6);
    assert.equal(p.rooms, 15);
    assert.deepEqual(p.pictures, ["castle_by_the_sea.png"]);
    assert.equal(dw.houseTitle("lakeside_house (2).json"), "Lakeside House");
  });

  test("one map at a time: a house with a dungeon or another house is two", () => {
    assert.equal(detect.plan([given("a.json", CASTLE), given("b.json", HOUSE)]).why, "two");
    assert.equal(detect.plan([given("a.json", CASTLE), given("d.json", sample("swamp_citadel_of_uadjed.json"))]).why, "two");
  });

  test("floors from the basement up; rooms, doors with the generator's types, windows, stairs, entrance, spiral", () => {
    const h = dw.readDwelling(JSON.parse(CASTLE));
    assert.deepEqual(h.floors.map((f) => f.level), [-1, 0, 1, 2, 3, 4]);
    const ground = h.floors[1];
    assert.deepEqual(ground.rooms.map((r) => r.name), ["Room", "Hall", "Room", "Kitchen"]);
    assert.deepEqual([...new Set(ground.doors.map((d) => d.type))].sort(), ["REGULAR", null].sort());
    assert.equal(ground.windows.length, 13);
    assert.deepEqual(h.exit, { cell: { i: 5, j: 3 }, dir: "s" });
    assert.deepEqual(h.spiral, { cell: { i: 4, j: 0 }, dir: "n" });
    const other = dw.readDwelling(JSON.parse(HOUSE));
    assert.equal(other.spiral, null);
    assert.ok(other.floors[1].doors.some((d) => d.type === "NULL"));
  });

  test("what is not a house is none; entries that are wrong are left out one by one", () => {
    assert.equal(dw.readDwelling({ floors: [] }), null);
    assert.equal(dw.readDwelling({ floors: [{ level: 0, rooms: [{ cells: [] }] }] }), null);
    const h = dw.readDwelling({ floors: [{ level: 0, rooms: [{ cells: [{ i: 0, j: 0 }, { i: "x" }, { i: 1e9, j: 0 }], name: 3 }], doors: [{ edge: { cell: { i: 0, j: 0 }, dir: "up" } }, { edge: { cell: { i: 0, j: 0 }, dir: "n" }, type: "<b>" }], windows: [null], stairs: [{ cell: { i: 0, j: 0 }, dir: "e", up: "yes" }] }] });
    assert.deepEqual(h.floors[0].rooms, [{ name: null, cells: [{ i: 0, j: 0 }] }]);
    assert.deepEqual(h.floors[0].doors, [{ edge: { cell: { i: 0, j: 0 }, dir: "n" }, type: null }]);
    assert.deepEqual(h.floors[0].stairs, [{ cell: { i: 0, j: 0 }, dir: "e", up: false }]);
    assert.equal(dw.readDwelling({ floors: Array.from({ length: dw.MAX_FLOORS + 1 }, (_, l) => ({ level: l, rooms: [{ cells: [{ i: 0, j: 0 }] }] })) }), null);
  });
});

/** Every side of a cell between two rooms or a room and the outside, in
 *  the grid's units: `h:row:col` or `v:col:row`. */
function boundary(floor) {
  const at = new Map();
  floor.rooms.forEach((r, n) => r.cells.forEach((c) => at.set(`${c.i},${c.j}`, n)));
  const out = new Set();
  for (const [k, n] of at) {
    const [i, j] = k.split(",").map(Number);
    if (at.get(`${i - 1},${j}`) !== n) out.add(`h:${i}:${j}`);
    if (at.get(`${i + 1},${j}`) !== n) out.add(`h:${i + 1}:${j}`);
    if (at.get(`${i},${j - 1}`) !== n) out.add(`v:${j}:${i}`);
    if (at.get(`${i},${j + 1}`) !== n) out.add(`v:${j + 1}:${i}`);
  }
  return out;
}

const length = ([x1, y1, x2, y2]) => Math.abs(x2 - x1) + Math.abs(y2 - y1);

describe("Verso's drawing of the house", () => {
  for (const [name, text] of [
    ["castle", CASTLE],
    ["house", HOUSE],
  ]) {
    const h = dw.readDwelling(JSON.parse(text));
    const drawn = dh.drawHouse(h, "T", EN);

    test(`${name}: one frame per floor, side by side, the same size, every element in its floor's frame`, () => {
      assert.equal(drawn.frames.length, h.floors.length);
      assert.deepEqual(drawn.frames.map((f) => f.label).slice(0, 3), ["Basement (B)", "Ground floor (GF)", "1st floor (1F)"]);
      assert.equal(new Set(drawn.frames.map((f) => `${f.width}x${f.height}`)).size, 1);
      for (let k = 1; k < drawn.frames.length; k++) assert.ok(drawn.frames[k].x >= drawn.frames[k - 1].x + drawn.frames[k - 1].width);
      const ids = new Set(drawn.frames.map((f) => f.id));
      for (const e of drawn.elements) {
        if (e.text === "T") continue;
        assert.ok(ids.has(e.frameId), `${e.id} in a frame`);
        const f = drawn.frames.find((x) => x.id === e.frameId);
        // A line's box is its points', which may run left or up from (x, y).
        const xs = e.points ? e.points.map((p) => e.x + p[0]) : [e.x, e.x + e.width];
        const ys = e.points ? e.points.map((p) => e.y + p[1]) : [e.y, e.y + e.height];
        assert.ok(Math.min(...xs) >= f.x && Math.max(...xs) <= f.x + f.width + 0.01 && Math.min(...ys) >= f.y && Math.max(...ys) <= f.y + f.height + 0.01, `${e.id} inside its frame`);
      }
      assert.equal(new Set(drawn.elements.map((e) => e.id)).size, drawn.elements.length);
    });

    test(`${name}: the walls run along every room's sides, less the doors' gaps, nowhere else`, () => {
      for (const [k, floor] of h.floors.entries()) {
        const box = drawn.walls.floors[k].box;
        const inBox = (s) => s[0] >= box[0] && s[2] <= box[0] + box[2];
        const lines = drawn.walls.lines.filter(inBox);
        const doors = drawn.walls.doors.filter((d) => d.level === floor.level);
        for (const s of lines) assert.ok(s[0] === s[2] || s[1] === s[3], "a wall is straight");
        const sides = boundary(floor).size;
        const gaps = doors.reduce((n, d) => n + length(d.line), 0);
        const walls = lines.reduce((n, s) => n + length(s), 0);
        assert.equal(Math.round(walls + gaps), sides * C, `floor ${floor.level}: walls and gaps cover every side once`);
      }
    });

    test(`${name}: every door kept with the generator's type; the windows as the stretch one sees through`, () => {
      const want = h.floors.reduce((n, f) => n + f.doors.length, 0) + 1 + (h.spiral ? h.floors.filter((f) => f.level >= 0).length : 0);
      assert.equal(drawn.walls.doors.length, want);
      for (const d of drawn.walls.doors) {
        if (d.kind === "opening") assert.equal(d.type, "NULL"), assert.equal(length(d.line), C);
        else assert.equal(length(d.line), C / 2);
        if (d.type === "REGULAR") assert.equal(d.kind, "door");
      }
      assert.equal(drawn.walls.doors.filter((d) => d.kind === "entrance").length, 1);
      assert.equal(drawn.walls.windows.length, h.floors.reduce((n, f) => n + f.windows.length, 0));
    });
  }

  test("the floors share one grid: a stair is at the same place in its frame on every floor", () => {
    const h = dw.readDwelling(JSON.parse(HOUSE));
    const drawn = dh.drawHouse(h, "T", EN);
    const arrows = drawn.elements.filter((e) => e.type === "arrow" && e.endArrowhead === "arrow" && !e.frameId.endsWith("-0"));
    const at = new Set(
      arrows.map((a) => {
        const f = drawn.frames.find((x) => x.id === a.frameId);
        return `${a.x - f.x},${a.y}`;
      }),
    );
    assert.equal(at.size, 1, "every 'up' arrow at the same spot");
  });

  test("the rooms' names on the drawing, numbered where a floor has two of one", () => {
    const h = dw.readDwelling(JSON.parse(CASTLE));
    const texts = dh.drawHouse(h, "T", EN).elements.filter((e) => e.type === "text").map((e) => e.text.replace(/\n/g, " "));
    for (const n of ["Kitchen", "Hall", "Room 1", "Room 2", "Laboratory", "Cellar"]) assert.ok(texts.includes(n), n);
    assert.deepEqual(dw.roomLabels(h.floors[1], { stairs: "S", passage: "P" }), ["Room 1", "Hall", "Room 2", "Kitchen"]);
  });

  test("the board: frames as the canvas's groups, the note as a card, the walls under verso; saved by the board unchanged", () => {
    const h = dw.readDwelling(JSON.parse(CASTLE));
    const doc = dh.houseBoard(h, "Castle By The Sea", EN, "Maps/Castle/Castle.md");
    assert.deepEqual(
      doc.nodes.map((n) => n.type),
      ["group", "group", "group", "group", "group", "group", "file"],
    );
    assert.equal(doc.verso.walls.generator, "dwellings");
    const els = model.toElements(doc).map((e) => ({ isDeleted: false, ...e }));
    const frames = els.filter((e) => e.type === "frame").map((e) => e.name);
    assert.equal(frames[1], "Ground floor (GF)");
    const back = model.fromElements(els, doc);
    assert.deepEqual(back.verso.walls, doc.verso.walls);
    assert.equal(back.verso.drawing.length, doc.verso.drawing.length);
    assert.deepEqual(
      back.verso.drawing.map((d) => d.frameId),
      doc.verso.drawing.map((d) => d.frameId),
    );
    assert.equal(back.nodes.length, doc.nodes.length);
  });
});

describe("The house's note", () => {
  const h = dw.readDwelling(JSON.parse(HOUSE));
  const en = hn.houseNote({ house: h, title: "House By The Sea", board: "M/House By The Sea.canvas", jsonFile: "M/house_by_the_sea.json", pictures: ["M/h.png"] }, EN);

  test("its properties, the house described, every room of every floor — the drawing's text equivalent", () => {
    assert.match(en, /^generator: "dwellings"$/m);
    assert.match(en, /^map: "\[\[House By The Sea.canvas\]\]"$/m);
    assert.match(en, /^export: "\[\[house_by_the_sea.json\]\]"$/m);
    assert.doesNotMatch(en, /^seed:/m, "the export has no seed; none is invented");
    assert.match(en, /^House By The Sea: a house of 4 floors and a basement, 14 rooms\. The entrance is on the east side, into Room\.$/m);
    for (const f of ["Basement (B)", "Ground floor (GF)", "1st floor (1F)", "2nd floor (2F)", "3rd floor (3F)"]) assert.match(en, new RegExp(`^## ${f.replace(/[()]/g, "\\$&")}$`, "m"));
    const items = en.split("\n").filter((l) => l.startsWith("- **"));
    assert.equal(items.length, 14);
    assert.ok(items.includes("- **Room**: 11 squares; the house's entrance; open to Stairs; door to Bathroom 1; door to Bathroom 2; 6 windows."));
    assert.ok(en.endsWith("![[h.png]]\n"));
  });

  test("in Portuguese, Verso's words change and the generator's names do not", () => {
    const pt = hn.houseNote({ house: h, title: "House By The Sea", board: null, jsonFile: null, pictures: [] }, PT);
    assert.match(pt, /^## Térreo \(GF\)$/m);
    assert.match(pt, /^- \*\*Bathroom 1\*\*: 4 quadrados; porta para Room; 2 janelas\.$/m);
    assert.match(pt, /casa de 4 andares e porão, 14 cômodos\. A entrada fica no lado leste, no cômodo Room\./);
  });
});

describe("A town's note, made on click, embeds its generator (Q1)", () => {
  const r = region.readRegion(JSON.parse(sample("preter_fjord.trimmed.json")));
  const W = { towns: "Towns", dangers: "Dangers", places: "Places", openGenerator: "Open in the generator" };

  test("at the address with the seed the region gives, as a generated map's note", () => {
    const text = notes.placeNote(notes.placeNamed(r, "Sunscale"), "Preter Fjord", W);
    assert.match(text, /^<iframe src="https:\/\/watabou\.github\.io\/city-generator\/\?size=40&amp;seed=2021041629[^"]*" style="[^"]*"><\/iframe>$/m);
    const danger = notes.placeNote(notes.placeNamed(r, "Den Of Sorrows"), "Preter Fjord", W);
    assert.match(danger, /^<iframe src="https:\/\/watabou\.github\.io\/one-page-dungeon\//m);
  });

  test("only Watabou's site is embedded; any other link stays a link", () => {
    assert.equal(notes.generatorFrame("https://example.com/city-generator/?seed=1"), null);
    assert.equal(notes.generatorFrame("http://watabou.github.io/city-generator/?seed=1"), null);
    assert.equal(notes.generatorFrame("not a url"), null);
    assert.equal(notes.generatorFrame('https://watabou.github.io/x/?a="b"'), '<iframe src="https://watabou.github.io/x/?a=%22b%22" style="width: 100%; height: 640px; border: 0;"></iframe>');
  });
});
