// The live region that mirrors the visible status line, minus the routine
// "Saved." (see statusCore.ts). The visible line is not itself a live region.

import { announcedText } from "./statusCore";

export function installStatusLive(status: HTMLElement): void {
  status.removeAttribute("role");
  status.removeAttribute("aria-live");
  const live = document.createElement("span");
  live.id = "status-live";
  live.className = "sr-only";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  status.after(live);
  const mirror = () => { live.textContent = announcedText(status.textContent ?? ""); };
  new MutationObserver(mirror).observe(status, { childList: true, characterData: true, subtree: true });
  mirror();
}
