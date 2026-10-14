// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The pieces the server's pages are made of: a page in place of the
// window, a labelled field, a form whose error is announced (ADR 0035).

import { w } from "./strings";

let ids = 0;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined) e.append(c);
  return e;
}

/** A page of the server in place of the window: the window's own markup
 *  stays in the document, hidden. */
export function page(title: string, ...children: Node[]): HTMLElement {
  document.body.classList.add("web-mode");
  document.querySelector(".web-page")?.remove();
  document.title = `${title} — Verso`;
  const main = el("main", { class: "web-page web-auth" }, el("div", { class: "web-card" }, brand(32), el("h1", { class: "web-title" }, title), ...children));
  document.body.append(main);
  return main;
}

/** The server's mark: Verso's icon, UniVerso's name, and what it is
 *  (ADR 0078 item 5). */
export function brand(size: number): HTMLElement {
  const s = w();
  return el(
    "div",
    { class: "web-brand" },
    el("img", { src: "/icon-192.png", alt: "", width: String(size), height: String(size) }),
    el("span", { class: "web-brand-text" }, el("span", { class: "web-brand-name" }, s.serverName), el("span", { class: "web-brand-of" }, s.serverOf)),
  );
}

/** A lead line under a page's title. */
export function lead(text: string): HTMLElement {
  return el("p", { class: "web-lead" }, text);
}

/** "or", between the form and the other ways in. */
export function divider(word: string): HTMLElement {
  return el("div", { class: "web-or", role: "separator" }, el("span", {}, word));
}

export type Field = { row: HTMLElement; input: HTMLInputElement | HTMLSelectElement };

export function field(label: string, type: string, attrs: Record<string, string> = {}, hint?: string): Field {
  const id = `f${++ids}`;
  const input = el("input", { id, type, ...attrs });
  const hintId = hint ? `${id}-hint` : "";
  if (hint) input.setAttribute("aria-describedby", hintId);
  const row = el(
    "div",
    { class: "web-field" },
    el("label", { for: id }, label),
    input,
    hint ? el("small", { id: hintId }, hint) : null,
  );
  return { row, input };
}

export function select(label: string, options: [string, string][], value?: string): Field {
  const id = `f${++ids}`;
  const input = el("select", { id });
  for (const [v, text] of options) {
    const o = el("option", { value: v }, text);
    if (v === value) o.selected = true;
    input.append(o);
  }
  return { row: el("div", { class: "web-field" }, el("label", { for: id }, label), input), input };
}

/** A form that runs `submit`, its button busy meanwhile, and announces
 *  what went wrong. The button's words may hold a node (a name in a
 *  `<bdi>`). */
export function form(
  fields: Field[],
  button: string | (string | Node)[],
  submit: () => Promise<void>,
  explain: (e: unknown) => string,
): { form: HTMLFormElement; error: HTMLElement } {
  const error = el("p", { class: "web-error", role: "alert" });
  const go = el("button", { type: "submit", class: "web-primary" }, ...(typeof button === "string" ? [button] : button));
  const f = el("form", { class: "web-form", novalidate: "" }, ...fields.map((x) => x.row), error, go);
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    error.textContent = "";
    go.disabled = true;
    submit()
      .catch((err: unknown) => {
        error.textContent = explain(err);
      })
      .finally(() => {
        go.disabled = false;
      });
  });
  return { form: f, error };
}

/* ---------- The settings' rows (account and administration) ----------
   The account and the administration are sections of the window's
   settings (ADR 0074 items 7 and 9): the same rows — a title, a line
   under it, the control at the right — the same switches and buttons. */

/** A row of the settings: `SettingsDialog.item`, handed over. */
export type Item = (title: string, desc: string, control: HTMLElement | null) => HTMLElement;
/** What a section lists: searchable by its words, drawn when shown. */
export type Entry = { group: string; title: string; desc: string; node: () => HTMLElement };

export function input(type: string, attrs: Record<string, string> = {}): HTMLInputElement {
  const i = el("input", { type, ...attrs });
  // The window's keys stay out of a field being typed in.
  i.addEventListener("keydown", (e) => e.stopPropagation());
  return i;
}

export function choice(options: [string, string][], value: string): HTMLSelectElement {
  const sel = el("select");
  for (const [v, text] of options) {
    const o = el("option", { value: v }, text);
    o.selected = v === value;
    sel.append(o);
  }
  return sel;
}

/** The settings' switch; `label` names it when the row holds more than one. */
export function toggle(checked: boolean, label?: string): { el: HTMLElement; input: HTMLInputElement } {
  const box = el("input", { type: "checkbox" });
  box.checked = checked;
  if (label) box.setAttribute("aria-label", label);
  const sw = el("label", { class: "switch" }, box, el("span", { class: "switch-track" }));
  return { el: label ? el("span", { class: "web-switch" }, el("span", { "aria-hidden": "true" }, label), sw) : sw, input: box };
}

export function button(label: string, kind: "ghost" | "save" | "danger" = "ghost"): HTMLButtonElement {
  return el("button", { type: "button", class: kind === "save" ? "save" : kind === "danger" ? "ghost danger web-danger" : "ghost web-ghost" }, label);
}

export function controls(...nodes: (Node | null)[]): HTMLElement {
  return el("div", { class: "setting-actions" }, ...nodes);
}

/** A line that says what happened, announced. */
export function said(): HTMLElement {
  return el("p", { class: "settings-hint web-said", role: "status" });
}

/** A text to copy once — a link, a token — as the settings show a snippet. */
export function snippet(text: string, copyLabel: string, copiedLabel: string): HTMLElement {
  const code = el("pre", { class: "setting-code", tabindex: "0" }, text);
  const copy = button(copyLabel);
  copy.addEventListener("click", () => {
    void navigator.clipboard?.writeText(text).then(() => {
      copy.textContent = copiedLabel;
    });
  });
  return el("div", { class: "setting-snippet web-snippet" }, code, copy);
}

/** A button that runs `work`, busy meanwhile; what went wrong is said in
 *  `line`. */
export function act(b: HTMLButtonElement, line: HTMLElement, work: () => Promise<void>, explain: (e: unknown) => string): void {
  b.addEventListener("click", () => {
    line.classList.remove("web-error");
    line.textContent = "";
    b.disabled = true;
    work()
      .catch((e: unknown) => {
        line.classList.add("web-error");
        line.textContent = explain(e);
      })
      .finally(() => {
        b.disabled = false;
      });
  });
}

/** A block of rows filled when its data arrives. */
export function block(fill: (box: HTMLElement) => Promise<void>, explain: (e: unknown) => string): HTMLElement {
  const box = el("div", { class: "web-block" });
  fill(box).catch((e: unknown) => box.append(el("p", { class: "settings-hint web-error", role: "alert" }, explain(e))));
  return box;
}
