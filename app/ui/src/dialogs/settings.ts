// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { may } from "../access";
import { can, host } from "../can";
import { IMPORT_CEILING_MB, importSetting } from "../attachName";
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
import { fail } from "../errors";
import { hasHostZoom, zoomWords } from "../zoom";
import { zoomControl } from "../zoomControl";
import { focusesSummary, getLocalFocuses, getSyncFocuses, isSyncFocusesAsked, loadFocuses, setFocusesSummary, setLocalFocuses, setSyncFocuses, setSyncFocusesAsked, tellHostSyncFocuses } from "../focuses";
import { bookmarks } from "../bookmarks";
import { currentFolder } from "../folder";
import { changeFolder, folderValues, folderWritable } from "../folderLayer";
import type { Scope } from "../organize/layerRules";
import { periodicBody } from "../periodic/settingsView";
import { ps } from "../periodic/strings";
import { icon } from "../icons";
import { allCommands, comboOf, DEFAULT_KEYS, keyOf, MAC, paintKeyHints, PLAIN_HOTKEYS, prettyKeys, reloadWindow, RESERVED } from "../keys";
import { LINUX, WINDOWS } from "../platform";
import { defaultAppDesc, ls as looseWords } from "../looseStrings";
import { paneToOpenIn, spaces } from "../layout/spaces";
import { NoteLeaf } from "../leaves/note";
import { panel, ribbon, updateController } from "../main";
import { walkRulesChanged } from "../open";
import { hiddenFolderKeys, showHiddenFolders } from "../panel/hiddenFolders";
import { sh } from "../shareStrings";
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
import { CHIMES, type Chime, previewChime, readChime, readVolume } from "../table/chime";
import { systemControl } from "../notify/system";
import { signedIn } from "../web/api";
import { ls } from "../editor/suggestStrings";
import { pv } from "../preview/strings";
import { agentVisibleControl, cliControl, mcpArgs, mcpControl, snippet } from "./settings/agentControls";
import { wireFrame } from "./settings/frame";
import { fs } from "../featureStrings";
import { featureItems, offNotice } from "./settings/featureItems";
import { terminalItems } from "../terminal/settingsItems";
import { oracleItems } from "./settings/oracleItems";
import { statblockItems } from "./settings/statblockItems";
import { creditsItems } from "./settings/creditsItems";
import { cs } from "./settings/creditsStrings";
import { ss } from "./settings/strings";
import { LOOK_EVENT } from "../theme/actions";
import { fontSample, fontSampleWords } from "../fontSample";
import { tabsSettings } from "../panel/tabsSettings";
import { tabWords } from "../panel/tabStrings";
import { themeGallery } from "../theme/gallery";
import { openMoreThemes } from "../theme/more";
import { W as lookWords } from "../theme/strings";
import type { ItemCtx, SettingItem } from "./settings/types";

/** A settings page is a list of items: a title, a line about it, a control. */
export let hotkeyRecorder: ((e: KeyboardEvent) => void) | null = null;
/** Ends a recording in progress, leaving the keys as they were. */
export let disarmRecorder: (() => void) | null = null;
export let updateCardUnsub: (() => void) | null = null;
export class SettingsDialog {
  readonly el = h("div", "quick settings");
  readonly box = h("div", "settings-box");
  readonly nav = h("nav", "settings-nav");
  readonly body = h("div", "settings-body");
  readonly search = h("input", "settings-search");
  private section = "general";
  /** On a phone the sections are a list first and a page after a tap
   *  (CSS shows one of the two by the box's `phone-list` / `phone-page`). */
  private phoneList = true;
  private readonly frame: { restoreSavedSize: () => void; resetSize: () => void };
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
    top.append(this.search);
    side.append(top, this.nav);
    // In the box's top right corner, where a dialog's close is looked for (first in the DOM: reached early by Tab).
    this.box.append(close, side, this.body);
    this.frame = wireFrame(this.box, this.el, side);

    this.el.append(this.box);
    document.body.append(this.el);
    this.el.addEventListener("mousedown", (e) => { if (e.target === this.el) this.hide(); });
    // Escape anywhere closes the settings — unless a dialog above them took
    // it (the palette over the settings closes alone, a11y.ts).
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !e.defaultPrevented && !this.el.hidden && isTop(this.el) && !hotkeyRecorder) this.hide(); });
  }


  show(section?: string): void {
    this.phoneList = !section;
    if (section) this.section = section;
    this.frame.restoreSavedSize();
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
      { id: "features", label: fs.section, icon: "gear", category: "app" },
      { id: "notify", label: notifyStrings().section, icon: "bell", category: "app" },
      { id: "hotkeys", label: t.sHotkeys, icon: "keyboard", category: "app" },
      { id: "credits", label: cs.section, icon: "heart", category: "app" },

      // 2. Notas & Editor / Notes & Editing
      { id: "editor", label: t.sEditor, icon: "edit", category: "editor" },
      { id: "files", label: t.sFiles, icon: "folder", category: "editor" },
      { id: "organizing", label: t.sOrganizing, icon: "folder", category: "editor" },
      ...(currentFolder ? [{ id: "periodic", label: ps.section, icon: "calendar", category: "editor" as const }] : []),
      ...(currentFolder && may("", "trash") ? [{ id: "trash", label: trashStrings().section, icon: "trash", category: "editor" as const }] : []),
      { id: "board", label: boardText.sBoard, icon: "board", category: "editor" },

      // 3. RPG & Mesa Solo / RPG & Solo Play
      { id: "rpgfeatures", label: fs.rpgSection, icon: "dice", category: "rpg" },
      { id: "oracles", label: ss.sOracles, icon: "sparkles", category: "rpg" },
      { id: "statblocks", label: ss.sStatblocks, icon: "dice", category: "rpg" },

      // 4. Rede & Conexões / Network & System
      ...(can("local_folders") && currentFolder ? [{ id: "sync", label: syncStrings().section, icon: "refresh", category: "system" as const }] : []),
      ...(this.offlineHere() ? [{ id: "sync", label: offlineWords().section, icon: "refresh", category: "system" as const }] : []),
      ...(can("local_folders") ? [{ id: "servers", label: serverStrings().section, icon: "globe", category: "system" as const }] : []),
      ...(can("local_folders") ? [{ id: "localserver", label: localStrings().section, icon: "globe", category: "system" as const }] : []),
      ...(can("agents") || can("terminal") ? [{ id: "cli", label: t.sCli, icon: "terminal", category: "system" as const }] : []),
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
  private ctx(): ItemCtx {
    return {
      item: (a, b, c, d) => this.item(a, b, c, d),
      select: (o, v, c) => this.select(o, v, c),
      toggle: (v, c) => this.toggle(v, c),
      paint: () => this.paint(),
      open: (section) => { this.section = section; this.search.value = ""; this.paint(); },
    };
  }
  /** A select that shows `current()` whenever the settings change under it (a theme applied elsewhere may switch the mode). */
  private liveSelect<T extends string>(options: [T, string][], current: () => T, onChange: (v: T) => void): HTMLSelectElement {
    const sel = this.select(options, current(), onChange);
    let seen = false;
    const sync = (): void => {
      if (!sel.isConnected) {
        if (seen) {
          removeEventListener("verso:settings-saved", sync);
          removeEventListener(LOOK_EVENT, sync);
        }
        return;
      }
      seen = true;
      sel.value = current();
    };
    addEventListener("verso:settings-saved", sync);
    addEventListener(LOOK_EVENT, sync);
    return sel;
  }
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
  /** − the number + (the local server's control): 44 px buttons on touch. */
  private stepper(value: number, min: number, max: number, fewer: string, more: string, onChange: (n: number) => void): HTMLElement {
    const input = h("input");
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.step = "1";
    input.inputMode = "numeric";
    input.value = String(value);
    const set = (raw: number) => {
      const n = Math.min(max, Math.max(min, Math.trunc(raw) || min));
      input.value = String(n);
      onChange(n);
    };
    input.addEventListener("change", () => set(Number(input.value)));
    const step = (by: number, label: string): HTMLButtonElement => {
      const b = h("button", "btn ls-step", by < 0 ? "−" : "+");
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.addEventListener("click", () => { const n = Math.min(max, Math.max(min, Math.trunc(Number(input.value) || min) + by)); if (String(n) !== input.value) set(n); });
      return b;
    };
    const box = h("span", "ls-steps settings-steps");
    box.append(step(-1, fewer), input, step(1, more));
    return box;
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
  private items(): SettingItem[] {
    const out: SettingItem[] = [];
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
          const statusMsg = prog.status === "extracting" ? t.extractingUpdate : prog.status === "installing" ? t.installingUpdate : `${t.downloadingUpdate} ${pct.toFixed(0)}% (${mbDownloaded} MB / ${mbTotal} MB)`;
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
    out.push(...featureItems(this.ctx()));
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
    // The table's chime (ADR 0107, 2026-10-23): which sound (off included) and how loud; choosing plays it once.
    add("notify", ns.chime, ns.chimeDesc, () =>
      this.select(CHIMES.map((c) => [c, ns.chimes[c]] as [Chime, string]), readChime(settings.tableChime), (v) => {
        settings.tableChime = v;
        saveSettings();
        previewChime(v, readVolume(settings.tableVolume));
      }),
    );
    add("notify", ns.chimeVolume, ns.chimeVolumeDesc, () => {
      const r = h("input");
      r.type = "range"; r.min = "0"; r.max = "100"; r.step = "5"; r.value = String(readVolume(settings.tableVolume));
      r.setAttribute("aria-valuetext", `${r.value}%`);
      r.addEventListener("input", () => { settings.tableVolume = Number(r.value); r.setAttribute("aria-valuetext", `${r.value}%`); saveSettings(); });
      r.addEventListener("change", () => previewChime(readChime(settings.tableChime), readVolume(settings.tableVolume)));
      return r;
    });
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
    if (currentFolder && may("", "trash")) {
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
    add("files", t.importMax, t.importMaxDesc, () => {
      const i = h("input");
      i.type = "number"; i.min = "1"; i.max = String(IMPORT_CEILING_MB); i.step = "1"; i.value = String(importSetting(settings.importMaxMb));
      i.addEventListener("change", () => { settings.importMaxMb = importSetting(Number(i.value)); i.value = String(settings.importMaxMb); saveSettings(); });
      return i;
    });
    // The way back for a folder taken off the switcher's list (T.10).
    if (can("local_folders")) {
      add("files", sh.showHiddenTitle, sh.showHiddenDesc, () => {
        const n = hiddenFolderKeys().length;
        const b = button("ghost", sh.showHiddenButton(n));
        b.disabled = n === 0;
        b.addEventListener("click", () => {
          showHiddenFolders();
          this.paint();
        });
        return b;
      });
    }
    add("general", t.autosaveDelay, t.autosaveDesc, () => {
      const i = h("input");
      i.type = "number"; i.min = "0.3"; i.step = "0.5"; i.value = String(settings.autosave);
      i.addEventListener("change", () => { settings.autosave = Math.max(0.3, Number(i.value) || 1.5); saveSettings(); });
      return i;
    });
    add("appearance", t.theme, t.themeDesc, () => this.liveSelect([["auto", t.themeAuto], ["light", t.themeLight], ["dark", t.themeDark]], () => settings.theme, (v) => { settings.theme = v; saveSettings(); }), lookWords.gallery.title);
    add("appearance", t.darkTone, t.darkToneDesc, () => this.liveSelect([["soft", t.darkSoft], ["deep", t.darkDeep], ["dusk", t.darkDusk]], () => settings.darkTone ?? "soft", (v) => { settings.darkTone = v; saveSettings(); }), lookWords.gallery.title);
    // The themes (ADR 0100): a gallery of cards; Edit opens the builder in a tab.
    out.push({ section: "appearance", title: lookWords.gallery.title, desc: lookWords.gallery.lead, group: lookWords.gallery.title, node: () => themeGallery({ openBuilder: (spec) => { this.hide(); paneToOpenIn().openTheme(spec); }, openMore: (opener) => openMoreThemes(opener) }) });
    add("appearance", t.fontSize, t.fontSizeDesc, () => {
      // Up to twice the default (15 px): the window has no page zoom, so
      // this is how text reaches 200% (WCAG 1.4.4). Said in pixels.
      const r = h("input");
      r.type = "range"; r.min = "12"; r.max = "30"; r.step = "1"; r.value = String(settings.fontSize);
      r.setAttribute("aria-valuetext", `${r.value} px`);
      r.addEventListener("input", () => { settings.fontSize = Number(r.value); r.setAttribute("aria-valuetext", `${r.value} px`); saveSettings(); });
      // The appearance wizard may change the size (a profile, a theme).
      addEventListener(LOOK_EVENT, () => { if (r.isConnected) { r.value = String(settings.fontSize); r.setAttribute("aria-valuetext", `${r.value} px`); } });
      return r;
    }, lookWords.gallery.textGroup);
    out.push({ section: "appearance", title: fontSampleWords.label, desc: "", group: lookWords.gallery.textGroup, node: () => fontSample() });
    add("appearance", t.measure, t.measureDesc, () => this.liveSelect([["theme", t.measureTheme], ["narrow", t.measureNarrow], ["medium", t.measureMedium], ["standard", t.measureStandard], ["large", t.measureLarge], ["full", t.measureFull]], () => settings.measure, (v) => { settings.measure = v; saveSettings(); }), lookWords.gallery.textGroup);
    // The window's zoom (ADR 0072): only where the host zooms; a browser has its own.
    if (hasHostZoom()) add("appearance", zoomWords.title, zoomWords.desc, () => zoomControl(), lookWords.gallery.textGroup);
    add("appearance", t.bodyFont, t.bodyFontDesc, () => this.select([
      ["sans", t.fontSans],
      ["serif", t.fontEditorial],
      ["mono", t.fontMono],
      ["system", t.fontSystem],
    ], settings.bodyFont || "sans", (v) => { settings.bodyFont = v as any; saveSettings(); }), lookWords.gallery.moreText);
    add("appearance", t.headingColor, t.headingColorDesc, () => this.select([
      ["brass", t.colorBrass],
      ["default", t.colorDefault],
      ["seal", t.colorSeal],
      ["moss", t.colorMoss],
      ["slate", t.colorSlate],
      ["royal", t.colorRoyal],
      ["amethyst", t.colorAmethyst],
    ], settings.headingColor || "brass", (v) => { settings.headingColor = v as any; saveSettings(); }), lookWords.gallery.moreText);
    // The ribbon's buttons, each shown or hidden here as from its menu;
    // the gear stays, so the way back is never hidden with the others.
    for (const b of ribbon?.buttons() ?? []) {
      add("appearance", b.label, b.kept ? t.ribbonButtonsDesc : "", () => {
        if (b.kept) return null;
        const sw = this.toggle(b.shown, (v) => ribbon?.setShown(b.id, v));
        return sw;
      }, t.ribbonButtons);
    }
    // The right panel's tabs, each shown or hidden and in order: the sure
    // way back for one hidden from the bar (ADR 0072, 2026-11-01).
    out.push({ section: "appearance", title: tabWords.group, desc: tabWords.lead, group: tabWords.group, node: () => this.item(tabWords.group, tabWords.lead, panel ? tabsSettings(panel.strip) : null) });
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
    add("board", b.prefDouble, b.prefDoubleDesc, () => this.select([["card", b.prefDoubleCard], ["drawn", b.prefDoubleDrawn]], settings.boardDoubleClick, (v) => { settings.boardDoubleClick = v; saveSettings(); }));
    add("board", b.prefFolder, b.prefFolderDesc, () => this.text(settings.boardFolder, (v) => { settings.boardFolder = v.replace(/^\/+|\/+$/g, ""); saveSettings(); }));
    out.push(...offNotice(this.ctx(), "statblocks", "statblocks"), ...statblockItems(this.ctx()), ...creditsItems(this.ctx()), ...offNotice(this.ctx(), "oracles", "oracles"), ...oracleItems(this.ctx()));
    add("editor", t.previewTabs, t.previewTabsDesc, () => this.toggle(settings.previewTabs, (v) => {
      settings.previewTabs = v;
      saveSettings();
      if (!v) for (const sp of spaces) for (const p of sp.layout.panes()) for (const l of p.leaves) l.keep();
    }));
    // A hide always has a way back (a phone has no double click): the bar
    // is shown or hidden in every pane of every workspace from here.
    add("editor", t.showTabs, t.showTabsDesc, () => this.toggle(!spaces.some((sp) => sp.layout.panes().some((p) => p.tabsHidden)), (v) => {
      for (const sp of spaces) for (const p of sp.layout.panes()) p.setTabsHidden(!v);
    }));
    add("editor", t.defaultMode, t.defaultModeDesc, () => this.select([["preview", t.reading], ["live", t.edit]], settings.defaultMode, (v) => { settings.defaultMode = v; saveSettings(); }));
    add("editor", t.spellcheck, t.spellcheckDesc, () => this.toggle(settings.spellcheck, (v) => { settings.spellcheck = v; saveSettings(); }));
    add("editor", t.blocks.handles, t.blocks.handlesDesc, () => this.toggle(settings.blockHandles, (v) => { settings.blockHandles = v; saveSettings(); }));
    add("editor", pv.setting, pv.settingDesc, () => this.toggle(settings.hoverPreview, (v) => { settings.hoverPreview = v; saveSettings(); }));
    // The suggestion while typing (ADR 0089 item 5): off until the person
    // turns it on; the folders and names it never offers.
    add("editor", ls.setting, ls.settingDesc, () => this.toggle(settings.suggestLinks, (v) => { settings.suggestLinks = v; saveSettings(); this.paint(); }));
    // Dependent on the suggestion: shown only while it is on, and the
    // toggle repaints the list so they appear and go at once.
    if (settings.suggestLinks) {
      add("editor", ls.minLetters, ls.minLettersDesc, () => this.stepper(settings.suggestMinLetters, 1, 10, ls.minLettersFewer, ls.minLettersMore, (n) => { settings.suggestMinLetters = n; saveSettings(); }));
      add("editor", ls.capitalOnly, ls.capitalOnlyDesc, () => this.toggle(settings.suggestCapitalOnly, (v) => { settings.suggestCapitalOnly = v; saveSettings(); }));
    }
    add("editor", ls.mentionAt, ls.mentionAtDesc, () => this.toggle(settings.mentionAt, (v) => { settings.mentionAt = v; saveSettings(); }));
    add("editor", ls.ignoredFolders, ls.ignoredFoldersDesc, () => this.lines(settings.suggestIgnoreFolders, (v) => { settings.suggestIgnoreFolders = v.map((l) => l.replace(/^\/+|\/+$/g, "")).filter(Boolean); saveSettings(); }, LOCALE.startsWith("pt") ? "Arquivo" : "Archive"));
    add("editor", ls.ignoredNames, ls.ignoredNamesDesc, () => this.lines(settings.suggestIgnoreNames, (v) => { settings.suggestIgnoreNames = v; saveSettings(); }, LOCALE.startsWith("pt") ? "Mesa" : "Table"));
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
    // Verso as the app for .md files (ADR 0114 item 5, Q12): the gesture of
    // this system; on Windows a button to its Default apps page.
    if (can("local_folders")) add("files", looseWords.defaultTitle, defaultAppDesc({ mac: !WINDOWS && !LINUX, windows: WINDOWS }), () => {
      if (!WINDOWS) return null;
      const b = h("button", "update-btn-secondary", looseWords.defaultButton);
      b.addEventListener("click", () => void commands.openDefaultApps().then((r) => r.status !== "ok" && fail(r.error)));
      return b;
    });
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
    if (currentFolder && may("", "trash")) out.push({ section: "trash", title: trashStrings().section, desc: trashStrings().lead, node: () => trashBody((a, b, c) => this.item(a, b, c)) });
    if (can("local_folders") && currentFolder) out.push({ section: "sync", title: syncStrings().title, desc: syncStrings().desc, node: () => syncBody((a, b, c) => this.item(a, b, c)) });
    if (this.offlineHere()) out.push({ section: "sync", title: offlineWords().title, desc: offlineWords().desc, node: () => offlineBody((a, b, c) => this.item(a, b, c)) });
    add("cli", t.cliTitle, WINDOWS ? t.cliDescWindows : LINUX ? t.cliDescLinux : t.cliDesc, () => cliControl(this.ctx()));
    // One server per folder, or one for all of Verso (ADR 0054, 2026-10-08).
    add("cli", t.mcpModeTitle, t.mcpModeDesc, () => this.select([["folder", t.mcpModeFolder], ["all", t.mcpModeAll]], settings.mcpMode, (v) => { settings.mcpMode = v; saveSettings(); this.paint(); }));
    add("cli", t.mcpTitle, settings.mcpMode === "all" ? t.mcpDescAll : t.mcpDesc, () => mcpControl());
    if (settings.mcpMode === "all" && currentFolder) add("cli", t.agentVisibleTitle, t.agentVisibleDesc, () => agentVisibleControl(this.ctx()));
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
      add("cli", t.mcpCodeTitle, t.mcpCodeDesc, () => snippet(code("verso", guess), (st) => code(st.command, st.server)));
      add("cli", t.mcpOtherTitle, t.mcpOtherDesc, () => snippet(other("/usr/local/bin/verso", guess), (st) => other(st.command, st.server)));
    }
    // The command line and the agents only where the side has them; the
    // terminal where it has one (ADR 0115 item 6: a server's folder too).
    const kept = can("agents") ? out : out.filter((o) => o.section !== "cli");
    if (can("terminal")) kept.push(...terminalItems(this.ctx(), () => this.hide()));
    return kept;
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
        if (!combo.startsWith("Mod-") && !PLAIN_HOTKEYS.has(combo)) return void (shown.textContent = t.hotkeyNeedsMod.replace("{mod}", prettyKeys("Mod")));
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
    let lastCategory = "";
    for (const sec of this.sections()) {
      if (!q && sec.category !== lastCategory) {
        lastCategory = sec.category;
        navItems.push(h("div", "settings-nav-group-header", ss.groups[sec.category]));
      }
      const b = h("button", "settings-nav-item");
      b.type = "button";
      b.append(icon(sec.icon), h("span", "", sec.label));
      b.setAttribute("aria-current", String(sec.id === this.section && !q));
      b.addEventListener("click", () => { this.section = sec.id; this.phoneList = false; this.search.value = ""; this.paint(); });
      navItems.push(b);
    }
    this.nav.replaceChildren(...navItems);
    this.revealCurrent();
    this.box.classList.toggle("phone-list", this.phoneList && !q);
    this.box.classList.toggle("phone-page", !this.phoneList || !!q);
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
      const hint = this.section === "hotkeys" ? t.hotkeysHint : this.section === "features" ? fs.lead : this.section === "rpgfeatures" ? fs.rpgLead : this.section === "notify" ? notifyStrings().sectionLead : this.section === "credits" ? cs.lead : "";
      const back = h("button", "settings-back");
      back.type = "button";
      back.append(icon("chevronLeft"), h("span", "", t.settings));
      back.addEventListener("click", () => { this.phoneList = true; this.paint(); this.nav.scrollTop = 0; });
      this.body.replaceChildren(back, title, this.notice, ...(hint ? [h("p", "settings-hint", hint)] : []), frag);
    } else this.body.replaceChildren(this.notice, frag);
  }
}
