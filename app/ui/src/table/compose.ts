// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The input row at the foot of a server's table (ADR 0107 items 3, 4, 12):
// a text field (Enter sends, Shift+Enter breaks the line), `/r 1d20+3` to
// roll, a dice button for the roller, an image button (and paste or drop in
// the panel) for readers-excluded images, and the "Secreta" toggle for a
// roll to the folder's owners. Its refusals are said beside the field in the
// person's words. On a phone the panel is a sheet: while the field has the
// keyboard, the sheet is lifted above it (`--table-kb`, css/table.css).

import { pickImages } from "../attach";
import { button, h, ui } from "../dom";
import { play3d, will3d } from "../dice3d";
import { readNotation, rollHere } from "../dice/notation";
import { openRoller } from "../dice/roller";
import { icon } from "../icons";
import { keyboardInset, onViewport } from "../screen/viewport";
import { isServerTable, type ServerTable, type TableSource } from "./model";
import { charsOf, checkImage, COUNTER_FROM, IMAGE_MAX, MESSAGE_MAX, paceWait, readTyped, toBase64 } from "./send";
import { recordRoll, tableSource } from "./record";
import { tt } from "./strings";
import { Tray } from "./tray";
import { ts } from "./trayStrings";

/** A server's refusal in the person's words (its pace rule says how long to wait). */
function refusalOf(message: string): string {
  const wait = paceWait(message);
  return wait !== null ? tt.slowDown(wait) : message;
}

/** Roll `notation` (read by `readNotation`) at the table: the one way a roll goes
 *  out, for `/r` and for the dice tray. A server's table rolls it, once, for
 *  everyone (the "Secreta" toggle respected); without a server this window rolls
 *  it and the log keeps it. The 3D dice fall after it. `accepted` runs when the
 *  roll is taken, before the fall. Answers the reason it was refused, or null. */
export async function rollNotation(notation: string, accepted?: () => void): Promise<string | null> {
  const t = tableSource();
  if (isServerTable(t)) {
    const r = await t.roll(notation, { secret: t.secret });
    if ("error" in r) return refusalOf(r.error);
    accepted?.();
    if (t.secret) ui.status.textContent = tt.secretRollStatus;
    if (r.entry.roll && will3d("", r.entry.roll)) await play3d("", r.entry.roll).catch(() => undefined);
    return null;
  }
  const read = readNotation(notation);
  if (!read) return tt.badRoll(notation);
  const roll = rollHere(read);
  accepted?.();
  const fall = will3d("", roll);
  if (fall) await play3d("", roll).catch(() => undefined);
  recordRoll("", roll);
  return null;
}

export class Compose {
  readonly el = h("form", "table-compose");
  private readonly field = h("textarea", "table-input");
  private readonly counter = h("span", "table-counter");
  private readonly error = h("p", "table-compose-error");
  private readonly tray: Tray;
  private readonly dice = button("ghost iconic table-dice", tt.rollButton, "dice");
  private readonly image = button("ghost iconic table-image-pick", tt.imageButton, "image");
  private readonly secret = button("ghost table-secret-toggle", tt.secretToggle, "lock");
  private readonly send = h("button", "save table-send", tt.send);
  private busy = false;

  constructor() {
    this.el.setAttribute("aria-label", tt.inputLabel);
    // Larger than a line, as a chat box is: 3 lines (2 on a phone), growing to 8 (css/table.css); Shift+Enter breaks the line.
    this.field.rows = window.matchMedia("(max-width: 760px)").matches ? 2 : 3;
    this.field.placeholder = tt.placeholder;
    this.field.setAttribute("aria-label", tt.inputLabel);
    this.field.setAttribute("enterkeyhint", "send");
    this.field.autocomplete = "off";
    this.field.spellcheck = true;
    this.counter.setAttribute("aria-hidden", "true");
    this.counter.hidden = true;
    this.error.setAttribute("role", "alert");
    this.error.hidden = true;
    this.send.type = "submit";
    this.secret.setAttribute("aria-pressed", "false");
    this.secret.title = tt.secretDesc;
    this.secret.textContent = "";
    this.secret.append(icon("lock", ""), h("span", "table-secret-word", tt.secretToggle));
    this.secret.setAttribute("aria-label", `${tt.secretToggle}. ${tt.secretDesc}`);
    const row = h("div", "table-compose-row");
    row.append(this.field, this.send);
    const tools = h("div", "table-compose-tools");
    tools.append(this.dice, this.image, this.secret, this.counter);
    this.tray = new Tray({ input: this.field, submit: () => this.submit(), showError: (text) => (text === null ? this.clearError() : this.fail(text)) });
    this.el.append(this.error, row, this.tray.el, tools);

    this.el.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.submit();
    });
    this.field.addEventListener("keydown", (e) => {
      // Enter sends, Shift+Enter breaks the line; Enter while an IME composes (keyCode 229) only confirms the composition.
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        void this.submit();
      }
    });
    this.field.addEventListener("input", () => {
      this.grow();
      this.count();
      this.error.hidden = true;
    });
    this.dice.addEventListener("click", () => openRoller());
    this.image.addEventListener("click", () => {
      // The system's picker is opened from the click itself, before any await.
      const picking = pickImages(false);
      void picking.then((files) => this.sendFiles(files));
    });
    this.secret.addEventListener("click", () => {
      const t = this.table();
      if (t) t.secret = !t.secret;
    });
    // A phone: the sheet rises above the keyboard while the field has it.
    const follow = (): void => {
      if (document.activeElement === this.field) document.body.style.setProperty("--table-kb", `${keyboardInset()}px`);
      else document.body.style.removeProperty("--table-kb");
    };
    this.field.addEventListener("focus", follow);
    this.field.addEventListener("blur", follow);
    onViewport(follow);
  }

  private table(): ServerTable | null {
    const t = tableSource();
    return isServerTable(t) ? t : null;
  }

  /** Draw for `src`: the field and the dice row are always there (the local table rolls with `/r` too); messages, images and the Secreta toggle belong to a server's table, images not to a reader. */
  sync(src: TableSource): void {
    const t = isServerTable(src) ? src : null;
    this.tray.sync(src);
    this.image.hidden = !t || !t.canSendImage();
    this.secret.hidden = !t;
    this.field.placeholder = t ? tt.placeholder : tt.placeholderLocal;
    if (!t) return;
    const on = t.secret;
    this.secret.setAttribute("aria-pressed", String(on));
    this.secret.classList.toggle("on", on);
  }

  /** The message field the dice row writes its roll in. */
  get input(): HTMLTextAreaElement {
    return this.field;
  }

  focus(): void {
    this.field.focus();
  }

  /** The field grows with its text; its minimum and maximum (3 and 8 lines) are the stylesheet's. */
  private grow(): void {
    this.field.style.height = "auto";
    this.field.style.height = `${this.field.scrollHeight + (this.field.offsetHeight - this.field.clientHeight)}px`;
  }

  private count(): void {
    const n = charsOf(this.field.value);
    this.counter.hidden = n < COUNTER_FROM;
    this.counter.textContent = tt.counter(n, MESSAGE_MAX);
    this.counter.classList.toggle("over", n > MESSAGE_MAX);
  }

  private clearError(): void {
    this.error.hidden = true;
  }

  private fail(text: string): void {
    this.error.textContent = text;
    this.error.hidden = false;
  }

  private refusal(message: string): string {
    return refusalOf(message);
  }

  /** Send what was typed: a message, or `/r` and a notation. */
  async submit(): Promise<void> {
    const t = this.table();
    if (this.busy) return;
    const typed = readTyped(this.field.value);
    if (typed.kind === "empty") return;
    // Without a server there is nobody to say it to: only the rolls go.
    if (!t && typed.kind === "say") return this.fail(ts.localOnlyRolls);
    if (typed.kind === "long") return this.fail(tt.tooLong(typed.length, MESSAGE_MAX));
    if (typed.kind === "badRoll") return this.fail(tt.badRoll(typed.typed));
    this.busy = true;
    // What was typed when the command went out: the field is emptied once it is
    // accepted, but never over something typed meanwhile.
    const sent = this.field.value;
    const clear = (): void => {
      if (this.field.value === sent) {
        this.field.value = "";
        this.field.dispatchEvent(new Event("input"));
      }
      this.error.hidden = true;
      this.grow();
      this.count();
    };
    try {
      if (typed.kind === "say") {
        if (!t) return;
        const refused = await t.say(typed.text);
        if (refused) return this.fail(this.refusal(refused));
        clear();
      } else {
        // Accepted: the field is emptied now, not after the dice have fallen
        // (a roll that took time, or a fall that failed, used to leave `/r 1d20`).
        const refused = await rollNotation(typed.notation, clear);
        if (refused) return this.fail(refused);
      }
    } finally {
      this.busy = false;
    }
  }

  /** Images chosen, pasted or dropped: checked here, then sent one by one. */
  async sendFiles(files: readonly File[]): Promise<void> {
    const t = this.table();
    if (!t || !t.canSendImage()) return;
    for (const file of files) {
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch {
        return this.fail(tt.imageUnreadable);
      }
      const why = checkImage(bytes);
      if (why === "type") return this.fail(tt.imageNotImage);
      if (why === "size") return this.fail(tt.imageTooBig(Math.round(IMAGE_MAX / 1048576)));
      if (why === "empty") return this.fail(tt.imageEmpty);
      ui.status.textContent = tt.imageSending;
      const refused = await t.sendImage(toBase64(bytes));
      if (refused) return this.fail(this.refusal(refused));
      this.error.hidden = true;
      ui.status.textContent = tt.imageSent;
    }
  }

  /** Paste and drop on the panel: images only, and only where they are taken. */
  takeTransfer(data: DataTransfer | null): boolean {
    const t = this.table();
    if (!t || !t.canSendImage() || !data) return false;
    const files = Array.from(data.files).filter((f) => f.type.startsWith("image/") || f.type === "");
    if (files.length === 0) return false;
    void this.sendFiles(files);
    return true;
  }
}
