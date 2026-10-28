// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The service worker of the window served by a UniVerso (ADR 0092 item 2).
// Its one job is for the installed page to open without a network and show
// the folders kept on the device; it keeps the window's own code, and reads
// the files the page keeps in IndexedDB (src/web/offline/store.ts) to answer
// a kept folder's pictures offline. It never keeps an answer of the server's
// API, a note, or a folder's file: what a folder holds is the page's store,
// wiped when the person signs out (ADR 0092 item 6), and this worker has
// none of it.
//
// Scope and script, deliberate (ADR 0073 item 6's strict policy: scripts,
// styles and connections from the server only, `worker-src 'self' blob:`):
//  - the script is `/sw.js`, the server's own file, at the root, so that its
//    scope is the whole window (`/`) and no other path is needed;
//  - it fetches nothing from another origin, and a request that is not a GET
//    of this origin is never answered by it;
//  - it is registered only in a secure context (HTTPS, or `localhost`) and
//    only after the person turns offline on for a folder;
//  - a new build of the window is a new `VERSION` here, so a new worker, whose
//    activation deletes the old build's caches: the code kept is always one
//    build's, the server's.
// The build (build-sw.mjs) fills `__VERSION__` (the version and the build's
// own hash: a new build is a new cache even under the same version),
// `__CORE__` and `__REST__`.

import { DB_NAME } from "../web/offline/store";

declare const __VERSION__: string;
/** Files the window needs to open: kept at install. */
declare const __CORE__: string[];
/** The rest of the window's files (a board, a map, a PDF, a diagram):
 *  kept in the background once the person turns offline on. */
declare const __REST__: string[];

// The parts of a service worker's scope this file uses (the project's
// TypeScript is compiled for the page, with no "webworker" library).
type Waiting = { waitUntil(p: Promise<unknown>): void };
type FetchEv = Waiting & { request: Request; clientId: string; resultingClientId: string; respondWith(r: Promise<Response> | Response): void };
type MessageEv = Waiting & { data: unknown };
type Scope = {
  location: Location;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void>; get(id: string): Promise<{ postMessage(m: unknown): void } | undefined>; matchAll(): Promise<{ postMessage(m: unknown): void }[]> };
  addEventListener(type: "install" | "activate", fn: (e: Waiting) => void): void;
  addEventListener(type: "fetch", fn: (e: FetchEv) => void): void;
  addEventListener(type: "message", fn: (e: MessageEv) => void): void;
};
const sw = self as unknown as Scope;

const CACHE = `verso-shell-${__VERSION__}`;
const SHELL = "/";
const known = new Set<string>([...__CORE__, ...__REST__]);

const reload = (url: string): Request => new Request(url, { cache: "reload" });

sw.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.add(reload(SHELL));
      await keep(cache, __CORE__);
      await sw.skipWaiting();
    })(),
  );
});

sw.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith("verso-shell-") && name !== CACHE) await caches.delete(name);
      await sw.clients.claim();
    })(),
  );
});

/** Fetch `urls` into the cache, a few at a time; the first failure is
 *  thrown (install is retried by the browser). */
async function keep(cache: Cache, urls: string[], progress?: (done: number) => void): Promise<void> {
  let next = 0;
  let done = 0;
  const lane = async (): Promise<void> => {
    for (;;) {
      const url = urls[next++];
      if (url === undefined) return;
      if (!(await cache.match(url))) {
        const res = await fetch(reload(url));
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        await cache.put(url, res);
      }
      progress?.(++done);
    }
  };
  await Promise.all(Array.from({ length: 6 }, lane));
}

async function tell(message: unknown): Promise<void> {
  for (const c of await sw.clients.matchAll()) c.postMessage(message);
}

sw.addEventListener("message", (e) => {
  const m = e.data as { type?: string } | null;
  if (m?.type !== "precache-rest") return;
  // Told the page how it goes: it shows the progress, and says when the
  // window opens fully offline.
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const total = __REST__.length;
      let last = 0;
      try {
        await keep(cache, __REST__, (done) => {
          if (done - last >= 25 || done === total) {
            last = done;
            void tell({ type: "precache", done, total });
          }
        });
        await tell({ type: "precache", done: total, total, ready: true });
      } catch (error) {
        await tell({ type: "precache", done: last, total, failed: String(error) });
      }
    })(),
  );
});

sw.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return;
  const path = url.pathname;
  // The API, the WebSocket and the server's own pages are never ours.
  if (path.startsWith("/api/") || path.startsWith("/.well-known/")) return;
  if (path.startsWith("/f/")) {
    e.respondWith(folderFile(e, url));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(navigate(req));
    return;
  }
  if (known.has(path)) e.respondWith(fromCache(req));
});

/** The page: from the network when it answers, from the cache when it does
 *  not (or not within a few seconds, if there is a page kept). */
async function navigate(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const kept = await cache.match(SHELL);
  try {
    const net = fetch(req);
    const res = kept ? await Promise.race([net, new Promise<never>((_, no) => setTimeout(() => no(new Error("slow")), 5000))]) : await net;
    if (res.ok && (res.headers.get("content-type") ?? "").startsWith("text/html") && !res.redirected) void cache.put(SHELL, res.clone());
    return res;
  } catch {
    if (kept) return kept;
    return new Response("Sem rede, e esta página ainda não foi guardada neste aparelho. / No network, and this page is not kept on this device yet.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

async function fromCache(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) void cache.put(req, res.clone());
  return res;
}

// ---- A kept folder's files ------------------------------------------------------

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
};

/** The server's policy for a folder's file (crates/verso-server/src/files.rs):
 *  a file of a folder is inert, whatever its name says. */
const FILE_CSP = "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:";

/** A folder's file: the server's when it answers (and the page is told the
 *  file was opened, so that a folder kept "once opened" keeps it); the
 *  device's when it does not. */
async function folderFile(e: FetchEv, url: URL): Promise<Response> {
  const [, , id, ...rest] = url.pathname.split("/");
  const path = rest.map(decodeURIComponent).join("/");
  try {
    const res = await fetch(e.request);
    if (res.ok && id) {
      const client = await sw.clients.get(e.clientId || e.resultingClientId);
      const note = { type: "opened", folder: decodeURIComponent(id), path };
      if (client) client.postMessage(note);
      else void tell(note);
    }
    return res;
  } catch {
    const kept = id ? await readKept(decodeURIComponent(id), path) : null;
    if (!kept) return new Response("Este arquivo não está guardado neste aparelho. / This file is not kept on this device.", { status: 504, headers: { "content-type": "text/plain; charset=utf-8" } });
    return answer(kept, path, e.request.headers.get("range"));
  }
}

function readKept(id: string, path: string): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    const open = indexedDB.open(DB_NAME);
    open.onerror = () => resolve(null);
    // The page makes the database; one that is not there is not made here.
    open.onupgradeneeded = () => {
      open.transaction?.abort();
      resolve(null);
    };
    open.onsuccess = () => {
      const db = open.result;
      try {
        const get = db.transaction("blobs", "readonly").objectStore("blobs").get([id, path]);
        get.onsuccess = () => {
          db.close();
          const row = get.result as { bytes: ArrayBuffer } | undefined;
          resolve(row ? row.bytes : null);
        };
        get.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    };
  });
}

function answer(bytes: ArrayBuffer, path: string, range: string | null): Response {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const headers: Record<string, string> = {
    "content-type": TYPES[ext] ?? "application/octet-stream",
    "content-security-policy": FILE_CSP,
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
    "accept-ranges": "bytes",
    "cache-control": "no-store",
  };
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m && (m[1] !== "" || m[2] !== "")) {
    const len = bytes.byteLength;
    const start = m[1] === "" ? Math.max(0, len - Number(m[2])) : Number(m[1]);
    const end = m[1] === "" || m[2] === "" ? len - 1 : Math.min(len - 1, Number(m[2]));
    if (start <= end && start < len) {
      return new Response(bytes.slice(start, end + 1), { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${len}` } });
    }
  }
  return new Response(bytes, { status: 200, headers });
}
