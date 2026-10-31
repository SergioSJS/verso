// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The command line and the agents' controls of the "cli" page (ADR 0054).

import { type CliState, commands, type McpStatus } from "../../bindings";
import { ask } from "../../dialog";
import { button, h, ui } from "../../dom";
import { currentFolder } from "../../folder";
import { LINUX } from "../../platform";
import { settings } from "../../settings";
import { t } from "../../strings";
import type { ItemCtx } from "./types";

/** The arguments a client starts `verso` with, by the mode: the open
 *  folder's key, or `--all`; none in per-folder mode with no folder open. */
export function mcpArgs(): string[] | null {
  if (settings.mcpMode === "all") return ["mcp", "--all"];
  return currentFolder ? ["mcp", "--key", currentFolder] : null;
}


/** Where the command line stands, and the button that changes it. */
export function cliControl(ctx: ItemCtx): HTMLElement {
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
    ctx.paint();
  })());
  remove.addEventListener("click", () => void (async () => {
    const r = await commands.uninstallCli();
    if (r.status !== "ok") {
      said.textContent = r.error.message === "cancelled" ? t.cliCancelled : r.error.message;
      return;
    }
    ui.status.textContent = t.cliRemoved;
    ctx.paint();
  })());
  wrap.append(said, install, remove);
  return wrap;
}
/** Whether Claude Desktop starts this folder's server, and the button
 *  that adds it — after showing what goes in. */
export function mcpControl(): HTMLElement {
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
export function agentVisibleControl(ctx: ItemCtx): HTMLElement {
  const l = ctx.toggle(false, (v) => void commands.setAgentVisible(v).then((r) => {
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
export function snippet(first: string, fromHost?: (st: McpStatus) => string): HTMLElement {
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
