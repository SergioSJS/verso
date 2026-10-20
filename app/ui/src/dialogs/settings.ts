// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { can, host } from "../can";
import { historyStrings } from "./historyStrings";
import { serverStrings, serversBody } from "./servers";
import { localServerBody, phonesConnected, restartNote } from "./localServer";
import { localStrings } from "./localServerStrings";
import { syncBody, syncStrings } from "./sync";
import { offline } from "../web/offline/manager";
import { offlineBody } from "../web/offline/section";
import { o as offlineWords } from "../web/offline/strings";
import { trashBody, trashStrings, trashSummary } from "./trash";
import { type CliState, commands, type McpStatus } from "../bindings";
import { remoteContentChanged } from "../changes";
import { ask } from "../dialog";
import { button, h, ui } from "../dom";
import { focusesSummary, getLocalFocuses, getSyncFocuses, isSyncFocusesAsked, loadFocuses, setFocusesSummary, setLocalFocuses, setSyncFocuses, setSyncFocusesAsked, tellHostSyncFocuses } from "../focuses";
import { type CapabilityPreset, currentPreset, PRESETS, setPreset } from "../capabilities";
import { bookmarks } from "../bookmarks";
import { currentFolder } from "../folder";
import { changeFolder, folderValues, folderWritable } from "../folderLayer";
import type { Scope } from "../organize/layerRules";
import { periodicBody } from "../periodic/settingsView";
import { ps } from "../periodic/strings";
import { icon } from "../icons";
import { allCommands, comboOf, DEFAULT_KEYS, keyOf, MAC, paintKeyHints, prettyKeys, reloadWindow, RESERVED } from "../keys";
import { LINUX, WINDOWS } from "../platform";
import { spaces } from "../layout/spaces";
import { NoteLeaf } from "../leaves/note";
import { panel, ribbon, updateController } from "../main";
import { walkRulesChanged } from "../open";
import { pushFolderNoteName } from "../organize/folderNotes";
import { orderModeChanged } from "../organize/order";
import { allowEmbedOrigins } from "../sanitize";
import { refreshBases } from "../bases";
import { tileControl, tileStrings } from "../bases/tileSettings";
import { getHiddenFromTree, pushEmbedOrigins, pushHistoryDays, pushMenuLanguage, saveSettings, setHiddenFromTree, settings } from "../settings";
import { boardText, LOCALE, t } from "../strings";
import { listAll } from "../tree/tree";
import { updateNews } from "../updateNews";
import { asDialog, closed, isTop, opened } from "./a11y";
import { accountEntries } from "../web/account";
import { KINDS, type Mode, MODES, modeOf } from "../notify/core";
import { notifyStrings } from "../notify/strings";
import { systemControl } from "../notify/system";
import { signedIn } from "../web/api";
import { ls } from "../editor/suggestStrings";
import { pv } from "../preview/strings";
import {
  getAllLayouts,
  getDefaultLayoutId,
  setDefaultLayoutId,
  saveCustomLayout,
  deleteCustomLayout,
  exportLayoutToJson,
  importLayoutFromJson,
  type StatblockLayout,
} from "../statblock/layouts";
import { openLayoutBuilder } from "../statblock/builder";
import {
  getOddsTable,
  saveOddsTable,
  resetOddsTable,
  getSparkWords,
  saveSparkWords,
  resetSparkWords,
  generateSpark,
  type Likelihood,
  LIKELIHOODS,
  type SparkWordLists,
} from "../oracle/engine";
import {
  getAllOracleTables,
  saveCustomOracleTable,
  deleteCustomOracleTable,
  type OracleTable,
} from "../oracle/tables";

/** A settings page is a list of items: a title, a line about it, a control. */
export let hotkeyRecorder: ((e: KeyboardEvent) => void) | null = null;
/** Ends a recording in progress, leaving the keys as they were. */
export let disarmRecorder: (() => void) | null = null;
export let updateCardUnsub: (() => void) | null = null;
/** The arguments a client starts `verso` with, by the mode: the open
 *  folder's key, or `--all`; none in per-folder mode with no folder open. */
function mcpArgs(): string[] | null {
  if (settings.mcpMode === "all") return ["mcp", "--all"];
  return currentFolder ? ["mcp", "--key", currentFolder] : null;
}

export class SettingsDialog {
  readonly el = h("div", "quick settings");
  readonly box = h("div", "settings-box");
  readonly nav = h("nav", "settings-nav");
  readonly body = h("div", "settings-body");
  readonly search = h("input", "settings-search");
  private section = "general";
  constructor() {
    this.el.hidden = true;
    this.notice.setAttribute("role", "status");
    this.notice.hidden = true;
    asDialog(this.el, t.settings, () => this.hide());
    this.search.type = "search";
    this.search.placeholder = t.searchSettings;
    this.search.setAttribute("aria-label", t.searchSettings);
    this.search.addEventListener("input", () => this.paint());
    this.search.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.hide();
    });
    const side = h("div", "settings-side");
    // A phone has no Esc, and a tap beside the page may find no room: the
    // page closes by its own button too.
    const close = h("button", "ghost iconic settings-close");
    close.type = "button";
    close.title = t.done;
    close.setAttribute("aria-label", t.done);
    close.append(icon("close"));
    close.addEventListener("click", () => this.hide());
    const top = h("div", "settings-top");
    top.append(this.search, close);
    side.append(top, this.nav);
    this.box.append(side, this.body);
    const dirs: ("r" | "b" | "l" | "t" | "br" | "bl" | "tr" | "tl")[] = ["r", "b", "l", "t", "br", "bl", "tr", "tl"];
    for (const dir of dirs) {
      const handle = h("div", `settings-resize-handle ${dir}`);
      this.wireResize(handle, dir);
      this.box.append(handle);
    }
    const grip = h("div", "settings-resize-grip");
    grip.title = LOCALE === "pt-BR" ? "Redimensionar janela (duplo clique para restaurar)" : "Resize window (double-click to reset)";
    grip.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><line x1="8" y1="2" x2="2" y2="8"></line><line x1="8" y1="5" x2="5" y2="8"></line><line x1="8" y1="8" x2="8" y2="8"></line></svg>`;
    this.wireResize(grip, "br");
    grip.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.resetSize();
    });
    this.box.append(grip);
    this.wireMove(side);

    window.addEventListener("resize", () => {
      if (this.el.hidden) return;
      if (window.innerWidth <= 760) return;
      const rect = this.box.getBoundingClientRect();
      const maxLeft = Math.max(12, window.innerWidth - rect.width - 12);
      const maxTop = Math.max(12, window.innerHeight - rect.height - 12);
      const currentLeft = parseFloat(this.box.style.left);
      const currentTop = parseFloat(this.box.style.top);
      if (!isNaN(currentLeft) && currentLeft > maxLeft) {
        this.box.style.left = `${Math.round(maxLeft)}px`;
      }
      if (!isNaN(currentTop) && currentTop > maxTop) {
        this.box.style.top = `${Math.round(maxTop)}px`;
      }
      if (rect.width > window.innerWidth - 24) {
        this.box.style.width = `${Math.round(window.innerWidth - 24)}px`;
      }
      if (rect.height > window.innerHeight - 24) {
        this.box.style.height = `${Math.round(window.innerHeight - 24)}px`;
      }
    });

    this.el.append(this.box);
    document.body.append(this.el);
    this.el.addEventListener("mousedown", (e) => { if (e.target === this.el) this.hide(); });
    // Escape anywhere closes the settings — unless a dialog above them took
    // it (the palette over the settings closes alone, a11y.ts).
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !e.defaultPrevented && !this.el.hidden && isTop(this.el) && !hotkeyRecorder) this.hide(); });
  }

  private wireResize(handle: HTMLElement, dir: "r" | "b" | "l" | "t" | "br" | "bl" | "tr" | "tl"): void {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startY = e.clientY;
      const rect = this.box.getBoundingClientRect();
      const startLeft = rect.left;
      const startTop = rect.top;
      const startWidth = rect.width;
      const startHeight = rect.height;

      this.box.style.position = "fixed";
      this.box.style.left = `${startLeft}px`;
      this.box.style.top = `${startTop}px`;
      this.box.style.margin = "0";

      const minW = Math.min(480, window.innerWidth - 24);
      const minH = Math.min(320, window.innerHeight - 24);
      const maxW = window.innerWidth - 24;
      const maxH = window.innerHeight - 24;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        let newWidth = startWidth;
        let newHeight = startHeight;
        let newLeft = startLeft;
        let newTop = startTop;

        if (dir.includes("r")) {
          newWidth = Math.min(maxW - startLeft, Math.max(minW, startWidth + dx));
        }
        if (dir.includes("b")) {
          newHeight = Math.min(maxH - startTop, Math.max(minH, startHeight + dy));
        }
        if (dir.includes("l")) {
          const potentialW = Math.max(minW, Math.min(startLeft + startWidth - 12, startWidth - dx));
          const actualDx = startWidth - potentialW;
          newLeft = startLeft + actualDx;
          newWidth = potentialW;
        }
        if (dir.includes("t")) {
          const potentialH = Math.max(minH, Math.min(startTop + startHeight - 12, startHeight - dy));
          const actualDy = startHeight - potentialH;
          newTop = startTop + actualDy;
          newHeight = potentialH;
        }

        this.box.style.width = `${Math.round(newWidth)}px`;
        this.box.style.height = `${Math.round(newHeight)}px`;
        this.box.style.left = `${Math.round(newLeft)}px`;
        this.box.style.top = `${Math.round(newTop)}px`;
      };

      const onUp = (ev: PointerEvent) => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
        const finalRect = this.box.getBoundingClientRect();
        try {
          localStorage.setItem(
            "verso:settings-dialog-size",
            JSON.stringify({
              width: Math.round(finalRect.width),
              height: Math.round(finalRect.height),
              left: Math.round(finalRect.left),
              top: Math.round(finalRect.top),
            })
          );
        } catch {
          // ignore
        }
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
  }

  private wireMove(handle: HTMLElement): void {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, button, select, textarea, a, .settings-nav-item, .settings-resize-handle, .settings-search")) {
        return;
      }
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startY = e.clientY;
      const rect = this.box.getBoundingClientRect();
      const startLeft = rect.left;
      const startTop = rect.top;

      this.box.style.position = "fixed";
      this.box.style.left = `${startLeft}px`;
      this.box.style.top = `${startTop}px`;
      this.box.style.margin = "0";

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const maxLeft = window.innerWidth - rect.width - 12;
        const maxTop = window.innerHeight - rect.height - 12;
        const nextLeft = Math.max(12, Math.min(maxLeft, startLeft + dx));
        const nextTop = Math.max(12, Math.min(maxTop, startTop + dy));
        this.box.style.left = `${Math.round(nextLeft)}px`;
        this.box.style.top = `${Math.round(nextTop)}px`;
      };

      const onUp = (ev: PointerEvent) => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
        const finalRect = this.box.getBoundingClientRect();
        try {
          localStorage.setItem(
            "verso:settings-dialog-size",
            JSON.stringify({
              width: Math.round(finalRect.width),
              height: Math.round(finalRect.height),
              left: Math.round(finalRect.left),
              top: Math.round(finalRect.top),
            })
          );
        } catch {
          // ignore
        }
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
  }

  private resetSize(): void {
    this.box.style.position = "";
    this.box.style.left = "";
    this.box.style.top = "";
    this.box.style.width = "";
    this.box.style.height = "";
    this.box.style.margin = "";
    try {
      localStorage.removeItem("verso:settings-dialog-size");
    } catch {
      // ignore
    }
  }

  private restoreSavedSize(): void {
    if (window.innerWidth <= 760) return;
    try {
      const raw = localStorage.getItem("verso:settings-dialog-size");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved?.width === "number" && typeof saved?.height === "number") {
        const maxW = window.innerWidth - 32;
        const maxH = window.innerHeight - 32;
        const minW = Math.min(480, maxW);
        const minH = Math.min(320, maxH);
        const w = Math.min(maxW, Math.max(minW, saved.width));
        const h = Math.min(maxH, Math.max(minH, saved.height));
        this.box.style.width = `${w}px`;
        this.box.style.height = `${h}px`;

        if (typeof saved?.left === "number" && typeof saved?.top === "number") {
          const maxL = window.innerWidth - w - 16;
          const maxT = window.innerHeight - h - 16;
          const l = Math.max(16, Math.min(maxL, saved.left));
          const t = Math.max(16, Math.min(maxT, saved.top));
          this.box.style.position = "fixed";
          this.box.style.left = `${l}px`;
          this.box.style.top = `${t}px`;
          this.box.style.margin = "0";
        }
      }
    } catch {
      // ignore
    }
  }

  show(section?: string): void {
    if (section) this.section = section;
    this.restoreSavedSize();
    opened(this.el);
    this.el.hidden = false;
    this.notice.hidden = this.notice.textContent === "";
    this.paint();
    this.search.focus();
  }
  hide(): void {
    this.el.hidden = true;
    disarmRecorder?.();
    closed(this.el);
    if (typeof panel !== "undefined" && panel.current === "focuses") panel.paint();
  }
  /** Why the window did not do what was asked, said in the page. */
  private readonly notice = h("p", "settings-hint");
  /** The language changes on reload. Every open note and file is saved
   *  first; if one cannot be (a conflict waits for a decision, a write
   *  failed), the window stays as it is and says why — the language
   *  applies at the next start. */
  private async reloadForLanguage(): Promise<void> {
    if (await reloadWindow()) return;
    this.notice.textContent = t.languageNotReloaded;
    this.notice.hidden = false;
    ui.status.textContent = t.languageNotReloaded;
  }
  /** The window in a browser (ADR 0092): the section is always there, and
   *  says why when it cannot keep a folder — no HTTPS, no folder open, no
   *  storage — rather than vanishing (the maintainer, 2026-10-16, over
   *  plain HTTP: "onde está offline?"). */
  private offlineHere(): boolean {
    return host() === "server";
  }
  private sections(): { id: string; label: string; icon: string; category: "app" | "editor" | "rpg" | "system" }[] {
    return [
      // 1. Aplicação / Application
      { id: "general", label: t.sGeneral, icon: "gear", category: "app" },
      { id: "appearance", label: t.sAppearance, icon: "palette", category: "app" },
      { id: "notify", label: notifyStrings().section, icon: "bell", category: "app" },
      { id: "hotkeys", label: t.sHotkeys, icon: "keyboard", category: "app" },

      // 2. Notas & Editor / Notes & Editing
      { id: "editor", label: t.sEditor, icon: "edit", category: "editor" },
      { id: "files", label: t.sFiles, icon: "folder", category: "editor" },
      { id: "organizing", label: t.sOrganizing, icon: "folder", category: "editor" },
      ...(currentFolder ? [{ id: "periodic", label: ps.section, icon: "calendar", category: "editor" as const }] : []),
      ...(currentFolder && can("write") ? [{ id: "trash", label: trashStrings().section, icon: "trash", category: "editor" as const }] : []),
      { id: "board", label: boardText.sBoard, icon: "board", category: "editor" },

      // 3. RPG & Mesa Solo / RPG & Solo Play
      { id: "oracles", label: LOCALE === "pt-BR" ? "Oráculos e Solo RPG" : "Oracles & Solo RPG", icon: "sparkles", category: "rpg" },
      { id: "statblocks", label: LOCALE === "pt-BR" ? "Fichas e Templates" : "Statblock Templates", icon: "dice", category: "rpg" },

      // 4. Rede & Conexões / Network & System
      ...(can("local_folders") && currentFolder ? [{ id: "sync", label: syncStrings().section, icon: "refresh", category: "system" as const }] : []),
      ...(this.offlineHere() ? [{ id: "sync", label: offlineWords().section, icon: "refresh", category: "system" as const }] : []),
      ...(can("local_folders") ? [{ id: "servers", label: serverStrings().section, icon: "globe", category: "system" as const }] : []),
      ...(can("local_folders") ? [{ id: "localserver", label: localStrings().section, icon: "globe", category: "system" as const }] : []),
      ...(can("agents") ? [{ id: "cli", label: t.sCli, icon: "terminal", category: "system" as const }] : []),
      ...(can("account") && signedIn() ? [{ id: "account", label: t.sAccount, icon: "user", category: "system" as const }] : []),
    ];
  }
  private item(title: string, desc: string, control: HTMLElement | null, scope?: Scope): HTMLElement {
    const row = h("div", "setting");
    const text = h("div", "setting-text");
    const id = `setting-${++this.ids}`;
    const titleEl = h("div", "setting-title", title);
    titleEl.id = `${id}-title`;
    const descEl = h("div", "setting-desc", desc);
    descEl.id = `${id}-desc`;
    text.append(titleEl);
    // Where the setting is kept (ADR 0070): in the folder, travelling with
    // it, or on this machine only — said under its name, and read with its
    // line by a screen reader.
    let scopeId = "";
    if (scope) {
      const tag = h("span", `setting-scope ${scope}`, scope === "folder" ? t.scopeFolder : t.scopeMachine);
      tag.title = scope === "folder" ? t.scopeFolderTip : t.scopeMachineTip;
      scopeId = tag.id = `${id}-scope`;
      text.append(tag);
    }
    text.append(descEl);
    row.append(text);
    if (control) {
      // The control is named by the item's title and described by its line
      // (a hotkey row names its own buttons).
      const field = control.matches("input, select, textarea") ? control : control.querySelector<HTMLElement>("input, select, textarea");
      // A control that names itself (one of several in the row) keeps it.
      if (title && !field?.hasAttribute("aria-label")) field?.setAttribute("aria-labelledby", titleEl.id);
      // A control with a note of its own is described by both.
      if (field && desc) field.setAttribute("aria-describedby", [scopeId, descEl.id, field.getAttribute("aria-describedby")].filter(Boolean).join(" "));
      row.append(control);
    }
    return row;
  }
  private ids = 0;
  private select<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLSelectElement {
    const sel = h("select");
    for (const [v, l] of options) {
      const o = h("option", "", l);
      o.value = v;
      o.selected = value === v;
      sel.append(o);
    }
    sel.addEventListener("change", () => onChange(sel.value as T));
    return sel;
  }
  private toggle(value: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
    const l = h("label", "switch");
    const box = h("input");
    box.type = "checkbox";
    box.checked = value;
    box.addEventListener("change", () => onChange(box.checked));
    l.append(box, h("span", "switch-track"));
    return l;
  }
  private text(value: string, onChange: (v: string) => void): HTMLInputElement {
    const i = h("input");
    i.type = "text";
    i.value = value;
    i.addEventListener("change", () => onChange(i.value.trim()));
    i.addEventListener("keydown", (e) => e.stopPropagation());
    return i;
  }
  /** A list of lines, one value per line, kept when the box loses the
   *  focus: blank lines and repeats dropped. */
  private lines(value: string[], onChange: (v: string[]) => void, example: string): HTMLTextAreaElement {
    const box = h("textarea", "embed-allowed") as unknown as HTMLTextAreaElement;
    box.rows = 4;
    box.spellcheck = false;
    box.value = value.join("\n");
    box.placeholder = example;
    box.addEventListener("keydown", (e) => e.stopPropagation());
    box.addEventListener("change", () => {
      const seen = new Set<string>();
      for (const line of box.value.split("\n")) if (line.trim()) seen.add(line.trim());
      onChange([...seen]);
      box.value = [...seen].join("\n");
    });
    return box;
  }
  /** Every item of every section, for the search; the section otherwise. */
  private items(): { section: string; title: string; desc: string; node: () => HTMLElement; group?: string }[] {
    const out: { section: string; title: string; desc: string; node: () => HTMLElement; group?: string }[] = [];
    const add = (section: string, title: string, desc: string, control: () => HTMLElement | null, group?: string) =>
      out.push({ section, title, desc, node: () => this.item(title, desc, control()), group });
    // A setting of the folder's layer (ADR 0070 items 1–2): shown with
    // where it is kept now.
    const addScoped = (section: string, title: string, desc: string, control: () => HTMLElement | null, scope: () => Scope = () => folderValues().scope) =>
      out.push({ section, title, desc, node: () => this.item(title, desc, control(), scope()) });
    // A walk rule changed: into the folder's settings when they can be
    // written, else this machine's; then the folder is walked again.
    const walkRule = async (part: { ignore_build_dirs?: boolean; respect_gitignore?: boolean }, onMachine: () => void) => {
      if (!(await changeFolder(() => part))) {
        onMachine();
        saveSettings();
      }
      await walkRulesChanged();
      this.paint();
    };
    if (can("devtools")) add("general", t.devtools, t.devtoolsDesc, () => this.toggle(settings.devtools, (v) => { settings.devtools = v; saveSettings(); }));
    if (can("updates")) add("general", t.checkUpdates, t.checkUpdatesDesc, () => this.toggle(settings.checkUpdates, (v) => { settings.checkUpdates = v; saveSettings(); }));
    add("general", t.appVersion, t.appVersionDesc, () => {
      const wrap = h("div", "setting-version-wrap");
      const topRow = h("div", "setting-version-row");
      const v = h("span", "setting-value", "…");
      void commands.appInfo().then((r) => {
        v.textContent = r.status === "ok" ? `${r.data.version} · ${r.data.commit}` : "?";
      });

      const checkBtn = h("button", "update-btn-secondary", t.checkNow);
      checkBtn.prepend(icon("refresh"));
      checkBtn.addEventListener("click", () => {
        void updateController.check(false);
      });

      // In a browser the window is the server's, updated with the server:
      // there is nothing for it to check, and an answer it did not get must
      // not read "the newest version" (the maintainer's test server,
      // 2026-10-16, whose own check had failed).
      checkBtn.hidden = !can("updates");
      topRow.append(v, checkBtn);
      wrap.append(topRow);

      const card = h("div", "update-card");
      card.style.display = "none";
      wrap.append(card);

      let showNotes = false;

      const renderCard = () => {
        card.textContent = "";
        if (!can("updates")) {
          card.style.display = "none";
          return;
        }
        checkBtn.disabled = updateController.checking || updateController.downloading;
        if (updateController.checking) {
          checkBtn.textContent = t.checkingUpdates;
          checkBtn.prepend(icon("refresh"));
          return;
        } else {
          checkBtn.textContent = t.checkNow;
          checkBtn.prepend(icon("refresh"));
        }

        if (updateController.error) {
          card.style.display = "flex";
          const errEl = h("div", "setting-desc", `⚠ ${updateController.error}`);
          errEl.style.color = "var(--seal)";
          card.append(errEl);
          return;
        }

        const info = updateController.info;
        if (!info) {
          card.style.display = "none";
          return;
        }

        card.style.display = "flex";

        if (!info.has_update) {
          const badge = h("div", "update-badge success");
          badge.append(icon("check"), h("span", "", t.updateUpToDate));
          card.append(badge);
          return;
        }

        const header = h("div", "update-card-header");
        const title = h("div", "update-card-title");
        title.append(icon("sparkles"), h("span", "", `${t.updateAvailable}: v${info.latest_version}${info.release_name && info.release_name !== info.latest_version ? ` (${info.release_name})` : ""}`));
        header.append(title);
        card.append(header);

        if (updateController.downloading && updateController.progress) {
          const prog = updateController.progress;
          const progWrap = h("div", "update-progress-wrap");
          const track = h("div", "update-progress-track");
          const bar = h("div", "update-progress-bar");
          const pct = Math.min(100, Math.max(0, (prog.percent as number) ?? 0));
          bar.style.width = `${pct}%`;
          track.append(bar);

          const txt = h("div", "update-progress-text");
          const mbDownloaded = (((prog.downloaded_bytes as number) ?? 0) / (1024 * 1024)).toFixed(1);
          const mbTotal = prog.total_bytes ? (((prog.total_bytes as number) ?? 0) / (1024 * 1024)).toFixed(1) : "?";
          const statusMsg = prog.status === "extracting" ? "Descompactando…" : prog.status === "installing" ? "Instalando…" : `${t.downloadingUpdate} ${pct.toFixed(0)}% (${mbDownloaded} MB / ${mbTotal} MB)`;
          txt.append(h("span", "", statusMsg), h("span", "", `${pct.toFixed(0)}%`));

          progWrap.append(track, txt);
          card.append(progWrap);
        } else if (updateController.result) {
          const res = updateController.result;
          const resBox = h("div", "update-badge success");
          resBox.append(icon("check"), h("span", "", res.message));
          card.append(resBox);

          if (res.requires_restart) {
            // The phones connected go with the restart (ADR 0096 item 18).
            const phones = h("p", "update-phones");
            phones.setAttribute("role", "status");
            void phonesConnected().then((n) => {
              if (n > 0) phones.textContent = restartNote(n);
            });
            card.append(phones);
            const restartBtn = h("button", "update-btn-primary", t.restartNow);
            restartBtn.prepend(icon("refresh"));
            restartBtn.addEventListener("click", () => void updateController.restart());
            card.append(restartBtn);
          }
        } else {
          const actions = h("div", "update-actions");
          const dlBtn = h("button", "update-btn-primary", t.downloadAndUpdate);
          dlBtn.prepend(icon("download"));
          dlBtn.addEventListener("click", () => void updateController.downloadAndInstall());

          const notesBtn = h("button", "update-btn-secondary", showNotes ? t.hideReleaseNotes : t.viewReleaseNotes);
          notesBtn.prepend(icon(showNotes ? "chevronUp" : "chevronDown"));
          notesBtn.addEventListener("click", () => {
            showNotes = !showNotes;
            renderCard();
          });

          actions.append(dlBtn, notesBtn);
          card.append(actions);

          // What is new, in the window's language, as plain lines — not
          // the release page's download guide (ADR 0051, 2026-10-14).
          const news = showNotes ? updateNews(info.release_notes, LOCALE) : "";
          if (news) {
            const notesBox = h("div", "update-notes-box");
            notesBox.textContent = news;
            card.append(notesBox);
          }
        }
      };

      if (updateCardUnsub) {
        updateCardUnsub();
        updateCardUnsub = null;
      }
      updateCardUnsub = updateController.subscribe(() => {
        if (wrap.isConnected) {
          renderCard();
        } else if (updateCardUnsub) {
          updateCardUnsub();
          updateCardUnsub = null;
        }
      });
      renderCard();
      return wrap;
    });
    add("general", t.language, t.languageDesc, () => {
      const sel = this.select([["auto", t.themeAuto], ["pt-BR", "Português (Brasil)"], ["en", "English"]], settings.lang, (v) => { settings.lang = v; saveSettings(); pushMenuLanguage(); void this.reloadForLanguage(); });
      // Each language's name in its own language, said so.
      for (const o of Array.from(sel.options)) if (o.value !== "auto") o.lang = o.value;
      return sel;
    });
    const isPtLocale = LOCALE.toLowerCase().startsWith("pt");
    add("general", isPtLocale ? "Modo de Uso (Preset)" : "Usage Mode (Preset)", isPtLocale ? "Define quais recursos de domínio (escrita, oráculos, fichas) ficam ativos na interface (ADR 0103)." : "Controls which domain capabilities (writing, oracles, statblocks) are active (ADR 0103).", () => {
      const choices: [string, string][] = [
        ["writing", PRESETS.writing.name],
        ["worldbuilding", PRESETS.worldbuilding.name],
        ["rpg", PRESETS.rpg.name],
      ];
      return this.select(choices, currentPreset(), (v) => {
        setPreset(v as CapabilityPreset);
        this.paint();
      });
    });
    // Each kind of notification: a toast and the list, the list only, or
    // nothing (ADR 0084 item 8) — the person's layer, with the account on
    // a server; then the system's notifications, this machine's (item 9).
    const ns = notifyStrings();
    for (const k of KINDS) {
      add("notify", ns.kinds[k], ns.kindsDesc[k], () =>
        this.select(MODES.map((m) => [m, ns.modes[m]] as [Mode, string]), modeOf(settings.notify, k), (v) => {
          settings.notify = { ...settings.notify, [k]: v };
          saveSettings();
        }),
      );
    }
    add("notify", ns.system, ns.systemDesc, () => systemControl());
    add("general", t.remoteContent, t.remoteContentDesc, () => this.toggle(settings.remoteContent, (v) => { settings.remoteContent = v; saveSettings(); remoteContentChanged(); }));
    add("general", t.embedAllowed, t.embedAllowedDesc, () => {
      const box = h("textarea", "embed-allowed") as unknown as HTMLTextAreaElement;
      box.rows = 6;
      box.spellcheck = false;
      box.value = settings.embedOrigins.join("\n");
      box.placeholder = "https://site.com";
      const normalize = (line: string): string | null => {
        const t = line.trim();
        if (!t) return null;
        if (t === "*") return "*";
        try {
          return new URL(t.includes("://") ? t : `https://${t}`).origin;
        } catch {
          return null;
        }
      };
      box.addEventListener("change", () => {
        const seen = new Set<string>();
        for (const line of box.value.split("\n")) {
          const o = normalize(line);
          if (o) seen.add(o);
        }
        settings.embedOrigins = [...seen];
        box.value = settings.embedOrigins.join("\n");
        saveSettings();
        allowEmbedOrigins(settings.embedOrigins);
        void pushEmbedOrigins();
      });
      // The long part — how to write a line, and what * lets in — under
      // the box as a note, not squeezed into the column beside it.
      const wrap = h("div", "setting-block");
      const note = h("p", "setting-note", t.embedAllowedNote);
      note.id = `embed-allowed-note-${++this.ids}`;
      box.setAttribute("aria-describedby", note.id);
      wrap.append(box, note);
      return wrap;
    });
    // The maps' background (ADR 0094 items 8 and 9): the shipped world by
    // default; a source only by the person's choice.
    const ts = tileStrings(LOCALE);
    add("general", ts.title, ts.desc, () =>
      tileControl(LOCALE, settings, (next) => {
        settings.mapTiles = next.mapTiles;
        settings.mapTilesDark = next.mapTilesDark;
        settings.mapTileOrigins = next.mapTileOrigins;
        saveSettings();
        refreshBases();
      }, document.querySelector('meta[name="verso-contract"]') !== null),
    );
    // The space the open folder takes (ADR 0075 item 4), from the walk the
    // index already made.
    if (currentFolder) {
      const pt = document.documentElement.lang.startsWith("pt");
      add("files", pt ? "Espaço desta pasta" : "This folder's space", pt ? "Notas, anexos e o índice, contados na última leitura da pasta." : "Notes, attachments and the index, counted at the folder's last walk.", () => {
        const v = h("span", "setting-value", "…");
        const size = (bytes: number | null) => {
          let n = bytes ?? 0;
          const units = ["B", "KB", "MB", "GB", "TB"];
          let i = 0;
          while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
          return `${n.toLocaleString(pt ? "pt-BR" : "en", { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
        };
        void commands.folderSpace().then((r) => {
          if (r.status !== "ok") return void (v.textContent = "?");
          const s = r.data;
          v.textContent = pt
            ? `${size(s.total)} — notas ${size(s.notes)}, anexos ${size(s.attachments)}, ${s.files} arquivos; índice ${size(s.index)}`
            : `${size(s.total)} — notes ${size(s.notes)}, attachments ${size(s.attachments)}, ${s.files} files; index ${size(s.index)}`;
        });
        return v;
      });
    }
    // The trash beside the folder's space, not counted in it (ADR 0080
    // items 4 and 8), and the way into it.
    if (currentFolder && can("write")) {
      add("files", trashStrings().section, trashStrings().notCounted, () => trashSummary(() => { this.section = "trash"; this.search.value = ""; this.paint(); }));
    }
    // How long this computer keeps versions (ADR 0091 item 8): the
    // person's; a folder of a server keeps its own, set by its admin.
    if (host() !== "server") {
      const hs = historyStrings();
      add("files", hs.keepFor, hs.keepForDesc, () => {
        const options: [string, string][] = [7, 30, 90, 180, 365, 730].map((d) => [String(d), hs.days(d)]);
        options.push(["0", hs.forever]);
        return this.select(options, String(settings.historyDays ?? 365), (v) => {
          settings.historyDays = Number(v);
          saveSettings();
          pushHistoryDays();
        });
      });
    }
    addScoped("files", t.ignoreBuildDirs, t.ignoreBuildDirsDesc, () => this.toggle(folderValues().ignoreBuildDirs, (v) => void walkRule({ ignore_build_dirs: v }, () => { settings.ignoreBuildDirs = v; })));
    addScoped("files", t.respectGitignore, t.respectGitignoreDesc, () => this.toggle(folderValues().respectGitignore, (v) => void walkRule({ respect_gitignore: v }, () => { settings.respectGitignore = v; })));
    add("general", t.autosaveDelay, t.autosaveDesc, () => {
      const i = h("input");
      i.type = "number"; i.min = "0.3"; i.step = "0.5"; i.value = String(settings.autosave);
      i.addEventListener("change", () => { settings.autosave = Math.max(0.3, Number(i.value) || 1.5); saveSettings(); });
      return i;
    });
    add("appearance", t.theme, t.themeDesc, () => this.select([["auto", t.themeAuto], ["light", t.themeLight], ["dark", t.themeDark]], settings.theme, (v) => { settings.theme = v; saveSettings(); }));
    add("appearance", t.hue, t.hueDesc, () => this.select([["paper", t.huePaper], ["sepia", t.hueSepia], ["slate", t.hueSlate], ["moss", t.hueMoss]], settings.palette, (v) => { settings.palette = v; saveSettings(); }));
    add("appearance", t.darkTone, t.darkToneDesc, () => this.select([["soft", t.darkSoft], ["deep", t.darkDeep], ["dusk", t.darkDusk]], settings.darkTone ?? "soft", (v) => { settings.darkTone = v; saveSettings(); }));
    add("appearance", t.fontSize, t.fontSizeDesc, () => {
      // Up to twice the default (15 px): the window has no page zoom, so
      // this is how text reaches 200% (WCAG 1.4.4). Said in pixels.
      const r = h("input");
      r.type = "range"; r.min = "12"; r.max = "30"; r.step = "1"; r.value = String(settings.fontSize);
      r.setAttribute("aria-valuetext", `${r.value} px`);
      r.addEventListener("input", () => { settings.fontSize = Number(r.value); r.setAttribute("aria-valuetext", `${r.value} px`); saveSettings(); });
      return r;
    });
    add("appearance", t.headingFont, t.headingFontDesc, () => this.select([
      ["serif", t.fontSerif],
      ["sans", t.fontSans],
      ["editorial", t.fontEditorial],
      ["mono", t.fontMono],
      ["system", t.fontSystem],
    ], settings.headingFont || "serif", (v) => { settings.headingFont = v as any; saveSettings(); }));
    add("appearance", t.bodyFont, t.bodyFontDesc, () => this.select([
      ["sans", t.fontSans],
      ["serif", t.fontEditorial],
      ["mono", t.fontMono],
      ["system", t.fontSystem],
    ], settings.bodyFont || "sans", (v) => { settings.bodyFont = v as any; saveSettings(); }));
    add("appearance", t.headingColor, t.headingColorDesc, () => this.select([
      ["brass", t.colorBrass],
      ["default", t.colorDefault],
      ["seal", t.colorSeal],
      ["moss", t.colorMoss],
      ["slate", t.colorSlate],
      ["royal", t.colorRoyal],
      ["amethyst", t.colorAmethyst],
    ], settings.headingColor || "brass", (v) => { settings.headingColor = v as any; saveSettings(); }));
    add("appearance", t.measure, t.measureDesc, () => this.select([["normal", t.measureNormal], ["wide", t.measureWide]], settings.measure, (v) => { settings.measure = v; saveSettings(); }));
    // The ribbon's buttons, each shown or hidden here as from its menu;
    // the gear stays, so the way back is never hidden with the others.
    for (const b of ribbon?.buttons() ?? []) {
      add("appearance", b.label, b.kept ? t.ribbonButtonsDesc : "", () => {
        if (b.kept) return null;
        const sw = this.toggle(b.shown, (v) => ribbon?.setShown(b.id, v));
        return sw;
      }, t.ribbonButtons);
    }
    add("organizing", t.stickers, t.stickersDesc, () => this.toggle(settings.stickers, (v) => { settings.stickers = v; saveSettings(); void listAll(); }));
    add("organizing", t.stickerInLinks, t.stickerInLinksDesc, () => this.toggle(settings.stickerInLinks, (v) => { settings.stickerInLinks = v; saveSettings(); }));
    add("organizing", t.covers, t.coversDesc, () => this.toggle(settings.covers, (v) => { settings.covers = v; saveSettings(); for (const s of spaces) for (const p of s.layout.panes()) for (const l of p.leaves) if (l instanceof NoteLeaf && l.note) void l.load(l.path, true); }));
    add("organizing", t.coverHeight, t.coverHeightDesc, () => this.text(String(settings.coverHeight), (v) => { const n = Number(v); if (!isNaN(n) && n >= 80 && n <= 600) { settings.coverHeight = n; saveSettings(); } }));
    add("organizing", t.aliasInTree, t.aliasInTreeDesc, () => this.toggle(settings.aliasInTree, (v) => { settings.aliasInTree = v; saveSettings(); void listAll(); }));
    addScoped("organizing", t.folderNoteName, t.folderNoteNameDesc, () => this.text(folderValues().folderNoteName, (v) => void (async () => {
      if (folderWritable() && (await changeFolder(() => ({ folder_note_name: v.trim() })))) {
        await listAll();
      } else {
        settings.folderNoteName = v.trim();
        saveSettings();
        await pushFolderNoteName().then(() => listAll());
      }
      this.paint();
    })()));
    // The bookmarks are the folder's too (ADR 0070 item 2): kept beside
    // its notes, they are set by the star; here, where they are kept.
    // A reader's are this machine's (decided 2026-10-12): said so.
    if (currentFolder) addScoped("organizing", t.bookmarks, t.bookmarksSettingDesc, () => h("span", "setting-value", String(bookmarks.length)), () => folderValues().bookmarksScope);
    add("organizing", t.folderPageTable, t.folderPageTableDesc, () => this.toggle(settings.folderPageTable, (v) => { settings.folderPageTable = v; saveSettings(); }));
    add("organizing", t.manualOrder, t.manualOrderDesc, () => this.toggle(settings.manualOrder, (v) => { settings.manualOrder = v; saveSettings(); orderModeChanged(); }));
    add("organizing", t.inlineEmbedEdit, t.inlineEmbedEditDesc, () => this.toggle(settings.inlineEmbedEdit, (v) => { settings.inlineEmbedEdit = v; saveSettings(); }));
    add("organizing", t.emojiTrigger, t.emojiTriggerDesc, () => this.toggle(settings.emojiTrigger, (v) => { settings.emojiTrigger = v; saveSettings(); }));
    // ADR 0062 D9: sync focuses with make.md (.space/waypoints.json).
    add("organizing", t.syncFocuses, t.syncFocusesDesc, () => this.toggle(getSyncFocuses(), async (v) => {
      if (v) {
        if (!isSyncFocusesAsked()) {
          const ok = await ask(t.syncFocusesWarning, { yes: t.syncFocusesEnable, no: t.syncFocusesOffInfo });
          setSyncFocusesAsked(true);
          if (!ok) {
            setSyncFocuses(false);
            await tellHostSyncFocuses(false);
            this.paint();
            return;
          }
        }
        setSyncFocuses(true);
        await tellHostSyncFocuses(true);
        const local = getLocalFocuses();
        if (local.length > 0) {
          const migrate = await ask(t.syncLocalFocusesQuestion, { yes: t.syncFocusesEnable, no: t.syncFocusesOffInfo });
          if (migrate) {
            const r = await commands.getFocuses();
            if (r.status === "ok") setFocusesSummary(r.data);
            const diskFocuses = focusesSummary?.focuses ?? [];
            const toAdd = local.filter((lf) => !diskFocuses.some((df) => df.name.trim().toLowerCase() === lf.name.trim().toLowerCase()));
            const toSave = [...diskFocuses, ...toAdd];
            const base = diskFocuses;
            const res = await commands.setFocuses(toSave, focusesSummary?.stamp ?? null, base);
            if (res.status === "ok") {
              setLocalFocuses([]);
              setFocusesSummary(res.data);
            }
          }
        }
        await loadFocuses(true);
      } else {
        setSyncFocuses(false);
        await tellHostSyncFocuses(false);
        await loadFocuses(true);
      }
      this.paint();
      if (typeof panel !== "undefined" && panel.current === "focuses") panel.paint();
    }));
    // Not one of D12's ten settings: the list S3 asks for, where what was
    // hidden from the tree is shown again (ADR 0060, memo §7 S3).
    add("organizing", t.hiddenFromTree, t.hiddenFromTreeDesc, () => {
      const container = h("div", "hidden-items-list");
      const list = getHiddenFromTree();
      if (list.length === 0) {
        container.append(h("span", "ghost-text", t.noHiddenItems));
        return container;
      }
      for (const item of list) {
        const row = h("div", "hidden-item-row");
        const label = h("span", "hidden-item-name", item);
        const unhideBtn = button("ghost", t.unhide);
        unhideBtn.addEventListener("click", () => {
          setHiddenFromTree(getHiddenFromTree().filter((x) => x !== item));
          void listAll();
          this.paint();
        });
        row.append(label, unhideBtn);
        container.append(row);
      }
      return container;
    });
    const b = boardText;
    add("board", b.prefOpenAs, b.prefOpenAsDesc, () => this.select([["board", b.prefOpenAsBoard], ["source", b.prefOpenAsText]], settings.boardOpenAs, (v) => { settings.boardOpenAs = v; saveSettings(); }));
    add("board", b.prefOpen, b.prefOpenDesc, () => this.select([["fit", b.prefOpenFit], ["last", b.prefOpenLast]], settings.boardOpen, (v) => { settings.boardOpen = v; saveSettings(); }));
    add("board", b.prefStroke, b.prefStrokeDesc, () => this.select([["hand", b.prefStrokeHand], ["clean", b.prefStrokeClean]], settings.boardStroke, (v) => { settings.boardStroke = v; saveSettings(); }));
    add("board", b.prefFont, b.prefFontDesc, () => this.select([["hand", b.prefFontHand], ["sans", b.prefFontSans], ["mono", b.prefFontMono]], settings.boardFont, (v) => { settings.boardFont = v; saveSettings(); }));
    add("board", b.prefGrid, b.prefGridDesc, () => this.toggle(settings.boardGrid, (v) => { settings.boardGrid = v; saveSettings(); }));
    add("board", b.prefFolder, b.prefFolderDesc, () => this.text(settings.boardFolder, (v) => { settings.boardFolder = v.replace(/^\/+|\/+$/g, ""); saveSettings(); }));
    // Statblocks & Templates (ADR 0099)
    add("statblocks", LOCALE === "pt-BR" ? "Layout Padrão de Ficha" : "Default Statblock Layout", LOCALE === "pt-BR" ? "Template utilizado para renderizar blocos que não especificam layout: nome." : "Template used for statblocks without an explicit layout: name property.", () => {
      const all = getAllLayouts();
      const current = getDefaultLayoutId();
      return this.select(all.map((l) => [l.id, `${l.name} (${l.system})`]), current, (v) => {
        setDefaultLayoutId(v);
        this.paint();
      });
    });
    add("statblocks", LOCALE === "pt-BR" ? "Gerenciar Templates" : "Manage Templates", LOCALE === "pt-BR" ? "Crie layouts visuais personalizados ou importe arquivos JSON do Fantasy Statblocks." : "Create custom visual layouts or import Fantasy Statblocks JSON files.", () => {
      const wrap = h("div", "statblock-manage-wrap");
      wrap.style.display = "flex";
      wrap.style.flexWrap = "wrap";
      wrap.style.gap = "0.6rem";

      const newBtn = button("primary", LOCALE === "pt-BR" ? "+ Novo Template" : "+ New Template");
      newBtn.addEventListener("click", () => {
        openLayoutBuilder(undefined, () => this.paint());
      });

      const importBtn = button("ghost", LOCALE === "pt-BR" ? "Importar JSON…" : "Import JSON…");
      importBtn.addEventListener("click", () => {
        const json = prompt(LOCALE === "pt-BR" ? "Cole o JSON do template (layout.json):" : "Paste the layout JSON (layout.json):");
        if (!json) return;
        try {
          const imported = importLayoutFromJson(json);
          this.paint();
          alert(LOCALE === "pt-BR" ? `Template "${imported.name}" importado com sucesso!` : `Template "${imported.name}" imported successfully!`);
        } catch (err: any) {
          alert((LOCALE === "pt-BR" ? "Erro ao importar: " : "Import error: ") + (err?.message || err));
        }
      });

      wrap.append(newBtn, importBtn);
      return wrap;
    });
    add("statblocks", LOCALE === "pt-BR" ? "Galeria de Templates" : "Template Gallery", LOCALE === "pt-BR" ? "Templates embutidos e personalizados prontos para uso em notas." : "Built-in and custom templates ready for use in notes.", () => {
      const all = getAllLayouts();
      const defaultId = getDefaultLayoutId();
      const gallery = h("div", "statblock-gallery");

      for (const layout of all) {
        const card = h("div", "statblock-gallery-card");

        const top = h("div", "statblock-card-top");
        const titleBox = h("div", "");
        const nameEl = h("div", "statblock-card-title", layout.name);
        const sysEl = h("div", "statblock-card-system", layout.system);
        titleBox.append(nameEl, sysEl);

        const badges = h("div", "statblock-card-badges");
        if (layout.id === defaultId) {
          badges.append(h("span", "statblock-pill-default", LOCALE === "pt-BR" ? "Padrão" : "Default"));
        }
        if (layout.builtIn) {
          badges.append(h("span", "statblock-pill-tag", "Nativo"));
        } else {
          badges.append(h("span", "statblock-pill-tag", "Custom"));
        }
        top.append(titleBox, badges);

        const desc = h("div", "statblock-card-desc", layout.description);

        const actions = h("div", "statblock-gallery-actions");

        const editBtn = button("ghost", layout.builtIn ? (LOCALE === "pt-BR" ? "Visualizar" : "View") : (LOCALE === "pt-BR" ? "Editar" : "Edit"));
        editBtn.addEventListener("click", () => {
          openLayoutBuilder(layout, () => this.paint());
        });
        actions.append(editBtn);

        const dupBtn = button("ghost", LOCALE === "pt-BR" ? "Duplicar" : "Duplicate");
        dupBtn.addEventListener("click", () => {
          const clone: StatblockLayout = {
            ...JSON.parse(JSON.stringify(layout)),
            id: `custom-${Date.now()}`,
            name: `${layout.name} (Cópia)`,
            builtIn: false,
          };
          saveCustomLayout(clone);
          this.paint();
        });
        actions.append(dupBtn);

        const exportBtn = button("ghost", "JSON");
        exportBtn.title = "Exportar JSON";
        exportBtn.addEventListener("click", () => {
          const json = exportLayoutToJson(layout);
          navigator.clipboard.writeText(json).then(() => {
            exportBtn.textContent = "Copiado!";
            setTimeout(() => (exportBtn.textContent = "JSON"), 2000);
          });
        });
        actions.append(exportBtn);

        if (layout.id !== defaultId) {
          const defBtn = button("ghost", LOCALE === "pt-BR" ? "Tornar Padrão" : "Make Default");
          defBtn.addEventListener("click", () => {
            setDefaultLayoutId(layout.id);
            this.paint();
          });
          actions.append(defBtn);
        }

        if (!layout.builtIn) {
          const delBtn = button("ghost", LOCALE === "pt-BR" ? "Excluir" : "Delete");
          delBtn.addEventListener("click", () => {
            if (confirm(LOCALE === "pt-BR" ? `Deseja excluir o template "${layout.name}"?` : `Delete template "${layout.name}"?`)) {
              deleteCustomLayout(layout.id);
              this.paint();
            }
          });
          actions.append(delBtn);
        }

        card.append(top, desc, actions);
        gallery.append(card);
      }

      return gallery;
    });
    // Oracles & Solo RPG (ADR 0102)
    add(
      "oracles",
      LOCALE === "pt-BR" ? "Tabela de Probabilidades (Sim / Não)" : "Odds Table (Yes / No)",
      LOCALE === "pt-BR"
        ? "Personalize as proporções percentuais de cada resposta para as 5 chances do Oráculo. Cada linha deve totalizar 100%."
        : "Customize the percentage distribution for each answer across the 5 oracle likelihoods. Each row must sum to 100%.",
      () => {
        const wrap = h("div", "oracle-settings-section");
        const odds = getOddsTable();

        const currentData: Record<Likelihood, [number, number, number, number, number, number]> = {
          nearlyCertain: [...odds.nearlyCertain],
          likely: [...odds.likely],
          even: [...odds.even],
          unlikely: [...odds.unlikely],
          nearlyImpossible: [...odds.nearlyImpossible],
        };

        const inputs: Record<Likelihood, HTMLInputElement[]> = {
          nearlyCertain: [],
          likely: [],
          even: [],
          unlikely: [],
          nearlyImpossible: [],
        };

        const sumBadges: Partial<Record<Likelihood, HTMLElement>> = {};

        const updateSum = (lh: Likelihood) => {
          const row = currentData[lh];
          const sum = row.reduce((a, b) => a + b, 0);
          const badge = sumBadges[lh];
          if (badge) {
            badge.textContent = `${sum}% ${sum === 100 ? "✓" : "⚠️"}`;
            badge.className = `oracle-odds-sum ${sum === 100 ? "valid" : "invalid"}`;
          }
        };

        // Presets
        const presetsRow = h("div", "oracle-odds-presets");
        const presetsTitle = h("span", "oracle-preset-title", LOCALE === "pt-BR" ? "Modelos prontos:" : "Presets:");
        presetsRow.append(presetsTitle);

        const PRESET_LIST: { name: string; desc: string; data: Record<Likelihood, [number, number, number, number, number, number]> }[] = [
          {
            name: "🎯 Mythic GME 2e",
            desc: LOCALE === "pt-BR" ? "Padrão clássico com gradações completas" : "Classic oracle with full gradations",
            data: {
              nearlyCertain: [18, 54, 18, 5, 4, 1],
              likely: [15, 45, 15, 10, 12, 3],
              even: [10, 30, 10, 10, 30, 10],
              unlikely: [3, 12, 10, 15, 45, 15],
              nearlyImpossible: [1, 4, 5, 18, 54, 18],
            },
          },
          {
            name: "⚔️ Ironsworn",
            desc: LOCALE === "pt-BR" ? "Curva Sim/Não direta (10/25/50/75/90%)" : "Direct Yes/No curve",
            data: {
              nearlyCertain: [10, 80, 0, 0, 8, 2],
              likely: [8, 67, 0, 0, 20, 5],
              even: [5, 45, 0, 0, 45, 5],
              unlikely: [2, 23, 0, 0, 67, 8],
              nearlyImpossible: [1, 9, 0, 0, 80, 10],
            },
          },
          {
            name: LOCALE === "pt-BR" ? "⚖️ Equilibrado" : "⚖️ Balanced",
            desc: LOCALE === "pt-BR" ? "Proporções uniformes e simétricas" : "Symmetric proportions",
            data: {
              nearlyCertain: [15, 60, 10, 5, 8, 2],
              likely: [12, 48, 15, 8, 14, 3],
              even: [10, 35, 10, 10, 30, 5],
              unlikely: [3, 14, 8, 15, 48, 12],
              nearlyImpossible: [2, 8, 5, 10, 60, 15],
            },
          },
          {
            name: LOCALE === "pt-BR" ? "🌪️ Narrativo" : "🌪️ Narrative",
            desc: LOCALE === "pt-BR" ? "Mais reviravoltas ('Sim, mas...' e 'Não, mas...')" : "More complications",
            data: {
              nearlyCertain: [10, 40, 35, 8, 5, 2],
              likely: [8, 32, 30, 15, 12, 3],
              even: [5, 25, 25, 20, 20, 5],
              unlikely: [3, 12, 15, 30, 32, 8],
              nearlyImpossible: [2, 5, 8, 35, 40, 10],
            },
          },
        ];

        for (const preset of PRESET_LIST) {
          const btn = h("button", "oracle-preset-btn", preset.name);
          btn.type = "button";
          btn.title = preset.desc;
          btn.addEventListener("click", () => {
            for (const lh of LIKELIHOODS) {
              currentData[lh] = [...preset.data[lh]];
              for (let i = 0; i < 6; i++) {
                const inp = inputs[lh][i];
                if (inp) inp.value = String(currentData[lh][i]);
              }
              updateSum(lh);
            }
          });
          presetsRow.append(btn);
        }

        const tableWrap = h("div", "oracle-odds-table-wrap");
        const table = h("table", "oracle-odds-table");

        const thead = h("thead", "");
        const trH = h("tr", "");
        const thLabels = LOCALE === "pt-BR"
          ? ["Chance", "Sim e...", "Sim", "Sim mas...", "Não mas...", "Não", "Não e...", "Total"]
          : ["Odds", "Yes &...", "Yes", "Yes but...", "No but...", "No", "No &...", "Total"];
        for (const thText of thLabels) {
          trH.append(h("th", "", thText));
        }
        thead.append(trH);
        table.append(thead);

        const tbody = h("tbody", "");
        const likelihoodNames: Record<Likelihood, string> = LOCALE === "pt-BR"
          ? {
              nearlyCertain: "Quase Certo",
              likely: "Provável",
              even: "50 / 50",
              unlikely: "Improvável",
              nearlyImpossible: "Quase Impossível",
            }
          : {
              nearlyCertain: "Nearly Certain",
              likely: "Likely",
              even: "Even (50/50)",
              unlikely: "Unlikely",
              nearlyImpossible: "Nearly Impossible",
            };

        for (const lh of LIKELIHOODS) {
          const tr = h("tr", "");
          const nameTd = h("td", "", likelihoodNames[lh]);
          nameTd.style.fontWeight = "600";
          nameTd.style.textAlign = "left";
          nameTd.style.paddingLeft = "0.75rem";
          nameTd.style.whiteSpace = "nowrap";
          tr.append(nameTd);

          for (let colIdx = 0; colIdx < 6; colIdx++) {
            const td = h("td", "");
            const input = h("input", "oracle-odds-input") as HTMLInputElement;
            input.type = "number";
            input.min = "0";
            input.max = "100";
            input.value = String(currentData[lh][colIdx]);
            input.addEventListener("input", () => {
              const val = Math.max(0, Math.min(100, parseInt(input.value, 10) || 0));
              currentData[lh][colIdx] = val;
              updateSum(lh);
            });
            inputs[lh].push(input);
            td.append(input);
            tr.append(td);
          }

          const sumTd = h("td", "");
          const badge = h("span", "oracle-odds-sum");
          sumBadges[lh] = badge;
          sumTd.append(badge);
          tr.append(sumTd);
          updateSum(lh);

          tbody.append(tr);
        }
        table.append(tbody);
        tableWrap.append(table);

        const actions = h("div", "");
        actions.style.display = "flex";
        actions.style.alignItems = "center";
        actions.style.gap = "0.6rem";
        actions.style.marginTop = "0.5rem";

        const saveBtn = button("primary", LOCALE === "pt-BR" ? "Salvar Probabilidades" : "Save Odds");
        saveBtn.addEventListener("click", () => {
          saveOddsTable(currentData);
          saveBtn.textContent = LOCALE === "pt-BR" ? "✓ Salvo!" : "✓ Saved!";
          setTimeout(() => {
            saveBtn.textContent = LOCALE === "pt-BR" ? "Salvar Probabilidades" : "Save Odds";
          }, 1800);
        });

        const resetBtn = button("ghost", LOCALE === "pt-BR" ? "Restaurar Padrões" : "Restore Defaults");
        resetBtn.addEventListener("click", () => {
          if (confirm(LOCALE === "pt-BR" ? "Deseja restaurar as probabilidades padrão do Oráculo?" : "Reset oracle odds back to default?")) {
            resetOddsTable();
            this.paint();
          }
        });

        actions.append(saveBtn, resetBtn);
        wrap.append(presetsRow, tableWrap, actions);
        return wrap;
      }
    );
    add(
      "oracles",
      LOCALE === "pt-BR" ? "Faíscas de Inspiração (Vocabulário)" : "Idea Sparks (Word Banks)",
      LOCALE === "pt-BR"
        ? "Configure as listas de palavras geradoras de ideias para Ação, Tema, Descritor e Foco. Uma palavra por linha ou separadas por vírgula."
        : "Configure the spark vocabulary lists for Action, Theme, Descriptor, and Focus. One word per line or comma-separated.",
      () => {
        const wrap = h("div", "oracle-settings-section");
        let activeLang: "pt" | "en" = (LOCALE === "pt-BR" ? "pt" : "en");

        const langBar = h("div", "");
        langBar.style.display = "flex";
        langBar.style.alignItems = "center";
        langBar.style.gap = "0.5rem";
        langBar.style.marginBottom = "0.5rem";

        const langLabel = h("span", "", LOCALE === "pt-BR" ? "Idioma do Vocabulário:" : "Word Bank Language:");
        langLabel.style.fontSize = "0.85rem";
        langLabel.style.color = "var(--ink-2)";

        const ptBtn = button("ghost", "🇧🇷 Português");
        const enBtn = button("ghost", "🇺🇸 English");

        const grid = h("div", "oracle-sparks-grid");

        const cols: {
          key: keyof SparkWordLists;
          icon: string;
          labelPt: string;
          labelEn: string;
          hintPt: string;
          hintEn: string;
          textarea?: HTMLTextAreaElement;
          countEl?: HTMLElement;
        }[] = [
          {
            key: "action",
            icon: "⚡",
            labelPt: "Ação (Action)",
            labelEn: "Action",
            hintPt: "Verbos de movimento, conflito e impacto",
            hintEn: "Verbs of motion, conflict, and impact",
          },
          {
            key: "theme",
            icon: "🌌",
            labelPt: "Tema (Theme)",
            labelEn: "Theme",
            hintPt: "Conceitos, mistérios, ideias e atmosferas",
            hintEn: "Concepts, mysteries, ideas, and atmospheres",
          },
          {
            key: "descriptor",
            icon: "🔍",
            labelPt: "Descritor (Descriptor)",
            labelEn: "Descriptor",
            hintPt: "Adjetivos, qualidades e estados de coisas",
            hintEn: "Adjectives, qualities, and states of being",
          },
          {
            key: "focus",
            icon: "🎯",
            labelPt: "Foco (Focus)",
            labelEn: "Focus",
            hintPt: "Alvos, objetos, entidades, perigos e locais",
            hintEn: "Targets, items, entities, hazards, and places",
          },
        ];

        const refreshTextareas = () => {
          if (activeLang === "pt") {
            ptBtn.className = "btn-secondary";
            enBtn.className = "btn-ghost";
          } else {
            ptBtn.className = "btn-ghost";
            enBtn.className = "btn-secondary";
          }
          const words = getSparkWords(activeLang);
          for (const col of cols) {
            if (col.textarea && col.countEl) {
              const list = words[col.key] || [];
              col.textarea.value = list.join("\n");
              col.countEl.textContent = `(${list.length})`;
            }
          }
        };

        ptBtn.addEventListener("click", () => { activeLang = "pt"; refreshTextareas(); });
        enBtn.addEventListener("click", () => { activeLang = "en"; refreshTextareas(); });
        langBar.append(langLabel, ptBtn, enBtn);

        for (const col of cols) {
          const colEl = h("div", "oracle-spark-col");
          const labelWrap = h("div", "oracle-spark-col-label");
          const nameSpan = h("span", "oracle-spark-col-name", `${col.icon} ${LOCALE === "pt-BR" ? col.labelPt : col.labelEn}`);
          const countSpan = h("span", "");
          countSpan.style.fontSize = "0.75rem";
          countSpan.style.color = "var(--ink-3)";
          col.countEl = countSpan;
          labelWrap.append(nameSpan, countSpan);

          const hintEl = h("div", "oracle-spark-col-hint", LOCALE === "pt-BR" ? col.hintPt : col.hintEn);

          const ta = h("textarea", "oracle-spark-textarea") as HTMLTextAreaElement;
          ta.rows = 5;
          col.textarea = ta;
          ta.addEventListener("input", () => {
            const count = ta.value.split(/[\n,]+/).map(w => w.trim()).filter(Boolean).length;
            countSpan.textContent = `(${count})`;
          });

          colEl.append(labelWrap, hintEl, ta);
          grid.append(colEl);
        }

        refreshTextareas();

        const actions = h("div", "");
        actions.style.display = "flex";
        actions.style.alignItems = "center";
        actions.style.gap = "0.6rem";
        actions.style.flexWrap = "wrap";
        actions.style.marginTop = "0.5rem";

        const saveBtn = button("primary", LOCALE === "pt-BR" ? "Salvar Vocabulário" : "Save Words");
        saveBtn.addEventListener("click", () => {
          const parsed: SparkWordLists = {
            action: (cols[0]?.textarea?.value || "").split(/[\n,]+/).map(w => w.trim()).filter(Boolean),
            theme: (cols[1]?.textarea?.value || "").split(/[\n,]+/).map(w => w.trim()).filter(Boolean),
            descriptor: (cols[2]?.textarea?.value || "").split(/[\n,]+/).map(w => w.trim()).filter(Boolean),
            focus: (cols[3]?.textarea?.value || "").split(/[\n,]+/).map(w => w.trim()).filter(Boolean),
          };
          saveSparkWords(activeLang, parsed);
          saveBtn.textContent = LOCALE === "pt-BR" ? "✓ Salvo!" : "✓ Saved!";
          setTimeout(() => {
            saveBtn.textContent = LOCALE === "pt-BR" ? "Salvar Vocabulário" : "Save Words";
          }, 1800);
        });

        const resetBtn = button("ghost", LOCALE === "pt-BR" ? "Restaurar Palavras Padrão" : "Restore Built-in Words");
        resetBtn.addEventListener("click", () => {
          if (confirm(LOCALE === "pt-BR" ? `Deseja restaurar as palavras padrão (${activeLang})?` : `Reset ${activeLang} word lists to default?`)) {
            resetSparkWords(activeLang);
            refreshTextareas();
          }
        });

        const testBox = h("span", "");
        testBox.style.fontSize = "0.85rem";
        testBox.style.fontStyle = "italic";
        testBox.style.color = "var(--brass-ink)";
        testBox.style.marginLeft = "0.5rem";

        const testBtn = button("ghost", LOCALE === "pt-BR" ? "🎲 Testar Faísca" : "🎲 Roll Test");
        testBtn.addEventListener("click", () => {
          const spark = generateSpark(activeLang);
          testBox.textContent = spark.formatted;
        });

        actions.append(saveBtn, resetBtn, testBtn, testBox);
        wrap.append(langBar, grid, actions);
        return wrap;
      }
    );
    add(
      "oracles",
      LOCALE === "pt-BR" ? "Tabelas de Oráculo Personalizadas" : "Custom Oracle Tables",
      LOCALE === "pt-BR"
        ? "Crie suas próprias tabelas de sorteio aleatório ou importe tabelas JSON para usar no painel do Oráculo."
        : "Create your own random rollable tables or import JSON tables for the Oracle.",
      () => {
        const wrap = h("div", "oracle-settings-section");
        const all = getAllOracleTables();

        const topBar = h("div", "");
        topBar.style.display = "flex";
        topBar.style.gap = "0.6rem";
        topBar.style.marginBottom = "0.6rem";

        const newBtn = button("primary", LOCALE === "pt-BR" ? "+ Nova Tabela" : "+ New Table");
        const importBtn = button("ghost", LOCALE === "pt-BR" ? "Importar JSON…" : "Import JSON…");
        const exportAllBtn = button("ghost", LOCALE === "pt-BR" ? "Exportar Todas (JSON)" : "Export All (JSON)");

        topBar.append(newBtn, importBtn, exportAllBtn);

        const listWrap = h("div", "oracle-custom-tables-list");

        const openTableEditor = (existing?: OracleTable) => {
          const name = prompt(LOCALE === "pt-BR" ? "Nome da tabela:" : "Table name:", existing?.name || "");
          if (!name) return;
          const desc = prompt(LOCALE === "pt-BR" ? "Descrição curta ou objetivo:" : "Short description or purpose:", existing?.desc || "");
          const entriesRaw = prompt(LOCALE === "pt-BR" ? "Itens da tabela (separados por ponto e vírgula ';' ou quebra de linha):" : "Table entries (separated by semicolon ';' or newlines):", existing ? existing.entries.join(" ; ") : "");
          if (!entriesRaw) return;
          const entries = entriesRaw.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
          if (entries.length === 0) {
            alert(LOCALE === "pt-BR" ? "A tabela precisa de pelo menos 1 item." : "Table must have at least 1 entry.");
            return;
          }
          const tableObj: OracleTable = {
            id: existing?.id || `custom-table-${Date.now()}`,
            name,
            desc: desc || "",
            icon: existing?.icon || "dice",
            entries,
          };
          saveCustomOracleTable(tableObj);
          this.paint();
        };

        newBtn.addEventListener("click", () => openTableEditor());

        importBtn.addEventListener("click", () => {
          const json = prompt(LOCALE === "pt-BR" ? "Cole o JSON da tabela (OracleTable ou lista):" : "Paste the Oracle Table JSON:");
          if (!json) return;
          try {
            const parsed = JSON.parse(json);
            const tables = Array.isArray(parsed) ? parsed : [parsed];
            for (const t of tables) {
              if (t && typeof t.name === "string" && Array.isArray(t.entries)) {
                saveCustomOracleTable({
                  id: t.id || `custom-table-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  name: t.name,
                  desc: t.desc || "",
                  icon: t.icon || "dice",
                  entries: t.entries.map(String),
                });
              }
            }
            this.paint();
            alert(LOCALE === "pt-BR" ? "Tabela(s) importada(s) com sucesso!" : "Table(s) imported successfully!");
          } catch (err: any) {
            alert((LOCALE === "pt-BR" ? "Erro ao importar JSON: " : "Error importing JSON: ") + (err?.message || err));
          }
        });

        exportAllBtn.addEventListener("click", () => {
          const json = JSON.stringify(all, null, 2);
          navigator.clipboard.writeText(json).then(() => {
            exportAllBtn.textContent = LOCALE === "pt-BR" ? "Copiado!" : "Copied!";
            setTimeout(() => {
              exportAllBtn.textContent = LOCALE === "pt-BR" ? "Exportar Todas (JSON)" : "Export All (JSON)";
            }, 2000);
          });
        });

        for (const tbl of all) {
          const isBuiltin = tbl.id === "twists" || tbl.id === "complications" || tbl.id === "atmosphere" || tbl.id === "npc_intent";
          const row = h("div", "oracle-custom-table-row");

          const info = h("div", "oracle-custom-table-info");
          const titleBox = h("div", "");
          titleBox.style.display = "flex";
          titleBox.style.alignItems = "center";
          titleBox.style.gap = "0.5rem";

          const nameEl = h("span", "oracle-custom-table-name", tbl.name);
          const badge = h("span", isBuiltin ? "statblock-pill-tag" : "statblock-pill-default", isBuiltin ? (LOCALE === "pt-BR" ? "Nativa" : "Built-in") : "Custom");
          const countBadge = h("span", "");
          countBadge.style.fontSize = "0.74rem";
          countBadge.style.color = "var(--ink-3)";
          countBadge.textContent = `(${tbl.entries.length} ${tbl.entries.length === 1 ? "item" : "itens"})`;

          titleBox.append(nameEl, badge, countBadge);

          const descEl = h("span", "oracle-custom-table-desc", tbl.desc);
          info.append(titleBox, descEl);

          const actions = h("div", "oracle-custom-table-actions");

          const viewBtn = button("ghost", isBuiltin ? (LOCALE === "pt-BR" ? "Visualizar" : "View") : (LOCALE === "pt-BR" ? "Editar" : "Edit"));
          viewBtn.addEventListener("click", () => {
            if (isBuiltin) {
              alert(`${tbl.name}\n\n${tbl.entries.map((e, idx) => `${idx + 1}. ${e}`).join("\n")}`);
            } else {
              openTableEditor(tbl);
            }
          });
          actions.append(viewBtn);

          const jsonBtn = button("ghost", "JSON");
          jsonBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(JSON.stringify(tbl, null, 2)).then(() => {
              jsonBtn.textContent = "Copiado!";
              setTimeout(() => (jsonBtn.textContent = "JSON"), 1800);
            });
          });
          actions.append(jsonBtn);

          if (!isBuiltin) {
            const delBtn = button("ghost", LOCALE === "pt-BR" ? "Excluir" : "Delete");
            delBtn.addEventListener("click", () => {
              if (confirm(LOCALE === "pt-BR" ? `Deseja excluir a tabela "${tbl.name}"?` : `Delete table "${tbl.name}"?`)) {
                deleteCustomOracleTable(tbl.id);
                this.paint();
              }
            });
            actions.append(delBtn);
          }

          row.append(info, actions);
          listWrap.append(row);
        }

        wrap.append(topBar, listWrap);
        return wrap;
      }
    );
    add("editor", t.previewTabs, t.previewTabsDesc, () => this.toggle(settings.previewTabs, (v) => {
      settings.previewTabs = v;
      saveSettings();
      if (!v) for (const sp of spaces) for (const p of sp.layout.panes()) for (const l of p.leaves) l.keep();
    }));
    add("editor", t.defaultMode, t.defaultModeDesc, () => this.select([["preview", t.reading], ["live", t.edit]], settings.defaultMode, (v) => { settings.defaultMode = v; saveSettings(); }));
    add("editor", t.spellcheck, t.spellcheckDesc, () => this.toggle(settings.spellcheck, (v) => { settings.spellcheck = v; saveSettings(); }));
    add("editor", t.blocks.handles, t.blocks.handlesDesc, () => this.toggle(settings.blockHandles, (v) => { settings.blockHandles = v; saveSettings(); }));
    add("editor", pv.setting, pv.settingDesc, () => this.toggle(settings.hoverPreview, (v) => { settings.hoverPreview = v; saveSettings(); }));
    // The suggestion while typing (ADR 0089 item 5): off until the person
    // turns it on; the folders and names it never offers.
    add("editor", ls.setting, ls.settingDesc, () => this.toggle(settings.suggestLinks, (v) => { settings.suggestLinks = v; saveSettings(); }));
    add("editor", ls.ignoredFolders, ls.ignoredFoldersDesc, () => this.lines(settings.suggestIgnoreFolders, (v) => { settings.suggestIgnoreFolders = v.map((l) => l.replace(/^\/+|\/+$/g, "")).filter(Boolean); saveSettings(); }, "Arquivo"));
    add("editor", ls.ignoredNames, ls.ignoredNamesDesc, () => this.lines(settings.suggestIgnoreNames, (v) => { settings.suggestIgnoreNames = v; saveSettings(); }, "Mesa"));
    add("editor", t.blocks.enterNewBlock, t.blocks.enterNewBlockDesc, () => this.toggle(settings.enterNewBlock, (v) => { settings.enterNewBlock = v; saveSettings(); }));
    // Sub-division for Line Numbers, in the exact order of the mode buttons on screen:
    // 1. Reading mode (Leitura)
    // 2. Edit mode (Editar)
    // 3. Source mode (Fonte)
    // The three together and last of the section, under one heading: an
    // item between them drew the heading twice, and an item after them
    // would read as one of them.
    add("editor", t.lineNumbersPreview, t.lineNumbersPreviewDesc, () => this.toggle(settings.lineNumbersPreview, (v) => { settings.lineNumbersPreview = v; saveSettings(); }), t.lineNumbers);
    add("editor", t.lineNumbersEdit, t.lineNumbersEditDesc, () => this.toggle(settings.lineNumbersEdit, (v) => { settings.lineNumbersEdit = v; saveSettings(); }), t.lineNumbers);
    add("editor", t.lineNumbersSource, t.lineNumbersSourceDesc, () => this.toggle(settings.lineNumbersSource, (v) => { settings.lineNumbersSource = v; saveSettings(); }), t.lineNumbers);
    add("files", t.linkFormat, t.linkFormatDesc, () => this.select([["shortest", t.linkShortest], ["relative", t.linkRelative], ["root", t.linkRoot]], settings.linkFormat, (v) => { settings.linkFormat = v; saveSettings(); }));
    add("files", t.attachments, t.attachmentsDesc, () => this.text(settings.attachments, (v) => { settings.attachments = v; saveSettings(); }));
    // The daily notes' folder is the folder's now, with the other periods
    // (ADR 0093 item 4); without a folder open, this machine's, as before.
    if (!currentFolder) add("files", t.dailyFolder, t.dailyDesc, () => this.text(settings.daily, (v) => { settings.daily = v; saveSettings(); }));
    if (currentFolder) out.push({ section: "periodic", title: ps.section, desc: ps.sectionDesc, node: () => periodicBody((a, b, c, d) => this.item(a, b, c, d), () => this.paint()) });
    add("files", t.templates, t.templatesDesc, () => this.text(settings.templates, (v) => { settings.templates = v; saveSettings(); }));
    // Tab indents in an editor: how the keyboard leaves one, said where
    // the keys are (CodeMirror's own way out: Esc then Tab, or its
    // tab-focus toggle, Ctrl-M, ⇧⌥M on macOS).
    add("hotkeys", t.editorTab, t.editorTabDesc.replace("{keys}", prettyKeys(MAC ? "Shift-Alt-m" : "Mod-m")), () => null);
    for (const c of allCommands(true)) add("hotkeys", c.label, "", () => this.hotkeyControl(c.id, c.label));
    // The command line and MCP (ADR 0054). The folder is named by its key
    // in what a client starts: its path crosses nowhere (ADR 0026 rule 4).
    const me = signedIn();
    if (can("account") && me) for (const e of accountEntries(me, (a, b, c) => this.item(a, b, c))) out.push({ section: "account", ...e });
    if (can("local_folders")) out.push({ section: "servers", title: serverStrings().connect, desc: serverStrings().connectDesc, node: () => serversBody((a, b, c) => this.item(a, b, c)) });
    if (can("local_folders")) out.push({ section: "localserver", title: localStrings().title, desc: "", node: () => localServerBody((a, b, c) => this.item(a, b, c)) });
    if (currentFolder && can("write")) out.push({ section: "trash", title: trashStrings().section, desc: trashStrings().lead, node: () => trashBody((a, b, c) => this.item(a, b, c)) });
    if (can("local_folders") && currentFolder) out.push({ section: "sync", title: syncStrings().title, desc: syncStrings().desc, node: () => syncBody((a, b, c) => this.item(a, b, c)) });
    if (this.offlineHere()) out.push({ section: "sync", title: offlineWords().title, desc: offlineWords().desc, node: () => offlineBody((a, b, c) => this.item(a, b, c)) });
    add("cli", t.cliTitle, WINDOWS ? t.cliDescWindows : LINUX ? t.cliDescLinux : t.cliDesc, () => this.cliControl());
    // One server per folder, or one for all of Verso (ADR 0054, 2026-10-08).
    add("cli", t.mcpModeTitle, t.mcpModeDesc, () => this.select([["folder", t.mcpModeFolder], ["all", t.mcpModeAll]], settings.mcpMode, (v) => { settings.mcpMode = v; saveSettings(); this.paint(); }));
    add("cli", t.mcpTitle, settings.mcpMode === "all" ? t.mcpDescAll : t.mcpDesc, () => this.mcpControl());
    if (settings.mcpMode === "all" && currentFolder) add("cli", t.agentVisibleTitle, t.agentVisibleDesc, () => this.agentVisibleControl());
    const args = mcpArgs();
    if (args) {
      const guess = settings.mcpMode === "all" ? "verso" : `verso-${currentFolder.replace(/-[0-9a-f]{16}$/, "")}`;
      // The command a client starts, and the server's name, as the host
      // knows them (the linked command line, or on Windows the bundled
      // verso.exe by its path; another folder of the same name already
      // added makes it `verso-<parent>-<name>`, ADR 0054).
      const quoted = (text: string) => (/\s/.test(text) ? `"${text}"` : text);
      const code = (command: string, server: string) => `claude mcp add ${quoted(server)} -- ${quoted(command)} ${args.join(" ")}`;
      const other = (command: string, server: string) => JSON.stringify({ mcpServers: { [server]: { command, args } } }, null, 2);
      add("cli", t.mcpCodeTitle, t.mcpCodeDesc, () => this.snippet(code("verso", guess), (st) => code(st.command, st.server)));
      add("cli", t.mcpOtherTitle, t.mcpOtherDesc, () => this.snippet(other("/usr/local/bin/verso", guess), (st) => other(st.command, st.server)));
    }
    // The command line and the agents only where the side has them.
    return can("agents") ? out : out.filter((o) => o.section !== "cli");
  }
  /** Where the command line stands, and the button that changes it. */
  private cliControl(): HTMLElement {
    const wrap = h("span", "setting-actions");
    const said = h("span", "setting-value", "…");
    said.setAttribute("aria-live", "polite");
    const install = button("ghost", t.cliInstall);
    const remove = button("ghost", t.cliRemove);
    install.hidden = true;
    remove.hidden = true;
    const show = (state: CliState) => {
      said.textContent = state === "ours" ? t.cliOurs : state === "missing" ? t.cliMissing : state === "elsewhere" ? (LINUX ? t.cliElsewhereLinux : t.cliElsewhere) : state === "bundled" ? (LINUX ? t.cliBundledLinux : t.cliBundled) : t.cliUnbundled;
      install.hidden = state === "ours" || state === "unbundled" || state === "bundled";
      install.textContent = state === "elsewhere" ? t.cliReplace : t.cliInstall;
      install.title = install.textContent;
      remove.hidden = state !== "ours";
    };
    void commands.cliStatus().then(show);
    install.addEventListener("click", () => void (async () => {
      let replace = false;
      if ((await commands.cliStatus()) === "elsewhere") {
        if (!(await ask(LINUX ? t.cliReplaceAskLinux : t.cliReplaceAsk, { yes: t.cliReplace, no: t.cancel }))) return;
        replace = true;
      }
      const r = await commands.installCli(replace);
      if (r.status !== "ok") {
        said.textContent = r.error.message === "cancelled" ? t.cliCancelled : r.error.message;
        return;
      }
      if (r.data === "ours") ui.status.textContent = t.cliDone;
      // The agents' item depends on it.
      this.paint();
    })());
    remove.addEventListener("click", () => void (async () => {
      const r = await commands.uninstallCli();
      if (r.status !== "ok") {
        said.textContent = r.error.message === "cancelled" ? t.cliCancelled : r.error.message;
        return;
      }
      ui.status.textContent = t.cliRemoved;
      this.paint();
    })());
    wrap.append(said, install, remove);
    return wrap;
  }
  /** Whether Claude Desktop starts this folder's server, and the button
   *  that adds it — after showing what goes in. */
  private mcpControl(): HTMLElement {
    const wrap = h("span", "setting-actions");
    const said = h("span", "setting-value", "…");
    said.setAttribute("aria-live", "polite");
    wrap.append(said);
    const args = mcpArgs();
    if (!args) {
      said.textContent = t.mcpNoFolder;
      return wrap;
    }
    const all = settings.mcpMode === "all";
    const add = button("ghost", t.mcpClaude);
    add.hidden = true;
    wrap.append(add);
    let server = "";
    let command = "/usr/local/bin/verso";
    void Promise.all([commands.cliStatus(), commands.mcpStatus(all)]).then(([cli, st]) => {
      if (st.status !== "ok") {
        said.textContent = st.error.message;
        return;
      }
      server = st.data.server;
      command = st.data.command;
      const claude = st.data.claude;
      if (claude === "noClient") {
        // A way to get it, rather than a dead "not found".
        said.textContent = t.mcpNoClaude;
        add.textContent = t.mcpGetClaude;
        add.title = t.mcpGetClaude;
        add.dataset["get"] = "1";
        add.hidden = false;
      }
      else if (claude === "same") said.textContent = t.mcpClaudeSame;
      else if (cli !== "ours" && cli !== "bundled") said.textContent = t.mcpNeedCli;
      else {
        said.textContent = claude === "different" ? t.mcpClaudeDifferent : "";
        add.hidden = false;
      }
    });
    add.addEventListener("click", () => void (async () => {
      if (add.dataset["get"]) {
        const r = await commands.openClaudeDownload();
        if (r.status !== "ok") said.textContent = r.error.message;
        return;
      }
      // What the host will write, as it will write it (ADR 0054 point 2).
      const entry = JSON.stringify({ [server]: { command, args } }, null, 2);
      if (!(await ask(t.mcpAddAsk.replace("{entry}", entry), { yes: t.mcpAddYes, no: t.cancel }))) return;
      const r = await commands.mcpAddClaude(all);
      if (r.status !== "ok") {
        said.textContent = r.error.message;
        return;
      }
      said.textContent = `${t.mcpAdded}${r.data.backup ? ` ${t.mcpBackup.replace("{name}", r.data.backup)}` : ""}`;
      add.hidden = true;
    })());
    return wrap;
  }
  /** Whether the server for all of Verso serves the open folder: hidden
   *  until the person says so (ADR 0054 point 4). The mark lives with the
   *  host, in the configuration directory, since the server runs without
   *  the app. */
  private agentVisibleControl(): HTMLElement {
    const l = this.toggle(false, (v) => void commands.setAgentVisible(v).then((r) => {
      if (r.status !== "ok") {
        // The switch says what the host stored, never what was asked.
        box.checked = !v;
        ui.status.textContent = r.error.message;
      } else box.checked = r.data;
    }));
    const box = l.querySelector("input") as HTMLInputElement;
    box.disabled = true;
    void commands.agentVisible().then((r) => {
      if (r.status !== "ok") return;
      box.checked = r.data;
      box.disabled = false;
    });
    return l;
  }
  /** A text to copy; `fromHost`, when given, writes it again from the
   *  host's MCP status once it answers. */
  private snippet(first: string, fromHost?: (st: McpStatus) => string): HTMLElement {
    let text = first;
    const wrap = h("div", "setting-snippet");
    const code = h("pre", "setting-code", text);
    if (fromHost) {
      void commands.mcpStatus(settings.mcpMode === "all").then((st) => {
        if (st.status !== "ok") return;
        text = fromHost(st.data);
        code.textContent = text;
      });
    }
    const copy = button("ghost", t.copyText);
    copy.addEventListener("click", () => void navigator.clipboard.writeText(text).then(() => {
      copy.textContent = t.copiedText;
      window.setTimeout(() => (copy.textContent = t.copyText), 1500);
    }));
    wrap.append(code, copy);
    return wrap;
  }
  private hotkeyControl(id: string, label: string): HTMLElement {
    const wrap = h("span", "hotkey");
    const shown = h("kbd", "", prettyKeys(keyOf(id)) || t.hotkeyNone);
    shown.setAttribute("aria-live", "polite");
    if (settings.hotkeys[id] !== undefined) shown.classList.add("custom");
    const change = button("ghost", t.hotkeyChange);
    change.setAttribute("aria-label", `${t.hotkeyChange}: ${label}`);
    change.dataset["hotkey"] = id;
    change.addEventListener("click", () => {
      disarmRecorder?.();
      shown.textContent = t.hotkeyPress;
      shown.classList.add("recording");
      // A click elsewhere, leaving the window, Escape or Tab: nothing changes.
      const away = (ev: MouseEvent) => {
        if (ev.target !== change) stop();
      };
      const stop = () => {
        hotkeyRecorder = null;
        disarmRecorder = null;
        document.removeEventListener("mousedown", away, true);
        window.removeEventListener("blur", stop);
        shown.classList.remove("recording");
        shown.textContent = prettyKeys(keyOf(id)) || t.hotkeyNone;
      };
      document.addEventListener("mousedown", away, true);
      window.addEventListener("blur", stop);
      disarmRecorder = stop;
      hotkeyRecorder = (e: KeyboardEvent) => {
        const combo = comboOf(e);
        if (!combo) return;
        // Tab leaves the control, as anywhere else: no key trap here.
        if (combo === "Tab" || combo === "Shift-Tab") return stop();
        e.preventDefault();
        e.stopPropagation();
        if (combo === "Escape") return stop();
        // Without Mod a combination never fires; a reserved one would take
        // copy, paste or undo away. Say so, and keep listening.
        if (!combo.startsWith("Mod-")) return void (shown.textContent = t.hotkeyNeedsMod.replace("{mod}", prettyKeys("Mod")));
        if (RESERVED.has(combo) && DEFAULT_KEYS[id] !== combo) return void (shown.textContent = `${prettyKeys(combo)}: ${t.hotkeyReserved}`);
        stop();
        // The same keys cannot mean two things: the other command loses them.
        for (const other of allCommands(true)) if (other.id !== id && keyOf(other.id) === combo) settings.hotkeys[other.id] = "";
        settings.hotkeys[id] = combo;
        saveSettings();
        paintKeyHints();
        this.paint();
        this.body.querySelector<HTMLElement>(`[data-hotkey="${id}"]`)?.focus();
      };
    });
    const reset = button("ghost", t.hotkeyReset);
    reset.setAttribute("aria-label", `${t.hotkeyReset}: ${label}`);
    reset.addEventListener("click", () => { delete settings.hotkeys[id]; saveSettings(); paintKeyHints(); this.paint(); });
    reset.hidden = settings.hotkeys[id] === undefined;
    wrap.append(shown, change, reset);
    return wrap;
  }
  /** On a phone the sections are a row scrolled sideways, and drawing it
   *  again starts it at the first: the open section's tab is brought into
   *  view — the row alone scrolls, never the page. */
  private revealCurrent(): void {
    const current = this.nav.querySelector<HTMLElement>('[aria-current="true"]');
    if (!current || this.nav.scrollWidth <= this.nav.clientWidth) return;
    const row = this.nav.getBoundingClientRect();
    const tab = current.getBoundingClientRect();
    if (tab.left < row.left) this.nav.scrollLeft -= row.left - tab.left;
    else if (tab.right > row.right) this.nav.scrollLeft += tab.right - row.right;
  }
  paint(): void {
    const q = this.search.value.trim().toLowerCase();
    const navItems: HTMLElement[] = [];
    const CATEGORY_NAMES: Record<string, { pt: string; en: string }> = {
      app: { pt: "Aplicação", en: "Application" },
      editor: { pt: "Notas & Editor", en: "Notes & Editor" },
      rpg: { pt: "RPG & Mesa Solo", en: "RPG & Solo Play" },
      system: { pt: "Rede & Conexões", en: "Network & System" },
    };

    let lastCategory = "";
    for (const sec of this.sections()) {
      if (!q && sec.category !== lastCategory) {
        lastCategory = sec.category;
        const catInfo = CATEGORY_NAMES[sec.category];
        const catLabel = LOCALE === "pt-BR" ? catInfo?.pt : catInfo?.en;
        if (catLabel) {
          navItems.push(h("div", "settings-nav-group-header", catLabel));
        }
      }
      const b = h("button", "settings-nav-item");
      b.type = "button";
      b.append(icon(sec.icon), h("span", "", sec.label));
      b.setAttribute("aria-current", String(sec.id === this.section && !q));
      b.addEventListener("click", () => { this.section = sec.id; this.search.value = ""; this.paint(); });
      navItems.push(b);
    }
    this.nav.replaceChildren(...navItems);
    this.revealCurrent();
    const items = this.items().filter((it) => (q ? `${it.group ?? ""} ${it.title} ${it.desc}`.toLowerCase().includes(q) : it.section === this.section));
    const frag = document.createDocumentFragment();
    let lastSection = "";
    let lastGroup = "";
    for (const it of items) {
      if (q && it.section !== lastSection) {
        lastSection = it.section;
        frag.append(h("h3", "settings-heading", this.sections().find((sec) => sec.id === it.section)?.label ?? ""));
      }
      if (it.group && it.group !== lastGroup) {
        lastGroup = it.group;
        frag.append(h("h3", "settings-subheading", it.group));
      } else if (!it.group) {
        lastGroup = "";
      }
      frag.append(it.node());
    }
    if (q && items.length === 0) frag.append(h("p", "settings-hint", t.noMatches));
    if (!q) {
      const title = h("h2", "settings-title", this.sections().find((sec) => sec.id === this.section)?.label ?? "");
      const hint = this.section === "hotkeys" ? t.hotkeysHint : this.section === "notify" ? notifyStrings().sectionLead : "";
      this.body.replaceChildren(title, this.notice, ...(hint ? [h("p", "settings-hint", hint)] : []), frag);
    } else this.body.replaceChildren(this.notice, frag);
  }
}
