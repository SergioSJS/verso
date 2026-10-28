// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* The make.md focuses file when it is only in the cloud (ADR 0043, decided
 * 2026-10-27): the app never brings it down by itself; the person's click on
 * "Download now" does, through the same step as opening a file. Afterwards
 * the focuses are read again. A failure is said, never swallowed. No window
 * state in here: the caller hands in what it does, so this runs headless. */

export const WAYPOINTS_PATH = ".space/waypoints.json";

export type DownloadOutcome = "downloaded" | "nothing" | "failed";

interface FetchResult {
  status: "ok" | "error";
  data?: boolean;
  error?: unknown;
}

export interface DownloadDeps {
  fetchFile: (path: string) => Promise<FetchResult>;
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

export async function downloadFocusesFile(deps: DownloadDeps): Promise<DownloadOutcome> {
  deps.say(deps.words.fetching);
  let r: FetchResult;
  try {
    r = await deps.fetchFile(WAYPOINTS_PATH);
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
