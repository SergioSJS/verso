// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* The card of files that are only in the cloud (iCloud, OneDrive) and were
 * never synced (ADR 0043, decided 2026-10-27, item a): a button brings them
 * down, on the person's click and through the same step as opening a file
 * (`fetchFile`), one at a time, with progress and a way to stop. It says the
 * size first and refuses to start when the disk cannot hold it. Sync itself
 * never fetches: the files that come down are picked up by the next pass,
 * which this asks for when the run ends. */

import { commands, type SyncRefused } from "../bindings";
import { h } from "../dom";
import { errorSentence } from "../errors";
import { humanSize } from "../format";

export interface DownWords {
  button: (n: number, size: string) => string;
  progress: (done: number, n: number) => string;
  stop: string;
  stopping: string;
  done: (n: number) => string;
  partial: (ok: number, bad: number) => string;
  failedAll: (bad: number) => string;
  stopped: (done: number, n: number) => string;
  noRoom: (need: string, free: string) => string;
  unknownSpace: string;
  oldForm: string;
  unavailable: string;
  skipped: string;
}

/** What a run left to say once it ended; `none` while nothing ran. */
type Outcome = "none" | "done" | "partial" | "failed" | "stopped" | "no_room" | "unknown_space" | "plan_failed";

/** In `failed`: the cloud did not give the content. */
const NO_CONTENT = "";
/** In `failed`: there was nothing to fetch (the file is no longer a
 *  placeholder), so nothing was downloaded. */
const NOTHING = "-";

interface Run {
  active: boolean;
  stop: boolean;
  total: number;
  done: number;
  /** Files that did not come down, by path, with what to say: a sentence
   *  of the core, or [`NO_CONTENT`] or [`NOTHING`] (said in the window's
   *  words). They stay in the card. */
  failed: Map<string, string>;
  outcome: Outcome;
  need: number;
  free: number;
  /** The sentence of an error that stopped the run before it began. */
  message: string;
  /** The size asked for the files listed now, and for which. */
  plan: { signature: string; bytes: number } | null;
  /** Redraws the controls where they are on screen now. */
  paint: (() => void) | null;
  /** Say so on the next paint: the Stop button takes the keyboard. */
  focusStop: boolean;
  /** One live region for the run, kept across redraws, so what it says is
   *  announced when it changes and not each time the section is drawn. */
  live: HTMLElement | null;
}

const runs = new Map<string, Run>();

function runOf(key: string): Run {
  let run = runs.get(key);
  if (!run) {
    run = { active: false, stop: false, total: 0, done: 0, failed: new Map(), outcome: "none", need: 0, free: 0, message: "", plan: null, paint: null, focusStop: false, live: null };
    runs.set(key, run);
  }
  return run;
}

/** The older `.Name.ext.icloud` form: a small file that stands in for the
 *  original, which reading cannot bring down (ADR 0043). */
export function isOldForm(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.startsWith(".") && name.endsWith(".icloud");
}

/** The room to leave on the disk beyond what the files take: a gibibyte,
 *  or a tenth of them when that is more. */
export function marginFor(bytes: number): number {
  return Math.max(1 << 30, bytes / 10);
}

/** Whether `free` bytes hold `bytes` with the margin. Room the system
 *  would not say (`null`) is not known to hold them: refused. */
export function holds(free: number | null, bytes: number): boolean {
  return free !== null && free >= bytes + marginFor(bytes);
}

/** What the row of a file in the card says besides its name, if anything:
 *  why it could not come down, or that it cannot from here. */
export function rowNote(key: string, path: string, w: DownWords): string {
  if (isOldForm(path)) return w.oldForm;
  const why = runs.get(key)?.failed.get(path);
  if (why === undefined) return "";
  return why === NO_CONTENT ? w.unavailable : why === NOTHING ? w.skipped : why;
}

/** The sentence a run that ended leaves. */
function outcomeText(run: Run, w: DownWords): string {
  const bad = run.failed.size;
  switch (run.outcome) {
    case "done":
      return w.done(run.done);
    case "partial":
      return w.partial(run.done, bad);
    case "failed":
      return w.failedAll(bad);
    case "stopped":
      return w.stopped(run.done, run.total);
    case "no_room":
      return w.noRoom(humanSize(run.need + marginFor(run.need)), humanSize(run.free));
    case "unknown_space":
      return w.unknownSpace;
    case "plan_failed":
      return run.message;
    default:
      return "";
  }
}

/** What the live region says now: the progress while it runs, else the
 *  last outcome. */
function sayNow(run: Run, w: DownWords): string {
  return run.active ? w.progress(run.done + run.failed.size, run.total) : outcomeText(run, w);
}

function liveOf(run: Run): HTMLElement {
  if (!run.live) {
    const live = h("p", "sync-item-why sync-live");
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    live.tabIndex = -1;
    run.live = live;
  }
  return run.live;
}

/** The outcome of the last run, said on its own: shown where the card is
 *  not (every file came down), so that a success is not silent. */
export function ranNote(key: string, w: DownWords): HTMLElement | null {
  const run = runs.get(key);
  if (!run || run.active || run.outcome === "none") return null;
  const live = liveOf(run);
  live.textContent = sayNow(run, w);
  return live;
}

async function download(paths: string[], run: Run, again: () => Promise<void>): Promise<void> {
  // Claimed before anything is awaited: a second click finds the run on.
  Object.assign(run, { active: true, stop: false, total: paths.length, done: 0, failed: new Map(), outcome: "none", focusStop: true });
  run.paint?.();
  try {
    const plan = await commands.placeholderPlan(paths);
    if (plan.status !== "ok") {
      Object.assign(run, { outcome: "plan_failed", message: errorSentence(plan.error) });
      return;
    }
    const bytes = plan.data.bytes ?? 0;
    if (plan.data.free === null) {
      run.outcome = "unknown_space";
      return;
    }
    if (!holds(plan.data.free, bytes)) {
      Object.assign(run, { outcome: "no_room", need: bytes, free: plan.data.free });
      return;
    }
    for (const path of paths) {
      if (run.stop) break;
      const r = await commands.fetchFile(path);
      if (r.status !== "ok") run.failed.set(path, r.error.kind === "unavailable" ? NO_CONTENT : errorSentence(r.error));
      // `false`: there was nothing to fetch, so nothing was downloaded.
      else if (!r.data) run.failed.set(path, NOTHING);
      else run.done++;
      run.paint?.();
    }
    if (run.outcome === "none") run.outcome = run.stop ? "stopped" : run.failed.size === 0 ? "done" : run.done === 0 ? "failed" : "partial";
  } finally {
    run.active = false;
    run.paint?.();
  }
  if (run.outcome === "plan_failed" || run.outcome === "unknown_space" || run.outcome === "no_room") return;
  // The files that came down cross on the next pass: asked for now.
  await commands.folderSyncNow();
  await again();
}

/** The card's controls for the placeholders no sync ever sent: the button
 *  with the total size, or the progress and Stop while it runs, and what
 *  the last run came to. */
export function placeholderBlock(key: string, files: SyncRefused[], w: DownWords, refresh: () => Promise<void>): HTMLElement {
  const run = runOf(key);
  // The old form cannot be brought down from here; a file that failed stays
  // listed with its reason and is tried again only by a new click.
  const paths = files.map((f) => f.path).filter((p) => !isOldForm(p));
  const signature = paths.join("\n");
  const box = h("div", "sync-download");
  const live = liveOf(run);
  const controls = h("div", "sync-download-controls");
  box.append(live, controls);
  let shown = "";
  let bar: HTMLProgressElement | null = null;
  const paint = () => {
    const said = sayNow(run, w);
    live.textContent = said;
    live.hidden = said === "";
    const size = run.plan && run.plan.signature === signature ? humanSize(run.plan.bytes) : "";
    const mode = `${run.active}|${run.stop}|${paths.length}|${size}`;
    if (bar) {
      bar.max = Math.max(run.total, 1);
      bar.value = run.done + run.failed.size;
      bar.setAttribute("aria-label", said);
    }
    if (mode === shown) return;
    shown = mode;
    bar = null;
    const parts: HTMLElement[] = [];
    if (run.active) {
      bar = h("progress", "sync-progress");
      bar.max = Math.max(run.total, 1);
      bar.value = run.done + run.failed.size;
      bar.setAttribute("aria-label", said);
      const stop = h("button", "btn", run.stop ? w.stopping : w.stop);
      stop.type = "button";
      stop.disabled = run.stop;
      stop.addEventListener("click", () => {
        run.stop = true;
        run.paint?.();
      });
      parts.push(bar, stop);
      if (run.focusStop) {
        run.focusStop = false;
        queueMicrotask(() => stop.focus());
      }
    } else if (paths.length > 0) {
      const go = h("button", "btn primary", w.button(paths.length, size));
      go.type = "button";
      go.addEventListener("click", () => {
        if (run.active) return;
        go.disabled = true;
        void download(paths, run, refresh).then(() => {
          // The controls are drawn again by now: the keyboard goes to what
          // the run said.
          if (run.live?.isConnected) run.live.focus();
        });
      });
      parts.push(go);
    }
    controls.replaceChildren(...parts);
  };
  run.paint = paint;
  paint();
  // The total is asked for the files listed now, once per list; the button
  // says it as soon as it is known.
  if (!run.active && paths.length > 0 && run.plan?.signature !== signature) {
    void commands.placeholderPlan(paths).then((r) => {
      if (r.status !== "ok" || run.paint !== paint) return;
      run.plan = { signature, bytes: r.data.bytes ?? 0 };
      if (!run.active) paint();
    });
  }
  return box;
}
