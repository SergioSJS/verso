// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The pieces the server's pages are made of: a page in place of the
// window, a labelled field, a form whose error is announced (ADR 0035).

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
  const main = el("main", { class: "web-page" }, el("div", { class: "web-card" }, el("h1", {}, title), ...children));
  document.body.append(main);
  return main;
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

export function checkbox(label: string, checked: boolean): Field {
  const id = `f${++ids}`;
  const input = el("input", { id, type: "checkbox" });
  input.checked = checked;
  return { row: el("div", { class: "web-check" }, input, el("label", { for: id }, label)), input };
}

/** A form that runs `submit`, its button busy meanwhile, and announces
 *  what went wrong. */
export function form(
  fields: Field[],
  button: string,
  submit: () => Promise<void>,
  explain: (e: unknown) => string,
): { form: HTMLFormElement; error: HTMLElement } {
  const error = el("p", { class: "web-error", role: "alert" });
  const go = el("button", { type: "submit", class: "web-primary" }, button);
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

/** A text the person copies — a link, a token — with its button. */
export function copyable(text: string, copyLabel: string, copiedLabel: string): HTMLElement {
  const value = el("input", { type: "text", readonly: "", class: "web-copy-value", "aria-label": copyLabel });
  value.value = text;
  const button = el("button", { type: "button" }, copyLabel);
  button.addEventListener("click", () => {
    void navigator.clipboard?.writeText(text).then(() => {
      button.textContent = copiedLabel;
    });
    value.select();
  });
  return el("div", { class: "web-copy" }, value, button);
}
