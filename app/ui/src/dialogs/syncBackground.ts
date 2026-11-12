// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* ---------- Background sync on a phone ----------
 * ADR 0118 item 6.3 (in v1 since 2026-11-12): an option of Settings › Sync
 * on a phone, off by default. On, a folder's sync goes on with Verso off
 * screen, kept alive by Android's persistent notification; Wi-Fi only and
 * charging only hold it until they are met. The window keeps the choice
 * with its settings and tells the host at each start and when it changes
 * (src-tauri src/background.rs). */

import { commands } from "../bindings";
import { host } from "../can";
import { h } from "../dom";
import { fail } from "../errors";
import { saveSettings, settings } from "../settings";
import { LANG } from "../strings";

export type BackgroundSync = { on: boolean; wifiOnly: boolean; chargingOnly: boolean };

const pt = {
  title: "Sincronizar em segundo plano",
  desc: "Com o Verso fechado, as pastas que sincronizam continuam sincronizando. O Android mostra uma notificação enquanto isso, e o celular gasta mais bateria.",
  wifiOnly: "Só no Wi-Fi",
  chargingOnly: "Só carregando",
};
const en: typeof pt = {
  title: "Sync in the background",
  desc: "With Verso closed, the folders that sync keep syncing. Android shows a notification meanwhile, and the phone uses more battery.",
  wifiOnly: "Wi-Fi only",
  chargingOnly: "Only while charging",
};
const words = (): typeof pt => (LANG.toLowerCase().startsWith("pt") ? pt : en);

/** The choice as kept, off by default. */
export function backgroundSync(): BackgroundSync {
  const kept = (settings as { backgroundSync?: Partial<BackgroundSync> }).backgroundSync;
  return { on: kept?.on === true, wifiOnly: kept?.wifiOnly === true, chargingOnly: kept?.chargingOnly === true };
}

/** The host told the choice: at the start of a phone's window, and when it changes. */
export async function pushBackgroundSync(): Promise<void> {
  if (host() !== "mobile") return;
  const b = backgroundSync();
  const r = await commands.setBackgroundSync(b.on, b.wifiOnly, b.chargingOnly);
  if (r.status !== "ok") fail(r.error);
}

function keep(next: BackgroundSync): void {
  (settings as { backgroundSync?: BackgroundSync }).backgroundSync = next;
  saveSettings();
  void pushBackgroundSync();
}

/** The option's row in Settings › Sync, a phone's only. */
export function backgroundRow(item: (title: string, desc: string, control: HTMLElement | null) => HTMLElement): HTMLElement {
  const w = words();
  const b = backgroundSync();
  const box = (label: string, checked: boolean, change: (v: boolean) => void): { row: HTMLLabelElement; input: HTMLInputElement } => {
    const row = h("label", "sync-condition");
    const input = h("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => change(input.checked));
    row.append(input, document.createTextNode(` ${label}`));
    return { row, input };
  };
  const wifi = box(w.wifiOnly, b.wifiOnly, (v) => keep({ ...backgroundSync(), wifiOnly: v }));
  const charging = box(w.chargingOnly, b.chargingOnly, (v) => keep({ ...backgroundSync(), chargingOnly: v }));
  const conditions = h("div", "sync-conditions");
  conditions.append(wifi.row, charging.row);
  const paintOn = (on: boolean) => {
    wifi.input.disabled = !on;
    charging.input.disabled = !on;
  };
  const toggle = h("label", "switch");
  const on = h("input");
  on.type = "checkbox";
  on.checked = b.on;
  on.setAttribute("aria-label", w.title);
  on.addEventListener("change", () => {
    paintOn(on.checked);
    keep({ ...backgroundSync(), on: on.checked });
  });
  toggle.append(on, h("span", "switch-track"));
  paintOn(b.on);
  const row = item(w.title, w.desc, toggle);
  row.classList.add("sync-background");
  row.append(conditions);
  return row;
}
