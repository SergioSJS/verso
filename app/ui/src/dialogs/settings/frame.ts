// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The settings window's frame: eight resize handles, a grip, the sidebar as
// a drag handle, and the size the person left it at (kept on this machine).

import { h } from "../../dom";
import { ss } from "./strings";

/** A phone, or a finger: the window is full-screen there and not moved. */
function noDrag(e: PointerEvent): boolean {
  return window.innerWidth <= 760 || e.pointerType === "touch";
}

export function wireFrame(box: HTMLElement, el: HTMLElement, side: HTMLElement): { restoreSavedSize: () => void; resetSize: () => void } {
  const dirs: ("r" | "b" | "l" | "t" | "br" | "bl" | "tr" | "tl")[] = ["r", "b", "l", "t", "br", "bl", "tr", "tl"];
  for (const dir of dirs) {
    const handle = h("div", `settings-resize-handle ${dir}`);
    wireResize(handle, dir);
    box.append(handle);
  }
  const grip = h("button", "settings-resize-grip");
  grip.type = "button";
  grip.title = ss.gripTitle;
  grip.setAttribute("aria-label", ss.gripLabel);
  grip.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><line x1="8" y1="2" x2="2" y2="8"></line><line x1="8" y1="5" x2="5" y2="8"></line><line x1="8" y1="8" x2="8" y2="8"></line></svg>`;
  wireResize(grip, "br");
  // The keyboard's way: arrows change the size, Enter or Home restore it.
  grip.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Home" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      resetSize();
      return;
    }
    const step = e.shiftKey ? 96 : 24;
    const dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
    const dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = box.getBoundingClientRect();
    const w = Math.min(window.innerWidth - 24, Math.max(Math.min(480, window.innerWidth - 24), rect.width + dx));
    const hh = Math.min(window.innerHeight - 24, Math.max(Math.min(320, window.innerHeight - 24), rect.height + dy));
    box.style.position = "fixed";
    box.style.margin = "0";
    box.style.left = `${Math.round(rect.left)}px`;
    box.style.top = `${Math.round(rect.top)}px`;
    box.style.width = `${Math.round(w)}px`;
    box.style.height = `${Math.round(hh)}px`;
    try {
      localStorage.setItem("verso:settings-dialog-size", JSON.stringify({ width: Math.round(w), height: Math.round(hh), left: Math.round(rect.left), top: Math.round(rect.top) }));
    } catch {
      // ignore
    }
  });
  grip.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    resetSize();
  });
  box.append(grip);
  wireMove(side);

  window.addEventListener("resize", () => {
    if (el.hidden) return;
    if (window.innerWidth <= 760) return;
    const rect = box.getBoundingClientRect();
    const maxLeft = Math.max(12, window.innerWidth - rect.width - 12);
    const maxTop = Math.max(12, window.innerHeight - rect.height - 12);
    const currentLeft = parseFloat(box.style.left);
    const currentTop = parseFloat(box.style.top);
    if (!isNaN(currentLeft) && currentLeft > maxLeft) {
      box.style.left = `${Math.round(maxLeft)}px`;
    }
    if (!isNaN(currentTop) && currentTop > maxTop) {
      box.style.top = `${Math.round(maxTop)}px`;
    }
    if (rect.width > window.innerWidth - 24) {
      box.style.width = `${Math.round(window.innerWidth - 24)}px`;
    }
    if (rect.height > window.innerHeight - 24) {
      box.style.height = `${Math.round(window.innerHeight - 24)}px`;
    }
  });

  function wireResize(handle: HTMLElement, dir: "r" | "b" | "l" | "t" | "br" | "bl" | "tr" | "tl"): void {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || noDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startY = e.clientY;
      const rect = box.getBoundingClientRect();
      const startLeft = rect.left;
      const startTop = rect.top;
      const startWidth = rect.width;
      const startHeight = rect.height;

      box.style.position = "fixed";
      box.style.left = `${startLeft}px`;
      box.style.top = `${startTop}px`;
      box.style.margin = "0";

      const minW = Math.min(480, window.innerWidth - 24);
      const minH = Math.min(320, window.innerHeight - 24);
      const maxW = window.innerWidth - 24;
      const maxH = window.innerHeight - 24;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        let newWidth = startWidth;
        let newHeight = startHeight;
        let newLeft = startLeft;
        let newTop = startTop;

        if (dir.includes("r")) {
          newWidth = Math.min(maxW - startLeft, Math.max(minW, startWidth + dx));
        }
        if (dir.includes("b")) {
          newHeight = Math.min(maxH - startTop, Math.max(minH, startHeight + dy));
        }
        if (dir.includes("l")) {
          const potentialW = Math.max(minW, Math.min(startLeft + startWidth - 12, startWidth - dx));
          const actualDx = startWidth - potentialW;
          newLeft = startLeft + actualDx;
          newWidth = potentialW;
        }
        if (dir.includes("t")) {
          const potentialH = Math.max(minH, Math.min(startTop + startHeight - 12, startHeight - dy));
          const actualDy = startHeight - potentialH;
          newTop = startTop + actualDy;
          newHeight = potentialH;
        }

        box.style.width = `${Math.round(newWidth)}px`;
        box.style.height = `${Math.round(newHeight)}px`;
        box.style.left = `${Math.round(newLeft)}px`;
        box.style.top = `${Math.round(newTop)}px`;
      };

      const onUp = (ev: PointerEvent) => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
        const finalRect = box.getBoundingClientRect();
        try {
          localStorage.setItem(
            "verso:settings-dialog-size",
            JSON.stringify({
              width: Math.round(finalRect.width),
              height: Math.round(finalRect.height),
              left: Math.round(finalRect.left),
              top: Math.round(finalRect.top),
            })
          );
        } catch {
          // ignore
        }
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
  }

  function wireMove(handle: HTMLElement): void {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || noDrag(e)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, button, select, textarea, a, .settings-nav-item, .settings-resize-handle, .settings-search")) {
        return;
      }
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startY = e.clientY;
      const rect = box.getBoundingClientRect();
      const startLeft = rect.left;
      const startTop = rect.top;

      box.style.position = "fixed";
      box.style.left = `${startLeft}px`;
      box.style.top = `${startTop}px`;
      box.style.margin = "0";

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const maxLeft = window.innerWidth - rect.width - 12;
        const maxTop = window.innerHeight - rect.height - 12;
        const nextLeft = Math.max(12, Math.min(maxLeft, startLeft + dx));
        const nextTop = Math.max(12, Math.min(maxTop, startTop + dy));
        box.style.left = `${Math.round(nextLeft)}px`;
        box.style.top = `${Math.round(nextTop)}px`;
      };

      const onUp = (ev: PointerEvent) => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
        const finalRect = box.getBoundingClientRect();
        try {
          localStorage.setItem(
            "verso:settings-dialog-size",
            JSON.stringify({
              width: Math.round(finalRect.width),
              height: Math.round(finalRect.height),
              left: Math.round(finalRect.left),
              top: Math.round(finalRect.top),
            })
          );
        } catch {
          // ignore
        }
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
  }

  function resetSize(): void {
    box.style.position = "";
    box.style.left = "";
    box.style.top = "";
    box.style.width = "";
    box.style.height = "";
    box.style.margin = "";
    try {
      localStorage.removeItem("verso:settings-dialog-size");
    } catch {
      // ignore
    }
  }

  function restoreSavedSize(): void {
    if (window.innerWidth <= 760) return;
    try {
      const raw = localStorage.getItem("verso:settings-dialog-size");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved?.width === "number" && typeof saved?.height === "number") {
        const maxW = window.innerWidth - 32;
        const maxH = window.innerHeight - 32;
        const minW = Math.min(480, maxW);
        const minH = Math.min(320, maxH);
        const w = Math.min(maxW, Math.max(minW, saved.width));
        const h = Math.min(maxH, Math.max(minH, saved.height));
        box.style.width = `${w}px`;
        box.style.height = `${h}px`;

        if (typeof saved?.left === "number" && typeof saved?.top === "number") {
          const maxL = window.innerWidth - w - 16;
          const maxT = window.innerHeight - h - 16;
          const l = Math.max(16, Math.min(maxL, saved.left));
          const t = Math.max(16, Math.min(maxT, saved.top));
          box.style.position = "fixed";
          box.style.left = `${l}px`;
          box.style.top = `${t}px`;
          box.style.margin = "0";
        }
      }
    } catch {
      // ignore
    }
  }
  return { restoreSavedSize, resetSize };
}
