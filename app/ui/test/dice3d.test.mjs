// 3D dice (ADR 0101): the pure parts — the solids, the forced landing for
// every die and every value, the plan of a roll, the replay's clock and the
// switch's rules — and the headless fall. No WebGL here (the stage is
// tested in the browser, e2e/dice3d.spec.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export * from "./src/dice3d/polyhedra";
export * from "./src/dice3d/force";
export * from "./src/dice3d/plan";
export * from "./src/dice3d/timeline";
export * from "./src/dice3d/sim";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  mainFields: ["module", "main"],
  outfile: "test/.bundles/dice3d.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/dice3d.test-bundle.mjs");

test("each solid is closed, convex, with outward flat faces", () => {
  const want = { d4: [4, 4], d6: [8, 6], d8: [6, 8], d10: [12, 10], d12: [20, 12], d20: [12, 20] };
  for (const shape of m.SHAPES) {
    const s = m.solid(shape);
    assert.deepEqual([s.verts.length, s.faces.length], want[shape], shape);
    // Euler: V - E + F = 2, each edge shared by two faces.
    const edges = new Set();
    for (const f of s.faces) for (let i = 0; i < f.length; i++) edges.add([f[i], f[(i + 1) % f.length]].sort().join("-"));
    assert.equal(s.verts.length - edges.size + s.faces.length, 2, `${shape} Euler`);
    s.faces.forEach((f, i) => {
      const n = s.normals[i];
      const off = m.dot(s.verts[f[0]], n);
      // Outward (the plane is on the far side of the centre), flat (every
      // vertex of the face on it), convex (no vertex beyond it).
      assert.ok(off > 0.3, `${shape} face ${i} outward`);
      for (const f2 of f) assert.ok(Math.abs(m.dot(s.verts[f2], n) - off) < 1e-9, `${shape} face ${i} flat`);
      for (const v of s.verts) assert.ok(m.dot(v, n) <= off + 1e-9, `${shape} face ${i} convex`);
    });
    // Centred on the origin.
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(s.verts.reduce((a, v) => a + v[k], 0)) < 1e-9, `${shape} centred`);
    // Every die but the d4 has an opposite face for each face.
    for (let i = 0; i < s.items; i++) {
      const o = m.oppositeOf(shape, i);
      if (shape === "d4") assert.equal(o, -1);
      else {
        assert.ok(o >= 0 && o !== i, `${shape} ${i} has an opposite`);
        assert.equal(m.oppositeOf(shape, o), i);
        assert.ok(m.dot(s.normals[i], s.normals[o]) < -0.999, `${shape} ${i} opposite is straight across`);
      }
    }
  }
});

/** The quaternion that turns direction `a` onto `b` (both unit). */
function between(a, b) {
  const d = m.dot(a, b);
  if (d < -0.999999) return [1, 0, 0, 0];
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const w = 1 + d;
  const l = Math.hypot(c[0], c[1], c[2], w);
  return [c[0] / l, c[1] / l, c[2] / l, w / l];
}

test("reading the top: a die resting on any item reads that item", () => {
  for (const shape of m.SHAPES) {
    const s = m.solid(shape);
    const dirs = shape === "d4" ? s.verts.map((v) => v.map((x) => x / Math.hypot(...v))) : s.normals;
    dirs.forEach((d, i) => {
      assert.equal(m.readUp(shape, between(d, [0, 1, 0])), i, `${shape} ${i}`);
    });
  }
});

test("a die's numbers: every set sums opposite faces, and holds each value it should", () => {
  for (const [shape, set, sides] of [["d4", "std", 4], ["d6", "std", 6], ["d8", "std", 8], ["d10", "std", 10], ["d12", "std", 12], ["d20", "std", 20], ["d10", "pct0", 10], ["d10", "tens", 10], ["d6", "d3", 3], ["d6", "d2", 2], ["d6", "fudge", 3]]) {
    const v = m.baseValues(shape, set, sides);
    assert.equal(v.length, m.itemsOf(shape));
    assert.ok(v.every(Number.isFinite), `${shape}/${set}`);
    assert.deepEqual([...new Set(v)].sort((a, b) => a - b), m.valuesOf(set, sides), `${shape}/${set} carries each value`);
    if (set === "std") {
      assert.deepEqual([...v].sort((a, b) => a - b), Array.from({ length: sides }, (_, i) => i + 1), `${shape} each number once`);
      if (shape !== "d4") v.forEach((x, i) => assert.equal(x + v[m.oppositeOf(shape, i)], sides + 1, `${shape} opposites`));
    }
  }
});

test("forced landing: any face that lands can be made to show any value, for every die", () => {
  for (const [shape, set, sides] of [["d4", "std", 4], ["d6", "std", 6], ["d8", "std", 8], ["d10", "std", 10], ["d12", "std", 12], ["d20", "std", 20], ["d10", "pct0", 10], ["d10", "tens", 10], ["d6", "d3", 3], ["d6", "d2", 2], ["d6", "fudge", 3]]) {
    const base = m.baseValues(shape, set, sides);
    for (const target of m.valuesOf(set, sides)) {
      for (let landed = 0; landed < base.length; landed++) {
        const out = m.forceLabels(base, landed, target);
        assert.equal(out[landed], target, `${shape}/${set} face ${landed} shows ${target}`);
        // The die keeps all its numbers: only a swap.
        assert.deepEqual([...out].sort((a, b) => a - b), [...base].sort((a, b) => a - b), `${shape}/${set} keeps its numbers`);
      }
    }
    assert.equal(base.length, m.itemsOf(shape));
  }
  // The input is never changed.
  const b = m.baseValues("d20", "std", 20);
  const copy = [...b];
  m.forceLabels(b, 3, 17);
  assert.deepEqual(b, copy);
});

test("what a face reads as", () => {
  assert.equal(m.labelText("std", 10, 10), "0");
  assert.equal(m.labelText("std", 10, 7), "7");
  assert.equal(m.labelText("tens", 10, 0), "00");
  assert.equal(m.labelText("tens", 10, 40), "40");
  assert.equal(m.labelText("pct0", 10, 0), "0");
  assert.equal(m.labelText("fudge", 3, -1), "−");
  assert.equal(m.labelText("fudge", 3, 0), "0");
  assert.equal(m.labelText("fudge", 3, 1), "+");
  assert.equal(m.labelText("std", 20, 9), "9.");
  assert.equal(m.labelText("std", 6, 6), "6");
  assert.equal(m.labelText("std", 20, 20), "20");
});

const roll = (notation, terms, extra = {}) => ({ notation, source: null, terms, modifier: 0, total: 0, by: "", at: "2026-10-21T12:00:00.000Z", ...extra });
const term = (sides, kept, dropped = [], sign = 1, fudge = false) => ({ sign, sides, fudge, kept, dropped });

test("the plan of a roll: which dice fall, showing what", () => {
  const p = m.planRoll(roll("2d6+1d20", [term(6, [3, 6]), term(20, [14])]));
  assert.deepEqual(p.map((d) => [d.shape, d.set, d.value, d.role]), [["d6", "std", 3, "kept"], ["d6", "std", 6, "kept"], ["d20", "std", 14, "kept"]]);
  // Dropped dice fall too, and a subtracted term is marked.
  const k = m.planRoll(roll("4d6kh3-1d4", [term(6, [6, 5, 3], [1]), term(4, [2], [], -1)]));
  assert.deepEqual(k.map((d) => d.role), ["kept", "kept", "kept", "dropped", "negative"]);
  // A d100 is two dice: tens and units.
  const d = m.planRoll(roll("d%", [term(100, [57])]));
  assert.deepEqual(d.map((x) => [x.set, x.value]), [["tens", 50], ["pct0", 7]]);
  for (const [v, tens, units] of [[100, 0, 0], [10, 10, 0], [1, 0, 1], [99, 90, 9], [90, 90, 0]]) {
    const q = m.planRoll(roll("d%", [term(100, [v])]));
    assert.deepEqual([q[0].value, q[1].value], [tens, units], String(v));
    assert.equal(q[0].value + q[1].value || 100, v, `${v} adds back up`);
  }
  // A d3 and a d2 ride on a d6, a fudge die too.
  assert.deepEqual(m.planRoll(roll("1d3", [term(3, [2])])).map((x) => [x.shape, x.set]), [["d6", "d3"]]);
  assert.deepEqual(m.planRoll(roll("1d2", [term(2, [1])])).map((x) => [x.shape, x.set]), [["d6", "d2"]]);
  assert.deepEqual(m.planRoll(roll("2dF", [term(3, [-1, 1], [], 1, true)])).map((x) => [x.set, x.value]), [["fudge", -1], ["fudge", 1]]);
});

test("beyond twenty dice, exploding dice and odd sizes get no 3D fall", () => {
  const n = (c) => Array.from({ length: c }, () => 3);
  assert.equal(m.planRoll(roll("20d6", [term(6, n(20))])).length, 20);
  assert.equal(m.planRoll(roll("21d6", [term(6, n(21))])), null);
  assert.equal(m.planRoll(roll("10d6+10d6", [term(6, n(10)), term(6, n(10))])).length, 20);
  assert.equal(m.planRoll(roll("20d6kh3", [term(6, n(3), n(17))])).length, 20);
  // A d100 counts as two dice.
  assert.equal(m.planRoll(roll("10d%", [term(100, Array.from({ length: 10 }, () => 50))])).length, 20);
  assert.equal(m.planRoll(roll("11d%", [term(100, Array.from({ length: 11 }, () => 50))])), null);
  assert.equal(m.planRoll(roll("1d6!", [term(6, [6, 2])])), null);
  assert.equal(m.planRoll(roll("1d7", [term(7, [4])])), null);
  assert.equal(m.planRoll(roll("1d1000", [term(1000, [400])])), null);
  assert.equal(m.planRoll(roll("0", [])), null);
});

test("the switch's rules: off by default, 'Everything' leaves it alone, reduced motion forces it off", async () => {
  assert.equal(m.dice3dActive(false, false), false);
  assert.equal(m.dice3dActive(true, false), true);
  assert.equal(m.dice3dActive(true, true), false);
  assert.equal(m.dice3dActive(false, true), false);
});

test("the room's id: the same event heard again is not animated twice", () => {
  const a = roll("1d20", [term(20, [14])], { by: "Bia" });
  const id = m.rollId("Mesa.md", a);
  assert.equal(m.rollId("Mesa.md", { ...a }), id);
  assert.notEqual(m.rollId("Outra.md", a), id);
  assert.notEqual(m.rollId("Mesa.md", { ...a, at: "2026-10-21T12:00:01.000Z" }), id);
  const s = m.seenIds(3);
  assert.equal(s.seen(id), false);
  s.mark(id);
  assert.equal(s.seen(id), true);
  s.mark(id);
  for (const x of ["1", "2", "3"]) s.mark(x);
  // Bounded: the oldest is forgotten.
  assert.equal(s.seen(id), false);
  assert.equal(s.seen("3"), true);
});

test("the replay's clock: real time, skip, and a maximum", () => {
  const tl = m.timeline(121);
  assert.equal(Math.round(tl.settleMs), 2000);
  assert.equal(Math.round(tl.endMs), 2000 + m.HOLD_MS);
  assert.deepEqual(m.playhead(tl, 0, false), { at: 0, done: false });
  const mid = m.playhead(tl, 500, false);
  assert.equal(Math.round(mid.at), 30);
  assert.equal(mid.done, false);
  // After the last frame the dice rest, shown for the hold.
  assert.deepEqual(m.playhead(tl, 2500, false), { at: 120, done: false });
  assert.deepEqual(m.playhead(tl, tl.endMs, false), { at: 120, done: true });
  // Skipped: over at once, on the last frame.
  assert.deepEqual(m.playhead(tl, 10, true), { at: 120, done: true });
  // A recording longer than the maximum still ends at it.
  const long = m.timeline(5000);
  assert.equal(long.endMs, m.MAX_ANIMATION_MS);
  assert.equal(m.playhead(long, m.MAX_ANIMATION_MS, false).done, true);
  assert.equal(m.playhead(long, m.MAX_ANIMATION_MS - 1, false).done, false);
  assert.ok(m.timeline(1).endMs >= 0);
});

/** A seeded generator, so a failure repeats. */
function seeded(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("the headless fall: every die lands on a flat face, and the forced labels show the result", () => {
  const arena = { halfX: 7, halfZ: 4 };
  for (const shape of m.SHAPES) {
    for (let seed = 1; seed <= 3; seed++) {
      const fall = m.simulate([shape, shape, shape], arena, seeded(seed * 7919));
      assert.equal(fall.landed.length, 3);
      assert.ok(fall.rested, `${shape} seed ${seed} came to rest in ${fall.frames} steps`);
      assert.ok(fall.frames <= m.STEPS_MOST);
      fall.landed.forEach((item, i) => {
        const q = m.lastQuat(fall, i);
        assert.equal(m.readUp(shape, q), item);
        const s = m.solid(shape);
        // Flat on the table: the face read points straight up (a d4 rests
        // on a face, its vertex up).
        const up = shape === "d4" ? m.rotate(s.verts[item], q)[1] / Math.hypot(...s.verts[item]) : m.rotate(s.normals[item], q)[1];
        // (a die may lean on a neighbour: flat enough to read.)
        assert.ok(up > 0.8, `${shape} seed ${seed} die ${i} rests flat (${up.toFixed(3)})`);
        // And in the arena.
        const o = (fall.frames - 1) * 7;
        const p = fall.poses[i];
        assert.ok(Math.abs(p[o]) < arena.halfX + 0.2 && Math.abs(p[o + 2]) < arena.halfZ + 0.2 && p[o + 1] > 0 && p[o + 1] < 6, `${shape} stays on the table`);
        // The result is forced onto what landed.
        const base = m.baseValues(shape, "std", shape === "d4" ? 4 : Number(shape.slice(1)));
        const target = base[(item + 1) % base.length];
        assert.equal(m.forceLabels(base, item, target)[item], target);
      });
    }
  }
});

test("twenty dice fall and rest in a bounded time", () => {
  const shapes = Array.from({ length: 20 }, (_, i) => m.SHAPES[i % m.SHAPES.length]);
  const started = performance.now();
  const fall = m.simulate(shapes, { halfX: 9, halfZ: 5 }, seeded(42));
  const took = performance.now() - started;
  console.log(`# 20 dice: ${fall.frames} steps, rested=${fall.rested}, ${took.toFixed(0)} ms`);
  assert.ok(took < 5000, `simulated in ${took} ms`);
  fall.landed.forEach((item, i) => {
    const s = m.solid(shapes[i]);
    const q = m.lastQuat(fall, i);
    const up = shapes[i] === "d4" ? m.rotate(s.verts[item], q)[1] / Math.hypot(...s.verts[item]) : m.rotate(s.normals[item], q)[1];
    assert.ok(up > 0.8 || !fall.rested, `die ${i} (${shapes[i]}) flat ${up}`);
  });
});
