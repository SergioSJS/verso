// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The folder switcher at the top of the side bar (ADR 0081 item 5, decided
// 2026-10-10): the folder button opens the folders the person may go to,
// in three groups — on this computer, mine on a server, and shared with
// me (a whole folder someone else owns, or a folder inside it). A share
// opens as a folder of its own, never inside the person's vault (item 6).

import { commands, type ServerFolder } from "../bindings";
import { can, host } from "../can";
import { asDialog, closed, opened } from "../dialogs/a11y";
import { openServerFolder, serverStrings } from "../dialogs/servers";
import { openSettingsSection } from "../dialogs/sync";
import { h } from "../dom";
import { icon } from "../icons";
import { errorSentence } from "../errors";
import { attempt } from "../reach";
import { currentFolder, folderName } from "../folder";
import { flash } from "../notify";
import { openFolderBy, openFolderDialog } from "../open";
import { roleWord, sh } from "../shareStrings";
import { hiddenFolderKeys, hideFolder, visibleRecents } from "./hiddenFolders";

let shown: HTMLElement | null = null;

function hide(): void {
  if (!shown) return;
  const el = shown;
  shown = null;
  el.remove();
  closed(el);
}

/** How many folders a list shows before "N more…". */
const SHOWN = 8;

type Row = {
  label: string;
  /** Where it sits, small and muted under the name: told apart from another of the same name. */
  place?: string;
  /** At the right: its role on a server, "open" for the one open now. */
  note?: string;
  current?: boolean;
  /** An action, not a folder: set apart, with its own icon, never read as one more folder. */
  action?: boolean;
  icon?: string;
  /** Takes the folder off the list (T.10): a × beside the row, nothing deleted. */
  hide?: () => void;
  run: () => void;
};

function entry(r: Row): HTMLLIElement {
  const li = h("li", r.action ? "switcher-action" : "");
  const b = h("button", r.action ? "sw-action" : "");
  b.type = "button";
  b.append(icon(r.icon ?? (r.action ? "plus" : "folder")));
  const text = h("span", "sw-text");
  text.append(h("span", "sw-name", r.label));
  if (r.place) text.append(h("small", "sw-place", r.place));
  b.append(text);
  if (r.note) b.append(h("small", "sw-note", r.note));
  b.title = sh.fullPath(r.label, r.place ?? "");
  if (r.current) b.setAttribute("aria-current", "true");
  b.addEventListener("click", () => {
    hide();
    r.run();
  });
  li.append(b);
  if (r.hide) {
    li.classList.add("sw-row");
    const x = h("button", "sw-hide");
    x.type = "button";
    x.append(icon("close"));
    const label = sh.hideFolder(r.label);
    x.setAttribute("aria-label", label);
    x.title = label;
    x.addEventListener("click", (e) => {
      e.stopPropagation();
      r.hide?.();
    });
    li.append(x);
  }
  return li;
}

/** The rows of a list, the first few shown and "N more…" for the rest, which
 *  opens them in place and puts the focus on the first of them. */
function fill(list: HTMLUListElement, rows: HTMLLIElement[]): void {
  list.append(...rows.slice(0, SHOWN));
  const rest = rows.slice(SHOWN);
  if (rest.length === 0) return;
  const li = h("li", "sw-more-row");
  const more = h("button", "sw-more", sh.moreFolders(rest.length));
  more.type = "button";
  more.setAttribute("aria-expanded", "false");
  more.addEventListener("click", () => {
    li.replaceWith(...rest);
    rest[0]?.querySelector("button")?.focus();
  });
  li.append(more);
  list.append(li);
}

/** Every row a group holds, shown or not: a second server's rows join the
 *  first's and the cap counts them all. */
const held = new WeakMap<HTMLUListElement, HTMLLIElement[]>();
function addRows(list: HTMLUListElement, rows: HTMLLIElement[]): void {
  const all = [...(held.get(list) ?? []), ...rows];
  held.set(list, all);
  list.replaceChildren();
  fill(list, all);
}

/** The arrows walk the switcher's buttons, Home and End reach the ends. */
function walk(box: HTMLElement, e: KeyboardEvent): void {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  // The × beside a row is reached by Tab: the arrows walk the rows.
  const buttons = [...box.querySelectorAll<HTMLButtonElement>("button:not(.sw-hide)")];
  const now = document.activeElement;
  const at = buttons.indexOf((now?.classList.contains("sw-hide") ? now.previousElementSibling : now) as HTMLButtonElement);
  const to = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : e.key === "ArrowDown" ? Math.min(buttons.length - 1, at + 1) : Math.max(0, at - 1);
  e.preventDefault();
  buttons[to]?.focus();
}

function group(id: string, title: string): { section: HTMLElement; list: HTMLUListElement } {
  const section = h("section");
  section.setAttribute("role", "region");
  const head = h("h3", "", title);
  head.id = `switcher-${id}`;
  section.setAttribute("aria-labelledby", head.id);
  const list = h("ul", "switcher-list");
  section.append(head, list);
  return { section, list };
}

/** Open a server's folder or share in this window. */
function openThere(url: string, f: ServerFolder): void {
  if (host() === "server") void openFolderBy(() => commands.serverOpen(url, f.id));
  else void openServerFolder(url, f.id);
}

/** Show the switcher under `anchor`. */
export async function openFolderSwitcher(anchor: HTMLElement): Promise<void> {
  if (shown) return hide();
  const box = h("div", "folder-switcher");
  asDialog(box, sh.switcher, hide);
  const r = anchor.getBoundingClientRect();
  box.style.left = `${Math.max(8, r.left)}px`;
  box.style.top = `${r.bottom + 4}px`;
  // A phone's own folders are "on this phone" (ADR 0118).
  const local = can("local_folders") ? group("here", host() === "mobile" ? sh.herePhone : sh.here) : null;
  const mine = group("mine", sh.mine);
  const theirs = group("shared", sh.sharedWithMe);
  if (local) {
    // The action first and apart: it is not one of the folders below it.
    const actions = h("ul", "switcher-actions");
    actions.append(entry({ label: sh.openOther, action: true, icon: "folderOpen", run: () => void openFolderDialog() }));
    local.section.insertBefore(actions, local.list);
    const recents = await commands.recentFolders();
    const list = local.list;
    const draw = (): void => {
      const rows = visibleRecents(recents, hiddenFolderKeys(), currentFolder).map((f) => {
        const here = f.key === currentFolder;
        return entry({
          label: f.name,
          place: f.place,
          note: here ? sh.current : "",
          current: here,
          // The open folder has no ×: it is the one the person is in.
          ...(here
            ? {}
            : {
                hide: () => {
                  const at = [...list.querySelectorAll("li")].findIndex((li) => li.contains(document.activeElement));
                  hideFolder(f.key);
                  draw();
                  const rest = [...list.querySelectorAll<HTMLButtonElement>("li > button:first-child")];
                  (rest[Math.min(at, rest.length - 1)] ?? box.querySelector<HTMLButtonElement>("button"))?.focus();
                  flash("info", sh.folderHidden(f.name), sh.folderHiddenWhy);
                },
              }),
          run: () => void openFolderBy(() => commands.reopenFolder(f.key)),
        });
      });
      list.replaceChildren();
      fill(list, rows);
    };
    draw();
    box.append(local.section);
  }
  const loading = h("p", "switcher-note", sh.loading);
  box.append(mine.section, theirs.section, loading);
  opened(box);
  document.body.append(box);
  shown = box;
  box.addEventListener("keydown", (e) => walk(box, e));
  const focusFirst = (): void => (box.querySelector<HTMLButtonElement>("[aria-current] , .switcher-list button") ?? box.querySelector<HTMLButtonElement>("button"))?.focus();
  focusFirst();
  const outside = (e: PointerEvent) => {
    if (!box.contains(e.target as Node) && e.target !== anchor) {
      document.removeEventListener("pointerdown", outside, true);
      hide();
    }
  };
  document.addEventListener("pointerdown", outside, true);

  const accounts = await commands.serverAccounts();
  const list = accounts.status === "ok" ? accounts.data : [];
  const many = list.length > 1;
  for (const a of list) {
    const hostName = a.url.replace(/^https?:\/\//, "");
    // A server that did not answer is said under the groups, with a try
    // again that asks it once more (reach.ts).
    const failure = h("div", "switcher-failure");
    failure.hidden = true;
    theirs.section.append(failure);
    const fill = async (): Promise<void> => {
      const folders = await attempt(failure, () => commands.serverFolders(a.url), { other: errorSentence, retry: () => void fill() });
      if (folders.status !== "ok") return;
      const mineRows: HTMLLIElement[] = [];
      const theirRows: HTMLLIElement[] = [];
      for (const f of folders.data.folders) {
        const where = many ? ` · ${hostName}` : "";
        const isHere = f.name === folderName;
        if (f.owner) {
          const note = `${f.missing ? sh.gone : roleWord(f.role)}${where}`;
          theirRows.push(entry({ label: f.name, note, current: isHere, run: () => openThere(a.url, f) }));
        } else {
          mineRows.push(entry({ label: f.name, note: `${roleWord(f.role)}${where}`, current: isHere, run: () => openThere(a.url, f) }));
        }
      }
      // Each server adds its rows to the groups; the cap is of the group.
      addRows(mine.list, mineRows);
      addRows(theirs.list, theirRows);
      theirs.list.querySelector(".switcher-none")?.remove();
    };
    await fill();
  }
  loading.remove();
  if (mine.list.children.length === 0 && list.length === 0) mine.section.remove();
  if (theirs.list.children.length === 0) theirs.list.append(h("li", "switcher-note switcher-none", "—"));
  const tail = h("ul", "switcher-actions switcher-foot");
  // In a browser, the server's own list of folders, where a new one is
  // made; on the desktop, the servers signed in to.
  if (can("local_folders")) tail.append(entry({ label: sh.manage, note: serverStrings().section, action: true, icon: "gear", run: () => openSettingsSection("servers") }));
  else tail.append(entry({ label: sh.openOther, action: true, icon: "folderOpen", run: () => void openFolderDialog() }));
  box.append(tail);
  if (!box.contains(document.activeElement)) box.querySelector<HTMLButtonElement>("button")?.focus();
}
