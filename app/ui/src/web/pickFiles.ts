// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Import files…" in a browser (A11Y.10): the page's own file picker
// (`<input type=file multiple>`), answering as the desktop host's
// `pick_files` does — each file's name and bytes. The files then go up
// through `create_file`, the web window's one upload path, under the
// server's bounds and the folder's quota (ADR 0083).

import type { PickedFiles, PickSkip } from "../bindings";
import { MAX_IMAGE_BYTES, SERVER_FILE_MB } from "../attachName";

/** The most bytes of the whole choice, as the host's. */
const TOTAL_MAX = 256 * 1024 * 1024;

function base64Of(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Read the chosen files; one too large, or the rest past the total, is
 *  named in `skipped`. Pure of the page, so a test can give it files. */
export async function readChosen(chosen: File[], limitMb = SERVER_FILE_MB): Promise<PickedFiles> {
  // Whatever limit is asked, a message to the server carries no more.
  const limit = Math.min(limitMb * 1024 * 1024, MAX_IMAGE_BYTES);
  const out: PickedFiles = { files: [], skipped: [] };
  let total = 0;
  for (const f of chosen) {
    let reason: PickSkip | null = null;
    if (f.size > limit || total + f.size > TOTAL_MAX) reason = "too_large";
    else {
      try {
        out.files.push({ name: f.name, base64: base64Of(await f.arrayBuffer()), token: null });
        total += f.size;
      } catch {
        reason = "unreadable";
      }
    }
    if (reason) out.skipped.push({ name: f.name, reason });
  }
  return out;
}

/** Open the browser's file picker; empty when cancelled. Called from the
 *  gesture that asked (a menu row, a palette command), as browsers require. */
export function pickFiles(limitMb = SERVER_FILE_MB): Promise<PickedFiles> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.hidden = true;
    let settled = false;
    const finish = (chosen: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      void readChosen(chosen, limitMb).then(resolve);
    };
    input.addEventListener("change", () => finish([...(input.files ?? [])]));
    input.addEventListener("cancel", () => finish([]));
    document.body.append(input);
    input.click();
  });
}
