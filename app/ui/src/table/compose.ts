// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The composer at the foot of the Table panel (ADR 0107 items 3, 4, 12, and
// "The whole foot of the panel made one box", 2026-10-23): ONE box, as a VTT's
// chat is. A multi-line text field (Enter sends, Shift+Enter breaks the line,
// `/r 1d20+3` rolls), the images waiting above the text as thumbnails (pasted,
// dropped or picked with the paperclip; Enter sends them first), a small send
// button, and under it the dice row (tray.ts) with the Public / Secret
// selector. Its refusals are said above the box in the person's words. On a
// phone the panel is a sheet: while the field has the keyboard, the sheet is
// lifted above it (`--table-kb`, css/table.css).

import { pickImages } from "../attach";
import { button, h, ui } from "../dom";
import { play3d, will3d } from "../dice3d";
import { readNotation, rollHere } from "../dice/notation";
import { keyboardInset, onViewport } from "../screen/viewport";
import { icon } from "../icons";
import { isServerTable, type ServerTable, type TableSource } from "./model";
import { charsOf, checkFile, fileKind, COUNTER_FROM, IMAGE_MAX, MESSAGE_MAX, paceWait, readTyped, sendable, toBase64 } from "./send";
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

/** An image waiting in the box to be sent with Enter (pasted, dropped or picked). */
interface Staged {
  name: string;
  bytes: Uint8Array;
  url: string;
  chip: HTMLElement;
}

export class Compose {
  readonly el = h("form", "table-compose");
  private readonly field = h("textarea", "table-input");
  private readonly counter = h("span", "table-counter");
  private readonly error = h("p", "table-compose-error");
  private readonly chips = h("div", "table-chips");
  private readonly attach = button("ghost iconic table-attach", ts.attach, "paperclip");
  private readonly send = button("save iconic table-send", tt.send, "send");
  private readonly tray: Tray;
  private readonly staged: Staged[] = [];
  private busy = false;

  constructor() {
    this.el.setAttribute("aria-label", tt.inputLabel);
    // Larger than a line, as a chat box is: 3 lines (one on a phone, as a chat's), growing to 8 (css/table.css); Shift+Enter breaks the line.
    this.field.rows = window.matchMedia("(max-width: 760px)").matches ? 1 : 3;
    this.field.placeholder = tt.placeholder;
    this.field.setAttribute("aria-label", tt.inputLabel);
    this.field.setAttribute("enterkeyhint", "send");
    this.field.autocomplete = "off";
    this.field.spellcheck = true;
    this.counter.setAttribute("aria-hidden", "true");
    this.counter.hidden = true;
    this.error.setAttribute("role", "alert");
    this.error.hidden = true;
    this.chips.setAttribute("role", "group");
    this.chips.setAttribute("aria-label", ts.chipsLabel);
    this.chips.hidden = true;
    this.send.type = "submit";
    this.send.setAttribute("aria-label", tt.send);
    this.send.title = tt.send;
    this.attach.setAttribute("aria-label", ts.attach);
    this.attach.title = ts.attach;
    // One box, as a chat box is: the images waiting above the text, the text, and a small toolbar on the bottom edge
    // (the paperclip, the saved rolls, who sees the roll, and Send at the right) like Discord's, Slack's and Foundry's chat.
    this.tray = new Tray({ input: this.field, submit: () => this.submit(), showError: (text) => (text === null ? this.clearError() : this.fail(text)) });
    const bar = h("div", "table-box-bar");
    const spacer = h("span", "table-box-spacer");
    bar.append(this.attach, ...this.tray.tools, spacer, this.send);
    const box = h("div", "table-box");
    box.append(this.chips, this.field, bar);
    this.el.append(this.error, box, this.tray.el, this.counter);

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
      this.ready();
    });
    this.attach.addEventListener("click", () => {
      // The system's picker is opened from the click itself, before any await.
      // Only what the game master let this player send (K.6).
      const t = this.table();
      const accept = [t?.canSendImage() ? "image/*" : "", t?.canSendFile() ? "application/pdf,audio/*" : ""].filter(Boolean).join(",");
      const picking = pickImages(false, accept || "image/*");
      void picking.then((files) => this.stage(files));
    });
    // A phone: the sheet rises above the keyboard while the field has it.
    const follow = (): void => {
      if (document.activeElement === this.field) document.body.style.setProperty("--table-kb", `${keyboardInset()}px`);
      else document.body.style.removeProperty("--table-kb");
    };
    this.field.addEventListener("focus", follow);
    this.field.addEventListener("blur", follow);
    onViewport(follow);
    this.ready();
  }

  private table(): ServerTable | null {
    const t = tableSource();
    return isServerTable(t) ? t : null;
  }

  /** Draw for `src`: the field and the dice row are always there (the local table rolls with `/r` too); messages and images belong to a server's table, images not to a reader. */
  sync(src: TableSource): void {
    const t = isServerTable(src) ? src : null;
    this.tray.sync(src);
    const mayAttach = !!t && (t.canSendImage() || t.canSendFile());
    this.attach.hidden = !mayAttach;
    // A phone's field is one line wide: the short hints (the paperclip says images; the dice row is under it).
    const narrow = window.matchMedia("(max-width: 760px)").matches;
    this.field.placeholder = t ? (mayAttach && !narrow ? tt.placeholderImage : tt.placeholder) : narrow ? tt.placeholderLocalShort : tt.placeholderLocal;
    if (!mayAttach) this.dropStaged();
    this.ready();
  }

  /** The message field the dice row writes its roll in. */
  get input(): HTMLTextAreaElement {
    return this.field;
  }

  focus(): void {
    this.field.focus();
  }

  /** Whether there is anything to send: the send button follows. */
  private ready(): void {
    this.send.disabled = this.busy || (this.field.value.trim() === "" && this.staged.length === 0);
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

  /** Send what is in the box: the images waiting, then the text (a message, or `/r` and a notation). The contract
   *  sends an image and a message as two commands, so they are two lines of the log, the images first. */
  async submit(): Promise<void> {
    const t = this.table();
    if (this.busy) return;
    const typed = readTyped(this.field.value);
    if (typed.kind === "empty" && this.staged.length === 0) return;
    // Without a server there is nobody to say it to: only the rolls go.
    if (!t && typed.kind === "say") return this.fail(ts.localOnlyRolls);
    if (typed.kind === "long") return this.fail(tt.tooLong(typed.length, MESSAGE_MAX));
    if (typed.kind === "badRoll") return this.fail(tt.badRoll(typed.typed));
    this.busy = true;
    this.ready();
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
      // The images first, one by one; one refused stays in the box (with those after it) and nothing else goes.
      while (t && this.staged.length > 0) {
        const next = this.staged[0]!;
        ui.status.textContent = tt.imageSending;
        const refused = await t.sendImage(toBase64(next.bytes));
        if (refused) return this.fail(this.refusal(refused));
        this.unstage(next);
        ui.status.textContent = tt.imageSent;
      }
      if (typed.kind === "empty") return;
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
      this.ready();
    }
  }

  /** Images chosen, pasted or dropped: checked here, then kept in the box as small previews until Enter. */
  async stage(files: readonly File[]): Promise<void> {
    const t = this.table();
    if (!t || !(t.canSendImage() || t.canSendFile())) return;
    for (const file of files) {
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch {
        return this.fail(tt.imageUnreadable);
      }
      const why = checkFile(bytes);
      if (why === "type") return this.fail(tt.imageNotImage);
      // The right is by what the bytes are: an image is Images, the rest Files (K.6).
      const image = fileKind(bytes.subarray(0, 16)) === "image";
      if (image && !t.canSendImage()) return this.fail(tt.noRightImages);
      if (!image && !t.canSendFile()) return this.fail(tt.noRightFiles);
      if (why === "size") return this.fail(tt.imageTooBig(Math.round(IMAGE_MAX / 1048576)));
      if (why === "empty") return this.fail(tt.imageEmpty);
      this.error.hidden = true;
      this.addChip(file.name || "arquivo", bytes, file.type);
    }
  }

  private addChip(name: string, bytes: Uint8Array, type: string): void {
    const image = fileKind(bytes.subarray(0, 16)) === "image";
    const url = image ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: type.startsWith("image/") ? type : "image/png" })) : "";
    const chip = h("div", "table-chip");
    // An image waits as its small picture; a PDF or a sound, as a file icon.
    const img = image ? h("img", "table-chip-img") : h("span", "table-chip-img table-chip-file");
    if (img instanceof HTMLImageElement) {
      img.src = url;
      img.alt = "";
    } else img.append(icon("paperclip", ""));
    const remove = button("ghost iconic table-chip-remove", ts.chipRemove(name), "close");
    remove.type = "button";
    remove.setAttribute("aria-label", ts.chipRemove(name));
    chip.append(img, h("span", "table-chip-name", name), remove);
    const item: Staged = { name, bytes, url, chip };
    remove.addEventListener("click", () => {
      this.unstage(item);
      this.field.focus();
    });
    this.staged.push(item);
    this.chips.append(chip);
    this.chips.hidden = false;
    this.ready();
  }

  private unstage(item: Staged): void {
    const at = this.staged.indexOf(item);
    if (at >= 0) this.staged.splice(at, 1);
    if (item.url) URL.revokeObjectURL(item.url);
    item.chip.remove();
    this.chips.hidden = this.staged.length === 0;
    this.ready();
  }

  private dropStaged(): void {
    for (const item of [...this.staged]) this.unstage(item);
  }

  /** Paste and drop on the panel: images, PDFs and audio, and only where they are taken. */
  takeTransfer(data: DataTransfer | null): boolean {
    const t = this.table();
    if (!t || !(t.canSendImage() || t.canSendFile()) || !data) return false;
    const files = Array.from(data.files).filter(sendable);
    if (files.length === 0) return false;
    void this.stage(files);
    return true;
  }
}
