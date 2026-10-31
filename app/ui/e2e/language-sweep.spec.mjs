// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The product is pt-BR and EN from the first commit (ADR 0035): a window in
// one language shows none of the other's words. This sweep opens the
// window's screens in English and in Portuguese, on an empty folder with
// notes written here in the language under test (so the person's own
// content cannot leak), reads every visible word and every accessible name
// (aria-label, title, placeholder, alt), and fails on a word that is
// unmistakably the other language's. It is a guard, not a proof: a screen
// it does not open is a screen it does not read — add it to SCREENS.
//
// What is allowed through (ALLOWED) is a proper name or a name the product
// keeps in its own language on purpose, each with its reason.

import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { expect, test } from "./fixtures.mjs";

const SAMPLES = new URL("../src/statblock/builtin/samples/", import.meta.url);

/** Words that are unmistakably Portuguese (never an English word). */
const PT_WORDS = [
  "nota", "notas", "abrir", "pasta", "pastas", "configurações", "salvar", "arquivo", "arquivos", "cancelar", "fechar", "apagar", "renomear",
  "buscar", "voltar", "ajustes", "aparência", "localizar", "substituir", "nenhum", "nenhuma", "novo", "nova", "criar", "você", "não", "uma",
  "para", "ficha", "fichas", "dados", "rolar", "oráculo", "mapa", "sincronização", "servidor", "conta", "ligar", "desligar", "ativar", "padrão",
  "tema", "tamanho", "ordem", "ordenar", "mostrar", "ocultar", "ajuda", "atalhos", "obstáculos", "reservas", "descrição", "anotações",
  "quebrado", "quebrados", "jogador", "rolagem", "antecipação", "consequência", "gatilho", "desafio", "fatos", "cofre", "ajuste", "tecla",
  "teclas", "cores", "cor", "fonte", "linha", "linhas", "texto", "título", "títulos", "esquerda", "direita", "acima", "abaixo",
];
/** Words that are unmistakably English, in a Portuguese window. */
const EN_WORDS = [
  "the", "and", "with", "your", "you", "this", "that", "cancel", "delete", "folder", "folders", "settings", "please", "from", "are", "not",
  "save", "open", "close", "new", "file", "files", "rename", "empty", "loading", "failed", "click", "drag", "choose", "select", "show",
  "hide", "enable", "disable", "default", "left", "above", "below", "roll", "account", "notes",
];
const word = (list) => new RegExp(`(?<![\\p{L}\\p{N}])(${list.join("|")})(?![\\p{L}\\p{N}])`, "iu");
const PT_CHARS = /[ãõçáéíóúâêôà]/i;

/** Names the product keeps as they are, whatever the language. */
const ALLOWED = [
  /(?:Vampire|Hunter|Werewolf): The \w+, World of Darkness and related terms[^]*/g, // Paradox's trademark notice, required in English (credits page)
  /Delete exclui/g, // a key name in the editor's keyboard help
  /Português \(Brasil\)/g, // the language's own name, in its own language
  /English/g,
  /No diagram type detected[^]*/g, // Mermaid's own parser message, shown under the app's title; the library has one language
  /file\.name/g, // a formula of the bases, code
  /xdg-mime default [\w.-]+ text\/markdown/g, // a terminal command (single-file mode, ADR 0114), code
  /Português/g, // "Import the demo content in Portuguese (Português)": a language is named in itself
  /pasta-vazia/g, // the harness's empty folder, named in Portuguese
  /“Porto”, “Mesa”, “Ordem”/g, // example names in a setting's explanation
  /Dados Críticos/g, // a trademark (ADR 0098: the vault whose structure the campaign bundle follows)
  /Esse trabalho é compatível com Fractal[^]*|Old Dragon 2ª Edição[^]*/g, // licence notices, required in the licensor's own words
  /Hunter: The Reckoning|Vampire: The Masquerade|Werewolf: The Apocalypse|Blades in the Dark|Powered by the Apocalypse|Dark Pack|Fantasy Statblocks|Open Game License/g, // game and licence names
  /Sérgio|Téuri|Licínio|Críticos|Saraç|Érika|Brandão|Antonio Sá Neto/g, // authors and trademarks of the credits
  /Catppuccin Frappé|Rosé Pine(?: Moon)?|Mapa de Conteúdo|José Daniel Mourão/g, // catalogue themes named for their sources, and their authors (ADR 0109 item 7): credits page and More themes
];

/** Runs in the page: every visible word and accessible name, one per line. */
function readScreen() {
  const out = [];
  const shown = (el) => (el.checkVisibility ? el.checkVisibility({ checkVisibilityCSS: true }) : true);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
    const text = n.textContent.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (el.tagName === "OPTION" ? shown(el.closest("select") ?? el) : shown(el)) out.push(text);
  }
  for (const el of document.querySelectorAll("[aria-label], [title], [placeholder], [alt], [aria-description], [aria-roledescription]")) {
    if (!shown(el)) continue;
    for (const a of ["aria-label", "title", "placeholder", "alt", "aria-description", "aria-roledescription"]) {
      const v = el.getAttribute(a);
      if (v && v.trim()) out.push(`${v.trim()}`);
    }
  }
  return [...new Set(out)];
}

const SHEETS = readdirSync(SAMPLES)
  .filter((f) => f.endsWith(".yaml"))
  .sort()
  .map((f) => f.slice(0, -5));

/** The notes written into the empty folder, in the language under test. */
function notes(lang) {
  const en = lang === "en";
  const files = {
    [en ? "Welcome.md" : "Boas-vindas.md"]: en
      ? "---\ntags: [test]\n---\n# Welcome\n\nA line with [[Other]] and a #tag.\n\n- [ ] a task\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n> [!note] A callout\n> Body.\n\n```dice\n2d6+1\n```\n\n^block\n\n```mermaid\n??? ###\n```\n\n![[gone.pdf]]\n"
      : "---\ntags: [teste]\n---\n# Boas-vindas\n\nUma linha com [[Outra]] e uma #etiqueta.\n\n- [ ] uma tarefa\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n> [!note] Um destaque\n> Corpo.\n\n```dice\n2d6+1\n```\n\n^bloco\n\n```mermaid\n??? ###\n```\n\n![[gone.pdf]]\n",
    [en ? "Other.md" : "Outra.md"]: en ? "# Other\n\nLinks back to [[Welcome]].\n" : "# Outra\n\nVolta para [[Boas-vindas]].\n",
    "mesa.json": JSON.stringify({ campaign: "A", npcs: [{ name: "R", gear: { w: "s" } }] }, null, 2) + "\n",
  };
  for (const id of SHEETS) {
    files[`${en ? "Sheet" : "Ficha"} ${id}.md`] = `# ${id}\n\n\`\`\`statblock\nlayout: ${id}\n${readFileSync(new URL(`${id}.yaml`, SAMPLES), "utf8")}\`\`\`\n`;
  }
  return files;
}

const LABELS = {
  en: { quick: "Open…", palette: "Commands", dice: "Roll dice", oracle: "Oracle", world: "New project from a template", graph: "Vault graph", board: "New board", diagram: "Diagram", menuNew: "New", dialogs: ["Find and replace in the vault", "Insert template", "Report a problem", "Switch focus", "Notifications", "Version history", "New web page", "Save this note as a template", "Import files", "New base"] },
  pt: { quick: "Abrir…", palette: "Comandos", dice: "Rolar dados", oracle: "Oráculo", world: "Novo projeto a partir de modelo", graph: "Grafo do cofre", board: "Novo board", diagram: "Diagrama", menuNew: "Novo", dialogs: ["Localizar e substituir no cofre", "Inserir template", "Relatar problema", "Trocar foco", "Notificações", "Histórico de versões", "Nova página web", "Salvar esta nota como template", "Importar arquivos", "Nova base"] },
};

async function sweepLanguage(app, page, lang, project) {
  const L = LABELS[lang];
  const leaks = [];
  page.setDefaultTimeout(4000);
  const log = (m) => process.env.VERSO_SWEEP_LOG && appendFileSync(process.env.VERSO_SWEEP_LOG, `${lang} ${m}\n`);
  const wordRe = word(lang === "en" ? PT_WORDS : EN_WORDS);
  const check = async (screen, own = "") => {
    // Licence notices of other publishers are in their own language, by law.
    if (lang === "pt" && /Créditos/.test(screen)) return;
    for (const line of await page.evaluate(readScreen)) {
      let text = line;
      for (const re of ALLOWED) text = text.replace(re, " ");
      // The words of a sample's own data (a name, a note in the game's
      // language) are the person's content, not the window's.
      if (own) text = text.replace(/[\p{L}\p{N}]+/gu, (w) => (own.includes(w) ? " " : w));
      // The English window: a Portuguese word or an accented letter. The
      // Portuguese window: an English word (its accents are its own).
      const hit = wordRe.exec(text)?.[0] ?? (lang === "en" ? PT_CHARS.exec(text)?.[0] : undefined);
      if (hit) leaks.push(`${screen}: "${hit}" in «${line.slice(0, 110)}»`);
    }
  };
  const visit = async (screen, go, { own = "", keep = false } = {}) => {
    log(`visit ${screen}`);
    try {
      await go();
      await page.waitForTimeout(150);
      await check(screen, own);
    } catch (e) {
      log(`  failed ${screen}: ${String(e.message).split("\n")[0]}`);
      leaks.push(`${screen}: could not be reached (${String(e.message).split("\n")[0]})`);
    }
    if (!keep) await page.keyboard.press("Escape").catch(() => {});
  };
  const closeAll = async () => {
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("Escape");
  };

  await app.open("?vault=empty");
  const files = notes(lang);
  for (const [p, text] of Object.entries(files)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(files), true);
  const first = Object.keys(files)[0];
  const second = Object.keys(files)[1];

  await visit("main window", async () => {});
  await visit("palette", async () => {
    await app.key("Mod+Shift+p");
    await expect(page.locator(".palette:not([hidden]), .quick:not([hidden])").first()).toBeVisible();
  });
  await closeAll();
  await visit("quick switcher", async () => {
    await app.key("Mod+p");
    await page.keyboard.type("a");
  });
  await closeAll();

  // The ribbon's "+" and the tree's menu, with every submenu opened.
  const openSubs = async () => {
    for (let i = 0; i < 6; i += 1) {
      const subs = page.locator(".menu:not([hidden]) button.has-sub[aria-expanded=false]");
      if ((await subs.count()) === 0) break;
      await subs.first().click();
    }
  };
  await visit("ribbon + menu", async () => {
    await page.locator('.ribbon-item[data-id="new"]').click();
    await expect(page.locator(".menu:not([hidden])")).toBeVisible();
    // The menu has a name, in the window's language.
    await expect(page.getByRole("menu", { name: L.menuNew, exact: true }).first()).toBeVisible();
  });
  await closeAll();
  await visit("tree menu", async () => {
    await page.locator("#tree, .tree").first().click({ button: "right", position: { x: 20, y: 400 } });
    await openSubs();
  });
  await closeAll();
  await visit("file menu", async () => {
    await page.locator(".tree button.row", { hasText: first.replace(/\.md$/, "") }).first().click({ button: "right" });
    await openSubs();
  });
  await closeAll();

  // A note: reading, editing, source, the find panel with its replace row.
  await app.quickOpen(first.replace(/\.md$/, ""), L.quick);
  await visit("note, reading", async () => {
    await expect(page.locator(".preview:visible").first()).toBeVisible();
  });
  await visit("tab menu", async () => {
    await page.locator(".tab").first().click({ button: "right" });
    await openSubs();
  });
  await closeAll();
  await visit("find in reading", async () => {
    await app.key("Mod+f");
    await page.waitForTimeout(100);
    await page.keyboard.type("zzz(");
    const toggle = page.locator(".verso-search-toggle:visible").first();
    if (await toggle.count()) await toggle.click();
  });
  await closeAll();
  await app.key("Mod+e");
  await visit("note, editing", async () => {
    await expect(page.locator(".cm-content:visible").first()).toBeVisible();
  });
  await visit("find in editor", async () => {
    await app.key("Mod+f");
    await page.waitForTimeout(100);
    await page.keyboard.type("zzz");
    const toggle = page.locator(".verso-search-toggle:visible").first();
    if (await toggle.count()) await toggle.click();
  });
  await closeAll();
  await visit("slash menu", async () => {
    await page.locator(".cm-content:visible").first().click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
  });
  await closeAll();
  await visit("note properties, links panel", async () => {
    await app.key("Mod+Alt+b").catch(() => {});
    await page.locator(".right-tab, .side-right button").first().click({ timeout: 1000 }).catch(() => {});
  });
  await app.key("Mod+e");

  // A node under the pointer opens its note's hover preview (it settles under
  // a pointer left by an earlier click, or not, by timing), and a sheet's
  // preview shows its YAML as written: the person's content, in the game's
  // language, which is no word of the window's.
  const sheetsText = SHEETS.map((id) => readFileSync(new URL(`${id}.yaml`, SAMPLES), "utf8")).join("\n");
  await visit("graph", async () => {
    await app.command(L.graph);
    await page.waitForTimeout(500);
  }, { own: sheetsText });
  await closeAll();

  // The settings, every section.
  await app.key("Mod+,");
  const sections = await page.locator(".settings-nav-item").count();
  expect(sections).toBeGreaterThan(8);
  for (let i = 0; i < sections; i += 1) {
    const item = page.locator(".settings-nav-item").nth(i);
    const label = ((await item.textContent()) ?? `#${i}`).trim();
    await visit(`settings › ${label}`, async () => {
      await item.click();
    }, { keep: true });
  }
  await closeAll();

  await visit("dice roller", async () => {
    await app.command(L.dice);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.type("2d6 + 1");
    await page.keyboard.press("Enter");
  });
  await closeAll();
  await visit("dice roller, a bad notation", async () => {
    await app.command(L.dice);
    await page.keyboard.type("1d20*2");
    await page.keyboard.press("Enter");
  });
  await closeAll();
  await visit("oracle", async () => {
    await app.command(L.oracle);
    await expect(page.getByRole("dialog")).toBeVisible();
  }, { keep: true });
  await visit("oracle, asked", async () => {
    await page.keyboard.type(lang === "en" ? "Will it rain?" : "Vai chover?");
    await page.keyboard.press("Enter");
  });
  await closeAll();
  await visit("world wizard", async () => {
    await app.command(L.world);
    await expect(page.getByRole("dialog")).toBeVisible();
  }, { keep: true });
  const cards = await page.locator(".world-bundle-card").count();
  for (let i = 0; i < cards; i += 1) {
    await visit(`world wizard, template ${i + 1}`, async () => {
      await page.locator(".world-bundle-card").nth(i).click();
    }, { keep: true });
  }
  await visit("world wizard, create", async () => {
    await page.locator(".world-name-input").fill("Test");
    await page.locator(".world-actions button").first().click();
  }, { keep: true });
  await visit("world wizard, AI tab", async () => {
    await page.locator(".world-tab-btn").last().click();
  }, { keep: true });
  await closeAll();

  // The statblock of each built-in layout.
  for (const id of SHEETS) {
    await visit(`statblock ${id}`, async () => {
      await app.quickOpen(`${lang === "en" ? "Sheet" : "Ficha"} ${id}`, L.quick);
      await expect(page.locator(".preview:visible .statblock-card").first()).toBeVisible();
    }, { own: readFileSync(new URL(`${id}.yaml`, SAMPLES), "utf8") + (lang === "pt" ? readFileSync(new URL(`../${id}.json`, SAMPLES), "utf8") : "") });
  }

  // The layout editor, from Settings › Statblock templates.
  await visit("layout editor", async () => {
    await app.key("Mod+,");
    await page.locator(".settings-nav-item", { hasText: lang === "en" ? "Statblock" : "Fichas" }).click();
    await page.locator(".statblock-gallery-card").getByRole("button", { name: lang === "en" ? "Edit" : "Editar", exact: true }).first().click();
    // The editor opens once the layout's copy is written: Escape or ⌘P before
    // that find nothing to close, and the editor then covers what they opened.
    await expect(page.locator(".sbe-shade")).toBeVisible();
  }, { keep: true });
  await closeAll();
  await closeAll();

  await visit("data diagram", async () => {
    // On the Mac's WebKit a ⌘P sent in the same moment Settings finishes
    // closing is sometimes not heard (never seen in Docker; the switcher
    // after the layout editor is held by quick-after-layout-editor.spec).
    // This sweep reads words, so it tries again once.
    await expect(async () => {
      await page.keyboard.press("Escape");
      await app.quickOpen("mesa", L.quick);
    }).toPass({ timeout: 15_000 });
    await page.getByRole("button", { name: L.diagram, exact: true }).click();
    await page.waitForTimeout(400);
  });
  await closeAll();
  await visit("new board and its toolbar", async () => {
    page.setDefaultTimeout(20_000);
    await app.command(L.board);
    await page.waitForFunction(() => (window.__VERSO_TEST__?.board?.getAppState().width ?? 0) > 0);
  });
  page.setDefaultTimeout(4000);
  await closeAll();
  await app.quickOpen(second.replace(/\.md$/, ""), L.quick);
  await visit("second note", async () => {});
  // Dialogs and prompts the palette opens, each on the open note.
  for (const label of L.dialogs) {
    await visit(`command: ${label}`, async () => {
      await app.command(label);
      await page.waitForTimeout(300);
    });
    await closeAll();
  }

  if (process.env.VERSO_SWEEP_LOG) appendFileSync(process.env.VERSO_SWEEP_LOG, `=== ${lang} ${project}\n${leaks.join("\n")}\n`);
  expect(leaks, `${lang} window: words of the other language`).toEqual([]);
}

test.describe("English window", () => {
  test.use({ locale: "en-US" });
  test("shows no Portuguese", async ({ app, page }, info) => {
    test.setTimeout(600_000);
    await sweepLanguage(app, page, "en", info.project.name);
  });
});

test.describe("Portuguese window", () => {
  test.use({ locale: "pt-BR" });
  test("shows no English", async ({ app, page }, info) => {
    test.setTimeout(600_000);
    await sweepLanguage(app, page, "pt", info.project.name);
  });
});
