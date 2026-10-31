// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A roll block (ADR 0099 item 4): a roll the system's way, through one of
// Rolai's profiles (dice/profiles.ts), with inputs taken from the sheet —
// a skill's value, a difficulty — and the rest asked right there (a Fractal
// risk roll asks how many facts apply). The answer reads as the system
// reads it — the highest die, successes counted, a band of 2d6 — shown
// under the block and said in its live region; it is never written into
// the note (ADR 0088 item 2).

import { listProfiles, profileInputs, rollProfile, type ProfileInputInfo } from "../dice/profiles";
import type { Ctx } from "./blocks";
import { h } from "./h";
import type { RollBlock } from "./model";
import { numberOf, textOf, valueOf } from "./sheet";
import { S, statblockLang, word } from "./strings";

/** A mapped input's value from the sheet, as the profile takes it. */
function fromSheet(info: ProfileInputInfo, raw: unknown): string | number | undefined {
  if (info.type === "number") {
    const n = numberOf(raw);
    return n === null ? undefined : n;
  }
  const t = textOf(raw).trim();
  return info.options?.some((o) => o.value === t) ? t : undefined;
}

export function rollNode(block: RollBlock, ctx: Ctx): HTMLElement | null {
  if (!ctx.opts.rolls) return null;
  const id = block.profile ?? ctx.layout.profile;
  if (!id) return null;
  const lang = statblockLang();
  let inputs: ProfileInputInfo[];
  let profileLabel: string;
  try {
    inputs = profileInputs(id, lang);
    profileLabel = listProfiles(lang).find((p) => p.id === id)?.label ?? id;
  } catch {
    return h("div", "statblock-badge", S.noProfile(id));
  }
  const box = h("div", "statblock-roll");
  const fixed: Record<string, string | number> = Object.create(null) as Record<string, string | number>;
  const asked: { info: ProfileInputInfo; field: HTMLInputElement | HTMLSelectElement }[] = [];
  for (const info of inputs) {
    const m = Object.hasOwn(block.inputs, info.id) ? block.inputs[info.id] : undefined;
    const v = m === undefined ? undefined : "key" in m ? fromSheet(info, valueOf(ctx.sheet, m.key)) : m.value;
    if (v !== undefined) {
      fixed[info.id] = v;
      continue;
    }
    let field: HTMLInputElement | HTMLSelectElement;
    if (info.type === "select" && info.options) {
      const sel = h("select", "statblock-roll-input");
      for (const o of info.options) {
        const opt = h("option", "", o.label);
        opt.value = o.value;
        sel.append(opt);
      }
      field = sel;
    } else {
      const input = h("input", "statblock-roll-input");
      input.type = "number";
      input.inputMode = "numeric";
      input.value = info.default ?? "";
      field = input;
    }
    asked.push({ info, field });
  }
  const title = word(block.label, S.rollWith(profileLabel));
  const go = h("button", "statblock-roll-go", title);
  go.type = "button";
  if (asked.length > 0) {
    const set = h("fieldset", "statblock-roll-ask");
    set.append(h("legend", "sr-only", S.rollAsk));
    for (const a of asked) {
      const lab = h("label", "statblock-roll-field");
      lab.append(h("span", "", a.info.label), a.field);
      set.append(lab);
    }
    box.append(set);
  }
  const out = h("div", "statblock-roll-out");
  out.setAttribute("role", "status");
  out.setAttribute("aria-live", "polite");
  box.append(go, out);
  let busy = false;
  go.addEventListener("click", () => {
    if (busy) return;
    busy = true;
    go.setAttribute("aria-busy", "true");
    const values: Record<string, string | number> = { ...fixed };
    for (const a of asked) {
      const raw = a.field.value.trim();
      // A select's option may be the empty value ("Normal"); a number left
      // blank is not given, and the profile says if it needed one.
      if (a.info.type === "number") {
        if (raw !== "" && Number.isFinite(Number(raw))) values[a.info.id] = Number(raw);
      } else values[a.info.id] = raw;
    }
    const opts = { lang, ...(ctx.opts.rollWith?.deterministic ? { deterministic: [...ctx.opts.rollWith.deterministic] } : {}) };
    rollProfile(id, values, opts).then(
      (r) => {
        out.replaceChildren(h("strong", "statblock-roll-line", r.line), h("span", "statblock-roll-local", S.rollLocal));
        ctx.say(r.line);
      },
      (e: unknown) => {
        const said = S.rollFailed(e instanceof Error ? e.message : String(e));
        out.replaceChildren(h("span", "statblock-roll-failed", said));
        ctx.say(said);
      },
    ).finally(() => {
      busy = false;
      go.removeAttribute("aria-busy");
    });
  });
  return box;
}
