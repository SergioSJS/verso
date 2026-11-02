// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { convertFileSrc } from "@tauri-apps/api/core";
import { commands } from "../../bindings";
import { can } from "../../can";
import { readDrawing } from "../../board/convert";
import { listedPath } from "../../board/model";
import { button, h, ui } from "../../dom";
import { fail } from "../../errors";
import { allFiles, allNotes } from "../../folder";
import { withNoteImages } from "../../images";
import { overlayOpen } from "../../layout/drag";
import { wholePlace } from "../embedClip";
import { frontmatterEnd, redraw } from "../../live";
import { opening } from "../../opening";
import { cleanHtmlText } from "../../sanitize";
import { framedPage } from "../../screen/framed";
import { settings } from "../../settings";
import { boardText, LANG, t } from "../../strings";
import { cardEditor, convertToBoard, isExcalidrawDrawing, loadBoardModule } from "../board";
import { NoteLeaf } from "../note";
import { webLeaves } from "../web";
import { embeddedHtml } from "../../blockEmbed";

export function buildWebBar(this: NoteLeaf): void {
  const b = (ic: string, title: string, run: () => void) => {
    const x = button("ghost iconic", title, ic);
    x.addEventListener("click", run);
    return x;
  };
  const toggle = button("ghost", t.webShowNote);
  toggle.classList.add("web-toggle");
  toggle.addEventListener("click", () => this.setWebShown(!this.webShown));
  // A button: opening the page in a window of its own answered the pointer only.
  this.webAddress.type = "button";
  this.webAddress.addEventListener("click", () => void commands.openUrl(this.webUrl));
  this.webAddress.title = t.webOpenWindow;
  this.webBar.append(
    b("chevronLeft", t.webBack, () => this.webLabel && void commands.webNav(this.webLabel, "back", null)),
    b("chevron", t.webForward, () => this.webLabel && void commands.webNav(this.webLabel, "forward", null)),
    b("refresh", t.webReload, () => this.webLabel && void commands.webNav(this.webLabel, "reload", null)),
    this.webAddress,
    toggle,
  );
}

export function embedHtml(this: NoteLeaf, target: string): string | null | undefined {
  if (this.embedCache.has(target)) return this.embedCache.get(target);
  const to = this.resolve(target);
  if (!to || !to.endsWith(".md") || to === this.path) {
    this.embedCache.set(target, null);
    return null;
  }
  void opening.readNote(to).then(async (r) => {
    this.embedCache.set(target, r.status === "ok" ? await withNoteImages(cleanHtmlText(await embeddedHtml(target, r.data)), to) : null);
    this.editor.dispatch({ effects: redraw.of(null) });
  });
  return undefined;
}

/** The note's `url`, if it has one that a page can open. */
export function noteUrl(this: NoteLeaf): string {
  const p = this.note?.properties.find((x) => x.key.toLowerCase() === "url");
  return p && p.value.kind === "text" && /^https?:\/\//i.test(p.value.value) ? p.value.value : "";
}

export function buildDrawingBar(this: NoteLeaf): void {
  this.drawingBar.hidden = true;
  this.drawingHost.hidden = true;
  const convert = button("drawing-convert", boardText.convert);
  convert.title = boardText.convertTitle;
  convert.addEventListener("click", () => void convertToBoard(this.path));
  this.drawingToggle.addEventListener("click", () => this.setDrawingShown(!this.drawingShown));
  this.drawingBar.append(h("span", "drawing-bar-label", boardText.drawing), convert, this.drawingToggle);
}

/** A drawing of the Excalidraw plugin opens on its drawing; its text is
 *  a click away. Read from the text, not the properties: the plugin writes
 *  a blank line after the opening fence, which the core does not read as
 *  a frontmatter (spec §5.1). */
export function applyDrawing(this: NoteLeaf): void {
  const text = this.note?.text ?? "";
  const is = !!this.note && isExcalidrawDrawing(text);
  this.drawingBar.hidden = !is;
  if (!is) {
    this.drawingFor = "";
    this.setDrawingShown(false);
    return;
  }
  if (this.path !== this.drawingFor) {
    this.drawingFor = this.path;
    this.drawingText = "";
    this.setDrawingShown(true);
  } else if (this.drawingShown && text !== this.drawingText) void this.showDrawing();
}

export function setDrawingShown(this: NoteLeaf, on: boolean): void {
  this.drawingShown = on;
  this.sheet.hidden = on || this.webShown;
  this.toolbar.hidden = on || this.webShown || this.mode === "preview";
  this.drawingHost.hidden = !on;
  this.drawingToggle.textContent = on ? boardText.drawingShowText : boardText.drawingShowDrawing;
  if (on) void this.showDrawing();
  else this.unmountDrawing();
}

export function unmountDrawing(this: NoteLeaf): void {
  this.drawingUnmount?.();
  this.drawingUnmount = null;
  this.drawingText = "";
}

/** Draw the note's drawing, read again from its text as it is now. */
export async function showDrawing(this: NoteLeaf): Promise<void> {
  const note = this.note;
  if (!note) return;
  const text = note.text;
  if (text === this.drawingText && this.drawingUnmount) return;
  const read = readDrawing(text);
  if ("error" in read) {
    ui.status.textContent = read.error === "not-drawing" ? boardText.convertNotDrawing : boardText.convertUnreadable;
    this.setDrawingShown(false);
    return;
  }
  const pictures = new Map<string, string>();
  for (const [id, target] of read.drawing.embedded) {
    const found = await commands.resolveAttachment(note.path, target);
    if (found.status === "ok" && found.data) pictures.set(id, found.data);
  }
  const mod = await loadBoardModule();
  // The note changed, or the drawing was put away, while it was read.
  if (this.destroyed || !this.drawingShown || this.note?.text !== text) return;
  this.unmountDrawing();
  this.drawingText = text;
  this.drawingUnmount = mod.mountDrawing(this.drawingHost, {
    elements: read.drawing.elements.filter((e) => e["isDeleted"] !== true),
    pictures,
    fileSrc: (path) => convertFileSrc(listedPath(path, [allNotes, allFiles]) ?? path, "verso"),
    dark: () => settings.theme === "dark" || (settings.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches),
    lang: LANG,
  });
}

export function applyWeb(this: NoteLeaf): void {
  const url = this.noteUrl();
  this.webBar.hidden = url === "";
  if (url === "") {
    if (this.webLabel) this.closeWeb();
    this.setWebShown(false);
    return;
  }
  this.webAddress.textContent = url.replace(/^https?:\/\//, "");
  if (url !== this.webUrl && this.webLabel) this.closeWeb();
  this.webUrl = url;
  // A note that is only its address shows the page first.
  const doc = this.editor.state.doc;
  const body = doc.sliceString(Math.min(frontmatterEnd(doc) + 1, doc.length)).trim();
  this.setWebShown(body === "" || this.webShown);
}

export function liveEmbed(this: NoteLeaf, target: string, mount: HTMLElement, onExit: () => void): (() => void) | undefined {
  if (!settings.inlineEmbedEdit) return undefined;
  const to = this.resolve(target);
  if (!to || !to.endsWith(".md") || to === this.path) return undefined;

  let destroyed = false;
  const card = cardEditor(
    mount,
    to,
    () => void exit(),
    this.cardHistory,
    () => this.keep(),
    true,
  );
  this.cards.add(card);

  const exit = async () => {
    if (destroyed) return;
    const ok = await card.flush();
    if (!ok) return;
    destroyed = true;
    this.cards.delete(card);
    card.destroy();
    const fresh = await opening.readNote(to);
    if (fresh.status === "ok") {
      const clean = await withNoteImages(cleanHtmlText(fresh.data.html), to);
      this.embedCache.set(target, clean);
      mount.innerHTML = clean;
    }
    this.editor.dispatch({ effects: redraw.of(null) });
    onExit();
  };

  return () => {
    void exit();
  };
}

export function setWebShown(this: NoteLeaf, on: boolean): void {
  this.webShown = on;
  this.sheet.hidden = on;
  this.toolbar.hidden = on || this.mode === "preview";
  this.webHost.hidden = !on;
  const toggle = this.webBar.querySelector<HTMLButtonElement>(".web-toggle");
  if (toggle) toggle.textContent = on ? t.webShowNote : t.webShowPage;
  if (on) void this.openWeb();
  else this.syncWeb();
}

export async function openWeb(this: NoteLeaf): Promise<void> {
  // No child web views here (a browser): the page in a frame, and a link
  // to open it in a tab of its own (ADR 0076 item 11).
  if (!can("web_views")) {
    if (this.webUrl && this.webHost.dataset["framed"] !== this.webUrl) {
      this.webHost.dataset["framed"] = this.webUrl;
      this.webHost.replaceChildren(framedPage(this.webUrl));
    }
    return;
  }
  if (this.webLabel || this.webOpening || !this.webUrl) return this.syncWeb();
  this.webOpening = true;
  const url = this.webUrl;
  const r = this.webHost.getBoundingClientRect();
  const res = await commands.webOpen(url, wholePlace(r));
  this.webOpening = false;
  if (res.status !== "ok") return fail(res.error);
  // The host names the view. The tab may have closed, or moved to
  // another address, while the view was being made: then it goes.
  if (this.destroyed || !this.el.isConnected || url !== this.webUrl) {
    void commands.webClose(res.data);
    return;
  }
  this.webLabel = res.data;
  this.webLast = "";
  webLeaves.add(this);
  this.webResize = new ResizeObserver(() => this.syncWeb());
  this.webResize.observe(this.webHost);
  this.syncWeb();
}

/** The page's view follows its host — moved, sized, hidden when the tab
 *  is not in front or an overlay is open — frame by frame while it
 *  moves, then sleeps until something wakes it (syncWebViews). Only
 *  changes cross the bridge. */
export function tickWeb(this: NoteLeaf): void {
  this.webRaf = 0;
  const label = this.webLabel;
  if (!label) return;
  const r = this.webHost.getBoundingClientRect();
  const visible = this.webShown && this.el.isConnected && this.webHost.offsetParent !== null && r.width > 1 && r.height > 1 && !overlayOpen();
  // The screen's scale too: the host places the view in device pixels.
  const key = visible ? `1|${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}|${Math.round(r.height)}|${window.devicePixelRatio}` : "0";
  if (key !== this.webLast) {
    this.webLast = key;
    this.webStill = 0;
    if (visible) void commands.webBounds(label, wholePlace(r)).then(() => commands.webVisible(label, true));
    else void commands.webVisible(label, false);
  } else this.webStill++;
  // Still for a few frames: a transition or a drag has ended.
  if (this.webStill < 10) this.webRaf = window.requestAnimationFrame(() => this.tickWeb());
}

/** Something may have moved the host: look again. */
export function syncWeb(this: NoteLeaf): void {
  this.webStill = 0;
  if (this.webLabel && !this.webRaf) this.webRaf = window.requestAnimationFrame(() => this.tickWeb());
}

export function closeWeb(this: NoteLeaf): void {
  const label = this.webLabel;
  this.webLabel = null;
  webLeaves.delete(this);
  this.webResize?.disconnect();
  this.webResize = null;
  if (this.webRaf) window.cancelAnimationFrame(this.webRaf);
  this.webRaf = 0;
  if (label) void commands.webClose(label);
}
