// A base's map view (ADR 0094 items 6 to 9): its keys read and bounded as
// Obsidian's Maps plugin reads them, a marker's place from its cell, the
// background chosen — the shipped world unless an approved origin serves
// tiles — and the shipped world itself, decoded from the file the app
// ships.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/bases/mapData.ts", "src/bases/tileSettings.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outdir: "test/.bundles/baseMap",
  logLevel: "error",
});
const m = await import("./.bundles/baseMap/mapData.js");
const { approving, OPENFREEMAP } = await import("./.bundles/baseMap/tileSettings.js");

const text = (value) => ({ kind: "text", value });
const num = (value) => ({ kind: "number", value });

describe("A marker's place", () => {
  test("a text \"lat, lng\" and a list of two, numbers or texts", () => {
    assert.deepEqual(m.coordinateOf(text("48.85837, 2.294481")), [48.85837, 2.294481]);
    assert.deepEqual(m.coordinateOf(text("48.85837,2.294481")), [48.85837, 2.294481]);
    assert.deepEqual(m.coordinateOf({ kind: "list", value: [text("48.85837"), text("2.294481")] }), [48.85837, 2.294481]);
    assert.deepEqual(m.coordinateOf({ kind: "list", value: [num(-23.55), num(-46.63)] }), [-23.55, -46.63]);
  });
  test("out of range, one number, or not a place: no marker", () => {
    assert.equal(m.coordinateOf(text("91, 0")), null);
    assert.equal(m.coordinateOf(text("0, 181")), null);
    assert.equal(m.coordinateOf(text("48.8")), null);
    assert.equal(m.coordinateOf(text("Paris")), null);
    assert.equal(m.coordinateOf({ kind: "list", value: [num(1)] }), null);
    assert.equal(m.coordinateOf({ kind: "empty" }), null);
    assert.equal(m.coordinateOf(undefined), null);
  });
});

describe("The view's keys, as the plugin bounds them", () => {
  test("defaults, clamps, and a zoom only when the view sets one", () => {
    const c = m.mapConfig({ type: "map", name: "M", coordinates: "note.coordinates" });
    assert.equal(c.coordinates, "note.coordinates");
    assert.equal(c.minZoom, 0);
    assert.equal(c.maxZoom, 18);
    assert.equal(c.defaultZoom, null);
    assert.equal(c.mapHeight, 400);
    const d = m.mapConfig({ type: "map", name: "M", minZoom: -3, maxZoom: 40, defaultZoom: 30, mapHeight: 5000 });
    assert.equal(d.minZoom, 0);
    assert.equal(d.maxZoom, 24);
    assert.equal(d.defaultZoom, 24);
    assert.equal(d.mapHeight, 2000);
  });
  test("a centre as the plugin writes it, a list, or a formula said as such", () => {
    assert.deepEqual(m.mapConfig({ type: "map", name: "", center: "[48.8, 2.3]" }).center, [48.8, 2.3]);
    assert.deepEqual(m.mapConfig({ type: "map", name: "", center: "-23.5, -46.6" }).center, [-23.5, -46.6]);
    assert.deepEqual(m.mapConfig({ type: "map", name: "", center: [10, 20] }).center, [10, 20]);
    const f = m.mapConfig({ type: "map", name: "", center: "this.coordinates" });
    assert.equal(f.center, null);
    assert.equal(f.centerFormula, "this.coordinates");
  });
  test("one tile address or several", () => {
    assert.deepEqual(m.mapConfig({ type: "map", name: "", mapTiles: "https://t.example/{z}/{x}/{y}.png" }).mapTiles, ["https://t.example/{z}/{x}/{y}.png"]);
    assert.deepEqual(m.mapConfig({ type: "map", name: "", mapTiles: ["a", " ", 3] }).mapTiles, ["a"]);
  });
});

describe("The markers of a result", () => {
  test("in the view's order, with icon and colour, rows without a place left out", () => {
    const result = {
      columns: [{ id: "file.name", name: null }, { id: "coordinates", name: null }, { id: "icon", name: null }, { id: "note.color", name: null }],
      groups: [
        {
          key: null,
          summaries: [],
          rows: [
            { path: "b.md", note: true, cells: [text("b"), text("1, 2"), text("landmark"), text("red")] },
            { path: "a.md", note: true, cells: [text("a"), { kind: "empty" }, { kind: "empty" }, { kind: "empty" }] },
            { path: "c.md", note: true, cells: [text("c"), { kind: "list", value: [num(3), num(4)] }, { kind: "empty" }, { kind: "empty" }] },
          ],
        },
      ],
    };
    const cfg = m.mapConfig({ type: "map", name: "", coordinates: "note.coordinates", markerIcon: "note.icon", markerColor: "color" });
    const out = m.markersOf(result, result.groups, cfg);
    assert.deepEqual(out.map((x) => [x.path, x.lat, x.lng, x.icon, x.color]), [["b.md", 1, 2, "landmark", "red"], ["c.md", 3, 4, null, null]]);
  });
  test("a colour a note gives is a colour, never an address", () => {
    assert.equal(m.safeColor("red"), "red");
    assert.equal(m.safeColor("#a0b0c0"), "#a0b0c0");
    assert.equal(m.safeColor("rgb(1, 2, 3)"), "rgb(1, 2, 3)");
    assert.equal(m.safeColor("url(https://x.example/p.png)"), null);
    assert.equal(m.safeColor("var(--x)"), null);
    assert.equal(m.safeColor("red; background: url(x)"), null);
  });
});

describe("What a map shows under its markers", () => {
  const cfg = (extra = {}) => m.mapConfig({ type: "map", name: "", ...extra });
  const none = { light: "", dark: "" };
  test("nothing chosen: the shipped world", () => {
    assert.deepEqual(m.chooseTiles(cfg(), false, none, [], true), { kind: "world", why: "none" });
  });
  test("a base's own tiles wait for their origin's approval", () => {
    const own = cfg({ mapTiles: "https://tiles.example.org/{z}/{x}/{y}.png" });
    assert.deepEqual(m.chooseTiles(own, false, none, [], true), { kind: "world", why: "unapproved", origin: "https://tiles.example.org" });
    assert.equal(m.chooseTiles(own, false, none, ["https://tiles.example.org"], true).kind, "tiles");
  });
  test("the person's choice, in dark mode its dark address", () => {
    const chosen = { light: OPENFREEMAP.light, dark: OPENFREEMAP.dark };
    const r = m.chooseTiles(cfg(), true, chosen, [OPENFREEMAP.origin], true);
    assert.deepEqual(r, { kind: "tiles", urls: [OPENFREEMAP.dark], origins: [OPENFREEMAP.origin] });
  });
  test("remote content off: the world, said so", () => {
    const own = cfg({ mapTiles: "https://tiles.example.org/{z}/{x}/{y}.png" });
    assert.deepEqual(m.chooseTiles(own, false, none, ["https://tiles.example.org"], false), { kind: "world", why: "remoteOff" });
  });
  test("an address that is not http(s): the world", () => {
    assert.equal(m.chooseTiles(cfg({ mapTiles: "file:///etc/x" }), false, none, [], true).why, "invalid");
  });
  test("choosing a source approves its origin, once", () => {
    assert.deepEqual(approving([], OPENFREEMAP.light, OPENFREEMAP.dark), [OPENFREEMAP.origin]);
    assert.deepEqual(approving([OPENFREEMAP.origin], "https://a.example/{z}/{x}/{y}.png", "nonsense"), [OPENFREEMAP.origin, "https://a.example"]);
  });
  test("a tile template is told from a style's address", () => {
    assert.equal(m.isTemplate("https://t/{z}/{x}/{y}.png"), true);
    assert.equal(m.isTemplate(OPENFREEMAP.light), false);
  });
});

describe("The shipped world", () => {
  test("land and borders, decoded from the file the app ships", () => {
    const topo = JSON.parse(readFileSync("node_modules/world-atlas/countries-110m.json", "utf8"));
    const w = m.worldFromTopology(topo);
    assert.ok(w.land.features.length > 100, `${w.land.features.length} land polygons`);
    assert.ok(w.borders.features.length > 100, `${w.borders.features.length} borders`);
    for (const f of [...w.land.features, ...w.borders.features]) {
      const lines = f.geometry.type === "Polygon" ? f.geometry.coordinates : [f.geometry.coordinates];
      for (const line of lines) {
        line.forEach(([lng, lat], k) => {
          assert.ok(lng >= -540 && lng <= 540 && lat >= -90.0001 && lat <= 90.0001, `${lng}, ${lat}`);
          // No step across the world: Fiji and Chukotka are not a line
          // from one edge of the map to the other.
          // Along a pole a step may cross: it runs outside the map.
          const polar = Math.abs(lat) > 89 || Math.abs(line[k - 1]?.[1] ?? 0) > 89;
          if (k > 0 && !polar) assert.ok(Math.abs(lng - line[k - 1][0]) <= 180, `a step from ${line[k - 1][0]} to ${lng} at ${lat}`);
        });
      }
    }
    // A ring closes on itself.
    const ring = w.land.features[0].geometry.coordinates[0];
    assert.deepEqual(ring[0], ring[ring.length - 1]);
  });
});
