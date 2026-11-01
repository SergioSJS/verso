// The recorded Opus frames the share-audio tests decode (ADR 0116 item 18),
// made once and committed, so the tests need no encoder:
//
//   node test/fixtures/opus/make.mjs      (from app/ui; needs ffmpeg with libopus)
//
// It encodes 0.4 s of a stereo tone — 440 Hz on the left, 660 Hz on the
// right, half scale — as the host will send a share: 48 kHz, stereo,
// 96 kbit/s, 20 ms frames (`audio_share.rs`: SAMPLE_RATE, CHANNELS,
// FRAME_MS, BITRATE_DEFAULT). ffmpeg writes an Ogg Opus file; the Ogg pages
// are taken apart here (RFC 3533 lacing) and the first two packets (OpusHead,
// OpusTags) dropped: what is left is the bare Opus packets a share carries.
//
// Written to `tone.frames`: each packet as the wire carries it — the 12-byte
// header of `frameHeader.ts` (share 0x8000_0001, sequence from 0, timestamp
// 20 ms apart) and the packet — each such frame preceded by its length as
// two bytes, big-endian. The encoder's pre-skip (OpusHead bytes 10..12) is
// written to `tone.json` beside the frame count.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const SHARE = 0x8000_0001;
const FRAME_MS = 20;

const dir = mkdtempSync(join(tmpdir(), "verso-opus-"));
try {
  const ogg = join(dir, "tone.opus");
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.4",
    "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=48000:duration=0.4",
    "-filter_complex", "[0:a][1:a]join=inputs=2:channel_layout=stereo[a]",
    "-map", "[a]", "-c:a", "libopus", "-b:a", "96k", "-frame_duration", String(FRAME_MS), "-application", "audio",
    "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact",
    ogg,
  ]);
  const packets = oggPackets(readFileSync(ogg));
  const [head, , ...audio] = packets;
  if (!head || String.fromCharCode(...head.subarray(0, 8)) !== "OpusHead") throw new Error("not an Ogg Opus file");
  const preSkip = head[10] | (head[11] << 8);
  const parts = [];
  audio.forEach((packet, i) => {
    const frame = new Uint8Array(12 + packet.length);
    const v = new DataView(frame.buffer);
    v.setUint32(0, SHARE, false);
    v.setUint32(4, i, false);
    v.setUint32(8, i * FRAME_MS, false);
    frame.set(packet, 12);
    const len = new Uint8Array([frame.length >> 8, frame.length & 0xff]);
    parts.push(len, frame);
  });
  writeFileSync(join(here, "tone.frames"), Buffer.concat(parts));
  writeFileSync(join(here, "tone.json"), JSON.stringify({ frames: audio.length, preSkip, share: SHARE, left: 440, right: 660 }, null, 2) + "\n");
  console.log(`tone.frames: ${audio.length} frames, pre-skip ${preSkip}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

/** The packets of an Ogg stream (one logical stream), in order. */
function oggPackets(bytes) {
  const out = [];
  let partial = [];
  let at = 0;
  while (at + 27 <= bytes.length) {
    if (bytes.toString("latin1", at, at + 4) !== "OggS") throw new Error(`no page at ${at}`);
    const segments = bytes[at + 26];
    const table = bytes.subarray(at + 27, at + 27 + segments);
    let body = at + 27 + segments;
    for (const len of table) {
      partial.push(bytes.subarray(body, body + len));
      body += len;
      // A lacing value under 255 ends a packet.
      if (len < 255) {
        out.push(new Uint8Array(Buffer.concat(partial)));
        partial = [];
      }
    }
    at = body;
  }
  return out;
}
