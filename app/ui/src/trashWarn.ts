// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The warning before a deletion that alone passes the server's size cap
// for a bin (ADR 0080, amended 2026-11-01): the bin keeps such an entry a
// day at least, then lets it go for good, so the person is told when they
// confirm. The cap comes in the capabilities; the size is the one the
// window already knows of the files under the paths.

import { trashCapNow } from "./can";
import { allEntries } from "./folder";
import { humanSize } from "./format";
import { LANG } from "./strings";

const words = {
  pt: (size: string, cap: string) => `Atenção: isto tem ${size}, mais que o limite da lixeira do servidor (${cap}). Ficará na lixeira por 1 dia e depois sairá de vez, sem poder ser restaurado.`,
  en: (size: string, cap: string) => `Warning: this holds ${size}, more than the server's trash limit (${cap}). It stays in the trash for 1 day, then is removed for good and cannot be restored.`,
};

/** The bytes of the files under `paths`, as the window last saw the folder. */
export function bytesUnder(paths: string[]): number {
  let n = 0;
  for (const e of allEntries.values()) {
    if (e.kind === "folder") continue;
    if (paths.some((p) => e.path === p || e.path.startsWith(`${p}/`))) n += e.size ?? 0;
  }
  return n;
}

/** What to add to the question of a deletion: empty unless the paths alone
 *  pass the bin's cap. */
export function binWarning(paths: string[]): string {
  const cap = trashCapNow();
  if (cap === null) return "";
  const size = bytesUnder(paths);
  if (size <= cap) return "";
  return words[LANG.toLowerCase().startsWith("pt") ? "pt" : "en"](humanSize(size), humanSize(cap));
}
