// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Settings › Appearance › Customize appearance (ADR 0100): controls for the
// token list on one side and a sample page on the other; every change is
// written as variables on `<html>` at once, with the contrast of the real
// pairs shown live. Built once and refreshed in place, so a change never
// moves focus.

import { ask } from "../dialog";
import { button, h } from "../dom";
import { icon } from "../icons";
import { onFolderLayer } from "../folderLayer";
import { saveSettings, settings } from "../settings";
import { applyLook, effective, shippedColors } from "./apply";
import { toHex } from "./color";
import { PAIRS, ratios, warnings } from "./derive";
import { changeColor } from "./edit";
import {
  applyTheme, currentTheme, exportCurrent, hasOwnLook, importFile, LOOK_EVENT, lookNow, profilesNow, restoreDefault, say, setProfiles,
} from "./actions";
import { remove, rename, saveAs } from "./profiles";
import { sampleDocument } from "./sample";
import { cannotSuggest, setSuggestion, suggestion } from "./suggest";
import { W } from "./strings";
import {
  COLOR_TOKENS, type ColorToken, emptyLook, FONT_CHOICES, type FontKey, type FontToken, SIZE_MAX, SIZE_MIN, type Side,
} from "./tokens";

let ids = 0;
const uid = (): string => `look-${++ids}`;

const prefersDark = (): boolean => settings.theme === "dark" || (settings.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);

function field(legend: string, cls = ""): { box: HTMLFieldSetElement; add: (...n: Node[]) => void } {
  const box = h("fieldset", `look-set ${cls}`.trim());
  box.append(h("legend", "", legend));
  return { box, add: (...n) => box.append(...n) };
}

function select(label: string, options: [string, string][], value: string, on: (v: string) => void): { row: HTMLElement; el: HTMLSelectElement } {
  const row = h("div", "look-row");
  const id = uid();
  const l = h("label", "look-name", label);
  l.htmlFor = id;
  const el = h("select");
  el.id = id;
  for (const [v, text] of options) el.append(new Option(text, v));
  el.value = value;
  el.addEventListener("change", () => on(el.value));
  row.append(l, el);
  return { row, el };
}

/** The panel. `paint` repaints the Settings page when something outside the panel's own controls must follow. */
export function appearancePanel(): HTMLElement {
  const root = h("section", "look");
  const titleId = uid();
  root.setAttribute("aria-labelledby", titleId);
  const title = h("h3", "look-title", W.panel.title);
  title.id = titleId;
  root.append(title, h("p", "look-lead", W.panel.lead));

  let side: Side = prefersDark() ? "dark" : "light";
  const status = h("p", "look-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  let lastWarned = "";
  const announce = (text: string): void => {
    status.textContent = "";
    // A moment later, so that the same words said twice are read twice.
    window.setTimeout(() => void (status.textContent = text), 30);
  };

  // --- the side and the default
  const bar = h("div", "look-bar");
  const sides = h("div", "look-sides");
  sides.setAttribute("role", "radiogroup");
  sides.setAttribute("aria-label", W.panel.sideLegend);
  const radios: Record<Side, HTMLInputElement> = {} as Record<Side, HTMLInputElement>;
  for (const s of ["light", "dark"] as const) {
    const label = h("label", "look-side");
    const input = h("input");
    input.type = "radio";
    input.name = uid();
    input.checked = s === side;
    input.addEventListener("change", () => {
      if (!input.checked) return;
      side = s;
      lastWarned = "";
      refresh();
    });
    radios[s] = input;
    label.append(input, h("span", "", s === "light" ? W.panel.light : W.panel.dark));
    sides.append(label);
  }
  // Radios of one group share a name.
  radios.dark.name = radios.light.name;
  const reset = h("button", "ghost look-reset", W.panel.reset);
  reset.type = "button";
  reset.prepend(icon("refresh"));
  reset.addEventListener("click", () => {
    restoreDefault();
    announce(W.panel.resetDone);
  });
  bar.append(sides, reset);
  root.append(bar, h("p", "look-hint", W.panel.sideHint));

  // --- controls
  const controls = h("div", "look-controls");
  const colors = field(W.panel.colors, "look-colors");
  const rows = new Map<ColorToken, { picker: HTMLInputElement; text: HTMLInputElement; reset: HTMLButtonElement; row: HTMLElement }>();
  let saveTimer = 0;
  const saveSoon = (): void => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = 0;
      saveSettings();
    }, 350);
  };
  const edit = (token: ColorToken, text: string | null): void => {
    const out = changeColor(shippedColors()[side], lookNow(), side, token, text);
    if (out.invalid) {
      announce(W.panel.invalid);
      refresh(true);
      return;
    }
    if (out.undone.length > 0) {
      const first = out.undone[0]!;
      announce(W.panel.undone(W.panel.pairs[first.id], W.panel.ratio(first.ratio)));
      refresh(true);
      return;
    }
    settings.look = out.look;
    applyLook(settings.look);
    refresh();
    saveSoon();
  };
  for (const token of COLOR_TOKENS) {
    const name = W.panel.tokens[token];
    const row = h("div", "look-row look-color");
    row.dataset["token"] = token;
    const id = uid();
    const label = h("label", "look-name", name);
    label.htmlFor = id;
    const picker = h("input", "look-picker");
    picker.type = "color";
    picker.setAttribute("aria-label", W.panel.pick(name));
    const text = h("input", "look-hex");
    text.id = id;
    text.type = "text";
    text.spellcheck = false;
    text.autocomplete = "off";
    const rst = h("button", "ghost iconic look-reset-token");
    rst.type = "button";
    rst.title = W.panel.resetToken(name);
    rst.setAttribute("aria-label", W.panel.resetToken(name));
    rst.append(icon("refresh"));
    picker.addEventListener("input", () => edit(token, picker.value));
    text.addEventListener("change", () => edit(token, text.value));
    text.addEventListener("keydown", (e) => {
      if (e.key === "Enter") edit(token, text.value);
    });
    rst.addEventListener("click", () => edit(token, null));
    row.append(label, picker, text, rst);
    rows.set(token, { picker, text, reset: rst, row });
    colors.add(row);
  }

  const fonts = field(W.panel.fonts);
  const fontOptions = (token: FontToken, withDefault: boolean): [string, string][] => [
    ...(withDefault ? ([["", W.panel.fontDefault]] as [string, string][]) : []),
    ...FONT_CHOICES[token].map((k): [string, string] => [k, W.panel.fontNames[k]]),
  ];
  const heading = select(W.panel.fontLabels["--heading-font"], fontOptions("--heading-font", false), settings.headingFont ?? "serif", (v) => {
    settings.headingFont = v as typeof settings.headingFont;
    saveSettings();
  });
  const setFont = (key: "book" | "mono", v: string): void => {
    const look = lookNow();
    const next = { ...look, light: { ...look.light }, dark: { ...look.dark } };
    if (v === "") delete next[key];
    else next[key] = v as FontKey;
    settings.look = next;
    saveSettings();
  };
  const book = select(W.panel.fontLabels["--book"], fontOptions("--book", true), "", (v) => setFont("book", v));
  const mono = select(W.panel.fontLabels["--mono"], fontOptions("--mono", true), "", (v) => setFont("mono", v));
  const sizeRow = h("div", "look-row");
  const sizeId = uid();
  const sizeLabel = h("label", "look-name", W.panel.size);
  sizeLabel.htmlFor = sizeId;
  const size = h("input");
  size.type = "range";
  size.id = sizeId;
  size.min = String(SIZE_MIN);
  size.max = String(SIZE_MAX);
  size.step = "1";
  const sizeOut = h("output", "look-size-out");
  size.addEventListener("input", () => {
    settings.fontSize = Number(size.value);
    size.setAttribute("aria-valuetext", W.panel.sizeValue(settings.fontSize));
    sizeOut.textContent = W.panel.sizeValue(settings.fontSize);
    saveSettings();
  });
  sizeRow.append(sizeLabel, size, sizeOut);
  fonts.add(heading.row, book.row, mono.row, sizeRow);

  const contrast = field(W.panel.contrast, "look-contrast");
  contrast.add(h("p", "look-hint", W.panel.contrastLead));
  const list = h("ul", "look-ratios");
  const ratioRows = new Map<string, { value: HTMLElement; state: HTMLElement; li: HTMLElement }>();
  for (const pair of PAIRS) {
    const li = h("li", "look-ratio");
    li.dataset["pair"] = pair.id;
    const value = h("span", "look-ratio-value");
    const state = h("span", "look-ratio-state");
    li.append(h("span", "look-ratio-name", W.panel.pairs[pair.id]), value, state);
    list.append(li);
    ratioRows.set(pair.id, { value, state, li });
  }
  contrast.add(list);
  controls.append(colors.box, fonts.box, contrast.box);

  // --- the sample
  const sample = sampleDocument();
  const sampleBox = h("div", "look-sample-box");
  sampleBox.append(h("p", "look-sample-title", W.panel.sample), sample.el);
  const grid = h("div", "look-grid");
  grid.append(controls, sampleBox);
  root.append(grid, status);

  // --- profiles
  const profiles = field(W.profile.legend, "look-profiles");
  profiles.add(h("p", "look-hint", W.profile.lead));
  const pickRow = select(W.profile.pick, [["", W.profile.none]], "", () => {});
  const useBtn = button("ghost", W.profile.use);
  const nameRow = h("div", "look-row");
  const nameId = uid();
  const nameLabel = h("label", "look-name", W.profile.name);
  nameLabel.htmlFor = nameId;
  const nameInput = h("input");
  nameInput.id = nameId;
  nameInput.type = "text";
  nameInput.maxLength = 40;
  nameInput.autocomplete = "off";
  const saveBtn = button("save", W.profile.save);
  const renameBtn = button("ghost", W.profile.rename);
  const delBtn = button("ghost", W.profile.del);
  nameRow.append(nameLabel, nameInput);
  const actions = h("div", "look-actions");
  actions.append(saveBtn, renameBtn, delBtn);
  pickRow.row.append(useBtn);
  profiles.add(pickRow.row, nameRow, actions);
  const chosen = (): string => pickRow.el.value;
  const report = (text: string): void => {
    announce(text);
    say(text);
  };
  useBtn.addEventListener("click", () => {
    const p = profilesNow().find((x) => x.name === chosen());
    if (!p) return;
    applyTheme({ ...p.theme, mode: "both" });
    report(W.profile.applied(p.name));
  });
  saveBtn.addEventListener("click", () => {
    void (async () => {
      const name = nameInput.value.trim() || chosen();
      const list = profilesNow();
      const theme = currentTheme(name);
      let r = saveAs(list, name, theme);
      if (!r.ok && list.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        if (!(await ask(W.profile.replaceQ(name), { yes: W.profile.replace, no: W.profile.no }))) return;
        r = saveAs(list, name, theme, true);
      }
      if (!r.ok) return void announce(r.why);
      settings.lookName = r.name;
      setProfiles(r.list);
      nameInput.value = "";
      pickRow.el.value = r.name;
      report(W.profile.saved(r.name));
    })();
  });
  renameBtn.addEventListener("click", () => {
    const r = rename(profilesNow(), chosen(), nameInput.value);
    if (!r.ok) return void announce(r.why);
    if (settings.lookName === chosen()) settings.lookName = r.name;
    setProfiles(r.list);
    nameInput.value = "";
    pickRow.el.value = r.name;
    report(W.profile.renamed(r.name));
  });
  delBtn.addEventListener("click", () => {
    void (async () => {
      const name = chosen();
      if (!name || !(await ask(W.profile.confirmDelete(name), { yes: W.profile.yes, no: W.profile.no }))) return;
      const r = remove(profilesNow(), name);
      if (!r.ok) return void announce(r.why);
      setProfiles(r.list);
      report(W.profile.deleted(name));
    })();
  });

  // --- sharing
  const share = field(W.share.legend, "look-share");
  share.add(h("p", "look-hint", W.share.lead));
  const exportBtn = button("ghost", W.share.export);
  const importBtn = button("ghost", W.share.import);
  const file = h("input");
  file.type = "file";
  file.accept = ".verso-theme,.json,application/json";
  file.hidden = true;
  file.tabIndex = -1;
  file.setAttribute("aria-hidden", "true");
  file.setAttribute("data-look-import", "");
  importBtn.addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    const f = file.files?.[0];
    file.value = "";
    if (f) void importFile(f);
  });
  exportBtn.addEventListener("click", () => {
    if (exportCurrent()) announce(W.share.exported(currentTheme().name));
  });
  const fileRow = h("div", "look-actions");
  fileRow.append(exportBtn, importBtn, file);
  const suggestBtn = button("ghost", W.share.suggest);
  const unsuggestBtn = button("ghost", W.share.unsuggest);
  const suggestWhy = h("p", "look-hint");
  suggestBtn.addEventListener("click", () => {
    void (async () => {
      if (!hasOwnLook()) return void announce(W.share.exportEmpty);
      const theme = currentTheme();
      if (await setSuggestion(theme)) report(W.share.suggested(theme.name));
      else announce(W.share.suggestFail);
      refresh();
    })();
  });
  unsuggestBtn.addEventListener("click", () => {
    void (async () => {
      if (await setSuggestion(null)) report(W.share.unsuggested);
      else announce(W.share.suggestFail);
      refresh();
    })();
  });
  const folderRow = h("div", "look-actions");
  folderRow.append(suggestBtn, unsuggestBtn);
  share.add(fileRow, folderRow, suggestWhy);
  root.append(profiles.box, share.box);

  // --- keeping the controls in step with the settings
  function refresh(force = false): void {
    const look = lookNow();
    radios[side].checked = true;
    sample.show(side);
    const full = effective(side, look);
    const mine = look[side];
    for (const [token, r] of rows) {
      const hex = toHex(full[token]);
      if (force || document.activeElement !== r.text) r.text.value = hex;
      r.picker.value = hex;
      const own = mine[token] !== undefined;
      r.row.dataset["custom"] = own ? "true" : "false";
      r.reset.disabled = !own;
    }
    heading.el.value = settings.headingFont ?? "serif";
    book.el.value = look.book ?? "";
    mono.el.value = look.mono ?? "";
    size.value = String(settings.fontSize);
    size.setAttribute("aria-valuetext", W.panel.sizeValue(settings.fontSize));
    sizeOut.textContent = W.panel.sizeValue(settings.fontSize);
    const rs = ratios(full);
    const warned = warnings(rs);
    for (const r of rs) {
      const row = ratioRows.get(r.id)!;
      const low = warned.includes(r.id);
      row.value.textContent = W.panel.ratio(r.ratio);
      row.state.textContent = low ? `⚠ ${W.panel.warn}` : `✓ ${W.panel.ok}`;
      row.li.dataset["state"] = low ? "warn" : "ok";
    }
    const key = `${side}:${warned.join(",")}`;
    if (key !== lastWarned) {
      const before = lastWarned;
      lastWarned = key;
      if (before !== "" && warned.length > 0) announce(W.panel.warned(warned.map((id) => W.panel.pairs[id]).join(", ")));
    }
    reset.disabled = false;
    // Profiles
    const list = profilesNow();
    const was = pickRow.el.value;
    pickRow.el.replaceChildren(new Option(W.profile.none, ""), ...list.map((p) => new Option(p.name, p.name)));
    pickRow.el.value = list.some((p) => p.name === was) ? was : list.some((p) => p.name === settings.lookName) ? (settings.lookName ?? "") : "";
    const any = chosen() !== "";
    useBtn.disabled = !any;
    renameBtn.disabled = !any;
    delBtn.disabled = !any;
    // The folder
    const why = cannotSuggest();
    suggestBtn.disabled = why !== null;
    unsuggestBtn.disabled = why !== null || suggestion() === null;
    unsuggestBtn.hidden = suggestion() === null;
    suggestWhy.textContent = why === "folder" ? W.share.suggestNoFolder : why === "reader" ? W.share.suggestRead : W.share.suggestDesc;
  }
  pickRow.el.addEventListener("change", () => {
    const any = chosen() !== "";
    useBtn.disabled = !any;
    renameBtn.disabled = !any;
    delBtn.disabled = !any;
  });
  const follow = (): void => {
    if (!root.isConnected) return;
    refresh();
  };
  addEventListener(LOOK_EVENT, follow);
  addEventListener("verso:settings-saved", follow);
  onFolderLayer(follow);
  // A page repainted before the debounce fired keeps the edit.
  root.addEventListener("focusout", () => {
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveTimer = 0;
      saveSettings();
    }
  });
  settings.look ??= emptyLook();
  refresh();
  return root;
}
