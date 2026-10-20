// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The statblock templates page (ADR 0099): default layout, manage, gallery.

import { ask, promptText, tell } from "../../dialog";
import { button, h, ui } from "../../dom";
import { t } from "../../strings";
import {
  deleteCustomLayout,
  duplicateLayout,
  exportLayoutToJson,
  getAllLayouts,
  getDefaultLayoutId,
  importLayoutFromJson,
  setDefaultLayoutId,
} from "../../statblock/layouts";
import { openLayoutBuilder } from "../../statblock/builder";
import { copyWithAnswer, feedbackLine } from "./feedback";
import { ss } from "./strings";
import type { ItemCtx, SettingItem } from "./types";

/** The most layout text the page reads when one is pasted. */
const IMPORT_KB = 512;

export function statblockItems(ctx: ItemCtx): SettingItem[] {
  const out: SettingItem[] = [];
  const add = (title: string, desc: string, control: () => HTMLElement | null) =>
    out.push({ section: "statblocks", title, desc, node: () => ctx.item(title, desc, control()) });

  add(ss.defaultLayoutTitle, ss.defaultLayoutDesc, () => {
    const all = getAllLayouts();
    return ctx.select(all.map((l): [string, string] => [l.id, `${l.name} (${l.system})`]), getDefaultLayoutId(), (v) => {
      setDefaultLayoutId(v);
      ctx.paint();
    });
  });

  add(ss.manageTitle, ss.manageDesc, () => {
    const wrap = h("div", "statblock-manage-wrap");
    const newBtn = button("save", ss.newTemplate);
    newBtn.addEventListener("click", () => openLayoutBuilder(undefined, () => ctx.paint()));
    const importBtn = button("ghost", ss.importJson);
    importBtn.addEventListener("click", () => {
      void (async () => {
        const json = await promptText(ss.pasteLayout, "", true, { yes: ss.importJson, no: t.cancel });
        if (json === null || !json.trim()) return;
        if (json.length > IMPORT_KB * 1024) return void (await tell(ss.importTooBig(IMPORT_KB), ss.ok));
        try {
          const imported = importLayoutFromJson(json);
          ui.status.textContent = ss.importLayoutOk(imported.name);
          ctx.paint();
        } catch (err) {
          await tell(ss.importLayoutFail(err instanceof Error ? err.message : String(err)), ss.ok);
        }
      })();
    });
    wrap.append(newBtn, importBtn);
    return wrap;
  });

  add(ss.galleryTitle, ss.galleryDesc, () => {
    const all = getAllLayouts();
    const defaultId = getDefaultLayoutId();
    const gallery = h("div", "statblock-gallery");
    const feedback = feedbackLine();

    for (const layout of all) {
      const card = h("div", "statblock-gallery-card");
      const top = h("div", "statblock-card-top");
      const titleBox = h("div");
      titleBox.append(h("div", "statblock-card-title", layout.name), h("div", "statblock-card-system", layout.system));
      const badges = h("div", "statblock-card-badges");
      if (layout.id === defaultId) badges.append(h("span", "statblock-pill-default", ss.defaultPill));
      badges.append(h("span", "statblock-pill-tag", layout.builtIn ? ss.builtin : ss.custom));
      top.append(titleBox, badges);

      const actions = h("div", "statblock-gallery-actions");
      const editBtn = button("ghost", layout.builtIn ? ss.view : ss.edit);
      editBtn.addEventListener("click", () => openLayoutBuilder(layout, () => ctx.paint()));
      const dupBtn = button("ghost", ss.duplicate);
      dupBtn.addEventListener("click", () => {
        const clone = duplicateLayout(layout);
        ui.status.textContent = clone.name;
        ctx.paint();
      });
      const exportBtn = button("ghost", "JSON");
      exportBtn.title = ss.exportJson;
      exportBtn.addEventListener("click", () => void copyWithAnswer(exportBtn, exportLayoutToJson(layout), "JSON", ss.copied, ss.copyFailed, feedback.say));
      actions.append(editBtn, dupBtn, exportBtn);

      if (layout.id !== defaultId) {
        const defBtn = button("ghost", ss.makeDefault);
        defBtn.addEventListener("click", () => {
          setDefaultLayoutId(layout.id);
          ctx.paint();
        });
        actions.append(defBtn);
      }
      if (!layout.builtIn) {
        const delBtn = button("ghost danger", ss.remove);
        delBtn.addEventListener("click", () => {
          void (async () => {
            if (!(await ask(ss.deleteLayoutAsk(layout.name), { yes: ss.remove, no: t.cancel }))) return;
            deleteCustomLayout(layout.id);
            ui.status.textContent = ss.layoutDeleted(layout.name);
            ctx.paint();
          })();
        });
        actions.append(delBtn);
      }
      card.append(top, h("div", "statblock-card-desc", layout.description), actions);
      gallery.append(card);
    }
    gallery.append(feedback.el);
    return gallery;
  });
  return out;
}
