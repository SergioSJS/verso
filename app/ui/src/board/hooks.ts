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
