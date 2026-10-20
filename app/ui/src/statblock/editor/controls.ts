// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The layout editor's controls: each a labelled field (its label tied to it,
// its hint read with it), marked with the field it edits so the focus comes
// back to it when the form is drawn again (after an undo, a choice that
// changes the form).

import { icon } from "../../icons";
import { h } from "../h";
import type { Label } from "../model";
import { E } from "./strings";

let uid = 0;
export const freshId = (): string => `sbe-${++uid}`;

/** A control with its label, and a hint under it. */
export function field(label: string, control: HTMLElement, hint?: string, cls = ""): HTMLElement {
  const wrap = h("div", `sbe-field${cls ? ` ${cls}` : ""}`);
  const id = control.id || freshId();
  control.id = id;
  const lab = h("label", "sbe-label", label);
  lab.htmlFor = id;
  wrap.append(lab, control);
  if (hint) {
    const p = h("p", "sbe-hint", hint);
    p.id = `${id}-hint`;
    control.setAttribute("aria-describedby", p.id);
    wrap.append(p);
  }
  return wrap;
}

/** A text field that reports each change. */
export function text(value: string, key: string, onValue: (v: string) => void, opts: { list?: string; placeholder?: string; area?: boolean } = {}): HTMLInputElement | HTMLTextAreaElement {
  const input = opts.area ? h("textarea", "sbe-input") : h("input", "sbe-input");
  if (input instanceof HTMLInputElement) {
    input.type = "text";
    if (opts.list) input.setAttribute("list", opts.list);
  } else input.rows = 3;
  input.value = value;
  input.dataset["field"] = key;
  input.spellcheck = false;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  input.addEventListener("input", () => onValue(input.value));
  return input;
}

export function numberInput(value: number | undefined, key: string, min: number, max: number, onValue: (v: number | undefined) => void): HTMLInputElement {
  const input = h("input", "sbe-input sbe-number");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.value = value === undefined ? "" : String(value);
  input.dataset["field"] = key;
  input.addEventListener("input", () => {
    const n = Number(input.value);
    onValue(input.value === "" || !Number.isFinite(n) ? undefined : Math.max(min, Math.min(max, n)));
  });
  return input;
}

export function select<T extends string>(value: T, key: string, options: [T, string][], onValue: (v: T) => void): HTMLSelectElement {
  const sel = h("select", "sbe-input");
  for (const [v, label] of options) {
    const o = h("option", "", label);
    o.value = v;
    sel.append(o);
  }
  sel.value = value;
  sel.dataset["field"] = key;
  sel.addEventListener("change", () => onValue(sel.value as T));
  return sel;
}

export function check(value: boolean, key: string, label: string, onValue: (v: boolean) => void): HTMLElement {
  const wrap = h("label", "sbe-check");
  const box = h("input");
  box.type = "checkbox";
  box.checked = value;
  box.dataset["field"] = key;
  box.addEventListener("change", () => onValue(box.checked));
  wrap.append(box, h("span", "", label));
  return wrap;
}

/** A label's two languages, side by side; both empty is no label. */
export function labelPair(value: Label | undefined, key: string, names: [string, string], onValue: (v: Label | undefined) => void, area = false): HTMLElement {
  const row = h("div", "sbe-pair");
  let cur: Label = { ...(value ?? {}) };
  const emit = () => onValue(cur.pt || cur.en ? { ...(cur.pt ? { pt: cur.pt } : {}), ...(cur.en ? { en: cur.en } : {}) } : undefined);
  const pt = text(cur.pt ?? "", `${key}.pt`, (v) => ((cur = { ...cur, pt: v }), emit()), { area });
  const en = text(cur.en ?? "", `${key}.en`, (v) => ((cur = { ...cur, en: v }), emit()), { area });
  row.append(field(names[0], pt), field(names[1], en));
  return row;
}

/** Keys as chips with a field that suggests the keys seen (a datalist):
 *  Enter or the button adds one; each chip's button removes it. */
export function keyList(keys: string[], key: string, listId: string, onValue: (v: string[]) => void): HTMLElement {
  const wrap = h("div", "sbe-keys");
  const chips = h("ul", "sbe-chips");
  keys.forEach((k, i) => {
    const li = h("li", "sbe-chip");
    li.append(h("code", "", k));
    const x = h("button", "sbe-icon sbe-chip-x");
    x.type = "button";
    x.setAttribute("aria-label", E().removeKey(k));
    x.title = E().removeKey(k);
    x.dataset["field"] = `${key}.x${i}`;
    x.append(icon("close"));
    x.addEventListener("click", () => onValue(keys.filter((_, j) => j !== i)));
    li.append(x);
    chips.append(li);
  });
  const input = h("input", "sbe-input");
  input.type = "text";
  input.setAttribute("list", listId);
  input.dataset["field"] = `${key}.new`;
  input.spellcheck = false;
  const add = h("button", "sbe-small", E().addKey);
  add.type = "button";
  const take = () => {
    const k = input.value.trim();
    if (!k || k.length > 80 || keys.includes(k)) return;
    onValue([...keys, k]);
  };
  add.addEventListener("click", take);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    take();
  });
  const row = field(E().keys, input, E().keysHint, "sbe-key-add");
  row.insertBefore(add, input.nextSibling);
  wrap.append(chips, row);
  return wrap;
}

/** A line saying whether what was typed holds, read by a screen reader. */
export function verdict(ok: boolean, textSaid: string): HTMLElement {
  const p = h("p", ok ? "sbe-verdict ok" : "sbe-verdict bad", textSaid);
  p.setAttribute("role", "status");
  return p;
}
