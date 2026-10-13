// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands } from "./bindings";
import { flushed, recheckAll } from "./changes";
import { asDialog, closed, opened } from "./dialogs/a11y";
import { diffNode } from "./diff";
import { button, h, ui } from "./dom";
import { fail } from "./errors";
import { leavesOf, liveHolder } from "./layout/spaces";
import { roomSide } from "./collab";
import { writeLive } from "./roomWrites";
import { writeBoardLive } from "./leaves/boardLive";
import { name } from "./paths";
import { replay } from "./replay";
import { t } from "./strings";

type Rewrite = { path: string; revision: string; before: string; after: string };

/** A rewrite of a file live in its room, made there: `room`, `refused`
 *  (the room's text moved on since the plan read it: shown as changed,
 *  with the way to try again), or `disk` (in no room: written as before). */
async function rewriteLive(w: Rewrite): Promise<"room" | "refused" | "disk"> {
  if (/\.canvas$/i.test(w.path)) return (await writeBoardLive(w.path, w.before, w.after)) ? "room" : "disk";
  const read = w.before.replace(/\r\n/g, "\n");
  const through = await writeLive(w.path, liveHolder(w.path), (now) => (now === read ? w.after : null), roomSide);
  return through === "disk" ? "disk" : through === "refused" ? "refused" : "room";
}

export class Plan {
  readonly el = h("div", "plan");
  private rewrites: Rewrite[] = [];
  /** What the last apply could not write, said until dismissed or tried
   *  again: the status line is one line, cut short, and the next status
   *  replaces it. */
  private notice: HTMLElement | null = null;
  /** The answer a `confirm` waits for, and the write it asked for instead
   *  of the plan's own. */
  private answer: ((applied: boolean) => void) | null = null;
  private custom: (() => Promise<boolean>) | null = null;
  constructor() {
    this.el.hidden = true;
    asDialog(this.el, "", () => this.hide(), "plan-title");
    document.body.append(this.el);
  }
  /** `detail`: what the plan was drawn from, said under the title. */
  show(rewrites: Plan["rewrites"], title = t.planTitle(rewrites.length), applyLabel = t.planApply, detail = ""): void {
    this.rewrites = rewrites;
    const box = h("div", "plan-box");
    const heading = h("h2", "", title);
    heading.id = "plan-title";
    box.append(heading);
    if (detail) box.append(h("p", "replace-note", detail));
    for (const w of rewrites) {
      const d = h("details");
      d.open = rewrites.length <= 3;
      d.append(h("summary", "", w.path), diffNode(w.before, w.after, true));
      box.append(d);
    }
    const apply = button("save", applyLabel);
    apply.addEventListener("click", () => void this.apply());
    const skip = button("ghost", t.planSkip);
    skip.addEventListener("click", () => this.hide());
    const actions = h("div", "conflict-actions");
    actions.append(apply, skip);
    box.append(actions);
    opened(this.el);
    this.el.replaceChildren(box);
    this.el.hidden = false;
    apply.focus();
  }
  /** Show the plan and wait: true when it was applied in full. `onApply`
   *  writes instead of the plan's own writes (a file to create). */
  confirm(rewrites: Plan["rewrites"], title: string, applyLabel: string, detail = "", onApply?: () => Promise<boolean>): Promise<boolean> {
    this.settle(false);
    this.show(rewrites, title, applyLabel, detail);
    this.custom = onApply ?? null;
    return new Promise<boolean>((resolve) => (this.answer = resolve));
  }
  private settle(applied: boolean): void {
    const answer = this.answer;
    this.answer = null;
    this.custom = null;
    answer?.(applied);
  }
  hide(): void {
    this.el.hidden = true;
    closed(this.el);
    this.settle(false);
  }
  private async apply(): Promise<void> {
    if (this.custom) {
      const done = await this.custom();
      this.custom = null;
      const answer = this.answer;
      this.answer = null;
      this.hide();
      answer?.(done);
      return;
    }
    let ok = 0;
    let failed = 0;
    // Not written because the file changed since the plan (invariant 11),
    // and left out because a tab of it could not be saved first: both
    // named in the notice, with a way to try again over the disk's text.
    const changed: Rewrite[] = [];
    const left: Rewrite[] = [];
    for (const w of this.rewrites) {
      // A tab of this note saves first; one that cannot is left out, named.
      if ((await flushed(leavesOf(w.path))).length > 0) {
        left.push(w);
        continue;
      }
      // A file live in its room — this window's tab, or someone else's —
      // takes the rewrite there, as an edit, never under the room (ADR 0082
      // item 12): a text when it still reads as the plan read it, a board
      // as the elements the rewrite changes.
      const through = await rewriteLive(w);
      if (through === "room") {
        ok++;
        continue;
      }
      if (through === "refused") {
        failed++;
        changed.push(w);
        continue;
      }
      // `writeText`: a note goes through `write_note`, a board is indexed
      // as it is written (a canvas's file nodes follow a rename too).
      const r = await commands.writeText(w.path, w.after, w.revision);
      if (r.status === "ok") {
        ok++;
        for (const l of leavesOf(w.path)) if (!l.dirty) void l.load(w.path, true);
      } else {
        failed++;
        if (r.error.kind === "changed") changed.push(w);
        else fail(r.error);
      }
    }
    // The other open notes look their links up again: a note renamed has
    // its backlinks only once the notes that point at it are rewritten.
    if (ok > 0) void recheckAll(new Set(this.rewrites.map((w) => w.path)));
    const answer = this.answer;
    this.answer = null;
    this.hide();
    answer?.(failed === 0 && left.length === 0);
    ui.status.textContent = t.planDone(ok, failed + left.length);
    const said: string[] = [];
    if (changed.length > 0) said.push(t.planNotWritten(changed.map((w) => name(w.path)).join(", "), changed.length));
    if (left.length > 0) said.push(t.planLeftOutNamed(left.map((w) => name(w.path)).join(", "), left.length));
    if (said.length > 0) this.tell(said, [...changed, ...left]);
  }
  /** The notice: what was not written, by name, and "Try again" for
   *  `again` (none: only the words). Not modal; it stays until closed or
   *  tried again. */
  private tell(said: string[], again: Rewrite[]): void {
    this.dismiss();
    const box = h("div", "verso-update-banner plan-notice");
    box.setAttribute("role", "status");
    const words = h("div", "plan-notice-words");
    for (const line of said) words.append(h("p", "", line));
    const actions = h("div", "verso-update-banner-actions");
    if (again.length > 0) {
      const retry = button("save", t.tryAgain);
      retry.addEventListener("click", () => void this.retry(again));
      actions.append(retry);
    }
    const close = button("ghost", t.done);
    close.addEventListener("click", () => this.dismiss());
    actions.append(close);
    box.append(words, actions);
    document.body.append(box);
    this.notice = box;
  }
  private dismiss(): void {
    this.notice?.remove();
    this.notice = null;
  }
  /** Try again: each note read as it is now, the same change made over
   *  it line by line (`replay`), and shown as a plan to apply — never
   *  written unseen (invariant 8). A note whose changed lines changed too
   *  is named, for a person to fix. */
  private async retry(items: Rewrite[]): Promise<void> {
    this.dismiss();
    const again: Rewrite[] = [];
    const stuck: string[] = [];
    for (const w of items) {
      const now = await commands.readText(w.path);
      const after = now.status === "ok" ? replay(w.before, w.after, now.data.text) : null;
      if (now.status !== "ok" || after === null) stuck.push(name(w.path));
      else if (after !== now.data.text) again.push({ path: w.path, revision: now.data.revision, before: now.data.text, after });
    }
    const cannot = stuck.length > 0 ? t.planCannotRetry(stuck.join(", "), stuck.length) : "";
    if (again.length > 0) this.show(again, t.planRetryTitle(again.length), t.applyChanges, cannot);
    else if (cannot) this.tell([cannot], []);
    else ui.status.textContent = t.planRetryNothing;
  }
}
