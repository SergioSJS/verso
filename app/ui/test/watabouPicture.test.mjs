// The generator's own picture under an imported Watabou map (ADR 0120,
// revised 2026-11-15): what an exported SVG or PNG says of itself, where the
// JSON's cells fall on it, the drawing laid over it as a hidden tracing,
// and the board that holds them. The SVG samples in test/watabou/ are the
// heads of real exports (One Page Dungeon v1.2.7 at seed 12345, exported
// 2026-11-15 at a 1400 × 1000 window; a Dwellings floor's shape), the map's
// group cut down to one room; the numbers checked against them were read
// off the generator's own page (the key "1" drawn at (948, 513) of the
// window).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/watabou/dungeon.ts", "src/watabou/dwelling.ts", "src/watabou/picture.ts", "src/watabou/align.ts", "src/watabou/trace.ts", "src/watabou/draw.ts", "src/watabou/drawHouse.ts", "src/watabou/detect.ts", "src/watabou/notes.ts", "src/board/tracing.ts", "src/board/model.ts", "src/watabou/words.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outdir: "test/.bundles/watabouPicture",
  outExtension: { ".js": ".mjs" },
  logLevel: "error",
});
const B = "./.bundles/watabouPicture";
const pic = await import(`${B}/watabou/picture.mjs`);
const align = await import(`${B}/watabou/align.mjs`);
const trace = await import(`${B}/watabou/trace.mjs`);
const draw = await import(`${B}/watabou/draw.mjs`);
const drawHouse = await import(`${B}/watabou/drawHouse.mjs`);
const detect = await import(`${B}/watabou/detect.mjs`);
const notes = await import(`${B}/watabou/notes.mjs`);
const tracing = await import(`${B}/board/tracing.mjs`);
const { wordsByLang } = await import(`${B}/watabou/words.mjs`);
const model = await import(`${B}/board/model.mjs`);

const sample = (n) => readFileSync(new URL(`./watabou/${n}`, import.meta.url), "utf8");
const SVG = sample("swamp_citadel_of_uadjed.trimmed.svg");
const HOUSE_SVG = sample("house_by_the_sea_gf.trimmed.svg");
const dungeonMod = await import(`${B}/watabou/dungeon.mjs`);
const dwelling = await import(`${B}/watabou/dwelling.mjs`);
const DUNGEON = dungeonMod.readDungeon(JSON.parse(sample("swamp_citadel_of_uadjed.json")));
const HOUSE = dwelling.readDwelling(JSON.parse(sample("house_by_the_sea.json")));
const HOUSE_WORDS = { floor: (l) => `F${l}`, stairsRoom: "Stairs", passage: "Passage" };

const near = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const pngHead = (w, h) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};
const given = (name, text) => ({ name, text, size: text?.length ?? 0 });
const picture = (name, info) => ({ name, text: null, size: 1, picture: info });

describe("What a picture says of itself", () => {
  test("an SVG transform of translate, rotate and scale, as SVG composes them", () => {
    const m = pic.parseTransform("translate(692.807 525.702) rotate(30 0 0) scale(0.716 0.716)");
    const [x, y] = pic.apply(m, 300, -195);
    near(x, 948.6);
    near(y, 512.2);
    assert.deepEqual(pic.parseTransform("scale(100 100) translate(3 3)"), [100, 0, 0, 100, 300, 300]);
    assert.equal(pic.parseTransform("skewX(3)"), null);
    assert.equal(pic.parseTransform("translate(1 2) junk"), null);
    assert.equal(pic.parseTransform(""), null);
  });

  test("the One Page Dungeon's SVG: its window's size and its map's transform", () => {
    const info = pic.svgInfo("s.svg", SVG);
    assert.equal(info.width, 1400);
    assert.equal(info.height, 1000);
    const sim = pic.similarity(info.map);
    near(sim.scale, 0.716, 1e-6);
    near((sim.angle * 180) / Math.PI, 30, 1e-6);
    assert.equal(pic.svgInfo("x.svg", "<html></html>"), null);
  });

  test("a PNG's size from its header, nothing else taken for one", () => {
    assert.deepEqual(pic.pngInfo("p.png", pngHead(4846, 3461)), { name: "p.png", kind: "png", width: 4846, height: 3461, map: null });
    assert.equal(pic.pngInfo("p.png", new Uint8Array(40)), null);
  });

  test("the PNG of the same export is shown; one of another window's size is not", () => {
    const svg = pic.svgInfo("s.svg", SVG);
    const png = pic.pngInfo("s.png", pngHead(4846, 3461));
    assert.equal(pic.shownOf(svg, [svg, png]).name, "s.png");
    const other = pic.pngInfo("o.png", pngHead(4846, 2000));
    assert.equal(pic.shownOf(svg, [svg, other]).name, "s.svg");
  });
});

describe("The dungeon's cells on its picture", () => {
  const svg = pic.svgInfo("swamp.svg", SVG);
  const png = pic.pngInfo("swamp.png", pngHead(4846, 3461));
  const fit = align.dungeonFit([svg, png]);

  test("a cell is CELL pixels of the board; the key 1 lands on the picture's own 1", () => {
    assert.equal(fit.shown.name, "swamp.png");
    const k = fit.box.width / 1400;
    // One cell, along and across, CELL pixels of the board, turned 30°.
    const [x0, y0] = pic.apply(fit.cells, 0, 0);
    const [x1, y1] = pic.apply(fit.cells, 1, 0);
    near(Math.hypot(x1 - x0, y1 - y0), draw.CELL, 1e-6);
    near((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI, 30, 1e-6);
    // The note "1" of the JSON at (10, -6.5): drawn at (948.6, 512.2) of the window.
    const [kx, ky] = pic.apply(fit.cells, 10, -6.5);
    near(kx / k, 948.6);
    near(ky / k, 512.2);
    near(fit.box.height / fit.box.width, 1000 / 1400, 1e-3);
  });

  test("a PNG alone does not say where the map is: no fit", () => {
    assert.equal(align.dungeonFit([png]), null);
  });

  test("the drawing laid over the picture: every wall corner on a cell's corner, hidden and locked, the title left to the picture", () => {
    const placed = draw.drawDungeon(DUNGEON, "wb", fit.cells);
    const plain = draw.drawDungeon(DUNGEON);
    // A wall's ends are corners of cells: back through the transform, whole numbers.
    const inv = (x, y) => {
      const [a, b, c, d, e, f] = fit.cells;
      const det = a * d - b * c;
      return [(d * (x - e) - c * (y - f)) / det, (-b * (x - e) + a * (y - f)) / det];
    };
    for (const [x1, y1] of placed.walls.lines) {
      const [cx, cy] = inv(x1, y1);
      near(cx, Math.round(cx), 0.01);
      near(cy, Math.round(cy), 0.01);
    }
    assert.equal(placed.walls.lines.length, plain.walls.lines.length);
    assert.deepEqual(placed.walls.grid.length, 6);
    assert.ok(placed.elements.every((e) => e.opacity === 0 && e.locked === true && e.customData.verso.traced === true));
    assert.equal(placed.elements.length, plain.elements.length - 1);
    assert.ok(!placed.elements.some((e) => e.type === "text" && e.text === DUNGEON.title));
    // Each key where the picture draws its number.
    const one = placed.keys.find((k) => k.ref === "1");
    const [kx, ky] = pic.apply(fit.cells, 10, -6.5);
    near(one.x, kx, 0.05);
    near(one.y, ky, 0.05);
  });

  test("the board: the picture is the map, a pin per numbered key on it, the note beside; Verso's drawing alone without it", () => {
    const board = draw.dungeonBoard(DUNGEON, "D/D.md", { path: "D/swamp.png", fit });
    const [map, ...rest] = board.nodes;
    assert.deepEqual(map, { id: "wb-map", type: "file", file: "D/swamp.png", ...fit.box, verso: { map: true, locked: true, groups: [draw.MAP_GROUP] } });
    const pins = rest.filter((n) => n.verso?.pin);
    assert.deepEqual(pins.map((p) => p.verso.key).sort(), ["1", "2", "3", "4"]);
    assert.ok(pins.every((p) => p.file === "D/D.md" && p.width === 32 && p.verso.groups[0] === draw.MAP_GROUP));
    assert.deepEqual(pins.map((p) => model.pinKey(p)).sort(), ["1", "2", "3", "4"]);
    const note = rest.find((n) => n.id === "wb-note");
    assert.ok(note.x >= fit.box.x + fit.box.width);
    // A secret door is still marked secret in the tracing (served to no player).
    assert.ok(board.verso.drawing.some((e) => e.customData?.verso?.secret === true) === DUNGEON.doors.some((x) => x.type === 6));
    const alone = draw.dungeonBoard(DUNGEON, "D/D.md");
    assert.deepEqual(alone.nodes.map((n) => n.id), ["wb-note"]);
    assert.ok(alone.verso.drawing.every((e) => e.opacity === 100 && !e.customData?.verso?.traced));
  });

  test("columns stand on the grid's corners, where the generator draws them", () => {
    const { elements } = draw.drawDungeon({ ...DUNGEON, columns: [{ x: 0, y: 0 }] });
    const col = elements.find((e) => e.type === "ellipse");
    const minX = Math.min(...DUNGEON.rects.map((r) => r.x));
    const minY = Math.min(...DUNGEON.rects.map((r) => r.y));
    near(col.x + col.width / 2, -minX * draw.CELL, 1e-6);
    near(col.y + col.height / 2, -minY * draw.CELL, 1e-6);
  });
});

describe("A dungeon exported turned, or square (View › Rotate-to-fit off)", () => {
  const SQUARE_SVG = sample("swamp_citadel_of_uadjed.square.trimmed.svg");
  test("the turned export is imported and said to be turned; the square one is square, and says nothing", () => {
    const turned = align.dungeonFit([pic.svgInfo("t.svg", SVG)]);
    near(turned.turned, 30, 1e-6);
    assert.equal(align.isTurned(turned), true);
    const square = align.dungeonFit([pic.svgInfo("s.svg", SQUARE_SVG)]);
    assert.equal(square.turned, 0);
    assert.equal(align.isTurned(square), false);
    // Square to the board: a cell's sides along the board's axes, CELL long.
    const [a, b, c, d] = square.cells;
    near(a, draw.CELL, 1e-6);
    near(d, draw.CELL, 1e-6);
    assert.equal(b, 0);
    assert.equal(c, 0);
    // The key "1" at (10, -6.5) where that page draws it: (933.2, 418.4) of the window.
    const k = square.box.width / 1400;
    const [kx, ky] = pic.apply(square.cells, 10, -6.5);
    near(kx / k, 933.2);
    near(ky / k, 418.4);
  });

  test("the words name the angle and Watabou's own menu path, in both languages", () => {
    assert.match(wordsByLang.pt.turned(30), /girado 30°.*View › Rotate-to-fit.*Export as › SVG e Save as PNG/);
    assert.match(wordsByLang.pt.turned(12.34), /girado 12,3°/);
    assert.match(wordsByLang.en.turned(30), /turned by 30°.*View › Rotate-to-fit.*Export as › SVG and Save as PNG/);
  });

  test("the note of a turned import ends with how to export it square; a square one has no such word", () => {
    const word = "Export again with View › Rotate-to-fit off.";
    const turned = notes.dungeonNote({ json: DUNGEON, md: null, board: "D/D.canvas", jsonFile: null, pictures: ["D/s.png"], turned: word });
    assert.match(turned, /> \[!warning\]\n> Export again with View › Rotate-to-fit off\.\n$/);
    const square = notes.dungeonNote({ json: DUNGEON, md: null, board: "D/D.canvas", jsonFile: null, pictures: ["D/s.png"], turned: null });
    assert.doesNotMatch(square, /\[!warning\]/);
  });
});

describe("A dungeon's map alone (Export as › PNG…), placed by arithmetic", () => {
  // Real exports of One Page Dungeon 1.2.7 (2026-11-15, the survey's samples):
  // the JSON kept in test/watabou/, the PNG's size as the generator wrote it.
  const cases = [
    { json: "swamp_citadel_of_uadjed.json", png: [1720, 1720], c: 40, box: { x: -24, y: -21, w: 43, h: 43 } },
    { json: "swamp_citadel_of_uadjed.json", png: [3010, 3010], c: 70, box: { x: -24, y: -21, w: 43, h: 43 } },
    { json: "dungeon_of_the_viper_knight.json", png: [810, 1170], c: 30, box: { x: -9, y: -22, w: 27, h: 39 } },
    { json: "dungeon_of_the_viper_knight.json", png: [837, 1209], c: 31, box: { x: -9, y: -22, w: 27, h: 39 } },
    { json: "ebonfist_chambers.json", png: [1950, 2050], c: 50, box: { x: -11, y: -35, w: 39, h: 41 } },
    { json: "blightstar_house.json", png: [770, 1540], c: 70, box: { x: -10, y: -8, w: 11, h: 22 } },
    { json: "blightstar_house.json", png: [781, 1562], c: 71, box: { x: -10, y: -8, w: 11, h: 22 } },
  ];
  for (const k of cases) {
    test(`${k.json} at ${k.c} px a cell (${k.png.join(" × ")}): the rooms' box and the exact placement`, () => {
      const d = dungeonMod.readDungeon(JSON.parse(sample(k.json)));
      assert.deepEqual(align.mapBox(d), k.box);
      const png = pic.pngInfo("map.png", pngHead(...k.png));
      assert.equal(align.mapCell(png, k.box), k.c);
      const fit = align.dungeonFit([png], d);
      assert.equal(fit.shown.name, "map.png");
      assert.equal(fit.turned, 0);
      assert.deepEqual(fit.box, { x: 0, y: 0, width: k.box.w * draw.CELL, height: k.box.h * draw.CELL });
      // Cell (x, y) at pixel ((x − R.x)·c, (y − R.y)·c) of the PNG: on the
      // board, the same point of the picture's box.
      const r = d.rects.find((q) => q.w > 1 && q.h > 1);
      const [bx, by] = pic.apply(fit.cells, r.x, r.y);
      assert.deepEqual([bx / fit.box.width, by / fit.box.height], [((r.x - k.box.x) * k.c) / k.png[0], ((r.y - k.box.y) * k.c) / k.png[1]]);
    });
  }

  test("a PNG of another size is no map: the SVG is asked for; the map alone wins over a page's SVG", () => {
    const d = DUNGEON;
    assert.equal(align.dungeonFit([pic.pngInfo("page.png", pngHead(4846, 3461))], d), null);
    assert.equal(align.dungeonFit([pic.pngInfo("odd.png", pngHead(1720, 1700))], d), null);
    const p = detect.plan([given("s.json", sample("swamp_citadel_of_uadjed.json")), picture("page.png", pic.pngInfo("page.png", pngHead(4846, 3461)))]);
    assert.equal(p.fit, null);
    assert.equal(p.pictured, true);
    const both = align.dungeonFit([pic.svgInfo("page.svg", SVG), pic.pngInfo("map.png", pngHead(1720, 1720))], d);
    assert.equal(both.shown.name, "map.png");
    assert.equal(both.turned, 0);
  });
});

describe("A house's floors on their pictures", () => {
  const svg = pic.svgInfo("house_by_the_sea_gf.svg", HOUSE_SVG);
  const grid = { cols: 4, rows: 7 };
  const levels = HOUSE.floors.map((f) => f.level);

  test("a floor's picture is known by the generator's name for it; a PNG alone by its size", () => {
    assert.deepEqual([align.floorOfName("x_gf.svg"), align.floorOfName("x_1f.png"), align.floorOfName("x_b.svg"), align.floorOfName("x_3f (1).png"), align.floorOfName("x.svg")], [0, 1, -1, 3, null]);
    const fit = align.houseFit(levels, grid, [svg]);
    assert.deepEqual([...fit.keys()], [0]);
    assert.deepEqual(fit.get(0).cellToPicture, [100, 0, 0, 100, 300, 300]);
    const png = pic.pngInfo("house_by_the_sea_1f.png", pngHead(2000, 2600));
    assert.deepEqual(align.houseFit(levels, grid, [png]).get(1).cellToPicture, [200, 0, 0, 200, 600, 600]);
    assert.equal(align.houseFit(levels, grid, [pic.pngInfo("house_by_the_sea_1f.png", pngHead(2000, 2000))]).size, 0);
    // The SVG's own PNG is what is shown.
    const own = pic.pngInfo("house_by_the_sea_gf.png", pngHead(2000, 2600));
    assert.equal(align.houseFit(levels, grid, [svg, own]).get(0).shown.name, "house_by_the_sea_gf.png");
  });

  test("the picture lies in its floor's frame, the house's cells on its grid; the floor's drawing its hidden tracing", () => {
    const fit = align.houseFit(levels, grid, [svg]);
    const plain = drawHouse.drawHouse(HOUSE, "H", HOUSE_WORDS);
    const d = drawHouse.drawHouse(HOUSE, "H", HOUSE_WORDS, "wh", fit);
    const [p] = d.pictures;
    const frame = d.frames.find((f) => f.id === "wh-floor-0");
    assert.equal(p.level, 0);
    assert.deepEqual(p.box, { x: frame.x, y: frame.y, width: frame.width, height: frame.height });
    assert.equal(p.box.width, (4 + 6) * draw.CELL);
    // The ground floor traced and hidden; the other floors drawn as before.
    const ground = d.elements.filter((e) => e.frameId === "wh-floor-0");
    assert.ok(ground.length > 0 && ground.every((e) => e.opacity === 0 && e.customData.verso.traced));
    assert.ok(d.elements.filter((e) => e.frameId === "wh-floor-1").every((e) => e.opacity === 100));
    assert.equal(d.elements.length, plain.elements.length);
    const board = drawHouse.houseBoard(HOUSE, "H", HOUSE_WORDS, "H/H.md", fit, () => "H/house_by_the_sea_gf.svg");
    assert.deepEqual(board.nodes.find((n) => n.id === "wh-map-0"), { id: "wh-map-0", type: "file", file: "H/house_by_the_sea_gf.svg", ...p.box, verso: { map: true, locked: true } });
  });
});

describe("A village or a city", () => {
  const village = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", id: "values", generator: "vg", version: "1.6.9" }] });
  test("with its picture: one import, its picture the board's map", () => {
    const png = pic.pngInfo("gertwharf.png", pngHead(4846, 3461));
    const p = detect.plan([given("gertwharf.json", village), picture("gertwharf.png", png)]);
    assert.equal(p.kind, "settlement");
    assert.equal(p.title, "Gertwharf");
    assert.equal(p.generator, "village-generator");
    assert.equal(p.version, "1.6.9");
    const board = notes.settlementBoard("G/gertwharf.png", png, "G/G.md");
    assert.equal(board.nodes[0].verso.map, true);
    near(board.nodes[0].height / board.nodes[0].width, 3461 / 4846, 1e-3);
    const note = notes.settlementNote({ title: "Gertwharf", generator: "village-generator", version: "1.6.9", board: "G/G.canvas", jsonFile: "G/gertwharf.json", pictures: ["G/gertwharf.png"] });
    assert.match(note, /generator: "village-generator"/);
    assert.match(note, /map: "\[\[G\.canvas\]\]"/);
    assert.match(note, /!\[\[gertwharf\.png\]\]/);
  });
  test("without it: asked for", () => {
    assert.equal(detect.plan([given("gertwharf.json", village)]).why, "noPicture");
  });
});

describe("The dungeon's plan says whether its picture lines up", () => {
  test("an SVG of the export: lined up; a PNG alone: not", () => {
    const json = sample("swamp_citadel_of_uadjed.json");
    const svg = pic.svgInfo("s.svg", SVG);
    const png = pic.pngInfo("s.png", pngHead(4846, 3461));
    const both = detect.plan([given("s.json", json), picture("s.svg", svg), picture("s.png", png)]);
    assert.equal(both.fit.shown.name, "s.png");
    const alone = detect.plan([given("s.json", json), picture("s.png", png)]);
    assert.equal(alone.fit, null);
    assert.equal(alone.pictured, true);
  });
});

describe("The tracing", () => {
  test("placeDrawn moves a line's points and turns any other element round its middle", () => {
    const turn = [0, 1, -1, 0, 100, 0]; // a quarter turn, then 100 to the right
    const [line, box] = trace.placeDrawn(
      [
        { id: "l", type: "line", x: 0, y: 0, width: 10, height: 0, points: [[0, 0], [10, 0]] },
        { id: "r", type: "rectangle", x: 0, y: 0, width: 20, height: 10 },
      ],
      turn,
    );
    assert.deepEqual([line.x, line.y, line.points], [100, 0, [[0, 0], [0, 10]]]);
    // The box's middle (10, 5) goes to (95, 10); the box keeps its size, turned.
    assert.deepEqual([box.x, box.y, box.width, box.height], [85, 5, 20, 10]);
    near(box.angle, Math.PI / 2, 1e-6);
  });

  test("asTracing hides and locks, in the tracing's colour, every custom mark kept", () => {
    const [door, floor] = trace.asTracing([
      { id: "d", type: "line", x: 0, y: 0, width: 0, height: 40, strokeColor: draw.INK, backgroundColor: "transparent", customData: { verso: { secret: true } } },
      { id: "f", type: "rectangle", x: 0, y: 0, width: 40, height: 40, strokeColor: "transparent", backgroundColor: draw.FLOOR },
    ]);
    assert.deepEqual(door.customData, { verso: { secret: true, traced: true } });
    assert.equal(door.opacity, 0);
    assert.equal(door.locked, true);
    assert.equal(door.strokeColor, trace.TRACE);
    assert.equal(floor.backgroundColor, "transparent");
    assert.equal(floor.strokeStyle, "dotted");
  });

  test("the board's tracing: none, hidden or shown", () => {
    const traced = { customData: { verso: { traced: true } }, opacity: 0 };
    assert.equal(tracing.tracingOf([{ customData: null }]), "none");
    assert.equal(tracing.tracingOf([traced]), "hidden");
    assert.equal(tracing.tracingOf([traced, { ...traced, opacity: 100 }]), "shown");
    assert.equal(tracing.tracingOf([{ ...traced, opacity: 100, isDeleted: true }]), "none");
    assert.deepEqual(tracing.tracingLook(true), { opacity: 100, locked: false });
    assert.deepEqual(tracing.tracingLook(false), { opacity: 0, locked: true });
  });
});
