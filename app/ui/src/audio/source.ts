// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where an <audio> element's bytes come from: the table's music and the
// audio players in notes give their element its file through here.
//
// On Linux the app's web view is WebKitGTK, whose media engine (GStreamer)
// opens only http(s), blob and a few of its own addresses: a file on the
// app's own schemes — `verso://` for the folder's files, `tauri://` for the
// app's — fails at once with MediaError 4 (WebKit's `isProtocolAllowed`
// refuses the scheme; seen on WebKitGTK 2.52, 2026-11-04), though `fetch`
// reads the same address. There, and only there, the file is fetched and
// handed to the element as a blob of the page's own making (`media-src
// blob:` in the CSP). The whole file is then held while it plays: a sound
// file is read whole by the host anyway, the table plays one track at a
// time, and a note's player fetches its file only when it is played. Every
// other platform, and the web, keeps the file's own address (streamed, its
// length known before it plays).

import { LINUX } from "../platform";
import { prepareMedia } from "../dice3d/ownOutput";

type Env = {
  linux: boolean;
  fetchBlob: (url: string) => Promise<Blob>;
  makeUrl: (blob: Blob) => string;
  revoke: (url: string) => void;
};

async function fetchBlob(url: string): Promise<Blob> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.blob();
}

const DEFAULT_ENV: Env = {
  linux: LINUX,
  fetchBlob,
  makeUrl: (b) => URL.createObjectURL(b),
  revoke: (u) => URL.revokeObjectURL(u),
};
let env: Env = DEFAULT_ENV;

/** Schemes WebKitGTK's media engine opens itself. */
const PLAYABLE = new Set(["http:", "https:", "blob:", "data:"]);

/** Whether `url` must reach a media element as a blob here: an address on a
 *  scheme of the app's own (`verso:`, `tauri:`) in Linux's web view. */
export function needsBlob(url: string, linux = env.linux): boolean {
  if (!linux) return false;
  try {
    return !PLAYABLE.has(new URL(url, location.href).protocol);
  } catch {
    return false;
  }
}

type Held = {
  /** The file the element is to play. */
  want: string;
  /** The blob's address the element was given, while it holds one. */
  blob: string | null;
  /** The fetch under way, if any. */
  loading: Promise<boolean> | null;
  /** Bumped at each new file: a fetch for an older one is dropped. */
  turn: number;
};
const held = new WeakMap<HTMLMediaElement, Held>();

function drop(el: HTMLMediaElement, h: Held): void {
  if (h.blob) env.revoke(h.blob);
  h.blob = null;
  h.loading = null;
}

/**
 * Give `el` the file at `url`: its own address, or (Linux, an app scheme)
 * a blob fetched from it. With `lazy`, a blob is fetched only when
 * `ensureSource` asks (a note's player, when it is played). Resolves once
 * the element has its `src` (true), or nothing came of it (false: a newer
 * file was given meanwhile, or the element was left without one).
 */
export function setSource(el: HTMLMediaElement, url: string, lazy = false): Promise<boolean> {
  const h = held.get(el);
  if (h) {
    drop(el, h);
    h.turn++;
  }
  if (!needsBlob(url)) {
    held.delete(el);
    prepareMedia(el, url);
    el.src = url;
    return Promise.resolve(true);
  }
  const next: Held = { want: url, blob: null, loading: null, turn: h ? h.turn : 0 };
  held.set(el, next);
  el.removeAttribute("crossorigin");
  if (el.getAttribute("src") !== null) {
    el.removeAttribute("src");
    el.load();
  }
  return lazy ? Promise.resolve(false) : ensureSource(el);
}

/** Whether `el` has its file now (a blob not yet fetched is the one case it has not). */
export function sourceReady(el: HTMLMediaElement): boolean {
  const h = held.get(el);
  return !h || h.blob !== null;
}

/** Fetch the blob `el` waits for, if it waits for one; true once it has its `src`. */
export function ensureSource(el: HTMLMediaElement): Promise<boolean> {
  const h = held.get(el);
  if (!h || h.blob) return Promise.resolve(true);
  if (h.loading) return h.loading;
  const turn = h.turn;
  const url = h.want;
  h.loading = env.fetchBlob(url).then(
    (blob) => {
      if (held.get(el) !== h || h.turn !== turn) return false;
      h.blob = env.makeUrl(blob);
      h.loading = null;
      el.src = h.blob;
      return true;
    },
    () => {
      if (held.get(el) !== h || h.turn !== turn) return false;
      h.loading = null;
      // Not read: the element is given the address itself and fails as any
      // file that does not load (its own `error`, the player's message).
      el.src = url;
      return true;
    },
  );
  return h.loading;
}

/** Let go of the blob `el` holds (a player gone from the page); its file is fetched again if it is played again. */
export function releaseSource(el: HTMLMediaElement): void {
  const h = held.get(el);
  if (!h || (!h.blob && !h.loading)) return;
  drop(el, h);
  h.turn++;
  el.removeAttribute("src");
  el.load();
}

/** Leave `el` with no file at all. */
export function clearSource(el: HTMLMediaElement): void {
  const h = held.get(el);
  if (h) drop(el, h);
  held.delete(el);
  el.removeAttribute("src");
  el.load();
}

/** For tests: a platform, a fetch and blob addresses of their own; none puts the real ones back. */
export function setSourceEnvForTests(e: Partial<Env> | null): void {
  env = e ? { ...DEFAULT_ENV, ...e } : DEFAULT_ENV;
}
