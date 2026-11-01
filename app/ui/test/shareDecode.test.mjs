// Share audio (ADR 0116 item 18): what a listener does with the frames before
// any audio node — the WASM libopus (`opus-decoder`) decoding recorded
// frames of a stereo tone (test/fixtures/opus: 440 Hz left, 660 Hz right,
// 48 kHz, 96 kbit/s, 20 ms; made by make.mjs there), the concealment of a
// lost frame, a broken packet as silence; the stream through the jitter
// buffer with frames reordered, lost and of another share; and the worklet's
// queue read out at 48 and 44.1 kHz. The jitter buffer alone:
// shareJitter.test.mjs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export * from "./src/table/sound/opusDecoder"; export * from "./src/table/sound/shareStream"; export * from "./src/table/sound/pcm";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  // Node loads it from node_modules as it is (its Web Worker part asks for Node's own modules).
  external: ["opus-decoder"],
  outfile: "test/.bundles/shareDecode.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/shareDecode.test-bundle.mjs");

const fixture = JSON.parse(readFileSync(new URL("./fixtures/opus/tone.json", import.meta.url), "utf8"));
const frames = (() => {
  const b = readFileSync(new URL("./fixtures/opus/tone.frames", import.meta.url));
  const out = [];
  for (let at = 0; at < b.length; ) {
    const n = b.readUInt16BE(at);
    out.push(new Uint8Array(b.subarray(at + 2, at + 2 + n)));
    at += 2 + n;
  }
  return out;
})();
const packetOf = (frame) => frame.subarray(12);

/** The tone's frequency in `samples` at `rate`, by its zero crossings. */
const frequency = (samples, rate) => {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i - 1] < 0 !== samples[i] < 0) crossings++;
  return (crossings / 2) * (rate / samples.length);
};
const rms = (samples) => Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length);
const join = (parts) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

describe("the recorded frames", () => {
  test("are what make.mjs says: 21 frames of share 0x8000_0001, in sequence, 20 ms apart", () => {
    assert.equal(frames.length, fixture.frames);
    frames.forEach((f, i) => {
      const v = new DataView(f.buffer, f.byteOffset);
      assert.equal(v.getUint32(0), fixture.share);
      assert.equal(v.getUint32(4), i);
      assert.equal(v.getUint32(8), i * 20);
      assert.ok(f.length > 12 && f.length <= 1500);
    });
  });
});

describe("the WASM decoder", () => {
  test("decodes each frame to 20 ms of stereo at 48 kHz: the tone, left 440 Hz and right 660 Hz", async () => {
    const d = await m.opusDecoder();
    const l = [];
    const r = [];
    for (const f of frames) {
      const pcm = d.decode(packetOf(f));
      assert.ok(pcm, "decoded");
      assert.equal(pcm.l.length, 960);
      assert.equal(pcm.r.length, 960);
      l.push(pcm.l);
      r.push(pcm.r);
    }
    // The encoder's pre-skip and its start aside: the middle of the tone.
    const left = join(l.slice(2, 19));
    const right = join(r.slice(2, 19));
    assert.ok(Math.abs(frequency(left, 48000) - fixture.left) < 10, `left ${frequency(left, 48000)}`);
    assert.ok(Math.abs(frequency(right, 48000) - fixture.right) < 10, `right ${frequency(right, 48000)}`);
    // ffmpeg's sine is at 1/8 of full scale: an RMS of about 0.088.
    assert.ok(Math.abs(rms(left) - 0.088) < 0.01, `rms ${rms(left)}`);
    d.free();
  });

  test("a lost frame is silence, and the next one decodes at its level", async () => {
    const d = await m.opusDecoder();
    for (const f of frames.slice(0, 10)) d.decode(packetOf(f));
    // libopus's own guess here is 120 ms long and fades the next six frames
    // in from a fifth of their level (opusDecoder.ts): not used.
    assert.equal(d.conceal(), null);
    const after = d.decode(packetOf(frames[11]));
    assert.equal(after.l.length, 960);
    assert.ok(rms(after.l) > 0.075, `rms after the gap ${rms(after.l)}`);
    d.free();
  });

  test("a decoder that does conceal is used for a few lost frames in a row, then silence", () => {
    const one = () => ({ l: new Float32Array(960).fill(0.5), r: new Float32Array(960).fill(0.5) });
    const s = new m.ShareStream({ decode: one, conceal: one, free() {} }, fixture.share);
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 22]) {
      const f = new Uint8Array(frames[0]);
      new DataView(f.buffer).setUint32(4, i);
      new DataView(f.buffer).setUint32(8, i * 20);
      s.feed(f, 0);
    }
    // The span is 23 frames: the first eight are cut to the delay (fifteen).
    const got = [];
    for (let t = 0; t < 15; t++) got.push(...s.supply(2 * 960, t * 20));
    assert.equal(got.length, 15);
    assert.equal(s.stats.concealed, m.CONCEAL_MOST);
    assert.equal(s.stats.silent, 8 - m.CONCEAL_MOST);
    assert.equal(rms(got.at(-2).l), 0);
  });

  test("a broken packet is nothing (silence), never a throw", async () => {
    const d = await m.opusDecoder();
    // A TOC byte of code 3 with a frame count of 0: invalid.
    assert.equal(d.decode(new Uint8Array([0xfb, 0x00])), null);
    assert.ok(d.decode(packetOf(frames[3])), "and goes on");
    d.free();
  });
});

describe("the stream", () => {
  test("frames reordered, one lost and some of another share: in order, the loss silent, the stranger left out", async () => {
    const s = new m.ShareStream(await m.opusDecoder(), fixture.share);
    const order = [0, 1, 2, 4, 3, 5, 6, 8, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].filter((i) => i !== 12);
    const stranger = new Uint8Array(frames[5]);
    new DataView(stranger.buffer).setUint32(0, 0x80000009);
    let now = 0;
    // The first 300 ms at once (the delay), the rest one a tick, live.
    const later = order.filter((i) => i >= 15);
    for (const i of order.filter((i) => i < 15)) s.feed(frames[i], now);
    s.feed(stranger, now);
    assert.equal(s.stats.foreign, 1);
    // The worklet empty, then taking 960 a tick: what it is given, in turn.
    const out = [];
    let queued = 0;
    for (let tick = 0; tick < 30; tick++, now += 20) {
      for (const pcm of s.supply(queued, now)) {
        out.push(pcm);
        queued += pcm.l.length;
      }
      queued = Math.max(0, queued - 960);
      const next = later.shift();
      if (next !== undefined) s.feed(frames[next], now + 10);
    }
    assert.equal(s.stats.silent, 1, "frame 12");
    assert.equal(s.stats.frames, 20);
    assert.equal(s.jitter.stats.lost, 1);
    // 21 turns: frames 0 to 20, 12 silent.
    assert.equal(out.length, 21);
    assert.equal(rms(out[12].l), 0);
    const left = join(out.slice(2, 12).map((p) => p.l));
    assert.ok(Math.abs(frequency(left, 48000) - fixture.left) < 15, `left ${frequency(left, 48000)}`);
    s.free();
  });

  test("before the delay is held nothing is given; a broken frame plays as silence", async () => {
    const s = new m.ShareStream(await m.opusDecoder(), fixture.share);
    for (const f of frames.slice(0, 10)) s.feed(f, 0);
    assert.deepEqual(s.supply(0, 0), [], "200 ms is under the delay");
    const bad = new Uint8Array(14);
    new DataView(bad.buffer).setUint32(0, fixture.share);
    new DataView(bad.buffer).setUint32(4, 10);
    new DataView(bad.buffer).setUint32(8, 200);
    bad.set([0xfb, 0x00], 12);
    s.feed(bad, 0);
    for (const f of frames.slice(11, 15)) s.feed(f, 0);
    const out = s.supply(0, 0);
    assert.equal(out.length, 3, "the worklet's low water: three frames");
    // Then one a tick, the worklet holding two frames each time.
    const all = [...out];
    for (let t = 1; t <= 12; t++) all.push(...s.supply(2 * 960, t * 20));
    assert.equal(all.length, 15);
    assert.equal(s.stats.broken, 1);
    assert.equal(rms(all[10].l), 0, "frame 10 is silence");
    s.free();
  });
});

describe("the worklet's queue", () => {
  const tone = (hz, n, rate = 48000) => Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / rate));

  test("at 48 kHz it plays the samples as they are", () => {
    const q = new m.PcmQueue(48000);
    const t = tone(440, 960);
    q.push(t, t);
    const l = new Float32Array(128);
    const r = new Float32Array(128);
    assert.equal(q.render(l, r, 48000), 128);
    for (let i = 0; i < 128; i++) assert.ok(Math.abs(l[i] - t[i]) < 1e-6, `sample ${i}`);
    assert.equal(q.queued, 960 - 128);
  });

  test("at 44.1 kHz it is the same tone, resampled", () => {
    const q = new m.PcmQueue(48000);
    const t = tone(1000, 48000);
    q.push(t, t);
    const l = new Float32Array(44100 / 2);
    const r = new Float32Array(44100 / 2);
    assert.equal(q.render(l, r, 44100), l.length);
    const want = tone(1000, l.length, 44100);
    let err = 0;
    for (let i = 0; i < l.length; i++) err = Math.max(err, Math.abs(l[i] - want[i]));
    assert.ok(err < 0.005, `the most error ${err}`);
    assert.ok(Math.abs(q.queued - 24000) <= 2, `queued ${q.queued}`);
  });

  test("empty, it is silence; full, the oldest go", () => {
    const q = new m.PcmQueue(1000);
    const l = new Float32Array(128).fill(9);
    const r = new Float32Array(128).fill(9);
    assert.equal(q.render(l, r, 48000), 0);
    assert.ok(l.every((x) => x === 0) && r.every((x) => x === 0));
    const t = tone(440, 1500);
    assert.equal(q.push(t, t), 500);
    assert.equal(q.queued, 1000);
    q.render(l, r, 48000);
    assert.ok(Math.abs(l[0] - t[500]) < 1e-6, "the oldest kept is the 500th");
  });
});
