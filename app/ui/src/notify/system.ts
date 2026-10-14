// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The system's notifications (ADR 0084 item 9, decided 2026-10-14): off
// until the person turns them on, the permission asked at that moment and
// never by surprise; refused, the row goes back to off and says why. On,
// a notification whose kind is "Aviso e lista" also goes to the system —
// only while the window is not in front.
//
// One way on every side (ADR 0026 rule 2): Tauri's notification plugin
// gives the page the browser's `Notification` — on the desktop its own,
// answered by the host; in a browser the browser's, the web bridge
// answering what the plugin asks of the host (web/bridge.ts). Sent with
// `new Notification`, not the plugin's `sendNotification`, which drops
// the notification and so its click: where the system tells the page of
// a click (a browser), the window comes to the front and the centre opens
// on that notification.
//
// Whether the person turned it on is this machine's, never the account's:
// the permission is the system's of this computer, or of this browser.

import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { h } from "../dom";
import type { Entry } from "./core";
import { notifyStrings } from "./strings";

const WANTED = "verso.notify.system";

/** Why the system's notifications cannot be had here, or "ok". */
export type SystemWhy = "ok" | "noApi" | "notSecure" | "phone";

let wanted = false;
let granted = false;
/** Why the row went back to off, said in the row. */
let why = "";

function readWanted(): boolean {
  try {
    return localStorage.getItem(WANTED) === "1";
  } catch {
    return false;
  }
}

function writeWanted(on: boolean): void {
  wanted = on;
  try {
    if (on) localStorage.setItem(WANTED, "1");
    else localStorage.removeItem(WANTED);
  } catch {
    // No storage: on for as long as the window lives.
  }
}

/** A phone's browser that gives notifications only to an installed app
 *  (Safari on an iPhone or an iPad, outside the home screen). */
function phoneBrowser(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = matchMedia("(display-mode: standalone)").matches;
  return ios && !installed;
}

/** Whether the system's notifications can be had here at all. */
export function systemAvailable(): SystemWhy {
  // A page over plain HTTP, not on this computer: no browser allows it.
  if (!window.isSecureContext && location.protocol === "http:") return "notSecure";
  if (typeof window.Notification === "undefined") return phoneBrowser() ? "phone" : "noApi";
  return "ok";
}

function whyText(w: SystemWhy): string {
  const s = notifyStrings();
  return w === "notSecure" ? s.systemNotSecure : w === "phone" ? s.systemPhone : s.systemNoApi;
}

/** At the window's start: on only if it was turned on here and the system
 *  still allows it; a permission taken back since turns it off, said in
 *  the row. */
export async function checkSystem(): Promise<void> {
  wanted = readWanted();
  if (!wanted) return;
  const w = systemAvailable();
  if (w !== "ok") {
    why = whyText(w);
    writeWanted(false);
    return;
  }
  try {
    granted = Boolean(await isPermissionGranted());
  } catch {
    granted = false;
  }
  if (!granted) {
    why = notifyStrings().systemRefused;
    writeWanted(false);
  }
}

/** Whether the system's notifications are on. */
export function systemOn(): boolean {
  return wanted && granted;
}

/** The person turns them on: the permission asked now. The answer, and
 *  what the row says. */
export async function turnSystemOn(): Promise<{ on: boolean; said: string }> {
  const s = notifyStrings();
  const w = systemAvailable();
  const off = (said: string) => {
    why = said;
    granted = false;
    writeWanted(false);
    return { on: false, said };
  };
  if (w !== "ok") return off(whyText(w));
  try {
    if (!(await isPermissionGranted())) {
      const answer = await requestPermission();
      if (answer !== "granted") return off(answer === "denied" ? s.systemRefused : s.systemDismissed);
    }
  } catch (e) {
    return off(s.systemFailed(e instanceof Error ? e.message : String(e)));
  }
  granted = true;
  why = "";
  writeWanted(true);
  return { on: true, said: s.systemOn };
}

export function turnSystemOff(): void {
  why = "";
  writeWanted(false);
}

/** The window in front: visible, and the one the keys go to. */
export function inFront(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

/** `entry` to the system, when on and the window is not in front; a click
 *  on it (where the system tells the page) brings the window to the front
 *  and calls `opened`. Whether it was sent. */
export function systemSend(entry: Entry, opened: (id: string) => void): boolean {
  if (!systemOn() || inFront()) return false;
  try {
    const n = new window.Notification(entry.title, { body: entry.sentence, tag: entry.key });
    if (n && typeof n === "object") {
      n.onclick = () => {
        window.focus();
        void getCurrentWindow()
          .setFocus()
          .catch(() => undefined);
        opened(entry.id);
      };
    }
    return true;
  } catch (e) {
    // The system refused this one: the toast and the list still have it.
    console.warn(`Verso: system notification: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** The settings' row (item 9): the switch, and beside it what the system
 *  answered — why it is off, or that it cannot be had here. */
export function systemControl(): HTMLElement {
  const s = notifyStrings();
  const wrap = h("span", "setting-actions notify-system");
  const l = h("label", "switch");
  const box = h("input");
  box.type = "checkbox";
  box.checked = systemOn();
  l.append(box, h("span", "switch-track"));
  const said = h("span", "setting-value notify-system-said");
  said.setAttribute("role", "status");
  said.setAttribute("aria-live", "polite");
  const w = systemAvailable();
  if (w !== "ok") {
    box.disabled = true;
    said.textContent = whyText(w);
  } else said.textContent = systemOn() ? s.systemOn : why;
  box.addEventListener("change", () => {
    if (!box.checked) {
      turnSystemOff();
      said.textContent = "";
      return;
    }
    box.disabled = true;
    said.textContent = s.systemAsking;
    void turnSystemOn().then((r) => {
      box.disabled = false;
      box.checked = r.on;
      said.textContent = r.said;
    });
  });
  wrap.append(l, said);
  return wrap;
}
