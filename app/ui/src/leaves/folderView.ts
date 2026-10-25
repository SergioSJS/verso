// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { convertFileSrc } from "@tauri-apps/api/core";
import { baseHost, liveBases } from "../bases";
import { BaseView } from "../bases/view";
import { commands, type Property } from "../bindings";
import { can } from "../can";
import { afterFileChange } from "../changes";
import { promptText } from "../dialog";
import { button, h, ui } from "../dom";
import { fail } from "../errors";
import { deleteEntry, textBase64 } from "../files";
import { allEntries, allFiles, allNotes, folderName, iconOfPath } from "../folder";
import { humanDate, humanSize, kindLabel } from "../format";
import { icon } from "../icons";
import { noteImages } from "../images";
import { renderSticker, resolveColor, showStickerPicker } from "../labels";
import { armDrag } from "../layout/drag";
import { Pane } from "../layout/pane";
import { tableViewer } from "../access";
import { tableCard } from "../tableCard";
import { campaign } from "../campaign";
import { mayShare } from "../shares";
import { crumbsFor, crumbsNav, layout, liveHolder, openFolder, openNote, persistSoon } from "../layout/spaces";
import { roomSide } from "../collab";
import { writeLive } from "../roomWrites";
import { createMenuItems, entryMenu, showMenu, type MenuItem } from "../menu";
import { opening } from "../opening";
import { bannerFraction, bannerPercent, pickerStrings } from "../organize/cover";
import { folderNoteCandidates, folderNoteOf } from "../organize/folderNotes";
import { updateEntryProperties } from "../organize/frontmatter";
import { isItemPinned, orderIndex, pinBadge } from "../organize/order";
import { dirOf, Kind, kindOf, name } from "../paths";
import { typeset, wireCallouts } from "../render";
import { heldImage, setHtml } from "../sanitize";
import { settings } from "../settings";
import { baseStrings, LOCALE, t } from "../strings";
import { renameInline } from "../tree/prompts";
import { allFolders, markCurrent } from "../tree/tree";
import { Leaf } from "./leaf";
import { NoteLeaf } from "./note";
import { pdfCover } from "../pdf";

export type SortKey = "name" | "kind" | "size" | "modified";
export let folderSort: { key: SortKey; desc: boolean } = { key: "name", desc: false };
export function setFolderSort(value: { key: SortKey; desc: boolean }): void {
  folderSort = value;
}

export function propVal(properties: Property[], key: string): string | null {
  const p = properties.find((x) => x.key.toLowerCase() === key.toLowerCase());
  if (!p) return null;
  if (p.value.kind === "text" || p.value.kind === "number") return p.value.value;
  if (p.value.kind === "list" && p.value.value.length > 0) return p.value.value[0] ?? null;
  return null;
}

export type FolderRow = { path: string; kind: Kind; label: string; size: number; modified: number };
/** PDF covers drawn this session, by path and modification time. */
const covers = new Map<string, Promise<string | null>>();
/** One cover drawn at a time: a folder of many PDFs does not draw them
 *  all at once. */
let coverQueue: Promise<unknown> = Promise.resolve();
const coverSeen = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    coverSeen.unobserve(e.target);
    (e.target as HTMLElement & { drawCover?: () => void }).drawCover?.();
  }
});
function coverWhenSeen(thumb: HTMLElement, r: FolderRow): void {
  (thumb as HTMLElement & { drawCover?: () => void }).drawCover = () => {
    const key = `${r.path}\u0000${r.modified}`;
    let made = covers.get(key);
    if (!made) {
      const run = coverQueue.then(() => pdfCover(`${convertFileSrc(r.path, "verso")}?thumb`, 160));
      coverQueue = run.catch(() => null);
      made = run;
      covers.set(key, made);
    }
    void made.then((src) => {
      if (!src || !thumb.isConnected) return;
      const img = h("img", "pdf-cover");
      img.src = src;
      img.alt = "";
      thumb.replaceChildren(img);
    });
  };
  coverSeen.observe(thumb);
}

export class FolderLeaf extends Leaf {
  /** Ends a cover reposition under way, keeping the old position. */
  private cancelReposition?: () => void;
  readonly kind: Kind = "folder";
  readonly head = h("header", "folder-head");
  readonly crumbs = crumbsNav();
  readonly title = h("h1", "note-title");
  readonly meta = h("p", "folder-meta");
  /** The table card (tableCard.ts): the folder as a table, or the way to make it one. */
  readonly tableBox = h("div", "folder-table");
  readonly cols = h("div", "folder-cols");
  readonly items = h("ul", "folder-items list");
  readonly note = h("article", "folder-note");
  readonly coverBox = h("div", "note-cover-box");
  readonly addCoverBtn = h("button", "note-add-cover-btn");
  readonly stickerBtn = h("button", "note-sticker-btn");
  readonly baseContainer = h("div", "folder-base-container");
  private baseView: BaseView | null = null;
  private bannerY = 0.5;
  private bannerUrl = "";
  viewMode: "table" | "list" | "grid" = settings.folderPageTable ? "table" : "list";
  grid = false;
  rows: FolderRow[] = [];
  constructor(pane: Pane) {
    super(pane);
    this.addCoverBtn.type = "button";
    this.addCoverBtn.textContent = t.addCover;
    this.addCoverBtn.hidden = true;
    this.addCoverBtn.addEventListener("click", () => void this.promptCover());
    this.coverBox.hidden = true;

    this.stickerBtn.type = "button";
    this.stickerBtn.hidden = true;
    this.stickerBtn.addEventListener("click", () => void this.promptSticker());

    const asTable = button("ghost iconic", baseStrings.table, "table");
    const asGrid = button("ghost iconic", t.asGrid, "grid");
    const asList = button("ghost iconic", t.asList, "list");
    asTable.addEventListener("click", () => this.setViewMode("table"));
    asGrid.addEventListener("click", () => this.setViewMode("grid"));
    asList.addEventListener("click", () => this.setViewMode("list"));
    const tools = h("div", "folder-tools");
    tools.append(asTable, asGrid, asList);
    this.head.append(this.stickerBtn, this.title, tools);
    const top = h("header", "leaf-head");
    top.append(this.crumbs);
    const sheet = h("div", "sheet");
    sheet.append(this.coverBox, this.addCoverBtn, this.head, this.meta, this.tableBox, this.note, this.baseContainer, this.cols, this.items);
    this.el.append(top, sheet);
    this.cols.hidden = false;
    const col = (key: SortKey, label: string, cls: string) => {
      const b = h("button", `col ${cls}`, label);
      b.type = "button";
      b.title = `${t.sortBy}: ${label}`;
      b.dataset["key"] = key;
      b.dataset["label"] = label;
      b.addEventListener("click", () => {
        folderSort = { key, desc: folderSort.key === key ? !folderSort.desc : key === "modified" || key === "size" };
        try { localStorage.setItem("verso.folderSort", JSON.stringify(folderSort)); } catch { /* no storage */ }
        for (const p of layout().panes()) for (const l of p.leaves) if (l instanceof FolderLeaf) l.render();
      });
      return b;
    };
    this.cols.append(col("name", t.colName, "col-name"), col("kind", t.colKind, "col-kind"), col("size", t.colSize, "col-size"), col("modified", t.colModified, "col-modified"));
    addEventListener("verso:campaign-status", () => {
      if (this.el.isConnected) this.paintTable();
    });
    // The seat the server tells comes after the table is made: the card is drawn for it.
    addEventListener("verso:can-changed", () => {
      if (this.el.isConnected) this.paintTable();
    });
    this.el.addEventListener("contextmenu", (e) => {
      if ((e.target as HTMLElement).closest(".item")) return;
      e.preventDefault();
      // The tree's own "new" items (ADR 0048): one menu wherever the
      // folder is shown, with its icons.
      const path = this.path;
      showMenu(e.clientX, e.clientY, [
        ...createMenuItems(path),
        ...(path
          ? [
              ["—", () => {}] as MenuItem,
              // What the side cannot do is absent (ADR 0076 item 11).
              ...(can("reveal") ? [[t.reveal, () => void commands.reveal(path), "search"] as MenuItem] : []),
              [t.copyRelativePath, () => void navigator.clipboard.writeText(path).then(() => (ui.status.textContent = t.copied)), "link"] as MenuItem,
              ...(can("copy_path") ? [[t.copyFullPath, () => void commands.copyFullPath(path).then((r) => (r.status === "ok" ? (ui.status.textContent = t.copied) : fail(r.error))), "copy"] as MenuItem] : []),
            ]
          : []),
      ]);
    });
  }
  private tableFor = "\u0000";
  /** The card of the table under the title; drawn again when the tables change. */
  private paintTable(): void {
    const key = `${this.path}|${campaign().viewer}|${tableViewer()}|${mayShare()}|${campaign().tables.map((t) => t.root).join(",")}`;
    if (key === this.tableFor) return;
    this.tableFor = key;
    const card = tableCard(this.path);
    this.tableBox.replaceChildren(...(card ? [card] : []));
    this.tableBox.hidden = !card;
  }
  setViewMode(mode: "table" | "grid" | "list"): void {
    this.viewMode = mode;
    this.baseContainer.hidden = mode !== "table";
    this.cols.hidden = mode === "grid" || mode === "table";
    this.items.hidden = mode === "table";
    // A folder opened as a table never drew its items: they are drawn
    // now, as Thumbnails or List shows them.
    if (mode === "grid") {
      this.view(true);
      this.render();
    } else if (mode === "list") {
      this.view(false);
      this.render();
    } else if (mode === "table") void this.mountFolderBase();
    persistSoon();
  }
  private async mountFolderBase(): Promise<void> {
    const folderStem = this.path.split("/").pop() ?? this.path;
    const basePath = this.path ? `${this.path}/${folderStem}.base` : "index.base";
    const folderNote = folderNoteOf(this.path);
    const baseFilter = this.path ? `file.inFolder("${this.path}")` : "";
    let defaultYaml = `filters:\n${baseFilter ? `  and:\n    - ${baseFilter}\n` : ""}views:\n  - type: table\n    name: "${baseStrings.table}"\n`;
    let currentYaml = defaultYaml;
    let baseRevision: string | null = null;
    let baseExists = false;

    const rd = await opening.readText(basePath);
    if (rd.status === "ok") {
      baseExists = true;
      currentYaml = rd.data.text;
      baseRevision = rd.data.revision;
    }

    if (this.baseView) {
      liveBases.delete(this.baseView);
      this.baseView.destroy();
    }
    this.baseView = new BaseView(baseHost(), {
      path: baseExists ? basePath : null,
      thisPath: folderNote ?? this.path,
      folder: this.path,
      text: () => currentYaml,
      edit: async (next: string) => {
        const was = currentYaml;
        currentYaml = next;
        if (!baseExists) {
          const created = await commands.createFile(basePath, textBase64(next));
          if (created.status === "ok") {
            baseExists = true;
            await afterFileChange();
            const fresh = await opening.readText(basePath);
            if (fresh.status === "ok") {
              baseRevision = fresh.data.revision;
            }
          } else {
            fail(created.error);
          }
        } else {
          // The base live in its room — a tab, or someone else — takes the
          // change there (ADR 0082 item 12); one whose text moved on since
          // this page read it is read again.
          const read = was.replace(/\r\n/g, "\n");
          const through = await writeLive(basePath, liveHolder(basePath), (now) => (now === read ? next : null), roomSide);
          if (through === "room" || through === "same") return;
          if (through === "refused") {
            const fresh = await opening.readText(basePath);
            if (fresh.status === "ok") {
              currentYaml = fresh.data.text;
              baseRevision = fresh.data.revision;
            }
            fail({ kind: "changed", message: t.conflictPendingBoth });
            return;
          }
          const written = await commands.writeText(basePath, next, baseRevision ?? "");
          if (written.status === "ok") {
            baseRevision = written.data.revision;
            await afterFileChange();
          } else {
            fail(written.error);
          }
        }
      },
      viewName: null,
      key: `folder:${this.path}`,
    });
    liveBases.add(this.baseView);
    this.baseContainer.replaceChildren(this.baseView.el);
    await this.baseView.refresh();
  }

  private async promptCover(): Promise<void> {
    const url = await promptText(t.coverUrlPrompt ?? "URL:", this.bannerUrl || "", false, { yes: t.save ?? "OK", no: t.cancel ?? "Cancel" });
    if (url !== null) {
      void updateEntryProperties(this.path, "folder", { banner: url.trim() || null }).then(async () => {
        await afterFileChange();
        await this.load(this.path);
      });
    }
  }
  private promptSticker(): void {
    const fn = folderNoteOf(this.path);
    const entry = fn ? allEntries.get(fn) : allEntries.get(this.path);
    showStickerPicker({
      anchorEl: this.stickerBtn,
      currentSticker: entry?.label?.sticker ?? null,
      currentColor: entry?.label?.color ?? null,
      strings: pickerStrings(),
      lang: LOCALE.startsWith("pt") ? "pt" : "en",
      onSelectSticker: (stk: string) => {
        void updateEntryProperties(this.path, "folder", { sticker: stk }).then(async () => {
          await afterFileChange();
          await this.load(this.path);
        });
      },
      onSelectColor: (col: string) => {
        void updateEntryProperties(this.path, "folder", { color: col }).then(async () => {
          await afterFileChange();
          await this.load(this.path);
        });
      },
      onRemoveSticker: () => {
        void updateEntryProperties(this.path, "folder", { sticker: null }).then(async () => {
          await afterFileChange();
          await this.load(this.path);
        });
      },
      onRemoveColor: () => {
        void updateEntryProperties(this.path, "folder", { color: null }).then(async () => {
          await afterFileChange();
          await this.load(this.path);
        });
      },
    });
  }
  private paintCover(banner: string | null, bannerYStr: string | null, folderNote: string | null): void {
    this.bannerY = bannerFraction(bannerYStr);
    this.bannerUrl = banner ?? "";
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
          void updateEntryProperties(this.path, "folder", { banner: null, banner_y: null }).then(async () => {
            await afterFileChange();
            await this.load(this.path);
          });
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
              void updateEntryProperties(this.path, "folder", { banner_y: bannerPercent(currentY) });
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
        this.coverBox.replaceChildren();
        this.addCoverBtn.hidden = !folderNote;
      }
    } else {
      this.coverBox.hidden = true;
      this.addCoverBtn.hidden = true;
    }
  }
  view(grid: boolean): void {
    this.grid = grid;
    this.items.classList.toggle("grid", grid);
    this.items.classList.toggle("list", !grid);
    this.cols.hidden = grid;
    persistSoon();
  }
  async load(path: string): Promise<void> {
    this.cancelReposition?.();
    this.path = path;
    this.setTitle(path === "" ? folderName || "/" : name(path));
    this.title.textContent = this.tabName.textContent;
    this.crumbs.replaceChildren(...crumbsFor(path, true));
    const prefix = path === "" ? "" : `${path}/`;
    const under = (folder: string) => {
      const fp = `${folder}/`;
      let size = 0;
      let modified = 0;
      for (const e of allEntries.values()) if (e.path.startsWith(fp) && e.kind !== "folder") {
        size += e.size ?? 0;
        modified = Math.max(modified, e.modified ?? 0);
      }
      return { size, modified };
    };
    const folders = allFolders.filter((f) => dirOf(f) === path && f !== "");
    const folderNote = folderNoteOf(path);
    let banner: string | null = null;
    let bannerYStr: string | null = null;
    let sticker: string | null = null;
    let color: string | null = null;
    if (folderNote) {
      const ent = allEntries.get(folderNote);
      sticker = ent?.label?.sticker ?? null;
      color = ent?.label?.color ?? null;
      try {
        const rd = await opening.readNote(folderNote);
        if (rd.status === "ok") {
          banner = propVal(rd.data.properties, "banner");
          bannerYStr = propVal(rd.data.properties, "banner_y");
          if (!sticker) sticker = propVal(rd.data.properties, "sticker");
          if (!color) color = propVal(rd.data.properties, "color");
        }
      } catch {}
    }
    this.paintCover(banner, bannerYStr, folderNote);
    if (settings.stickers && (sticker || folderNote)) {
      const stickerNode = sticker ? renderSticker(sticker, 20) : icon("sparkles");
      this.stickerBtn.replaceChildren(stickerNode ?? icon("sparkles"));
      this.stickerBtn.hidden = false;
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
    void this.paintNote(folderNote, path);
    const direct = [...allNotes, ...allFiles].filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/") && p !== folderNote);
    this.rows = [
      ...folders.map((f): FolderRow => ({ path: f, kind: "folder", label: f.split("/").pop() ?? f, ...under(f) })),
      ...direct.map((p): FolderRow => {
        const e = allEntries.get(p);
        return { path: p, kind: kindOf(p), label: name(p), size: e?.size ?? 0, modified: e?.modified ?? 0 };
      }),
    ];
    const notes = direct.filter((p) => kindOf(p) === "note").length;
    this.meta.textContent = t.counts(notes, direct.length - notes, folders.length);
    this.paintTable();
    this.viewMode = settings.folderPageTable ? "table" : (this.grid ? "grid" : "list");
    if (this.viewMode === "table") {
      this.baseContainer.hidden = false;
      this.cols.hidden = true;
      this.items.hidden = true;
      void this.mountFolderBase();
    } else {
      this.baseContainer.hidden = true;
      this.cols.hidden = this.viewMode === "grid";
      this.items.hidden = false;
      this.render();
    }
    markCurrent();
    persistSoon();
  }
  override destroy(): void {
    this.cancelReposition?.();
    if (this.baseView) {
      liveBases.delete(this.baseView);
      this.baseView.destroy();
      this.baseView = null;
    }
    super.destroy();
  }
  /** The folder's own note — `Folder/Folder.md` or `Folder.md` beside it —
   *  rendered at the top, with a way to edit it; or the offer to make one. */
  private async paintNote(notePath: string | null, folder: string): Promise<void> {
    if (!notePath) {
      this.note.replaceChildren();
      if (folder !== "") {
        const make = button("ghost", t.createFolderNote, "plus");
        make.addEventListener("click", () => void (async () => {
          const label = folder.split("/").pop() ?? folder;
          const path = (folderNoteCandidates(folder)[0] ?? `${folder}/${label}.md`).replace(/\.md$/i, "");
          const r = await commands.createNote(path, `# ${label}\n\n`);
          if (r.status !== "ok") return fail(r.error);
          await afterFileChange();
          openNote(r.data.path, false);
        })());
        this.note.append(make);
      }
      return;
    }
    const r = await opening.readNote(notePath);
    if (r.status !== "ok" || this.path !== folder) return;
    const body = h("div", "folder-note-body");
    setHtml(body, r.data.html);
    wireCallouts(body);
    typeset(body);
    void noteImages(body, notePath);
    const edit = button("ghost iconic embed-edit", t.edit, "edit");
    edit.addEventListener("click", () => openNote(notePath, false));
    body.addEventListener("dblclick", () => {
      const leaf = openNote(notePath, false);
      if (leaf instanceof NoteLeaf) void leaf.loading.then(() => leaf.setMode("live"));
    });
    const head = h("div", "folder-note-head");
    head.append(h("span", "folder-note-label", t.folderNote), edit);
    this.note.replaceChildren(head, body);
  }
  render(): void {
    const { key, desc } = folderSort;
    const dir = desc ? -1 : 1;
    const fn = folderNoteOf(this.path);
    const fnEntry = fn ? allEntries.get(fn) : null;
    const pinned = fnEntry?.label?.pinned ?? [];
    const order = fnEntry?.label?.order ?? [];

    const cmp = (a: FolderRow, b: FolderRow): number => {
      const aPinned = isItemPinned(a.path, this.path, pinned);
      const bPinned = isItemPinned(b.path, this.path, pinned);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      if ((a.kind === "folder") !== (b.kind === "folder")) return a.kind === "folder" ? -1 : 1;
      let d = 0;
      if (key === "size") d = a.size - b.size;
      else if (key === "modified") d = a.modified - b.modified;
      else if (key === "kind") d = kindLabel(a.path, a.kind).localeCompare(kindLabel(b.path, b.kind), LOCALE);
      else if (key === "name" && settings.manualOrder && order.length > 0) {
        const prefix = this.path ? `${this.path}/` : "";
        const aRel = this.path ? (a.path.startsWith(prefix) ? a.path.slice(prefix.length) : a.path) : a.path;
        const bRel = this.path ? (b.path.startsWith(prefix) ? b.path.slice(prefix.length) : b.path) : b.path;
        const aIdx = orderIndex(order, aRel);
        const bIdx = orderIndex(order, bRel);
        if (aIdx >= 0 && bIdx >= 0) return (aIdx - bIdx) * dir;
        if (aIdx >= 0) return -1 * dir;
        if (bIdx >= 0) return 1 * dir;
      }
      return (d || a.label.localeCompare(b.label, LOCALE, { numeric: true })) * (key === "name" || d === 0 ? dir : dir);
    };
    // The sort the arrow shows is said in the column's name: `aria-sort`
    // belongs to a table's header, and this list is not a table.
    for (const b of this.cols.querySelectorAll<HTMLButtonElement>("button")) {
      const mine = b.dataset["key"] === key;
      const label = `${t.sortBy}: ${b.dataset["label"] ?? ""}`;
      if (mine) b.dataset["sort"] = desc ? "descending" : "ascending";
      else delete b.dataset["sort"];
      b.setAttribute("aria-label", mine ? `${label}, ${desc ? t.sortDesc : t.sortAsc}` : label);
    }
    // Drawn anew, the list gives the keyboard its row back: the same
    // entry, or the one now in its place.
    const a = document.activeElement;
    const all = () => Array.from(this.items.querySelectorAll<HTMLButtonElement>("button.item"));
    const had = a instanceof HTMLButtonElement && this.items.contains(a) ? { path: a.dataset["path"] ?? "", index: all().indexOf(a) } : null;
    this.items.replaceChildren(...this.rows.slice().sort(cmp).map((r) => this.item(r)));
    if (had) {
      const now = all();
      (now.find((b) => b.dataset["path"] === had.path) ?? now[Math.min(Math.max(had.index, 0), now.length - 1)])?.focus();
    }
  }
  private item(r: FolderRow): HTMLLIElement {
    const li = h("li");
    const b = h("button", `item kind-${r.kind}`);
    b.type = "button";
    const thumb = h("span", "thumb");
    if (r.kind === "image") {
      const img = h("img");
      // A thumbnail never brings a picture down from the cloud (`?thumb`):
      // one that is only there shows the kind's mark instead.
      img.src = `${convertFileSrc(r.path, "verso")}?thumb`;
      img.loading = "lazy";
      img.addEventListener("error", () => img.replaceWith(iconOfPath(r.path, r.kind)), { once: true });
      img.alt = "";
      thumb.append(img);
    } else if (r.kind === "pdf") {
      // The first page, drawn once the row is on screen; the kind's mark
      // until then, and for a file that cannot be read.
      thumb.append(iconOfPath(r.path, r.kind));
      coverWhenSeen(thumb, r);
    } else thumb.append(iconOfPath(r.path, r.kind));
    const main = h("span", "main");
    main.append(thumb, h("span", "label", r.label));
    const fn = folderNoteOf(this.path);
    const fnEntry = fn ? allEntries.get(fn) : null;
    const pinned = fnEntry?.label?.pinned ?? [];
    if (isItemPinned(r.path, this.path, pinned)) {
      b.classList.add("pinned");
      main.append(pinBadge());
    }
    b.append(main, h("span", "col col-kind", kindLabel(r.path, r.kind)), h("span", "col col-size", r.kind === "folder" && r.size === 0 ? "—" : humanSize(r.size)), h("span", "col col-modified", humanDate(r.modified)));
    b.title = r.path;
    b.dataset["path"] = r.path;
    const open = (pane: boolean, preview: boolean) => (r.kind === "folder" ? openFolder(r.path, preview) : openNote(r.path, pane, false, preview));
    b.addEventListener("click", (e) => open(e.metaKey || e.ctrlKey, true));
    b.addEventListener("dblclick", (e) => void (e.metaKey || e.ctrlKey || open(false, false)));
    b.addEventListener("mousedown", () => b.focus());
    if (r.kind === "folder") b.dataset["folder"] = r.path;
    armDrag(b, () => ({ kind: "file", path: r.path }), () => r.label);
    b.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      entryMenu(e.clientX, e.clientY, r.path, r.kind, () => renameInline(li, r.path, r.kind === "folder"));
    });
    b.addEventListener("keydown", (e) => {
      if (e.key === "F2") {
        e.preventDefault();
        renameInline(li, r.path, r.kind === "folder");
      } else if (e.key === "Delete" || (e.key === "Backspace" && e.metaKey)) {
        e.preventDefault();
        void deleteEntry(r.path, r.kind);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const all = Array.from(this.items.querySelectorAll<HTMLButtonElement>("button.item"));
        const i = all.indexOf(b) + (e.key === "ArrowDown" ? 1 : -1);
        all[Math.max(0, Math.min(all.length - 1, i))]?.focus();
      } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        e.preventDefault();
        const rect = b.getBoundingClientRect();
        b.dispatchEvent(new MouseEvent("contextmenu", { clientX: rect.left + 24, clientY: rect.bottom, bubbles: true, cancelable: true }));
      }
    });
    li.append(b);
    return li;
  }
}
