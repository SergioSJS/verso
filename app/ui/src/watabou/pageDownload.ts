// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A file a page embedded in a note downloaded (ADR 0120 item 6, revising
// ADR 0056): the desktop host hands it over as a picked file
// (`page-downloaded`), and the window puts it in the folder beside the
// note or board in front — the import's own way (placePicked: confined,
// never over a file, a name taken moves on). When it is an export of a
// Watabou generator, the import is offered with it. In a browser the page's
// download goes to the browser's Downloads and none of this runs.

import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { importLimitMb } from "../attachName";
import { commands, type PickedFiles } from "../bindings";
import { host } from "../can";
import { placePicked } from "../importFiles";
import { layout } from "../layout/spaces";
import { dirOf } from "../paths";
import { settings } from "../settings";
import { see } from "./detect";
import { showWatabouImport } from "./dialog";

async function arrived(picked: PickedFiles): Promise<void> {
  const leaf = layout().activeLeaf;
  const folder = leaf?.path ? dirOf(leaf.path) : "";
  const made = await placePicked(folder, picked, importLimitMb(settings.importMaxMb, host() === "server"), true);
  // An export of a generator: the import, offered with the file.
  for (const path of made) {
    if (!/\.(json|md)$/i.test(path)) continue;
    const text = await commands.readFileText(path);
    if (text.status !== "ok") continue;
    const name = path.split("/").pop() ?? path;
    const kind = see({ name, text: text.data, size: text.data.length }).kind;
    if (kind === "dungeonJson" || kind === "dungeonMd" || kind === "region") {
      showWatabouImport(folder, [new File([text.data], name, { type: name.endsWith(".md") ? "text/markdown" : "application/json" })]);
      return;
    }
  }
}

/** Listen to the host's word that a page of this window downloaded a file. */
export function installPageDownloads(): void {
  void listen<[string, PickedFiles]>("page-downloaded", (e) => {
    const [label, picked] = e.payload;
    if (label !== getCurrentWindow().label) return;
    void arrived(picked);
  });
}
