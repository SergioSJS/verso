// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The colour picker (ADR 0108 item 5), laid out like VS Code's: a header in
// the colour that shows its code, a saturation and brightness square, a
// vertical opacity strip and a vertical hue strip. A popover on the page,
// anchored to a swatch and kept inside the window (a phone's too). It
// knows nothing of notes: the caller says how a colour is written as code
// (`format`) and where the code goes (`write`); the picker only calls
// them. Keyboard: Tab moves between the three controls, the arrows move
// inside one (Shift for bigger steps), Enter applies and closes, Esc
// cancels and puts back what the code was.
//
// The code is written when a drag is released and on every key press, not
// while the pointer moves: the text of a note is saved as it changes, and
// a drag would save a hundred half-chosen colours. Meanwhile the header and
// the thumbs show the colour at once.

import { h } from "../dom";
import { type Colour, cssOf, hslToRgb, rgbToHsl } from "./code";
import { cs } from "./strings";

export type PickerOptions = {
  anchor: HTMLElement;
  colour: Colour;
  /** The hue the code states, when it is an `hsl()` (a grey has none otherwise). */
  hue?: number;
  /** The code a colour is written as: the original's notation. */
  format: (c: Colour) => string;
  /** Put the code in the note; false when the note no longer has the code
   *  where it was (the picker then closes). */
  write: (code: string) => boolean;
  /** Put the original code back (Esc after something was written). */
  restore: () => void;
  onClose: () => void;
};

export type Picker = { close: (apply: boolean) => void; el: HTMLElement };

type Hsv = { h: number; s: number; v: number; a: number };

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

function toHsv(c: Colour, hue?: number): Hsv {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = rgbToHsl(c.r, c.g, c.b);
  const d = max - min;
  return { h: d === 0 && hue !== undefined ? hue : l.h, s: max === 0 ? 0 : d / max, v: max, a: c.a };
}

function toColour(v: Hsv): Colour {
  // HSV to HSL, then the one conversion the module has.
  const l = v.v * (1 - v.s / 2);
  const s = l === 0 || l === 1 ? 0 : (v.v - l) / Math.min(l, 1 - l);
  return { ...hslToRgb(v.h, s, l), a: v.a };
}

let current: Picker | null = null;

/** Close the open picker, keeping what it wrote. */
export function closePicker(): void {
  current?.close(true);
}

export function openPicker(o: PickerOptions): Picker {
  current?.close(true);
  const state = toHsv(o.colour, o.hue);
  let changed = false;
  let wrote = false;
  let lastText = o.format(o.colour);
  const original = lastText;

  const root = h("div", "cp");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", cs.picker);
  const head = h("div", "cp-head");
  const code = h("span", "cp-code", `"${lastText}"`);
  head.append(code);
  const body = h("div", "cp-body");
  const sv = h("div", "cp-sv");
  const svThumb = h("span", "cp-thumb");
  sv.append(svThumb);
  const alpha = h("div", "cp-strip cp-alpha");
  const alphaThumb = h("span", "cp-bar");
  alpha.append(alphaThumb);
  const hue = h("div", "cp-strip cp-hue");
  const hueThumb = h("span", "cp-bar");
  hue.append(hueThumb);
  body.append(sv, alpha, hue);
  const hint = h("p", "cp-hint", cs.hint);
  hint.id = `cp-hint-${Math.random().toString(36).slice(2, 8)}`;
  root.append(head, body, hint);

  const control = (e: HTMLElement, label: string): void => {
    e.tabIndex = 0;
    e.setAttribute("role", "slider");
    e.setAttribute("aria-label", label);
    e.setAttribute("aria-describedby", hint.id);
  };
  control(sv, cs.square);
  control(alpha, cs.alpha);
  control(hue, cs.hue);
  alpha.setAttribute("aria-orientation", "vertical");
  hue.setAttribute("aria-orientation", "vertical");
  for (const [e, min, max] of [[alpha, 0, 100], [hue, 0, 360]] as const) {
    e.setAttribute("aria-valuemin", String(min));
    e.setAttribute("aria-valuemax", String(max));
  }

  const colour = (): Colour => (changed ? toColour(state) : o.colour);

  const paint = (): void => {
    const c = colour();
    const text = o.format(c);
    code.textContent = `"${text}"`;
    head.style.setProperty("--cp-colour", cssOf(c));
    sv.style.setProperty("--cp-hue", `hsl(${Math.round(state.h)} 100% 50%)`);
    sv.style.setProperty("--cp-solid", cssOf({ ...c, a: 1 }));
    svThumb.style.left = `${state.s * 100}%`;
    svThumb.style.top = `${(1 - state.v) * 100}%`;
    alpha.style.setProperty("--cp-solid", cssOf({ ...c, a: 1 }));
    alphaThumb.style.top = `${(1 - state.a) * 100}%`;
    hueThumb.style.top = `${(state.h / 360) * 100}%`;
    sv.setAttribute("aria-valuenow", String(Math.round(state.s * 100)));
    sv.setAttribute("aria-valuetext", cs.squareValue(Math.round(state.s * 100), Math.round(state.v * 100)));
    alpha.setAttribute("aria-valuenow", String(Math.round(state.a * 100)));
    alpha.setAttribute("aria-valuetext", cs.alphaValue(Math.round(state.a * 100)));
    hue.setAttribute("aria-valuenow", String(Math.round(state.h)));
    hue.setAttribute("aria-valuetext", cs.hueValue(Math.round(state.h)));
  };

  let closed = false;
  const close = (apply: boolean): void => {
    if (closed) return;
    closed = true;
    if (!apply && wrote && lastText !== original) o.restore();
    document.removeEventListener("pointerdown", outside, true);
    window.removeEventListener("resize", onResize);
    root.remove();
    if (current === picker) current = null;
    o.onClose();
  };
  const outside = (e: Event): void => {
    if (!root.contains(e.target as Node)) close(true);
  };
  const onResize = (): void => place();

  /** Put the code in the note, if it is not what is there. */
  const commit = (): void => {
    const text = o.format(colour());
    if (text === lastText) return;
    if (!o.write(text)) {
      close(true);
      return;
    }
    lastText = text;
    wrote = true;
  };

  const point = (e: PointerEvent, box: HTMLElement): { x: number; y: number } => {
    const r = box.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
  };
  const drag = (box: HTMLElement, set: (x: number, y: number) => void): void => {
    box.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      box.focus();
      box.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent): void => {
        const p = point(ev, box);
        set(p.x, p.y);
        changed = true;
        paint();
      };
      move(e);
      const up = (): void => {
        box.removeEventListener("pointermove", move);
        box.removeEventListener("pointerup", up);
        box.removeEventListener("pointercancel", up);
        commit();
      };
      box.addEventListener("pointermove", move);
      box.addEventListener("pointerup", up);
      box.addEventListener("pointercancel", up);
    });
  };
  drag(sv, (x, y) => {
    state.s = x;
    state.v = 1 - y;
  });
  drag(alpha, (_x, y) => {
    state.a = 1 - y;
  });
  drag(hue, (_x, y) => {
    state.h = Math.min(359.99, y * 360);
  });

  const keys = (box: HTMLElement, step: (key: string, big: boolean) => boolean): void => {
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        commit();
        close(true);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(false);
        return;
      }
      if (e.key === "Tab") {
        // The popover keeps the focus: Tab goes round its three controls.
        const all: HTMLElement[] = [sv, alpha, hue];
        const at = all.indexOf(box);
        e.preventDefault();
        all[(at + (e.shiftKey ? all.length - 1 : 1)) % all.length]!.focus();
        return;
      }
      if (step(e.key, e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        changed = true;
        paint();
        commit();
      }
    });
  };
  keys(sv, (k, big) => {
    const d = big ? 0.1 : 0.01;
    if (k === "ArrowLeft") state.s = clamp(state.s - d, 0, 1);
    else if (k === "ArrowRight") state.s = clamp(state.s + d, 0, 1);
    else if (k === "ArrowUp") state.v = clamp(state.v + d, 0, 1);
    else if (k === "ArrowDown") state.v = clamp(state.v - d, 0, 1);
    else return false;
    return true;
  });
  keys(alpha, (k, big) => {
    const d = big ? 0.1 : 0.01;
    if (k === "ArrowUp" || k === "ArrowRight") state.a = clamp(state.a + d, 0, 1);
    else if (k === "ArrowDown" || k === "ArrowLeft") state.a = clamp(state.a - d, 0, 1);
    else return false;
    return true;
  });
  keys(hue, (k, big) => {
    const d = big ? 15 : 1;
    if (k === "ArrowDown" || k === "ArrowRight") state.h = (state.h + d) % 360;
    else if (k === "ArrowUp" || k === "ArrowLeft") state.h = (state.h - d + 360) % 360;
    else return false;
    return true;
  });

  /** Below the anchor, or above it when there is no room; inside the window. */
  const rect = o.anchor.getBoundingClientRect();
  const place = (): void => {
    const margin = 8;
    const w = Math.min(238, window.innerWidth - 2 * margin);
    root.style.width = `${w}px`;
    const hgt = root.offsetHeight;
    let left = clamp(rect.left, margin, Math.max(margin, window.innerWidth - w - margin));
    let top = rect.bottom + 6;
    if (top + hgt > window.innerHeight - margin) top = Math.max(margin, rect.top - hgt - 6);
    left = Math.round(left);
    root.style.left = `${left}px`;
    root.style.top = `${Math.round(top)}px`;
  };

  document.body.append(root);
  paint();
  place();
  document.addEventListener("pointerdown", outside, true);
  window.addEventListener("resize", onResize);
  sv.focus();

  const picker: Picker = { close, el: root };
  current = picker;
  return picker;
}
