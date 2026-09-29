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
  "h4", "h5", "h6", "hr", "i", "iframe", "img", "input", "ins", "kbd", "li", "mark", "ol", "p", "pre", "q",
  "rp", "rt", "ruby", "s", "samp", "small", "span", "strong", "sub", "summary", "sup", "table",
  "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u", "ul", "var", "wbr",
]);

/** Gone with all they hold: what runs, loads, styles the page, embeds
 *  another page, takes input, or is parsed as raw text (a raw-text
 *  element could turn text back into markup when the result is parsed
 *  again). Any other element not kept is unwrapped: its text stays. */
const DROPPED = new Set([
  "script", "style", "link", "meta", "base", "frame", "frameset", "object", "embed",
  "applet", "param", "template", "noscript", "noembed", "noframes", "title", "textarea", "select",
  "option", "optgroup", "datalist", "output", "progress", "meter", "canvas", "audio", "video",
  "source", "track", "map", "area", "portal", "xmp", "plaintext", "listing", "slot", "head",
]);

/** On any element kept. */
const GLOBAL = new Set(["class", "id", "title", "lang", "dir", "style", "align", "data-target", "data-tag", "data-callout", "data-fold", "data-task-line"]);
const OWN: Record<string, Set<string>> = {
  a: new Set(["href"]),
  iframe: new Set(["src", "width", "height", "style", "title", "allow", "allowfullscreen", "loading", "sandbox"]),
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
  if (image && !v.includes(":") && !v.startsWith("//")) return v;
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

/** Whether image `src` is held back: on the web, with remote content
 *  off. The reading view and Live Preview both ask here. */
export function heldImage(src: string): boolean {
  return !remote && onTheWeb(src);
}
/** What a held image becomes: a link to it, named by its alt text or its
 *  address; a click opens it in the browser, nothing is fetched here. */
export function imageLink(doc: Document, src: string, alt: string): HTMLAnchorElement {
  const link = doc.createElement("a");
  link.setAttribute("href", src);
  link.className = "remote-image";
  link.textContent = alt || src;
  return link;
}

/** An inline style kept, but not one that lifts the element out of the
 *  note (fixed or absolute): anything else is clipped by its scroller.
 *  With remote content off, it loses whatever it would fetch. */
function tameStyle(style: CSSStyleDeclaration): void {
  const position = style.getPropertyValue("position").trim().toLowerCase();
  if (position !== "" && position !== "static" && position !== "relative" && position !== "sticky" && position !== "-webkit-sticky") style.removeProperty("position");
  if (!remote) for (const property of Array.from(style)) if (/url\s*\(/i.test(style.getPropertyValue(property))) style.removeProperty(property);
}

/* ---------- Embedded web pages ---------- */


/** What the child view actually navigates to. Almost always the URL as
 *  written; YouTube's `/embed/` player is the exception — it refuses any
 *  request without an HTTP Referer ("error 153"), which a top-level view
 *  never sends — so the watch page, whose player asks no such thing,
 *  stands in for it. The origin the gate asks about is unchanged. */
function embedTarget(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if ((host === "www.youtube.com" || host === "youtube.com" || host === "www.youtube-nocookie.com") && u.pathname.startsWith("/embed/")) {
      const id = u.pathname.slice("/embed/".length).split("/")[0] ?? "";
      if (id) {
        const watch = new URL("https://www.youtube.com/watch");
        watch.searchParams.set("v", id);
        const start = u.searchParams.get("start") ?? u.searchParams.get("t");
        if (start) watch.searchParams.set("t", start);
        return watch.toString();
      }
    }
  } catch {
    /* the URL as written */
  }
  return url;
}

/** Whether a host name is this machine or the local network: loopback,
 *  the private ranges, link-local, carrier-grade NAT, `localhost` and
 *  mDNS `.local` names. Judged by the name as written: a public name that
 *  resolves to a private address is caught by the host, which refuses it. */
export function localHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (!h.includes(":")) return false;
  if (h === "::" || h === "::1") return true;
  // An IPv4 address mapped into IPv6, as the URL parser writes it (hex).
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (mapped) {
    const hi = parseInt(mapped[1] ?? "0", 16);
    const lo = parseInt(mapped[2] ?? "0", 16);
    return localHost(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(h.split(":")[0] || "0", 16);
  // Unique local fc00::/7, link-local fe80::/10.
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

/** The origins on the local network the user approved (kept with the
 *  settings; the host holds its own copy and is the one that enforces). */
let approved = new Set<string>();
/** `*` in the list is the person's own "everything": every site loads
 *  without asking. Their choice, made where the risk is spelled out. */
let approvedAll = false;
export function allowEmbedOrigins(origins: string[]): void {
  approved = new Set(origins);
  approvedAll = origins.includes("*");
}
/** Pages loaded by a click while remote content is off, this session:
 *  drawn again, they stay loaded. */
const clicked = new Set<string>();

export type EmbedStrings = {
  /** Remote content is off: the page was not loaded. */
  remoteOff: string;
  load: string;
  /** The page is on the local network. */
  local: string;
  /** The page is on the public web, and not approved yet. */
  publicSite: string;
  approve: string;
  cancel: string;
};
type EmbedHooks = {
  strings: EmbedStrings;
  /** The origin approved for good: kept, and the whole list handed to the
   *  host. False when the host did not take it; the page is not loaded. */
  approve: (origin: string) => Promise<boolean>;
};
let hooks: EmbedHooks | null = null;
/** The window's words and its way of keeping an approval. Once per
 *  window, before any note is drawn. */
export function configureEmbeds(h: EmbedHooks): void {
  if (!hooks) document.addEventListener("click", onGate, true);
  hooks = h;
}

/** Why a page is not loaded yet: on the local network and not approved,
 *  or remote content is off; null when it may load. */
function gateOf(url: string): { kind: "local" | "public" | "remote"; origin: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  // Every origin needs the user's one-time approval before an app view
  // may navigate a frame to it — the host's guard enforces the same
  // list (the maintainer's decision of 2026-09-29; ADR 0056 revised).
  if (!approvedAll && !approved.has(u.origin)) {
    return { kind: localHost(u.hostname) ? "local" : "public", origin: u.origin };
  }
  if (!remote && !clicked.has(url)) return { kind: "remote", origin: u.origin };
  return null;
}

/** The iframe for web page `url`, loaded directly and sandboxed; or, when
 *  it may not load yet, a box that says why and asks. The iframe waits
 *  inside the box in a `template`: inert, nothing is fetched until a
 *  click. Built in `doc`, the inert document of a note or the page. */
function gated(doc: Document, frame: HTMLIFrameElement, url: string): HTMLElement {
  // The page renders in a child web view the window overlays on this
  // box — a top-level view, which X-Frame-Options does not bind, unlike
  // an iframe (ADR 0056). The note's <iframe> only donates its size.
  const host = doc.createElement("div");
  host.className = "embed-web";
  const style = frame.getAttribute("style") ?? "";
  if (style) {
    host.style.cssText = style;
    tameStyle(host.style);
  }
  const width = frame.getAttribute("width");
  const height = frame.getAttribute("height");
  if (width) host.style.width = /^\d+$/.test(width) ? `${width}px` : width;
  if (height) host.style.height = /^\d+$/.test(height) ? `${height}px` : height;
  if (!host.style.height) host.style.height = "800px";
  if (!host.style.width) host.style.width = "100%";
  const gate = gateOf(url);
  if (!gate) {
    host.setAttribute("data-embed-web", embedTarget(url));
    return host;
  }
  if (!hooks) {
    // No window to ask (not configured): a link, never the page.
    const link = doc.createElement("a");
    link.className = "remote-image";
    link.setAttribute("href", url);
    link.textContent = url;
    return link;
  }
  const s = hooks.strings;
  const box = doc.createElement("div");
  box.className = "embed-gate";
  box.setAttribute("data-embed-kind", gate.kind);
  box.setAttribute("data-embed-url", url);
  box.setAttribute("data-embed-origin", gate.origin);
  const where = doc.createElement("code");
  where.className = "embed-gate-origin";
  where.textContent = gate.kind === "remote" ? url : gate.origin;
  const text = doc.createElement("p");
  text.className = "embed-gate-text";
  text.textContent = gate.kind === "local" ? s.local : gate.kind === "public" ? s.publicSite : s.remoteOff;
  const actions = doc.createElement("div");
  actions.className = "embed-gate-actions";
  const button = (action: string, label: string, cls: string) => {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = cls;
    b.setAttribute("data-embed-action", action);
    b.textContent = label;
    return b;
  };
  if (gate.kind === "remote") actions.append(button("load", s.load, "save"));
  else actions.append(button("cancel", s.cancel, "ghost"), button("approve", s.approve, "save"));
  const held = doc.createElement("template");
  held.content.append(host);
  box.append(where, text, actions, held);
  return box;
}

/** The web page embedded in Live Preview: its address, and what the
 *  note's `<iframe>` gave for size and style — the style tamed as the
 *  reading view's is, so the frame cannot lift itself out of the pane. */
export function webFrame(url: string, width: string, height: string, style: string): HTMLElement {
  const frame = document.createElement("iframe");
  if (style) {
    frame.style.cssText = style;
    tameStyle(frame.style);
    if (frame.style.length === 0) frame.removeAttribute("style");
  }
  if (width) frame.width = width;
  if (height) frame.height = height;
  if (!style && !height) frame.style.height = "800px";
  if (!style && !width) frame.style.width = "100%";
  return gated(document, frame, url);
}

/** A click on a gate's button, wherever the gate was drawn (a reading
 *  view, an embedded note, Live Preview): one listener for the window. */
function onGate(e: MouseEvent): void {
  const button = (e.target as Element | null)?.closest?.("[data-embed-action]");
  const box = button?.closest(".embed-gate");
  if (!button || !(box instanceof HTMLElement)) return;
  e.preventDefault();
  e.stopPropagation();
  const url = box.getAttribute("data-embed-url") ?? "";
  const origin = box.getAttribute("data-embed-origin") ?? "";
  const load = () => {
    const held = box.querySelector("template")?.content.querySelector("div.embed-web");
    if (!held) return;
    // Only a box this module made carries the address it asked about.
    held.setAttribute("data-embed-web", embedTarget(url));
    box.replaceWith(document.importNode(held, true));
  };
  switch (button.getAttribute("data-embed-action")) {
    case "load":
      clicked.add(url);
      load();
      break;
    case "approve":
      void hooks?.approve(origin).then((ok) => {
        if (!ok) return;
        approved.add(origin);
        load();
      });
      break;
    case "cancel": {
      const link = document.createElement("a");
      link.className = "remote-image";
      link.href = url;
      link.textContent = url;
      box.replaceWith(link);
      break;
    }
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
  const style = (el as HTMLElement).style as CSSStyleDeclaration | undefined;
  if (style && el.hasAttribute("style")) {
    tameStyle(style);
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
    if (tag === "iframe") {
      const src = el.getAttribute("src") ?? "";
      if (!onTheWeb(src)) {
        el.remove();
        continue;
      }
      const placed = doc.createElement("span");
      el.replaceWith(placed);
      placed.replaceWith(gated(doc, el as HTMLIFrameElement, src));
      continue;
    }
    const src = tag === "img" ? (el.getAttribute("src") ?? "") : "";
    if (heldImage(src)) el.replaceWith(imageLink(doc, src, el.getAttribute("alt") ?? ""));
  }
}

function cleaned(html: string): HTMLElement {
  const body = new DOMParser().parseFromString(html ?? "", "text/html").body;
  clean(body);
  return body;
}

/** The core's HTML as nodes of this page, cleaned. Parsed in an inert
 *  document: nothing in it loads or runs before it is clean. */
export function cleanHtml(html: string): DocumentFragment {
  if (!html) return document.createDocumentFragment();
  const body = cleaned(html);
  const out = document.createDocumentFragment();
  for (const node of Array.from(body.childNodes)) out.append(document.adoptNode(node));
  return out;
}

/** The same, as text, for a view that takes a string (Live Preview's
 *  embeds). What is left parses back to itself: no raw-text element and
 *  no foreign content survive to change meaning on the way. */
export function cleanHtmlText(html: string): string {
  if (!html) return "";
  return cleaned(html).innerHTML;
}

/** `el`'s content becomes the core's HTML, cleaned. */
export function setHtml(el: Element, html: string): void {
  el.replaceChildren(cleanHtml(html));
}
