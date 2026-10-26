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
export * from "./src/dice3d/sim";
export * from "./src/dice3d/labels";
export * from "./src/dice3d/gl";`,
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

test("beyond twenty dice and odd sizes get no 3D fall", () => {
  const n = (c) => Array.from({ length: c }, () => 3);
  assert.equal(m.planRoll(roll("20d6", [term(6, n(20))])).length, 20);
  assert.equal(m.planRoll(roll("21d6", [term(6, n(21))])), null);
  assert.equal(m.planRoll(roll("10d6+10d6", [term(6, n(10)), term(6, n(10))])).length, 20);
  assert.equal(m.planRoll(roll("20d6kh3", [term(6, n(3), n(17))])).length, 20);
  // A d100 counts as two dice.
  assert.equal(m.planRoll(roll("10d%", [term(100, Array.from({ length: 10 }, () => 50))])).length, 20);
  assert.equal(m.planRoll(roll("11d%", [term(100, Array.from({ length: 11 }, () => 50))])), null);
  assert.equal(m.planRoll(roll("1d7", [term(7, [4])])), null);
  assert.equal(m.planRoll(roll("1d1000", [term(1000, [400])])), null);
  assert.equal(m.planRoll(roll("0", [])), null);
});

test("an exploding die falls in waves, each after the die that added it", () => {
  const waves = (notation, kept, count = 3, sides = 6) => m.planRoll(roll(notation, [term(sides, kept)])).map((d) => d.wave ?? 0);
  // No explosion: all at once.
  assert.deepEqual(waves("3d6!", [3, 1, 5]), [0, 0, 0]);
  // One explosion: the second die hit its highest face, the extra is wave 1.
  assert.deepEqual(waves("3d6!", [3, 6, 5, 4]), [0, 0, 0, 1]);
  // A chain, 6 then 6 then 2: the first 6 adds the 6 (wave 1), which adds the 2 (wave 2).
  assert.deepEqual(waves("3d6!", [6, 4, 1, 6, 2]), [0, 0, 0, 1, 2]);
  // Two sixes at once: two extras in wave 1, and the first extra's own explosion in wave 2.
  assert.deepEqual(waves("3d6!", [6, 6, 1, 6, 3, 2]), [0, 0, 0, 1, 1, 2]);
  assert.deepEqual(m.explosionWaves([6, 6, 1, 6, 3, 2], 3, 6), [0, 0, 0, 1, 1, 2]);
  // A die of another size reads its own highest face.
  assert.deepEqual(waves("1d20!", [20, 3], 1, 20), [0, 1]);
  // The dice the explosions add count against the twenty.
  assert.equal(m.planRoll(roll("20d6!", [term(6, [...Array.from({ length: 20 }, () => 3), 4])])), null);
  // A plain term beside an exploding one stays in wave 0.
  const mixed = m.planRoll(roll("1d20+1d6!", [term(20, [6]), term(6, [6, 2])]));
  assert.deepEqual(mixed.map((d) => [d.shape, d.wave ?? 0]), [["d20", 0], ["d6", 0], ["d6", 1]]);
  // With keep or drop the order they fell in is lost: all in one wave.
  assert.deepEqual(m.planRoll(roll("2d6!kh2", [term(6, [6, 5], [2])])).map((d) => d.wave ?? 0), [0, 0, 0]);
  // An exploding d100 stays a card.
  assert.equal(m.planRoll(roll("1d%!", [term(100, [100, 3])])), null);
});

test("the waves are thrown one after the other: the extra dice enter the table later", () => {
  const arena = { halfX: 7, halfZ: 4 };
  const shapes = ["d6", "d6", "d6", "d6", "d6"];
  const fall = m.simulate(shapes, arena, seeded(11), [0, 0, 0, 1, 2]);
  assert.deepEqual(fall.born.slice(0, 3), [0, 0, 0]);
  assert.ok(fall.born[3] > 0 && fall.born[4] >= fall.born[3], `born ${fall.born}`);
  assert.ok(fall.frames <= m.STEPS_MOST);
  assert.ok(fall.born[4] <= m.WAVE_LATEST_STEP);
  // The ones thrown first have settled (or the latest step came) before the next.
  assert.ok(fall.born[3] >= m.WAVE_GAP_STEPS);
  const none = m.simulate(shapes, arena, seeded(11));
  assert.deepEqual(none.born, [0, 0, 0, 0, 0]);
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
  const settle = Math.round(2000 / m.PLAYBACK_SPEED);
  assert.equal(Math.round(tl.settleMs), settle);
  assert.equal(Math.round(tl.endMs), settle + m.HOLD_MS);
  assert.deepEqual(m.playhead(tl, 0, false), { at: 0, done: false });
  const mid = m.playhead(tl, 500, false);
  assert.equal(Math.round(mid.at), Math.round(30 * m.PLAYBACK_SPEED));
  assert.equal(mid.done, false);
  // After the last frame the dice rest, shown for the hold.
  assert.deepEqual(m.playhead(tl, settle + 10, false), { at: 120, done: false });
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

test("the roll time: Fast and Slow replay the same fall sooner and later, Normal is the old speed", () => {
  const normal = m.timeline(121, m.speedOf("normal"));
  assert.deepEqual(normal, m.timeline(121));
  const fast = m.timeline(121, m.speedOf("fast"));
  const slow = m.timeline(121, m.speedOf("slow"));
  assert.ok(fast.settleMs < normal.settleMs && normal.settleMs < slow.settleMs);
  assert.equal(Math.round(slow.settleMs), 2000);
  // Half way through, each is at the frame its speed gives.
  assert.ok(m.playhead(fast, 500, false).at > m.playhead(slow, 500, false).at);
  // The longest fall (the physics' maximum) still reaches its last frame on Slow.
  const longest = m.timeline(m.STEPS_MOST, m.speedOf("slow"));
  assert.ok(longest.endMs > m.MAX_ANIMATION_MS);
  assert.equal(m.playhead(longest, longest.endMs, false).done, true);
  assert.equal(m.playhead(longest, longest.endMs - 1, false).done, false);
  assert.equal(m.playhead(longest, longest.settleMs, false).at, m.STEPS_MOST - 1);
  assert.equal(m.timeline(m.STEPS_MOST).endMs <= m.MAX_ANIMATION_MS, true);
});

test("the fall records its hits for the sound: on the table, die on die, one of each kind a step", () => {
  const arena = { halfX: 12, halfZ: 7 };
  for (const seed of [1, 2, 3]) {
    const fall = m.simulate(["d6", "d20", "d6", "d8"], arena, seeded(seed * 31));
    assert.ok(fall.hits.length > 0, `seed ${seed}`);
    assert.ok(fall.hits.some((h) => h.kind === "table"));
    const frames = fall.hits.map((h) => h.frame);
    assert.deepEqual(frames, [...frames].sort((a, b) => a - b));
    assert.equal(new Set(fall.hits.map((h) => `${h.frame}${h.kind}`)).size, frames.length, "one of each kind a step");
    for (const h of fall.hits) {
      assert.ok(h.frame >= 0 && h.frame < fall.frames);
      assert.ok(h.speed >= 0 && h.die >= 0 && h.die < 4);
    }
  }
});

test("a hit's replay time is the playhead's own mapping, inverted, at every speed", () => {
  for (const time of ["fast", "normal", "slow"]) {
    const speed = m.speedOf(time);
    const tl = m.timeline(m.STEPS_MOST, speed);
    for (const frame of [0, 1, 17, 60, 119, m.STEPS_MOST - 1]) {
      const ms = m.frameMs(frame, speed);
      if (ms >= tl.endMs) continue;
      // The dice are drawn at the hit's frame exactly at that time.
      assert.ok(Math.abs(m.playhead(tl, ms, false).at - frame) < 1e-9, `${time} frame ${frame}`);
    }
  }
});

test("due hits: placed ahead of their moment, in order, never twice, none late past 60 ms, none after the last frame", () => {
  const speed = m.speedOf("normal");
  const tl = m.timeline(121, speed);
  const hits = [10, 10 + 1, 40, 40, 90, 120].map((frame) => ({ frame }));
  // Walk the replay in 16 ms callbacks: every hit comes out once, ahead of time.
  const heardAt = new Map();
  let next = 0;
  for (let t = 0; t <= tl.endMs + 100; t += 16) {
    const due = m.dueHits(hits, tl, next, t);
    next = due.next;
    for (const d of due.play) {
      assert.ok(!heardAt.has(d.index), "once");
      assert.ok(d.inMs <= m.HIT_AHEAD_MS && d.inMs >= -m.HIT_LATE_MS);
      heardAt.set(d.index, t + d.inMs);
    }
  }
  assert.equal(heardAt.size, hits.length);
  hits.forEach((h, i) => assert.ok(Math.abs(heardAt.get(i) - m.frameMs(h.frame, speed)) < 1e-6));
  // A stall: the callback comes 500 ms late. The hits long past are dropped, not bunched.
  const stalled = m.dueHits(hits, tl, 0, m.frameMs(40, speed) + 500);
  assert.deepEqual(stalled.play.map((d) => d.index), [4], "only the one still ahead; frames 10 to 40 are passed over");
  assert.equal(stalled.next, 5);
  // A hit 50 ms late is still played (immediately); 70 ms late is not.
  assert.equal(m.dueHits([{ frame: 30 }], tl, 0, m.frameMs(30, speed) + 50).play.length, 1);
  assert.equal(m.dueHits([{ frame: 30 }], tl, 0, m.frameMs(30, speed) + 70).play.length, 0);
  // A fall cut at the maximum time: hits past the last replayed frame are never played.
  const cut = m.timeline(5000, speed);
  const beyond = [{ frame: 100 }, { frame: 4000 }];
  const all = m.dueHits(beyond, cut, 0, cut.settleMs + 10);
  assert.equal(all.next, 2);
  assert.ok(all.play.every((d) => d.index === 0));
});

test("the replay clock: a long frame advances it by a bounded amount, a normal one by its own time, never backwards", () => {
  assert.equal(m.advance(100, 16), 116);
  assert.equal(m.advance(100, 698), 100 + m.FRAME_MAX_MS);
  assert.equal(m.advance(100, -5), 100);
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

// ---- Where the numbers go: centred on the face, upright, inside it ----

/** The 3D point of a cell's middle: the point the UVs put at (0.5, 0.5)
 *  of the face's cell, found through the fan the geometry is built from. */
function middleOf(shape, f, cell) {
  const sol = m.solid(shape);
  const face = sol.faces[f];
  const inTri = (a, b, c, p) => {
    const d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    const l1 = ((b[0] - p[0]) * (c[1] - p[1]) - (c[0] - p[0]) * (b[1] - p[1])) / d;
    const l2 = ((c[0] - p[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (c[1] - p[1])) / d;
    return [l1, l2, 1 - l1 - l2];
  };
  for (let k = 1; k < face.length - 1; k++) {
    const idx = [0, k, k + 1];
    const w = inTri(cell.points[0], cell.points[k], cell.points[k + 1], [0.5, 0.5]);
    if (w.every((x) => x >= -1e-9)) {
      return [0, 1, 2].map((a) => idx.reduce((sum, j, i) => sum + w[i] * sol.verts[face[j]][a], 0));
    }
  }
  throw new Error("the middle of the cell is not on the face");
}

/** How far a 3D point on a face is from its nearest edge. */
function edgeDepth(shape, f, p) {
  const sol = m.solid(shape);
  const face = sol.faces[f];
  const n = sol.normals[f];
  let least = Infinity;
  face.forEach((a, i) => {
    const A = sol.verts[a];
    const B = sol.verts[face[(i + 1) % face.length]];
    const e = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const len = Math.hypot(...e);
    const inward = [n[1] * e[2] - n[2] * e[1], n[2] * e[0] - n[0] * e[2], n[0] * e[1] - n[1] * e[0]];
    const d = ((p[0] - A[0]) * inward[0] + (p[1] - A[1]) * inward[1] + (p[2] - A[2]) * inward[2]) / len;
    least = Math.min(least, d);
  });
  return least;
}

test("every face's label middle is the middle of its largest inscribed circle", () => {
  for (const shape of m.SHAPES) {
    const sol = m.solid(shape);
    const cols = Math.ceil(Math.sqrt(sol.faces.length));
    const rows = Math.ceil(sol.faces.length / cols);
    const cells = m.cellsOf(shape, cols, rows);
    sol.faces.forEach((face, f) => {
      const mid = middleOf(shape, f, cells[f]);
      const pts = face.map((i) => sol.verts[i]);
      const centroid = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length);
      const regular = shape !== "d10";
      if (regular) {
        for (let k = 0; k < 3; k++) assert.ok(Math.abs(mid[k] - centroid[k]) < 1e-6, `${shape} face ${f}: the middle is the centroid`);
      } else {
        // The kite's: at least as far from every edge as the centroid, and
        // as any point of a grid over the face.
        const best = edgeDepth(shape, f, mid);
        assert.ok(best >= edgeDepth(shape, f, centroid) - 1e-9, `${shape} face ${f}`);
        for (let i = 0; i <= 20; i++)
          for (let j = 0; j <= 20; j++) {
            const q = [0, 1, 2].map((k) => pts[0][k] + ((pts[1][k] - pts[0][k]) * i) / 20 + ((pts[3][k] - pts[0][k]) * j) / 20);
            assert.ok(best >= edgeDepth(shape, f, q) - 2e-3, `${shape} face ${f}: no point is deeper`);
          }
      }
    });
  }
});

test("a face's number stands upright by the real dice's convention", () => {
  const top = (pts) => Math.max(...pts.map((p) => p[1]));
  for (const shape of m.SHAPES) {
    const sol = m.solid(shape);
    const cols = Math.ceil(Math.sqrt(sol.faces.length));
    const cells = m.cellsOf(shape, cols, Math.ceil(sol.faces.length / cols));
    cells.forEach((cell, f) => {
      const high = cell.points.filter((p) => Math.abs(p[1] - top(cell.points)) < 1e-6);
      if (shape === "d6") {
        // An edge on top, level: the number reads along the edges, never on the diagonal.
        assert.equal(high.length, 2, `d6 face ${f}`);
      } else {
        // A corner straight above the middle (triangles, pentagons, the kite's tip).
        assert.equal(high.length, 1, `${shape} face ${f}`);
        assert.ok(Math.abs(high[0][0] - 0.5) < 1e-6, `${shape} face ${f}: the corner is above the middle`);
      }
    });
  }
});

test("a number is centred by its ink and fits inside every face with a margin", () => {
  // A fake canvas measure: ink offset on purpose from the em box.
  const measure = (t) => ({ actualBoundingBoxLeft: 30 * t.length - 4, actualBoundingBoxRight: 30 * t.length + 10, actualBoundingBoxAscent: 76, actualBoundingBoxDescent: 3 });
  const ink = m.inkOf(measure, "12");
  const at = m.centred(ink, 50, 64, 64);
  // Drawn at (x, y) with centre alignment and an alphabetic baseline, the
  // ink spans [x - l, x + r] and [y - a, y + d]: its middle is (64, 64).
  assert.ok(Math.abs(at.x + ((ink.r - ink.l) / 2) * 50 - 64) < 1e-9);
  assert.ok(Math.abs(at.y - ((ink.a - ink.d) / 2) * 50 - 64) < 1e-9);
  for (const shape of m.SHAPES) {
    if (shape === "d4") continue;
    const sol = m.solid(shape);
    const cols = Math.ceil(Math.sqrt(sol.faces.length));
    const cells = m.cellsOf(shape, cols, Math.ceil(sol.faces.length / cols));
    for (const [w, h] of [[0.6, 0.72], [1.2, 0.72], [1.35, 0.9]]) {
      cells.forEach((cell, f) => {
        const r = m.inradius(cell.points) * m.CELL;
        const size = m.fitSize(cell.points, w, h, m.CELL, r * 0.22, r * 1.3);
        // The four corners of the ink box are inside the face.
        for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const q = [0.5 + (sx * w * size) / 2 / m.CELL, 0.5 + (sy * h * size) / 2 / m.CELL];
          assert.ok(m.inradius(cell.points) > 0);
          let inside = Infinity;
          cell.points.forEach((a, i) => {
            const b = cell.points[(i + 1) % cell.points.length];
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            inside = Math.min(inside, ((dx * (q[1] - a[1]) - dy * (q[0] - a[0])) / Math.hypot(dx, dy)) * m.CELL);
          });
          assert.ok(inside >= r * 0.22 - 1e-6, `${shape} face ${f} ${w}x${h}: ${inside}`);
        }
      });
    }
  }
});

test("the WebGL probe: no context, a software renderer or a throwing canvas end in 2D; a real GPU passes", () => {
  const ctx = (renderer, ext = true) => ({
    RENDERER: 0x1f01,
    getExtension: (n) => (n === "WEBGL_debug_renderer_info" && ext ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null),
    getParameter: (p) => (p === 0x9246 || p === 0x1f01 ? renderer : null),
  });
  const canvas = (gl) => () => ({ getContext: () => gl });
  assert.deepEqual(m.probeGl(canvas(null)), { ok: false, why: "none" });
  assert.deepEqual(m.probeGl(() => { throw new Error("x"); }), { ok: false, why: "none" });
  assert.deepEqual(m.probeGl(canvas(ctx("llvmpipe (LLVM 15.0.7, 256 bits)"))), { ok: false, why: "software" });
  assert.deepEqual(m.probeGl(canvas(ctx("Google SwiftShader"))), { ok: false, why: "software" });
  assert.deepEqual(m.probeGl(canvas(ctx("softpipe", false))), { ok: false, why: "software" });
  assert.deepEqual(m.probeGl(canvas(ctx("Mesa Intel(R) UHD Graphics 620"))), { ok: true });
  assert.deepEqual(m.probeGl(canvas(ctx("Apple M2"))), { ok: true });
  // the probe asks with failIfMajorPerformanceCaveat
  let asked;
  m.probeGl(() => ({ getContext: (k, o) => ((asked = o), null) }));
  assert.equal(asked.failIfMajorPerformanceCaveat, true);
});

test("the session verdict is kept, said once, and a runtime failure turns 3D off", () => {
  m.resetGl();
  let n = 0;
  const good = () => (n++, { getContext: () => ({ getExtension: () => null, getParameter: () => "GPU" }) });
  assert.equal(m.glVerdict(good).ok, true);
  assert.equal(m.glVerdict(good).ok, true);
  assert.equal(n, 1);
  assert.equal(m.shouldTell(), false);
  m.failGl();
  assert.equal(m.glVerdict(good).ok, false);
  assert.equal(m.shouldTell(), true);
  assert.equal(m.shouldTell(), false);
  m.resetGl();
});
