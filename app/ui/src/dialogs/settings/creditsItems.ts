// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The Credits page of the settings: acknowledgements, the notices of the
// shipped game-system layouts, and the open-source libraries (src/credits.ts).

import { h } from "../../dom";
import { CREDITS, DEPENDENCIES, SYSTEMS } from "../../credits";
import { cs, isPt } from "./creditsStrings";
import { loadCatalogue } from "../../theme/catalogue";
import { creditLine } from "../../theme/creditLine";
import { V2 } from "../../theme/moreStrings";
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
      // The Dark Pack asks for its logo with the notice: Paradox's own file,
      // unaltered (docs/reference/statblock-sources.md, "The Dark Pack logo").
      if (s.licence === "Paradox Dark Pack") {
        const img = h("img", "credit-logo");
        img.src = "darkpack-logo.png";
        img.alt = cs.darkPackLogo;
        img.width = 96;
        img.height = 96;
        img.loading = "lazy";
        box.append(img);
      }
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
  // The catalogue's themes (ADR 0109 item 8), listed from each file's own
  // `inspiredBy`: a theme added to themes/catalogue/ is credited here with
  // no line written. The list is read from the build when the page is drawn.
  out.push({
    section: "credits",
    group: V2.credits.heading,
    title: V2.credits.heading,
    desc: V2.credits.lead,
    node: () => {
      const list = h("ul", "credit-themes");
      list.setAttribute("aria-label", V2.credits.heading);
      void loadCatalogue().then((entries) => {
        if (entries.length === 0) return void list.replaceChildren(h("li", "", V2.credits.failed));
        list.replaceChildren(
          ...entries.map((e) => {
            const li = h("li", "credit-theme");
            li.dataset["catalogueTheme"] = e.theme.name;
            const name = h("strong", "", e.theme.name);
            li.append(name);
            if (e.theme.inspiredBy) li.append(creditLine(e.theme.inspiredBy, "theme-credit"));
            return li;
          }),
        );
      });
      return ctx.item(V2.credits.heading, V2.credits.lead, list);
    },
  });
  for (const d of DEPENDENCIES) {
    add(cs.softwareGroup, d.name, `${d.version} · ${cs.licence(d.license)}`, () => link(d.link, d.name));
  }
  return out;
}
