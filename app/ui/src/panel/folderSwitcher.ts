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
import { currentFolder, folderName } from "../folder";
import { openFolderBy, openFolderDialog } from "../open";
import { roleWord, sh } from "../shareStrings";

let shown: HTMLElement | null = null;

function hide(): void {
  if (!shown) return;
  const el = shown;
  shown = null;
  el.remove();
  closed(el);
}

function entry(label: string, note: string, current: boolean, run: () => void): HTMLLIElement {
  const li = h("li");
  const b = h("button");
  b.type = "button";
  b.append(h("span", "", label));
  if (note) b.append(h("small", "", note));
  if (current) b.setAttribute("aria-current", "true");
  b.addEventListener("click", () => {
    hide();
    run();
  });
  li.append(b);
  return li;
}

function group(id: string, title: string): { section: HTMLElement; list: HTMLUListElement } {
  const section = h("section");
  section.setAttribute("role", "region");
  const head = h("h3", "", title);
  head.id = `switcher-${id}`;
  section.setAttribute("aria-labelledby", head.id);
  const list = h("ul");
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
  const local = can("local_folders") ? group("here", sh.here) : null;
  const mine = group("mine", sh.mine);
  const theirs = group("shared", sh.sharedWithMe);
  if (local) {
    for (const f of await commands.recentFolders()) {
      local.list.append(entry(f.name, f.key === currentFolder ? sh.current : "", f.key === currentFolder, () => void openFolderBy(() => commands.reopenFolder(f.key))));
    }
    local.list.append(entry(sh.openOther, "", false, () => void openFolderDialog()));
    box.append(local.section);
  }
  const loading = h("p", "switcher-note", sh.loading);
  box.append(mine.section, theirs.section, loading);
  opened(box);
  document.body.append(box);
  shown = box;
  box.querySelector<HTMLButtonElement>("button")?.focus();
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
    const folders = await commands.serverFolders(a.url);
    if (folders.status !== "ok") {
      theirs.section.append(h("p", "switcher-note", sh.unreachable(hostName)));
      continue;
    }
    for (const f of folders.data) {
      const where = many ? ` · ${hostName}` : "";
      const isHere = f.name === folderName;
      if (f.owner) {
        const note = `${f.missing ? sh.gone : roleWord(f.role)}${where}`;
        theirs.list.append(entry(f.name, note, isHere, () => openThere(a.url, f)));
      } else {
        mine.list.append(entry(f.name, `${roleWord(f.role)}${where}`, isHere, () => openThere(a.url, f)));
      }
    }
  }
  loading.remove();
  if (mine.list.children.length === 0 && list.length === 0) mine.section.remove();
  if (theirs.list.children.length === 0) theirs.list.append(h("li", "switcher-note", "—"));
  const tail = h("ul");
  // In a browser, the server's own list of folders, where a new one is
  // made; on the desktop, the servers signed in to.
  if (can("local_folders")) tail.append(entry(sh.manage, serverStrings().section, false, () => openSettingsSection("servers")));
  else tail.append(entry(sh.openOther, "", false, () => void openFolderDialog()));
  box.append(tail);
  if (!box.contains(document.activeElement)) box.querySelector<HTMLButtonElement>("button")?.focus();
}
