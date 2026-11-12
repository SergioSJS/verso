// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* ---------- A folder of the phone's shared storage ----------
 * ADR 0118 item 4.4 (in v1 since 2026-11-12): on a phone, "Open another
 * folder" walks the phone's shared storage — the one other apps see —
 * instead of the system's folder picker (whose answer is no path). The
 * host lists the folders at a place given relative to the storage's top
 * (src-tauri src/storage.rs: nothing absolute crosses) and opens the one
 * chosen; without Android's "All files access" it says so and opens
 * Android's page for it, and asks again when the window comes back. */

import { commands } from "../bindings";
import { promptText } from "../dialog";
import { fail } from "../errors";
import { icon } from "../icons";
import { openFolderBy } from "../open";
import { st } from "../screen/strings";
import { t } from "../strings";
import { asDialog, closed, opened } from "./a11y";

let open: HTMLElement | null = null;

/** The dialog over the window, at the storage's top. */
export function openSharedFolderDialog(): void {
  if (open) return;
  const shade = document.createElement("div");
  shade.className = "confirm";
  const box = document.createElement("div");
  box.className = "confirm-box storage-box";
  const title = document.createElement("h2");
  title.id = "storage-title";
  title.textContent = st.storageTitle;
  const about = document.createElement("p");
  about.textContent = st.storageAbout;
  const body = document.createElement("div");
  body.className = "storage-body";
  box.append(title, about, body);
  shade.append(box);
  open = shade;
  let path: string[] = [];

  const close = () => {
    removeEventListener("focus", again);
    document.removeEventListener("visibilitychange", again);
    closed(box);
    shade.remove();
    open = null;
  };
  asDialog(box, st.storageTitle, close, title.id);
  shade.addEventListener("mousedown", (e) => {
    if (e.target === shade) {
      e.preventDefault();
      close();
    }
  });

  const actions = (...buttons: HTMLButtonElement[]) => {
    const row = document.createElement("div");
    row.className = "confirm-actions";
    row.append(...buttons);
    return row;
  };
  const plain = (cls: string, text: string, run: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = text;
    b.addEventListener("click", run);
    return b;
  };
  const cancel = () => plain("ghost", t.cancel, close);

  const openHere = async (make: string | null) => {
    const at = path.join("/");
    close();
    await openFolderBy(() => commands.openSharedFolder(at, make));
  };

  const paint = async () => {
    const r = await commands.sharedStorage(path.join("/"));
    if (!open) return;
    body.replaceChildren();
    if (r.status !== "ok") {
      fail(r.error);
      // A place gone meanwhile: back to the top.
      if (path.length > 0) {
        path = [];
        return void paint();
      }
      body.append(actions(cancel()));
      return;
    }
    if (!r.data.access) {
      const needs = document.createElement("p");
      needs.textContent = st.storageNeeds;
      const allow = plain("save", st.storageAllow, () => {
        void commands.sharedStorageAccess().then((a) => a.status !== "ok" && fail(a.error));
      });
      body.append(needs, actions(cancel(), allow));
      return;
    }
    const crumbs = document.createElement("nav");
    crumbs.className = "storage-crumbs";
    crumbs.setAttribute("aria-label", st.storageTitle);
    [st.storageTop, ...path].forEach((name, i) => {
      if (i > 0) crumbs.append(" › ");
      const c = plain("storage-crumb", name, () => {
        path = path.slice(0, i);
        void paint();
      });
      if (i === path.length) c.setAttribute("aria-current", "location");
      crumbs.append(c);
    });
    const list = document.createElement("ul");
    list.className = "storage-list";
    if (path.length > 0) {
      const li = document.createElement("li");
      const up = plain("storage-row", st.storageUp, () => {
        path = path.slice(0, -1);
        void paint();
      });
      up.prepend(icon("chevronUp"));
      li.append(up);
      list.append(li);
    }
    for (const name of r.data.folders) {
      const li = document.createElement("li");
      const row = plain("storage-row", name, () => {
        path = [...path, name];
        void paint();
      });
      row.prepend(icon("folder"));
      li.append(row);
      list.append(li);
    }
    if (r.data.folders.length === 0) {
      const none = document.createElement("li");
      none.className = "storage-empty";
      none.textContent = st.storageEmpty;
      list.append(none);
    }
    const make = plain("ghost", st.storageNew, () => {
      void promptText(st.storageNewName, "", false, { yes: st.storageMake, no: t.cancel }).then((name) => {
        const clean = name?.trim();
        if (clean) void openHere(clean);
      });
    });
    const here = plain("save", path.length > 0 ? st.storageOpenHere(path[path.length - 1]!) : st.storageOpen, () => void openHere(null));
    // The top is the whole storage, not a folder of notes.
    here.disabled = path.length === 0;
    if (path.length === 0) here.title = st.storagePickInside;
    body.append(crumbs, list, actions(cancel(), make, here));
  };

  // Back from Android's page for the access: asked again.
  const again = () => {
    if (open && document.visibilityState === "visible") void paint();
  };
  addEventListener("focus", again);
  document.addEventListener("visibilitychange", again);

  document.body.append(shade);
  opened(box);
  void paint().then(() => box.querySelector<HTMLElement>("button:not([disabled])")?.focus());
}
