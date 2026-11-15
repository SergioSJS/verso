// Maps on the board (ADR 0090): the pure parts — the flags a map, a pin and
// a secret card keep under `verso`, the pin's place, the tiles of a large
// picture (which level, which tiles, kept and asked for), and the way the
// canvas goes to the board and back with them.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: 'export * from "./src/board/maps"; export * from "./src/board/model"; export { projectBoard } from "./src/harness/maps";',
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/maps.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/maps.test-bundle.mjs");

const BOARD = {
  nodes: [
    { id: "mapa", type: "file", file: "Mapa.png", x: 0, y: 0, width: 1000, height: 800, verso: { map: true, locked: true, groups: ["g"] } },
    { id: "taverna", type: "file", file: "Taverna.md", x: 100, y: 120, width: 32, height: 32, "x-extra": 1, verso: { pin: true, groups: ["g"] } },
    { id: "cripta", type: "file", file: "Cripta.md", x: 700, y: 500, width: 32, height: 32, verso: { pin: true, secret: true, groups: ["g", "g2"] } },
    { id: "nota", type: "text", text: "praça", x: 300, y: 300, width: 100, height: 40 },
  ],
  edges: [{ id: "e1", fromNode: "cripta", toNode: "taverna", label: "túnel" }],
  verso: { version: 1, drawing: [{ id: "d1", type: "text", x: 1, y: 1, text: "rota", groupIds: ["g"] }, { id: "d2", type: "text", x: 700, y: 480, text: "portão", groupIds: ["g2"] }] },
};

const restored = (doc) => m.toElements(doc).map((e) => ({ isDeleted: false, ...e }));

describe("flags under verso", () => {
  test("a node's flags are read as true, and a secret one that is not false counts", () => {
    assert.equal(m.isMap(BOARD.nodes[0]), true);
    assert.equal(m.isPin(BOARD.nodes[1]), true);
    assert.equal(m.isSecret(BOARD.nodes[2]), true);
    assert.equal(m.isSecret(BOARD.nodes[1]), false);
    assert.equal(m.isSecret({ ...BOARD.nodes[1], verso: { secret: "yes" } }), true, "fails closed, as the core reads it");
    assert.equal(m.isSecret({ ...BOARD.nodes[1], verso: { secret: false } }), false);
    assert.equal(m.isMap({ ...BOARD.nodes[0], verso: { map: "yes" } }), false);
  });

  test("setting and taking off a flag keeps every other key of verso, and verso goes when empty", () => {
    const on = m.flagged(BOARD.nodes[3], { secret: true });
    assert.deepEqual(on.verso, { secret: true });
    const off = m.flagged(on, { secret: false });
    assert.equal("verso" in off, false);
    const keep = m.flagged(BOARD.nodes[1], { secret: true });
    assert.deepEqual(keep.verso, { pin: true, groups: ["g"], secret: true });
    assert.deepEqual(m.flagged(keep, { secret: false }).verso, BOARD.nodes[1].verso);
    assert.equal(m.flagged(BOARD.nodes[3], {}).id, "nota");
  });

  test("a new pin is a file card for the note, its box centred on the point", () => {
    const pin = m.pinNode("Cidade/Taverna.md", [200, 300], "p1");
    assert.deepEqual(pin, { id: "p1", type: "file", file: "Cidade/Taverna.md", x: 184, y: 284, width: 32, height: 32, verso: { pin: true } });
    assert.deepEqual(m.pinPoint(pin), [200, 300]);
  });
});

describe("the board and its elements", () => {
  test("a map, a pin and a secret card go to the board and come back unchanged", () => {
    const back = m.fromElements(restored(BOARD), BOARD);
    assert.deepEqual(back.nodes, BOARD.nodes);
    assert.deepEqual(back.edges, BOARD.edges);
    assert.deepEqual(back.verso.drawing.map((d) => d.id), ["d1", "d2"]);
    assert.deepEqual(back.verso.drawing.map((d) => d.groupIds), [["g"], ["g2"]]);
  });

  test("a pin is drawn by Excalidraw as a box that shows nothing, and writes no colour", () => {
    const pin = restored(BOARD).find((e) => e.id === "taverna");
    assert.equal(pin.strokeColor, "transparent");
    assert.equal(pin.backgroundColor, "transparent");
    const moved = restored(BOARD).map((e) => (e.id === "taverna" ? { ...e, x: 140.4, y: 150.6 } : e));
    const node = m.fromElements(moved, BOARD).nodes[1];
    assert.equal(node.x, 140);
    assert.equal(node.y, 151);
    assert.equal("color" in node, false);
    assert.deepEqual(node.verso, BOARD.nodes[1].verso);
    assert.equal(node["x-extra"], 1);
  });

  test("the map's lock and group are the element's, kept as the card's verso", () => {
    const map = restored(BOARD).find((e) => e.id === "mapa");
    assert.equal(map.locked, true);
    assert.deepEqual(map.groupIds, ["g"]);
  });

  test("the pins are listed in reading order, and not among the cards of the outline", () => {
    const els = restored(BOARD);
    assert.deepEqual(m.pinsOf(els).map((e) => e.id), ["taverna", "cripta"]);
    assert.deepEqual(m.mapsOf(els).map((e) => e.id), ["mapa"]);
    const strings = { textCard: "Texto", linkCard: "Link", untitledGroup: "Grupo", edge: (a, b, l) => `${a} → ${b} ${l}` };
    const outline = m.outlineOf(els, strings);
    assert.deepEqual(outline.loose.map((i) => i.id), ["mapa", "nota"]);
    assert.equal(m.hasSecret(els), true);
    assert.equal(m.hasSecret(els.filter((e) => e.id !== "cripta")), false);
    // A drawn secret door (the Watabou import's) is a secret too: marked,
    // or unmarked as the import drew it before.
    const open = els.filter((e) => e.id !== "cripta");
    const line = { id: "porta", type: "line", x: 0, y: 0, width: 0, height: 40, strokeStyle: "dashed", strokeWidth: 3 };
    assert.equal(m.hasSecret([...open, line]), true);
    assert.equal(m.hasSecret([...open, { ...line, strokeWidth: 2, customData: { verso: { secret: true } } }]), true);
    assert.equal(m.hasSecret([...open, { ...line, strokeWidth: 2 }]), false);
    assert.equal(m.hasSecret([...open, { ...line, isDeleted: true }]), false);
  });

  test("a note dropped where a map lies finds the map, the topmost", () => {
    const els = restored(BOARD);
    assert.equal(m.mapAt(els, 400, 400)?.id, "mapa");
    assert.equal(m.mapAt(els, 5000, 5000), undefined);
  });

  test("pins join the map's group, or make one", () => {
    assert.equal(m.mapGroup({ groupIds: ["g", "outer"] }, "fresh"), "g");
    assert.equal(m.mapGroup({ groupIds: [] }, "fresh"), "fresh");
    assert.equal(m.mapGroup({}, "fresh"), "fresh");
  });

  test("what a canvas draws is named by its ids, an edge's label too", () => {
    const ids = m.keptIds(BOARD);
    for (const id of ["mapa", "cripta", "e1", "e1-label", "d1", "d2"]) assert.equal(ids.has(id), true, id);
  });
});

describe("the harness projects a board as the core does", () => {
  test("a reader's board has no secret card, edge or drawing that places it", () => {
    const shown = JSON.parse(m.projectBoard(JSON.stringify(BOARD)));
    assert.deepEqual(shown.nodes.map((n) => n.id), ["mapa", "taverna", "nota"]);
    assert.deepEqual(shown.edges, []);
    assert.deepEqual(shown.verso.drawing.map((d) => d.id), ["d1"], "the group the map holds hides nothing; the secret's own group goes");
  });

  test("a board with no secret card is as it is, and an unreadable one that mentions one is empty", () => {
    const plain = JSON.stringify({ nodes: [BOARD.nodes[1]], edges: [] });
    assert.equal(m.projectBoard(plain), plain);
    assert.equal(m.projectBoard('{"nodes": [ {"secret"'), '{"nodes":[],"edges":[]}\n');
  });
});

describe("tiles", () => {
  test("a picture has levels until one tile holds it", () => {
    assert.equal(m.levelsOf(256, 256), 1);
    assert.equal(m.levelsOf(257, 10), 2);
    assert.equal(m.levelsOf(16000, 16000), 7);
  });

  test("the level is the most reduced that is still sharp on the screen", () => {
    assert.equal(m.levelFor(1, 7), 0);
    assert.equal(m.levelFor(2, 7), 0);
    assert.equal(m.levelFor(0.5, 7), 1);
    assert.equal(m.levelFor(0.3, 7), 1);
    assert.equal(m.levelFor(0.26, 7), 1);
    assert.equal(m.levelFor(0.24, 7), 2);
    assert.equal(m.levelFor(0.0001, 7), 6, "never past the last level");
  });

  test("a picture fits its card like object-fit contain", () => {
    assert.deepEqual(m.fitted({ w: 400, h: 400 }, { w: 800, h: 400 }), { x: 0, y: 100, w: 400, h: 200 });
    assert.deepEqual(m.fitted({ w: 400, h: 100 }, { w: 200, h: 200 }), { x: 150, y: 0, w: 100, h: 100 });
  });

  test("the tiles in view are the ones the view meets, with a margin, cut at the edges", () => {
    const size = { width: 1000, height: 600 };
    const one = m.tilesIn(size, 0, [0, 0, 100, 100]);
    assert.deepEqual(one.map((t) => [t.x, t.y]), [[0, 0]]);
    const wide = m.tilesIn(size, 0, [200, 0, 600, 100]);
    assert.deepEqual(wide.map((t) => t.x), [0, 1, 2]);
    const edge = m.tilesIn(size, 0, [900, 500, 1000, 600]);
    assert.deepEqual(edge.map((t) => [t.x, t.y, t.pw, t.ph]), [[3, 1, 232, 256], [3, 2, 232, 88]]);
    const margin = m.tilesIn(size, 0, [300, 300, 310, 310], 1);
    assert.equal(margin.length, 9);
    assert.deepEqual(m.tilesIn(size, 1, [0, 0, 1000, 600]).map((t) => [t.x, t.y]), [[0, 0], [1, 0], [0, 1], [1, 1]]);
    assert.deepEqual(m.tilesIn(size, 0, [-500, -500, -10, -10]), [], "a view past the picture meets no tile");
  });

  test("the tiles nearest the middle are asked for first", () => {
    const tiles = m.tilesIn({ width: 1024, height: 256 }, 0, [0, 0, 1024, 256]);
    assert.deepEqual(m.nearestFirst(tiles, [900, 100]).map((t) => t.x), [3, 2, 1, 0]);
  });

  test("tiles are kept, asked a few at a time, and one the view no longer wants is not asked for", async () => {
    const asked = [];
    let release = [];
    const cache = new m.TileCache((level, x, y) => new Promise((resolve) => {
      asked.push(`${level}/${x}/${y}`);
      release.push(() => resolve(`t${x}`));
    }), () => {}, 3, 2);
    const t = (x) => ({ level: 0, x, y: 0 });
    cache.want([t(0), t(1)]);
    const a = cache.get(t(0));
    const b = cache.get(t(1));
    const c = cache.get(t(2));
    assert.deepEqual(asked, ["0/0/0", "0/1/0"], "two at a time");
    assert.equal(cache.get(t(0)), a, "the same ask is one");
    // The view moved on: tile 2 is not wanted when its turn comes.
    cache.want([t(5)]);
    release.shift()();
    release.shift()();
    assert.equal(await a, "data:image/png;base64,t0");
    assert.equal(await b, "data:image/png;base64,t1");
    assert.equal(await c, null);
    assert.deepEqual(asked, ["0/0/0", "0/1/0"], "never asked");
    assert.equal(cache.peek(t(0)), "data:image/png;base64,t0");
    // Past the most it keeps (3), the least recently used goes.
    release = [];
    cache.want([t(7), t(8), t(9)]);
    for (const x of [7, 8, 9]) {
      const p = cache.get(t(x));
      release.shift()?.();
      await p;
    }
    assert.equal(cache.peek(t(1)), undefined);
  });
});
