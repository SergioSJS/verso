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
  oldForm: string;
  unavailable: string;
}

/** What a run left to say once it ended; `none` while nothing ran. */
type Outcome = "none" | "done" | "partial" | "failed" | "stopped" | "no_room";

interface Run {
  active: boolean;
  stop: boolean;
  total: number;
  done: number;
  /** Files that could not come down, by path, with what to say; empty is
   *  the cloud not giving the content (said in the window's words). */
  failed: Map<string, string>;
  outcome: Outcome;
  need: number;
  free: number;
  /** The size asked for the files listed now, and for which. */
  plan: { signature: string; bytes: number } | null;
  /** Redraws the control area where it is on screen now. */
  paint: (() => void) | null;
}

const runs = new Map<string, Run>();

function runOf(key: string): Run {
  let run = runs.get(key);
  if (!run) {
    run = { active: false, stop: false, total: 0, done: 0, failed: new Map(), outcome: "none", need: 0, free: 0, plan: null, paint: null };
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

/** The room to leave on the disk beyond what the files take: a gigabyte,
 *  or a tenth of them when that is more. */
export function marginFor(bytes: number): number {
  return Math.max(1 << 30, bytes / 10);
}

/** Whether `free` bytes hold `bytes` with the margin; an unknown amount
 *  of room (`null`) is not a refusal. */
export function holds(free: number | null, bytes: number): boolean {
  return free === null || free >= bytes + marginFor(bytes);
}

/** What the row of a file in the card says besides its name, if anything:
 *  why it could not come down, or that it cannot from here. */
export function rowNote(key: string, path: string, w: DownWords): string {
  if (isOldForm(path)) return w.oldForm;
  const why = runs.get(key)?.failed.get(path);
  return why === "" ? w.unavailable : (why ?? "");
}

/** The sentence a run that ended leaves, for the card or, when the card is
 *  gone because every file came down, for the section. */
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
    default:
      return "";
  }
}

/** The outcome of the last run, said on its own: shown where the card is
 *  not (every file came down), so that a success is not silent. */
export function ranNote(key: string, w: DownWords): HTMLElement | null {
  const run = runs.get(key);
  if (!run || run.active || run.outcome === "none") return null;
  const p = h("p", "sync-calm", outcomeText(run, w));
  p.setAttribute("role", "status");
  return p;
}

async function download(key: string, paths: string[], run: Run, again: () => Promise<void>): Promise<void> {
  const plan = await commands.placeholderPlan(paths);
  if (plan.status !== "ok") {
    run.outcome = "failed";
    run.failed = new Map(paths.map((p) => [p, errorSentence(plan.error)]));
    run.paint?.();
    return;
  }
  const bytes = plan.data.bytes ?? 0;
  if (!holds(plan.data.free, bytes)) {
    Object.assign(run, { outcome: "no_room", need: bytes, free: plan.data.free ?? 0 });
    run.paint?.();
    return;
  }
  Object.assign(run, { active: true, stop: false, total: paths.length, done: 0, failed: new Map(), outcome: "none" });
  run.paint?.();
  // The button that was clicked is gone: Stop takes the keyboard's place.
  document.querySelector<HTMLElement>(".sync-download button")?.focus();
  for (const path of paths) {
    if (run.stop) break;
    const r = await commands.fetchFile(path);
    // `false`: it is no longer a placeholder, the content is here.
    if (r.status === "ok") run.done++;
    else run.failed.set(path, r.error.kind === "unavailable" ? "" : errorSentence(r.error));
    run.paint?.();
  }
  run.active = false;
  run.outcome = run.stop ? "stopped" : run.failed.size === 0 ? "done" : run.done === 0 ? "failed" : "partial";
  run.paint?.();
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
  const paint = () => {
    const parts: HTMLElement[] = [];
    if (run.active) {
      const line = h("p", "sync-item-why", w.progress(run.done + run.failed.size, run.total));
      line.setAttribute("role", "status");
      line.setAttribute("aria-live", "polite");
      line.setAttribute("aria-atomic", "true");
      const bar = h("progress", "sync-progress");
      bar.max = Math.max(run.total, 1);
      bar.value = run.done + run.failed.size;
      bar.setAttribute("aria-label", w.progress(run.done + run.failed.size, run.total));
      const stop = h("button", "btn", run.stop ? w.stopping : w.stop);
      stop.type = "button";
      stop.disabled = run.stop;
      stop.addEventListener("click", () => {
        run.stop = true;
        run.paint?.();
      });
      parts.push(line, bar, stop);
    } else {
      if (run.outcome !== "none") {
        const said = h("p", "sync-item-why", outcomeText(run, w));
        said.setAttribute("role", run.outcome === "done" ? "status" : "alert");
        parts.push(said);
      }
      if (paths.length > 0) {
        const size = run.plan && run.plan.signature === signature ? humanSize(run.plan.bytes) : "";
        const go = h("button", "btn primary", w.button(paths.length, size));
        go.type = "button";
        go.addEventListener("click", () => {
          void download(key, paths, run, refresh);
        });
        parts.push(go);
      }
    }
    box.replaceChildren(...parts);
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
