// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* ---------- A server's folder picked in the app: its copy here ----------
 * The maintainer, 2026-11-15, after a folder opened from his UniVerso on
 * the phone would not open again in airplane mode: on every app, picking a
 * server's folder (the folder switcher, Settings › Servers "Abrir aqui")
 * downloads the whole folder into a folder of this device, binds it to the
 * server's with sync (ADR 0079) and opens that copy — offline too. Where
 * it goes is asked now, with the folder's size: inside the app or the
 * phone's Documents on Android, the app's Documents on iOS, a folder the
 * person chooses on a desktop (the host names each place; no path
 * crosses, src-tauri src/server_copy.rs). Once a copy is here the pick
 * opens it with nothing asked. The window on the server alone, online
 * only, is the other way: "Abrir só no servidor, sem cópia". */

import { listen } from "@tauri-apps/api/event";
import { commands, type ContractError, type CopyPlace, type ServerCopyPlan, type SyncStatus } from "../bindings";
import { host } from "../can";
import { h } from "../dom";
import { errorSentence } from "../errors";
import { currentFolder } from "../folder";
import { openFolderBy } from "../open";
import { busy, clearFailure, sayFailure } from "../reach";
import { asDialog, closed, opened } from "./a11y";
import { openServerFolder } from "./servers";
import { sc } from "./serverCopyStrings";
import { size, stateText } from "./sync";

/** A server's folder as a row names it. */
export type PickedFolder = { id: string; name: string };

/** Pick `f` of the server at `url` in this window: its copy here opens at
 *  once when there is one; else the question is put. Answers whether a
 *  folder opened without asking (`said` hears a failure of that). */
export async function pickServerFolder(url: string, f: PickedFolder, said: ((e: ContractError) => void) | null = null): Promise<boolean> {
  let none = false;
  const shown = await openFolderBy(
    async () => {
      const r = await commands.serverCopyOpen(url, f.id);
      if (r.status === "ok" && !r.data) none = true;
      return r;
    },
    false,
    said,
  );
  if (shown || !none) return shown;
  askServerCopy(url, f);
  return false;
}

let open: HTMLElement | null = null;

/** The question: the size, where the copy goes, download and open — or
 *  open on the server alone. Then the download's progress, in place. */
export function askServerCopy(url: string, f: PickedFolder): void {
  if (open) return;
  const shade = h("div", "confirm");
  const box = h("div", "confirm-box copy-box");
  const title = h("h2", "", sc.title(f.name));
  title.id = "copy-title";
  const lede = h("p", "copy-lede", sc.lede);
  const sizeLine = h("p", "copy-size", sc.measuring);
  sizeLine.setAttribute("role", "status");
  const where = h("div", "copy-where");
  const access = h("p", "copy-access");
  access.hidden = true;
  access.setAttribute("role", "status");
  const failure = h("div", "srv-failure");
  failure.hidden = true;
  const progress = h("div", "copy-progress");
  progress.hidden = true;
  // The download's progress, shown once the question is answered.
  const bar = h("progress", "copy-bar");
  bar.setAttribute("aria-label", sc.progressLabel);
  const said = h("p", "copy-said");
  said.setAttribute("role", "status");
  const end = button("save", sc.close, () => close());
  const endRow = h("div", "confirm-actions");
  endRow.append(end);
  progress.append(said, bar, endRow);
  const cancel = button("ghost", sc.cancel, () => close());
  const remote = button("ghost", sc.remoteOnly, () => onServerOnly());
  remote.setAttribute("aria-describedby", "copy-remote-note");
  const remoteNote = h("p", "copy-note", sc.remoteOnlyNote);
  remoteNote.id = "copy-remote-note";
  // Named for this device from the start — a desktop chooses where in the
  // system's dialog — so that while the folder is measured, or could not
  // be, the button is there, disabled, with the words it will have.
  const go = button("save", host() === "mobile" ? sc.download : sc.chooseAndDownload, () => void download());
  go.disabled = true;
  const actions = h("div", "confirm-actions");
  actions.append(cancel, remote, go);
  box.append(title, lede, sizeLine, where, access, failure, actions, remoteNote, progress);
  shade.append(box);
  open = shade;
  let plan: ServerCopyPlan | null = null;
  let place: CopyPlace | null = null;
  let stop: (() => void) | null = null;

  function close(): void {
    stop?.();
    removeEventListener("focus", backFromAndroid);
    document.removeEventListener("visibilitychange", backFromAndroid);
    closed(box);
    shade.remove();
    open = null;
  }
  asDialog(box, sc.title(f.name), close, title.id);
  shade.addEventListener("mousedown", (e) => {
    if (e.target === shade) {
      e.preventDefault();
      close();
    }
  });

  const measure = (): void => {
    clearFailure(failure);
    sizeLine.textContent = sc.measuring;
    go.disabled = true;
    void commands.serverCopyPlan(url, f.id).then((r) => {
      if (!open) return;
      if (r.status !== "ok") {
        sizeLine.textContent = "";
        // Out of reach, the window on the server would fail as well: not
        // offered as if it worked, until a try reaches the server again.
        remote.disabled = r.error.kind === "unreachable";
        sayFailure(failure, r.error, measure, errorSentence);
        return;
      }
      remote.disabled = false;
      plan = r.data;
      sizeLine.textContent = plan.files === 0 ? sc.sizeEmpty : sc.size(plan.files, size(plan.bytes));
      drawPlaces(plan.places);
      go.disabled = false;
    });
  };

  /** One place says itself; two are a choice, the first chosen. */
  function drawPlaces(places: CopyPlace[]): void {
    where.replaceChildren();
    place = places[0] ?? null;
    go.textContent = place === "choose" ? sc.chooseAndDownload : sc.download;
    if (places.length === 1) {
      const said = place === "documents" ? sc.documents : place === "choose" ? sc.choose : "";
      if (said) where.append(h("p", "copy-note", said));
      return;
    }
    const set = h("fieldset", "copy-places");
    set.append(h("legend", "", sc.where));
    for (const p of places) {
      const id = `copy-place-${p}`;
      const label = h("label", "copy-place");
      label.htmlFor = id;
      const radio = h("input");
      radio.type = "radio";
      radio.name = "copy-place";
      radio.id = id;
      radio.value = p;
      radio.checked = p === place;
      radio.addEventListener("change", () => {
        place = p;
        access.hidden = true;
      });
      const text = h("span", "copy-place-text");
      text.append(h("span", "copy-place-name", p === "phone" ? sc.phone : sc.inApp), h("small", "copy-note", p === "phone" ? sc.phoneNote : sc.inAppNote));
      label.append(radio, text);
      set.append(label);
    }
    where.append(set);
  }

  /** The phone's Documents needs Android's access to all files: asked
   *  first, and asked again when the window comes back from its page. */
  async function mayKeepOnPhone(): Promise<boolean> {
    const r = await commands.sharedStorage("");
    if (r.status !== "ok") {
      sayFailure(failure, r.error, null, errorSentence);
      return false;
    }
    if (r.data.access) return true;
    access.hidden = false;
    access.replaceChildren(
      h("span", "", sc.needsAccess),
      button("ghost copy-allow", sc.allow, () => void commands.sharedStorageAccess().then((a) => a.status !== "ok" && sayFailure(failure, a.error, null, errorSentence))),
    );
    return false;
  }
  function backFromAndroid(): void {
    if (!open || access.hidden || document.visibilityState !== "visible") return;
    void commands.sharedStorage("").then((r) => {
      if (r.status === "ok" && r.data.access) access.textContent = sc.accessGiven;
    });
  }
  addEventListener("focus", backFromAndroid);
  document.addEventListener("visibilitychange", backFromAndroid);

  async function download(): Promise<void> {
    if (!plan || !place) return;
    clearFailure(failure);
    if (place === "phone" && !(await mayKeepOnPhone())) return;
    busy(go, true);
    remote.disabled = true;
    const total = plan.files;
    // What the copy's sync says from its first status on, heard before the
    // copy is made: its key is known once it is.
    const heard = new Map<string, SyncStatus>();
    let key: string | null = null;
    const unlisten = listen<SyncStatus>("sync-status", (e) => {
      heard.set(e.payload.key, e.payload);
      if (e.payload.key === key) paintProgress(e.payload, total);
    });
    stop = () => void unlisten.then((u) => u());
    let failed = false;
    const shown = await openFolderBy(() => commands.serverCopyMake(url, f.id, place as CopyPlace), false, (e) => {
      failed = true;
      sayFailure(failure, e, () => void download(), errorSentence);
    });
    busy(go, false);
    remote.disabled = false;
    if (!shown) {
      stop();
      stop = null;
      if (!failed) go.focus();
      return;
    }
    key = currentFolder;
    // The question is answered: the dialog shows the download.
    for (const el of [lede, where, access, actions, remoteNote]) el.hidden = true;
    progress.hidden = false;
    const first = heard.get(key);
    paintProgress(first ?? null, total);
    if (!first) {
      const now = await commands.folderSync();
      if (now.status === "ok" && now.data.key === key) paintProgress(now.data, total);
    }
  }

  function paintProgress(st: SyncStatus | null, total: number): void {
    bar.max = Math.max(1, total);
    if (!st || st.state === "starting") {
      said.textContent = sc.starting;
      bar.removeAttribute("value");
    } else if (st.state === "synced") {
      said.textContent = sc.done(total);
      bar.value = bar.max;
      end.textContent = sc.ok;
    } else if (st.state === "offline") {
      said.textContent = sc.offline;
    } else if (st.state === "error" || st.state === "off") {
      said.textContent = sc.stopped(stateText(st));
    } else if (st.receiving === 0) {
      // A pass comparing, before it says what it will bring.
      said.textContent = sc.starting;
      bar.removeAttribute("value");
    } else {
      const done = Math.max(0, Math.min(total, total - st.receiving));
      said.textContent = sc.progress(done, total);
      bar.value = done;
    }
    if (!box.contains(document.activeElement)) end.focus();
  }

  function onServerOnly(): void {
    busy(remote, true);
    void openServerFolder(url, f.id, false, (e) => sayFailure(failure, e, onServerOnly, errorSentence)).then((done) => {
      busy(remote, false);
      if (done) close();
    });
  }

  document.body.append(shade);
  opened(box);
  cancel.focus();
  measure();
}

function button(cls: string, text: string, run: () => void): HTMLButtonElement {
  const b = h("button", cls, text);
  b.type = "button";
  b.addEventListener("click", run);
  return b;
}
