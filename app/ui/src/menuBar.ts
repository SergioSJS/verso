// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The native menu bar's side of the window (macOS; the host builds the bar,
// `app/src-tauri/src/menu_spec.rs`). Every item that is not the host's own
// names a command of the registry (`allCommands`, keys.ts): a click runs
// the palette's command, so nothing is written twice. The window tells the
// host three things: which features are on and the keys bound (the bar is
// rebuilt), and which commands can run just now (items greyed in place).

import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { commands } from "./bindings";
import { currentFeatures } from "./capabilities";
import { dialogUp } from "./dialogs/a11y";
import { ui } from "./dom";
import { FEATURE_IDS } from "./featureList";
import { allCommands, keyOf } from "./keys";
import { menuKeys } from "./menuKeys";
import { pt, t } from "./strings";

const words = t === pt ? { unavailable: "Esse comando não vale aqui agora." } : { unavailable: "That command does not apply here right now." };

/** The features that are on and the keys of the commands, to the host. */
export function pushMenuCommands(): void {
  const on = currentFeatures();
  const features = FEATURE_IDS.filter((id) => on[id]);
  void commands.setMenuCommands(features, menuKeys(allCommands(true), keyOf)).catch(() => undefined);
}

/** The ids of the commands that can run now, to the host. */
export function pushMenuEnabled(): void {
  void commands.setMenuEnabled(allCommands().map((c) => c.id)).catch(() => undefined);
}

/** A menu item was chosen: the command the palette would run. */
export function runMenuCommand(id: string): void {
  const command = allCommands().find((c) => c.id === id);
  if (command) command.run();
  else ui.status.textContent = words.unavailable;
}

let timer = 0;
/** Both pushes, once for a burst of changes. */
function later(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    pushMenuCommands();
    pushMenuEnabled();
  }, 60);
}

/** Wire the window to the bar: the host's clicks in, the window's state out. */
export function installMenuBar(): void {
  void listen<[string, string]>("menu-command", (e) => {
    if (e.payload[0] !== getCurrentWindow().label) return;
    // A question on screen is answered first: nothing runs behind it.
    if (dialogUp()) return;
    runMenuCommand(e.payload[1]);
  });
  window.addEventListener("verso:features-changed", later);
  window.addEventListener("verso:keys-painted", later);
  window.addEventListener("verso:leaf-active", later);
  // The bar is the app's, the state is a window's: the one in front speaks.
  window.addEventListener("focus", later);
  later();
}
