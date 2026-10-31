// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A block's options, edited in place under its row (ADR 0099 item 8): the
// keys it reads (suggested from the sample and the note), its label in
// both languages, when it hides, its fallback, the rule after it, its dice;
// and what its type has — a heading's size, a table's headers and modifier
// (an expression checked as it is typed), a tracker's keys, a roll's
// profile and where each input comes from, a branch's test. Every change is
// a step of the session; typing in one field is one step.

import { listProfiles, profileInputs } from "../../dice/profiles";
import { h } from "../h";
import type { Block, Label, Modifier, ModifierBand, Predicate, RollInput } from "../model";
import { checkExpression } from "../modifier";
import { statblockLang } from "../strings";
import { check, field, keyList, labelPair, numberInput, select, text, verdict } from "./controls";
import { findBlock, updateBlock } from "./state";
import { E } from "./strings";
import type { Layout } from "../model";

/** What a form needs of the editor. */
export interface FormHost {
  layout(): Layout;
  /** A change, as a step; `key` names the field (typing merges into one
   *  step); `reform` draws the form again (its shape changed). */
  edit(next: Layout | null, key: string, reform?: boolean): void;
  /** The datalist of keys to suggest. */
  keysListId: string;
}

export function optionsForm(host: FormHost, rowId: string): HTMLElement {
  const form = h("div", "sbe-options");
  const [id, branchRaw] = rowId.split("#");
  const block = findBlock(host.layout(), id ?? "");
  if (!block) return form;
  if (branchRaw !== undefined) {
    form.append(...branchForm(host, block, Number(branchRaw)));
    return form;
  }
  const set = (patch: Record<string, unknown>, key: string, reform = false) => host.edit(updateBlock(host.layout(), block.id, patch), `${block.id}.${key}`, reform);
  const e = E();
  const t = e.types[block.type];
  form.append(h("p", "sbe-type", `${t[0]} — ${t[1]}`));

  if (block.type !== "conditional" && block.type !== "roll" && block.type !== "tracker") {
    form.append(keyList(block.properties, `${block.id}.properties`, host.keysListId, (v) => set({ properties: v }, "properties", true)));
  }
  form.append(labelPair(block.label, `${block.id}.label`, [e.labelPt, e.labelEn], (v) => set({ label: v }, "label")));
  if (block.type === "tracker") form.append(h("p", "sbe-hint", e.trackerLabelHint));
  form.append(...typeFields(host, block, set));

  const common = h("div", "sbe-common");
  common.append(check(block.hideWhenEmpty === true, `${block.id}.hide`, e.hideWhenEmpty, (v) => set({ hideWhenEmpty: v || undefined }, "hide")));
  common.append(check(block.rule === true, `${block.id}.rule`, e.rule, (v) => set({ rule: v || undefined }, "rule")));
  if (!["group", "inline", "collapse", "conditional", "image", "tracker", "roll"].includes(block.type)) {
    common.append(field(e.fallback, text(block.fallback ?? "", `${block.id}.fallback`, (v) => set({ fallback: v === "" ? undefined : v }, "fallback"))));
  }
  if (["property", "saves", "traits", "text", "table"].includes(block.type)) {
    const dice = block.dice === undefined ? "inherit" : block.dice ? "on" : "off";
    common.append(
      field(
        e.dice,
        select(dice, `${block.id}.dice`, [["inherit", e.diceInherit], ["on", e.diceOn], ["off", e.diceOff]], (v) => set({ dice: v === "inherit" ? undefined : v === "on" }, "dice")),
      ),
    );
  }
  form.append(common);
  return form;
}

/** The block as the session holds it now (a field typed a moment ago in
 *  this same form included). */
const fresh = (host: FormHost, block: Block): Block => findBlock(host.layout(), block.id) ?? block;

type Set = (patch: Record<string, unknown>, key: string, reform?: boolean) => void;

function typeFields(host: FormHost, block: Block, set: Set): HTMLElement[] {
  const e = E();
  switch (block.type) {
    case "heading":
      return [field(e.size, select(String(block.size), `${block.id}.size`, [1, 2, 3, 4, 5, 6].map((n) => [String(n), String(n)] as [string, string]), (v) => set({ size: Number(v) }, "size")))];
    case "subheading":
      return [field(e.separator, text(block.separator, `${block.id}.separator`, (v) => set({ separator: v.slice(0, 10) }, "separator")))];
    case "property":
      return [
        field(e.template, text(block.template ?? "", `${block.id}.template`, (v) => set({ template: v === "" ? undefined : v }, "template")), e.templateHint),
        field(e.diceKey, text(block.diceKey ?? "", `${block.id}.diceKey`, (v) => set({ diceKey: v.trim() === "" ? undefined : v.trim() }, "diceKey"), { list: host.keysListId })),
      ];
    case "table":
      return [headersField(block.id, block.headers, () => (fresh(host, block) as typeof block).headers, set), modifierField(block.id, block.modifier, set)];
    case "traits": {
      // A mark each item may carry, toggled on the card and written back.
      const flag = block.flag;
      const out: HTMLElement[] = [check(flag !== undefined, `${block.id}.flag`, e.flag, (v) => set({ flag: v ? { key: "quebrado" } : undefined }, "flag", true))];
      if (flag) {
        out.push(field(e.flagKey, text(flag.key, `${block.id}.flag.key`, (v) => {
          const now = (fresh(host, block) as typeof block).flag;
          if (v.trim()) set({ flag: { ...now, key: v.trim() } }, "flag.key");
        }), e.flagHint));
        out.push(labelPair(flag.label, `${block.id}.flag.label`, [e.labelPt, e.labelEn], (v) => {
          const now = (fresh(host, block) as typeof block).flag ?? flag;
          set({ flag: { key: now.key, ...(v ? { label: v } : {}), ...(now.count ? { count: now.count } : {}) } }, "flag.label");
        }));
        out.push(labelPair(flag.count, `${block.id}.flag.count`, [e.flagCountPt, e.flagCountEn], (v) => {
          const now = (fresh(host, block) as typeof block).flag ?? flag;
          set({ flag: { key: now.key, ...(now.label ? { label: now.label } : {}), ...(v ? { count: v } : {}) } }, "flag.count");
        }));
        out.push(h("p", "sbe-hint", e.flagCountHint));
      }
      return out;
    }
    case "text":
      return [labelPair(block.text, `${block.id}.text`, [e.textPt, e.textEn], (v) => set({ text: v }, "text"), true)];
    case "collapse":
      return [check(block.open, `${block.id}.open`, e.open, (v) => set({ open: v }, "open"))];
    case "conditional": {
      const add = h("button", "sbe-small", e.addBranch);
      add.type = "button";
      add.dataset["field"] = `${block.id}.addBranch`;
      add.addEventListener("click", () => set({ branches: [...(fresh(host, block) as typeof block).branches.slice(0, 9), { when: { op: "has", key: "key" }, nested: [] }] }, "branches", true));
      return [add];
    }
    case "tracker": {
      const now = () => fresh(host, block) as typeof block;
      const max = text(String(block.max), `${block.id}.max`, (v) => {
        const t = v.trim();
        const n = /^\d{1,4}$/.test(t) ? Number(t) : null;
        if (t !== "") set({ max: n ?? t, properties: [now().current, ...(n === null ? [t] : [])] }, "max");
      }, { list: host.keysListId });
      return [
        field(e.current, text(block.current, `${block.id}.current`, (v) => {
          const t = v.trim();
          const m = now().max;
          if (t) set({ current: t, properties: [t, ...(typeof m === "string" ? [m] : [])] }, "current");
        }, { list: host.keysListId })),
        field(e.max, max),
        field(e.style, select(block.style, `${block.id}.style`, [["boxes", e.styleBoxes], ["number", e.styleNumber]], (v) => set({ style: v }, "style"))),
      ];
    }
    case "roll":
      return rollFields(host, block, set);
    default:
      return [];
  }
}

function headersField(id: string, headers: Label[], now: () => Label[], set: Set): HTMLElement {
  const e = E();
  const box = h("fieldset", "sbe-set");
  box.append(h("legend", "", e.headers));
  headers.forEach((hd, i) => {
    const row = h("div", "sbe-row-fields");
    row.append(
      labelPair(hd, `${id}.h${i}`, [`${e.header(i + 1)} (pt)`, `${e.header(i + 1)} (en)`], (v) => {
        const next = [...now()];
        next[i] = v ?? {};
        set({ headers: next }, `h${i}`);
      }),
    );
    const x = h("button", "sbe-small", e.remove);
    x.type = "button";
    x.setAttribute("aria-label", `${e.remove}: ${e.header(i + 1)}`);
    x.dataset["field"] = `${id}.hx${i}`;
    x.addEventListener("click", () => set({ headers: now().filter((_, j) => j !== i) }, "headers", true));
    row.append(x);
    box.append(row);
  });
  const add = h("button", "sbe-small", e.addHeader);
  add.type = "button";
  add.dataset["field"] = `${id}.addHeader`;
  add.addEventListener("click", () => set({ headers: [...now(), {}].slice(0, 30) }, "headers", true));
  box.append(add);
  return box;
}

/** A printed modifier table's rows: from, to, the modifier; a row whose
 *  "from" is past its "to" is said, and the validator leaves it out. */
function bandsField(id: string, bands: ModifierBand[], set: Set): HTMLElement {
  const e = E();
  const box = h("fieldset", "sbe-set sbe-bands");
  box.append(h("legend", "", e.bands), h("p", "sbe-hint", e.bandsHint));
  // The rows as typed, kept between keystrokes of this form.
  const rows = bands.map((b) => ({ ...b }));
  const emit = (key: string, reform = false) => set({ modifier: { kind: "bands", bands: rows.map((r) => ({ ...r })) } }, key, reform);
  rows.forEach((row, i) => {
    const line = h("div", "sbe-band");
    const said = h("div", "sbe-verdict-box");
    const judge = () => said.replaceChildren(...(row.min > row.max ? [verdict(false, e.bandBad)] : []));
    const num = (k: "min" | "max" | "value", label: string) =>
      field(label, numberInput(row[k], `${id}.band${i}.${k}`, -100000, 100000, (v) => {
        row[k] = Math.round(v ?? 0);
        judge();
        emit(`band${i}.${k}`);
      }));
    const x = h("button", "sbe-small", e.remove);
    x.type = "button";
    x.setAttribute("aria-label", `${e.remove}: ${e.bandRow(i + 1)}`);
    x.dataset["field"] = `${id}.band${i}.x`;
    x.addEventListener("click", () => {
      rows.splice(i, 1);
      emit("bands", true);
    });
    line.append(num("min", e.bandMin), num("max", e.bandMax), num("value", e.bandValue), x, said);
    judge();
    box.append(line);
  });
  const add = h("button", "sbe-small", e.addBand);
  add.type = "button";
  add.dataset["field"] = `${id}.addBand`;
  add.addEventListener("click", () => {
    const last = rows[rows.length - 1];
    const from = last ? last.max + 1 : 1;
    rows.push({ min: from, max: from, value: last ? last.value + 1 : 0 });
    emit("bands", true);
  });
  box.append(add);
  return box;
}

function modifierField(id: string, modifier: Modifier, set: Set): HTMLElement {
  const e = E();
  const box = h("div", "sbe-modifier");
  box.append(
    field(
      e.modifier,
      select(modifier.kind, `${id}.mod`, [["none", e.modNone], ["d20", e.modD20], ["expression", e.modExpr], ["bands", e.modBands]], (v) =>
        set({ modifier: v === "expression" ? { kind: v, expression: "(score - 10) / 2" } : v === "bands" ? { kind: v, bands: [{ min: 1, max: 10, value: 0 }] } : { kind: v } }, "modifier", true),
      ),
    ),
  );
  if (modifier.kind === "bands") box.append(bandsField(id, modifier.bands, set));
  if (modifier.kind === "expression") {
    const said = h("div", "sbe-verdict-box");
    const show = (expr: string) => {
      const why = checkExpression(expr);
      said.replaceChildren(why === null ? verdict(true, e.expressionOk) : verdict(false, e.expressionBad(why)));
    };
    const input = text(modifier.expression, `${id}.expr`, (v) => {
      show(v);
      // A refused expression is kept as typed: the validator lists it, and
      // the card draws no modifier until it holds.
      set({ modifier: { kind: "expression", expression: v } }, "expr");
    });
    box.append(field(e.expression, input, e.expressionHint), said);
    show(modifier.expression);
  }
  return box;
}

function rollFields(host: FormHost, block: Extract<Block, { type: "roll" }>, set: Set): HTMLElement[] {
  const e = E();
  const lang = statblockLang();
  const profiles = listProfiles(lang).filter((p) => p.rollable);
  const out: HTMLElement[] = [
    field(
      e.profile,
      select(block.profile ?? "", `${block.id}.profile`, [["", host.layout().profile ? e.profileLayout : e.profileNone], ...profiles.map((p) => [p.id, p.label] as [string, string])], (v) =>
        set({ profile: v === "" ? undefined : v, inputs: {} }, "profile", true),
      ),
    ),
  ];
  const id = block.profile ?? host.layout().profile;
  if (!id) return out;
  let inputs: ReturnType<typeof profileInputs>;
  try {
    inputs = profileInputs(id, lang);
  } catch {
    return out;
  }
  const box = h("fieldset", "sbe-set");
  box.append(h("legend", "", e.inputs));
  for (const info of inputs) {
    const cur: RollInput | undefined = Object.hasOwn(block.inputs, info.id) ? block.inputs[info.id] : undefined;
    const mode = cur === undefined ? "ask" : "key" in cur ? "key" : "value";
    const setInput = (v: RollInput | undefined, reform = false) => {
      const next: Record<string, RollInput> = { ...(fresh(host, block) as typeof block).inputs };
      if (v === undefined) delete next[info.id];
      else next[info.id] = v;
      set({ inputs: next }, `in.${info.id}`, reform);
    };
    const row = h("div", "sbe-row-fields");
    row.append(
      field(
        info.label,
        select(mode, `${block.id}.in.${info.id}.mode`, [["ask", e.inputAsk], ["key", e.inputKey], ["value", e.inputValue]], (v) =>
          setInput(v === "ask" ? undefined : v === "key" ? { key: info.id } : { value: info.default ?? info.options?.[0]?.value ?? 0 }, true),
        ),
      ),
    );
    if (cur && "key" in cur) row.append(field(e.inputKey, text(cur.key, `${block.id}.in.${info.id}.key`, (v) => v.trim() && setInput({ key: v.trim() }), { list: host.keysListId })));
    if (cur && "value" in cur) {
      if (info.type === "select" && info.options) row.append(field(e.value, select(String(cur.value), `${block.id}.in.${info.id}.value`, info.options.map((o) => [o.value, o.label] as [string, string]), (v) => setInput({ value: v }))));
      else row.append(field(e.value, numberInput(Number(cur.value) || 0, `${block.id}.in.${info.id}.value`, -999, 999, (v) => setInput({ value: v ?? 0 }))));
    }
    box.append(row);
  }
  out.push(box);
  return out;
}

function branchForm(host: FormHost, block: Block, i: number): HTMLElement[] {
  if (block.type !== "conditional") return [];
  const e = E();
  const br = block.branches[i];
  if (!br) return [];
  const setBranch = (next: { when?: Predicate; not?: boolean } | null, key: string, reform = false) => {
    const branches = (fresh(host, block) as typeof block).branches.map((b, j) => (j !== i ? b : next === null ? null : { ...(next.when ? { when: next.when } : {}), ...(next.not ? { not: true } : {}), nested: b.nested })).filter((b) => b !== null);
    host.edit(updateBlock(host.layout(), block.id, { branches }), `${block.id}#${i}.${key}`, reform);
  };
  const when = br.when;
  const op = when ? when.op : "otherwise";
  // The branch as it is now: its key typed a moment ago kept when its value is.
  const nowBr = () => (fresh(host, block) as typeof block).branches[i] ?? br;
  const nowWhen = () => (nowBr().when ?? when) as Predicate;
  const notNow = () => (nowBr().not ? { not: true } : {});
  const out: HTMLElement[] = [
    field(
      e.when,
      select(op, `${block.id}#${i}.op`, [["has", e.whenHas], ["equals", e.whenEquals], ["above", e.whenAbove], ["otherwise", e.whenOtherwise]], (v) => {
        const key = when?.key ?? "key";
        const w: Predicate | undefined = v === "otherwise" ? undefined : v === "has" ? { op: v, key } : v === "above" ? { op: v, key, value: 0 } : { op: v, key, value: "" };
        setBranch({ ...(w ? { when: w } : {}), ...(br.not ? { not: true } : {}) }, "op", true);
      }),
    ),
  ];
  if (when) {
    out.push(field(e.keys, text(when.key, `${block.id}#${i}.key`, (v) => v.trim() && setBranch({ when: { ...nowWhen(), key: v.trim() } as Predicate, ...notNow() }, "key"), { list: host.keysListId })));
    if (when.op === "equals") out.push(field(e.value, text(String(when.value), `${block.id}#${i}.value`, (v) => setBranch({ when: { ...nowWhen(), value: /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v } as Predicate, ...notNow() }, "value"))));
    if (when.op === "above") out.push(field(e.value, numberInput(when.value, `${block.id}#${i}.value`, -1e6, 1e6, (v) => setBranch({ when: { ...nowWhen(), value: v ?? 0 } as Predicate, ...notNow() }, "value"))));
    out.push(check(br.not === true, `${block.id}#${i}.not`, e.not, (v) => setBranch({ when: nowWhen(), ...(v ? { not: true } : {}) }, "not")));
  }
  const x = h("button", "sbe-small", e.removeBranch);
  x.type = "button";
  x.dataset["field"] = `${block.id}#${i}.remove`;
  x.addEventListener("click", () => setBranch(null, "remove", true));
  out.push(x);
  return out;
}
