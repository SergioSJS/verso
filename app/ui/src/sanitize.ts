// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The core's HTML reaches the page only through here. The renderer lets a
// note's raw HTML through, as the base parser does, and this page holds
// the bridge to the core: a note from a shared folder must not run a
// script, restyle or probe the app, send a form or take the window
// elsewhere. So an allowlist — the elements and attributes the renderer
// emits (crates/verso-dialect/src/render.rs), plain formatting, links to
// the web, to mail and within the page — and everything else goes. The
// window's CSP is the second line, not the first.

const XHTML = "http://www.w3.org/1999/xhtml";

/** Kept, with the attributes below. */
const ELEMENTS = new Set([
  "a", "abbr", "b", "bdi", "bdo", "blockquote", "br", "caption", "cite", "code", "col", "colgroup",
  "dd", "del", "details", "dfn", "div", "dl", "dt", "em", "figcaption", "figure", "h1", "h2", "h3",
  "h4", "h5", "h6", "hr", "i", "img", "input", "ins", "kbd", "li", "mark", "ol", "p", "pre", "q",
  "rp", "rt", "ruby", "s", "samp", "small", "span", "strong", "sub", "summary", "sup", "table",
  "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u", "ul", "var", "wbr",
]);

/** Gone with all they hold: what runs, loads, styles the page, embeds
 *  another page, takes input, or is parsed as raw text (a raw-text
 *  element could turn text back into markup when the result is parsed
 *  again). Any other element not kept is unwrapped: its text stays. */
const DROPPED = new Set([
  "script", "style", "link", "meta", "base", "iframe", "frame", "frameset", "object", "embed",
  "applet", "param", "template", "noscript", "noembed", "noframes", "title", "textarea", "select",
  "option", "optgroup", "datalist", "output", "progress", "meter", "canvas", "audio", "video",
  "source", "track", "map", "area", "portal", "xmp", "plaintext", "listing", "slot", "head",
]);

/** On any element kept. */
const GLOBAL = new Set(["class", "id", "title", "lang", "dir", "style", "align", "data-target", "data-tag", "data-callout", "data-fold", "data-task-line"]);
const OWN: Record<string, Set<string>> = {
  a: new Set(["href"]),
  img: new Set(["src", "alt", "width", "height"]),
  ol: new Set(["start", "reversed", "type"]),
  li: new Set(["value"]),
  input: new Set(["type", "checked", "disabled"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
  details: new Set(["open"]),
  time: new Set(["datetime"]),
};

/** The renderer's classes, the only ones kept: a note's own class could
 *  wear the app's (`quick`, `menu`…) and lay itself over the window. */
const CLASSES = new Set(["wikilink", "tag", "embed", "math", "math-display", "callout", "callout-title", "footnote-reference", "footnote-definition", "footnote-definition-label"]);
const LANGUAGE = /^language-[\w#+.-]+$/;

/** Ids the app answers to — the page's own, and any it makes later under
 *  `verso-` — which a note may not take (a drop over a note that claimed
 *  `tree-root` would land in the tree). A note's other ids stay: its
 *  footnotes and anchors point at them. */
const RESERVED = new Set(Array.from(document.querySelectorAll("[id]"), (e) => e.id));
/** Ids the window makes later, for its lists and dialogs (their
 *  `aria-*` point at them): a note's element with one would come first in
 *  the document and take the reference. */
const LATER = /^(verso-|quick-|palette-|plan-|setting-|slash-|folders-)/;
const reserved = (id: string): boolean => RESERVED.has(id) || LATER.test(id);

/** Whether a note may ask the web for an image: the "load remote
 *  content" setting (ADR 0050). Off, a remote image becomes a link to
 *  itself, and an inline style loses what it would fetch; nothing reaches
 *  the network until a click. */
let remote = true;
export function allowRemoteContent(on: boolean): void {
  remote = on;
}

/** A link's or an image's address, if it may stay: the web, mail (links),
 *  a place in the same page (links), an image in data (images). A
 *  relative address names nothing here (the UI resolves embeds itself).
 *  A web or mail address comes back as the URL parser writes it: the
 *  parser drops tabs, newlines and leading control characters, so the raw
 *  text (`h&#9;ttps://…`) could differ from what the page would fetch and
 *  slip past a check made on it. */
function address(value: string, image: boolean): string | null {
  const v = value.trim();
  if (v.startsWith("#")) return image ? null : v;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  if (!image && url.protocol === "mailto:") return url.href;
  if (image && url.protocol === "data:" && /^data:image\//i.test(v)) return v;
  return null;
}

/** Whether `src` is an address on the web, as the page would read it. */
function onTheWeb(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function keepAttributes(el: Element, tag: string): void {
  const own = OWN[tag];
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name;
    if (!GLOBAL.has(name) && !own?.has(name)) {
      el.removeAttribute(name);
      continue;
    }
    if (name === "href" || name === "src") {
      const v = address(attr.value, name === "src");
      if (v === null) el.removeAttribute(name);
      else if (v !== attr.value) el.setAttribute(name, v);
    } else if (name === "class") {
      const kept = attr.value.split(/\s+/).filter((c) => CLASSES.has(c) || (tag === "code" && LANGUAGE.test(c)));
      if (kept.length === 0) el.removeAttribute(name);
      else el.setAttribute(name, kept.join(" "));
    } else if (name === "id" && reserved(attr.value)) {
      el.removeAttribute(name);
    }
  }
  // An inline style stays, but not one that lifts the element out of the
  // note (fixed or absolute): anything else is clipped by its scroller.
  const style = (el as HTMLElement).style as CSSStyleDeclaration | undefined;
  if (style && el.hasAttribute("style")) {
    const position = style.getPropertyValue("position").trim().toLowerCase();
    if (position !== "" && position !== "static" && position !== "relative" && position !== "sticky" && position !== "-webkit-sticky") style.removeProperty("position");
    if (!remote) for (const property of Array.from(style)) if (/url\s*\(/i.test(style.getPropertyValue(property))) style.removeProperty(property);
    if (style.length === 0) el.removeAttribute("style");
  }
}

/** Clean `body` in place: document order, no recursion (a note can nest
 *  deeper than a stack). */
function clean(body: HTMLElement): void {
  const doc = body.ownerDocument;
  const comments = doc.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
  const drop: Node[] = [];
  while (comments.nextNode()) drop.push(comments.currentNode);
  for (const c of drop) c.parentNode?.removeChild(c);
  for (const el of Array.from(body.querySelectorAll("*"))) {
    if (!el.isConnected) continue; // inside something already dropped
    const tag = el.localName;
    if (el.namespaceURI !== XHTML || DROPPED.has(tag)) {
      el.remove();
      continue;
    }
    if (tag === "input") {
      // The task checkbox and nothing else; the window decides which to enable.
      if ((el.getAttribute("type") ?? "").trim().toLowerCase() !== "checkbox") {
        el.remove();
        continue;
      }
      el.setAttribute("disabled", "");
    }
    if (!ELEMENTS.has(tag)) {
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    keepAttributes(el, tag);
    const src = tag === "img" ? (el.getAttribute("src") ?? "") : "";
    if (!remote && onTheWeb(src)) {
      const link = doc.createElement("a");
      link.setAttribute("href", src);
      link.className = "remote-image";
      link.textContent = el.getAttribute("alt") || src;
      el.replaceWith(link);
    }
  }
}

function cleaned(html: string): HTMLElement {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  clean(body);
  return body;
}

/** The core's HTML as nodes of this page, cleaned. Parsed in an inert
 *  document: nothing in it loads or runs before it is clean. */
export function cleanHtml(html: string): DocumentFragment {
  const body = cleaned(html);
  const out = document.createDocumentFragment();
  for (const node of Array.from(body.childNodes)) out.append(document.adoptNode(node));
  return out;
}

/** The same, as text, for a view that takes a string (Live Preview's
 *  embeds). What is left parses back to itself: no raw-text element and
 *  no foreign content survive to change meaning on the way. */
export function cleanHtmlText(html: string): string {
  return cleaned(html).innerHTML;
}

/** `el`'s content becomes the core's HTML, cleaned. */
export function setHtml(el: Element, html: string): void {
  el.replaceChildren(cleanHtml(html));
}
