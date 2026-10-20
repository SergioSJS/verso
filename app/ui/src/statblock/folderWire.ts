// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The store's folder (ADR 0099 item 2): the window's folder data wrapper
// (`folderData.ts`, the contract's four commands) given to `attachFolder`
// when a folder is shown, and its changes — this window's writes, another
// window's, sync's — read again.

import { listData, onFolderData, readData, removeData, writeData } from "../folderData";
import { attachFolder, type FolderDataApi } from "./store";

let run: (() => void) | null = null;
let listening = false;

/** The wrapper as the store's interface. `onFolderData` cannot be stopped,
 *  so it is listened to once and calls whichever store attached last. */
export function folderLayoutsApi(): FolderDataApi {
  return {
    list: (kind) => listData(kind),
    read: (kind, id) => readData(kind, id),
    write: async (kind, id, value, revision) => ({ revision: await writeData(kind, id, value, revision) }),
    remove: (kind, id, revision) => removeData(kind, id, revision),
    onChange: (kind, f) => {
      if (!listening) {
        listening = true;
        onFolderData(kind, () => run?.());
      }
      run = f;
      return () => {
        if (run === f) run = null;
      };
    },
  };
}

/** The folder's layouts read now (a folder was opened or switched). */
export function attachFolderLayouts(): Promise<void> {
  return attachFolder(folderLayoutsApi());
}

/** Read the folder's layouts each time a folder is shown. */
export function wireFolderLayouts(): void {
  addEventListener("verso:folder-shown", () => void attachFolderLayouts());
}
