// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The settings' "Offline" section of the window in a browser (ADR 0092
// items 3, 6, 7 and 9), in the place the desktop's "Sync" section takes: to
// make the folder shown available offline on this device — the space it will
// take said first, the browser asked to keep it and its answer said, the
// attachments' choice — and, once kept, what it keeps, what waits to go up,
// the sync's own view (its state, the conflicts and their difference, the
// files left out, what crossed — the desktop's, `dialogs/syncView.ts`), and
// how to delete the copy from this device.

import { listen } from "@tauri-apps/api/event";
import { commands, type SyncStatus } from "../../bindings";
import { ask } from "../../dialog";
import { drawSyncOn } from "../../dialogs/syncView";
import { h } from "../../dom";
import { folderName } from "../../folder";
import { bytes } from "../strings";
import { type Kept } from "./store";
import { offline, Offline, type Preview } from "./manager";
import { o } from "./strings";

/** The folder the tab shows: the bridge keeps it in the address. */
const currentFolderId = (): string | null => new URLSearchParams(location.search).get("folder");

type Item = (title: string, desc: string, control: HTMLElement | null) => HTMLElement;

function btn(label: string, kind: "" | "primary" | "quiet" | "danger", run: () => void): HTMLButtonElement {
  const b = h("button", `btn ${kind}`.trim(), label);
  b.type = "button";
  b.addEventListener("click", run);
  return b;
}

/** A line that says what happened, announced. */
function line(text = ""): HTMLElement {
  const p = h("p", "sync-sentence", text);
  p.setAttribute("role", "status");
  return p;
}

function problemText(st: SyncStatus): string | null {
  if (st.problem === "storage_full") return o().fullShort;
  return st.message;
}

function when(stamp: string | null): string {
  if (!stamp) return o().never;
  const d = new Date(stamp);
  const text = Number.isNaN(d.getTime()) ? stamp : d.toLocaleString(document.documentElement.lang.startsWith("pt") ? "pt-BR" : "en", { dateStyle: "short", timeStyle: "short" });
  return o().last(text);
}

/** The section's body. */
export function offlineBody(item: Item): HTMLElement {
  const box = h("div", "sync offline");
  const painters = new Set<() => void>();
  let timer = 0;
  const paint = (): void => {
    void draw(box, item, painters, again);
  };
  // What a status or the worker says redraws the section, a moment after
  // the last, and never under a field being typed in.
  const again = (): void => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!box.isConnected) return;
      if (box.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement) return;
      paint();
    }, 250);
  };
  void listen<SyncStatus>("sync-status", (e) => {
    const id = currentFolderId();
    const kept = id ? offline.keptFolder(id) : undefined;
    if (!box.isConnected) return;
    if (!kept || e.payload.key === kept.key || e.payload.folder === id) again();
  });
  addEventListener("verso:offline-worker", () => {
    if (box.isConnected) again();
  });
  paint();
  return box;
}

async function draw(box: HTMLElement, item: Item, painters: Set<() => void>, again: () => void): Promise<void> {
  const s = o();
  const id = currentFolderId();
  box.replaceChildren();
  painters.clear();
  if (!id) {
    box.append(line(s.notKept));
    return;
  }
  if (!Offline.supported() || !offline.available) {
    box.append(item(s.label, s.noStorage, null));
    return;
  }
  const kept = offline.keptFolder(id);
  if (!kept) {
    drawOff(box, item, id, again);
    return;
  }
  await drawOn(box, item, kept, painters, again);
}

// ---- Not kept ---------------------------------------------------------------

function drawOff(box: HTMLElement, item: Item, id: string, again: () => void): void {
  const s = o();
  const said = line();
  const panel = h("div", "sync-go");
  const turn = btn(s.turnOn, "primary", () => void preview(panel, said, turn, id, again, item));
  if (!window.isSecureContext) {
    // ADR 0092 item 2: over plain HTTP there is no service worker, so the
    // page cannot open offline; the setting says so and why.
    turn.disabled = true;
    box.append(item(s.label, s.labelDesc, turn), h("p", "sync-problem", s.needsHttps));
    return;
  }
  box.append(item(s.label, s.labelDesc, turn), said, panel);
}

async function preview(panel: HTMLElement, said: HTMLElement, turn: HTMLButtonElement, id: string, again: () => void, item: Item): Promise<void> {
  const s = o();
  turn.disabled = true;
  said.textContent = s.looking;
  panel.replaceChildren();
  let p: Preview;
  try {
    p = await offline.preview(id);
  } catch (e) {
    said.textContent = (e as { message?: string } | null)?.message ?? s.notHere;
    turn.disabled = false;
    return;
  }
  said.textContent = "";
  // What it will take, said before anything is kept (ADR 0092 item 3).
  const lines: string[] = [s.space(p.notes.bytes, p.notes.files, p.attachments.bytes, p.attachments.files)];
  if (p.shell !== null) lines.push(s.window(bytes(p.shell)));
  if (p.quota !== null && p.usage !== null) lines.push(s.quota(bytes(p.usage), bytes(p.quota)));
  panel.append(...lines.map((t) => h("p", "sync-space", t)));
  const mode = h("select");
  mode.setAttribute("aria-label", s.attachments);
  for (const [value, label] of [["opened", s.opened], ["all", s.all]] as const) {
    const opt = h("option", "", label);
    opt.value = value;
    mode.append(opt);
  }
  panel.append(item(s.attachments, s.attachmentsDesc, mode));
  const verdict = h("p", "sync-problem");
  verdict.setAttribute("role", "alert");
  const confirm = btn(s.confirm, "primary", () => {
    confirm.disabled = true;
    said.textContent = s.looking;
    void offline
      .turnOn(id, folderName, mode.value === "all" ? "all" : "opened")
      .then(() => again())
      .catch((e: unknown) => {
        confirm.disabled = false;
        said.textContent = (e as { message?: string } | null)?.message ?? s.fullShort;
      });
  });
  const cancel = btn(s.cancel, "quiet", () => {
    panel.replaceChildren();
    said.textContent = "";
    turn.disabled = false;
  });
  const fit = (): void => {
    const free = p.quota !== null && p.usage !== null ? p.quota - p.usage : null;
    const need = p.notes.bytes + (mode.value === "all" ? p.attachments.bytes : 0) + (p.shell ?? 0);
    const tooBig = free !== null && need > free;
    verdict.textContent = tooBig ? s.tooBig(bytes(need), bytes(Math.max(0, free))) : "";
    confirm.disabled = tooBig;
  };
  mode.addEventListener("change", fit);
  fit();
  const row = h("div", "sync-buttons");
  row.append(confirm, cancel);
  panel.append(verdict, row);
  confirm.focus();
}

// ---- Kept -------------------------------------------------------------------

async function drawOn(box: HTMLElement, item: Item, kept: Kept, painters: Set<() => void>, again: () => void): Promise<void> {
  const s = o();
  const [usage, waiting] = await Promise.all([offline.usage(kept.id), offline.waitingCount(kept.id)]);
  const top = h("header", "sync-top");
  const sentence = line(`${s.kept(usage.files, bytes(usage.bytes))} ${s.waiting(waiting)}`);
  sentence.dataset["tone"] = waiting > 0 ? "warn" : "quiet";
  top.append(sentence, h("p", "sync-meta", when(usage.last)));
  const turnOff = btn(s.turnOff, "quiet", () => {
    void offline.waitingCount(kept.id).then((n) =>
      ask(s.turnOffAsk(n), { yes: s.turnOffYes, no: s.cancel }).then(async (yes) => {
        if (!yes) return;
        await offline.turnOff(kept.id);
        again();
      }),
    );
  });
  top.append(item(s.label, s.labelDesc, turnOff));
  box.append(top);

  // The window's own code (the service worker), and how the browser treats
  // the copy (ADR 0092 items 2 and 3).
  const notes = h("div", "sync-notes");
  const worker = offline.progress();
  if (!Offline.workerPossible()) notes.append(h("p", "sync-problem", s.needsHttps));
  else if (worker.failed) notes.append(h("p", "sync-problem", s.workerFailed(worker.failed)));
  else notes.append(h("p", "sync-meta", worker.ready ? s.ready : worker.total > 0 ? s.progress(worker.done, worker.total) : s.notReady));
  const persisted = (await navigator.storage?.persisted?.().catch(() => undefined)) ?? null;
  notes.append(h("p", "sync-meta", persisted === true ? s.persistGranted : persisted === false ? s.persistDenied : s.persistUnknown));
  notes.append(h("p", "sync-meta", s.encryption));
  box.append(notes);

  // Attachments, and the device's name for a conflict's copy.
  const mode = h("select");
  mode.setAttribute("aria-label", s.attachments);
  for (const [value, label] of [["opened", s.opened], ["all", s.all]] as const) {
    const opt = h("option", "", label);
    opt.value = value;
    opt.selected = kept.attachments === value;
    mode.append(opt);
  }
  mode.addEventListener("change", () => void offline.setAttachments(kept.id, mode.value === "all" ? "all" : "opened"));
  const device = h("input");
  device.type = "text";
  device.autocomplete = "off";
  device.spellcheck = false;
  device.value = offline.deviceName();
  device.addEventListener("keydown", (e) => e.stopPropagation());
  device.addEventListener("change", () => void offline.setDeviceName(device.value));
  box.append(item(s.attachments, s.attachmentsDesc, mode), item(DEVICE_TITLE(), DEVICE_DESC(), device));

  // The sync's own view: its state, the conflicts and their difference, the
  // files left out and why, what crossed.
  const view = h("div", "sync-on");
  box.append(view);
  const refresh = async (): Promise<void> => {
    const r = await commands.folderSync();
    if (r.status === "ok") show(r.data);
  };
  const show = (st: SyncStatus): void => {
    if (!view.isConnected) return;
    view.replaceChildren();
    drawSyncOn(view, st, refresh, problemText, () => undefined, { turnOff: false });
  };
  painters.add(() => void refresh());
  await refresh();
}

const DEVICE_TITLE = (): string => (document.documentElement.lang.startsWith("pt") ? "Nome deste aparelho" : "This device's name");
const DEVICE_DESC = (): string =>
  document.documentElement.lang.startsWith("pt")
    ? "Aparece no nome da cópia que a sincronização faz quando uma nota mudou dos dois lados."
    : "It appears in the name of the copy sync makes when a note changed on both sides.";
