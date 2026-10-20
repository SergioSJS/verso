// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The oracle page (ADR 0102): odds table, spark word banks, custom tables.

import { button, h } from "../../dom";
import { LOCALE } from "../../strings";
import {
  getOddsTable,
  saveOddsTable,
  resetOddsTable,
  getSparkWords,
  saveSparkWords,
  resetSparkWords,
  generateSpark,
  type Likelihood,
  LIKELIHOODS,
  type SparkWordLists,
} from "../../oracle/engine";
import {
  getAllOracleTables,
  saveCustomOracleTable,
  deleteCustomOracleTable,
  type OracleTable,
} from "../../oracle/tables";
import type { ItemCtx, SettingItem } from "./types";

export function oracleItems(ctx: ItemCtx): SettingItem[] {
  const out: SettingItem[] = [];
  const add = (section: string, title: string, desc: string, control: () => HTMLElement | null) =>
    out.push({ section, title, desc, node: () => ctx.item(title, desc, control()) });
    // Oracles & Solo RPG (ADR 0102)
    add(
      "oracles",
      LOCALE === "pt-BR" ? "Tabela de Probabilidades (Sim / Não)" : "Odds Table (Yes / No)",
      LOCALE === "pt-BR"
        ? "Personalize as proporções percentuais de cada resposta para as 5 chances do Oráculo. Cada linha deve totalizar 100%."
        : "Customize the percentage distribution for each answer across the 5 oracle likelihoods. Each row must sum to 100%.",
      () => {
        const wrap = h("div", "oracle-settings-section");
        const odds = getOddsTable();

        const currentData: Record<Likelihood, [number, number, number, number, number, number]> = {
          nearlyCertain: [...odds.nearlyCertain],
          likely: [...odds.likely],
          even: [...odds.even],
          unlikely: [...odds.unlikely],
          nearlyImpossible: [...odds.nearlyImpossible],
        };

        const inputs: Record<Likelihood, HTMLInputElement[]> = {
          nearlyCertain: [],
          likely: [],
          even: [],
          unlikely: [],
          nearlyImpossible: [],
        };

        const sumBadges: Partial<Record<Likelihood, HTMLElement>> = {};

        const updateSum = (lh: Likelihood) => {
          const row = currentData[lh];
          const sum = row.reduce((a, b) => a + b, 0);
          const badge = sumBadges[lh];
          if (badge) {
            badge.textContent = `${sum}% ${sum === 100 ? "✓" : "⚠️"}`;
            badge.className = `oracle-odds-sum ${sum === 100 ? "valid" : "invalid"}`;
          }
        };

        // Presets
        const presetsRow = h("div", "oracle-odds-presets");
        const presetsTitle = h("span", "oracle-preset-title", LOCALE === "pt-BR" ? "Modelos prontos:" : "Presets:");
        presetsRow.append(presetsTitle);

        const PRESET_LIST: { name: string; desc: string; data: Record<Likelihood, [number, number, number, number, number, number]> }[] = [
          {
            name: "🎯 Mythic GME 2e",
            desc: LOCALE === "pt-BR" ? "Padrão clássico com gradações completas" : "Classic oracle with full gradations",
            data: {
              nearlyCertain: [18, 54, 18, 5, 4, 1],
              likely: [15, 45, 15, 10, 12, 3],
              even: [10, 30, 10, 10, 30, 10],
              unlikely: [3, 12, 10, 15, 45, 15],
              nearlyImpossible: [1, 4, 5, 18, 54, 18],
            },
          },
          {
            name: "⚔️ Ironsworn",
            desc: LOCALE === "pt-BR" ? "Curva Sim/Não direta (10/25/50/75/90%)" : "Direct Yes/No curve",
            data: {
              nearlyCertain: [10, 80, 0, 0, 8, 2],
              likely: [8, 67, 0, 0, 20, 5],
              even: [5, 45, 0, 0, 45, 5],
              unlikely: [2, 23, 0, 0, 67, 8],
              nearlyImpossible: [1, 9, 0, 0, 80, 10],
            },
          },
          {
            name: LOCALE === "pt-BR" ? "⚖️ Equilibrado" : "⚖️ Balanced",
            desc: LOCALE === "pt-BR" ? "Proporções uniformes e simétricas" : "Symmetric proportions",
            data: {
              nearlyCertain: [15, 60, 10, 5, 8, 2],
              likely: [12, 48, 15, 8, 14, 3],
              even: [10, 35, 10, 10, 30, 5],
              unlikely: [3, 14, 8, 15, 48, 12],
              nearlyImpossible: [2, 8, 5, 10, 60, 15],
            },
          },
          {
            name: LOCALE === "pt-BR" ? "🌪️ Narrativo" : "🌪️ Narrative",
            desc: LOCALE === "pt-BR" ? "Mais reviravoltas ('Sim, mas...' e 'Não, mas...')" : "More complications",
            data: {
              nearlyCertain: [10, 40, 35, 8, 5, 2],
              likely: [8, 32, 30, 15, 12, 3],
              even: [5, 25, 25, 20, 20, 5],
              unlikely: [3, 12, 15, 30, 32, 8],
              nearlyImpossible: [2, 5, 8, 35, 40, 10],
            },
          },
        ];

        for (const preset of PRESET_LIST) {
          const btn = h("button", "oracle-preset-btn", preset.name);
          btn.type = "button";
          btn.title = preset.desc;
          btn.addEventListener("click", () => {
            for (const lh of LIKELIHOODS) {
              currentData[lh] = [...preset.data[lh]];
              for (let i = 0; i < 6; i++) {
                const inp = inputs[lh][i];
                if (inp) inp.value = String(currentData[lh][i]);
              }
              updateSum(lh);
            }
          });
          presetsRow.append(btn);
        }

        const tableWrap = h("div", "oracle-odds-table-wrap");
        const table = h("table", "oracle-odds-table");

        const thead = h("thead", "");
        const trH = h("tr", "");
        const thLabels = LOCALE === "pt-BR"
          ? ["Chance", "Sim e...", "Sim", "Sim mas...", "Não mas...", "Não", "Não e...", "Total"]
          : ["Odds", "Yes &...", "Yes", "Yes but...", "No but...", "No", "No &...", "Total"];
        for (const thText of thLabels) {
          trH.append(h("th", "", thText));
        }
        thead.append(trH);
        table.append(thead);

        const tbody = h("tbody", "");
        const likelihoodNames: Record<Likelihood, string> = LOCALE === "pt-BR"
          ? {
              nearlyCertain: "Quase Certo",
              likely: "Provável",
              even: "50 / 50",
              unlikely: "Improvável",
              nearlyImpossible: "Quase Impossível",
            }
          : {
              nearlyCertain: "Nearly Certain",
              likely: "Likely",
              even: "Even (50/50)",
              unlikely: "Unlikely",
              nearlyImpossible: "Nearly Impossible",
            };

        for (const lh of LIKELIHOODS) {
          const tr = h("tr", "");
          const nameTd = h("td", "", likelihoodNames[lh]);
          nameTd.style.fontWeight = "600";
          nameTd.style.textAlign = "left";
          nameTd.style.paddingLeft = "0.75rem";
          nameTd.style.whiteSpace = "nowrap";
          tr.append(nameTd);

          for (let colIdx = 0; colIdx < 6; colIdx++) {
            const td = h("td", "");
            const input = h("input", "oracle-odds-input") as HTMLInputElement;
            input.type = "number";
            input.min = "0";
            input.max = "100";
            input.value = String(currentData[lh][colIdx]);
            input.addEventListener("input", () => {
              const val = Math.max(0, Math.min(100, parseInt(input.value, 10) || 0));
              currentData[lh][colIdx] = val;
              updateSum(lh);
            });
            inputs[lh].push(input);
            td.append(input);
            tr.append(td);
          }

          const sumTd = h("td", "");
          const badge = h("span", "oracle-odds-sum");
          sumBadges[lh] = badge;
          sumTd.append(badge);
          tr.append(sumTd);
          updateSum(lh);

          tbody.append(tr);
        }
        table.append(tbody);
        tableWrap.append(table);

        const actions = h("div", "");
        actions.style.display = "flex";
        actions.style.alignItems = "center";
        actions.style.gap = "0.6rem";
        actions.style.marginTop = "0.5rem";

        const saveBtn = button("primary", LOCALE === "pt-BR" ? "Salvar Probabilidades" : "Save Odds");
        saveBtn.addEventListener("click", () => {
          saveOddsTable(currentData);
          saveBtn.textContent = LOCALE === "pt-BR" ? "✓ Salvo!" : "✓ Saved!";
          setTimeout(() => {
            saveBtn.textContent = LOCALE === "pt-BR" ? "Salvar Probabilidades" : "Save Odds";
          }, 1800);
        });

        const resetBtn = button("ghost", LOCALE === "pt-BR" ? "Restaurar Padrões" : "Restore Defaults");
        resetBtn.addEventListener("click", () => {
          if (confirm(LOCALE === "pt-BR" ? "Deseja restaurar as probabilidades padrão do Oráculo?" : "Reset oracle odds back to default?")) {
            resetOddsTable();
            ctx.paint();
          }
        });

        actions.append(saveBtn, resetBtn);
        wrap.append(presetsRow, tableWrap, actions);
        return wrap;
      }
    );
    add(
      "oracles",
      LOCALE === "pt-BR" ? "Faíscas de Inspiração (Vocabulário)" : "Idea Sparks (Word Banks)",
      LOCALE === "pt-BR"
        ? "Configure as listas de palavras geradoras de ideias para Ação, Tema, Descritor e Foco. Uma palavra por linha ou separadas por vírgula."
        : "Configure the spark vocabulary lists for Action, Theme, Descriptor, and Focus. One word per line or comma-separated.",
      () => {
        const wrap = h("div", "oracle-settings-section");
        let activeLang: "pt" | "en" = (LOCALE === "pt-BR" ? "pt" : "en");

        const langBar = h("div", "");
        langBar.style.display = "flex";
        langBar.style.alignItems = "center";
        langBar.style.gap = "0.5rem";
        langBar.style.marginBottom = "0.5rem";

        const langLabel = h("span", "", LOCALE === "pt-BR" ? "Idioma do Vocabulário:" : "Word Bank Language:");
        langLabel.style.fontSize = "0.85rem";
        langLabel.style.color = "var(--ink-2)";

        const ptBtn = button("ghost", "🇧🇷 Português");
        const enBtn = button("ghost", "🇺🇸 English");

        const grid = h("div", "oracle-sparks-grid");

        const cols: {
          key: keyof SparkWordLists;
          icon: string;
          labelPt: string;
          labelEn: string;
          hintPt: string;
          hintEn: string;
          textarea?: HTMLTextAreaElement;
          countEl?: HTMLElement;
        }[] = [
          {
            key: "action",
            icon: "⚡",
            labelPt: "Ação (Action)",
            labelEn: "Action",
            hintPt: "Verbos de movimento, conflito e impacto",
            hintEn: "Verbs of motion, conflict, and impact",
          },
          {
            key: "theme",
            icon: "🌌",
            labelPt: "Tema (Theme)",
            labelEn: "Theme",
            hintPt: "Conceitos, mistérios, ideias e atmosferas",
            hintEn: "Concepts, mysteries, ideas, and atmospheres",
          },
          {
            key: "descriptor",
            icon: "🔍",
            labelPt: "Descritor (Descriptor)",
            labelEn: "Descriptor",
            hintPt: "Adjetivos, qualidades e estados de coisas",
            hintEn: "Adjectives, qualities, and states of being",
          },
          {
            key: "focus",
            icon: "🎯",
            labelPt: "Foco (Focus)",
            labelEn: "Focus",
            hintPt: "Alvos, objetos, entidades, perigos e locais",
            hintEn: "Targets, items, entities, hazards, and places",
          },
        ];

        const refreshTextareas = () => {
          if (activeLang === "pt") {
            ptBtn.className = "btn-secondary";
            enBtn.className = "btn-ghost";
          } else {
            ptBtn.className = "btn-ghost";
            enBtn.className = "btn-secondary";
          }
          const words = getSparkWords(activeLang);
          for (const col of cols) {
            if (col.textarea && col.countEl) {
              const list = words[col.key] || [];
              col.textarea.value = list.join("\n");
              col.countEl.textContent = `(${list.length})`;
            }
          }
        };

        ptBtn.addEventListener("click", () => { activeLang = "pt"; refreshTextareas(); });
        enBtn.addEventListener("click", () => { activeLang = "en"; refreshTextareas(); });
        langBar.append(langLabel, ptBtn, enBtn);

        for (const col of cols) {
          const colEl = h("div", "oracle-spark-col");
          const labelWrap = h("div", "oracle-spark-col-label");
          const nameSpan = h("span", "oracle-spark-col-name", `${col.icon} ${LOCALE === "pt-BR" ? col.labelPt : col.labelEn}`);
          const countSpan = h("span", "");
          countSpan.style.fontSize = "0.75rem";
          countSpan.style.color = "var(--ink-3)";
          col.countEl = countSpan;
          labelWrap.append(nameSpan, countSpan);

          const hintEl = h("div", "oracle-spark-col-hint", LOCALE === "pt-BR" ? col.hintPt : col.hintEn);

          const ta = h("textarea", "oracle-spark-textarea") as HTMLTextAreaElement;
          ta.rows = 5;
          col.textarea = ta;
          ta.addEventListener("input", () => {
            const count = ta.value.split(/[\n,]+/).map(w => w.trim()).filter(Boolean).length;
            countSpan.textContent = `(${count})`;
          });

          colEl.append(labelWrap, hintEl, ta);
          grid.append(colEl);
        }

        refreshTextareas();

        const actions = h("div", "");
        actions.style.display = "flex";
        actions.style.alignItems = "center";
        actions.style.gap = "0.6rem";
        actions.style.flexWrap = "wrap";
        actions.style.marginTop = "0.5rem";

        const saveBtn = button("primary", LOCALE === "pt-BR" ? "Salvar Vocabulário" : "Save Words");
        saveBtn.addEventListener("click", () => {
          const parsed: SparkWordLists = {
            action: (cols[0]?.textarea?.value || "").split(/[\n,]+/).map(w => w.trim()).filter(Boolean),
            theme: (cols[1]?.textarea?.value || "").split(/[\n,]+/).map(w => w.trim()).filter(Boolean),
            descriptor: (cols[2]?.textarea?.value || "").split(/[\n,]+/).map(w => w.trim()).filter(Boolean),
            focus: (cols[3]?.textarea?.value || "").split(/[\n,]+/).map(w => w.trim()).filter(Boolean),
          };
          saveSparkWords(activeLang, parsed);
          saveBtn.textContent = LOCALE === "pt-BR" ? "✓ Salvo!" : "✓ Saved!";
          setTimeout(() => {
            saveBtn.textContent = LOCALE === "pt-BR" ? "Salvar Vocabulário" : "Save Words";
          }, 1800);
        });

        const resetBtn = button("ghost", LOCALE === "pt-BR" ? "Restaurar Palavras Padrão" : "Restore Built-in Words");
        resetBtn.addEventListener("click", () => {
          if (confirm(LOCALE === "pt-BR" ? `Deseja restaurar as palavras padrão (${activeLang})?` : `Reset ${activeLang} word lists to default?`)) {
            resetSparkWords(activeLang);
            refreshTextareas();
          }
        });

        const testBox = h("span", "");
        testBox.style.fontSize = "0.85rem";
        testBox.style.fontStyle = "italic";
        testBox.style.color = "var(--brass-ink)";
        testBox.style.marginLeft = "0.5rem";

        const testBtn = button("ghost", LOCALE === "pt-BR" ? "🎲 Testar Faísca" : "🎲 Roll Test");
        testBtn.addEventListener("click", () => {
          const spark = generateSpark(activeLang);
          testBox.textContent = spark.formatted;
        });

        actions.append(saveBtn, resetBtn, testBtn, testBox);
        wrap.append(langBar, grid, actions);
        return wrap;
      }
    );
    add(
      "oracles",
      LOCALE === "pt-BR" ? "Tabelas de Oráculo Personalizadas" : "Custom Oracle Tables",
      LOCALE === "pt-BR"
        ? "Crie suas próprias tabelas de sorteio aleatório ou importe tabelas JSON para usar no painel do Oráculo."
        : "Create your own random rollable tables or import JSON tables for the Oracle.",
      () => {
        const wrap = h("div", "oracle-settings-section");
        const all = getAllOracleTables();

        const topBar = h("div", "");
        topBar.style.display = "flex";
        topBar.style.gap = "0.6rem";
        topBar.style.marginBottom = "0.6rem";

        const newBtn = button("primary", LOCALE === "pt-BR" ? "+ Nova Tabela" : "+ New Table");
        const importBtn = button("ghost", LOCALE === "pt-BR" ? "Importar JSON…" : "Import JSON…");
        const exportAllBtn = button("ghost", LOCALE === "pt-BR" ? "Exportar Todas (JSON)" : "Export All (JSON)");

        topBar.append(newBtn, importBtn, exportAllBtn);

        const listWrap = h("div", "oracle-custom-tables-list");

        const openTableEditor = (existing?: OracleTable) => {
          const name = prompt(LOCALE === "pt-BR" ? "Nome da tabela:" : "Table name:", existing?.name || "");
          if (!name) return;
          const desc = prompt(LOCALE === "pt-BR" ? "Descrição curta ou objetivo:" : "Short description or purpose:", existing?.desc || "");
          const entriesRaw = prompt(LOCALE === "pt-BR" ? "Itens da tabela (separados por ponto e vírgula ';' ou quebra de linha):" : "Table entries (separated by semicolon ';' or newlines):", existing ? existing.entries.join(" ; ") : "");
          if (!entriesRaw) return;
          const entries = entriesRaw.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
          if (entries.length === 0) {
            alert(LOCALE === "pt-BR" ? "A tabela precisa de pelo menos 1 item." : "Table must have at least 1 entry.");
            return;
          }
          const tableObj: OracleTable = {
            id: existing?.id || `custom-table-${Date.now()}`,
            name,
            desc: desc || "",
            icon: existing?.icon || "dice",
            entries,
          };
          saveCustomOracleTable(tableObj);
          ctx.paint();
        };

        newBtn.addEventListener("click", () => openTableEditor());

        importBtn.addEventListener("click", () => {
          const json = prompt(LOCALE === "pt-BR" ? "Cole o JSON da tabela (OracleTable ou lista):" : "Paste the Oracle Table JSON:");
          if (!json) return;
          try {
            const parsed = JSON.parse(json);
            const tables = Array.isArray(parsed) ? parsed : [parsed];
            for (const t of tables) {
              if (t && typeof t.name === "string" && Array.isArray(t.entries)) {
                saveCustomOracleTable({
                  id: t.id || `custom-table-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  name: t.name,
                  desc: t.desc || "",
                  icon: t.icon || "dice",
                  entries: t.entries.map(String),
                });
              }
            }
            ctx.paint();
            alert(LOCALE === "pt-BR" ? "Tabela(s) importada(s) com sucesso!" : "Table(s) imported successfully!");
          } catch (err: any) {
            alert((LOCALE === "pt-BR" ? "Erro ao importar JSON: " : "Error importing JSON: ") + (err?.message || err));
          }
        });

        exportAllBtn.addEventListener("click", () => {
          const json = JSON.stringify(all, null, 2);
          navigator.clipboard.writeText(json).then(() => {
            exportAllBtn.textContent = LOCALE === "pt-BR" ? "Copiado!" : "Copied!";
            setTimeout(() => {
              exportAllBtn.textContent = LOCALE === "pt-BR" ? "Exportar Todas (JSON)" : "Export All (JSON)";
            }, 2000);
          });
        });

        for (const tbl of all) {
          const isBuiltin = tbl.id === "twists" || tbl.id === "complications" || tbl.id === "atmosphere" || tbl.id === "npc_intent";
          const row = h("div", "oracle-custom-table-row");

          const info = h("div", "oracle-custom-table-info");
          const titleBox = h("div", "");
          titleBox.style.display = "flex";
          titleBox.style.alignItems = "center";
          titleBox.style.gap = "0.5rem";

          const nameEl = h("span", "oracle-custom-table-name", tbl.name);
          const badge = h("span", isBuiltin ? "statblock-pill-tag" : "statblock-pill-default", isBuiltin ? (LOCALE === "pt-BR" ? "Nativa" : "Built-in") : "Custom");
          const countBadge = h("span", "");
          countBadge.style.fontSize = "0.74rem";
          countBadge.style.color = "var(--ink-3)";
          countBadge.textContent = `(${tbl.entries.length} ${tbl.entries.length === 1 ? "item" : "itens"})`;

          titleBox.append(nameEl, badge, countBadge);

          const descEl = h("span", "oracle-custom-table-desc", tbl.desc);
          info.append(titleBox, descEl);

          const actions = h("div", "oracle-custom-table-actions");

          const viewBtn = button("ghost", isBuiltin ? (LOCALE === "pt-BR" ? "Visualizar" : "View") : (LOCALE === "pt-BR" ? "Editar" : "Edit"));
          viewBtn.addEventListener("click", () => {
            if (isBuiltin) {
              alert(`${tbl.name}\n\n${tbl.entries.map((e, idx) => `${idx + 1}. ${e}`).join("\n")}`);
            } else {
              openTableEditor(tbl);
            }
          });
          actions.append(viewBtn);

          const jsonBtn = button("ghost", "JSON");
          jsonBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(JSON.stringify(tbl, null, 2)).then(() => {
              jsonBtn.textContent = "Copiado!";
              setTimeout(() => (jsonBtn.textContent = "JSON"), 1800);
            });
          });
          actions.append(jsonBtn);

          if (!isBuiltin) {
            const delBtn = button("ghost", LOCALE === "pt-BR" ? "Excluir" : "Delete");
            delBtn.addEventListener("click", () => {
              if (confirm(LOCALE === "pt-BR" ? `Deseja excluir a tabela "${tbl.name}"?` : `Delete table "${tbl.name}"?`)) {
                deleteCustomOracleTable(tbl.id);
                ctx.paint();
              }
            });
            actions.append(delBtn);
          }

          row.append(info, actions);
          listWrap.append(row);
        }

        wrap.append(topBar, listWrap);
        return wrap;
      }
    );
  return out;
}
