// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The theme builder (ADR 0100): the controls for the token list on one
// side and a large sample page on the other, in a tab of its own
// (leaves/theme.ts). Every change is written as variables on `<html>` at
// once — through `applySettings`, not `saveSettings`, so nothing is kept
// until the person saves — with the contrast of the real pairs shown live.
// Cancel puts the look back as it was when the builder opened.

import { ask } from "../dialog";
import { button, h } from "../dom";
import { icon } from "../icons";
import { applySettings, DEFAULTS, saveSettings, settings } from "../settings";
import { applyLook } from "./apply";
import { effective, shippedColors } from "./apply";
import { toHex } from "./color";
import { PAIRS, ratios, warnings } from "./derive";
import { changeColor } from "./edit";
import { applyTheme, currentTheme, hasOwnLook, lookNow, profilesNow, say, setProfiles, told } from "./actions";
import { rename, saveAs } from "./profiles";
import { sampleDocument } from "./sample";
import { cannotSuggest, setSuggestion, suggestion } from "./suggest";
import { W } from "./strings";
import { creditLine } from "./creditLine";
import { V2 } from "./moreStrings";
import {
  type AnyColor, CODE_TOKENS, COLOR_TOKENS, emptyLook, FONT_CHOICES, type FontKey, type FontToken, HEADING_TOKENS, type Look, SEMANTIC_TOKENS, SIZE_MAX, SIZE_MIN, type Side, STYLE_CHOICES, STYLE_KEYS, type Style,
} from "./tokens";
import { PHONE_MEDIA } from "../screen/phone";

/** What the builder edits: one of the person's themes, or a new one. */
export type BuildSpec = { mode: "edit"; name: string } | { mode: "new" };
export type Builder = {
  el: HTMLElement;
  /** Put the look back as it was when the builder opened. */
  revert: () => void;
  /** Whether anything changed since it opened. */
  changed: () => boolean;
  focus: () => void;
};
export type BuilderHooks = {
  /** Something changed (the tab shows the dot). */
  onChange: () => void;
  /** The theme was saved under this name. */
  onSaved: (name: string) => void;
  /** Cancel was pressed: the look is back; the tab may close. */
  onCancel: () => void;
};

let ids = 0;
const uid = (): string => `look-${++ids}`;

const prefersDark = (): boolean => settings.theme === "dark" || (settings.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);

function field(legend: string, cls = ""): { box: HTMLFieldSetElement; add: (...n: Node[]) => void } {
  const box = h("fieldset", `look-set ${cls}`.trim());
  box.append(h("legend", "", legend));
  return { box, add: (...n) => box.append(...n) };
}

/** A group of controls, folded until opened (ADR 0109 item 4). */
function group(title: string, id: string, open: boolean): { box: HTMLDetailsElement; body: HTMLElement; add: (...n: Node[]) => void } {
  const box = h("details", "look-set look-group");
  box.dataset["group"] = id;
  if (id === "base") box.classList.add("look-colors");
  box.open = open;
  const body = h("div", "look-group-body");
  box.append(h("summary", "", title), body);
  return { box, body, add: (...n) => body.append(...n) };
}

const tokenName = (token: AnyColor): string => (COLOR_TOKENS as readonly string[]).includes(token) ? W.panel.tokens[token as (typeof COLOR_TOKENS)[number]] : V2.tokens[token];

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

/** The builder. `spec` says which theme it starts from. */
export function themeBuilder(spec: BuildSpec, hooks: BuilderHooks): Builder {
  // The look as it is now, for Cancel.
  const snap = {
    look: JSON.parse(JSON.stringify(lookNow())) as Look,
    headingFont: settings.headingFont,
    fontSize: settings.fontSize,
    lookName: settings.lookName,
    lookCredit: settings.lookCredit,
  };
  if (spec.mode === "edit") {
    const p = profilesNow().find((x) => x.name === spec.name);
    if (p) applyTheme({ ...p.theme, mode: "both" });
  }
  settings.look ??= emptyLook();
  let dirty = false;
  const touched = (): void => {
    dirty = true;
    hooks.onChange();
  };
  /** The window follows the settings without writing them down. */
  const live = (): void => applySettings();

  const root = h("div", "builder");
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

  // --- the name and the side
  const nameId = uid();
  const nameRow = h("div", "builder-name");
  const nameLabel = h("label", "look-name", W.builder.name);
  nameLabel.htmlFor = nameId;
  const nameInput = h("input");
  nameInput.id = nameId;
  nameInput.type = "text";
  nameInput.maxLength = 40;
  nameInput.autocomplete = "off";
  nameInput.value = spec.mode === "edit" ? spec.name : "";
  nameInput.placeholder = W.defaultName;
  nameInput.addEventListener("input", touched);
  nameRow.append(nameLabel, nameInput);

  const bar = h("div", "look-bar");
  const sides = h("div", "look-sides");
  sides.setAttribute("role", "radiogroup");
  sides.setAttribute("aria-label", W.panel.sideLegend);
  const radios: Record<Side, HTMLInputElement> = {} as Record<Side, HTMLInputElement>;
  const groupName = uid();
  for (const s of ["light", "dark"] as const) {
    const label = h("label", "look-side");
    const input = h("input");
    input.type = "radio";
    input.name = groupName;
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
  const reset = h("button", "ghost look-reset", W.panel.reset);
  reset.type = "button";
  reset.prepend(icon("refresh"));
  reset.addEventListener("click", () => {
    settings.look = emptyLook();
    settings.headingFont = DEFAULTS.headingFont;
    settings.fontSize = DEFAULTS.fontSize;
    delete settings.lookCredit;
    live();
    touched();
    refresh(true);
    announce(W.panel.resetDone);
  });
  bar.append(sides, reset);

  // --- controls
  const controls = h("div", "look-controls");
  const colors = group(V2.groups.base, "base", true);
  colors.add(h("p", "look-hint", W.panel.sideHint));
  const rows = new Map<AnyColor, { picker: HTMLInputElement; text: HTMLInputElement; reset: HTMLButtonElement; row: HTMLElement }>();
  const edit = (token: AnyColor, text: string | null): void => {
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
    touched();
    refresh();
  };
  const addColor = (token: AnyColor, into: { add: (...n: Node[]) => void }): void => {
    const name = tokenName(token);
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
    into.add(row);
  };
  for (const token of COLOR_TOKENS) addColor(token, colors);

  const fonts = field(W.panel.fonts);
  const fontOptions = (token: FontToken, withDefault: boolean): [string, string][] => [
    ...(withDefault ? ([["", W.panel.fontDefault]] as [string, string][]) : []),
    ...FONT_CHOICES[token].map((k): [string, string] => [k, W.panel.fontNames[k]]),
  ];
  const heading = select(W.panel.fontLabels["--heading-font"], fontOptions("--heading-font", false), settings.headingFont ?? "serif", (v) => {
    settings.headingFont = v as typeof settings.headingFont;
    live();
    touched();
  });
  const setFont = (key: "book" | "mono", v: string): void => {
    const look = lookNow();
    const next = { ...look, light: { ...look.light }, dark: { ...look.dark } };
    if (v === "") delete next[key];
    else next[key] = v as FontKey;
    settings.look = next;
    live();
    touched();
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
    live();
    touched();
  });
  sizeRow.append(sizeLabel, size, sizeOut);
  fonts.add(heading.row, book.row, mono.row, sizeRow);

  // The contrast is a closed section with its verdict on the summary: a
  // calm builder shows it when there is something to read.
  const contrast = h("details", "look-set look-contrast");
  const summary = h("summary", "look-contrast-summary");
  const summaryName = h("span", "", W.panel.contrast);
  const summaryState = h("span", "look-contrast-state");
  summary.append(summaryName, summaryState);
  contrast.append(summary, h("p", "look-hint", W.panel.contrastLead));
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
  contrast.append(list);

  // The folder's suggestion, for whoever shares a folder.
  const share = h("details", "look-set look-share");
  share.append(h("summary", "", W.builder.folderLegend));
  const suggestBtn = button("ghost", W.share.suggest);
  const unsuggestBtn = button("ghost", W.share.unsuggest);
  const suggestWhy = h("p", "look-hint");
  const report = (text: string): void => {
    announce(text);
    say(text);
  };
  suggestBtn.addEventListener("click", () => {
    void (async () => {
      if (!hasOwnLook()) return void announce(W.share.exportEmpty);
      const theme = currentTheme(nameInput.value.trim() || undefined);
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
  share.append(suggestWhy, folderRow);

  colors.add(fonts.box);

  // The version 2 groups (ADR 0109 item 4), each folded until opened.
  const mk = (title: string, id: string, hint: string, tokens: readonly AnyColor[]): ReturnType<typeof group> => {
    const g = group(title, id, false);
    g.add(h("p", "look-hint", hint));
    for (const token of tokens) addColor(token, g);
    return g;
  };
  const headings = mk(V2.groups.headings, "headings", V2.hints.headings, HEADING_TOKENS);
  const code = mk(V2.groups.code, "code", V2.hints.code, CODE_TOKENS);
  const callouts = mk(V2.groups.callouts, "callouts", V2.hints.callouts, SEMANTIC_TOKENS);
  const structure = group(V2.groups.structure, "structure", false);
  structure.add(h("p", "look-hint", V2.hints.structure));
  const styleSelects = new Map<(typeof STYLE_KEYS)[number], HTMLSelectElement>();
  const setStyle = (key: (typeof STYLE_KEYS)[number], v: string): void => {
    const look = lookNow();
    const style: Record<string, string> = { ...(look.style ?? {}) };
    if (v === STYLE_CHOICES[key][0]) delete style[key];
    else style[key] = v;
    const ordered: Record<string, string> = {};
    for (const k of STYLE_KEYS) if (style[k] !== undefined) ordered[k] = style[k];
    const next: Look = { ...look, light: { ...look.light }, dark: { ...look.dark } };
    if (Object.keys(ordered).length > 0) next.style = ordered as Style;
    else delete next.style;
    settings.look = next;
    live();
    touched();
    refresh();
  };
  for (const key of STYLE_KEYS) {
    const def = V2.styles[key];
    const sel = select(def.label, STYLE_CHOICES[key].map((v): [string, string] => [v, def.values[v]!]), STYLE_CHOICES[key][0], (v) => setStyle(key, v));
    sel.row.dataset["style"] = key;
    styleSelects.set(key, sel.el);
    structure.add(sel.row);
    // The rule's colour sits right under its style.
    if (key === "hr-style") addColor("--hr-color", structure);
  }
  // On a phone one group is open at a time.
  const groups = [colors, headings, code, callouts, structure];
  for (const g of groups) {
    g.box.addEventListener("toggle", () => {
      if (g.box.open && window.matchMedia(PHONE_MEDIA).matches) for (const other of groups) if (other !== g) other.box.open = false;
    });
  }

  const credit = h("div", "look-credit-box");
  controls.append(colors.box, headings.box, code.box, callouts.box, structure.box, contrast, share, credit);

  // --- the sample
  const sample = sampleDocument();
  const sampleBox = h("div", "look-sample-box");
  sampleBox.append(h("p", "look-sample-title", W.panel.sample), sample.el);

  // --- the footer
  const foot = h("div", "builder-foot");
  const save = button("save", W.builder.save);
  const cancel = button("ghost", W.builder.cancel);
  const keep = h("div", "builder-keep");
  keep.append(cancel, save);
  foot.append(status, keep);

  const head = h("div", "builder-head");
  const title = h("h2", "builder-title", spec.mode === "edit" ? W.builder.editing(spec.name) : W.builder.creating);
  title.id = uid();
  root.setAttribute("role", "region");
  root.setAttribute("aria-labelledby", title.id);
  head.append(title, h("p", "look-lead", W.builder.lead));
  const left = h("div", "builder-left");
  left.append(nameRow, bar, controls);
  const body = h("div", "builder-body");
  body.append(left, sampleBox);
  root.append(head, body, foot);

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
    credit.replaceChildren(...(settings.lookCredit ? [creditLine(settings.lookCredit, "theme-credit look-credit")] : []));
    for (const [key, el] of styleSelects) el.value = look.style?.[key] ?? STYLE_CHOICES[key][0];
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
    summaryState.textContent = warned.length > 0 ? `⚠ ${W.builder.contrastWarn(warned.length)}` : `✓ ${W.builder.contrastOk}`;
    summaryState.dataset["state"] = warned.length > 0 ? "warn" : "ok";
    const key = `${side}:${warned.join(",")}`;
    if (key !== lastWarned) {
      const before = lastWarned;
      lastWarned = key;
      if (before !== "" && warned.length > 0) {
        contrast.open = true;
        announce(W.panel.warned(warned.map((id) => W.panel.pairs[id]).join(", ")));
      }
    }
    const why = cannotSuggest();
    suggestBtn.disabled = why !== null;
    unsuggestBtn.disabled = why !== null || suggestion() === null;
    unsuggestBtn.hidden = suggestion() === null;
    suggestWhy.textContent = why === "folder" ? W.share.suggestNoFolder : why === "reader" ? W.share.suggestRead : W.share.suggestDesc;
  }

  const revert = (): void => {
    settings.look = snap.look;
    settings.headingFont = snap.headingFont;
    settings.fontSize = snap.fontSize;
    if (snap.lookName === undefined) delete settings.lookName;
    else settings.lookName = snap.lookName;
    if (snap.lookCredit === undefined) delete settings.lookCredit;
    else settings.lookCredit = snap.lookCredit;
    saveSettings();
    told();
    dirty = false;
  };
  cancel.addEventListener("click", () => {
    revert();
    say(W.builder.cancelled);
    hooks.onCancel();
  });
  save.addEventListener("click", () => {
    void (async () => {
      const name = nameInput.value.trim();
      if (name === "") {
        announce(W.builder.noName);
        nameInput.focus();
        return;
      }
      let list = profilesNow();
      const theme = currentTheme(name);
      if (spec.mode === "edit" && spec.name !== name) {
        const renamed = rename(list, spec.name, name);
        if (!renamed.ok) return void announce(renamed.why);
        list = renamed.list;
      }
      let r = saveAs(list, name, theme, spec.mode === "edit");
      if (!r.ok && list.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        if (!(await ask(W.profile.replaceQ(name), { yes: W.profile.replace, no: W.profile.no }))) return;
        r = saveAs(list, name, theme, true);
      }
      if (!r.ok) return void announce(r.why);
      settings.lookName = r.name;
      setProfiles(r.list);
      dirty = false;
      say(W.builder.saved(r.name));
      hooks.onSaved(r.name);
    })();
  });
  settings.look ??= emptyLook();
  refresh();
  return {
    el: root,
    revert,
    changed: () => dirty,
    focus: () => nameInput.focus(),
  };
}
