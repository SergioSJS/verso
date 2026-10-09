// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The person's settings with the account, on a server (ADR 0073 item 5;
// ADR 0070, the person's layer): the theme, the language, the keys, remote
// content and the approved embed origins — the reader's choice, never the
// note's author's (the maintainer's answer I of 2026-10-09) — follow the
// person to every browser they sign in from. Read into the window's
// storage before the window starts; written back a moment after each
// change.

import { api } from "./api";

const KEY = "verso.settings";

/** The account's settings into this browser, before the window reads them. */
export async function pullSettings(): Promise<void> {
  try {
    const kept = await api<{ settings: string | null }>("GET", "/api/me/settings");
    if (kept.settings) localStorage.setItem(KEY, kept.settings);
  } catch {
    // No storage, or the server could not answer: this browser's own stand.
  }
}

let timer = 0;

/** Each change written back to the account, a moment after the last. */
export function pushSettings(): void {
  addEventListener("verso:settings-saved", () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      let text: string | null = null;
      try {
        text = localStorage.getItem(KEY);
      } catch {
        return;
      }
      if (text) void api("PUT", "/api/me/settings", { settings: text }).catch(() => undefined);
    }, 800);
  });
}
