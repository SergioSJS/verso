// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The statblock templates page (ADR 0099): default layout, manage, gallery.

import { button, h } from "../../dom";
import { LOCALE } from "../../strings";
import {
  getAllLayouts,
  getDefaultLayoutId,
  setDefaultLayoutId,
  saveCustomLayout,
  deleteCustomLayout,
  exportLayoutToJson,
  importLayoutFromJson,
  type StatblockLayout,
} from "../../statblock/layouts";
import { openLayoutBuilder } from "../../statblock/builder";
import type { ItemCtx, SettingItem } from "./types";

export function statblockItems(ctx: ItemCtx): SettingItem[] {
  const out: SettingItem[] = [];
  const add = (section: string, title: string, desc: string, control: () => HTMLElement | null) =>
    out.push({ section, title, desc, node: () => ctx.item(title, desc, control()) });
    // Statblocks & Templates (ADR 0099)
    add("statblocks", LOCALE === "pt-BR" ? "Layout Padrão de Ficha" : "Default Statblock Layout", LOCALE === "pt-BR" ? "Template utilizado para renderizar blocos que não especificam layout: nome." : "Template used for statblocks without an explicit layout: name property.", () => {
      const all = getAllLayouts();
      const current = getDefaultLayoutId();
      return ctx.select(all.map((l) => [l.id, `${l.name} (${l.system})`]), current, (v) => {
        setDefaultLayoutId(v);
        ctx.paint();
      });
    });
    add("statblocks", LOCALE === "pt-BR" ? "Gerenciar Templates" : "Manage Templates", LOCALE === "pt-BR" ? "Crie layouts visuais personalizados ou importe arquivos JSON do Fantasy Statblocks." : "Create custom visual layouts or import Fantasy Statblocks JSON files.", () => {
      const wrap = h("div", "statblock-manage-wrap");
      wrap.style.display = "flex";
      wrap.style.flexWrap = "wrap";
      wrap.style.gap = "0.6rem";

      const newBtn = button("primary", LOCALE === "pt-BR" ? "+ Novo Template" : "+ New Template");
      newBtn.addEventListener("click", () => {
        openLayoutBuilder(undefined, () => ctx.paint());
      });

      const importBtn = button("ghost", LOCALE === "pt-BR" ? "Importar JSON…" : "Import JSON…");
      importBtn.addEventListener("click", () => {
        const json = prompt(LOCALE === "pt-BR" ? "Cole o JSON do template (layout.json):" : "Paste the layout JSON (layout.json):");
        if (!json) return;
        try {
          const imported = importLayoutFromJson(json);
          ctx.paint();
          alert(LOCALE === "pt-BR" ? `Template "${imported.name}" importado com sucesso!` : `Template "${imported.name}" imported successfully!`);
        } catch (err: any) {
          alert((LOCALE === "pt-BR" ? "Erro ao importar: " : "Import error: ") + (err?.message || err));
        }
      });

      wrap.append(newBtn, importBtn);
      return wrap;
    });
    add("statblocks", LOCALE === "pt-BR" ? "Galeria de Templates" : "Template Gallery", LOCALE === "pt-BR" ? "Templates embutidos e personalizados prontos para uso em notas." : "Built-in and custom templates ready for use in notes.", () => {
      const all = getAllLayouts();
      const defaultId = getDefaultLayoutId();
      const gallery = h("div", "statblock-gallery");

      for (const layout of all) {
        const card = h("div", "statblock-gallery-card");

        const top = h("div", "statblock-card-top");
        const titleBox = h("div", "");
        const nameEl = h("div", "statblock-card-title", layout.name);
        const sysEl = h("div", "statblock-card-system", layout.system);
        titleBox.append(nameEl, sysEl);

        const badges = h("div", "statblock-card-badges");
        if (layout.id === defaultId) {
          badges.append(h("span", "statblock-pill-default", LOCALE === "pt-BR" ? "Padrão" : "Default"));
        }
        if (layout.builtIn) {
          badges.append(h("span", "statblock-pill-tag", "Nativo"));
        } else {
          badges.append(h("span", "statblock-pill-tag", "Custom"));
        }
        top.append(titleBox, badges);

        const desc = h("div", "statblock-card-desc", layout.description);

        const actions = h("div", "statblock-gallery-actions");

        const editBtn = button("ghost", layout.builtIn ? (LOCALE === "pt-BR" ? "Visualizar" : "View") : (LOCALE === "pt-BR" ? "Editar" : "Edit"));
        editBtn.addEventListener("click", () => {
          openLayoutBuilder(layout, () => ctx.paint());
        });
        actions.append(editBtn);

        const dupBtn = button("ghost", LOCALE === "pt-BR" ? "Duplicar" : "Duplicate");
        dupBtn.addEventListener("click", () => {
          const clone: StatblockLayout = {
            ...JSON.parse(JSON.stringify(layout)),
            id: `custom-${Date.now()}`,
            name: `${layout.name} (Cópia)`,
            builtIn: false,
          };
          saveCustomLayout(clone);
          ctx.paint();
        });
        actions.append(dupBtn);

        const exportBtn = button("ghost", "JSON");
        exportBtn.title = "Exportar JSON";
        exportBtn.addEventListener("click", () => {
          const json = exportLayoutToJson(layout);
          navigator.clipboard.writeText(json).then(() => {
            exportBtn.textContent = "Copiado!";
            setTimeout(() => (exportBtn.textContent = "JSON"), 2000);
          });
        });
        actions.append(exportBtn);

        if (layout.id !== defaultId) {
          const defBtn = button("ghost", LOCALE === "pt-BR" ? "Tornar Padrão" : "Make Default");
          defBtn.addEventListener("click", () => {
            setDefaultLayoutId(layout.id);
            ctx.paint();
          });
          actions.append(defBtn);
        }

        if (!layout.builtIn) {
          const delBtn = button("ghost", LOCALE === "pt-BR" ? "Excluir" : "Delete");
          delBtn.addEventListener("click", () => {
            if (confirm(LOCALE === "pt-BR" ? `Deseja excluir o template "${layout.name}"?` : `Delete template "${layout.name}"?`)) {
              deleteCustomLayout(layout.id);
              ctx.paint();
            }
          });
          actions.append(delBtn);
        }

        card.append(top, desc, actions);
        gallery.append(card);
      }

      return gallery;
    });
  return out;
}
