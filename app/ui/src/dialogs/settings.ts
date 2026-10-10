// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { can } from "../can";
import { serverStrings, serversBody } from "./servers";
import { type CliState, commands, type McpStatus } from "../bindings";
import { remoteContentChanged } from "../changes";
import { ask } from "../dialog";
import { button, h, ui } from "../dom";
import { focusesSummary, getLocalFocuses, getSyncFocuses, isSyncFocusesAsked, loadFocuses, setFocusesSummary, setLocalFocuses, setSyncFocuses, setSyncFocusesAsked } from "../focuses";
import { currentFolder } from "../folder";
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
import { getHiddenFromTree, pushEmbedOrigins, pushMenuLanguage, saveSettings, setHiddenFromTree, settings } from "../settings";
import { boardText, t } from "../strings";
import { listAll } from "../tree/tree";
import { asDialog, closed, opened } from "./a11y";
import { accountEntries } from "../web/account";
import { signedIn } from "../web/api";

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
    this.el.append(this.box);
    document.body.append(this.el);
    this.el.addEventListener("mousedown", (e) => { if (e.target === this.el) this.hide(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !this.el.hidden && !hotkeyRecorder) this.hide(); });
  }
  show(section?: string): void {
    if (section) this.section = section;
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
  private sections(): { id: string; label: string; icon: string }[] {
    return [
      { id: "general", label: t.sGeneral, icon: "gear" },
      { id: "appearance", label: t.sAppearance, icon: "palette" },
      { id: "editor", label: t.sEditor, icon: "edit" },
      { id: "organizing", label: t.sOrganizing, icon: "folder" },
      { id: "files", label: t.sFiles, icon: "folder" },
      { id: "board", label: boardText.sBoard, icon: "board" },
      { id: "hotkeys", label: t.sHotkeys, icon: "keyboard" },
      // What the side the window talks to cannot do is absent (ADR 0076
      // item 11): the command line and the agents are the desktop app's,
      // and so is opening a server's folder from it (ADR 0073 item 2).
      ...(can("agents") ? [{ id: "cli", label: t.sCli, icon: "terminal" }] : []),
      ...(can("local_folders") ? [{ id: "servers", label: serverStrings().section, icon: "globe" }] : []),
      // On a server: the person's account (ADR 0074 items 7 and 9); the
      // server's administration is a console of its own (ADR 0077).
      ...(can("account") && signedIn() ? [{ id: "account", label: t.sAccount, icon: "user" }] : []),
    ];
  }
  private item(title: string, desc: string, control: HTMLElement | null): HTMLElement {
    const row = h("div", "setting");
    const text = h("div", "setting-text");
    const id = `setting-${++this.ids}`;
    const titleEl = h("div", "setting-title", title);
    titleEl.id = `${id}-title`;
    const descEl = h("div", "setting-desc", desc);
    descEl.id = `${id}-desc`;
    text.append(titleEl, descEl);
    row.append(text);
    if (control) {
      // The control is named by the item's title and described by its line
      // (a hotkey row names its own buttons).
      const field = control.matches("input, select") ? control : control.querySelector<HTMLElement>("input, select");
      // A control that names itself (one of several in the row) keeps it.
      if (title && !field?.hasAttribute("aria-label")) field?.setAttribute("aria-labelledby", titleEl.id);
      if (field && desc) field.setAttribute("aria-describedby", descEl.id);
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
  /** Every item of every section, for the search; the section otherwise. */
  private items(): { section: string; title: string; desc: string; node: () => HTMLElement; group?: string }[] {
    const out: { section: string; title: string; desc: string; node: () => HTMLElement; group?: string }[] = [];
    const add = (section: string, title: string, desc: string, control: () => HTMLElement | null, group?: string) =>
      out.push({ section, title, desc, node: () => this.item(title, desc, control()), group });
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

      topRow.append(v, checkBtn);
      wrap.append(topRow);

      const card = h("div", "update-card");
      card.style.display = "none";
      wrap.append(card);

      let showNotes = false;

      const renderCard = () => {
        card.textContent = "";
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

          if (showNotes && info.release_notes) {
            const notesBox = h("div", "update-notes-box");
            notesBox.textContent = info.release_notes;
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
      return box;
    });
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
    add("files", t.ignoreBuildDirs, t.ignoreBuildDirsDesc, () => this.toggle(settings.ignoreBuildDirs, (v) => { settings.ignoreBuildDirs = v; saveSettings(); void walkRulesChanged(); }));
    add("files", t.respectGitignore, t.respectGitignoreDesc, () => this.toggle(settings.respectGitignore, (v) => { settings.respectGitignore = v; saveSettings(); void walkRulesChanged(); }));
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
    add("organizing", t.folderNoteName, t.folderNoteNameDesc, () => this.text(settings.folderNoteName, (v) => { settings.folderNoteName = v.trim(); saveSettings(); void pushFolderNoteName().then(() => listAll()); }));
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
            await commands.setSyncFocuses(false);
            this.paint();
            return;
          }
        }
        setSyncFocuses(true);
        await commands.setSyncFocuses(true);
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
        await commands.setSyncFocuses(false);
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
    add("editor", t.previewTabs, t.previewTabsDesc, () => this.toggle(settings.previewTabs, (v) => {
      settings.previewTabs = v;
      saveSettings();
      if (!v) for (const sp of spaces) for (const p of sp.layout.panes()) for (const l of p.leaves) l.keep();
    }));
    add("editor", t.defaultMode, t.defaultModeDesc, () => this.select([["preview", t.reading], ["live", t.edit]], settings.defaultMode, (v) => { settings.defaultMode = v; saveSettings(); }));
    add("editor", t.spellcheck, t.spellcheckDesc, () => this.toggle(settings.spellcheck, (v) => { settings.spellcheck = v; saveSettings(); }));
    // Sub-division for Line Numbers, in the exact order of the mode buttons on screen:
    // 1. Reading mode (Leitura)
    // 2. Edit mode (Editar)
    // 3. Source mode (Fonte)
    add("editor", t.lineNumbersPreview, t.lineNumbersPreviewDesc, () => this.toggle(settings.lineNumbersPreview, (v) => { settings.lineNumbersPreview = v; saveSettings(); }), t.lineNumbers);
    add("editor", t.lineNumbersEdit, t.lineNumbersEditDesc, () => this.toggle(settings.lineNumbersEdit, (v) => { settings.lineNumbersEdit = v; saveSettings(); }), t.lineNumbers);
    add("editor", t.blocks.handles, t.blocks.handlesDesc, () => this.toggle(settings.blockHandles, (v) => { settings.blockHandles = v; saveSettings(); }));
    add("editor", t.blocks.enterNewBlock, t.blocks.enterNewBlockDesc, () => this.toggle(settings.enterNewBlock, (v) => { settings.enterNewBlock = v; saveSettings(); }));
    add("editor", t.lineNumbersSource, t.lineNumbersSourceDesc, () => this.toggle(settings.lineNumbersSource, (v) => { settings.lineNumbersSource = v; saveSettings(); }), t.lineNumbers);
    add("files", t.linkFormat, t.linkFormatDesc, () => this.select([["shortest", t.linkShortest], ["relative", t.linkRelative], ["root", t.linkRoot]], settings.linkFormat, (v) => { settings.linkFormat = v; saveSettings(); }));
    add("files", t.attachments, t.attachmentsDesc, () => this.text(settings.attachments, (v) => { settings.attachments = v; saveSettings(); }));
    add("files", t.dailyFolder, t.dailyDesc, () => this.text(settings.daily, (v) => { settings.daily = v; saveSettings(); }));
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
  paint(): void {
    const q = this.search.value.trim().toLowerCase();
    this.nav.replaceChildren(...this.sections().map((sec) => {
      const b = h("button", "settings-nav-item");
      b.type = "button";
      b.append(icon(sec.icon), h("span", "", sec.label));
      b.setAttribute("aria-current", String(sec.id === this.section && !q));
      b.addEventListener("click", () => { this.section = sec.id; this.search.value = ""; this.paint(); });
      return b;
    }));
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
      this.body.replaceChildren(title, this.notice, ...(this.section === "hotkeys" ? [h("p", "settings-hint", t.hotkeysHint)] : []), frag);
    } else this.body.replaceChildren(this.notice, frag);
  }
}
