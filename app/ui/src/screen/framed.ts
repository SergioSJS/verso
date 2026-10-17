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
const frameVerdicts = new Map<string, boolean | Promise<boolean>>();

export function frameable(url: string): Promise<boolean> {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return Promise.resolve(false);
  }
  const known = frameVerdicts.get(origin);
  if (typeof known === "boolean") return Promise.resolve(known);
  if (known) return known;
  const ask = commands.embedFrameable(url).then(
    (r) => r.status === "ok" && r.data,
    () => false,
  );
  frameVerdicts.set(origin, ask);
  void ask.then((v) => frameVerdicts.set(origin, v));
  return ask;
}

function renderFrame(box: HTMLElement, url: string): void {
  const frame = h("iframe", "framed-frame");
  frame.src = url;
  frame.title = url;
  frame.referrerPolicy = "no-referrer";
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
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
