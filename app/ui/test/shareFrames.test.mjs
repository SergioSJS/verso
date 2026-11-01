// Share audio (ADR 0116 section B): what the sharer's window does with the
// host's frames — writes the server's share number over the header and
// sends the frame as one binary message.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export * from "./src/table/sound/shareFrames"; export * from "./src/table/sound/frameHeader";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/shareFrames.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/shareFrames.test-bundle.mjs");

/** A frame as the host makes it: share 0 (unset), a sequence, a time, a packet. */
function hostFrame(sequence) {
  return m.encodeFrame({ share: 0, sequence, timestampMs: sequence * 20 }, new Uint8Array([1, 2, 3, 4, 5]));
}

describe("the sharer's window forwarding the host's frames", () => {
  test("writes the share number over the header and keeps the rest", () => {
    const sent = [];
    const { onFrame, counts } = m.forwardFrames(() => 0xabcdef01, (f) => sent.push(f));
    onFrame(hostFrame(7).buffer);
    assert.equal(sent.length, 1);
    const back = m.decodeFrame(sent[0]);
    assert.equal(back.header.share, 0xabcdef01);
    assert.equal(back.header.sequence, 7);
    assert.equal(back.header.timestampMs, 140);
    assert.deepEqual([...back.packet], [1, 2, 3, 4, 5]);
    assert.deepEqual(counts, { sent: 1, dropped: 0 });
  });

  test("does not change the buffer the channel gave", () => {
    const sent = [];
    const { onFrame } = m.forwardFrames(() => 9, (f) => sent.push(f));
    const raw = hostFrame(1);
    onFrame(raw);
    assert.equal(m.decodeFrame(raw).header.share, 0);
    assert.notEqual(sent[0].buffer, raw.buffer);
  });

  test("takes a byte list as well as an ArrayBuffer", () => {
    const sent = [];
    const { onFrame } = m.forwardFrames(() => 3, (f) => sent.push(f));
    onFrame([...hostFrame(2)]);
    onFrame(hostFrame(3));
    assert.deepEqual(sent.map((f) => m.decodeFrame(f).header.sequence), [2, 3]);
  });

  test("drops frames until the server has given a share number, then sends", () => {
    let id = null;
    const sent = [];
    const { onFrame, counts } = m.forwardFrames(() => id, (f) => sent.push(f));
    onFrame(hostFrame(0));
    onFrame(hostFrame(1));
    id = 12;
    onFrame(hostFrame(2));
    assert.deepEqual(counts, { sent: 1, dropped: 2 });
    assert.equal(m.decodeFrame(sent[0]).header.share, 12);
  });

  test("drops what is not a frame", () => {
    const sent = [];
    const { onFrame, counts } = m.forwardFrames(() => 1, (f) => sent.push(f));
    onFrame(new Uint8Array(12));
    onFrame(new Uint8Array(m.FRAME_MOST + 1));
    onFrame("text");
    assert.equal(sent.length, 0);
    assert.equal(counts.dropped, 3);
  });
});
