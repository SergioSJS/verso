// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The embedded terminal's ways in (ADR 0115 items 7, 9, 13 and 14): whether
// the window offers it — the side can (the desktop app, `Can::Terminal`)
// and the person turned it on (Settings › Features, off by default, Q5) —
// opening one, the AI tools found by the shell on a click, the switch told
// to the host, and the question before a window with a busy terminal goes.

import { type AiCli, type AiCliFound, commands } from "../bindings";
import { can } from "../can";
import { hasCapability } from "../capabilities";
import { ask } from "../dialog";
import { ui } from "../dom";
import { fail } from "../errors";
import { paneToOpenIn, spaces } from "../layout/spaces";
import type { Leaf } from "../leaves/leaf";
import { type MenuItem, showMenu } from "../menu";
import { WINDOWS } from "../platform";
import { saveSettings, settings } from "../settings";
import { readPrefs, type TerminalPrefs } from "./prefs";
import { tw } from "./strings";

export type TerminalPlace = {
  /** A folder below the open one, relative to it; "" is its root. */
  folder: string;
  /** An AI tool to start in it (item 14). */
  cli?: AiCli | null;
  /** A terminal of this run to find again (a reloaded window, Q6). */
  attach?: string | null;
};

/** The window offers a terminal: the side can, and the switch is on. */
export function terminalOn(): boolean {
  return can("terminal") && hasCapability("terminal");
}

export function prefs(): TerminalPrefs {
  return readPrefs(settings.terminal);
}

export function setPrefs(change: Partial<TerminalPrefs>): void {
  settings.terminal = { ...prefs(), ...change };
  saveSettings();
  dispatchEvent(new Event("verso:terminal-prefs"));
}

/** What `terminal_open` and `terminal_detect` take of the window. */
export function shellChoice(): "powershell" | "cmd" | null {
  return WINDOWS ? prefs().shell : null;
}

/** Open a terminal in a tab of the pane in use (the palette, the tree's
 *  folder menu, the settings, an AI tool's button). */
export function openTerminal(folder = "", cli: AiCli | null = null): Leaf | null {
  if (!terminalOn()) return null;
  return paneToOpenIn().openTerminal({ folder, cli });
}

/** The AI tools the shell finds, asked now (never at start). */
export async function detectTools(): Promise<AiCliFound[] | null> {
  ui.status.textContent = tw.looking;
  const r = await commands.terminalDetect(shellChoice(), navigator.language || null);
  if (r.status !== "ok") {
    fail(r.error);
    return null;
  }
  ui.status.textContent = r.data.some((f) => f.found) ? "" : tw.noneFound;
  return r.data;
}

/** One row per tool: start a found one in a new terminal, or open the page
 *  it is installed from. */
export function toolItems(found: AiCliFound[], folder: string): MenuItem[] {
  return found.map((f): MenuItem =>
    f.found
      ? [tw.start(tw.cliNames[f.cli]), () => void openTerminal(folder, f.cli), "terminal"]
      : [tw.install(tw.cliNames[f.cli]), () => void commands.terminalInstallPage(f.cli).then((r) => r.status === "ok" || fail(r.error)), "globe"],
  );
}

/** The AI tools' menu, at a button. */
export async function toolsMenu(anchor: HTMLElement, folder: string): Promise<void> {
  const found = await detectTools();
  if (!found || !anchor.isConnected) return;
  const r = anchor.getBoundingClientRect();
  showMenu(r.left, r.bottom, toolItems(found, folder), tw.aiTools);
}

/** The host is told the switch (item 7): it refuses a terminal while off.
 *  Off, this window's terminal tabs close; the host ends their shells. */
export function pushSwitch(): Promise<void> {
  if (!can("terminal")) return Promise.resolve();
  const told = commands.setTerminalEnabled(hasCapability("terminal")).catch(() => {});
  if (!hasCapability("terminal")) for (const leaf of terminalLeaves()) void leaf.close(true);
  return told;
}

/** Every terminal tab of this window, in every workspace. */
export function terminalLeaves(): Leaf[] {
  return spaces.flatMap((s) => s.layout.panes().flatMap((p) => p.leaves)).filter((l) => l.kind === "terminal");
}

/** Before the window goes (closed, or the app quits): a terminal that runs
 *  a program — on Windows, any open one — is named and asked about (item
 *  13). True when the window may go. */
export async function mayEndTerminals(): Promise<boolean> {
  const open = terminalLeaves() as (Leaf & { id: string | null; ended: boolean })[];
  const live = open.filter((l) => l.id && !l.ended);
  if (live.length === 0) return true;
  const busy: Leaf[] = [];
  for (const l of live) if (await commands.terminalBusy(l.id!).catch(() => false)) busy.push(l);
  if (busy.length === 0) return true;
  const names = busy.map((l) => l.tabName.textContent ?? "").join("\n");
  return ask(tw.askQuit(names), { yes: tw.quitAnyway, no: tw.cancel });
}
