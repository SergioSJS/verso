// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { sh } from "../shareStrings";
import { DailyCalendar } from "../bases/daily";
import { commands } from "../bindings";
import { bookmarks } from "../bookmarks";
import { dailyNote, dailyPath } from "../daily";
import { onFolderLayer } from "../folderLayer";
import { calendarPeriods } from "../periodic/notes";
import { openSettingsSection } from "../dialogs/sync";
import { button, el, h, ui } from "../dom";
import { activeFocusItem, addFocusPrompt, deleteFocus, downloadFocusesNow, isSyncFocusesAsked, focusesDownloadFailed, focusesConflictBanner, focusesList, focusesSummary, formatReadOnlyReason, getDisplayFocuses, getSyncFocuses, isHomeActive, isHomeFocusName, loadFocuses, moveFocusOrder, renameFocusPrompt, saveFocuses, selectFocus } from "../focuses";
import { allFiles, allNotes, iconOfPath } from "../folder";
import { icon } from "../icons";
import { renderSticker, showStickerPicker } from "../labels";
import { openNote } from "../layout/spaces";
import { Leaf } from "../leaves/leaf";
import { NoteLeaf } from "../leaves/note";
import { panel } from "../main";
import { pickerStrings } from "../organize/cover";
import { dirOf, iconFor, kindOf, name } from "../paths";
import { searchNotes } from "../search";
import { baseStrings, LOCALE, t } from "../strings";
import { allFolders, listAll } from "../tree/tree";
import { mentionsSection } from "./mentions";
import { TabStrip } from "./tabStrip";
import { historyButton } from "../dialogs/history";
import { narrow, rightShown } from "../chrome";
import { gate } from "./gate";
import { tableOn } from "../table/record";
import { tt } from "../table/strings";
import { watchUnread } from "../table/unread";
import { paintTable } from "../table/view";
import { soundOn, watchMusicOnScreen } from "../table/sound/run";
import { st } from "../table/sound/strings";
import { paintMusic } from "../table/sound/tab";

const leafIds = new WeakMap<Leaf, number>();
let leafSeq = 0;

/* ---------- The right panel: outline, backlinks, outgoing, tags, bookmarks, focuses ---------- */
export type PanelTab = "outline" | "backlinks" | "tags" | "bookmarks" | "calendar" | "focuses" | "table" | "music";
export class Panel {
  readonly el = el<HTMLElement>("right");
  readonly tabs = el<HTMLDivElement>("right-tabs");
  readonly body = el<HTMLDivElement>("right-body");
  current: PanelTab = "outline";
  private strip: TabStrip;
  leaf: Leaf | null = null;
  tagsCache: { name: string; notes: string[] }[] = [];
  /** The panel is drawn only while it is on screen: collapsed (or closed, on a phone), a change only marks it stale and the next opening draws once. */
  private readonly gate = gate(rightShown, () => this.draw());
  private outlineKey = "";
  constructor() {
    const defs: [PanelTab, string, string][] = [
      ["outline", "outline", t.outline],
      ["backlinks", "link", t.linksTab],
      ["tags", "tag", t.tags],
      ["bookmarks", "star", t.bookmarks],
      ["focuses", "compass", t.focusesTab],
      ["calendar", "calendar", t.calendarTab],
      // The table (ADR 0107): only while its switch is on.
      ["table", "dice", tt.tab],
      // The table's music (ADR 0116 as amended 2026-10-31): only while its switch is on.
      ["music", "music", st.tab],
    ];
    // The periodic settings changed (the folder's layer read again): the
    // calendar's weeks, month and year follow (ADR 0093 item 9).
    onFolderLayer(() => {
      if (this.current === "calendar") this.paint();
    });
    // A tablist and its one panel: the arrows, Home and End choose a tab,
    // and only the chosen one is in the Tab order.
    this.el.setAttribute("aria-label", t.rightPanel);
    this.tabs.setAttribute("aria-label", t.rightPanel);
    this.body.setAttribute("role", "tabpanel");
    for (const [id, ic, label] of defs) {
      const b = button("right-tab", label, ic);
      b.setAttribute("role", "tab");
      b.id = `verso-right-${id}`;
      b.setAttribute("aria-controls", this.body.id);
      b.dataset["tab"] = id;
      b.dataset["icon"] = ic;
      b.addEventListener("click", () => {
        this.current = id;
        if (id === "focuses") void loadFocuses().then(() => this.paint());
        this.refresh();
      });
      this.tabs.append(b);
    }
    // The saved order, the drag, Alt+←/→ and the room (tabStrip.ts).
    this.strip = new TabStrip(this.tabs, () => this.current, (id) => {
      this.current = id as PanelTab;
      if (id === "focuses") void loadFocuses().then(() => this.paint());
      this.refresh();
    });
    this.tabs.title = t.tabsHint;
    this.tabs.addEventListener("keydown", (e) => {
      const all = Array.from(this.tabs.querySelectorAll<HTMLButtonElement>("button[role=tab]")).filter((b) => !b.hidden && !b.hasAttribute("data-overflow"));
      const i = all.indexOf(e.target as HTMLButtonElement);
      if (i < 0 || e.altKey || e.metaKey || e.ctrlKey) return;
      const n = all.length;
      const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
      const to = all[j];
      if (!to) return;
      e.preventDefault();
      this.current = (to.dataset["tab"] ?? "outline") as PanelTab;
      if (this.current === "focuses") void loadFocuses().then(() => this.paint());
      this.refresh();
      to.focus();
    });
    try {
      const saved = localStorage.getItem("verso.rightTab") as PanelTab | "outgoing" | null;
      // The outgoing links joined the backlinks tab.
      if (saved) this.current = saved === "outgoing" ? "backlinks" : saved;
    } catch {
      // No storage.
    }
    this.markTabs();
    addEventListener("verso:table-visibility", () => this.gate.reveal());
    narrow.addEventListener("change", () => this.gate.reveal());
    // The Mesa tab exists only while the table does (ADR 0107 item 14).
    addEventListener("verso:features-changed", () => this.followTable());
    watchUnread(() => tableOn() && this.current === "table" && rightShown());
    watchMusicOnScreen(() => this.current === "music" && rightShown());
    this.followTable();
  }
  /** The Mesa tab shown or hidden with its switch; a panel left on it goes back to the outline. */
  private followTable(): void {
    const on = tableOn();
    const tab = this.tabs.querySelector<HTMLElement>('[data-tab="table"]');
    if (tab) tab.hidden = !on;
    const music = this.tabs.querySelector<HTMLElement>('[data-tab="music"]');
    if (music) music.hidden = !soundOn();
    if ((!on && this.current === "table") || (!soundOn() && this.current === "music")) {
      this.current = "outline";
      this.refresh();
    }
    dispatchEvent(new Event("verso:table-visibility"));
  }
  /** The chosen tab: selected, in the Tab order, naming the panel. */
  private markTabs(): void {
    // The phone shows the Mesa tab as a sheet from the bottom (css/table.css).
    document.body.dataset["rightTab"] = this.current;
    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>("button")) {
      const on = b.dataset["tab"] === this.current;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on) this.body.setAttribute("aria-labelledby", b.id);
    }
  }
  show(leaf: Leaf | null): void {
    // A tab that stopped being shared has nothing to show (its path is gone).
    if (leaf?.unshared) leaf = null;
    this.leaf = leaf;
    this.refresh();
    if (leaf instanceof NoteLeaf) leaf.updateWords();
    else ui.words.textContent = "";
    historyButton(leaf?.path ?? null);
  }
  async loadTags(): Promise<void> {
    const r = await commands.listTags();
    if (r.status === "ok") this.tagsCache = r.data;
    if (this.current === "tags") this.paint();
  }
  refresh(): void {
    try {
      localStorage.setItem("verso.rightTab", this.current);
    } catch {
      // No storage.
    }
    this.markTabs();
    this.strip.chosen();
    this.paint();
    dispatchEvent(new Event("verso:table-visibility"));
  }
  /** The places where other notes write this note's name without
   *  linking to it, each with "Link", and "Link all" (ADR 0089). */
  private async mentions(leaf: NoteLeaf): Promise<void> {
    const paint = this.painted;
    const nodes = await mentionsSection(leaf, () => this.leaf === leaf && this.current === "backlinks" && this.painted === paint);
    if (!nodes) return;
    // Under the backlinks, above the outgoing links.
    const out = this.body.querySelector(".links-out");
    if (out) out.before(...nodes);
    else this.body.append(...nodes);
  }
  private list(items: HTMLElement[], empty: string): void {
    const ul = h("ul", "panel-list");
    if (items.length === 0) ul.append(h("li", "empty", empty));
    else ul.append(...items);
    this.body.replaceChildren(ul);
  }
  private row(label: string, sub: string | undefined, run: () => void, ic?: string): HTMLLIElement {
    const li = h("li");
    const b = h("button", "row");
    b.type = "button";
    if (ic) b.append(icon(ic));
    b.append(h("span", "row-name", label));
    if (sub) b.append(h("span", "path", sub));
    b.addEventListener("click", run);
    li.append(b);
    return li;
  }
  /** The month of the daily notes (ADR 0053). */
  readonly daily = new DailyCalendar({
    locale: LOCALE,
    s: baseStrings,
    has: (day) => allNotes.includes(dailyPath(day)),
    open: (day) => void dailyNote(day),
    // The week, the month and the year beside the day (ADR 0093 item 9).
    ...calendarPeriods(),
  });
  /** Counts the paints: a search for mentions that comes back after a
   *  newer paint has nothing to add (two in flight drew the list twice). */
  private painted = 0;
  paintFocuses(): void {
    const wrap = h("div", "focuses-view");
    if (focusesConflictBanner) {
      wrap.append(h("div", "focuses-banner error", focusesConflictBanner));
    } else if (focusesSummary?.has_file && !focusesSummary.format_known) {
      const banner = h("div", "focuses-banner", formatReadOnlyReason(focusesSummary.read_only_code, focusesSummary.read_only_reason));
      if (focusesSummary.read_only_code === "cloud_placeholder") {
        // Only the person's click brings the file down (ADR 0043).
        const down = button("ghost", t.focusesDownloadNow);
        down.id = "focuses-download";
        down.addEventListener("click", () => {
          if (down.disabled) return;
          down.disabled = true;
          banner.setAttribute("aria-busy", "true");
          down.textContent = t.focusesDownloading;
          void downloadFocusesNow().finally(() => {
            down.disabled = false;
            banner.removeAttribute("aria-busy");
            down.textContent = t.focusesDownloadNow;
          });
        });
        banner.append(" ", down);
        if (focusesDownloadFailed()) {
          const bad = h("div", "focuses-download-error", t.focusesDownloadFailed);
          bad.setAttribute("role", "alert");
          banner.append(bad);
        }
      }
      wrap.append(banner);
    } else if (focusesSummary?.has_file && focusesSummary.format_known && !getSyncFocuses() && isSyncFocusesAsked()) {
      // A folder never asked shows nothing: the question comes by itself
      // when the file is read (and right after it is downloaded).
      const note = h("div", "focuses-banner", t.syncFocusesOffBanner);
      const change = button("ghost", t.syncFocusesChange);
      change.id = "focuses-sync-change";
      change.addEventListener("click", () => openSettingsSection("organizing"));
      note.append(" ", change);
      wrap.append(note);
    }
    const header = h("div", "focuses-header");
    header.append(h("span", "focuses-title", t.focusesTab));
    const addBtn = button("ghost iconic", t.createFocus, "plus");
    addBtn.id = "focuses-add";
    addBtn.addEventListener("click", () => void addFocusPrompt());
    header.append(addBtn);
    wrap.append(header);

    const ul = h("ul", "panel-list focuses-list");
    const displayList = getDisplayFocuses();
    const nonHomeList = displayList.filter((f) => !isHomeFocusName(f.name));

    for (const focus of displayList) {
      const isHome = isHomeFocusName(focus.name);
      const isActive = isHome ? isHomeActive() : (activeFocusItem === focus);
      const isReadOnly = (focus.isFromMakeMd && !getSyncFocuses()) || (focus.isFromMakeMd && !focusesSummary?.format_known);
      const li = h("li", `focus-item ${isActive ? "active" : ""}`);
      li.dataset["focusName"] = focus.name;

      const row = h("div", "focus-item-row");
      const stkBtn = h("button", "focus-sticker-btn");
      stkBtn.type = "button";
      stkBtn.title = t.changeSticker;
      stkBtn.setAttribute("aria-label", t.changeSticker);
      if (focus.sticker) {
        stkBtn.replaceChildren(renderSticker(focus.sticker, 16) ?? icon("star"));
      } else {
        stkBtn.replaceChildren(icon(isHome ? "folder" : "star"));
        stkBtn.style.opacity = isHome ? "0.6" : "0.3";
      }
      if (!isReadOnly) {
        stkBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showStickerPicker({
            anchorEl: stkBtn,
            currentSticker: focus.sticker ?? null,
            currentColor: null,
            strings: pickerStrings(),
            lang: LOCALE.startsWith("pt") ? "pt" : "en",
            onSelectSticker: (stk) => {
              focus.sticker = stk;
              if (isHome && !focusesList.some((f) => isHomeFocusName(f.name))) {
                focusesList.unshift(focus);
              }
              void saveFocuses();
              panel.refresh();
            },
            onRemoveSticker: () => {
              focus.sticker = null;
              void saveFocuses();
              panel.refresh();
            },
            onSelectColor: () => {},
            onRemoveColor: () => {},
          });
        });
      } else {
        stkBtn.disabled = true;
      }

      const nameBtn = h("button", `focus-name-btn ${isActive ? "active" : ""}`);
      nameBtn.type = "button";
      nameBtn.setAttribute("aria-current", String(isActive));
      const displayName = isHome ? t.homeFocus : focus.name;
      const titleSpan = h("span", "row-name", displayName);
      nameBtn.append(titleSpan);
      nameBtn.addEventListener("click", () => void selectFocus(isHome ? null : focus));

      const actions = h("div", "focus-actions");
      if (!isHome && !isReadOnly) {
        const nonHomeIdx = nonHomeList.indexOf(focus);
        const upBtn = button("ghost iconic", t.moveUp, "chevronUp");
        if (nonHomeIdx <= 0) upBtn.disabled = true;
        upBtn.addEventListener("click", (e) => { e.stopPropagation(); void moveFocusOrder(focus, -1); });

        const downBtn = button("ghost iconic", t.moveDown, "chevronDown");
        if (nonHomeIdx >= nonHomeList.length - 1) downBtn.disabled = true;
        downBtn.addEventListener("click", (e) => { e.stopPropagation(); void moveFocusOrder(focus, 1); });

        const renameBtn = button("ghost iconic", t.rename, "edit");
        renameBtn.addEventListener("click", (e) => { e.stopPropagation(); void renameFocusPrompt(focus); });

        const delBtn = button("ghost iconic danger", t.deleteFocus, "close");
        delBtn.addEventListener("click", (e) => { e.stopPropagation(); void deleteFocus(focus); });

        actions.append(upBtn, downBtn, renameBtn, delBtn);
      }

      row.append(stkBtn, nameBtn, actions);
      li.append(row);

      if (focus.paths.length === 0 && !isHome && !isReadOnly) {
        const hint = h("div", "focus-empty-hint", t.focusEmptyHint);
        li.append(hint);
      }
      if (focus.paths.length > 0 && !isHome) {
        const pathsUl = h("ul", "focus-paths-list");
        for (const p of focus.paths) {
          const pLi = h("li", "focus-path-item");
          const pSpan = h("span", "focus-path-text", p);
          if (!isReadOnly) {
            const removeP = button("ghost iconic focus-remove-path", t.remove, "close");
            removeP.addEventListener("click", async (e) => {
              e.stopPropagation();
              focus.paths = focus.paths.filter((x) => x !== p);
              await saveFocuses();
              if (activeFocusItem === focus) await listAll();
              panel.refresh();
            });
            pLi.append(iconOfPath(p, allFolders.includes(p) ? "folder" : kindOf(p)), pSpan, removeP);
          } else {
            pLi.append(iconOfPath(p, allFolders.includes(p) ? "folder" : kindOf(p)), pSpan);
          }
          pathsUl.append(pLi);
        }
        li.append(pathsUl);
      }

      ul.append(li);
    }
    wrap.append(ul);
    this.body.replaceChildren(wrap);
  }
  paint(): void {
    this.gate.draw();
  }
  private draw(): void {
    const leaf = this.leaf;
    const outlineKey = this.current === "outline" && leaf ? `${leafIds.get(leaf) ?? leafIds.set(leaf, ++leafSeq).get(leaf)}|${JSON.stringify(leaf.headings())}` : "";
    // An outline that is the same list of headings stays as it is (a save that touched no heading redraws nothing).
    if (outlineKey && outlineKey === this.outlineKey && this.body.firstElementChild?.classList.contains("panel-list")) return;
    this.outlineKey = outlineKey;
    this.painted++;
    // No note open: the tabs say what the panel holds, and the body why it
    // is empty, not a blank column.
    if (!leaf && (this.current === "outline" || this.current === "backlinks")) {
      this.list([], t.panelNoNote);
      return;
    }
    switch (this.current) {
      case "calendar": {
        this.daily.render();
        // Already there: left in place, so a redraw keeps the keyboard's
        // focus (taking it out and back would drop it, in WebKit).
        if (this.daily.el.parentElement !== this.body || this.body.childElementCount !== 1) this.body.replaceChildren(this.daily.el);
        break;
      }
      case "outline": {
        const heads = leaf?.headings() ?? [];
        this.list(
          heads.map((hd) => {
            const li = this.row(hd.text, undefined, () => leaf?.jumpTo(hd.line));
            li.querySelector("button")?.classList.add(`level-${hd.level}`);
            return li;
          }),
          t.noOutline,
        );
        break;
      }
      case "backlinks": {
        // Both kinds of link in one tab, a divider between them.
        const back = leaf instanceof NoteLeaf ? leaf.backlinksData : [];
        const out = leaf instanceof NoteLeaf ? leaf.linksData : [];
        const section = (cls: string, title: string, items: HTMLElement[]): HTMLElement => {
          const box = h("section", `links-section ${cls}`);
          const ul = h("ul", "panel-list");
          if (items.length === 0) ul.append(h("li", "empty", t.noLinks));
          else ul.append(...items);
          box.append(h("h3", "links-head", `${title} · ${items.length}`), ul);
          return box;
        };
        this.body.replaceChildren(
          section(
            "links-back",
            t.backlinks,
            back.map((b) => previews(this.row(name(b.from), `${dirOf(b.from) ? dirOf(b.from) + " · " : ""}${t.line} ${b.line}`, () => openNote(b.from, false), "note"), b.from)),
          ),
          section(
            "links-out",
            t.outgoing,
            out.map((l) => {
              const li = this.row(l.target, l.resolved ? dirOf(l.resolved) : l.outside ? sh.notShared : "?", () => (l.resolved ? openNote(l.resolved, false) : undefined), l.resolved ? "note" : "link");
              if (!l.resolved) li.classList.add("unresolved");
              if (l.outside) li.classList.add("outside");
              return previews(li, l.resolved, l.target, l.outside);
            }),
          ),
        );
        if (leaf instanceof NoteLeaf) void this.mentions(leaf);
        break;
      }
      case "tags": {
        this.list(
          this.tagsCache.map((tg) =>
            this.row(`#${tg.name}`, String(tg.notes.length), () => {
              ui.search.value = tg.name;
              void searchNotes(tg.name);
            }, "tag"),
          ),
          t.noTags,
        );
        if (this.tagsCache.length === 0) void this.loadTags();
        break;
      }
      case "bookmarks": {
        this.list(
          bookmarks.map((p) => {
            // A file gone outside the app: marked, and not opened as an empty tab.
            const here = allNotes.includes(p) || allFiles.includes(p);
            const li = this.row(name(p), dirOf(p), () => (here ? void openNote(p, false) : void (ui.status.textContent = t.unresolved(name(p)))), iconFor(kindOf(p)));
            if (!here) li.classList.add("unresolved");
            return li;
          }),
          t.noBookmarks,
        );
        break;
      }
      case "focuses": {
        this.paintFocuses();
        break;
      }
      case "table": {
        paintTable(this.body);
        break;
      }
      case "music": {
        paintMusic(this.body);
        break;
      }
    }
  }
}

/** A row whose note shows in the hover preview (ADR 0085 item 2): its
 *  path, the link as written (a heading, a `^id`), or the link alone when
 *  nothing answers or it leaves what was shared. */
function previews(li: HTMLLIElement, path: string | null, target?: string, outside?: boolean): HTMLLIElement {
  const b = li.querySelector("button");
  if (!b) return li;
  if (path) b.dataset["previewPath"] = path;
  if (target) b.dataset["previewTarget"] = target;
  if (outside) b.dataset["previewOutside"] = "";
  return li;
}
