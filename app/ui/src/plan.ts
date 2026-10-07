// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands } from "./bindings";
import { flushed, recheckAll } from "./changes";
import { asDialog, closed, opened } from "./dialogs/a11y";
import { diffNode } from "./diff";
import { button, h, ui } from "./dom";
import { leavesOf } from "./layout/spaces";
import { name } from "./paths";
import { t } from "./strings";

export class Plan {
  readonly el = h("div", "plan");
  private rewrites: { path: string; revision: string; before: string; after: string }[] = [];
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
    const left: string[] = [];
    for (const w of this.rewrites) {
      // A tab of this note saves first; one that cannot is left out, named.
      if ((await flushed(leavesOf(w.path))).length > 0) {
        left.push(name(w.path));
        continue;
      }
      // `writeText`: a note goes through `write_note`, a board is indexed
      // as it is written (a canvas's file nodes follow a rename too).
      const r = await commands.writeText(w.path, w.after, w.revision);
      if (r.status === "ok") {
        ok++;
        for (const l of leavesOf(w.path)) if (!l.dirty) void l.load(w.path, true);
      } else failed++;
    }
    // The other open notes look their links up again: a note renamed has
    // its backlinks only once the notes that point at it are rewritten.
    if (ok > 0) void recheckAll(new Set(this.rewrites.map((w) => w.path)));
    const answer = this.answer;
    this.answer = null;
    this.hide();
    answer?.(failed === 0 && left.length === 0);
    ui.status.textContent = t.planDone(ok, failed) + (left.length > 0 ? ` ${t.planLeftOut} ${left.join(", ")}.` : "");
  }
}
