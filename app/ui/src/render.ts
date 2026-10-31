// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { classHighlighter, highlightCode } from "@lezer/highlight";
import katex from "katex";
import { h } from "./dom";
import { icon } from "./icons";
import { markSecrets } from "./secret/blocks";
import { markOracles } from "./oracle/blocks";
import type { OracleHost } from "./oracle/host";
import { t } from "./strings";

/** What is told when a code block has been given its colours, which replaces
 *  the block's content some time after it was drawn: whatever was added to
 *  the block meanwhile (a colour swatch) is added again. */
export const highlightedHooks = new Set<(code: HTMLElement) => void>();

/** Code blocks colored by their language and math typeset, in rendered
 *  HTML: the parser marks them, the window finishes them. */
export function typeset(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>(".math")) {
    const tex = el.textContent ?? "";
    try {
      katex.render(tex, el, { displayMode: el.classList.contains("math-display"), throwOnError: false });
    } catch {
      el.textContent = tex;
    }
  }
  for (const code of root.querySelectorAll<HTMLElement>("pre > code")) {
    const lang = Array.from(code.classList).find((c) => c.startsWith("language-"))?.slice(9) ?? "";
    if (!lang) continue;
    const desc = LanguageDescription.matchLanguageName(languages, lang, true);
    if (!desc) continue;
    const source = code.textContent ?? "";
    void desc.load().then((support) => {
      if (code.textContent !== source) return;
      const tree = support.language.parser.parse(source);
      const frag = document.createDocumentFragment();
      highlightCode(
        source,
        tree,
        classHighlighter,
        (text: string, classes: string) => {
          if (classes) {
            const span = h("span", classes, text);
            frag.append(span);
          } else frag.append(text);
        },
        () => frag.append("\n"),
      );
      code.replaceChildren(frag);
      for (const f of highlightedHooks) f(code);
    });
  }
}
/** Obsidian's foldable callouts, in the reading view: the title of a
 *  `[!kind]+` or `[!kind]-` callout opens and closes it, by the pointer or
 *  the keyboard, and `-` starts it closed (spec Q5). A link in the title
 *  stays a link. */
export function wireCallouts(root: ParentNode, open: readonly boolean[] = [], oracleHost?: OracleHost | null): void {
  let at = 0;
  // A secret block says what it does (ADR 0087 item 5).
  markSecrets(root);
  // An oracle callout allows rolling answers directly (ADR 0102).
  markOracles(root, oracleHost);
  for (const box of root.querySelectorAll<HTMLElement>(".callout[data-fold]")) {
    const was = open[at++];
    const title = box.querySelector<HTMLElement>(":scope > .callout-title");
    if (!title) continue;
    // A title with a link in it cannot be the button too — a link inside a
    // button is not a link to a screen reader, and Enter would fold and
    // follow at once: it gets a fold button of its own before its text.
    const linked = title.querySelector("a") !== null;
    const control = linked ? h("button", "callout-fold") : title;
    if (control instanceof HTMLButtonElement) {
      control.type = "button";
      control.setAttribute("aria-label", t.foldCallout);
      control.append(icon("chevron"));
      title.classList.add("has-fold");
      title.append(control);
    } else {
      title.tabIndex = 0;
      title.setAttribute("role", "button");
      title.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        show(box.classList.contains("folded"));
      });
    }
    const show = (open: boolean) => {
      box.classList.toggle("folded", !open);
      control.setAttribute("aria-expanded", String(open));
    };
    show(was ?? box.dataset["fold"] !== "-");
    title.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a")) return;
      show(box.classList.contains("folded"));
    });
  }
}
/** The links the core writes without an address — `[[wikilinks]]` and
 *  `#tags` — as links for the keyboard and a screen reader too: in the
 *  Tab order, said as links; Enter clicks them (the reading view's
 *  keydown). Without an address a link is neither. */
export function keyLinks(root: ParentNode): void {
  for (const a of root.querySelectorAll<HTMLElement>("a.wikilink:not([href]), a.tag:not([href])")) {
    a.tabIndex = 0;
    a.setAttribute("role", "link");
  }
}
/** A list item's own words, without its nested lists'. */
export function ownText(li: HTMLElement): string {
  let s = "";
  for (const n of Array.from(li.childNodes)) if (!(n instanceof HTMLElement && /^(UL|OL)$/.test(n.tagName))) s += n.textContent ?? "";
  return s.replace(/\s+/g, " ").trim().slice(0, 160);
}
