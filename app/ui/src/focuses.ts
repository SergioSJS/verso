// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands, type Focus, type FocusesSummary, type ReadOnlyReasonCode } from "./bindings";
import { can, loadCan } from "./can";
import { ask, promptText } from "./dialog";
import { ui } from "./dom";
import { isTransport } from "./errorKinds";
import { fail } from "./errors";
import { askSyncAfterDownload, downloadFocusesFile, folderFlag } from "./focusesDownload";
import { currentFolder } from "./folder";
import { notesHeadingReset, notesHeadingText, panel } from "./main";
import { saveSettings, settings } from "./settings";
import { t } from "./strings";
import { listAll } from "./tree/tree";

/* ---------- Focuses (ADR 0062) ---------- */
export type FocusWithOrigin = Focus & { isFromMakeMd?: boolean; isLocal?: boolean };
export let focusesSummary: FocusesSummary | null = null;
export function setFocusesSummary(value: FocusesSummary | null): void {
  focusesSummary = value;
}
export let focusesList: FocusWithOrigin[] = [];
export let activeFocusName: string = t.homeFocus;
export let activeFocusItem: FocusWithOrigin | null = null;
export let activeFocusIndex: number = -1;
export let focusesConflictBanner: string | null = null;

export function isHomeFocusName(name: string): boolean {
  return name === t.homeFocus || name === "Home" || name === "Início";
}

export function getActiveFocus(): FocusWithOrigin | null {
  if (activeFocusItem && focusesList.includes(activeFocusItem)) {
    return activeFocusItem;
  }
  if (activeFocusIndex >= 0 && activeFocusIndex < focusesList.length) {
    activeFocusItem = focusesList[activeFocusIndex] ?? null;
    return activeFocusItem;
  }
  return null;
}

export function isHomeActive(): boolean {
  const af = getActiveFocus();
  return !af || isHomeFocusName(af.name);
}

export function formatReadOnlyReason(code?: ReadOnlyReasonCode | null, reason?: string | null): string {
  if (code === "cloud_placeholder") return t.readOnlyCloudPlaceholder;
  if (code === "invalid_json") return t.readOnlyInvalidJson;
  if (code === "unknown_format") return t.readOnlyUnknownFormat;
  return reason ?? t.readOnlyFocuses;
}

export function getDisplayFocuses(): FocusWithOrigin[] {
  const homeItem = focusesList.find((f) => isHomeFocusName(f.name));
  const otherItems = focusesList.filter((f) => !isHomeFocusName(f.name));
  const virtualHome: FocusWithOrigin = homeItem ?? {
    name: t.homeFocus,
    paths: ["/"],
    sticker: "ui//home",
    isFromMakeMd: false,
  };
  return [virtualHome, ...otherItems];
}

/** Tell the host whether this folder's focuses sync. Only the desktop app
 *  keeps that: a phone of it (a web window) may not run the command, and the
 *  host logs a refusal (ADR 0096 item 12). Waits for the side's answer, so
 *  that the desktop's defaults never stand in for a phone's. */
export async function tellHostSyncFocuses(value: boolean): Promise<void> {
  await loadCan();
  if (can("local_folders")) await commands.setSyncFocuses(value);
}

export function getSyncFocuses(): boolean {
  if (!settings.syncFocuses || typeof settings.syncFocuses !== "object") settings.syncFocuses = {};
  return settings.syncFocuses[currentFolder] ?? false;
}

export function setSyncFocuses(value: boolean): void {
  if (!settings.syncFocuses || typeof settings.syncFocuses !== "object") settings.syncFocuses = {};
  settings.syncFocuses[currentFolder] = value;
  saveSettings();
  void tellHostSyncFocuses(value);
  try {
    if (typeof panel !== "undefined" && panel.current === "focuses") panel.refresh();
  } catch {
    // Panel not yet initialized.
  }
}

export function isSyncFocusesAsked(): boolean {
  if (!settings.syncFocusesAsked || typeof settings.syncFocusesAsked !== "object") settings.syncFocusesAsked = {};
  return settings.syncFocusesAsked[currentFolder] ?? false;
}

export function setSyncFocusesAsked(value: boolean): void {
  if (!settings.syncFocusesAsked || typeof settings.syncFocusesAsked !== "object") settings.syncFocusesAsked = {};
  settings.syncFocusesAsked[currentFolder] = value;
  saveSettings();
}

export function getLocalFocuses(): Focus[] {
  if (!settings.localFocuses || typeof settings.localFocuses !== "object") settings.localFocuses = {};
  return settings.localFocuses[currentFolder] ?? [];
}

export function setLocalFocuses(list: Focus[]): void {
  if (!settings.localFocuses || typeof settings.localFocuses !== "object") settings.localFocuses = {};
  settings.localFocuses[currentFolder] = list;
  saveSettings();
}

export async function promptSyncFocusesIfNeeded(): Promise<boolean> {
  if (!getSyncFocuses() && !isSyncFocusesAsked() && focusesSummary?.has_file && focusesSummary.format_known) {
    const ok = await ask(t.syncFocusesWarning, { yes: t.syncFocusesEnable, no: t.syncFocusesOffInfo });
    setSyncFocusesAsked(true);
    if (ok) {
      setSyncFocuses(true);
      await tellHostSyncFocuses(true);
      const local = getLocalFocuses();
      if (local.length > 0) {
        const migrate = await ask(t.syncLocalFocusesQuestion, { yes: t.syncFocusesEnable, no: t.syncFocusesOffInfo });
        if (migrate) {
          const r = await commands.getFocuses();
          if (r.status === "ok") focusesSummary = r.data;
          const diskFocuses = focusesSummary?.focuses ?? [];
          const toAdd = local.filter((lf) => !diskFocuses.some((df) => df.name.trim().toLowerCase() === lf.name.trim().toLowerCase()));
          const toSave = [...diskFocuses, ...toAdd];
          const base = diskFocuses;
          const res = await commands.setFocuses(toSave, focusesSummary?.stamp ?? null, base);
          if (res.status === "ok") {
            setLocalFocuses([]);
            focusesSummary = res.data;
          }
        }
      }
      await loadFocuses(true);
      return true;
    } else {
      setSyncFocuses(false);
      await tellHostSyncFocuses(false);
      return false;
    }
  }
  return getSyncFocuses();
}

export function updateTreeHeading(): void {
  const activeFocus = getActiveFocus();
  if (!activeFocus || isHomeFocusName(activeFocus.name)) {
    notesHeadingText.textContent = t.notes;
    notesHeadingReset.style.display = "none";
  } else {
    notesHeadingText.textContent = `${t.notes} · ${activeFocus.name}`;
    notesHeadingReset.style.display = "";
  }
}

export async function loadFocuses(forceReload = false): Promise<void> {
  const r = await commands.getFocuses();
  if (r.status === "ok") {
    focusesSummary = r.data;
  }
  const isSync = getSyncFocuses();
  const hasFile = focusesSummary?.has_file ?? false;
  const isKnown = focusesSummary?.format_known ?? false;

  void tellHostSyncFocuses(isSync);

  const local = getLocalFocuses();

  if (hasFile && isSync && isKnown) {
    const diskFocuses: FocusWithOrigin[] = (focusesSummary?.focuses ?? []).map((f) => ({
      ...f,
      paths: [...f.paths],
      isFromMakeMd: true,
      isLocal: false,
    }));
    const localFocuses: FocusWithOrigin[] = local
      .filter((lf) => !diskFocuses.some((df) => df.name.trim().toLowerCase() === lf.name.trim().toLowerCase()))
      .map((f) => ({ ...f, paths: [...f.paths], isFromMakeMd: false, isLocal: true }));
    focusesList = [...diskFocuses, ...localFocuses];
  } else if (hasFile) {
    // Read-only make.md focuses beside Verso local focuses (ADR 0062 D5)
    const diskFocuses = (focusesSummary?.focuses ?? []).map((f) => ({ ...f, paths: [...f.paths], isFromMakeMd: true, isLocal: false }));
    const versoFocuses = local
      .filter((lf) => !diskFocuses.some((df) => df.name.trim().toLowerCase() === lf.name.trim().toLowerCase()))
      .map((f) => ({ ...f, paths: [...f.paths], isFromMakeMd: false, isLocal: true }));
    focusesList = [...diskFocuses, ...versoFocuses];
  } else {
    // No waypoints.json: all focuses are local in Verso settings (ADR 0062 D5)
    const seen = new Set<string>();
    const uniqueLocal: Focus[] = [];
    for (const f of local) {
      const lower = f.name.trim().toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        uniqueLocal.push(f);
      }
    }
    focusesList = uniqueLocal.map((f) => ({ ...f, paths: [...f.paths], isFromMakeMd: false, isLocal: true }));
  }

  try {
    const savedActive = localStorage.getItem(`verso.activeFocus:${currentFolder}`);
    if (savedActive) {
      let parsed: { name?: string; index?: number } | null = null;
      try {
        parsed = JSON.parse(savedActive);
      } catch {
        parsed = { name: savedActive };
      }
      // The position tells same-named focuses apart; a focus make.md put
      // before it moves the position, so the name has to agree.
      const index = typeof parsed?.index === "number" ? parsed.index : -1;
      const atIndex = focusesList[index];
      if (parsed && atIndex && (parsed.name === undefined || atIndex.name === parsed.name)) {
        activeFocusItem = atIndex;
        activeFocusIndex = index;
        activeFocusName = atIndex.name;
      } else if (parsed && parsed.name && !isHomeFocusName(parsed.name)) {
        const found = focusesList.find((f) => f.name === parsed!.name);
        if (found) {
          activeFocusItem = found;
          activeFocusIndex = focusesList.indexOf(found);
          activeFocusName = found.name;
        } else {
          activeFocusItem = null;
          activeFocusIndex = -1;
          activeFocusName = t.homeFocus;
        }
      } else {
        activeFocusItem = null;
        activeFocusIndex = -1;
        activeFocusName = t.homeFocus;
      }
    } else {
      activeFocusItem = null;
      activeFocusIndex = -1;
      activeFocusName = t.homeFocus;
    }
  } catch {
    activeFocusItem = null;
    activeFocusIndex = -1;
    activeFocusName = t.homeFocus;
  }
  updateTreeHeading();
}

export async function saveFocuses(): Promise<void> {
  const isSync = getSyncFocuses();
  const hasFile = focusesSummary?.has_file ?? false;
  const isKnown = focusesSummary?.format_known ?? false;

  if (isSync && hasFile && isKnown && focusesSummary) {
    // Save to .space/waypoints.json via core (ADR 0062 D5, D6, D7)
    // Only write items that are not isLocal (i.e. file focuses)
    const written = focusesList.filter((f) => !f.isLocal && (!isHomeFocusName(f.name) || (focusesSummary?.focuses ?? []).some((df) => isHomeFocusName(df.name))));
    const toSave: Focus[] = written.map((f) => ({ name: f.name, paths: [...f.paths], sticker: f.sticker ?? null }));
    const base: Focus[] = (focusesSummary?.focuses ?? []).map((f) => ({
      name: f.name,
      paths: [...f.paths],
      sticker: f.sticker ?? null,
    }));
    const r = await commands.setFocuses(toSave, focusesSummary.stamp, base);
    if (r.status === "ok") {
      focusesSummary = r.data;
      // The objects the window holds stay the same when the file holds what
      // was written: a caller keeps the focus it just created, selected or
      // added a path to. Only a file merged with make.md's edits gets new ones.
      const saved = r.data.focuses ?? [];
      const diskItems: FocusWithOrigin[] =
        saved.length === written.length
          ? written.map((obj, i) => Object.assign(obj, { ...saved[i]!, paths: [...saved[i]!.paths], isFromMakeMd: true, isLocal: false }))
          : saved.map((f) => ({ ...f, paths: [...f.paths], isFromMakeMd: true, isLocal: false }));
      const localItems: FocusWithOrigin[] = focusesList
        .filter((f) => f.isLocal && !isHomeFocusName(f.name))
        .map((f) => ({ ...f, paths: [...f.paths], isFromMakeMd: false, isLocal: true }));
      focusesList = [...diskItems, ...localItems];
      setLocalFocuses(localItems.map((f) => ({ name: f.name, paths: [...f.paths], sticker: f.sticker ?? null })));
      focusesConflictBanner = null;
      if (activeFocusItem && !focusesList.includes(activeFocusItem)) {
        if (activeFocusIndex >= 0 && activeFocusIndex < focusesList.length) {
          activeFocusItem = focusesList[activeFocusIndex] ?? null;
        } else {
          activeFocusItem = null;
          activeFocusIndex = -1;
        }
      }
    } else {
      focusesConflictBanner = t.focusesConflict;
      await loadFocuses(true);
      panel.refresh();
      return;
    }
  } else {
    // Keep Verso focuses in configuration beside make.md's (ADR 0062 D5)
    const versoOnly: Focus[] = focusesList
      .filter((f) => !f.isFromMakeMd && !isHomeFocusName(f.name))
      .map((f) => ({ name: f.name, paths: [...f.paths], sticker: f.sticker ?? null }));
    setLocalFocuses(versoOnly);
  }
}

export async function selectFocus(focusOrName: FocusWithOrigin | string | null): Promise<void> {
  let focus: FocusWithOrigin | null = null;
  if (typeof focusOrName === "string") {
    if (!isHomeFocusName(focusOrName)) {
      focus = focusesList.find((f) => f.name === focusOrName) ?? null;
    }
  } else {
    focus = focusOrName;
  }
  if (!focus || isHomeFocusName(focus.name)) {
    activeFocusItem = null;
    activeFocusIndex = -1;
    activeFocusName = t.homeFocus;
    try {
      localStorage.removeItem(`verso.activeFocus:${currentFolder}`);
    } catch {
      // No storage.
    }
  } else {
    activeFocusItem = focus;
    activeFocusIndex = focusesList.indexOf(focus);
    activeFocusName = focus.name;
    try {
      localStorage.setItem(
        `verso.activeFocus:${currentFolder}`,
        JSON.stringify({ name: focus.name, index: activeFocusIndex }),
      );
    } catch {
      // No storage.
    }
  }
  updateTreeHeading();
  panel.refresh();
  await listAll();
}

export async function addFocusPrompt(): Promise<FocusWithOrigin | null> {
  await loadFocuses(true);
  const input = await promptText(t.focusNamePrompt, "", false, { yes: t.save, no: t.cancel });
  if (!input || !input.trim()) return null;
  const focusName = input.trim();
  if (isHomeFocusName(focusName) || focusesList.some((f) => f.name.trim().toLowerCase() === focusName.toLowerCase())) {
    ui.status.textContent = t.exists;
    return null;
  }
  await promptSyncFocusesIfNeeded();
  const isSync = getSyncFocuses() && (focusesSummary?.has_file ?? false) && (focusesSummary?.format_known ?? false);
  const newFocus: FocusWithOrigin = {
    name: focusName,
    paths: [],
    sticker: null,
    isFromMakeMd: isSync,
    isLocal: !isSync,
  };
  focusesList.push(newFocus);
  await saveFocuses();
  ui.status.textContent = t.focusCreated;
  panel.refresh();
  return newFocus;
}

export async function renameFocusPrompt(focus: FocusWithOrigin): Promise<void> {
  if (isHomeFocusName(focus.name) || (focus.isFromMakeMd && !getSyncFocuses())) return;
  const oldName = focus.name;
  const input = await promptText(t.rename, oldName, false, { yes: t.save, no: t.cancel });
  if (!input || !input.trim() || input.trim() === oldName) return;
  const newName = input.trim();
  if (isHomeFocusName(newName) || focusesList.some((f) => f !== focus && f.name.trim().toLowerCase() === newName.toLowerCase())) {
    ui.status.textContent = t.exists;
    return;
  }
  await promptSyncFocusesIfNeeded();
  focus.name = newName;
  if (activeFocusItem === focus) {
    activeFocusName = newName;
    try {
      localStorage.setItem(
        `verso.activeFocus:${currentFolder}`,
        JSON.stringify({ name: newName, index: activeFocusIndex }),
      );
    } catch {
      // No storage.
    }
    updateTreeHeading();
  }
  await saveFocuses();
  panel.refresh();
}

export async function deleteFocus(focus: FocusWithOrigin): Promise<void> {
  if (isHomeFocusName(focus.name) || (focus.isFromMakeMd && !getSyncFocuses())) return;
  const ok = await ask(t.confirmDeleteFocus(focus.name), { yes: t.deleteFocus, no: t.cancel });
  if (!ok) return;
  await promptSyncFocusesIfNeeded();
  const idx = focusesList.indexOf(focus);
  if (idx >= 0) focusesList.splice(idx, 1);
  const wasActive = activeFocusItem === focus;
  await saveFocuses();
  if (wasActive) {
    await selectFocus(null);
  }
  ui.status.textContent = t.focusDeleted;
  panel.refresh();
}

export async function moveFocusOrder(focus: FocusWithOrigin, dir: -1 | 1): Promise<void> {
  if (isHomeFocusName(focus.name) || (focus.isFromMakeMd && !getSyncFocuses())) return;
  await promptSyncFocusesIfNeeded();
  const list = focusesList.filter((f) => !isHomeFocusName(f.name));
  const i = list.indexOf(focus);
  if (i < 0) return;
  const target = i + dir;
  if (target < 0 || target >= list.length) return;
  const currentItem = list[i]!;
  const targetFocus = list[target]!;
  const fromIdx = focusesList.indexOf(currentItem);
  const toIdx = focusesList.indexOf(targetFocus);
  if (fromIdx >= 0 && toIdx >= 0) {
    focusesList[fromIdx] = targetFocus;
    focusesList[toIdx] = currentItem;
    if (activeFocusItem === focus) {
      activeFocusIndex = toIdx;
    } else if (activeFocusItem === targetFocus) {
      activeFocusIndex = fromIdx;
    }
    await saveFocuses();
    panel.refresh();
  }
}

/** The person's click on "Download now" in the banner of a focuses file that
 *  is only in the cloud (ADR 0043): the one thing that brings it down. */
/** Whether the last click on "Download now" failed: the banner keeps saying
 *  so (the status line alone is easy to miss). */
const downloadFailed = folderFlag();
export const focusesDownloadFailed = (): boolean => downloadFailed.get(currentFolder);
export async function downloadFocusesNow(): Promise<void> {
  const outcome = await downloadFocusesFile({
    fetchFile: () => commands.fetchFocusesFile(),
    reload: async () => {
      await loadFocuses(true);
      return focusesSummary?.read_only_code === "cloud_placeholder";
    },
    say: (text) => {
      ui.status.textContent = text;
    },
    fail: (e) => fail(e as Parameters<typeof fail>[0]),
    isCloudFailure: (e) => (e as { kind?: string } | null)?.kind === "unavailable" && !isTransport(e as Parameters<typeof isTransport>[0]),
    words: { fetching: t.focusesDownloading, done: t.focusesDownloaded, nothing: t.focusesNothingToDownload, failed: t.focusesDownloadFailed },
  });
  downloadFailed.set(currentFolder, outcome === "failed");
  panel.refresh();
  // The folder was never asked (the file was out of reach): ask now, once.
  if (askSyncAfterDownload({ outcome, hasFile: focusesSummary?.has_file ?? false, formatKnown: focusesSummary?.format_known ?? false, syncOn: getSyncFocuses(), asked: isSyncFocusesAsked() })) {
    await promptSyncFocusesIfNeeded();
    panel.refresh();
  }
}
