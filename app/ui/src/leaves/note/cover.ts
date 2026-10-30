// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Transaction } from "@codemirror/state";
import { looseReadOnlyReason } from "../../loose";
import { convertFileSrc } from "@tauri-apps/api/core";
import { afterFileChange } from "../../changes";
import { minimalEdit } from "../../edit";
import { throughRoom } from "../../roomWrites";
import { promptText } from "../../dialog";
import { h } from "../../dom";
import { allEntries } from "../../folder";
import { icon } from "../../icons";
import { renderSticker, resolveColor, showStickerPicker } from "../../labels";
import { bannerFraction, bannerPercent, pickerStrings } from "../../organize/cover";
import { setFrontmatterProp } from "../../organize/frontmatter";
import { host } from "../../can";
import { heldImage } from "../../sanitize";
import { settings } from "../../settings";
import { LOCALE, t, typedText } from "../../strings";
import { NoteLeaf } from "../note";

export function openStickerPicker(this: NoteLeaf): void {
  const entry = allEntries.get(this.path);
  showStickerPicker({
    anchorEl: this.stickerBtn,
    currentSticker: entry?.label?.sticker ?? null,
    currentColor: entry?.label?.color ?? null,
    strings: pickerStrings(),
    lang: LOCALE.startsWith("pt") ? "pt" : "en",
    onSelectSticker: (stk) => void this.setProperty("sticker", stk),
    onSelectColor: (clr) => void this.setProperty("color", clr),
    onRemoveSticker: () => void this.setProperty("sticker", null),
    onRemoveColor: () => void this.setProperty("color", null),
  });
}

/** One property of this note set from its sticker, colour or cover: in a
 *  live note into the room, as typing goes (ADR 0082, decided
 *  2026-10-12); elsewhere into the editor and saved. Either way as the
 *  one edit of the key's lines, never the whole text written again —
 *  in a room that would be everyone's text deleted and typed anew. */
export async function setProperty(this: NoteLeaf, key: string, value: string | null): Promise<void> {
  if (throughRoom(this.roomHolder(), (text) => setFrontmatterProp(text, key, value)) !== "disk") return;
  const was = this.editor.state.doc.toString();
  const edit = minimalEdit(was, setFrontmatterProp(was, key, value));
  // The panel's kind of edit, not a key's: Live Preview's guard drops an
  // `input` in the folded frontmatter (`keepFrontmatter`).
  if (edit) this.editor.dispatch({ changes: edit, annotations: Transaction.userEvent.of("props") });
  await this.save();
  await afterFileChange();
}

export async function promptCover(this: NoteLeaf): Promise<void> {
  const url = await promptText(t.coverUrlPrompt ?? "URL:", this.bannerUrl || "", false, { yes: t.save ?? "OK", no: t.cancel ?? "Cancel" });
  if (url !== null) {
    void this.setProperty("banner", url.trim() || null);
  }
}

export function paintCoverAndSticker(this: NoteLeaf): void {
  const prop = (k: string): string | null => {
    const p = this.note?.properties.find((x) => x.key.toLowerCase() === k.toLowerCase());
    return p && "value" in p.value ? String(p.value.value).trim() : null;
  };
  const sticker = prop("sticker");
  const color = prop("color");
  const banner = prop("banner");
  const bannerYStr = prop("banner_y");
  this.bannerY = bannerFraction(bannerYStr);
  this.bannerUrl = banner ?? "";

  if (settings.stickers) {
    this.stickerBtn.hidden = false;
    const stickerNode = sticker ? renderSticker(sticker, 24) : null;
    if (stickerNode) {
      this.stickerBtn.replaceChildren(stickerNode);
      this.stickerBtn.style.opacity = "1";
    } else {
      // Not the bookmark's star, at the other end of the title.
      this.stickerBtn.replaceChildren(icon("sparkles"));
      this.stickerBtn.style.opacity = "0.2";
    }
    this.stickerBtn.title = t.changeSticker;
  } else {
    this.stickerBtn.hidden = true;
  }

  if (color) {
    const c = resolveColor(color);
    if (c) this.title.style.color = c;
    else this.title.style.color = "";
  } else {
    this.title.style.color = "";
  }

  if (settings.covers) {
    if (banner) {
      this.addCoverBtn.hidden = true;
      this.coverBox.hidden = false;
      this.coverBox.style.height = `${settings.coverHeight}px`;

      const isHeld = heldImage(banner);
      const img = h("img", "note-cover-img");
      if (!isHeld) {
        img.src = /^https?:\/\//.test(banner) ? banner : convertFileSrc(banner, "verso");
      }
      img.style.objectPosition = `center ${this.bannerY * 100}%`;

      let heldEl: HTMLElement | null = null;
      if (isHeld) {
        const held = h("div", "note-cover-held");
        const a = h("a", "remote-image", `${t.coverRemoteOff} (${banner})`);
        a.href = banner;
        a.target = "_blank";
        const loadBtn = h("button", "note-cover-btn", t.embedLoad);
        loadBtn.addEventListener("click", () => {
          held.remove();
          img.src = banner;
          this.coverBox.prepend(img);
        });
        held.append(a, loadBtn);
        heldEl = held;
      }

      const controls = h("div", "note-cover-controls");
      const btnReposition = h("button", "note-cover-btn", t.repositionCover);
      const btnChange = h("button", "note-cover-btn", t.changeCover);
      const btnRemove = h("button", "note-cover-btn", t.removeCover);

      btnChange.addEventListener("click", () => void this.promptCover());
      btnRemove.addEventListener("click", () => {
        void this.setProperty("banner", null);
        void this.setProperty("banner_y", null);
      });

      btnReposition.addEventListener("click", () => {
        this.cancelReposition?.();
        this.coverBox.classList.add("dragging");
        const hint = h("div", "note-cover-drag-hint", `${t.savePosition} (↑/↓, Enter)`);
        const slider = h("input", "note-cover-slider");
        slider.type = "range";
        slider.min = "0";
        slider.max = "100";
        slider.value = String(Math.round(this.bannerY * 100));
        slider.setAttribute("aria-label", t.repositionCover);
        slider.setAttribute("aria-valuetext", `${slider.value}%`);
        this.coverBox.append(slider, hint);
        let startY = 0;
        let startPos = this.bannerY;
        let currentY = this.bannerY;

        const updateY = (yVal: number) => {
          currentY = Math.max(0, Math.min(1, yVal));
          slider.value = String(Math.round(currentY * 100));
          slider.setAttribute("aria-valuetext", `${slider.value}%`);
          img.style.objectPosition = `center ${currentY * 100}%`;
        };

        slider.addEventListener("input", () => {
          updateY(Number(slider.value) / 100);
        });

        let done = false;
        const finish = (save: boolean) => {
          if (done) return;
          done = true;
          this.cancelReposition = undefined;
          document.removeEventListener("pointerdown", onDocPointerDown, true);
          slider.removeEventListener("keydown", onKeyDown);
          this.coverBox.classList.remove("dragging");
          hint.remove();
          slider.remove();
          this.coverBox.removeEventListener("mousedown", onMouseDown);
          if (save) {
            this.bannerY = currentY;
            void this.setProperty("banner_y", bannerPercent(currentY));
          } else {
            img.style.objectPosition = `center ${this.bannerY * 100}%`;
          }
        };
        this.cancelReposition = () => finish(false);

        const onKeyDown = (e: KeyboardEvent) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            updateY(currentY - 0.05);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            updateY(currentY + 0.05);
          } else if (e.key === "Enter") {
            e.preventDefault();
            finish(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
          }
        };
        // On the slider, which holds the focus: a key typed elsewhere is not
        // the cover's.
        slider.addEventListener("keydown", onKeyDown);

        const onDocPointerDown = (ev: PointerEvent) => {
          if (!this.coverBox.contains(ev.target as Node) && ev.target !== hint && ev.target !== slider) {
            finish(false);
          }
        };
        document.addEventListener("pointerdown", onDocPointerDown, true);

        const onMouseDown = (e: MouseEvent) => {
          if (e.target === slider || e.target === hint) return;
          startY = e.clientY;
          startPos = currentY;
          const onMouseMove = (ev: MouseEvent) => {
            const delta = (ev.clientY - startY) / (settings.coverHeight || 200);
            updateY(startPos - delta);
          };
          const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
          };
          document.addEventListener("mousemove", onMouseMove);
          document.addEventListener("mouseup", onMouseUp);
        };

        this.coverBox.addEventListener("mousedown", onMouseDown);

        hint.style.pointerEvents = "auto";
        hint.style.cursor = "pointer";
        hint.addEventListener("click", () => finish(true));
        slider.focus();
      });

      controls.append(btnReposition, btnChange, btnRemove);
      this.coverBox.replaceChildren(heldEl ?? img, controls);
    } else {
      this.coverBox.hidden = true;
      this.addCoverBtn.hidden = false;
    }
  } else {
    this.coverBox.hidden = true;
    this.addCoverBtn.hidden = true;
  }
}

/** What the note says of itself above the text: behind the index, a
 *  last known version, mixed line endings (read-only), gone. */
export function paintFlags(this: NoteLeaf): void {
  const note = this.note;
  const flags: string[] = [];
  if (note?.stale) flags.push(t.stale);
  if (note?.unverified) flags.push(t.unverified);
  // A folder one only reads says so by the lock beside its name (ADR 0076
  // item 11), not by a line under every title.
  if (this.mixedEol) flags.push(t.mixedEol);
  // A loose file the system will not let be written, or above the bound
  // (ADR 0114 items 12 and 13): its reason, above the text.
  const looseWhy = note ? looseReadOnlyReason(note.path) : null;
  if (looseWhy) flags.push(looseWhy);
  // On a server a note also goes on another device that syncs the folder.
  // A save that found it gone says so above the text, with what to do.
  if (this.gone && !this.goneBanner.up) flags.push(host() === "server" ? t.goneElsewhere : t.goneOutside);
  // A schema block of this note that types nothing says so here (ADR
  // 0052 points 3 and 5).
  for (const b of note?.schema_blocks ?? []) {
    if (b.nested) flags.push(typedText.nested(b.line));
    else if (b.error) flags.push(typedText.broken(b.line, typedText.errors[b.error] ?? b.error));
  }
  // The same `^id` twice: the last names the block, as in Obsidian (spec
  // Q4); the note says which lines.
  const lines = new Map<string, number[]>();
  for (const b of note?.blocks ?? []) lines.set(b.id, [...(lines.get(b.id) ?? []), b.line]);
  for (const [id, at] of lines) if (at.length > 1) flags.push(t.blockRepeated(id, at));
  this.flags.textContent = flags.join(" ");
}
