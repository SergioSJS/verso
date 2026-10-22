// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The credit of a theme inspired by another (ADR 0109 item 5): one quiet
// line, "Inspirado em Minimal, de Steph Ango (MIT)", and the source's
// address as a link the person may follow. Nothing is fetched: the address
// is text until a click opens it in the system browser, through the
// window's one link guard (main.ts).

import { h } from "../dom";
import { V2 } from "./moreStrings";
import type { InspiredBy } from "./tokens";

/** The address as shown: no scheme, no trailing slash. */
export const shownUrl = (url: string): string => url.replace(/^https:\/\//, "").replace(/\/$/, "");

/** An address written in a name, as "stephango.com/flexoki": a host, perhaps a path. */
const WRITTEN_URL = /\b((?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|md|app|me|co|br|ca|uk|de|fr|xyz)\b(?:\/[^\s,;)]*)?)/i;

/** The credit's author text, an address written in it made a link (Flexoki
 *  asks for "a link to stephango.com/flexoki"). */
function linked(text: string): (string | HTMLElement)[] {
  const m = WRITTEN_URL.exec(text);
  if (!m || m.index === undefined) return [text];
  const a = h("a", "theme-credit-link", m[1]);
  a.href = `https://${m[1]}`;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return [text.slice(0, m.index), a, text.slice(m.index + m[1]!.length)];
}

export function creditLine(credit: InspiredBy, cls = "theme-credit"): HTMLElement {
  const p = h("p", cls);
  // The sentence with the author's place held, so the author can carry a link.
  const mark = "\u0001";
  const [before, after] = V2.credit({ ...credit, author: credit.author ? mark : undefined }).split(mark);
  if (credit.author && after !== undefined) p.append(before ?? "", ...linked(credit.author), after);
  else p.append(V2.credit(credit));
  p.dataset["credit"] = credit.theme;
  if (credit.repoUrl) {
    const a = h("a", "theme-credit-link", shownUrl(credit.repoUrl));
    a.href = credit.repoUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = V2.creditLink(credit.repoUrl);
    p.append(" · ", a);
  }
  return p;
}
