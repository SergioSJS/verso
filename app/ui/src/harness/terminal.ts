// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The embedded terminal in the browser harness (ADR 0115, section G): no
// pseudo-terminal here, so a scripted shell answers the window's commands
// as the desktop host does — refused while the switch is off, a prompt on
// open, the keys echoed, `echo …` answered, `sleep …` busy until Ctrl+C,
// `exit` ending it, a reload finding it again with what it printed. Enough
// for e2e/terminal.spec.mjs to drive the tab with no shell.

import type { AiCli, AiCliFound, ContractError, ErrorKind, TerminalOpened, TerminalOutput, TerminalSize, TerminalStart } from "../bindings";

function refuse(kind: ErrorKind, message: string): never {
  const error: ContractError = { kind, message };
  throw error;
}

type Sink = { onmessage: (m: TerminalOutput) => void };

type Fake = {
  sink: Sink;
  kept: string;
  line: string;
  size: TerminalSize;
  busy: boolean;
  folder: string;
  at: "folder" | "home";
};

export class FakeTerminals {
  on = false;
  /** Whether the window shows a folder of this computer (a server's: home). */
  local = true;
  /** The tools the fake shell finds. */
  installed: AiCli[] = ["claude", "gemini"];
  readonly open = new Map<string, Fake>();
  /** Every page a tool's install button opened. */
  readonly pages: AiCli[] = [];
  private next = 1;

  constructor(handlers: Record<string, (a: Record<string, unknown>) => unknown>) {
    handlers["set_terminal_enabled"] = (a) => {
      this.on = a["on"] === true;
      if (!this.on) for (const id of [...this.open.keys()]) this.end(id, null);
      return null;
    };
    handlers["terminal_open"] = (a) => this.start(a["start"] as TerminalStart, a["output"] as Sink);
    handlers["terminal_attach"] = (a) => this.attach(String(a["id"]), a["output"] as Sink);
    handlers["terminal_write"] = (a) => this.write(String(a["id"]), String(a["data"]));
    handlers["terminal_resize"] = (a) => {
      this.of(String(a["id"])).size = a["size"] as TerminalSize;
      return null;
    };
    handlers["terminal_flow"] = (a) => {
      this.of(String(a["id"]));
      return a["behind"] === true ? null : null;
    };
    handlers["terminal_busy"] = (a) => this.open.get(String(a["id"]))?.busy ?? false;
    handlers["terminal_close"] = (a) => {
      this.open.delete(String(a["id"]));
      return null;
    };
    handlers["terminal_detect"] = (a) => {
      this.allowed();
      void a["shell"];
      void a["locale"];
      return (["claude", "gemini", "codex", "antigravity", "opencode", "cursor_agent"] as AiCli[]).map((cli): AiCliFound => ({ cli, found: this.installed.includes(cli) }));
    };
    handlers["terminal_install_page"] = (a) => {
      this.pages.push(a["cli"] as AiCli);
      return null;
    };
  }

  private allowed(): void {
    if (!this.on) refuse("refused", "the terminal is off: Settings › Features turns it on");
  }

  private of(id: string): Fake {
    this.allowed();
    const t = this.open.get(id);
    if (!t) refuse("not_found", "no such terminal in this window");
    return t;
  }

  private say(t: Fake, text: string): void {
    t.kept = (t.kept + text).slice(-256 * 1024);
    // In a task of its own, as a channel's message arrives.
    setTimeout(() => t.sink.onmessage({ kind: "data", text }), 0);
  }

  private prompt(t: Fake): string {
    return `${t.at === "home" ? "~" : t.folder || "demo-vault"} $ `;
  }

  private start(start: TerminalStart, sink: Sink): TerminalOpened {
    this.allowed();
    const id = `harness-${this.next++}`;
    const at = this.local ? "folder" : "home";
    const t: Fake = { sink, kept: "", line: "", size: start.size, busy: false, folder: at === "home" ? "" : (start.folder ?? ""), at };
    this.open.set(id, t);
    void start.shell;
    void start.locale;
    this.say(t, `Verso harness shell\r\n${this.prompt(t)}`);
    const words: Record<AiCli, string> = { claude: "claude", gemini: "gemini", codex: "codex", antigravity: "agy", opencode: "opencode", cursor_agent: "cursor-agent" };
    if (start.cli) this.write(id, `${words[start.cli]}\r`);
    return { id, at, shell: "zsh" };
  }

  private attach(id: string, sink: Sink): TerminalOpened {
    const t = this.of(id);
    t.sink = sink;
    if (t.kept) setTimeout(() => sink.onmessage({ kind: "data", text: t.kept }), 0);
    return { id, at: t.at, shell: "zsh" };
  }

  private write(id: string, data: string): null {
    const t = this.of(id);
    for (const ch of data) {
      if (ch === "\u0003") {
        t.busy = false;
        t.line = "";
        this.say(t, `^C\r\n${this.prompt(t)}`);
      } else if (ch === "\r") {
        this.run(id, t, t.line.trim());
        t.line = "";
      } else if (ch === "\u007f") {
        if (t.line) {
          t.line = t.line.slice(0, -1);
          this.say(t, "\b \b");
        }
      } else if (!t.busy) {
        t.line += ch;
        this.say(t, ch);
      }
    }
    return null;
  }

  private run(id: string, t: Fake, line: string): void {
    this.say(t, "\r\n");
    if (line === "exit") return this.end(id, 0);
    if (line.startsWith("sleep")) {
      t.busy = true;
      return;
    }
    if (line.startsWith("echo ")) this.say(t, `${line.slice(5)}\r\n`);
    else if (line === "stty size") this.say(t, `${t.size.rows} ${t.size.cols}\r\n`);
    else if (["claude", "gemini", "codex", "agy", "opencode", "cursor-agent"].includes(line)) this.say(t, `${line}: started in the harness\r\n`);
    else if (line) this.say(t, `${line.split(" ")[0]}: command not found\r\n`);
    this.say(t, this.prompt(t));
  }

  private end(id: string, code: number | null): void {
    const t = this.open.get(id);
    if (!t) return;
    this.open.delete(id);
    setTimeout(() => t.sink.onmessage({ kind: "ended", code }), 0);
  }
}
