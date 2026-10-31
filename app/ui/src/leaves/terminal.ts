// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A terminal in a tab (ADR 0115 item 9, Q1 decided 2026-10-31): a leaf like
// a note, placed wherever a note goes — split, moved, another workspace.
// The screen (xterm.js) is a lazy chunk loaded on the first one; this
// module is the tab, small and in the window's bundle. The shell runs in
// the desktop host (src-tauri/src/pty.rs): its output comes on a channel,
// the keys go back as `terminal_write`, and a reloaded window finds it
// again by its id (Q6).

import { Channel } from "@tauri-apps/api/core";
import { type ContractError, commands, type TerminalAt, type TerminalOutput } from "../bindings";
import { ask } from "../dialog";
import { button, h, ui } from "../dom";
import { errorSentence } from "../errors";
import { currentFolder, folderName } from "../folder";
import { comboOf, prettyKeys } from "../keys";
import type { Pane } from "../layout/pane";
import { persistSoon } from "../main";
import type { Kind } from "../paths";
import { MAC, WINDOWS } from "../platform";
import { Flow } from "../terminal/flow";
import { LEAVE_KEYS, routeKey } from "../terminal/keys";
import { prefs, setPrefs, shellChoice, type TerminalPlace, toolsMenu } from "../terminal/open";
import { tw } from "../terminal/strings";
import type { TerminalView } from "../terminal/xtermScreen";
import { Leaf } from "./leaf";

/** The numbers the open terminals' tabs carry ("Terminal 2 — …"). */
const numbers = new Set<number>();
function nextNumber(): number {
  let n = 1;
  while (numbers.has(n)) n += 1;
  numbers.add(n);
  return n;
}

export class TerminalLeaf extends Leaf {
  readonly kind: Kind = "terminal";
  /** The host's id for this terminal, once it started. */
  id: string | null = null;
  /** The folder it started in, relative to the open one ("" is the root). */
  readonly folder: string;
  ended = false;
  private at: TerminalAt = "folder";
  private view: TerminalView | null = null;
  private readonly number = nextNumber();
  private readonly bar = h("div", "terminal-bar");
  private readonly where = h("span", "terminal-where");
  private readonly lines = h("div", "terminal-lines");
  private readonly screen = h("div", "terminal-host");
  private observer: ResizeObserver | null = null;
  private size = { cols: 0, rows: 0 };
  private disposed = false;

  constructor(pane: Pane, place: TerminalPlace) {
    super(pane);
    this.folder = place.folder;
    this.el.classList.add("terminal-leaf");
    this.screen.setAttribute("role", "region");
    this.screen.setAttribute("aria-label", this.title());
    this.screen.setAttribute("aria-description", tw.leaveKeys(this.leaveKeys()));
    const tools = button("ghost terminal-tool", tw.aiTools);
    tools.removeAttribute("title");
    tools.setAttribute("aria-haspopup", "menu");
    tools.addEventListener("click", () => void toolsMenu(tools, this.folder));
    const clear = button("ghost terminal-tool", tw.clear);
    clear.removeAttribute("title");
    clear.addEventListener("click", () => {
      this.clear();
      this.view?.focus();
    });
    this.bar.append(this.where, tools, clear);
    this.lines.setAttribute("role", "status");
    this.el.append(this.bar, this.lines, this.screen);
    this.setTitle(this.title());
    this.loading = this.start(place);
    addEventListener("verso:terminal-prefs", this.prefsChanged);
  }

  private readonly prefsChanged = (): void => {
    if (!this.view) return;
    this.view.reader = prefs().reader;
    this.view.meta = prefs().meta;
  };

  /** "Terminal — Campanha", numbered when several are open. */
  private title(): string {
    const name = this.folder ? (this.folder.split("/").pop() ?? this.folder) : folderName || tw.region;
    return tw.tab(name, this.number);
  }

  /** The keys that leave the terminal, as this machine writes them. */
  leaveKeys(): string {
    return LEAVE_KEYS.map((k) => prettyKeys(k)).join(", ");
  }

  async load(): Promise<void> {
    await this.loading;
  }

  private async start(place: TerminalPlace): Promise<void> {
    const { TerminalView } = await import("../terminal/xtermScreen");
    if (this.disposed) return;
    const p = prefs();
    const view = new TerminalView(this.screen, {
      mac: MAC,
      windows: WINDOWS,
      meta: p.meta,
      reader: p.reader,
      key: (e, selection) => routeKey(comboOf(e), MAC, selection) === "shell",
      openLink: (url) => void commands.openUrl(url),
    });
    this.view = view;
    // The test harness reads what the terminal shows (e2e/terminal.spec.mjs).
    const test = (window as unknown as { __VERSO_TEST__?: Record<string, unknown> }).__VERSO_TEST__;
    if (test) test["terminal"] = () => (this.pane.active === this ? view.text() : null);
    const flow = new Flow(
      (text, done) => view.write(text, done),
      (behind) => {
        if (this.id) void commands.terminalFlow(this.id, behind);
      },
    );
    const channel = (): Channel<TerminalOutput> => {
      const c = new Channel<TerminalOutput>();
      c.onmessage = (m) => {
        if (m.kind === "data") flow.push(m.text);
        else this.endedWith(m.code);
      };
      return c;
    };
    this.size = view.fit();
    let opened = null;
    if (place.attach) {
      const r = await commands.terminalAttach(place.attach, channel());
      if (r.status === "ok") opened = r.data;
    }
    if (!opened) {
      const r = await commands.terminalOpen(
        { size: this.size, folder: this.folder || null, cli: place.cli ?? null, shell: shellChoice(), locale: navigator.language || null },
        channel(),
      );
      if (r.status !== "ok") return this.failedToStart(r.error);
      opened = r.data;
    }
    if (this.disposed) {
      void commands.terminalClose(opened.id);
      return;
    }
    this.id = opened.id;
    this.at = opened.at;
    this.where.textContent = opened.at === "home" ? tw.inHome(opened.shell) : tw.inFolder(opened.shell, this.folder || folderName);
    if (opened.at === "home") this.line(tw.notHere, false);
    this.noticeOnce();
    view.onData((data) => {
      if (this.id) void commands.terminalWrite(this.id, data);
    });
    this.observer = new ResizeObserver(() => this.refit());
    this.observer.observe(this.screen);
    this.refit();
    persistSoon();
    if (this.pane.active === this) view.focus();
  }

  /** The box changed: the terminal fits it, and the shell is told. */
  private refit(): void {
    if (!this.view || this.el.hidden) return;
    const size = this.view.fit();
    if (size.cols === this.size.cols && size.rows === this.size.rows) return;
    this.size = size;
    if (this.id) void commands.terminalResize(this.id, size);
  }

  /** A line above the terminal: the home directory's, or the notice. */
  private line(text: string, dismissable: boolean): void {
    const p = h("p", "terminal-line", text);
    if (dismissable) {
      const ok = button("ghost", tw.gotIt);
      ok.removeAttribute("title");
      ok.addEventListener("click", () => {
        p.remove();
        this.view?.focus();
      });
      p.append(" ", ok);
    }
    this.lines.append(p);
  }

  /** The first terminal opened in a folder says, once, what a program run
   *  there does to its files (Q8; ADR 0091): no modal, no repeat. */
  private noticeOnce(): void {
    if (this.at !== "folder" || !currentFolder) return;
    const p = prefs();
    if (p.noticed.includes(currentFolder)) return;
    setPrefs({ noticed: [...p.noticed, currentFolder] });
    this.line(tw.notice, true);
  }

  private failedToStart(error: ContractError): void {
    this.ended = true;
    const box = h("div", "load-failure");
    box.setAttribute("role", "alert");
    box.append(h("p", "load-failure-title", tw.failed(errorSentence(error))));
    this.screen.replaceChildren(box);
    ui.status.textContent = tw.failed(errorSentence(error));
  }

  /** The shell ended: the tab closes, the status line says how. */
  private endedWith(code: number | null): void {
    if (this.ended) return;
    this.ended = true;
    ui.status.textContent = tw.ended(code);
    window.setTimeout(() => void this.close(true), 0);
  }

  clear(): void {
    this.view?.clear();
  }

  selectAll(): void {
    this.view?.selectAll();
  }

  /** What the terminal shows, line by line (the e2e reads it). */
  text(): string {
    return this.view?.text() ?? "";
  }

  setTitle(title: string): void {
    super.setTitle(title);
    this.tab.title = title;
  }

  focusContent(): void {
    this.view?.focus();
    window.requestAnimationFrame(() => this.refit());
  }

  async flush(): Promise<boolean> {
    return true;
  }

  /** Closing asks first while a program runs in it (item 13; on Windows,
   *  whenever it is open); `force` closes as the window does. */
  async close(force = false): Promise<void> {
    if (!force && !this.pinned && this.id && !this.ended) {
      const busy = await commands.terminalBusy(this.id).catch(() => false);
      if (busy && !(await ask(WINDOWS ? tw.askOpen : tw.askBusy, { yes: tw.closeIt, no: tw.cancel }))) return;
    }
    await super.close(force);
  }

  destroy(): void {
    this.disposed = true;
    removeEventListener("verso:terminal-prefs", this.prefsChanged);
    numbers.delete(this.number);
    this.observer?.disconnect();
    if (this.id && !this.ended) void commands.terminalClose(this.id);
    this.ended = true;
    this.view?.dispose();
    this.view = null;
  }
}
