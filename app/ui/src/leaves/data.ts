// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { hasCapability } from "../capabilities";
import { h, ui } from "../dom";
import { icon } from "../icons";
import { currentFolder } from "../folder";
import { Pane } from "../layout/pane";
import { crumbsFor, crumbsNav, persistSoon } from "../layout/spaces";
import { opening } from "../opening";
import { Kind, name } from "../paths";
import { linkDiagram, liveText, revealInText } from "../datagraph/link";
import { formatOfPath, type Format, typeKey } from "../datagraph/model";
import { saveAsBoard } from "../datagraph/saveBoard";
import { boardOf } from "../datagraph/saveBoardDoc";
import { readFile, setLastView, writeFile } from "../datagraph/store";
import { titleOf } from "../datagraph/boxes";
import { DataDiagram, type DiagramHost, type Range } from "../datagraph/view";
import { dgw } from "../datagraph/words";
import { markCurrent } from "../tree/tree";
import { Leaf } from "./leaf";
import { TextLeaf } from "./textfile";

/** Whether a file can be offered as a diagram: its type, and the feature's switch. */
export function diagramFormat(path: string): Format | null {
  return hasCapability("dataDiagram") ? formatOfPath(path) : null;
}

/** "Text | Diagram", on both tabs of a data file (as an HTML page has its page and source): choosing the other swaps the tab, and the choice is remembered for the type of file on this device. */
export function dataModes(leaf: Leaf, on: "text" | "diagram"): HTMLElement {
  const modes = h("div", "modes data-modes");
  modes.setAttribute("role", "group");
  modes.setAttribute("aria-label", dgw.viewAs);
  const mode = (face: "text" | "diagram", ic: string, label: string): HTMLButtonElement => {
    const b = h("button");
    b.type = "button";
    b.append(icon(ic), h("span", "", label));
    b.setAttribute("aria-pressed", String(face === on));
    b.dataset["mode"] = face;
    b.addEventListener("click", () => {
      if (face === on) return;
      const type = typeKey(leaf.path);
      if (type) setLastView(type, face);
      void leaf.pane.swap(leaf, face === "diagram" ? new DataLeaf(leaf.pane) : new TextLeaf(leaf.pane));
    });
    return b;
  };
  modes.append(mode("text", "source", dgw.text), mode("diagram", "diagram", dgw.diagram));
  return modes;
}

/** A block of code in a note: its text, the format its language names, and the note it is in. */
export type BlockSource = { text: string; format: Format; note: string };

/* A structured-data file (or a block of code in a note) drawn as boxes and
 * lines (ADR 0106). It reads the text and never writes it: the data is
 * edited in the text tab, which this one follows when both are open. */
export class DataLeaf extends Leaf {
  readonly kind: Kind = "data";
  readonly crumbs = crumbsNav();
  readonly modes: HTMLElement;
  readonly diagram: DataDiagram;
  private format: Format = "json";
  private revision = "";
  private off: (() => void) | null = null;
  private keepTimer = 0;
  private typedTimer = 0;
  private restored = false;

  constructor(
    pane: Pane,
    readonly block: BlockSource | null = null,
  ) {
    super(pane);
    const leaf = this;
    const host: DiagramHost = {
      get name() {
        return leaf.block ? leaf.block.note : name(leaf.path);
      },
      canText: block === null,
      select: (r) => void revealInText(leaf.path, r, false),
      toText: (r) => leaf.toText(r),
      changed: () => leaf.keepSoon(),
      say: (m) => void (ui.status.textContent = m),
      copy: (text) => void navigator.clipboard?.writeText(text).catch(() => undefined),
      saveBoard: () => leaf.saveBoard(),
    };
    this.diagram = new DataDiagram(host);
    this.modes = block === null ? dataModes(this, "diagram") : h("span");
    this.el.classList.add("data-leaf");
    const head = h("header", "leaf-head");
    head.append(this.crumbs, this.modes);
    const sheet = h("div", "sheet data-sheet");
    sheet.append(this.diagram.el);
    this.el.append(head, sheet);
    if (block) this.showBlock(block);
  }

  private showBlock(block: BlockSource): void {
    this.setTitle(dgw.diagramOfBlock(block.note));
    this.crumbs.replaceChildren(h("span", "crumb-self", dgw.diagramOfBlock(block.note)));
    this.format = block.format;
    this.diagram.setText(block.text, block.format);
    this.restored = true;
  }

  async load(path: string, force = false): Promise<void> {
    if (this.block) return;
    void force;
    this.path = path;
    this.setTitle(name(path));
    this.crumbs.replaceChildren(...crumbsFor(path));
    const format = formatOfPath(path);
    if (!format) return;
    this.format = format;
    // The text tab's own text first, with what was typed and not yet saved.
    let text = liveText(path);
    if (text === null) {
      const r = await opening.readText(path, this.quiet(path));
      if (this.path !== path) return;
      if (r.status !== "ok") {
        if (r.error.kind !== "unavailable") return this.showFailure(path, r.error, () => void this.load(path, true));
        return;
      }
      this.clearFailure();
      this.revision = r.data.revision;
      text = r.data.text;
    }
    this.diagram.setText(text, format);
    if (!this.restored) {
      this.diagram.restore(readFile(currentFolder, path));
      this.restored = true;
    }
    this.off?.();
    this.off = linkDiagram(path, {
      typed: () => this.followText(),
      caret: (pos) => this.diagram.showCaret(pos),
    });
    const type = typeKey(path);
    if (type) setLastView(type, "diagram");
    markCurrent();
    persistSoon();
  }

  /** The text tab typed: the diagram follows after a pause. */
  private followText(): void {
    window.clearTimeout(this.typedTimer);
    this.typedTimer = window.setTimeout(() => {
      const text = liveText(this.path);
      if (text !== null) this.diagram.setText(text, this.format);
    }, 400);
  }

  /** The file changed on disk: read again, unless a text tab holds it (it is then the source). */
  async recheck(): Promise<void> {
    if (this.block || this.path === "" || liveText(this.path) !== null) return;
    const path = this.path;
    const r = await opening.readText(path, true);
    if (r.status !== "ok" || this.path !== path || r.data.revision === this.revision) return;
    this.revision = r.data.revision;
    this.diagram.setText(r.data.text, this.format);
  }

  override moved(path: string): void {
    this.path = path;
    this.setTitle(name(path));
    this.crumbs.replaceChildren(...crumbsFor(path));
    void this.load(path, true);
  }

  /** To the text of the file: its own tab if one is open, else this tab turns into the text, at the range. */
  private toText(range: Range): void {
    if (this.block) return;
    if (revealInText(this.path, range, true)) return;
    const next = new TextLeaf(this.pane);
    next.pendingReveal = range;
    const type = typeKey(this.path);
    if (type) setLastView(type, "text");
    void this.pane.swap(this, next);
  }

  saveBoard(): void {
    const a = this.diagram.arranged();
    if (!a) return;
    saveAsBoard(boardOf(a.tree, a.lay, a.dir, (id) => titleOf(a.tree, a.tree.nodes[id]!)), this.path || this.block?.note || "diagram");
  }

  /** The moves and folds are kept for this file on this device, soon after they change. */
  private keepSoon(): void {
    if (this.block || this.path === "") return;
    window.clearTimeout(this.keepTimer);
    this.keepTimer = window.setTimeout(() => this.keepNow(), 500);
  }

  private keepNow(): void {
    const saved = this.diagram.snapshot();
    if (saved && this.path !== "") writeFile(currentFolder, this.path, saved);
  }

  override focusContent(): void {
    this.diagram.focusBox();
  }

  override destroy(): void {
    if (this.keepTimer !== 0) {
      window.clearTimeout(this.keepTimer);
      this.keepNow();
    }
    window.clearTimeout(this.typedTimer);
    this.off?.();
    this.off = null;
    this.diagram.destroy();
  }
}
