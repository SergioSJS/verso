// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* The make.md focuses file when it is only in the cloud (ADR 0043, decided
 * 2026-10-27): the app never brings it down by itself; the person's click on
 * "Download now" does, through the same step as opening a file. Afterwards
 * the focuses are read again. A failure is said, never swallowed. No window
 * state in here: the caller hands in what it does, so this runs headless. */

export type DownloadOutcome = "downloaded" | "nothing" | "failed";

interface FetchResult {
  status: "ok" | "error";
  data?: boolean;
  error?: unknown;
}

export interface DownloadDeps {
  /** The one command that fetches the focuses file; it names no path (a
   *  hidden entry never crosses the contract, ADR 0026). */
  fetchFile: () => Promise<FetchResult>;
  /** Read the focuses again from the core; true when they still report the
   *  file as only in the cloud (a server-synced folder answers "nothing to
   *  fetch" whatever the file is). */
  reload: () => Promise<boolean>;
  /** Say it in the status line. */
  say: (text: string) => void;
  /** Say an error the way the window says any (a connection that failed). */
  fail: (error: unknown) => void;
  /** Whether the error is the cloud not giving the file (not a lost link). */
  isCloudFailure: (error: unknown) => boolean;
  words: { fetching: string; done: string; nothing: string; failed: string };
}

/** After a download that brought the file down: the person is asked once
 *  whether the folder keeps its focuses the same as make.md's (ADR 0062 D5)
 *  when the file is in the known format, sync is not on and they never
 *  answered. An answer of "no" is kept (asked is true) and not asked again. */
export function askSyncAfterDownload(s: { outcome: DownloadOutcome; hasFile: boolean; formatKnown: boolean; syncOn: boolean; asked: boolean }): boolean {
  return s.outcome === "downloaded" && s.hasFile && s.formatKnown && !s.syncOn && !s.asked;
}

export async function downloadFocusesFile(deps: DownloadDeps): Promise<DownloadOutcome> {
  deps.say(deps.words.fetching);
  let r: FetchResult;
  try {
    r = await deps.fetchFile();
  } catch (e) {
    deps.say(deps.words.failed);
    deps.fail(e);
    return "failed";
  }
  if (r.status !== "ok") {
    if (deps.isCloudFailure(r.error)) deps.say(deps.words.failed);
    else deps.fail(r.error);
    return "failed";
  }
  const stillCloud = await deps.reload();
  if (stillCloud) {
    deps.say(deps.words.failed);
    return "failed";
  }
  deps.say(r.data ? deps.words.done : deps.words.nothing);
  return r.data ? "downloaded" : "nothing";
}

/** A flag that belongs to one folder: read for another folder, it is false (the banner of a failed download
 *  must not follow the person to a folder where nothing was tried). */
export function folderFlag(): { set(folder: string, value: boolean): void; get(folder: string): boolean } {
  let folder: string | null = null;
  let on = false;
  return {
    set(f, value) {
      folder = f;
      on = value;
    },
    get: (f) => on && folder === f,
  };
}
