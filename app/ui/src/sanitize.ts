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
  // Foreign content, by name as well as by namespace: a parser that put
  // them in HTML's (as a test's DOM can) still drops them whole.
  "svg", "math",
]);

/** On any element kept. */
const GLOBAL = new Set(["class", "id", "title", "lang", "dir", "style", "align", "data-target", "data-tag", "data-callout", "data-fold", "data-task-line", "data-oracle-line"]);
const OWN: Record<string, Set<string>> = {
  a: new Set(["href"]),
  iframe: new Set(["src", "width", "height", "style", "title", "allow", "allowfullscreen", "loading", "sandbox"]),
  img: new Set(["src", "alt", "width", "height", "data-src"]),
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
 *  wear the app's (`quick`, `menu`…) and lay itself over the window.
 *  `remote-image` is the held picture's link, a dashed box; kept so that
 *  what this module wrote cleans to itself. */
const CLASSES = new Set(["wikilink", "tag", "embed", "math", "math-display", "callout", "callout-title", "footnote-reference", "footnote-definition", "footnote-definition-label", "remote-image"]);
const LANGUAGE = /^language-[\w#+.-]+$/;

/** A note's ids, and the in-page links that point at them, live under
 *  this prefix. An element's id is also a name the page answers to: by
 *  `getElementById` — the window's own lists and dialogs, made at any
 *  time (`sync-state`, `mask-icons`…), would find the note's element
 *  first — and as a property of `window` — a note's `id="isTauri"`
 *  would answer the Tauri library's own question in a browser. Under
 *  the prefix no id of the window and no global name can be met. The
 *  same rewrite on both sides keeps footnotes and anchors working; one
 *  already under the prefix is kept, so cleaning twice changes nothing. */
const ID_PREFIX = "note-";
function noteId(id: string): string {
  return id.startsWith(ID_PREFIX) ? id : `${ID_PREFIX}${id}`;
}

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
  if (v.startsWith("#")) return image ? null : v.length > 1 ? `#${noteId(v.slice(1))}` : v;
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
 *  What a style fetches is a picture's address by the picture's rules:
 *  the web (while remote content is on) or a picture in data — never
 *  `javascript:`, a file, or this page's own origin (`url(/api/…)`).
 *  `image-set()` and `src()` name addresses without `url()`: they go. */
function tameStyle(style: CSSStyleDeclaration): void {
  const position = style.getPropertyValue("position").trim().toLowerCase();
  if (position !== "" && position !== "static" && position !== "relative" && position !== "sticky" && position !== "-webkit-sticky") style.removeProperty("position");
  for (const property of Array.from(style)) {
    const value = style.getPropertyValue(property);
    if (FETCHES_UNSEEN.test(value) || !urlsAllowed(value)) style.removeProperty(property);
  }
}
const FETCHES_UNSEEN = /(?:^|[^\w-])(?:-webkit-)?(?:image-set|src)\s*\(/i;
const URL_FN = /url\s*\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)\s"']*))\s*\)/gi;
/** Whether every `url()` of a style's value may load, as the CSSOM wrote
 *  it (escapes resolved, quotes its own). */
function urlsAllowed(value: string): boolean {
  const opened = (value.match(/url\s*\(/gi) ?? []).length;
  if (opened === 0) return true;
  const read = Array.from(value.matchAll(URL_FN));
  // A `url(` the pattern could not read is not trusted.
  if (read.length !== opened) return false;
  return read.every((m) => {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    return onTheWeb(raw) ? remote : /^data:image\//i.test(raw);
  });
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
/** Why a web address given as a picture is not shown (ADR 0086 item 1,
 *  decided 2026-10-14: only from the origins the person approved, as an
 *  embedded page is): its origin is not approved (`origin`), or remote
 *  content is off (`remote`); null when it may load. Not an `http(s)`
 *  address: `invalid`, nothing loads. */
export function pictureGate(url: string): { why: "origin" | "remote"; origin: string } | { why: "invalid" } | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return { why: "invalid" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { why: "invalid" };
  if (!approvedAll && !approved.has(u.origin)) return { why: "origin", origin: u.origin };
  if (!remote) return { why: "remote", origin: u.origin };
  return null;
}
/** Approve `origin` for good, as an embedded page's gate does: kept with
 *  the settings and handed to the host. False when nothing can keep it
 *  (no window hooks) or the host did not take it. */
export async function approveOrigin(origin: string): Promise<boolean> {
  if (!hooks) return false;
  const ok = await hooks.approve(origin);
  if (ok) approved.add(origin);
  return ok;
}

/** The warning to show before an origin is approved (ADR 0056.aviso,
 *  option B, decided 2026-10-21): the site forbids being framed, or did
 *  not answer the host's one `HEAD`. Null when there is nothing to say: the
 *  site may be framed, no check is wired, or remote content is off (ADR
 *  0050: the check is a request, so it waits for the same consent). The
 *  host's check is made here, on the person's click to approve, which is
 *  the "address a note wrote and the reader approved" of the ADR. */
export async function frameWarning(url: string, board = false): Promise<string | null> {
  const text = board ? hooks?.strings.unframedBoard : hooks?.strings.unframed;
  if (!hooks?.frameable || !text || !remote) return null;
  let ok = false;
  try {
    ok = await hooks.frameable(url);
  } catch {
    ok = false;
  }
  return ok ? null : text;
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
  /** The site forbids being framed (ADR 0056.aviso, decided 2026-10-21),
   *  said for what this platform will actually do with a note's embed. */
  unframed?: string;
  /** The same warning for a board's page card, which never uses the
   *  native view. */
  unframedBoard?: string;
  /** The button that approves after the warning. */
  approveAnyway?: string;
  /** The host did not take the approval: nothing was allowed. */
  approveFailed?: string;
};
type EmbedHooks = {
  strings: EmbedStrings;
  /** The origin approved for good: kept, and the whole list handed to the
   *  host. False when the host did not take it; the page is not loaded. */
  approve: (origin: string) => Promise<boolean>;
  /** Whether the site allows being framed (the host's check; false when it
   *  could not tell). Asked when the person clicks to approve, never before. */
  frameable?: (url: string) => Promise<boolean>;
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

/** The box a web page renders in, `div.embed-web`, sized and styled as
 *  `style` says — tamed, so the frame cannot lift itself out of the pane —
 *  and not loaded: `data-embed-web` is what loads it. */
function webHost(doc: Document, style: string): HTMLElement {
  // The page renders in a real frame in this box when its site allows
  // being framed, and otherwise in a child web view the window overlays on
  // it (leaves/web.ts; ADR 0056, revised 2026-10-15). The note's <iframe>
  // only donates its size.
  const host = doc.createElement("div");
  host.className = "embed-web";
  if (style) {
    host.style.cssText = style;
    tameStyle(host.style);
    if (host.style.length === 0) host.removeAttribute("style");
  }
  return host;
}

/** The iframe for web page `url`, loaded directly and sandboxed; or, when
 *  it may not load yet, a box that says why and asks. The box carries
 *  what its button needs — the address, and the frame's style with its
 *  size — as attributes: nothing is built, and nothing fetched, until a
 *  click (`onGate`), and the box means the same parsed again wherever a
 *  view puts its text. Built in `doc`, the inert document of a note or
 *  the page. */
function gated(doc: Document, frame: HTMLIFrameElement, url: string): HTMLElement {
  const host = webHost(doc, frame.getAttribute("style") ?? "");
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
  box.setAttribute("data-embed-style", host.style.cssText);
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
  box.append(where, text, actions);
  return box;
}

/** The web page embedded in Live Preview: its address, and what the
 *  note's `<iframe>` gave for size and style — the style tamed as the
 *  reading view's is, so the frame cannot lift itself out of the pane. */
export function webFrame(url: string, width: string, height: string, style: string): HTMLElement {
  // Only a page on the web: an approval of "everything" is still no
  // approval of `javascript:` or `file:` for the child view.
  if (!onTheWeb(url)) {
    const text = document.createElement("span");
    text.textContent = url;
    return text;
  }
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
  // The origin asked about is the address's own, never what else the box
  // says: a box is only read here, and what it claims is checked again.
  let origin = "";
  try {
    origin = onTheWeb(url) ? new URL(url).origin : "";
  } catch {
    /* not an address: nothing loads */
  }
  const load = () => {
    // A page on the web whose origin was approved, and nothing else,
    // whoever wrote the box.
    if (!origin || (!approvedAll && !approved.has(origin))) return;
    // The frame built from the box's own attributes, its style tamed again.
    const host = webHost(document, box.getAttribute("data-embed-style") ?? "");
    host.setAttribute("data-embed-web", embedTarget(url));
    box.replaceWith(host);
  };
  switch (button.getAttribute("data-embed-action")) {
    case "load":
      clicked.add(url);
      load();
      break;
    case "approve":
    case "approve-anyway": {
      if (!origin) break;
      const finish = (): void => {
        void hooks?.approve(origin).then((ok) => {
          if (!ok) return refused(box);
          approved.add(origin);
          load();
        });
      };
      if (button.getAttribute("data-embed-action") === "approve-anyway") {
        finish();
        break;
      }
      // The warning comes before the confirmation: the host looks at the
      // site's headers first, and a site that forbids framing is said so.
      const here = button as HTMLButtonElement;
      here.disabled = true;
      box.setAttribute("aria-busy", "true");
      void frameWarning(url).then((warn) => {
        box.removeAttribute("aria-busy");
        if (!warn) return finish();
        warnInGate(box, warn);
      });
      break;
    }
    case "cancel": {
      const link = document.createElement("a");
      link.className = "remote-image";
      if (origin) link.href = url;
      link.textContent = url;
      box.replaceWith(link);
      break;
    }
  }
}

/** The host did not take the approval: say so where the reader is looking, and give the buttons back. */
function refused(box: HTMLElement): void {
  const doc = box.ownerDocument;
  box.removeAttribute("aria-busy");
  for (const b of box.querySelectorAll<HTMLButtonElement>("button")) b.disabled = false;
  const text = hooks?.strings.approveFailed ?? "";
  if (text === "") return;
  let p = box.querySelector(".embed-gate-warn");
  if (!p) {
    p = doc.createElement("p");
    p.className = "embed-gate-warn";
    p.setAttribute("role", "alert");
    box.insertBefore(p, box.querySelector(".embed-gate-actions"));
  }
  p.textContent = text;
}

/** The gate with its warning: the words, an alert, and a second step. */
function warnInGate(box: HTMLElement, warn: string): void {
  const doc = box.ownerDocument;
  const p = doc.createElement("p");
  p.className = "embed-gate-warn";
  p.setAttribute("role", "alert");
  p.textContent = warn;
  const actions = box.querySelector(".embed-gate-actions");
  const cancel = box.querySelector('[data-embed-action="cancel"]');
  const go = doc.createElement("button");
  go.type = "button";
  go.className = "save";
  go.setAttribute("data-embed-action", "approve-anyway");
  go.textContent = hooks?.strings.approveAnyway ?? hooks?.strings.approve ?? "";
  actions?.replaceChildren(...(cancel ? [cancel] : []), go);
  box.insertBefore(p, actions ?? null);
  (cancel as HTMLElement | null)?.focus?.();
}

/** The policy, as the hostile-HTML suite prints and checks it
 *  (test/sanitize.test.mjs): what is kept, what goes with all it holds. */
export const POLICY = {
  elements: [...ELEMENTS].sort(),
  dropped: [...DROPPED].sort(),
  global: [...GLOBAL].sort(),
  own: Object.fromEntries(Object.entries(OWN).map(([tag, names]) => [tag, [...names].sort()])),
  classes: [...CLASSES].sort(),
  idPrefix: ID_PREFIX,
} as const;

function keepAttributes(el: Element, tag: string): void {
  const own = OWN[tag];
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name;
    if (!GLOBAL.has(name) && !own?.has(name)) {
      el.removeAttribute(name);
      continue;
    }
    if (name === "data-src") {
      // A file beside the note, as a relative `src` becomes below.
      if (!relativeImage(attr.value)) el.removeAttribute(name);
    } else if (name === "href" || name === "src") {
      const v = address(attr.value, name === "src");
      if (v === null) el.removeAttribute(name);
      else if (v !== attr.value) el.setAttribute(name, v);
    } else if (name === "class") {
      const kept = attr.value.split(/\s+/).filter((c) => CLASSES.has(c) || (tag === "code" && LANGUAGE.test(c)));
      if (kept.length === 0) el.removeAttribute(name);
      else el.setAttribute(name, kept.join(" "));
    } else if (name === "id") {
      const id = attr.value.trim();
      if (id === "") el.removeAttribute(name);
      else el.setAttribute(name, noteId(id));
    }
  }
  const style = (el as HTMLElement).style as CSSStyleDeclaration | undefined;
  if (style && el.hasAttribute("style")) {
    tameStyle(style);
    // Written back as the CSSOM read it: what it could not read was not
    // checked, and goes.
    if (style.length === 0) el.removeAttribute("style");
    else el.setAttribute("style", style.cssText);
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
    else if (relativeImage(src)) {
      // `![](assets/x.png)` names a file beside the note: as a `src`, the
      // page would ask its own origin for it before the window asks the
      // core where it is. It waits here (main.ts, noteImages).
      el.setAttribute("data-src", src);
      el.removeAttribute("src");
    }
  }
}

/** Whether image `src`, as `address` kept it, names a file relative to
 *  the note rather than an address. */
function relativeImage(src: string): boolean {
  return src.trim() !== "" && !src.includes(":") && !src.startsWith("//");
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
