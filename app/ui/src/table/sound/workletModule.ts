// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The share's AudioWorklet module (`shareWorklet.ts`, built to `share-worklet.js`), added once per audio context:
// for the sound of a share heard (`listener.ts`) and for the window's own sounds sent to the host while a Mac
// shares (`shareOwn.ts`).

import { asset } from "../../version";
import { WORKLET_FILE } from "./pcm";

const added = new WeakMap<AudioContext, Promise<void>>();

export function addWorklet(ctx: AudioContext): Promise<void> {
  let p = added.get(ctx);
  if (!p) {
    p = ctx.audioWorklet.addModule(new URL(asset(WORKLET_FILE), document.baseURI).href);
    // A refusal is tried again at the next need.
    p.catch(() => added.delete(ctx));
    added.set(ctx, p);
  }
  return p;
}
