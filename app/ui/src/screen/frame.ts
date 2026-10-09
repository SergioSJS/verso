// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The frame on a phone (ADR 0076): the screen decides the frame, the pane
// its content (item 1). Under 760 px the ribbon and the status bar leave
// and a bar of five verbs sits at the bottom, above the phone's safe area
// (item 6); what the status bar says that matters there — a save that
// failed, and on a server that the folder can only be read — is said at
// the top of the pane. The layout itself is in `css/screen.css`; here are
// the controls it shows and what they do.

import { canWrite, can, loadCan, onCan } from "../can";
import { narrow, toggleSide } from "../chrome";
import { button, h, ui } from "../dom";
import { newUntitled } from "../files";
import { icon } from "../icons";
import { layout, paneToOpenIn, spaces } from "../layout/spaces";
import { NoteLeaf } from "../leaves/note";
import { TextLeaf } from "../leaves/textfile";
import { paletteDialog, ribbon } from "../main";
import { showSide } from "../side";
import { t } from "../strings";
import { installSelectBar } from "../tree/selectBar";
import { installKeyboard } from "./keyboard";
import { installRowMore } from "./rowMore";
import { st } from "./strings";

/* ---------- The bottom bar (item 6) ---------- */
const bar = h("nav", "bottom-bar");
/** A verb of the bar: its mark, and a word under it — five unlabelled
 *  icons are a riddle on a phone. The word is the button's name. */
function item(label: string, iconName: string, cls = ""): HTMLButtonElement {
  const b = h("button", `bottom-bar-item ${cls}`.trim());
  b.type = "button";
  b.append(icon(iconName), h("span", "bottom-bar-label", label));
  return b;
}
const back = item(st.barBack, "arrowLeft");

function verb(label: string, iconName: string, run: () => void, cls = ""): HTMLButtonElement {
  const b = item(label, iconName, cls);
  b.addEventListener("click", run);
  return b;
}

function buildBar(): void {
  bar.setAttribute("aria-label", st.bar);
  back.addEventListener("click", () => (layout().focused ?? layout().panes()[0])?.go(-1));
  bar.append(
    verb(st.barFiles, "sidebar", () => toggleSide(), "bar-files"),
    verb(st.barSearch, "search", () => {
      showSide();
      ui.search.focus();
      ui.search.select();
    }, "bar-folder"),
    verb(st.barNew, "plus", () => void newUntitled(paneToOpenIn()), "bar-folder bar-write"),
    back,
    verb(st.barCommands, "command", () => paletteDialog.show(), "bar-folder"),
  );
  document.querySelector("main.work")?.append(bar);
  paintBar();
  // A folder opened or closed enables the search field: the bar follows.
  new MutationObserver(paintBar).observe(ui.search, { attributes: true, attributeFilter: ["disabled"] });
  document.addEventListener("verso:nav", paintBar);
}

/** What the bar can do now: a folder open, a step back to take. */
function paintBar(): void {
  const none = ui.search.disabled;
  for (const b of bar.querySelectorAll<HTMLButtonElement>(".bar-folder")) b.disabled = none;
  back.disabled = !(layout().focused ?? layout().panes()[0])?.canGo(-1);
}

/* ---------- The top of the pane (items 6 and 11) ---------- */
const notices = h("div", "work-notices");
const readOnlyLine = h("p", "read-only-line", st.readOnly);
const failedLine = h("div", "failed-line");
const failedText = h("span", "failed-text");

function buildNotices(): void {
  readOnlyLine.setAttribute("role", "note");
  readOnlyLine.hidden = true;
  failedLine.setAttribute("role", "alert");
  failedLine.hidden = true;
  const dismiss = button("ghost iconic", st.dismiss, "close");
  dismiss.addEventListener("click", () => (failedLine.hidden = true));
  failedLine.append(failedText, dismiss);
  notices.append(readOnlyLine, failedLine);
  document.querySelector("main.work")?.prepend(notices);
  addEventListener("verso:failed", (e) => {
    failedText.textContent = (e as CustomEvent<string>).detail;
    failedLine.hidden = false;
  });
}

/* ---------- What the side cannot do (item 11) ---------- */
/** The settings that mean nothing on the side the window talks to: the
 *  command line and the agents, the updates, the console. The dialog is
 *  another file's; its rows are found by their titles once drawn.
 *  `[OPEN]`: the dialog filtering its own items by capability. */
function pruneSettings(): void {
  const dialog = document.querySelector<HTMLElement>(".quick.settings");
  if (!dialog) return;
  const titles = (): Set<string> => {
    const out = new Set<string>();
    if (!can("agents")) for (const s of [t.cliTitle, t.mcpModeTitle, t.mcpTitle, t.agentVisibleTitle, t.mcpCodeTitle, t.mcpOtherTitle]) out.add(s);
    if (!can("updates")) out.add(t.checkUpdates);
    if (!can("devtools")) out.add(t.devtools);
    return out;
  };
  const apply = (): void => {
    const gone = titles();
    for (const row of dialog.querySelectorAll<HTMLElement>(".setting")) {
      const title = row.querySelector(".setting-title")?.textContent ?? "";
      row.hidden = gone.has(title);
    }
    for (const b of dialog.querySelectorAll<HTMLElement>(".settings-nav-item, .settings-heading")) {
      if (b.textContent?.trim() === t.sCli) b.hidden = !can("agents");
    }
  };
  new MutationObserver(apply).observe(dialog, { childList: true, subtree: true });
  onCan(apply);
}

/** The answer drawn: the reader's line, and every open tab read again so
 *  that its editor takes or drops its read-only state. */
let wrote = true;
function applyCan(): void {
  readOnlyLine.hidden = canWrite();
  paintBar();
  ribbon?.paint();
  if (canWrite() === wrote) return;
  wrote = canWrite();
  for (const s of spaces) {
    for (const p of s.layout.panes()) {
      for (const l of p.leaves) if ((l instanceof NoteLeaf || l instanceof TextLeaf) && !l.dirty && l.path) void l.load(l.path, true);
    }
  }
}

/* ---------- Line numbers on a phone (item 6) ---------- */
function lineNumbersFollow(): void {
  for (const s of spaces) {
    for (const p of s.layout.panes()) {
      for (const l of p.leaves) if (l instanceof NoteLeaf || l instanceof TextLeaf) l.applyLineNumbers();
    }
  }
}

export function installScreen(): void {
  buildBar();
  buildNotices();
  pruneSettings();
  installRowMore();
  installSelectBar();
  installKeyboard();
  onCan(applyCan);
  void loadCan();
  narrow.addEventListener("change", lineNumbersFollow);
}
