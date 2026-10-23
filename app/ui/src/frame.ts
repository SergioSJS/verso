// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** A folder's window without the system's title bar (ADR 0072). On macOS
 *  the system's buttons float over the top-left corner (the host places
 *  them, windows.rs `frameless`); on Windows and Linux the app draws
 *  minimize, maximize and close at the right end (the "windows" frame). Either way a corner of the top row
 *  is reserved, and whatever bar of the top row reaches into it — the
 *  ribbon, the side bar's head, a pane's tabs, the right bar's tabs, the
 *  spaces — is pushed clear of it, whatever the layout: side bars open or
 *  closed, panes split, tabs vertical. The empty parts of those bars drag
 *  the window, and a double click there maximizes it, as the title bar
 *  did. A note's popout and the browser harness keep it as it was (the
 *  harness takes `?frame=mac|windows` for the tests). */

import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { commands } from "./bindings";
import { h } from "./dom";
import { MAC } from "./platform";
import { t } from "./strings";

type Frame = "mac" | "windows";

/** The bars of the top row that may reach the reserved corner. */
const BARS = ".ribbon, .side-head, .spaces, .tabs, .right-tabs";
/** How far down the corner goes: the top row's height (2.45rem — a pane's
 *  tab bar, or the spaces bar when there are two workspaces, given the same
 *  height when framed — which follows the font size of the settings), where
 *  Windows' buttons sit. On macOS at least 37 px: the system's buttons do
 *  not follow the font size (the position asked for in
 *  tauri.macos.conf.json is not applied on macOS 26, where they stay at
 *  the system's place, tops 9 px down), so in the smallest font they still
 *  fit inside the corner. */
function band(): number {
  const row = 2.45 * parseFloat(getComputedStyle(document.documentElement).fontSize);
  return frame === "mac" ? Math.max(37, row) : row;
}
/** The corner each frame keeps: macOS's three buttons with their margins
 *  (measured on macOS 26 at the system's place, x 9–68); Windows' three of
 *  46 px. */
const CORNER: Record<Frame, number> = { mac: 78, windows: 138 };

function which(): Frame | null {
  const asked = new URLSearchParams(location.search).get("frame");
  if (asked === "mac" || asked === "windows") return asked;
  if (!isTauri()) return null;
  // The folder's windows only: a popout keeps its title, the note's name.
  const label = getCurrentWindow().label;
  if (label !== "main" && !label.startsWith("window-")) return null;
  // Linux draws its buttons as Windows does, at the right end: the
  // system's bar, on GNOME and KDE, was a strip of space put to no use.
  return MAC ? "mac" : "windows";
}

let frame: Frame | null = null;
/** The windows frame's menu button, at the top-left (winMenu.ts). */
let menuButton: HTMLButtonElement | null = null;
/** The menu button of Windows and Linux, once the frame is installed. */
export function frameMenuButton(): HTMLButtonElement | null {
  return menuButton;
}
/** macOS hides its buttons in full screen: nothing is reserved then. */
let fullscreen = false;
let pending = 0;

/** Push the bars that reach into one corner clear of it: `side` is the
 *  corner's (`l` or `r`) and `corner` how far it reaches in. */
function clearCorner(bars: HTMLElement[], side: "l" | "r", corner: number, ROW: number, width: number): void {
  if (!corner) return;
  for (const bar of bars) {
    const r = bar.getBoundingClientRect();
    // A bar off screen (a side bar slid away in a narrow window) is left
    // as it is; it is measured again when it comes in.
    if (!r.width || !r.height || r.top >= ROW - 1 || r.right <= 0 || r.left >= width) continue;
    // Nor one that is not shown (the closed side bar is hidden, not gone).
    if (!bar.checkVisibility({ visibilityProperty: true })) continue;
    const reach = side === "l" ? corner - r.left : r.right - (width - corner);
    if (reach <= 0) continue;
    if (r.height <= r.width * 1.5 && reach < r.width) {
      // As much as its own padding on that side does not cover already.
      const style = getComputedStyle(bar);
      // A first (or last) child drawn past the padding by a negative margin
      // — the folder button's hover — counts as reaching that far.
      const edge = side === "l" ? bar.firstElementChild : bar.lastElementChild;
      const margin = edge ? parseFloat(getComputedStyle(edge)[side === "l" ? "marginLeft" : "marginRight"]) : 0;
      const push = reach - parseFloat(side === "l" ? style.paddingLeft : style.paddingRight) - Math.min(0, margin);
      if (push <= 0) continue;
      const overflow = bar.scrollWidth - bar.clientWidth;
      // A pixel more: a button's hover may reach past its box.
      bar.style.setProperty(`--frame-${side}`, `${Math.ceil(push) + 1}px`);
      bar.classList.add(`frame-push-${side}`);
      // A bar that keeps its own tabs whole, the rest in a "⋯" menu, is
      // never sent down for want of room (panel/tabStrip.ts).
      if (bar.classList.contains("right-tabs") || bar.scrollWidth - bar.clientWidth <= overflow + 1) continue;
      bar.classList.remove(`frame-push-${side}`);
      bar.style.removeProperty(`--frame-${side}`);
    }
    // Down by what its own padding does not cover already.
    const down = ROW - r.top - parseFloat(getComputedStyle(bar).paddingTop);
    if (down <= 0) continue;
    bar.style.setProperty("--frame-t", `${Math.ceil(down) + 1}px`);
    bar.classList.add("frame-push-t");
  }
}

/** Push every bar of the top row clear of the reserved corner: sideways
 *  by as much as it reaches into it (a spacer at its start or end), or —
 *  when it is narrower than that, a column (vertical tabs), or its content
 *  would no longer fit beside the corner (the right bar's tabs in a narrow
 *  bar) — down, below the corner. */
function avoid(): void {
  pending = 0;
  if (!frame) return;
  const bars = [...document.querySelectorAll<HTMLElement>(BARS)];
  for (const bar of bars) {
    bar.classList.remove("frame-push-l", "frame-push-r", "frame-push-t");
    for (const v of ["--frame-l", "--frame-r", "--frame-t"]) bar.style.removeProperty(v);
  }
  const width = document.documentElement.clientWidth;
  const ROW = band();
  if (frame === "mac") {
    if (!fullscreen) clearCorner(bars, "l", CORNER.mac, ROW, width);
  } else {
    // Windows and Linux: the buttons at the right end, the menu button
    // (the ribbon's width) at the left.
    clearCorner(bars, "r", CORNER.windows, ROW, width);
    clearCorner(bars, "l", menuButton?.getBoundingClientRect().right ?? 0, ROW, width);
  }
  observeBars(bars);
  // A bar that fits its own tabs in the room it is left (the right
  // panel's) measures again now that the corner is cleared.
  dispatchEvent(new Event("verso:frame-avoided"));
}

function soon(): void {
  if (!pending) pending = requestAnimationFrame(avoid);
}

/** Measure the top row again on the next frame: called where bars appear
 *  or move without any observed box changing size — the panes mounted, the
 *  workspaces shown, a side bar opened or closed. */
export function refreshFrame(): void {
  if (frame) soon();
}

const sizes = new ResizeObserver(soon);
const watched = new WeakSet<Element>();
function observeBars(bars: HTMLElement[]): void {
  for (const bar of bars) {
    if (watched.has(bar)) continue;
    watched.add(bar);
    bar.setAttribute("data-tauri-drag-region", "deep");
    sizes.observe(bar);
  }
}

const GLYPHS = {
  minimize: '<path d="M0 5.5h10"/>',
  maximize: '<rect x=".5" y=".5" width="9" height="9"/>',
  restore: '<rect x=".5" y="2.5" width="7" height="7"/><path d="M2.5 2.5v-2h7v7h-2"/>',
  close: '<path d="M.5.5l9 9M9.5.5l-9 9"/>',
};

function glyph(name: keyof typeof GLYPHS): string {
  return `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1">${GLYPHS[name]}</svg>`;
}

/** Windows' three buttons, drawn by the app: labelled for assistive
 *  technology (ADR 0035), the maximize one showing restore when the
 *  window is maximized. They take no focus by Tab, like the system's;
 *  Alt+F4 and Win+arrows stay the system's. */
function controls(): HTMLElement {
  const win = getCurrentWindow();
  const bar = h("div", "frame-controls");
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", t.frameControls);
  const make = (cls: string, label: string, icon: keyof typeof GLYPHS, run: () => Promise<void>) => {
    const b = h("button", `frame-button ${cls}`);
    b.type = "button";
    b.tabIndex = -1;
    b.setAttribute("aria-label", label);
    b.title = label;
    b.innerHTML = glyph(icon);
    b.addEventListener("click", () => void run());
    return b;
  };
  const max = make("frame-max", t.frameMaximize, "maximize", () => win.toggleMaximize());
  const showMax = async () => {
    const maximized = await win.isMaximized().catch(() => false);
    max.innerHTML = glyph(maximized ? "restore" : "maximize");
    const label = maximized ? t.frameRestore : t.frameMaximize;
    max.setAttribute("aria-label", label);
    max.title = label;
  };
  void showMax();
  void win.onResized(() => void showMax());
  bar.append(
    make("frame-min", t.frameMinimize, "minimize", () => win.minimize()),
    max,
    // close() asks the window to close: its tabs are saved first
    // (main.ts, onCloseRequested), as with the system's button.
    make("frame-close", t.frameClose, "close", () => {
      void commands.logWrite("INFO", `close ${win.label}: the frame's close button`).catch(() => undefined);
      return win.close();
    }),
  );
  return bar;
}

/** Set the window's frame up, once, at start. */
export function installFrame(): void {
  frame = which();
  if (!frame) return;
  document.body.classList.add("framed", `framed-${frame}`);
  if (frame === "windows") {
    document.body.append(controls());
    // Obsidian's menu button, in the corner where the Mac has its lights.
    menuButton = h("button", "frame-menu");
    menuButton.type = "button";
    menuButton.tabIndex = 0;
    document.body.append(menuButton);
  }
  // macOS, as Obsidian has it: one title row across the window — the
  // system's buttons, the side bar's head, the tabs — and the ribbon
  // starting below it. This strip carries the row over the ribbon's top.
  if (frame === "mac" || frame === "windows") {
    const strip = h("div", "frame-strip");
    strip.setAttribute("data-tauri-drag-region", "");
    strip.setAttribute("aria-hidden", "true");
    document.body.append(strip);
  }
  // The window's own focus dims the buttons, as the system does — the
  // window's, not the web view's: a web page's child view taking the focus
  // leaves the window active.
  if (isTauri()) {
    void getCurrentWindow().onFocusChanged(({ payload }) => document.body.classList.toggle("frame-inactive", !payload));
  } else {
    window.addEventListener("blur", () => document.body.classList.add("frame-inactive"));
    window.addEventListener("focus", () => document.body.classList.remove("frame-inactive"));
  }
  if (frame === "mac" && isTauri()) {
    const win = getCurrentWindow();
    void win.onResized(() => void win.isFullscreen().then((full) => {
      if (full === fullscreen) return;
      fullscreen = full;
      document.body.classList.toggle("frame-fullscreen", full);
      soon();
    }).catch(() => {}));
  }
  sizes.observe(document.body);
  window.addEventListener("resize", soon);
  // A side bar sliding in over a narrow window moves without changing
  // size: measured again once it stops.
  document.addEventListener("transitionend", (e) => {
    if (e.target instanceof Element && e.target.matches("aside")) soon();
  });
  soon();
}
