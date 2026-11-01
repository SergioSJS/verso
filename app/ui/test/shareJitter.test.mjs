// Share audio (ADR 0116 item 18): the listener's jitter buffer, as a pure
// model — frames pushed as they arrive (in order, reordered, lost, late,
// twice, the late joiner's two-second ring at once), pulled once per 20 ms of
// output; a delay of 300 ms grown to 600 on a loss and brought back after a
// quiet stretch. The decoder and the worklet around it: shareDecode.test.mjs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/table/sound/jitter";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/shareJitter.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/shareJitter.test-bundle.mjs");

const packet = (seq) => new Uint8Array([seq & 0xff]);
/** Push `seqs` at `now`, each with its own timestamp (20 ms apart from `base`). */
const push = (j, seqs, now, base = 0) => seqs.map((s) => j.push(s >>> 0, (((s - base) >>> 0) * 20) >>> 0, packet(s), now));
/** Pull `n` times, 20 ms apart from `now`; what came, as short words. */
const pull = (j, n, now) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = j.pull(now + i * 20);
    out.push(p.kind === "frame" ? p.sequence : p.kind === "lost" ? `lost ${p.sequence}` : "wait");
  }
  return out;
};
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

describe("the jitter buffer", () => {
  test("waits for 300 ms of frames, then plays them in order", () => {
    const j = new m.Jitter();
    assert.equal(j.delayMs, 300);
    push(j, range(0, 14), 0);
    assert.deepEqual(pull(j, 1, 0), ["wait"], "280 ms is not yet enough");
    push(j, [14], 0);
    assert.equal(j.playing, false);
    assert.deepEqual(pull(j, 3, 20), [0, 1, 2]);
    assert.equal(j.playing, true);
  });

  test("puts reordered frames back in order", () => {
    const j = new m.Jitter();
    push(j, [0, 1, 2, 4, 3, 6, 5, 7, 8, 9, 11, 10, 12, 13, 14], 0);
    assert.deepEqual(pull(j, 15, 0), range(0, 15));
    assert.equal(j.stats.lost, 0);
  });

  test("a frame missing at its turn is lost (concealed), the delay grows to 600 ms, and it is late if it comes after", () => {
    const j = new m.Jitter();
    push(j, [...range(0, 5), ...range(6, 15)], 0);
    assert.deepEqual(pull(j, 7, 0), [0, 1, 2, 3, 4, "lost 5", 6]);
    assert.equal(j.stats.lost, 1);
    assert.equal(j.delayMs, 600);
    assert.equal(push(j, [5], 200)[0], "late");
    assert.equal(j.stats.late, 1);
    assert.deepEqual(pull(j, 1, 200), [7]);
  });

  test("a frame twice is kept once", () => {
    const j = new m.Jitter();
    assert.deepEqual(push(j, [0, 0], 0), ["kept", "duplicate"]);
    assert.equal(j.stats.duplicate, 1);
  });

  test("running dry waits again, for the grown delay", () => {
    const j = new m.Jitter();
    push(j, range(0, 15), 0);
    assert.deepEqual(pull(j, 16, 0), [...range(0, 15), "wait"]);
    assert.equal(j.playing, false);
    assert.equal(j.stats.underruns, 1);
    assert.equal(j.delayMs, 600);
    push(j, range(15, 44), 400);
    assert.deepEqual(pull(j, 1, 400), ["wait"], "29 frames: under 600 ms");
    push(j, [44], 420);
    assert.deepEqual(pull(j, 2, 440), [15, 16]);
  });

  test("a late joiner's ring is cut to the delay: it starts near the live edge", () => {
    const j = new m.Jitter();
    push(j, range(0, 100), 0);
    assert.deepEqual(pull(j, 2, 0), [85, 86]);
    assert.equal(j.stats.skipped, 85);
  });

  test("after a quiet stretch the delay comes back to 300 ms, a frame at a time", () => {
    const j = new m.Jitter();
    let seq = 0;
    let now = 0;
    // Steady: one frame in, one out, every 20 ms.
    const run = (ms) => {
      for (const end = now + ms; now < end; now += 20) {
        j.push(seq, seq * 20, packet(seq), now);
        seq++;
        j.pull(now);
      }
    };
    push(j, range(0, 15), 0);
    seq = 15;
    run(200);
    // Half a second of the sender's frames never come: the buffer runs dry,
    // and fills again to 600 ms.
    for (const end = now + 500; now < end; now += 20) j.pull(now);
    seq += 25;
    run(1000);
    assert.equal(j.stats.underruns, 1);
    assert.equal(j.delayMs, 600);
    assert.ok(j.depth >= 28, `depth ${j.depth}`);
    run(m.QUIET_MS - 2000);
    assert.equal(j.delayMs, 600, "not before the quiet stretch");
    run(2000 + 16 * m.SHRINK_EVERY_MS);
    assert.equal(j.delayMs, 300);
    // The depth follows, a frame skipped a second at most, nothing lost.
    run(20 * m.SKIP_EVERY_MS);
    assert.ok(j.depth <= 300 / 20 + 2, `depth ${j.depth}`);
    assert.ok(j.stats.skipped >= 12, `skipped ${j.stats.skipped}`);
    assert.equal(j.stats.lost, 0);
    assert.equal(j.stats.underruns, 1);
  });

  test("a loss with frames after it grows the delay as well", () => {
    const j = new m.Jitter();
    push(j, [...range(0, 3), ...range(4, 15)], 0);
    pull(j, 5, 0);
    assert.equal(j.delayMs, 600);
  });

  test("far too deep (a stalled window) is cut back to the delay at once", () => {
    const j = new m.Jitter();
    push(j, range(0, 15), 0);
    pull(j, 1, 0);
    push(j, range(15, 80), 1500);
    assert.equal(pull(j, 1, 1500)[0], 80 - 15);
    assert.ok(j.depth <= 15, `depth ${j.depth}`);
  });

  test("sequences wrap at 2^32", () => {
    const j = new m.Jitter();
    const base = 0xfffffff8;
    const seqs = range(0, 15).map((i) => (base + i) >>> 0);
    push(j, seqs, 0, base);
    assert.deepEqual(pull(j, 15, 0), seqs);
  });

  test("a jump of sequence or time starts over", () => {
    const j = new m.Jitter();
    push(j, range(0, 15), 0);
    pull(j, 3, 0);
    push(j, range(10_000, 10_015), 100, 10_000);
    assert.equal(j.stats.resets, 1);
    assert.deepEqual(pull(j, 2, 120), [10_000, 10_001]);
    // Same sequence order, but its time 10 s off: another source.
    const k = new m.Jitter();
    push(k, range(0, 15), 0);
    assert.equal(k.push(15, 15 * 20 + 10_000, packet(15), 0), "kept");
    assert.equal(k.stats.resets, 1);
  });
});
