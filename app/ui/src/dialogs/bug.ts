// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands } from "../bindings";
import { button, h, ui } from "../dom";
import { currentFolder } from "../folder";
import { icon } from "../icons";
import { layout } from "../layout/spaces";
import { NoteLeaf } from "../leaves/note";
import { localStamp } from "../clock";
import { swallowed } from "../report";
import { settings } from "../settings";
import { t } from "../strings";
import { asDialog, closed, opened } from "./a11y";
import { focusOnOpen } from "../screen/openFocus";

/* The bug report: what the window knows about itself and what it
 * swallowed, gathered into one field the user reads and edits before it
 * goes anywhere. Nothing is sent: the button copies, and the log it
 * quotes is the app's own file, on this machine. */
export class BugDialog {
  readonly el = h("div", "quick");
  constructor() {
    this.el.hidden = true;
    asDialog(this.el, t.reportBug, () => this.hide());
    document.body.append(this.el);
    this.el.addEventListener("mousedown", (e) => { if (e.target === this.el) this.hide(); });
  }
  hide(): void {
    this.el.hidden = true;
    closed(this.el);
  }
  /** Everything but the user's own words, which go at the top. */
  private async context(): Promise<string> {
    const info = await commands.appInfo();
    const build = info.status === "ok" ? `${info.data.version} (${info.data.commit})` : "?";
    const read = await commands.logRead();
    const log = read.status === "ok" ? read.data : "";
    const leaf = layout().activeLeaf;
    const where = leaf ? `${leaf.kind}${leaf instanceof NoteLeaf ? ` (${leaf.mode})` : ""}` : "—";
    const onOff = (v: boolean) => (v ? "on" : "off");
    const seen = swallowed();
    const errors = seen.length === 0
      ? t.reportNoErrors
      : seen.map((e) => `${e.at} ${e.level} ${e.text}`).join("\n");
    return [
      `## ${t.reportContext}`,
      "",
      `- Verso ${build} · ${navigator.platform} · ${settings.lang}`,
      // The computer's time and zone, once: the session's errors are on
      // this clock, the log's lines in UTC — the reader converts.
      `- ${t.reportClock.replace("{now}", localStamp(new Date()))}`,
      `- folder: ${currentFolder === "" ? "—" : "ok"} · tab: ${where}`,
      `- remote ${onOff(settings.remoteContent)} · build dirs ${onOff(settings.ignoreBuildDirs)} · gitignore ${onOff(settings.respectGitignore)} · embeds ${settings.embedOrigins.length}`,
      "",
      `## ${t.reportErrors}`,
      "",
      errors,
      "",
      `## ${t.reportLog}`,
      "",
      log,
    ].join("\n");
  }
  show(): void {
    opened(this.el);
    const box = h("div", "plan-box replace-box");
    const header = h("div", "replace-header");
    const titleGroup = h("div", "replace-title-group");
    titleGroup.append(icon("bug"), h("h2", "", t.reportBug));
    const closeBtn = button("ghost iconic close-btn", t.close, "close");
    closeBtn.addEventListener("click", () => this.hide());
    header.append(titleGroup, closeBtn);
    const hint = h("p", "settings-hint", t.reportHint);
    const field = h("textarea", "report-text") as unknown as HTMLTextAreaElement;
    field.spellcheck = false;
    field.setAttribute("aria-label", t.reportBug);
    const head = `## ${t.reportWhat}\n\n`;
    field.value = `${head}${t.reportHere}\n\n`;
    const actions = h("div", "confirm-actions");
    const copy = button("save", t.copyText);
    copy.addEventListener("click", () => {
      void navigator.clipboard.writeText(field.value).then(() => {
        ui.status.textContent = t.copiedText;
        this.hide();
      });
    });
    actions.append(copy);
    box.append(header, hint, field, actions);
    this.el.replaceChildren(box);
    this.el.hidden = false;
    // The dot is answered: what was swallowed is on the screen now.
    ui.reportBug.classList.remove("has-news");
    if (focusOnOpen(field)) field.setSelectionRange(head.length, head.length + t.reportHere.length);
    // The context joins as soon as the host answers, under the cursor.
    void this.context().then((rest) => {
      if (this.el.hidden) return;
      const at = field.selectionStart;
      const to = field.selectionEnd;
      field.value = `${field.value}${rest}`;
      field.setSelectionRange(at, to);
    });
  }
}
