// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands, type ContractError } from "./bindings";
import { ui } from "./dom";
import { isTransport } from "./errorKinds";
import { fail } from "./errors";
import { allEntries } from "./folder";
import { name } from "./paths";
import { t } from "./strings";

/* Opening a file is the user asking for it (ADR 0043, amended on
 * 2026-09-30): a file whose content is only in iCloud is brought down
 * first, the status line saying so, and read again. The index, the
 * watcher and a scan of every note read through `commands` and never
 * download anything. */
export async function fetchFirst(path: string): Promise<boolean> {
  const said = t.fetching(name(path));
  const was = ui.status.textContent;
  const timer = window.setTimeout(() => (ui.status.textContent = said), 150);
  const r = await commands.fetchFile(path);
  window.clearTimeout(timer);
  if (r.status !== "ok") {
    // iCloud's failure is said as one; any other is said as what it is.
    if (r.error.kind === "unavailable" && !isTransport(r.error)) ui.status.textContent = t.fetchFailed(name(path));
    else fail(r.error);
    return false;
  }
  if (ui.status.textContent === said) ui.status.textContent = was === said ? "" : was;
  return r.data;
}
/** Any action the user takes on a file brings it down first (the
 *  maintainer, 2026-11-11: "qualquer interação que um arquivo receba, ele
 *  deveria baixar esse arquivo"): moving, renaming, deleting. Only the
 *  entries the listing says are placeholders are asked for, so a folder
 *  with no file in the cloud (and the web, which has none) asks nothing;
 *  a folder itself moves whole with what is inside it (ADR 0048). Answers
 *  false, with the status saying which, when one could not come down. */
export async function fetchAll(paths: string[]): Promise<boolean> {
  const cloud = paths.filter((p) => allEntries.get(p)?.kind === "placeholder");
  if (cloud.length === 0) return true;
  if (cloud.length === 1) {
    const r = await commands.fetchFile(cloud[0]!);
    if (r.status === "ok") return true;
    if (r.error.kind === "unavailable" && !isTransport(r.error)) ui.status.textContent = t.fetchFailed(name(cloud[0]!));
    else fail(r.error);
    return false;
  }
  const said = t.fetchingMany(cloud.length);
  const timer = window.setTimeout(() => (ui.status.textContent = said), 150);
  const answers = await Promise.all(cloud.map(async (p) => ({ p, r: await commands.fetchFile(p) })));
  window.clearTimeout(timer);
  const failed = answers.filter((a) => a.r.status !== "ok").map((a) => name(a.p));
  if (failed.length > 0) {
    ui.status.textContent = t.fetchFailed(failed.join(", "));
    return false;
  }
  if (ui.status.textContent === said) ui.status.textContent = "";
  return true;
}
/** The paths of the tabs a workspace is bringing back, for as long as it
 *  does: a tab of one of them, not in front of its pane, reads without
 *  downloading from iCloud (decided on 2026-10-01, review `board.md` §6
 *  item 8), and comes down when it is shown. Per tab, not per path: the
 *  same note in two panes is quiet where it is behind (second reading,
 *  finding 5). */
export const quietPaths = new Set<string>();
export async function fetched<T extends { status: "ok" } | { status: "error"; error: ContractError }>(path: string, read: () => Promise<T>, quiet = false): Promise<T> {
  const r = await read();
  if (r.status !== "error" || r.error.kind !== "unavailable" || quiet) return r;
  // The connection failed, not a file in the cloud: nothing to download.
  if (isTransport(r.error)) return r;
  return (await fetchFirst(path)) ? read() : r;
}
export const opening = {
  readNote: (path: string, quiet = false) => fetched(path, () => commands.readNote(path), quiet),
  readText: (path: string, quiet = false) => fetched(path, () => commands.readText(path), quiet),
};
