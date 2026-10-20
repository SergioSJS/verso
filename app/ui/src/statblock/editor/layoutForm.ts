// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The layout's own fields (ADR 0099 items 3 and 8): its id — the file's
// name, checked as it is typed —, its names and description in both
// languages, its roll profile, columns, dice rules (each pattern's verdict
// from the backtracking guard, live) and appearance (colours as hex with a
// picker, one of the app's fonts). A layout's `sources`, when it has them,
// are shown, not edited.

import { listProfiles } from "../../dice/profiles";
import { h } from "../h";
import { COLOR_TOKENS, COLUMN_WIDTH, FONTS, LAYOUT_ID, type Appearance, type DiceRule, type Layout } from "../model";
import { checkPattern } from "../regexGuard";
import { statblockLang } from "../strings";
import { field, labelPair, numberInput, select, text, verdict } from "./controls";
import { updateLayout } from "./state";
import { E } from "./strings";

const TEMPLATE = /^[0-9dDkKhHlLF%!+\-$& ]{1,60}$/;
const HEX = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;

export interface LayoutFormHost {
  layout(): Layout;
  edit(next: Layout | null, key: string, reform?: boolean): void;
  /** Whether another layout already has this id. */
  taken(id: string): boolean;
}

/** Why an id cannot be the layout's, or null. */
export function idProblem(id: string, taken: (id: string) => boolean): string | null {
  if (!LAYOUT_ID.test(id)) return E().idBad;
  if (taken(id)) return E().idTaken;
  return null;
}

export function layoutForm(host: LayoutFormHost): HTMLElement {
  const e = E();
  const l = host.layout();
  const form = h("div", "sbe-layout-form");
  const set = (patch: Partial<Omit<Layout, "blocks">>, key: string, reform = false) => host.edit(updateLayout(host.layout(), patch), `layout.${key}`, reform);

  const said = h("div", "sbe-verdict-box");
  const showId = (v: string) => {
    const why = idProblem(v, host.taken);
    said.replaceChildren(...(why ? [verdict(false, why)] : []));
  };
  form.append(field(e.id, text(l.id, "layout.id", (v) => {
    showId(v);
    // A bad id is kept as typed: the save refuses it, said here.
    set({ id: v }, "id");
  }), e.idHint), said);
  showId(l.id);
  form.append(labelPair(l.name, "layout.name", [e.namePt, e.nameEn], (v) => set({ name: v ?? {} }, "name")));
  form.append(labelPair(l.description, "layout.desc", [e.descPt, e.descEn], (v) => set({ description: v }, "desc"), true));
  const profiles = listProfiles(statblockLang()).filter((p) => p.rollable);
  form.append(field(e.profile, select(l.profile ?? "", "layout.profile", [["", e.profileNone], ...profiles.map((p) => [p.id, p.label] as [string, string])], (v) => set({ profile: v === "" ? undefined : v }, "profile"))));
  const cols = h("div", "sbe-pair");
  cols.append(
    field(e.columns, select(String(l.columns), "layout.columns", [["1", "1"], ["2", "2"], ["3", "3"]], (v) => set({ columns: Number(v) }, "columns"))),
    field(e.columnWidth, numberInput(l.columnWidth, "layout.columnWidth", COLUMN_WIDTH.min, COLUMN_WIDTH.max, (v) => v !== undefined && set({ columnWidth: v }, "columnWidth"))),
  );
  form.append(cols, rulesField(host), appearanceField(host));
  const sources = (l as unknown as { sources?: { label?: string; url?: string }[] }).sources;
  if (Array.isArray(sources) && sources.length > 0) {
    const box = h("div", "sbe-sources");
    box.append(h("h4", "sbe-subhead", e.sources));
    const ul = h("ul");
    for (const s of sources.slice(0, 50)) {
      const li = h("li");
      li.append(h("span", "", String(s.label ?? "")), " ", h("code", "", String(s.url ?? "")));
      ul.append(li);
    }
    box.append(ul);
    form.append(box);
  }
  return form;
}

function rulesField(host: LayoutFormHost): HTMLElement {
  const e = E();
  const box = h("fieldset", "sbe-set");
  box.append(h("legend", "", e.rules), h("p", "sbe-hint", e.rulesHint));
  const now = () => host.layout().diceRules;
  const setRules = (rules: DiceRule[], key: string, reform = false) => host.edit(updateLayout(host.layout(), { diceRules: rules }), `layout.rules.${key}`, reform);
  host.layout().diceRules.forEach((rule, i) => {
    const row = h("div", "sbe-rule");
    const said = h("div", "sbe-verdict-box");
    const show = (r: DiceRule) => {
      const c = checkPattern(r.pattern);
      const parts = [c.ok ? verdict(true, e.ruleOk) : verdict(false, e.ruleBad(e.why[c.why] ?? c.why))];
      if (!TEMPLATE.test(r.template)) parts.push(verdict(false, e.templateBad));
      said.replaceChildren(...parts);
    };
    const edit = (patch: Partial<DiceRule>) => {
      const rules = [...now()];
      const next = { ...(rules[i] ?? rule), ...patch };
      rules[i] = next;
      show(next);
      setRules(rules, `${i}`);
    };
    const x = h("button", "sbe-small", e.removeRule);
    x.type = "button";
    x.dataset["field"] = `layout.rules.x${i}`;
    x.addEventListener("click", () => setRules(now().filter((_, j) => j !== i), "remove", true));
    row.append(field(e.pattern, text(rule.pattern, `layout.rules.${i}.p`, (v) => edit({ pattern: v }))), field(e.ruleTemplate, text(rule.template, `layout.rules.${i}.t`, (v) => edit({ template: v }))), x, said);
    show(rule);
    box.append(row);
  });
  const add = h("button", "sbe-small", e.addRule);
  add.type = "button";
  add.dataset["field"] = "layout.rules.add";
  add.addEventListener("click", () => setRules([...now(), { pattern: String.raw`\b(\d{1,3}d\d{1,4})\b`, template: "$1" }].slice(0, 20), "add", true));
  box.append(add);
  return box;
}

function appearanceField(host: LayoutFormHost): HTMLElement {
  const e = E();
  const box = h("fieldset", "sbe-set");
  box.append(h("legend", "", e.appearance));
  const setA = (a: Appearance, key: string, reform = false) => host.edit(updateLayout(host.layout(), { appearance: a }), `layout.look.${key}`, reform);
  const now = () => host.layout().appearance;
  for (const theme of ["light", "dark"] as const) {
    const set = h("div", "sbe-colors");
    set.append(h("h4", "sbe-subhead", theme === "light" ? e.light : e.dark));
    for (const token of COLOR_TOKENS) {
      const value = host.layout().appearance[theme]?.[token];
      const name = e.color[token] ?? token;
      const pick = h("input", "sbe-color");
      pick.type = "color";
      pick.value = value && value.length === 7 ? value : "#888888";
      pick.dataset["field"] = `layout.look.${theme}.${token}.pick`;
      pick.setAttribute("aria-label", `${name} (${theme === "light" ? e.light : e.dark})`);
      const hex = text(value ?? "", `layout.look.${theme}.${token}`, () => undefined, { placeholder: "#rrggbb" });
      const write = (v: string | undefined, reform: boolean) => {
        const a: Appearance = JSON.parse(JSON.stringify(now()));
        const colors = { ...(a[theme] ?? {}) };
        if (v === undefined) delete colors[token];
        else colors[token] = v;
        if (Object.keys(colors).length > 0) a[theme] = colors;
        else delete a[theme];
        setA(a, `${theme}.${token}`, reform);
      };
      pick.addEventListener("input", () => {
        hex.value = pick.value;
        write(pick.value, false);
      });
      hex.addEventListener("input", () => {
        const v = hex.value.trim();
        hex.setAttribute("aria-invalid", String(v !== "" && !HEX.test(v)));
        if (v === "") write(undefined, false);
        else if (HEX.test(v)) {
          if (v.length === 7) pick.value = v;
          write(v, false);
        }
      });
      const clear = h("button", "sbe-small", "×");
      clear.type = "button";
      clear.setAttribute("aria-label", e.clearColor(name));
      clear.title = e.clearColor(name);
      clear.dataset["field"] = `layout.look.${theme}.${token}.x`;
      clear.addEventListener("click", () => write(undefined, true));
      const row = h("div", "sbe-color-row");
      row.append(field(name, hex), pick, clear);
      set.append(row);
    }
    box.append(set);
  }
  const fonts: [string, string][] = [["", e.fontApp], ...FONTS.map((f) => [f, e.fonts[f] ?? f] as [string, string])];
  for (const which of ["headingFont", "bodyFont"] as const) {
    box.append(
      field(
        which === "headingFont" ? e.headingFont : e.bodyFont,
        select(host.layout().appearance[which] ?? "", `layout.look.${which}`, fonts, (v) => {
          const a: Appearance = { ...now() };
          if (v === "") delete a[which];
          else a[which] = v as (typeof FONTS)[number];
          setA(a, which);
        }),
      ),
    );
  }
  return box;
}
