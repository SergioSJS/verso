// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The values of a typed note's `link` and `image` properties (ADR 0086
// item 1), as the properties panel and the infobox draw them. A link is a
// quoted wikilink — the typed relation of spec Q10 — followed with a
// click; a picture is a wikilink to a picture of the folder, a path of the
// folder, or a web address shown only from an origin the person approved
// (decided 2026-10-14). Nothing here writes: the panel's rows do, through
// its one edit of a key's lines.

import { approveOrigin, pictureGate } from "./sanitize";

export type PictureStrings = {
  /** A web picture whose origin is not approved: not fetched. */
  pictureOrigin: (origin: string) => string;
  /** Remote content is off: not fetched. */
  pictureRemote: string;
  approve: (origin: string) => string;
  approveFailed: string;
  load: string;
  /** A picture of the folder that names no file. */
  pictureMissing: (target: string) => string;
};

/** One wikilink and nothing else, as the core's `is_one_link` reads it. */
export function oneLink(v: string): boolean {
  const t = v.trim();
  const inner = t.slice(2, -2);
  return t.length > 4 && t.startsWith("[[") && t.endsWith("]]") && !inner.includes("[[") && !inner.includes("]]");
}

/** A wikilink's parts: what it names (with its `#heading` or `#^id`, as
 *  following it needs) and its alias. Null for anything else. */
export function linkParts(v: string): { target: string; alias: string | null } | null {
  if (!oneLink(v)) return null;
  const inner = v.trim().slice(2, -2);
  const bar = inner.indexOf("|");
  return bar < 0 ? { target: inner, alias: null } : { target: inner.slice(0, bar), alias: inner.slice(bar + 1) };
}

/** What a person typed into a link's field, as a link: kept when it is
 *  one, wrapped in `[[ ]]` otherwise (a stray bracket dropped). */
export function asLink(typed: string): string {
  const t = typed.trim();
  if (oneLink(t)) return t;
  const bare = t.replace(/^\[+/, "").replace(/\]+$/, "").trim();
  return bare === "" ? "" : `[[${bare}]]`;
}

export type PictureSource =
  | { kind: "folder"; target: string; alt: string | null }
  | { kind: "web"; url: string };

/** Where an `image` value's picture is: a wikilink's target (its alias
 *  the alternative text, ADR 0086 item 6), a path of the folder, or a web
 *  address. Null for an empty value. */
export function pictureSource(value: string): PictureSource | null {
  const v = value.trim();
  if (v === "") return null;
  const link = linkParts(v);
  if (link) return { kind: "folder", target: link.target.split("#")[0] ?? link.target, alt: link.alias };
  if (/^https?:\/\//i.test(v)) return { kind: "web", url: v };
  return { kind: "folder", target: v, alt: null };
}

export type PictureHost = {
  strings: PictureStrings;
  /** A picture of the folder, asked of the core: its address to show, or
   *  null when the target names no file. */
  resolve: (target: string) => Promise<string | null>;
  /** The note's title: the alternative text when the link gives none. */
  title: string;
  /** Something to say on the status line (a failure). */
  status: (message: string) => void;
};

/** The picture of `value`, or a box that says why it is not shown. */
export function pictureNode(value: string, host: PictureHost, cls = "prop-picture"): HTMLElement | null {
  const src = pictureSource(value);
  if (!src) return null;
  const alt = (src.kind === "folder" ? src.alt : null) ?? host.title;
  const img = document.createElement("img");
  img.className = cls;
  img.alt = alt;
  img.decoding = "async";
  if (src.kind === "folder") {
    const box = document.createElement("span");
    box.className = `${cls}-box`;
    box.append(img);
    void host.resolve(src.target).then((url) => {
      if (url) img.src = url;
      else {
        const missing = document.createElement("span");
        missing.className = "prop-picture-missing";
        missing.textContent = host.strings.pictureMissing(src.target);
        box.replaceChildren(missing);
      }
    });
    return box;
  }
  img.referrerPolicy = "no-referrer";
  const gate = pictureGate(src.url);
  if (gate === null) {
    img.src = src.url;
    return img;
  }
  // Not fetched: the address as text, why, and the way to let it load —
  // the same approval an embedded page asks for (ADR 0050, 0056).
  const held = document.createElement("span");
  held.className = "prop-picture-held";
  const address = document.createElement("span");
  address.className = "prop-picture-address";
  address.textContent = src.url;
  const why = document.createElement("span");
  why.className = "prop-picture-why";
  held.append(address, why);
  if (gate.why === "invalid") return held;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "prop-picture-allow";
  // The press keeps the focus where it is (a field of the panel losing it
  // would redraw the panel under the pointer).
  button.addEventListener("mousedown", (e) => e.preventDefault());
  if (gate.why === "origin") {
    why.textContent = host.strings.pictureOrigin(gate.origin);
    button.textContent = host.strings.approve(gate.origin);
    button.addEventListener("click", () => {
      button.disabled = true;
      void approveOrigin(gate.origin).then(
        (ok) => {
          if (!ok) {
            button.disabled = false;
            host.status(host.strings.approveFailed);
            return;
          }
          img.src = src.url;
          held.replaceWith(img);
        },
        () => {
          button.disabled = false;
          host.status(host.strings.approveFailed);
        },
      );
    });
  } else {
    why.textContent = host.strings.pictureRemote;
    button.textContent = host.strings.load;
    button.addEventListener("click", () => {
      img.src = src.url;
      held.replaceWith(img);
    });
  }
  held.append(button);
  return held;
}

let lists = 0;
/** A `<datalist>` for `input`, filled on first focus with what `options`
 *  gives — the folder's notes or pictures, as `[[` offers them. */
export function suggestions(input: HTMLInputElement, options: () => { value: string; label: string }[]): HTMLDataListElement {
  const list = document.createElement("datalist");
  list.id = `prop-suggest-${++lists}`;
  input.setAttribute("list", list.id);
  input.autocomplete = "off";
  const fill = () => {
    if (list.childElementCount > 0) return;
    for (const o of options().slice(0, 500)) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.label = o.label;
      list.append(opt);
    }
  };
  input.addEventListener("focus", fill, { once: true });
  return list;
}
