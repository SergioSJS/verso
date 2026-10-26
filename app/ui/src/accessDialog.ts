// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The one "Access…" dialog (ADR 0113 section F; the mockup approved on
// 2026-10-25): one compact <select> (*Não vê | Vê | Edita*) for the whole
// table and for each player, on any file or folder, or on a selection. A
// popover beside the icon that opened it on a desktop, a bottom sheet with
// 44 px targets on a phone. On a file every choice saves at once and answers
// in the footer (*Salvo ✓ · Desfazer*, or the error in red); on a folder, or
// a selection, the choice is applied with a footer button (Cancelar /
// Aplicar), because it replaces what is inside: the count of files that
// change is said then, and so is the question of the files with an access
// of their own, which have a second view in the same popover. A row says
// where its level comes from (*segue a mesa*, *segue a pasta*, *acesso
// próprio*); a file with a set of its own under a folder reads *Acesso
// próprio* with *↺ Seguir a pasta*. The window never decides what a level
// means: the server did (`access_get`), and decides again at every write.

import { ac } from "./accessStrings";
import { commands, type AccessChange, type AccessInfo, type AccessLevel, type AccessSetView, type ContractError } from "./bindings";
import { onlineIds } from "./campaignParts";
import { narrow } from "./chrome";
import { ask } from "./dialog";
import { h } from "./dom";
import { errorSentence, failSaid, told } from "./errors";
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
    // Refused or out of reach: the person sees it, not only the log.
    failSaid(errorSentence(r.error), r.error);
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
  /** What the dialog opened with (a folder's or a selection's "changed?" is measured against it). */
  private base: AccessSetView | null;
  private info: AccessInfo;
  private parent: AccessInfo | null = null;
  private queue: Promise<void> = Promise.resolve();
  private timer = 0;
  /** A file: the write that puts back what the last change replaced. */
  private undo: AccessChange | null = null;
  /** A folder: the files with an access of their own are kept (default) or follow the folder. */
  private keepOwn = true;
  private view: "main" | "exceptions" = "main";
  private query = "";
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
    this.base = this.draft.whole === null ? null : viewOf(this.draft);
    const pop = this.pop;
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-modal", "false");
    pop.setAttribute("aria-label", this.title());
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
      // A control inside a closed <details> cannot take the focus (only its summary can).
      const list = [...pop.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), summary, select, ul[tabindex]")].filter(
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
    queueMicrotask(() => (narrow.matches ? pop.querySelector<HTMLElement>(".ac-close") : pop.querySelector<HTMLElement>("select"))?.focus());
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

  /** A folder's or a selection's draft differs from what the dialog opened with. */
  private dirty(): boolean {
    return this.draft.whole !== null && (this.base === null || !sameSet(viewOf(this.draft), this.base));
  }

  private async loadParent(): Promise<void> {
    const dir = this.paths[0]!.includes("/") ? this.paths[0]!.slice(0, this.paths[0]!.lastIndexOf("/")) : "";
    const r = await commands.accessGet([dir]);
    if (r.status === "ok") {
      this.parent = r.data[0] ?? null;
      this.build();
    }
  }

  /** The dialog's accessible name. */
  private title(): string {
    if (this.paths.length > 1) return ac.titleMany(this.paths.length);
    return this.info.folder ? ac.titleFolder(baseName(this.paths[0]!) || this.paths[0]!) : ac.title(baseName(this.paths[0]!));
  }

  private files(): number {
    return this.infos.reduce((n, i) => n + (i.folder ? i.files : 1), 0);
  }

  private exceptions(): AccessInfo["exceptions"] {
    return this.info.folder && this.infos.length === 1 ? this.info.exceptions : [];
  }

  private build(): void {
    const keep = document.activeElement instanceof HTMLElement ? (document.activeElement.dataset["key"] ?? null) : null;
    const grab = h("div", "ac-grab");
    grab.setAttribute("aria-hidden", "true");
    const head = h("div", "ac-head");
    const title = h("h3", "ac-title");
    const name = this.paths.length > 1 ? "" : baseName(this.paths[0]!) || this.paths[0]!;
    if (this.paths.length > 1) title.textContent = ac.titleMany(this.paths.length);
    else title.append(h("span", "ac-pre", this.info.folder ? ac.preFolder : ac.preFile), name);
    const close = h("button", "ac-close");
    close.type = "button";
    close.setAttribute("aria-label", ac.close);
    close.title = ac.close;
    close.append(icon("close"));
    close.dataset["key"] = "close";
    close.addEventListener("click", () => this.close());
    head.append(title, close);
    this.body.replaceChildren();
    const foot = h("div", "ac-foot");
    if (this.view === "exceptions") this.buildExceptions(this.body, foot);
    else {
      const table = h("div", "ac-table");
      table.textContent = this.info.table === "" ? ac.tableWhole : this.apply && this.info.folder ? ac.tableFiles(baseName(this.info.table) || this.info.table, this.info.files) : ac.table(baseName(this.info.table) || this.info.table);
      this.body.append(table);
      this.buildMain(this.body);
      this.buildFoot(foot);
    }
    this.pop.replaceChildren(grab, head, this.body, foot);
    if (keep) this.pop.querySelector<HTMLElement>(`[data-key="${keep}"]`)?.focus();
  }

  // ---- the main view

  /** One compact select: the level of one row, named after the person. */
  private select(name: string, level: AccessLevel | null, pick: (level: AccessLevel) => void, key: string): HTMLElement {
    const wrap = h("span", `ac-sel lvl-${level ?? "mixed"}`);
    const sel = h("select");
    sel.setAttribute("aria-label", name);
    sel.dataset["key"] = key;
    if (level === null) {
      const o = h("option", "", ac.mixedOption);
      o.value = "";
      sel.append(o);
    }
    for (const [v, label] of [["none", ac.none], ["see", ac.see], ["edit", ac.edit]] as const) {
      const o = h("option", "", label);
      o.value = v;
      sel.append(o);
    }
    sel.value = level ?? "";
    sel.addEventListener("change", () => pick(sel.value as AccessLevel));
    wrap.append(sel);
    return wrap;
  }

  private rowOf(avatar: HTMLElement, who: HTMLElement, control: HTMLElement): HTMLElement {
    const li = h("li", "ac-row");
    li.append(avatar, who, control);
    return li;
  }

  private buildMain(body: HTMLElement): void {
    const list = h("ul", "ac-players");
    const board = this.paths.some(isBoard);

    // The whole table.
    const star = h("span", "ac-avatar is-table", "◎");
    star.setAttribute("aria-hidden", "true");
    const whoAll = h("div", "ac-who");
    whoAll.append(h("b", "ac-name", ac.wholeTable), h("small", "ac-hint", this.apply ? ac.hintWholeFolder : ac.hintWholeFile));
    const all = this.rowOf(star, whoAll, this.select(ac.wholeTable, this.draft.whole, (v) => void this.pickWhole(v), "whole"));
    all.classList.add("ac-whole");
    list.append(all);

    // Each player.
    const players = this.info.players.filter((p) => p.id !== "");
    const online = onlineIds(this.info.table);
    const followsFolder = !this.apply && !this.info.own && this.info.why.kind === "folder";
    for (const p of players) {
      const li = h("li", "ac-row ac-player");
      li.dataset["account"] = p.id;
      const avatar = h("span", "ac-avatar", [...p.name][0]?.toUpperCase() ?? "?");
      avatar.setAttribute("aria-hidden", "true");
      const who = h("div", "ac-who");
      const nm = h("b", "ac-name", p.name);
      if (online.has(p.id)) {
        const dot = h("span", "ac-on");
        dot.title = ac.online;
        dot.setAttribute("role", "img");
        dot.setAttribute("aria-label", ac.online);
        nm.append(dot);
      }
      const own = this.draft.rows.get(p.id) ?? null;
      const level = own ?? this.draft.whole;
      const note = h("small", "ac-hint");
      if (p.editor) note.textContent = ac.editor;
      else if (own !== null && !followsFolder) {
        note.classList.add("is-own");
        note.textContent = ac.hintOwn;
      } else note.textContent = followsFolder ? ac.hintFollowsFolder : ac.hintFollowsTable;
      who.append(nm, note);
      li.append(avatar, who, this.select(p.name, level, (v) => void this.pickPlayer(p.id, v), `p-${p.id}`));
      list.append(li);
    }
    body.append(list);
    if (players.length === 0) body.append(h("p", "ac-line", ac.noPlayers));

    // Warnings.
    const blocks = this.infos.reduce((n, i) => n + i.secret_blocks, 0);
    const boards = this.paths.every(isBoard);
    if (blocks > 0) body.append(this.warn(boards ? ac.secretBlocksBoard(blocks) : ac.secretBlocks(blocks)));
    if (board) body.append(h("p", "ac-line", ac.boardNote));
    if (this.mixed()) body.append(h("p", "ac-line", ac.mixed));

    if (this.apply) this.buildOwn(body);
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
  }

  private warn(text: string): HTMLElement {
    const p = h("p", "ac-warn");
    p.append(h("span", "", text));
    return p;
  }

  /** A file: where its access comes from, and the way back. */
  private buildFollow(body: HTMLElement): void {
    const info = this.info;
    const folderName = (p: string): string => baseName(p) || p;
    const line = h("div", "ac-follow");
    if (info.own) {
      const above = this.parent && (this.parent.own || this.parent.why.kind !== "default") ? this.parent : null;
      line.append(h("span", "", above ? ac.ownSet(folderName(this.parent!.path === "" ? this.info.table || "" : this.parent!.path) || ac.wholeTable) : ac.ownSetPlain));
      const back = h("button", "ac-lk", above ? ac.followBtn : ac.followDefault);
      back.type = "button";
      back.dataset["key"] = "follow";
      back.addEventListener("click", () => void this.follow());
      line.append(back);
    } else if (info.why.kind === "folder") line.append(h("span", "", ac.followsPre), h("b", "", folderName(info.why.path)));
    else if (info.why.kind === "default") line.append(h("span", "", ac.followsTable));
    else return;
    body.append(line);
  }

  /** A folder: the files with an access of their own, as one line and a second view; and, once
   *  something changed, the question of what the change does to them. */
  private buildOwn(body: HTMLElement): void {
    const exs = this.exceptions();
    if (exs.length === 0) return;
    if (this.dirty()) {
      const w = h("div", "ac-warn");
      w.setAttribute("role", "status");
      const q = h("span");
      q.append(h("b", "", ac.ownMany(exs.length)), ` ${ac.overwriteAsk}`);
      const opts = h("div", "ac-warn-opts");
      for (const [keepIt, label] of [[true, ac.keepThem], [false, ac.followAll]] as const) {
        const l = h("label");
        const r = h("input");
        r.type = "radio";
        r.name = "ac-keep";
        r.checked = this.keepOwn === keepIt;
        r.dataset["key"] = keepIt ? "keep" : "overwrite";
        r.addEventListener("change", () => {
          this.keepOwn = keepIt;
          this.build();
        });
        l.append(r, ` ${label}`);
        opts.append(l);
      }
      w.append(q, opts);
      body.append(w);
    }
    const sum = h("div", "ac-summary");
    const b = h("button");
    b.type = "button";
    b.dataset["key"] = "exceptions";
    b.setAttribute("aria-expanded", "false");
    const n = h("span", "ac-n", ac.exSummary(exs.length));
    b.append(h("span", "", ""), h("span", "ac-chev", `${ac.viewEx} ›`));
    b.firstElementChild!.append(n, ac.exSummaryRest);
    b.addEventListener("click", () => {
      this.view = "exceptions";
      this.query = "";
      this.build();
      this.pop.querySelector<HTMLElement>('[data-key="search"]')?.focus();
    });
    sum.append(b);
    body.append(sum);
  }

  private buildFoot(foot: HTMLElement): void {
    if (this.apply) {
      foot.append(this.feedback);
      if (this.dirty()) foot.append(h("span", "", ac.changes(this.files() - (this.keepOwn ? this.exceptions().length : 0))));
      foot.append(h("span", "ac-sp"));
      const cancel = h("button", "btn", ac.cancel);
      cancel.type = "button";
      cancel.dataset["key"] = "cancel";
      cancel.addEventListener("click", () => this.close());
      const go = h("button", "btn primary ac-apply", ac.apply);
      go.type = "button";
      go.dataset["key"] = "apply";
      go.disabled = !this.dirty();
      go.addEventListener("click", () => void this.applyNow(go));
      foot.append(cancel, go);
      return;
    }
    foot.append(this.feedback);
    if (this.undo) foot.append(this.undoButton());
    foot.append(h("span", "ac-sp"), h("span", "", ac.masterShort));
  }

  private undoButton(): HTMLButtonElement {
    const b = h("button", "ac-lk", ac.undo);
    b.type = "button";
    b.dataset["key"] = "undo";
    b.addEventListener("click", () => void this.undoLast());
    return b;
  }

  // ---- the second view: the files with an access of their own

  private buildExceptions(body: HTMLElement, foot: HTMLElement): void {
    const exs = this.exceptions();
    const crumb = h("div", "ac-crumb");
    const back = h("button", "ac-lk", `‹ ${ac.back}`);
    back.type = "button";
    back.dataset["key"] = "back";
    back.addEventListener("click", () => {
      this.view = "main";
      this.build();
      this.pop.querySelector<HTMLElement>('[data-key="exceptions"]')?.focus();
    });
    crumb.append(back, h("span", "", ac.exTitle(exs.length)));
    const search = h("div", "ac-search");
    const input = h("input");
    input.type = "search";
    input.dataset["key"] = "search";
    input.placeholder = ac.searchPlaceholder(exs.length);
    input.setAttribute("aria-label", ac.searchLabel);
    input.value = this.query;
    search.append(input);
    const ul = h("ul", "ac-ex-list");
    ul.tabIndex = 0;
    ul.setAttribute("aria-label", ac.exList);
    const paint = (): void => {
      const q = this.query.trim().toLowerCase();
      const shown = exs.filter((ex) => ex.path.toLowerCase().includes(q));
      ul.replaceChildren(
        ...shown.map((ex) => {
          const li = h("li", "ac-ex");
          const who = h("div", "ac-who");
          const nm = h("b", "ac-name", baseName(ex.path) || ex.path);
          nm.title = ex.path;
          who.append(nm, h("small", "ac-hint", this.summary(ex.set)));
          const go = h("button", "ac-lk", ac.followShort);
          go.type = "button";
          go.setAttribute("aria-label", `${ac.followBtn}: ${ex.path}`);
          go.addEventListener("click", () => void this.followOne(ex.path));
          li.append(who, go);
          return li;
        }),
      );
      if (shown.length === 0) ul.append(h("li", "ac-ex-none", ac.noMatch));
    };
    input.addEventListener("input", () => {
      this.query = input.value;
      paint();
    });
    paint();
    body.append(crumb, search, ul);
    foot.append(this.feedback, h("span", "ac-sp"));
    const all = h("button", "btn", ac.followAll);
    all.type = "button";
    all.dataset["key"] = "follow-all";
    all.disabled = exs.length === 0;
    all.addEventListener("click", () => void this.followAllExceptions());
    foot.append(all);
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

  private say(text: string, bad = false, linger = 2400): void {
    window.clearTimeout(this.timer);
    this.feedback.textContent = text;
    this.feedback.classList.toggle("is-bad", bad);
    if (text && !bad) {
      this.timer = window.setTimeout(() => {
        this.feedback.textContent = "";
        this.undo = null;
        this.pop.querySelector('[data-key="undo"]')?.remove();
      }, linger);
    }
  }

  /** What puts back the file's access as the server holds it now. */
  private previous(): AccessChange {
    return this.info.own ? { kind: "set", set: this.info.own, secret_name: null } : { kind: "follow" };
  }

  /** Save the draft of a file at once; one write after the other. */
  private save(): void {
    const change: AccessChange = { kind: "set", set: viewOf(this.draft), secret_name: null };
    this.say(ac.saving);
    this.queue = this.queue.then(async () => {
      const before = this.previous();
      const r = await commands.accessSet(this.paths, change);
      if (r.status !== "ok") {
        this.undo = null;
        return this.say(said(r.error), true);
      }
      this.undo = before;
      this.say(ac.saved, false, 10000);
      await this.refresh();
    });
  }

  private async undoLast(): Promise<void> {
    const back = this.undo;
    if (!back) return;
    this.undo = null;
    const r = await commands.accessSet(this.paths, back);
    if (r.status !== "ok") return this.say(said(r.error), true);
    this.say(ac.undone);
    this.parent = null;
    await this.refresh();
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
    // Setting a folder replaces what is inside it, the files with an access of their own too, unless the server is
    // told to keep them: in the one write, so none of them ever follows the folder, not even for a moment.
    const keep = this.keepOwn && this.exceptions().length > 0;
    const r = await commands.accessSet(this.paths, { kind: "set", set: viewOf(this.draft), secret_name: null, keep_exceptions: keep });
    if (r.status !== "ok") {
      go.disabled = false;
      return this.say(said(r.error), true);
    }
    const got = await commands.accessGet(this.paths);
    if (got.status === "ok" && got.data[0]) {
      this.infos.splice(0, this.infos.length, ...got.data);
      this.info = got.data[0];
    }
    this.base = this.draft.whole === null ? null : viewOf(this.draft);
    this.build();
    this.say(ac.applied(r.data.changed));
  }

  private async follow(): Promise<void> {
    const before = this.previous();
    const r = await commands.accessSet(this.paths, { kind: "follow" });
    if (r.status !== "ok") return this.say(said(r.error), true);
    this.undo = before;
    this.say(ac.saved, false, 10000);
    this.parent = null;
    await this.refresh();
  }

  private async followOne(path: string): Promise<void> {
    const r = await commands.accessSet([path], { kind: "follow" });
    if (r.status !== "ok") return this.say(said(r.error), true);
    await this.refresh();
    if (this.exceptions().length === 0) this.view = "main";
    this.build();
    this.say(ac.saved);
  }

  private async followAllExceptions(): Promise<void> {
    const exs = this.exceptions();
    if (exs.length === 0) return;
    if (!(await ask(ac.followAllAsk(exs.length), { yes: ac.followAllGo, no: ac.askCancel }))) return;
    const r = await commands.accessSet(exs.map((e) => e.path), { kind: "follow" });
    if (r.status !== "ok") return this.say(said(r.error), true);
    await this.refresh();
    this.view = "main";
    this.build();
    this.say(ac.saved);
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
    const w = Math.min(380, innerWidth - 24);
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
    // A button the pointer clicked does not always take the focus (WebKit), and a hover summary is gone by now: the anchor (the indicator) is the way back then.
    const live = this.opener?.isConnected && this.opener !== document.body ? this.opener : null;
    const row = this.openerAt ? document.querySelector<HTMLElement>(`#notes ${this.openerAt}`) : null;
    const back = live ?? row ?? (this.anchor?.isConnected ? this.anchor : null);
    back?.focus({ preventScroll: true });
  }
}

/** A hue from an account id, the same for the same person everywhere. */
function hueOf(id: string): number {
  let n = 0;
  for (const c of id) n = (n * 31 + c.codePointAt(0)!) % 360;
  return n;
}
