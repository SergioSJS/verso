// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The one "Access…" dialog (ADR 0113 section F): *Does not see | Sees |
// Edits* for the whole table and for each player, on any file or folder, or
// on a selection. A popover beside the icon that opened it on a desktop, a
// bottom sheet with 44 px targets on a phone. On a file every choice saves
// at once and answers beside itself (*Salvo ✓* or the error in red); on a
// folder, or a selection, the choice is applied with a button, because it
// replaces what is inside, and the count of files that change is said first.
// A player's own row that differs from the whole table's reads *só ele/ela*
// with a way back (↺); a file with a set of its own under a folder reads
// *Acesso próprio* with *↺ Seguir a pasta*. The window never decides what a
// level means: the server did (`access_get`), and decides again at every
// write.

import { segmented, type Segmented } from "./accessControl";
import { ac } from "./accessStrings";
import { commands, type AccessChange, type AccessInfo, type AccessLevel, type AccessSetView, type ContractError } from "./bindings";
import { narrow } from "./chrome";
import { ask } from "./dialog";
import { button, h } from "./dom";
import { told } from "./errors";
import { icon } from "./icons";
import { name as baseName } from "./paths";
import { placeInView } from "./screen/viewport";

type SetDraft = { whole: AccessLevel | null; rows: Map<string, AccessLevel> };

const draftOf = (v: AccessSetView): SetDraft => ({ whole: v.whole, rows: new Map(v.rows.map((r) => [r.account, r.level])) });
const viewOf = (d: SetDraft): AccessSetView => ({
  whole: d.whole ?? "none",
  rows: [...d.rows].map(([account, level]) => ({ account, level })),
});
const sameSet = (a: AccessSetView, b: AccessSetView): boolean => {
  if (a.whole !== b.whole || a.rows.length !== b.rows.length) return false;
  const m = new Map(b.rows.map((r) => [r.account, r.level]));
  return a.rows.every((r) => m.get(r.account) === r.level);
};

const isBoard = (path: string): boolean => /\.canvas$/i.test(path);

let open: { close: () => void } | null = null;

function said(e: ContractError): string {
  told(e.kind, e.message, e);
  return `${ac.failed}: ${e.message}`;
}

/** Open the dialog for `paths` (one file, one folder, or a selection). The
 *  popover sits beside `anchor`; a phone gets a sheet. */
export async function openAccess(paths: string[], anchor?: HTMLElement | null): Promise<void> {
  open?.close();
  const r = await commands.accessGet(paths);
  if (r.status !== "ok") {
    told(r.error.kind, r.error.message, r.error);
    return;
  }
  const infos = r.data;
  const first = infos[0];
  if (!first) return;
  new AccessDialog(paths, infos, anchor ?? null);
}

/** One player's level on one file, changed from a list (the Table's
 *  window): the file's set is read, that player's row changed, the set
 *  written. Answers whether it was saved. */
export async function setPlayerLevel(path: string, account: string, level: AccessLevel): Promise<boolean> {
  const got = await commands.accessGet([path]);
  if (got.status !== "ok" || !got.data[0]) return false;
  const info = got.data[0];
  const d = draftOf(info.own ?? info.set);
  if (level === d.whole) d.rows.delete(account);
  else d.rows.set(account, level);
  const saved = await commands.accessSet([path], { kind: "set", set: viewOf(d), secret_name: null });
  if (saved.status !== "ok") {
    told(saved.error.kind, saved.error.message, saved.error);
    return false;
  }
  return true;
}

class AccessDialog {
  private readonly pop = h("div", "access-pop");
  private readonly feedback = h("span", "ac-feedback");
  private readonly body = h("div", "ac-body");
  private readonly opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  /** Where the opener is in the tree, to find it again when a save drew the tree anew. */
  private readonly openerAt = ((): string | null => {
    const e = this.opener;
    const file = e?.closest("li[data-path]")?.getAttribute("data-path");
    const folder = e?.closest("summary[data-folder]")?.getAttribute("data-folder");
    if (file != null && e?.parentElement?.tagName === "LI") return `li[data-path="${CSS.escape(file)}"] > button`;
    return folder != null ? `summary[data-folder="${CSS.escape(folder)}"]` : null;
  })();
  private draft: SetDraft;
  private info: AccessInfo;
  private parent: AccessInfo | null = null;
  private queue: Promise<void> = Promise.resolve();
  private timer = 0;
  private controls = new Map<string, Segmented>();
  private whole: Segmented | null = null;
  /** The folder or the selection applies with a button. */
  private readonly apply: boolean;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  };
  private readonly onOutside = (e: PointerEvent): void => {
    const t = e.target;
    if (t instanceof Node && (this.pop.contains(t) || (this.anchor?.contains(t) ?? false))) return;
    if (t instanceof Element && t.closest(".confirm, .menu")) return;
    this.close();
  };
  private readonly onResize = (): void => this.place();

  constructor(
    private readonly paths: string[],
    private readonly infos: AccessInfo[],
    private readonly anchor: HTMLElement | null,
  ) {
    this.info = infos[0]!;
    this.apply = paths.length > 1 || this.info.folder;
    this.draft = this.initialDraft();
    const pop = this.pop;
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-modal", "false");
    pop.setAttribute("aria-labelledby", "ac-title");
    this.feedback.setAttribute("role", "status");
    this.feedback.setAttribute("aria-live", "polite");
    document.body.append(pop);
    open = this;
    this.build();
    this.place();
    document.addEventListener("keydown", this.onKey, true);
    document.addEventListener("pointerdown", this.onOutside, true);
    addEventListener("resize", this.onResize);
    pop.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      // A control inside a closed <details> cannot take the focus (only its summary can): leaving it in
      // the list made the summary look like a middle stop, and Tab from it left the dialog.
      const list = [...pop.querySelectorAll<HTMLElement>("button:not([disabled]), input, summary")].filter(
        (x) => x.getClientRects().length > 0 && x.tabIndex >= 0 && !(x.closest("details:not([open])") && x.tagName !== "SUMMARY"),
      );
      const at = list.indexOf(document.activeElement as HTMLElement);
      if (list.length === 0) return;
      if (e.shiftKey && at <= 0) {
        e.preventDefault();
        list[list.length - 1]!.focus();
      } else if (!e.shiftKey && at === list.length - 1) {
        e.preventDefault();
        list[0]!.focus();
      }
    });
    // The first control takes the focus, as a dialog's does; a phone's sheet
    // starts on its close button.
    queueMicrotask(() => (narrow.matches ? pop.querySelector<HTMLElement>(".ac-close") : pop.querySelector<HTMLElement>(".ac-seg-btn[tabindex=\"0\"]"))?.focus());
    if (!this.apply && this.info.own) void this.loadParent();
  }

  private initialDraft(): SetDraft {
    if (this.infos.length === 1) return draftOf(this.info.own ?? this.info.set);
    const sets = this.infos.map((i) => i.own ?? i.set);
    return sets.every((s) => sameSet(s, sets[0]!)) ? draftOf(sets[0]!) : { whole: null, rows: new Map() };
  }

  private mixed(): boolean {
    return this.draft.whole === null;
  }

  private async loadParent(): Promise<void> {
    const dir = this.paths[0]!.includes("/") ? this.paths[0]!.slice(0, this.paths[0]!.lastIndexOf("/")) : "";
    const r = await commands.accessGet([dir]);
    if (r.status === "ok") {
      this.parent = r.data[0] ?? null;
      this.build();
    }
  }

  private title(): string {
    if (this.paths.length > 1) return ac.titleMany(this.paths.length);
    return this.info.folder ? ac.titleFolder(baseName(this.paths[0]!) || this.paths[0]!) : ac.title(baseName(this.paths[0]!));
  }

  private build(): void {
    const keep = document.activeElement instanceof HTMLElement ? (document.activeElement.dataset["key"] ?? null) : null;
    const head = h("div", "ac-head");
    const title = h("strong", "ac-title", this.title());
    title.id = "ac-title";
    const close = h("button", "ac-close");
    close.type = "button";
    close.setAttribute("aria-label", ac.close);
    close.title = ac.close;
    close.append(icon("close"));
    close.dataset["key"] = "close";
    close.addEventListener("click", () => this.close());
    head.append(title, close);
    const table = h("div", "ac-table", this.info.table === "" ? ac.tableWhole : ac.table(baseName(this.info.table) || this.info.table));
    this.controls.clear();
    const body = this.body;
    body.replaceChildren();

    // The whole table.
    const board = this.paths.some(isBoard);
    const wholeRow = h("div", "ac-row ac-whole");
    wholeRow.append(h("span", "ac-name", ac.wholeTable));
    this.whole = segmented(ac.wholeTable, this.draft.whole, (v) => void this.pickWhole(v), "whole");
    wholeRow.append(this.whole.el);
    body.append(wholeRow, h("hr", "ac-rule"));

    // Each player.
    const players = this.info.players.filter((p) => p.id !== "");
    if (players.length === 0) body.append(h("p", "ac-line", ac.noPlayers));
    const list = h("ul", "ac-players");
    for (const p of players) {
      const li = h("li", "ac-row ac-player");
      li.dataset["account"] = p.id;
      const who = h("span", "ac-who");
      const avatar = h("span", "ac-avatar", [...p.name][0]?.toUpperCase() ?? "?");
      avatar.setAttribute("aria-hidden", "true");
      avatar.style.setProperty("--hue", String(hueOf(p.id)));
      who.append(avatar, h("span", "ac-name", p.name));
      const own = this.draft.rows.get(p.id) ?? null;
      const level = own ?? this.draft.whole;
      const seg = segmented(p.name, level, (v) => void this.pickPlayer(p.id, v), `p-${p.id}`);
      this.controls.set(p.id, seg);
      const note = h("span", "ac-hint");
      if (own !== null) {
        note.append(h("span", "", ac.own));
        const reset = h("button", "ac-reset", "↺");
        reset.type = "button";
        reset.title = ac.ownReset;
        reset.setAttribute("aria-label", `${ac.ownReset}: ${p.name}`);
        reset.addEventListener("click", () => this.resetPlayer(p.id));
        note.append(reset);
      } else if (p.editor) note.textContent = ac.editor;
      else if (!this.mixed()) note.textContent = ac.sameAsTable;
      li.append(who, seg.el, note);
      list.append(li);
    }
    body.append(list);

    // Warnings.
    const blocks = this.infos.reduce((n, i) => n + i.secret_blocks, 0);
    const boards = this.paths.every(isBoard);
    if (blocks > 0) body.append(this.warn(boards ? ac.secretBlocksBoard(blocks) : ac.secretBlocks(blocks)));
    if (board) body.append(h("p", "ac-line", ac.boardNote));
    if (this.mixed()) body.append(h("p", "ac-line", ac.mixed));

    if (this.apply) this.buildApply(body);
    else this.buildFollow(body);

    // More options: the secret name, of a note.
    if (this.infos.length === 1 && !this.info.folder && /\.md$/i.test(this.paths[0]!)) {
      const more = h("details", "ac-more");
      more.append(h("summary", "", ac.more));
      const label = h("label", "ac-check");
      const box = h("input");
      box.type = "checkbox";
      box.checked = this.info.secret_name;
      box.addEventListener("change", () => void this.saveSecretName(box.checked, box));
      label.append(box, h("span", "", `${ac.secretName} — ${ac.secretNameHint}`));
      more.append(label);
      body.append(more);
    }
    const foot = h("div", "ac-foot");
    foot.append(h("span", "ac-master", ac.master), this.feedback);
    this.pop.replaceChildren(head, table, body, foot);
    if (keep) this.pop.querySelector<HTMLElement>(`[data-key="${keep}"]`)?.focus();
  }

  private warn(text: string): HTMLElement {
    const p = h("p", "ac-warn");
    p.append(h("span", "ac-warn-mark", "⚠"), h("span", "", text));
    return p;
  }

  /** A file: where its access comes from, and the way back. */
  private buildFollow(body: HTMLElement): void {
    const info = this.info;
    const line = h("p", "ac-line");
    const folderName = (p: string): string => baseName(p) || p;
    if (info.own) {
      const above = this.parent && (this.parent.own || this.parent.why.kind !== "default") ? this.parent : null;
      line.textContent = above ? ac.ownSet(folderName(this.parent!.path === "" ? this.info.table || "" : this.parent!.path) || ac.wholeTable) : ac.ownSetPlain;
      const back = button("ac-follow", above ? ac.followBtn : ac.followDefault);
      back.dataset["key"] = "follow";
      back.addEventListener("click", () => void this.follow());
      body.append(line, back);
    } else if (info.why.kind === "folder") {
      line.textContent = ac.follows(folderName(info.why.path));
      body.append(line);
    } else if (info.why.kind === "default") {
      line.textContent = ac.followsTable;
      body.append(line);
    }
  }

  /** A folder, or several files: the count, the button and the exceptions. */
  private buildApply(body: HTMLElement): void {
    const files = this.infos.reduce((n, i) => n + (i.folder ? i.files : 1), 0);
    const exceptions = this.infos.flatMap((i) => i.exceptions);
    const count = h("p", "ac-line ac-count", this.paths.length > 1 && !this.info.folder ? ac.applyMany(this.paths.length) : ac.applyCount(files, exceptions.length));
    const go = button("btn ac-apply", ac.apply);
    go.dataset["key"] = "apply";
    go.disabled = this.mixed();
    go.addEventListener("click", () => void this.applyNow(go));
    body.append(count, go);
    if (this.info.folder && this.infos.length === 1) {
      const sec = h("div", "ac-exceptions");
      sec.append(h("strong", "", ac.exceptions(exceptions.length)));
      if (exceptions.length === 0) sec.append(h("p", "ac-line", ac.noExceptions));
      const ul = h("ul", "ac-ex-list");
      for (const ex of exceptions) {
        const li = h("li", "ac-ex");
        li.append(h("span", "ac-ex-name", ex.path), h("span", "ac-ex-sum", this.summary(ex.set)));
        const back = h("button", "ac-reset", "↺");
        back.type = "button";
        back.title = ac.followBtn;
        back.setAttribute("aria-label", `${ac.followBtn}: ${ex.path}`);
        back.addEventListener("click", () => void this.followOne(ex.path, li));
        li.append(back);
        ul.append(li);
      }
      sec.append(ul);
      body.append(sec);
    }
  }

  /** "Ana edita · 2 veem" for a set. */
  private summary(set: AccessSetView): string {
    const people = this.info.players;
    const level = (id: string): AccessLevel => set.rows.find((r) => r.account === id)?.level ?? set.whole;
    const edits = people.filter((p) => level(p.id) === "edit");
    const sees = people.filter((p) => level(p.id) === "see");
    const parts: string[] = [];
    if (set.whole === "edit" && edits.length === people.length && people.length > 0) parts.push(ac.summaryTable);
    else {
      if (edits.length > 0) parts.push(ac.summaryEdits(edits.map((p) => p.name)));
      if (sees.length > 0) parts.push(ac.summarySees(sees.length));
    }
    return parts.length > 0 ? parts.join(" · ") : ac.summaryNone;
  }

  // ---- changes

  private async confirmEdit(level: AccessLevel, was: AccessLevel | null): Promise<boolean> {
    const blocks = this.infos.reduce((n, i) => n + i.secret_blocks, 0);
    if (level !== "edit" || was === "edit" || blocks === 0) return true;
    return ask(this.paths.every(isBoard) ? ac.askSecretBoard(blocks) : ac.askSecret(blocks), { yes: ac.askGive, no: ac.askCancel });
  }

  private async pickWhole(level: AccessLevel): Promise<void> {
    if (!(await this.confirmEdit(level, this.draft.whole))) return this.build();
    this.draft.whole = level;
    // A row that now says what the whole table's says is not a difference.
    for (const [a, l] of [...this.draft.rows]) if (l === level) this.draft.rows.delete(a);
    this.build();
    if (!this.apply) this.save();
  }

  private async pickPlayer(account: string, level: AccessLevel): Promise<void> {
    const was = this.draft.rows.get(account) ?? this.draft.whole;
    if (!(await this.confirmEdit(level, was))) return this.build();
    // A choice that is the whole table's value is no row of its own.
    if (level === this.draft.whole) this.draft.rows.delete(account);
    else this.draft.rows.set(account, level);
    // A mixed selection is made alike by the first choice.
    if (this.draft.whole === null) this.draft.whole = "none";
    this.build();
    if (!this.apply) this.save();
  }

  private resetPlayer(account: string): void {
    this.draft.rows.delete(account);
    this.build();
    if (!this.apply) this.save();
  }

  private say(text: string, bad = false): void {
    window.clearTimeout(this.timer);
    this.feedback.textContent = text;
    this.feedback.classList.toggle("is-bad", bad);
    if (text && !bad) this.timer = window.setTimeout(() => (this.feedback.textContent = ""), 2400);
  }

  /** Save the draft of a file at once; one write after the other. */
  private save(): void {
    const change: AccessChange = { kind: "set", set: viewOf(this.draft), secret_name: null };
    this.say(ac.saving);
    this.queue = this.queue.then(async () => {
      const r = await commands.accessSet(this.paths, change);
      if (r.status !== "ok") return this.say(said(r.error), true);
      this.say(ac.saved);
      await this.refresh();
    });
  }

  private async refresh(): Promise<void> {
    const r = await commands.accessGet(this.paths);
    if (r.status !== "ok" || !r.data[0]) return;
    this.info = r.data[0];
    this.infos.splice(0, this.infos.length, ...r.data);
    if (!this.apply) this.draft = draftOf(this.info.own ?? this.info.set);
    if (!this.apply && this.info.own && !this.parent) await this.loadParent();
    this.build();
  }

  private async applyNow(go: HTMLButtonElement): Promise<void> {
    go.disabled = true;
    this.say(ac.saving);
    const r = await commands.accessSet(this.paths, { kind: "set", set: viewOf(this.draft), secret_name: null });
    if (r.status !== "ok") {
      go.disabled = false;
      return this.say(said(r.error), true);
    }
    this.say(ac.applied(r.data.changed));
    const got = await commands.accessGet(this.paths);
    if (got.status === "ok" && got.data[0]) {
      this.infos.splice(0, this.infos.length, ...got.data);
      this.info = got.data[0];
    }
    this.build();
    this.say(ac.applied(r.data.changed));
  }

  private async follow(): Promise<void> {
    const r = await commands.accessSet(this.paths, { kind: "follow" });
    if (r.status !== "ok") return this.say(said(r.error), true);
    this.say(ac.saved);
    this.parent = null;
    await this.refresh();
  }

  private async followOne(path: string, li: HTMLElement): Promise<void> {
    const r = await commands.accessSet([path], { kind: "follow" });
    if (r.status !== "ok") return this.say(said(r.error), true);
    li.remove();
    this.say(ac.saved);
    await this.refresh();
  }

  private async saveSecretName(on: boolean, box: HTMLInputElement): Promise<void> {
    const r = await commands.accessSet(this.paths, { kind: "set", set: viewOf(draftOf(this.info.own ?? this.info.set)), secret_name: on });
    if (r.status !== "ok") {
      box.checked = !on;
      return this.say(said(r.error), true);
    }
    this.say(ac.saved);
  }

  // ---- placing and closing

  private place(): void {
    const p = this.pop;
    const sheet = narrow.matches;
    p.classList.toggle("is-sheet", sheet);
    if (sheet) {
      p.style.left = p.style.top = p.style.width = "";
      return;
    }
    const w = Math.min(360, innerWidth - 24);
    p.style.width = `${w}px`;
    const r = this.anchor?.getBoundingClientRect();
    const left = r ? r.right - w : (innerWidth - w) / 2;
    const top = r ? r.bottom + 6 : 72;
    const at = placeInView(left, top, w, p.offsetHeight, r ? r.top : top);
    p.style.left = `${at.left}px`;
    p.style.top = `${at.top}px`;
  }

  close(): void {
    window.clearTimeout(this.timer);
    document.removeEventListener("keydown", this.onKey, true);
    document.removeEventListener("pointerdown", this.onOutside, true);
    removeEventListener("resize", this.onResize);
    this.pop.remove();
    if (open === this) open = null;
    // A save draws the tree anew: the row that opened the dialog is another element now.
    const back = this.opener?.isConnected ? this.opener : this.openerAt ? document.querySelector<HTMLElement>(`#notes ${this.openerAt}`) : null;
    back?.focus({ preventScroll: true });
  }
}

/** A hue from an account id, the same for the same person everywhere. */
function hueOf(id: string): number {
  let n = 0;
  for (const c of id) n = (n * 31 + c.codePointAt(0)!) % 360;
  return n;
}
