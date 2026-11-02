// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The terminal's screen (ADR 0115 items 8, 10–12 and 24): xterm.js with
// its fit, Unicode 11, web-links and WebGL addons, loaded as a lazy chunk
// on the first terminal opened (`import("../terminal/xtermScreen")`), as the 3D
// dice are (ADR 0101 item 1): a window that never opens one downloads none
// of it. The WebGL renderer when the engine gives a context, the DOM
// renderer otherwise; neither needs anything of the window's content policy
// beyond what it allows (`style-src 'self' 'unsafe-inline'`).

import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { linkHandler } from "./links";
import { type RGB, parseComputed } from "../theme/color";
import { type Semantic, type TerminalTheme, terminalTheme } from "./palette";

export type ViewOptions = {
  mac: boolean;
  windows: boolean;
  /** Option as Meta on macOS (off by default: accents and dead keys). */
  meta: boolean;
  /** xterm's screen reader mode: new output said through a live region. */
  reader: boolean;
  /** Whether a key goes to the shell (true) or stays the app's (false). */
  key: (e: KeyboardEvent, selection: boolean) => boolean;
  /** A link in the output, opened as the window opens links. */
  openLink: (url: string) => void;
};

/** xterm's own stylesheet, beside the build (`dist/terminal/xterm.css`). */
function ensureStyles(): void {
  if (document.querySelector("link[data-xterm]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "terminal/xterm.css";
  link.dataset["xterm"] = "";
  document.head.append(link);
}

const SEMANTIC: Semantic[] = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"];
let canvas: CanvasRenderingContext2D | null = null;

/** A colour the browser computed, as sRGB (a canvas reads what it cannot parse). */
function rgbOf(css: string): RGB | null {
  if (!css || /^rgba\(0, 0, 0, 0\)$|^transparent$/.test(css)) return null;
  const parsed = parseComputed(css);
  if (parsed) return parsed;
  canvas ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!canvas) return null;
  canvas.clearRect(0, 0, 1, 1);
  canvas.fillStyle = "#000000";
  canvas.fillStyle = css;
  canvas.fillRect(0, 0, 1, 1);
  const d = canvas.getImageData(0, 0, 1, 1).data;
  return { r: (d[0] ?? 0) / 255, g: (d[1] ?? 0) / 255, b: (d[2] ?? 0) / 255 };
}

/** The page's tokens where the terminal is, read through a probe. */
export function themeAt(host: HTMLElement): TerminalTheme {
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:0;height:0";
  host.append(probe);
  const read = (value: string): RGB | null => {
    probe.style.color = "";
    probe.style.color = value;
    return rgbOf(getComputedStyle(probe).color);
  };
  const black = { r: 0, g: 0, b: 0 };
  const background = read("var(--paper)") ?? { r: 1, g: 1, b: 1 };
  const foreground = read("var(--ink)") ?? black;
  const semantic: Partial<Record<Semantic, RGB>> = {};
  for (const s of SEMANTIC) {
    const c = read(`var(--${s}, transparent)`);
    if (c) semantic[s] = c;
  }
  const theme = terminalTheme({
    background,
    foreground,
    selection: read("var(--selection)") ?? foreground,
    cursor: read("var(--seal)") ?? foreground,
    semantic,
  });
  probe.remove();
  return theme;
}

const live = new Set<TerminalView>();
// A theme, palette or light/dark change repaints every terminal.
const repaint = (): void => {
  for (const v of live) v.repaint();
};
new MutationObserver(repaint).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-palette", "data-dark", "style", "class"] });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", repaint);

export class TerminalView {
  readonly term: Terminal;
  private readonly fitter = new FitAddon();
  private webgl: WebglAddon | null = null;

  constructor(
    private readonly host: HTMLElement,
    opts: ViewOptions,
  ) {
    ensureStyles();
    const quiet = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.term = new Terminal({
      allowProposedApi: true,
      cursorBlink: !quiet,
      fontFamily: getComputedStyle(host).fontFamily || "ui-monospace, Menlo, monospace",
      fontSize: 13,
      lineHeight: 1.15,
      linkHandler: linkHandler(opts.openLink),
      macOptionIsMeta: opts.meta,
      screenReaderMode: opts.reader,
      scrollback: 5000,
      theme: themeAt(host),
      ...(opts.windows ? { windowsPty: { backend: "conpty" as const } } : {}),
    });
    this.term.loadAddon(this.fitter);
    const unicode = new Unicode11Addon();
    this.term.loadAddon(unicode);
    this.term.unicode.activeVersion = "11";
    this.term.loadAddon(new WebLinksAddon(linkHandler(opts.openLink).activate));
    this.term.attachCustomKeyEventHandler((e) => (e.type === "keydown" ? opts.key(e, this.term.hasSelection()) : true));
    this.term.open(host);
    // The GPU's renderer when the engine gives a context; the DOM's when it
    // refuses one or loses it.
    try {
      const gl = new WebglAddon();
      gl.onContextLoss(() => {
        gl.dispose();
        this.webgl = null;
      });
      this.term.loadAddon(gl);
      this.webgl = gl;
    } catch {
      this.webgl = null;
    }
    live.add(this);
  }

  /** The renderer in use, for the console and the manual checks. */
  get renderer(): "webgl" | "dom" {
    return this.webgl ? "webgl" : "dom";
  }

  write(text: string, done: () => void): void {
    this.term.write(text, done);
  }

  /** Fit the terminal to its box; its size in cells after. */
  fit(): { cols: number; rows: number } {
    if (this.host.clientWidth > 0 && this.host.clientHeight > 0) {
      try {
        this.fitter.fit();
      } catch {
        // A box not laid out yet: the size stays.
      }
    }
    return { cols: this.term.cols, rows: this.term.rows };
  }

  focus(): void {
    this.term.focus();
  }

  clear(): void {
    this.term.clear();
  }

  selectAll(): void {
    this.term.selectAll();
  }

  /** The text on screen and in the scrollback, line by line (the tests read it). */
  text(): string {
    const buffer = this.term.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buffer.length; i += 1) lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
    return lines.join("\n").replace(/\n+$/, "");
  }

  repaint(): void {
    this.term.options.theme = themeAt(this.host);
  }

  set reader(on: boolean) {
    this.term.options.screenReaderMode = on;
  }

  set meta(on: boolean) {
    this.term.options.macOptionIsMeta = on;
  }

  onData(run: (data: string) => void): void {
    this.term.onData(run);
  }

  dispose(): void {
    live.delete(this);
    this.term.dispose();
  }
}
