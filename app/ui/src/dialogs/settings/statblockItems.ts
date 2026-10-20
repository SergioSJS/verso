// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The statblock layouts page (ADR 0099 item 2): the built-ins, read-only,
// and the folder's own layouts, `.verso/layouts/`; duplicate a layout into
// the folder, copy its JSON, import one (Fantasy Statblocks' or Verso's,
// what was code left out and listed), remove a folder's.

import { ask, promptText, tell } from "../../dialog";
import { button, h, ui } from "../../dom";
import { openLayoutBuilder } from "../../statblock/builder";
import { DEFAULT_LAYOUT_ID } from "../../statblock/builtin";
import { exportLayout } from "../../statblock/fsInterop";
import { allLayouts, canWriteLayouts, duplicateLayout, importLayoutText, removeLayout, type StoredLayout } from "../../statblock/store";
import { S, word } from "../../statblock/strings";
import { copyWithAnswer, feedbackLine } from "./feedback";
import type { ItemCtx, SettingItem } from "./types";

/** The most layout text the page reads when one is pasted. */
const IMPORT_KB = 512;

const sourceWord = (s: StoredLayout): string => (s.source === "builtin" ? S.builtIn : s.source === "folder" ? S.inFolder : S.onDevice);

export function statblockItems(ctx: ItemCtx): SettingItem[] {
  const out: SettingItem[] = [];
  const add = (title: string, desc: string, control: () => HTMLElement | null) =>
    out.push({ section: "statblocks", title, desc, node: () => ctx.item(title, desc, control()) });
  const p = S.page;

  add(p.importTitle, p.importDesc, () => {
    const wrap = h("div", "statblock-manage-wrap");
    const importBtn = button("ghost", p.importButton);
    importBtn.disabled = !canWriteLayouts();
    if (importBtn.disabled) importBtn.title = S.noFolder;
    importBtn.addEventListener("click", () => {
      void (async () => {
        const json = await promptText(p.paste, "", true, { yes: p.importButton, no: p.cancel });
        if (json === null || !json.trim()) return;
        if (json.length > IMPORT_KB * 1024) return void (await tell(S.importTooBig(IMPORT_KB), p.ok));
        const r = await importLayoutText(json);
        if (!r.ok) return void (await tell(r.why, p.ok));
        const name = word(r.value.stored.layout.name, r.value.stored.layout.id);
        ui.status.textContent = p.imported(name);
        const lines = [p.imported(name), ...r.value.dropped.map(S.importDropped), ...r.value.converted.map(S.importConverted)];
        if (lines.length > 1) await tell(lines.join("\n"), p.ok);
        ctx.paint();
      })();
    });
    wrap.append(importBtn);
    return wrap;
  });

  add(p.layoutsTitle, p.layoutsDesc, () => {
    const gallery = h("div", "statblock-gallery");
    const feedback = feedbackLine();
    for (const stored of allLayouts()) {
      const layout = stored.layout;
      const name = word(layout.name, layout.id);
      const card = h("div", "statblock-gallery-card");
      const top = h("div", "statblock-card-top");
      const titleBox = h("div");
      titleBox.append(h("div", "statblock-card-title", name), h("div", "statblock-card-system", layout.id));
      const badges = h("div", "statblock-card-badges");
      if (layout.id === DEFAULT_LAYOUT_ID) badges.append(h("span", "statblock-pill-default", p.defaultPill));
      badges.append(h("span", "statblock-pill-tag", sourceWord(stored)));
      top.append(titleBox, badges);
      const actions = h("div", "statblock-gallery-actions");
      const dup = button("ghost", p.duplicate);
      dup.disabled = !canWriteLayouts();
      if (dup.disabled) dup.title = S.noFolder;
      dup.addEventListener("click", () => {
        void duplicateLayout(layout.id).then((r) => {
          if (!r.ok) return feedback.say(r.why, true);
          ui.status.textContent = p.duplicated(word(r.value.layout.name, r.value.layout.id));
          ctx.paint();
        });
      });
      const exp = button("ghost", p.exportJson);
      exp.addEventListener("click", () => void copyWithAnswer(exp, exportLayout(layout), p.exportJson, p.copied, p.copyFailed, feedback.say));
      actions.append(dup, exp);
      if (stored.source === "folder") {
        const edit = button("ghost", p.edit);
        edit.addEventListener("click", () => openLayoutBuilder(stored, () => ctx.paint()));
        const del = button("ghost danger", p.remove);
        del.addEventListener("click", () => {
          void (async () => {
            if (!(await ask(p.removeAsk(name), { yes: p.remove, no: p.cancel }))) return;
            const r = await removeLayout(layout.id);
            if (!r.ok) return feedback.say(r.why, true);
            ui.status.textContent = p.removed(name);
            ctx.paint();
          })();
        });
        actions.append(edit, del);
      }
      const desc = h("div", "statblock-card-desc", word(layout.description));
      card.append(top, desc);
      if (stored.problems.length > 0) card.append(h("div", "statblock-card-desc statblock-card-problems", p.problems(stored.problems.length)));
      card.append(actions);
      gallery.append(card);
    }
    gallery.append(feedback.el);
    return gallery;
  });
  return out;
}
