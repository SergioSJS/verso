// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The layout editor's window (ADR 0099 item 8, the maintainer on the first
// one: "péssimo"; on fixing a copied layout: "impossível editar"). What it
// beats of Fantasy Statblocks' editor: the card is beside the tree, drawn as
// every change is made — not in a tab of its own; a block's options open
// under it, not in a stack of dialogs; a move never jitters, by keys or by
// a drag that shows where it lands; every change undoes; leaving with
// changes asks; a save that would overwrite another person's says so and
// offers their version or a copy, never silently. On a narrow window the
// tree and the card are two tabs over the same state.
//
// The window's dialog stack, its question and its live status line are
// given (`EditorDeps`), so this builds in a test page too.

import { icon } from "../../icons";
import { h } from "../h";
import type { BlockType, Layout } from "../model";
import { BLOCK_TYPES } from "../model";
import { renderStatblock } from "../render";
import { allLayouts, freeId, reloadFolder, removeLayout, saveLayout, canWriteLayouts, type StoredLayout } from "../store";
import { S, word } from "../strings";
import { validateLayout } from "../validate";
import { idProblem, layoutForm } from "./layoutForm";
import { optionsForm } from "./options";
import { layoutKeys, sampleText, sheetKeys, type PreviewSource } from "./sample";
import { findBlock, freeBlockId, insertAt, isContainer, newBlock, placeOf, Session, type Place } from "./state";
import { E } from "./strings";
import { blockName, renderTree } from "./tree";

export interface EditorDeps {
  ask(message: string, opts: { yes: string; no: string }): Promise<boolean>;
  opened(el: HTMLElement): void;
  closed(el: HTMLElement): void;
  asDialog(el: HTMLElement, label: string, close: () => void, labelledBy?: string): void;
}

export interface EditorOpen {
  /** The layout to edit: a folder's (its revision with it), or a copy not
   *  yet saved (`source` not "folder"). */
  stored: StoredLayout;
  /** Statblocks the card can be drawn from (the open note's). */
  sources: PreviewSource[];
  /** Said at the top: a built-in was copied, the copy cannot be saved. */
  notice?: string;
  onDone?: () => void;
}

/** The block a validator's path names (`blocks[2].nested[0]`), or null. */
export function blockAtPath(layout: Layout, path: string): string | null {
  let list = layout.blocks;
  let hit: string | null = null;
  const re = /(blocks|nested|branches)\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  let branchOf: (typeof layout.blocks)[number] | null = null;
  while ((m = re.exec(path))) {
    const i = Number(m[2]);
    if (m[1] === "branches") {
      if (branchOf?.type !== "conditional") return hit;
      const br = branchOf.branches[i];
      if (!br) return hit;
      list = br.nested;
      continue;
    }
    const b = list[i];
    if (!b) return hit;
    hit = b.id;
    branchOf = b;
    list = isContainer(b) ? b.nested : [];
  }
  return hit;
}

export class LayoutEditor {
  readonly el: HTMLElement;
  readonly session: Session;
  private selected: string | null = null;
  private readonly folded = new Set<string>();
  /** The folder file this edits, null while it is a copy not yet saved. */
  private origId: string | null;
  private revision: string | null;
  private sourceIndex = -1;
  private tab: "tree" | "preview" = "tree";
  private saving = false;
  private readonly live: HTMLElement;
  private readonly parts: Record<"title" | "dirty" | "undo" | "redo" | "save" | "notice" | "stale" | "layout" | "tree" | "problems" | "card" | "source" | "keys" | "main", HTMLElement>;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private layoutOpen = false;

  constructor(
    private readonly open: EditorOpen,
    private readonly deps: EditorDeps,
  ) {
    this.session = new Session(open.stored.layout);
    this.origId = open.stored.source === "folder" ? open.stored.layout.id : null;
    this.revision = open.stored.source === "folder" ? (open.stored.revision ?? null) : null;
    this.sourceIndex = open.sources.length > 0 ? 0 : -1;
    this.selected = this.session.layout.blocks[0]?.id ?? null;
    const e = E();
    this.el = h("div", "quick sbe-shade");
    const box = h("div", "sbe-box");
    const head = h("div", "sbe-head");
    const title = h("h2", "sbe-title");
    title.id = `sbe-title-${Math.random().toString(36).slice(2, 8)}`;
    const dirty = h("span", "sbe-dirty");
    const tool = (ic: string, label: string, run: () => void, cls = "sbe-tool") => {
      const b = h("button", cls);
      b.type = "button";
      b.title = label;
      b.setAttribute("aria-label", label);
      b.append(icon(ic));
      b.addEventListener("click", run);
      return b;
    };
    const undo = tool("undo", e.undo, () => this.undo());
    const redo = tool("redo", e.redo, () => this.redo());
    const save = h("button", "save sbe-save", e.save);
    save.type = "button";
    save.addEventListener("click", () => void this.save());
    const close = tool("close", e.close, () => void this.requestClose());
    head.append(title, dirty, undo, redo, save, close);
    const notice = h("p", "sbe-notice");
    const stale = h("div", "sbe-stale");
    stale.hidden = true;
    stale.setAttribute("role", "alert");

    const tabs = h("div", "sbe-tabs");
    tabs.setAttribute("role", "tablist");
    const main = h("div", "sbe-main");
    const left = h("section", "sbe-left");
    const right = h("section", "sbe-right");
    left.id = `${title.id}-tree`;
    right.id = `${title.id}-card`;
    for (const [which, label, panel] of [["tree", e.tree, left], ["preview", e.preview, right]] as const) {
      const t = h("button", "sbe-tab", label);
      t.type = "button";
      t.setAttribute("role", "tab");
      t.setAttribute("aria-controls", panel.id);
      t.dataset["tab"] = which;
      panel.setAttribute("role", "tabpanel");
      t.addEventListener("click", () => {
        this.tab = which;
        this.paintTabs(tabs, main);
      });
      tabs.append(t);
    }

    const layoutBox = h("details", "sbe-layout");
    layoutBox.append(h("summary", "sbe-subhead", e.layoutTab));
    const layoutInner = h("div");
    layoutBox.append(layoutInner);
    layoutBox.addEventListener("toggle", () => (this.layoutOpen = layoutBox.open));
    const add = this.addMenu();
    const treeHost = h("div", "sbe-tree-host");
    const problems = h("div", "sbe-problems");
    left.append(layoutBox, add, treeHost, problems);

    const pick = h("select", "sbe-input sbe-source");
    const pickLabel = h("label", "sbe-label", e.sampleOf);
    pick.id = `${title.id}-src`;
    pickLabel.htmlFor = pick.id;
    pick.addEventListener("change", () => {
      this.sourceIndex = Number(pick.value);
      this.renderPreview();
    });
    const card = h("div", "sbe-card");
    const srcRow = h("div", "sbe-source-row");
    srcRow.append(pickLabel, pick);
    right.append(srcRow, card);
    main.append(left, right);

    this.live = h("div", "sr-only");
    this.live.setAttribute("role", "status");
    this.live.setAttribute("aria-live", "polite");
    const keys = h("datalist");
    keys.id = `${title.id}-keys`;
    box.append(head, notice, stale, tabs, main, this.live, keys);
    this.el.append(box);
    this.parts = { title, dirty, undo, redo, save, notice, stale, layout: layoutInner, tree: treeHost, problems, card, source: pick, keys, main };
    if (open.notice) notice.textContent = open.notice;
    else notice.hidden = true;
    deps.asDialog(this.el, e.title(""), () => void this.requestClose(), title.id);
    this.el.addEventListener("keydown", (ev) => this.onKey(ev));
    this.paintTabs(tabs, main);
  }

  /** Mount the window and draw it. */
  mount(): void {
    document.body.append(this.el);
    this.deps.opened(this.el);
    this.renderAll();
    this.el.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')?.focus();
  }

  say(text: string): void {
    this.live.textContent = "";
    const l = this.live;
    setTimeout(() => (l.textContent = text), 20);
  }

  private paintTabs(tabs: HTMLElement, main: HTMLElement): void {
    main.dataset["tab"] = this.tab;
    for (const t of tabs.querySelectorAll<HTMLElement>(".sbe-tab")) {
      const on = t.dataset["tab"] === this.tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    }
  }

  private onKey(ev: KeyboardEvent): void {
    const mod = ev.metaKey || ev.ctrlKey;
    if (!mod) return;
    const k = ev.key.toLowerCase();
    if (k === "z" && !ev.shiftKey) this.undo();
    else if ((k === "z" && ev.shiftKey) || k === "y") this.redo();
    else if (k === "s") void this.save();
    else return;
    ev.preventDefault();
    ev.stopPropagation();
  }

  private undo(): void {
    if (this.session.undo()) {
      this.keepSelection();
      this.renderAll();
      this.say(E().undone);
    }
  }
  private redo(): void {
    if (this.session.redo()) {
      this.keepSelection();
      this.renderAll();
      this.say(E().redone);
    }
  }
  private keepSelection(): void {
    const id = this.selected?.split("#")[0];
    if (id && !findBlock(this.session.layout, id)) this.selected = this.session.layout.blocks[0]?.id ?? null;
  }

  private taken = (id: string): boolean => allLayouts().some((s) => s.layout.id === id && (s.source !== "folder" || s.layout.id !== this.origId));

  /** A structural change: a step, announced, everything drawn again. */
  change(next: Layout | null, said: string, select?: string | null): void {
    if (!this.session.apply(next)) {
      this.say(E().cantMove);
      return;
    }
    if (select !== undefined) this.selected = select;
    this.renderAll(select !== undefined ? select : undefined);
    this.say(said);
  }

  /** A form's change: a step (typing in one field merges), drawn lightly
   *  — or all again when the form changed shape. */
  edit(next: Layout | null, key: string, reform = false): void {
    if (!this.session.apply(next, key)) return;
    if (reform) this.renderAll();
    else this.renderLight();
  }

  private addMenu(): HTMLElement {
    const e = E();
    const wrap = h("div", "sbe-add");
    const btn = h("button", "sbe-small sbe-add-btn");
    btn.type = "button";
    btn.append(icon("plus"), h("span", "", e.addBlock));
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    const menu = h("ul", "sbe-menu");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", e.addBlock);
    menu.hidden = true;
    const close = (focus = true) => {
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      if (focus) btn.focus();
    };
    for (const type of BLOCK_TYPES) {
      const li = h("li");
      li.setAttribute("role", "none");
      const item = h("button", "sbe-menu-item");
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.tabIndex = -1;
      const [name, desc] = e.types[type];
      item.append(h("strong", "", name), h("span", "", desc));
      item.addEventListener("click", () => {
        close(false);
        this.addBlock(type);
      });
      li.append(item);
      menu.append(li);
    }
    const items = () => Array.from(menu.querySelectorAll<HTMLElement>(".sbe-menu-item"));
    btn.addEventListener("click", () => {
      const show = menu.hidden;
      menu.hidden = !show;
      btn.setAttribute("aria-expanded", String(show));
      if (show) items()[0]?.focus();
    });
    menu.addEventListener("keydown", (ev) => {
      const all = items();
      const at = all.indexOf(document.activeElement as HTMLElement);
      if (ev.key === "ArrowDown") all[(at + 1) % all.length]?.focus();
      else if (ev.key === "ArrowUp") all[(at - 1 + all.length) % all.length]?.focus();
      else if (ev.key === "Home") all[0]?.focus();
      else if (ev.key === "End") all[all.length - 1]?.focus();
      else if (ev.key === "Escape" || ev.key === "Tab") close();
      else return;
      ev.preventDefault();
      ev.stopPropagation();
    });
    wrap.append(btn, menu);
    return wrap;
  }

  /** Where a new block goes: into the selected container or branch, after
   *  the selected block, or at the end. */
  private insertPlace(): Place {
    const layout = this.session.layout;
    const sel = this.selected;
    if (!sel) return { slot: { parent: null }, index: layout.blocks.length };
    const [id, br] = sel.split("#");
    const b = findBlock(layout, id ?? "");
    if (b && br !== undefined && b.type === "conditional") return { slot: { parent: b.id, branch: Number(br) }, index: b.branches[Number(br)]?.nested.length ?? 0 };
    if (b && isContainer(b)) return { slot: { parent: b.id }, index: b.nested.length };
    const at = b ? placeOf(layout, b.id) : null;
    return at ? { slot: at.slot, index: at.index + 1 } : { slot: { parent: null }, index: layout.blocks.length };
  }

  addBlock(type: BlockType): void {
    const layout = this.session.layout;
    const block = newBlock(type, freeBlockId(layout, type));
    this.change(insertAt(layout, this.insertPlace(), block), E().added(blockName(block)), block.id);
  }

  /** The keys to suggest: the layout's, and the drawn statblock's. */
  private paintKeys(): void {
    const keys = new Set(layoutKeys(this.session.layout));
    for (const s of this.open.sources) for (const k of sheetKeys(s.text)) keys.add(k);
    this.parts.keys.replaceChildren(...[...keys].slice(0, 400).map((k) => {
      const o = h("option");
      o.value = k;
      return o;
    }));
  }

  private paintHead(): void {
    const e = E();
    const l = this.session.layout;
    this.parts.title.textContent = e.title(word(l.name, l.id));
    const dirty = this.session.dirty();
    this.parts.dirty.textContent = dirty ? `● ${e.unsaved}` : "";
    (this.parts.undo as HTMLButtonElement).disabled = !this.session.canUndo();
    (this.parts.redo as HTMLButtonElement).disabled = !this.session.canRedo();
    const save = this.parts.save as HTMLButtonElement;
    save.disabled = this.saving || !canWriteLayouts();
    save.title = canWriteLayouts() ? e.save : S.noFolder;
    save.textContent = this.saving ? e.saving : e.save;
  }

  private paintProblems(): void {
    const e = E();
    const l = this.session.layout;
    const v = validateLayout(l);
    const list = v.problems.map((p) => ({ path: p.path, message: p.message }));
    const idWhy = idProblem(l.id, this.taken);
    if (idWhy && !list.some((p) => p.path === "id")) list.unshift({ path: "id", message: idWhy });
    const box = this.parts.problems;
    box.replaceChildren(h("h4", "sbe-subhead", list.length === 0 ? e.noProblems : e.problems(list.length)));
    if (list.length === 0) return;
    const ul = h("ul", "sbe-problem-list");
    for (const p of list.slice(0, 50)) {
      const li = h("li");
      const b = h("button", "sbe-problem", `${p.path || "—"}: ${p.message}`);
      b.type = "button";
      b.addEventListener("click", () => {
        const id = blockAtPath(l, p.path);
        if (id) this.selectBlock(id, true);
        else {
          this.layoutOpen = true;
          this.renderAll();
          // A layout's own field: the one the path starts with, or the first.
          const head = p.path.split(/[.[]/)[0] ?? "";
          const key = head === "diceRules" ? "layout.rules.add" : head === "name" ? "layout.name.pt" : head === "appearance" ? "layout.look.headingFont" : `layout.${head}`;
          (this.parts.layout.querySelector<HTMLElement>(`[data-field="${key}"]`) ?? this.parts.layout.querySelector<HTMLElement>("[data-field]"))?.focus();
        }
      });
      li.append(b);
      ul.append(li);
    }
    box.append(ul);
  }

  /** Choose a block, unfolding what holds it. */
  selectBlock(id: string | null, focus = false): void {
    this.selected = id;
    let at = id ? placeOf(this.session.layout, id.split("#")[0] ?? "") : null;
    while (at && at.slot.parent !== null) {
      this.folded.delete(at.slot.parent);
      if (at.slot.branch !== undefined) this.folded.delete(`${at.slot.parent}#${at.slot.branch}`);
      at = placeOf(this.session.layout, at.slot.parent);
    }
    this.tab = "tree";
    this.renderAll(focus ? id : undefined);
  }

  private renderTreePart(): void {
    renderTree(this.parts.tree, {
      layout: () => this.session.layout,
      selected: () => this.selected,
      select: (id, focus) => this.selectBlock(id, focus),
      change: (next, said, select) => this.change(next, said, select),
      options: (id) => optionsForm({ layout: () => this.session.layout, edit: (n, k, r) => this.edit(n, k, r), keysListId: this.parts.keys.id }, id),
      folded: this.folded,
      say: (t) => this.say(t),
    });
  }

  /** Everything drawn again, the focus kept on the same field or row. */
  renderAll(focusRow?: string | null): void {
    const active = document.activeElement instanceof HTMLElement && this.el.contains(document.activeElement) ? document.activeElement : null;
    const fieldKey = active?.dataset["field"];
    const rowKey = active?.dataset["row"];
    this.paintHead();
    this.paintKeys();
    const details = this.parts.layout.parentElement as HTMLDetailsElement;
    details.open = this.layoutOpen;
    this.parts.layout.replaceChildren(layoutForm({ layout: () => this.session.layout, edit: (n, k, r) => this.edit(n, k, r), taken: this.taken }));
    this.renderTreePart();
    this.paintProblems();
    this.paintSources();
    this.renderPreview();
    this.paintTabs(this.el.querySelector(".sbe-tabs")!, this.parts.main);
    const back =
      (focusRow ? this.el.querySelector<HTMLElement>(`[data-row="${CSS.escape(focusRow)}"]`) : null) ??
      (fieldKey ? this.el.querySelector<HTMLElement>(`[data-field="${CSS.escape(fieldKey)}"]`) : null) ??
      (rowKey ? this.el.querySelector<HTMLElement>(`[data-row="${CSS.escape(rowKey)}"]`) : null);
    if (back) back.focus({ preventScroll: true });
    else if (active && !active.isConnected) this.el.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')?.focus({ preventScroll: true });
  }

  /** After typing: the head, the problems, the card and the row's name. */
  private renderLight(): void {
    this.paintHead();
    this.paintProblems();
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.renderPreview(), 120);
    const sel = this.selected;
    const b = sel && !sel.includes("#") ? findBlock(this.session.layout, sel) : null;
    const name = sel ? this.parts.tree.querySelector<HTMLElement>(`[data-row="${CSS.escape(sel)}"] .sbe-row-name`) : null;
    if (b && name) name.textContent = blockName(b);
  }

  private paintSources(): void {
    const e = E();
    const pick = this.parts.source as HTMLSelectElement;
    const opts: [string, string][] = [["-1", e.sampleBuilt], ...this.open.sources.map((s, i) => [String(i), s.label] as [string, string])];
    pick.replaceChildren(...opts.map(([v, l]) => {
      const o = h("option", "", l);
      o.value = v;
      return o;
    }));
    pick.value = String(this.sourceIndex);
  }

  renderPreview(): void {
    this.previewTimer = null;
    const v = validateLayout(this.session.layout, this.session.layout.id);
    if (!v.layout) return;
    const src = this.open.sources[this.sourceIndex];
    const text = src ? src.text : sampleText(v.layout);
    const card = renderStatblock(text, undefined, {
      layout: v.layout,
      rolls: true,
      dice: (notation, look) => {
        const d = h("span", "dice-button sbe-die", look?.text ?? notation);
        d.title = look?.label ?? S.roll(notation);
        return d;
      },
    });
    this.parts.card.replaceChildren(card);
  }

  /** Write the layout through the store: a new file for a copy, the same
   *  file over the revision read otherwise; a renamed id moves the file. */
  async save(): Promise<boolean> {
    if (this.saving) return false;
    const e = E();
    const layout = this.session.layout;
    if (!canWriteLayouts()) {
      this.say(S.noFolder);
      return false;
    }
    const why = idProblem(layout.id, this.taken);
    if (why) {
      this.say(why);
      this.layoutOpen = true;
      this.renderAll();
      this.parts.layout.querySelector<HTMLElement>('[data-field="layout.id"]')?.focus();
      return false;
    }
    const v = validateLayout(layout, layout.id);
    if (!v.layout) return false;
    if (v.problems.length > 0 && !(await this.deps.ask(e.askProblems(v.problems.length), { yes: e.saveAnyway, no: e.cancel }))) return false;
    this.saving = true;
    this.paintHead();
    const renaming = this.origId !== null && this.origId !== v.layout.id;
    const r = await saveLayout(v.layout, renaming || this.origId === null ? null : this.revision);
    this.saving = false;
    if (!r.ok) {
      this.paintHead();
      if (r.stale) this.showStale();
      else this.say(r.why);
      return false;
    }
    let leftover: { id: string; why: string } | null = null;
    if (renaming && this.origId) {
      const gone = await removeLayout(this.origId);
      if (!gone.ok) leftover = { id: this.origId, why: gone.why };
    }
    this.origId = r.value.layout.id;
    this.revision = r.value.revision ?? null;
    this.session.markSaved(r.value.layout);
    this.parts.notice.hidden = true;
    this.parts.stale.hidden = true;
    this.renderAll();
    this.say(e.saved);
    if (leftover) this.offerRemoval(leftover.id, leftover.why);
    return true;
  }

  /** A rename made the new file but the old one stays: say so and ask,
   *  retry the removal or keep both. Nothing is decided silently. */
  offerRemoval(id: string, why: string): void {
    const e = E();
    const box = this.parts.stale;
    box.replaceChildren(h("p", "", e.oldRemains(id, why)));
    const retry = h("button", "sbe-small", e.retryRemove);
    retry.type = "button";
    retry.addEventListener("click", () => {
      void (async () => {
        const r = await removeLayout(id);
        if (r.ok) {
          box.hidden = true;
          this.say(e.removedOld);
        } else this.offerRemoval(id, r.why);
      })();
    });
    const keep = h("button", "sbe-small", e.keepBoth);
    keep.type = "button";
    keep.addEventListener("click", () => {
      box.hidden = true;
      this.say(e.keptBoth);
    });
    box.append(retry, keep);
    box.hidden = false;
    this.say(e.oldRemains(id, why));
  }

  /** Another person's version is in the folder: say so, and offer theirs
   *  or a copy of mine. Nothing is written until one is chosen. */
  showStale(): void {
    const e = E();
    const box = this.parts.stale;
    box.replaceChildren(h("p", "", e.stale));
    const theirs = h("button", "sbe-small", e.reloadTheirs);
    theirs.type = "button";
    theirs.addEventListener("click", () => void this.reloadTheirs());
    const copy = h("button", "sbe-small", e.saveCopy);
    copy.type = "button";
    copy.addEventListener("click", () => void this.saveAsCopy());
    box.append(theirs, copy);
    box.hidden = false;
    this.say(e.stale);
  }

  async reloadTheirs(): Promise<void> {
    await reloadFolder();
    const s = allLayouts().find((x) => x.source === "folder" && x.layout.id === this.origId);
    if (!s) return;
    this.session.reset(s.layout);
    this.revision = s.revision ?? null;
    this.parts.stale.hidden = true;
    this.keepSelection();
    this.renderAll();
    this.say(E().reloaded);
  }

  async saveAsCopy(): Promise<void> {
    const v = validateLayout(this.session.layout, this.session.layout.id);
    if (!v.layout) return;
    const id = freeId(`${v.layout.id.slice(0, 54)}-copy`);
    const r = await saveLayout({ ...v.layout, id }, null);
    if (!r.ok) return this.say(r.why);
    this.origId = id;
    this.revision = r.value.revision ?? null;
    this.session.markSaved(r.value.layout);
    this.parts.stale.hidden = true;
    this.renderAll();
    this.say(E().savedCopy(id));
  }

  /** Close, asking first when there are changes not saved. */
  async requestClose(): Promise<boolean> {
    const e = E();
    if (this.session.dirty() && !(await this.deps.ask(e.askLeave, { yes: e.leave, no: e.stay }))) return false;
    this.deps.closed(this.el);
    this.el.remove();
    this.open.onDone?.();
    return true;
  }
}

/** Open the editor on a layout. */
export function openLayoutEditor(open: EditorOpen, deps: EditorDeps): LayoutEditor {
  const ed = new LayoutEditor(open, deps);
  ed.mount();
  return ed;
}
