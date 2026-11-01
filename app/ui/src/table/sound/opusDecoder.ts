// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The listener's Opus decoder (ADR 0116 item 18): libopus compiled to
// WebAssembly (`opus-decoder`, MIT; libopus is BSD-3-Clause), the same on
// every engine — WebCodecs is not relied on. 48 kHz stereo, as the host
// encodes. Only the lazy chunk of a live share imports this file (item 30).
//
// A lost frame is **not** concealed: this build offers libopus's packet-loss
// concealment only for the most its output holds (a packet of no bytes gives
// 120 ms of guess), and the decoder, told that 120 ms were lost, fades the
// next six real frames in from a fifth of their level (measured on the
// recorded tone, test/shareDecode.test.mjs). Twenty milliseconds of silence,
// the decoder left untouched, is the better of the two: `conceal` gives
// nothing and the stream plays silence (item 18: "else silence").
//
// A packet libopus refuses gives nothing too (silence) — the library's own
// `console.error` for it is kept quiet here, since one bad packet of a live
// stream is not the window's error.

import { OpusDecoder } from "opus-decoder";
import { STREAM_RATE } from "./pcm";
import type { Decoder, Pcm } from "./shareStream";

type Decoded = { channelData: Float32Array[]; samplesDecoded: number; errors: unknown[] };

/** A decoder, once its WebAssembly is compiled. */
export async function opusDecoder(): Promise<Decoder> {
  const d = new OpusDecoder({ channels: 2, sampleRate: STREAM_RATE });
  await d.ready;
  const run = (packet: Uint8Array): Decoded => {
    const said = console.error;
    console.error = () => undefined;
    try {
      return d.decodeFrame(packet) as Decoded;
    } finally {
      console.error = said;
    }
  };
  const pcmOf = (out: Decoded, most: number): Pcm | null => {
    const [l, r] = out.channelData;
    if (out.errors.length > 0 || !l || out.samplesDecoded <= 0) return null;
    const n = Math.min(out.samplesDecoded, most);
    return { l: l.slice(0, n), r: (r ?? l).slice(0, n) };
  };
  return {
    decode: (packet) => (packet.length === 0 ? null : pcmOf(run(packet), PACKET_MOST)),
    conceal: () => null,
    free: () => d.free(),
  };
}

/** The most samples one packet may give: 120 ms. */
const PACKET_MOST = (STREAM_RATE / 1000) * 120;
