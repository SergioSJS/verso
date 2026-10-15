// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Settings › Periodic notes (ADR 0093 items 1–6 and 11): which periods are
// on, each one's format, folder and template, the week's start and the
// language of names — the folder's settings (item 4), marked "Of the
// folder", or "Of this machine" while the daily folder has not moved in;
// a format Verso cannot read refused, saying which tokens; a changed
// format said to leave the notes of the earlier one behind; and, while
// the folder has no periodic settings, Obsidian's offered once.

import { commands, type PeriodicSettings } from "../bindings";
import { canWrite } from "../can";
import { h, ui } from "../dom";
import { fail } from "../errors";
import { changeFolder, folderLayerNow, folderSettingsWritable } from "../folderLayer";
import type { Scope } from "../organize/layerRules";
import { formatProblem, type Period, PERIODS } from "./format";
import { periodicConf } from "./notes";
import { emptyPeriod, emptyPeriodic, obsidianOffer, periodicChange, WEEKDAY_KEYS } from "./rules";
import { ps } from "./strings";

type Item = (title: string, desc: string, control: HTMLElement | null, scope?: Scope) => HTMLElement;

/** Said once at the next paint: what the last change found. */
let pending = "";

/** What a format's problem says. */
export function formatSaid(format: string): string | null {
  const p = formatProblem(format);
  if (!p) return null;
  if (p.unknown.length > 0) return ps.unknownTokens(p.unknown.join(", "));
  if (p.unclosed) return ps.unclosed;
  if (p.empty) return ps.emptyFormat;
  return ps.badPath;
}

/** Send a change of the periodic settings to the folder's layer. False
 *  when it cannot be written now: said. */
async function save(change: PeriodicSettings): Promise<boolean> {
  const ok = await changeFolder(() => ({ periodic: periodicChange(periodicConf(), change) }));
  if (!ok) {
    pending = ps.notWritable;
    ui.status.textContent = ps.notWritable;
  }
  return ok;
}

function periodChange(period: Period, part: Partial<ReturnType<typeof emptyPeriod>>): PeriodicSettings {
  return { ...emptyPeriodic(), [period]: { ...emptyPeriod(), ...part } };
}

export function periodicBody(item: Item, repaint: () => void): HTMLElement {
  const conf = periodicConf();
  const writes = folderSettingsWritable() && canWrite();
  const scope: Scope = conf.scope;
  const box = h("div", "periodic-settings");
  const said = h("p", "settings-hint periodic-said");
  said.setAttribute("role", "status");
  said.textContent = pending || (!writes ? (canWrite() ? ps.notWritable : ps.readOnly) : "");
  said.hidden = said.textContent === "";
  pending = "";
  const say = (text: string) => {
    said.textContent = text;
    said.hidden = text === "";
    ui.status.textContent = text;
  };
  const after = (ok: boolean) => {
    if (ok) repaint();
  };
  box.append(said);

  // Obsidian's settings, offered while the folder has none of its own.
  const offer = h("div", "periodic-offer");
  offer.hidden = true;
  box.append(offer);
  if (writes && conf.scope === "machine" && !folderLayerNow()?.settings.periodic) {
    void commands.getObsidianPeriodic().then((r) => {
      if (r.status !== "ok") return;
      if (r.data.unavailable.length > 0 && !r.data.daily_notes && !r.data.periodic_notes) {
        offer.append(item(ps.offerTitle, ps.offerCloud, null));
        offer.hidden = false;
        return;
      }
      const o = obsidianOffer(r.data.daily_notes, r.data.periodic_notes);
      if (!o) return;
      const lines: string[] = [];
      for (const p of PERIODS) {
        const c = o.change[p];
        if (!c) continue;
        const bits = [c.on === false ? ps.off : c.on ? ps.on : null, c.format, c.folder !== null ? `${ps.folder.toLowerCase()} “${c.folder || "/"}”` : null, c.template ? `${ps.template.toLowerCase()} “${c.template}”` : null].filter(Boolean);
        lines.push(`${ps.period[p]}: ${bits.join(", ")}`);
      }
      if (o.change.week_start) lines.push(`${ps.weekStart}: ${ps.weekdays[WEEKDAY_KEYS.indexOf(o.change.week_start as (typeof WEEKDAY_KEYS)[number])] ?? o.change.week_start}`);
      const from = o.from.map((f) => (f === "daily-notes" ? ".obsidian/daily-notes.json" : ".obsidian/plugins/periodic-notes/data.json")).join(", ");
      const use = h("button", "primary", ps.offerUse);
      use.type = "button";
      use.addEventListener("click", () => {
        use.disabled = true;
        void save(o.change).then((ok) => {
          if (ok) pending = ps.offerDone;
          after(ok);
          use.disabled = false;
        });
      });
      const row = item(ps.offerTitle, ps.offerDesc(from), use);
      const list = h("ul", "periodic-offer-list");
      for (const l of lines) list.append(h("li", "", l));
      offer.append(row, list);
      if (o.unreadable.length > 0) offer.append(h("p", "settings-hint", ps.offerUnreadable(o.unreadable.join(", "))));
      offer.hidden = false;
    }).catch(fail);
  }

  const select = (options: [string, string][], value: string, onChange: (v: string) => void) => {
    const sel = h("select");
    for (const [v, l] of options) {
      const o = h("option", "", l);
      o.value = v;
      o.selected = v === value;
      sel.append(o);
    }
    sel.disabled = !writes;
    sel.addEventListener("change", () => onChange(sel.value));
    return sel;
  };
  const text = (value: string, onChange: (v: string, input: HTMLInputElement) => void) => {
    const i = h("input");
    i.type = "text";
    i.value = value;
    i.disabled = !writes;
    i.spellcheck = false;
    i.addEventListener("keydown", (e) => e.stopPropagation());
    i.addEventListener("change", () => onChange(i.value.trim(), i));
    return i;
  };
  const toggle = (value: boolean, onChange: (v: boolean) => void) => {
    const l = h("label", "switch");
    const b = h("input");
    b.type = "checkbox";
    b.checked = value;
    b.disabled = !writes;
    b.addEventListener("change", () => onChange(b.checked));
    l.append(b, h("span", "switch-track"));
    return l;
  };

  box.append(
    item(ps.weekStart, "", select(ps.weekdays.map((d, i) => [WEEKDAY_KEYS[i] ?? "sunday", d]), WEEKDAY_KEYS[conf.weekStart] ?? "sunday", (v) => void save({ ...emptyPeriodic(), week_start: v }).then(after)), scope),
    item(ps.language, ps.languageDesc, select([["pt-BR", ps.languages["pt-BR"] ?? "pt-BR"], ["en", ps.languages["en"] ?? "en"]], conf.lang, (v) => void save({ ...emptyPeriodic(), language: v }).then(after)), scope),
  );
  for (const period of PERIODS) {
    const p = conf.periods[period];
    const group = h("section", "periodic-period");
    const head = h("h4", "settings-group", ps.period[period]);
    group.setAttribute("aria-label", ps.period[period]);
    group.append(
      head,
      item(ps.onLabel(ps.period[period]), "", toggle(p.on, (v) => void save(periodChange(period, { on: v })).then(after)), scope),
      item(`${ps.period[period]} · ${ps.format}`, ps.formatDesc, text(p.format, (v, input) => {
        const problem = formatSaid(v);
        if (problem) {
          input.setAttribute("aria-invalid", "true");
          say(problem);
          return;
        }
        input.removeAttribute("aria-invalid");
        if (v === p.format) return;
        void save(periodChange(period, { format: v })).then((ok) => {
          if (ok) pending = ps.formatChanged;
          after(ok);
        });
      }), scope),
      item(`${ps.period[period]} · ${ps.folder}`, ps.folderDesc, text(p.folder, (v) => void save(periodChange(period, { folder: v })).then(after)), scope),
      item(`${ps.period[period]} · ${ps.template}`, ps.templateDesc(ps.templateName[period]), text(p.template, (v) => void save(periodChange(period, { template: v })).then(after)), scope),
    );
    box.append(group);
  }
  return box;
}
