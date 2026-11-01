// Share audio (ADR 0116 section B): the 12-byte header of a binary audio
// frame, the same bytes as `FrameHeader` in crates/verso-contract/src/audio_share.rs
// (its test pins the same vector).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/table/sound/frameHeader";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/audioFrame.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/audioFrame.test-bundle.mjs");

describe("the audio frame header", () => {
  test("is twelve big-endian bytes, as the Rust side writes them", () => {
    const frame = m.encodeFrame({ share: 0x01020304, sequence: 0x0a0b0c0d, timestampMs: 0xffeeddcc }, new Uint8Array([9]));
    assert.deepEqual([...frame.subarray(0, 12)], [1, 2, 3, 4, 0x0a, 0x0b, 0x0c, 0x0d, 0xff, 0xee, 0xdd, 0xcc]);
    assert.equal(frame[12], 9);
  });

  test("a frame round trips, the extremes included", () => {
    for (const header of [
      { share: 0, sequence: 0, timestampMs: 0 },
      { share: 7, sequence: 1, timestampMs: 20 },
      { share: 0xffffffff, sequence: 0xffffffff, timestampMs: 0xffffffff },
    ]) {
      const packet = new Uint8Array([9, 8, 7, 6]);
      const back = m.decodeFrame(m.encodeFrame(header, packet));
      assert.deepEqual(back.header, header);
      assert.deepEqual([...back.packet], [9, 8, 7, 6]);
    }
  });

  test("what is not a frame is refused", () => {
    assert.equal(m.decodeFrame(new Uint8Array(0)), null);
    assert.equal(m.decodeFrame(new Uint8Array(12)), null, "a header and no packet");
    assert.notEqual(m.decodeFrame(new Uint8Array(13)), null);
    assert.notEqual(m.decodeFrame(new Uint8Array(m.FRAME_MOST)), null);
    assert.equal(m.decodeFrame(new Uint8Array(m.FRAME_MOST + 1)), null);
    const h = { share: 1, sequence: 1, timestampMs: 1 };
    assert.equal(m.encodeFrame(h, new Uint8Array(0)), null);
    assert.notEqual(m.encodeFrame(h, new Uint8Array(m.FRAME_MOST - m.FRAME_HEADER_LEN)), null);
    assert.equal(m.encodeFrame(h, new Uint8Array(m.FRAME_MOST - m.FRAME_HEADER_LEN + 1)), null);
  });

  test("reads a view into a larger buffer", () => {
    const big = new Uint8Array(40);
    big.set([0, 0, 0, 5, 0, 0, 0, 6, 0, 0, 0, 7, 42], 10);
    const back = m.decodeFrame(big.subarray(10, 23));
    assert.deepEqual(back.header, { share: 5, sequence: 6, timestampMs: 7 });
    assert.deepEqual([...back.packet], [42]);
  });
});

describe("an audio frame told from the other binary message", () => {
  test("the share numbers start where Rust's SHARE_ID_FIRST does", () => {
    assert.equal(m.SHARE_ID_FIRST, 0x80000000);
  });

  test("the first byte's top bit, as is_audio_frame reads it", () => {
    // The vectors of `an_audio_frame_is_told_from_a_piece_of_a_file_by_its_first_byte`.
    const first = m.encodeFrame({ share: m.SHARE_ID_FIRST, sequence: 0, timestampMs: 0 }, new Uint8Array([1]));
    assert.deepEqual([...first.subarray(0, 4)], [0x80, 0, 0, 0]);
    assert.equal(m.isAudioFrame(first), true);
    assert.equal(m.isAudioFrame(new Uint8Array([0xff, 0xff, 0xff, 0xff])), true);
    // A piece's header length (verso_core::sync::frame): 48 MiB still has the bit clear.
    assert.equal(m.isAudioFrame(new Uint8Array([0x03, 0x00, 0x00, 0x00])), false);
    assert.equal(m.isAudioFrame(new Uint8Array([0x7f, 0xff, 0xff, 0xff])), false);
    assert.equal(m.isAudioFrame(new Uint8Array(0)), false);
  });

  test("the socket's messages sorted: text to the JSON path, audio to the listener, the rest to the sync path", () => {
    assert.deepEqual(m.sortMessage('{"id":1,"ok":null}'), { kind: "text", text: '{"id":1,"ok":null}' });
    const audio = m.encodeFrame({ share: 0x80000003, sequence: 9, timestampMs: 180 }, new Uint8Array([7, 7]));
    const a = m.sortMessage(audio.buffer);
    assert.equal(a.kind, "audio");
    assert.deepEqual([...a.bytes], [...audio]);
    const piece = new Uint8Array([0, 0, 0, 2, 0x7b, 0x7d, 1, 2, 3]);
    const p = m.sortMessage(piece.buffer);
    assert.equal(p.kind, "binary");
    assert.deepEqual([...p.bytes], [...piece]);
    // A view of a larger buffer is read where it lies.
    const big = new Uint8Array(20);
    big.set(audio, 4);
    assert.equal(m.sortMessage(big.subarray(4, 4 + audio.length)).kind, "audio");
    assert.equal(m.sortMessage(new Uint8Array(0)).kind, "binary");
    assert.equal(m.sortMessage(42), null, "nothing a socket gives");
  });
});
