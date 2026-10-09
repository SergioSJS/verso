// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A web page where the side has no child web views — a browser served by
// the server (ADR 0076 item 11; capability `web_views`): the page in an
// iframe, and above it a link that opens it in a new tab, for the many
// sites that refuse to be shown inside another (`X-Frame-Options`), which
// the app's own web views are not bound by (ADR 0056).

import { h } from "../dom";
import { st } from "./strings";

export function framedPage(url: string): HTMLElement {
  const box = h("div", "framed-page");
  const line = h("p", "framed-line");
  const a = h("a", "framed-open", st.webOpenTab);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  line.append(a, h("span", "framed-why", ` — ${st.webFramed}`));
  const frame = h("iframe", "framed-frame");
  frame.src = url;
  frame.title = url;
  frame.referrerPolicy = "no-referrer";
  // Its own origin, its scripts, its forms; never this window's.
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
  box.append(line, frame);
  return box;
}
