// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type RefObject, useEffect, useRef, useState } from "react";

/** Puts the insert menu into Excalidraw's toolbar, before the divider of
 *  its "More tools": Excalidraw has no slot there, so a node of Verso's is
 *  placed among its tools, and placed again whenever the toolbar is drawn
 *  anew (a narrow view, the view mode). `null` while there is no toolbar:
 *  the menu then goes to the top-right tools. */
export function useToolbarSlot(canvas: RefObject<HTMLDivElement | null>): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const node = document.createElement("div");
    node.className = "board-insert-slot";
    const place = (): void => {
      const row = c.querySelector<HTMLElement>(".App-toolbar .Stack_horizontal");
      if (!row) {
        node.remove();
        setSlot(null);
        return;
      }
      const dividers = row.querySelectorAll(":scope > .App-toolbar__divider");
      const before = dividers.length > 1 ? dividers[dividers.length - 1]! : null;
      if (node.parentElement !== row || (before && node.nextElementSibling !== before)) row.insertBefore(node, before);
      setSlot(node);
    };
    place();
    const mo = new MutationObserver(() => {
      if (!node.isConnected || !c.querySelector(".App-toolbar .Stack_horizontal")?.contains(node)) place();
    });
    mo.observe(c, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      node.remove();
    };
  }, [canvas]);
  return slot;
}

/** Gives Excalidraw's main-menu button (the hamburger) a name: it has an
 *  icon and no text, so a reader of the screen finds a button with no
 *  name. Set again whenever the button is drawn anew. */
export function useMenuName(canvas: RefObject<HTMLDivElement | null>, name: string): void {
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const label = (): void => {
      for (const b of c.querySelectorAll<HTMLElement>(".main-menu-trigger, [data-testid=\"main-menu-trigger\"]")) {
        if (b.getAttribute("aria-label") !== name) b.setAttribute("aria-label", name);
        if (b.title !== name) b.title = name;
      }
    };
    label();
    const mo = new MutationObserver(label);
    mo.observe(c, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [canvas, name]);
}

/** Excalidraw's line of hints under its toolbar, while `on`: Verso's own
 *  hint goes in it as one more line, in its clothes. Excalidraw draws the
 *  line anew as the hint changes, so it is looked for again each time. */
export function useHintSlot(canvas: RefObject<HTMLDivElement | null>, on: boolean): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !on) {
      setSlot(null);
      return;
    }
    const find = (): void => setSlot(c.querySelector<HTMLElement>(".HintViewer"));
    find();
    const mo = new MutationObserver(find);
    mo.observe(c, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [canvas, on]);
  return slot;
}

/** Whether Verso's tools go to Excalidraw's footer: when the board — not
 *  its desktop layout, which holds until the board is quite narrow — leaves
 *  no room for them beside the menu and the toolbar on the top row (a side
 *  bar open, a narrow pane). Excalidraw's phone layout has its own place for
 *  them (style.css). Their width is read while they are on the top row and
 *  not being typed into, so a search field that widens never moves them. */
/** Excalidraw's right-click menu with the items Verso hides (its copies
 *  as pictures, a card's link, the library) taken out cleanly: a line left
 *  first, last or beside another goes, or the menu shows two together. */
export function useTidyContextMenu(canvas: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const tidy = (menu: Element): void => {
      let last: HTMLElement | null = null;
      let seen = false;
      for (const child of Array.from(menu.children) as HTMLElement[]) {
        const line = child.classList.contains("context-menu-item-separator");
        if (line) {
          child.style.display = "";
          if (!seen || last) child.style.display = "none";
          else last = child;
          continue;
        }
        if (getComputedStyle(child).display === "none") continue;
        seen = true;
        last = null;
      }
      if (last) last.style.display = "none";
    };
    const mo = new MutationObserver(() => {
      const menu = c.querySelector(".context-menu");
      if (menu) tidy(menu);
    });
    mo.observe(c, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [canvas]);
}

export function useToolsBelow(canvas: RefObject<HTMLDivElement | null>): boolean {
  const [below, setBelow] = useState(false);
  const toolsWidth = useRef(180);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const measure = (): void => {
      // The board's width, for the toolbar of the phone layout (style.css):
      // a percentage there would be of the toolbar's own box.
      c.style.setProperty("--board-width", `${c.clientWidth}px`);
      const ex = c.querySelector(".excalidraw");
      if (ex?.classList.contains("excalidraw--mobile")) {
        setBelow(false);
        return;
      }
      const top = c.querySelector(".App-menu_top");
      const bar = c.querySelector(".App-toolbar");
      if (!ex || !top || !bar) return;
      const tools = c.querySelector<HTMLElement>(".layer-ui__wrapper__top-right .board-ex-tools");
      if (tools && !tools.contains(document.activeElement)) toolsWidth.current = tools.getBoundingClientRect().width;
      const left = c.querySelector(".App-menu_top__left")?.getBoundingClientRect().width ?? 0;
      const room = top.getBoundingClientRect().width - bar.getBoundingClientRect().width - left - 48;
      setBelow(room < toolsWidth.current);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(c);
    // The toolbar drawn anew, or Excalidraw turning to its phone layout
    // (a class of its root, set after the size that caused it): measured
    // again, or the tools would wait in a footer the phone layout has not.
    let watched: Element | null = null;
    const mo = new MutationObserver((records) => {
      const bar = c.querySelector(".App-toolbar");
      const layout = records.some((r) => r.type === "attributes" && (r.target as Element).classList.contains("excalidraw"));
      if (bar && bar !== watched) {
        watched = bar;
        ro.observe(bar);
        measure();
      } else if (layout) measure();
    });
    mo.observe(c, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    measure();
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [canvas]);
  return below;
}

/** What the board tells the window's hover preview (ADR 0085 items 2 and
 *  5): the cards lie under Excalidraw's canvas, which takes the pointer,
 *  so the board says which card's name the pointer rests on — the topmost
 *  card under it, as the eye sees — and a finger held still on one. */
export type BoardPreview = {
  at: (el: Element | null, x: number, y: number, mods: boolean) => void;
  press: (el: Element, x: number) => boolean;
};

const PRESS_MS = 450;
const STILL_PX = 8;

export function useCardPreview(canvas: RefObject<HTMLDivElement | null>, preview: BoardPreview | undefined): void {
  useEffect(() => {
    const root = canvas.current;
    if (!root || !preview) return;
    const inside = (r: DOMRect, x: number, y: number): boolean => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const nameAt = (x: number, y: number): Element | null => {
      // A pin (ADR 0090 item 3) is above the cards: its mark is the name.
      const pins = root.querySelectorAll<HTMLElement>(".board-pin[data-preview-path]:not(.is-far)");
      for (let i = pins.length - 1; i >= 0; i--) if (inside(pins[i]!.getBoundingClientRect(), x, y)) return pins[i]!;
      const slots = root.querySelectorAll<HTMLElement>(".board-card-slot:not(.is-far)");
      for (let i = slots.length - 1; i >= 0; i--) {
        const slot = slots[i]!;
        if (!inside(slot.getBoundingClientRect(), x, y)) continue;
        // An entered card is being read or edited: its own pointer.
        if (slot.classList.contains("is-active")) return null;
        for (const el of slot.querySelectorAll("[data-preview-path]")) if (inside(el.getBoundingClientRect(), x, y)) return el;
        return null;
      }
      return null;
    };
    const move = (e: PointerEvent): void => {
      if (e.pointerType === "touch") return;
      preview.at(e.buttons ? null : nameAt(e.clientX, e.clientY), e.clientX, e.clientY, e.metaKey || e.ctrlKey);
    };
    const leave = (e: PointerEvent): void => preview.at(null, e.clientX, e.clientY, false);
    let held: { id: number; x: number; y: number; timer: number } | null = null;
    const down = (e: PointerEvent): void => {
      if (e.pointerType !== "touch" || !e.isPrimary) return;
      const el = nameAt(e.clientX, e.clientY);
      if (!el) return;
      const x = e.clientX;
      held = { id: e.pointerId, x, y: e.clientY, timer: window.setTimeout(() => preview.press(el, x), PRESS_MS) };
    };
    const still = (e: PointerEvent): void => {
      if (held && e.pointerId === held.id && Math.hypot(e.clientX - held.x, e.clientY - held.y) >= STILL_PX) lift();
    };
    const lift = (): void => {
      if (held) window.clearTimeout(held.timer);
      held = null;
    };
    root.addEventListener("pointermove", move, true);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("pointerdown", down, true);
    root.addEventListener("pointermove", still, true);
    root.addEventListener("pointerup", lift, true);
    root.addEventListener("pointercancel", lift, true);
    return () => {
      lift();
      root.removeEventListener("pointermove", move, true);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("pointerdown", down, true);
      root.removeEventListener("pointermove", still, true);
      root.removeEventListener("pointerup", lift, true);
      root.removeEventListener("pointercancel", lift, true);
    };
  }, [canvas, preview]);
}

/** A card's buttons (open, swap, a page card's approval, a die's roll, a
 *  sound card's player), under Excalidraw's selection canvas, are pressed
 *  here: the topmost card under the pointer decides, as the eye does. A
 *  slider of a card (`input.board-card-press`, the player's bar and volume)
 *  is dragged here the same way. Only a card that is not entered: an
 *  entered card takes the pointer itself. */
export function useCardButtons(canvas: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const root = canvas.current;
    if (!root) return;
    let pressed: HTMLElement | null = null;
    let hover: HTMLElement | null = null;
    const inside = (r: DOMRect, x: number, y: number): boolean => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const buttonAt = (x: number, y: number): HTMLElement | null => {
      const slots = root.querySelectorAll<HTMLElement>(".board-card-slot:not(.is-far)");
      for (let i = slots.length - 1; i >= 0; i--) {
        const slot = slots[i]!;
        if (!inside(slot.getBoundingClientRect(), x, y)) continue;
        if (slot.classList.contains("is-active")) return null;
        for (const b of slot.querySelectorAll<HTMLElement>("button.board-card-open, button.board-card-press, input.board-card-press, button.dice-button, button.dice-again, button.dice-close")) if (!(b as HTMLButtonElement).disabled && b.getClientRects().length > 0 && inside(b.getBoundingClientRect(), x, y)) return b;
        return null;
      }
      return null;
    };
    const down = (e: PointerEvent): void => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const b = buttonAt(e.clientX, e.clientY);
      if (!b) return;
      pressed = b;
      e.stopPropagation();
      e.preventDefault();
      if (b instanceof HTMLInputElement) slide(b, e.clientX, "input");
    };
    const up = (e: PointerEvent): void => {
      if (!pressed) return;
      const b = pressed;
      pressed = null;
      e.stopPropagation();
      if (b instanceof HTMLInputElement) slide(b, e.clientX, "change");
      else if (buttonAt(e.clientX, e.clientY) === b) b.click();
    };
    const move = (e: PointerEvent): void => {
      if (pressed instanceof HTMLInputElement && e.buttons) {
        e.stopPropagation();
        slide(pressed, e.clientX, "input");
        return;
      }
      const b = e.buttons ? null : buttonAt(e.clientX, e.clientY);
      if (b === hover) return;
      hover?.classList.remove("is-hover");
      b?.classList.add("is-hover");
      root.classList.toggle("is-over-open", !!b);
      hover = b;
    };
    root.addEventListener("pointerdown", down, true);
    root.addEventListener("pointerup", up, true);
    root.addEventListener("pointermove", move, true);
    return () => {
      root.removeEventListener("pointerdown", down, true);
      root.removeEventListener("pointerup", up, true);
      root.removeEventListener("pointermove", move, true);
    };
  }, []);
}

/** A card's slider set where the pointer is along it, and told (`input`
 *  while dragged, `change` once let go), as the engine's own would. */
function slide(r: HTMLInputElement, x: number, event: "input" | "change"): void {
  const box = r.getBoundingClientRect();
  const min = Number(r.min) || 0;
  const max = Number(r.max) || 100;
  const step = Number(r.step) || 1;
  const frac = box.width > 0 ? Math.max(0, Math.min(1, (x - box.left) / box.width)) : 0;
  const value = Math.round((min + frac * (max - min)) / step) * step;
  if (event === "input" && String(value) === r.value) return;
  r.value = String(value);
  r.dispatchEvent(new Event(event, { bubbles: true }));
}
