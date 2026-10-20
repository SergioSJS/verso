// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The Credits page of the settings: acknowledgements, the notices of the
// shipped game-system layouts, and the open-source libraries (src/credits.ts).

import { h } from "../../dom";
import { CREDITS, DEPENDENCIES, SYSTEMS } from "../../credits";
import { cs, isPt } from "./creditsStrings";
import type { ItemCtx, SettingItem } from "./types";

/** A link named for a screen reader. External addresses open in the system
 *  browser through the window's one link guard (main.ts). */
function link(href: string, name: string): HTMLAnchorElement {
  const a = h("a", "setting-link", cs.visit);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.title = href;
  a.setAttribute("aria-label", cs.openLink(name));
  return a;
}

export function creditsItems(ctx: ItemCtx): SettingItem[] {
  const out: SettingItem[] = [];
  const add = (group: string, title: string, desc: string, control: () => HTMLElement) =>
    out.push({ section: "credits", group, title, desc, node: () => ctx.item(title, desc, control()) });

  for (const c of CREDITS) {
    const desc = [isPt ? c.line.pt : c.line.en, c.licence ? cs.licence(c.licence) : ""].filter(Boolean).join(" ");
    add(cs.worksGroup, c.name, desc, () => {
      const box = h("div", "credit-box");
      if (c.quote) {
        const q = h("blockquote", "credit-quote", c.quote);
        q.lang = "pt-BR";
        box.append(q);
        if (!isPt && c.gloss) box.append(h("p", "credit-gloss", c.gloss));
      }
      box.append(link(c.link, c.name));
      return box;
    });
  }
  for (const s of SYSTEMS) {
    add(cs.systemsGroup, s.name, cs.licence(s.licence), () => {
      const box = h("div", "credit-box");
      for (const l of s.lines) box.append(h("blockquote", "credit-quote", l));
      // A licence that must accompany the content (the OGL, section 10).
      if (s.licenceText) {
        const d = h("details", "credit-licence");
        d.append(h("summary", "", s.licenceText.title));
        for (const para of s.licenceText.paragraphs) d.append(h("p", "credit-licence-text", para));
        box.append(d);
      }
      box.append(link(s.link, s.name));
      return box;
    });
  }
  for (const d of DEPENDENCIES) {
    add(cs.softwareGroup, d.name, `${d.version} · ${cs.licence(d.license)}`, () => link(d.link, d.name));
  }
  return out;
}
