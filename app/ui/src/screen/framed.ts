// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A web page where the side has no child web views — a browser served by
// the server (ADR 0076 item 11; capability `web_views`): the page in an
// iframe if the site allows being framed (embed_frameable), and a card
// to open it in a new tab when it does not.

import { commands } from "../bindings";
import { h } from "../dom";
import { st } from "./strings";

/** What the host said of each origin (true, false), or the question still on its way. */
export const frameVerdicts = new Map<string, boolean | Promise<boolean>>();

/** The app's own origin: the page the window runs in, the desktop host's
 *  (`tauri://localhost`, `http(s)://tauri.localhost`) and the app's own scheme
 *  (`verso:`). A frame with scripts and the page's own origin would reach the
 *  window and its session, so none is ever built for it, and the host is not
 *  asked (review I7). */
export function isAppOrigin(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol === "tauri:" || u.protocol === "verso:") return true;
  if ((u.protocol === "http:" || u.protocol === "https:") && u.hostname === "tauri.localhost") return true;
  try {
    return u.origin !== "null" && u.origin === location.origin;
  } catch {
    return false;
  }
}

/** How long a failed check (no answer, offline) is taken as a no before it is asked again. */
export const RETRY_FAILED_MS = 30_000;

const failed = new Set<string>();

/** The failed checks are forgotten: the next question for those origins goes to the host again. */
export function forgetFailedVerdicts(): void {
  for (const origin of failed) if (frameVerdicts.get(origin) === false) frameVerdicts.delete(origin);
  failed.clear();
}

export function frameable(url: string): Promise<boolean> {
  if (isAppOrigin(url)) return Promise.resolve(false);
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return Promise.resolve(false);
  }
  const known = frameVerdicts.get(origin);
  if (typeof known === "boolean") return Promise.resolve(known);
  if (known) return known;
  // Only a definite answer is kept for good. A failure (the host timed out,
  // the network was down) counts as a no for a while, then is asked again.
  const ask = commands.embedFrameable(url).then(
    (r): { ok: boolean; definite: boolean } => (r.status === "ok" ? { ok: r.data, definite: true } : { ok: false, definite: false }),
    () => ({ ok: false, definite: false }),
  );
  const verdict = ask.then((a) => a.ok);
  frameVerdicts.set(origin, verdict);
  void ask.then((a) => {
    frameVerdicts.set(origin, a.ok);
    if (!a.definite) {
      failed.add(origin);
      const timer = setTimeout(() => {
        failed.delete(origin);
        if (frameVerdicts.get(origin) === false) frameVerdicts.delete(origin);
      }, RETRY_FAILED_MS) as unknown as { unref?: () => void };
      timer.unref?.();
    }
  });
  return verdict;
}

function renderFrame(box: HTMLElement, url: string): void {
  const frame = h("iframe", "framed-frame");
  frame.src = url;
  frame.title = url;
  frame.referrerPolicy = "no-referrer";
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads");
  box.replaceChildren(frame);
}

function renderCard(box: HTMLElement, url: string): void {
  const card = h("div", "framed-card");
  const msg = h("p", "framed-card-msg", st.webOnlyTab);
  const a = h("a", "framed-card-btn", st.webOpenTab);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  card.append(msg, a);
  box.replaceChildren(card);
}

export function framedPage(url: string): HTMLElement {
  const box = h("div", "framed-page");
  if (isAppOrigin(url)) {
    renderCard(box, url);
    return box;
  }
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    renderCard(box, url);
    return box;
  }
  const known = frameVerdicts.get(origin);
  if (known === true) {
    renderFrame(box, url);
  } else if (known === false) {
    renderCard(box, url);
  } else {
    void frameable(url).then((ok) => {
      if (ok) renderFrame(box, url);
      else renderCard(box, url);
    });
  }
  return box;
}
