// Statblock cards as a page (ADR 0099): every built-in layout's sample,
// and the cases a sample does not reach (a Blood Hawk, three columns, a
// collapse, twelve boxes, a number tracker, the badges), drawn at a phone's,
// a narrow pane's and a wide pane's width and in two panes, in light and in
// dark. Read by machine, not by eye: no two things of a card — a word, a
// die, a box, a button — drawn over each other, nothing past its card or
// its cell, and a die rolled in the ability scores showing its result over
// the card without moving it. Off a Mac each card is kept as a picture
// (e2e/results/statblock-shots/), the pictures read after a change of the
// card's design; on a Mac none is taken (playwright.config.mjs).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "./fixtures.mjs";

const SAMPLES = new URL("../src/statblock/builtin/samples/", import.meta.url);
const SHOTS = process.platform !== "darwin";
/** Where a card's picture is kept: e2e/results/statblock-shots/<engine>/. */
const shot = (info, file) => join(info.project.outputDir, "statblock-shots", info.project.name, file);

const BLOOD_HAWK = `name: Blood Hawk
image: "[[porto-cinzento.svg]]"
size: Small
type: beast
alignment: unaligned
ac: 12
hp: 7
hit_dice: 2d6
speed: 10 ft., fly 60 ft.
stats: [6, 14, 10, 3, 14, 5]
skillsaves:
  - perception: 4
senses: passive Perception 14
languages: "—"
cr: 1/8
traits:
  - name: Keen Sight
    desc: Our own words for a sharp eye, a bonus in brackets (+5) and a die in the middle of a long sentence, 1d4 + 2, and one more at its end, 2d6.
  - name: Pack Tactics
    desc: A second trait of our own, long enough to wrap over three lines of a narrow pane so that its dice sit at the end of a line and at the start of the next one, 1d20-2.
actions:
  - name: Beak
    desc: "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 4 (1d4 + 2) piercing damage."
`;

const AUDIT_LAYOUT = {
  version: 1,
  id: "sb-audit",
  name: "Auditoria",
  columns: 3,
  columnWidth: 240,
  diceRules: [{ pattern: String.raw`\b(\d{0,3}d(?:\d{1,4}|%|F)(?: ?[+-] ?\d{1,5})?)\b`, template: "$1" }],
  blocks: [
    { type: "heading", id: "n", properties: ["name"], size: 1, rule: true },
    { type: "table", id: "tab", properties: ["stats"], headers: ["Força", "Destreza", "Constituição", "Inteligência", "Sabedoria", "Carisma"], modifier: "d20", dice: true },
    { type: "tracker", id: "b12", properties: [], label: "Doze caixas", current: "caixas", max: "caixas_max", style: "boxes" },
    { type: "tracker", id: "num", properties: [], label: "Pontos de vida", current: "pv", max: "pv_max", style: "number" },
    { type: "collapse", id: "c", properties: [], label: "Recolhido", open: true, nested: [{ type: "text", id: "t", properties: ["texto"], dice: true }] },
    { type: "traits", id: "tr", properties: ["coisas"], label: "Coisas", dice: true },
    { type: "property", id: "p", properties: ["longo"], label: "Palavra longa" },
  ],
};

const AUDIT = `layout: sb-audit
name: Auditoria de colunas
stats: [18, 3, 30, 1, 10, 11]
caixas: 7
caixas_max: 12
pv: 23
pv_max: 40
texto: Um parágrafo dentro de um bloco recolhido, com um dado 3d8+4 no meio e mais um 1d100 no fim.
coisas:
  - name: Primeira coisa
    desc: Uma descrição longa o bastante para quebrar em várias linhas numa coluna estreita, com 2d6 e 1d20+5.
  - name: Segunda coisa
    desc: Mais texto, e 4dF.
longo: Pneumoultramicroscopicossilicovulcanoconiótico-sem-espaços-nenhum-para-quebrar
`;

const FRACTAL = `layout: fractal-character
name: Yara do Farol
jogador: Letícia
xp: 4
reserva_1_nome: Coragem
reserva_1_atual: 3
reserva_1_total: 3
reserva_2_nome: Fôlego com um nome bem comprido para quebrar a linha
reserva_2_atual: 2
reserva_2_total: 12
fatos:
  - nome: Guardiã do farol velho, um fato longo que quebra a linha antes do botão
    quebrado: false
  - nome: "[[Ninho de Krard]]"
    quebrado: true
anotacoes: Procurar a luz que não é do farol. 2d6.
fatos_aplicaveis: 2
`;

/** Every case: a sample per built-in layout, then the others. */
const CASES = [
  ...readdirSync(SAMPLES)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => ({ id: f.slice(0, -5), text: `layout: ${f.slice(0, -5)}\n${readFileSync(new URL(f, SAMPLES), "utf8")}` })),
  { id: "blood-hawk", text: BLOOD_HAWK },
  { id: "fractal-yara", text: FRACTAL },
  { id: "audit-3-columns", text: AUDIT },
  { id: "unknown-layout", text: "layout: Nenhum Assim\nname: Goblin\nac: 15\nhp: 7 (2d6)\nstats: [8, 14, 10, 10, 8, 8]\n" },
  { id: "invalid-yaml", text: "name: [Goblin\nac: 15\n" },
  { id: "too-large", text: `name: Grande\nnotes: "${"x".repeat(270 * 1024)}"\n` },
].map((c, i) => ({ ...c, note: `Ficha ${String(i + 1).padStart(2, "0")} ${c.id}` }));

const noteText = (c) => `Marcador ${c.id}.\n\n\`\`\`statblock\n${c.text}\`\`\`\n\nDepois de ${c.id}.\n`;

/** The page widths, and whether the pane is split in two. */
const WIDTHS = [
  { name: "phone", width: 375, height: 800 },
  { name: "narrow", width: 760, height: 900 },
  { name: "wide", width: 1400, height: 1000 },
  { name: "split", width: 1400, height: 1000, split: true },
];

/** What is wrong with a card's drawing, in words: two things drawn over
 *  each other, a thing past its card or its cell, a box whose content is
 *  wider than it. Runs in the page. */
function auditCard(card) {
  const problems = [];
  const INTER = "button, a, input, select, img, .statblock-box, .statblock-flag-mark, .statblock-image";
  const shown = (el) => {
    if (el.closest("[hidden], .sr-only, .dice-card")) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const name = (el) => {
    const t = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} "${t}"`;
  };
  const blockOf = (el) => el.closest(".statblock-score, .statblock-trait, .statblock-paragraph, .statblock-block") ?? card;
  const atoms = [];
  for (const el of card.querySelectorAll(INTER)) {
    if (!shown(el) || (el.parentElement && el.parentElement.closest(INTER))) continue;
    atoms.push({ el, r: el.getBoundingClientRect(), what: name(el), block: blockOf(el) });
  }
  const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.data.trim()) continue;
    const p = n.parentElement;
    if (!p || !shown(p) || p.closest(INTER) || p.closest("pre")) continue;
    const range = document.createRange();
    // Each word of the text by itself: a line's run would take in the
    // spaces either side of it.
    const re = /\S+/g;
    for (let m = re.exec(n.data); m; m = re.exec(n.data)) {
      range.setStart(n, m.index);
      range.setEnd(n, m.index + m[0].length);
      for (const r of range.getClientRects()) if (r.width > 0.5) atoms.push({ el: p, r, what: `text "${m[0].slice(0, 30)}"`, block: blockOf(p), text: true });
    }
  }
  const cardBox = card.getBoundingClientRect();
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    if (a.r.left < cardBox.left - 1 || a.r.right > cardBox.right + 1) problems.push(`past the card: ${a.what}`);
    const cell = a.el.closest(".statblock-score");
    if (cell) {
      const c = cell.getBoundingClientRect();
      if (a.r.left < c.left - 1 || a.r.right > c.right + 1) problems.push(`past its cell: ${a.what}`);
    }
    for (let j = i + 1; j < atoms.length; j++) {
      const b = atoms[j];
      if (a.el !== b.el && (a.el.contains(b.el) || b.el.contains(a.el)) && !(a.text || b.text)) continue;
      const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (x <= 1 || y <= 1) continue;
      // Two lines one over the other: a font's ascent and descent reach
      // past its line box by a pixel or two; a die is a line's height. A
      // real overlap shares the line.
      const lines = Math.abs((a.r.top + a.r.bottom) / 2 - (b.r.top + b.r.bottom) / 2) > Math.min(a.r.height, b.r.height) / 2;
      if (lines && y <= 3) continue;
      problems.push(`over each other: ${a.what} and ${b.what} (${x.toFixed(1)}×${y.toFixed(1)} px)`);
    }
  }
  for (const el of [card, ...card.querySelectorAll("*")]) {
    // An open result is over the card on purpose: what holds it is not
    // wider for it (its own place is checked against the card's).
    if (!shown(el) || el.closest("pre") || el.querySelector(".dice-pop > .dice-card:not([hidden])")) continue;
    const cs = getComputedStyle(el);
    if (cs.display.startsWith("inline") && cs.display !== "inline-block" && cs.display !== "inline-flex") continue;
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) problems.push(`wider inside than out: ${name(el)} (${el.scrollWidth} > ${el.clientWidth})`);
  }
  return [...new Set(problems)];
}

async function setup(app, page, size, scheme) {
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await app.open();
  await page.evaluate(
    (text) => window.__TAURI_INTERNALS__.invoke("write_folder_data", { kind: "layouts", id: "sb-audit", text, revision: null }),
    JSON.stringify(AUDIT_LAYOUT),
  );
  for (const c of CASES) await app.writeOutside(`${c.note}.md`, noteText(c));
  await app.folderChanged([...CASES.map((c) => `${c.note}.md`), ".verso/layouts/sb-audit.json"], true);
  if (size.split) {
    // A note in the first pane, then the second beside it: the cards are
    // drawn in the second, half the window wide.
    await app.quickOpen(CASES[0].note);
    await app.key("Mod+\\");
    await expect(page.locator(".pane")).toHaveCount(2);
  }
}

async function openCase(app, page, c, mode = "Leitura") {
  await app.quickOpen(c.note);
  await page.locator(".leaf:not([hidden]) .modes button", { hasText: mode }).first().click();
  // The card after the note's marker, in the pane that shows it.
  const marker = page.locator("p, .cm-line", { hasText: `Marcador ${c.id}.` }).filter({ visible: true }).first();
  await expect(marker).toBeVisible();
  const card = marker.locator("xpath=following::div[contains(concat(' ', normalize-space(@class), ' '), ' statblock-card ')][1]");
  await expect(card).toBeVisible();
  // The fonts in, and the picture helper done.
  await page.evaluate(() => document.fonts.ready);
  return card;
}

for (const size of WIDTHS) {
  for (const scheme of ["light", "dark"]) {
    test(`every statblock card at ${size.name} width, ${scheme}: nothing over another, nothing past its box`, async ({ app, page }, info) => {
      test.setTimeout(300_000);
      await setup(app, page, size, scheme);
      const found = {};
      for (const c of CASES) {
        const card = await openCase(app, page, c);
        const problems = await card.evaluate(auditCard);
        if (problems.length > 0) found[c.id] = problems;
        if (SHOTS) {
          const w = Math.round((await card.boundingBox())?.width ?? 0);
          await card.screenshot({ path: shot(info, `${c.id}--${size.name}-${w}px-${scheme}.png`), animations: "disabled" });
        }
      }
      expect(found, "every card drawn clean").toEqual({});
    });
  }
}

// Live Preview draws the same card in the editor (live/blocks.ts).
for (const [size, scheme] of [[WIDTHS[1], "light"], [WIDTHS[0], "dark"]]) {
  test(`every statblock card in Live Preview at ${size.name} width, ${scheme}: nothing over another, nothing past its box`, async ({ app, page }, info) => {
    test.setTimeout(300_000);
    await setup(app, page, size, scheme);
    const found = {};
    for (const c of CASES) {
      const card = await openCase(app, page, c, "Editar");
      const problems = await card.evaluate(auditCard);
      if (problems.length > 0) found[c.id] = problems;
      if (SHOTS && ["blood-hawk", "fractal-yara", "audit-3-columns"].includes(c.id)) {
        await card.screenshot({ path: shot(info, `${c.id}--live-${size.name}-${scheme}.png`), animations: "disabled" });
      }
    }
    expect(found, "every card drawn clean").toEqual({});
  });
}

/** Each ability cell's characters as drawn: every character's box, read
 *  left to right and line by line, must spell the cell's text in its own
 *  order — "14(+2)", never "14(+)2" — and no two may touch. Runs in the
 *  page; gives the cells that fail, with what they spell. */
function charOrder(card) {
  const bad = [];
  for (const cell of card.querySelectorAll(".statblock-score-line, .statblock-table td")) {
    const chars = [];
    const walk = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.parentElement.closest(".sr-only, .dice-card, [hidden]")) continue;
      const range = document.createRange();
      for (let i = 0; i < n.data.length; i++) {
        if (!n.data[i].trim()) continue;
        range.setStart(n, i);
        range.setEnd(n, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width > 0) chars.push({ c: n.data[i], x: r.left, r: r.right, y: (r.top + r.bottom) / 2, h: r.height });
      }
    }
    const said = chars.map((c) => c.c).join("");
    const lineOf = (a, b) => Math.abs(a.y - b.y) < Math.min(a.h, b.h) / 2;
    const drawn = [...chars].sort((a, b) => (lineOf(a, b) ? a.x - b.x : a.y - b.y)).map((c) => c.c).join("");
    const over = [];
    chars.forEach((a, i) => chars.forEach((b, j) => {
      const x = Math.min(a.r, b.r) - Math.max(a.x, b.x);
      // WebKit gives each character's box rounded out to whole pixels:
      // two neighbours share a pixel. More than that is one over another.
      if (j > i && lineOf(a, b) && x > 1.5) over.push(`${a.c}${b.c} ${x.toFixed(1)}px`);
    }));
    // And inside its own cell: a ")" pushed into the next cell is drawn
    // over that cell's sign.
    const box = (cell.closest(".statblock-score") ?? cell).getBoundingClientRect();
    const out = chars.filter((c) => c.x < box.left - 1.5 || c.r > box.right + 1.5).map((c) => c.c).join("");
    if (out) over.push(`"${out}" outside its cell`);
    if (drawn !== said || over.length > 0) bad.push(`${said} drawn as ${drawn}${over.length ? ` (over each other: ${over.join(", ")})` : ""}`);
  }
  return bad;
}

for (const id of ["blood-hawk", "audit-3-columns"]) {
  for (const size of [WIDTHS[0], WIDTHS[1]]) {
    test(`${id}'s ability cells at ${size.name} width read in their own order, before and after a roll`, async ({ app, page }) => {
      await setup(app, page, size, "light");
      const card = await openCase(app, page, CASES.find((x) => x.id === id));
      const cells = card.locator(".statblock-score-line, .statblock-table td");
      await expect(cells).toHaveCount(6);
      // +N, -N, +0 and two digits (the audit's 30 is +10).
      expect(await card.evaluate(charOrder), "before a roll").toEqual([]);
      for (const i of [0, 1, 2]) {
        await cells.nth(i).getByRole("button", { name: /^Rolar 1d20/ }).click();
        await expect(card.locator(".dice-card:visible").first()).toBeVisible();
        expect(await card.evaluate(charOrder), `after rolling cell ${i + 1}`).toEqual([]);
      }
    });
  }
}

// A roll block's result line, and the badges, inside the card.
for (const size of [WIDTHS[0], WIDTHS[1]]) {
  test(`a roll block's result at ${size.name} width stays inside its card`, async ({ app, page }) => {
    await setup(app, page, size, "dark");
    for (const id of ["dnd5e-monster", "fractal-yara", "blades-scoundrel"]) {
      const card = await openCase(app, page, CASES.find((x) => x.id === id));
      const go = card.locator(".statblock-roll-go");
      await go.click();
      await expect(card.locator(".statblock-roll-out")).not.toBeEmpty();
      expect(await card.evaluate(auditCard), id).toEqual([]);
    }
  });
}

/** Each ability cell's box, rounded: a cell that moves after a roll. */
const cellBoxes = (cells) => cells.evaluateAll((els) => els.map((e) => {
  // Where in its card: a click may scroll the page.
  const c = e.closest(".statblock-card").getBoundingClientRect();
  const r = e.getBoundingClientRect();
  return [r.x - c.x, r.y - c.y, r.width, r.height].map(Math.round);
}));

for (const id of ["blood-hawk", "dnd5e-monster"]) {
  for (const size of [WIDTHS[0], WIDTHS[1]]) {
    test(`a die of ${id}'s ability scores at ${size.name} width shows its roll over the card, no cell moved`, async ({ app, page }, info) => {
      await setup(app, page, size, "light");
      const c = CASES.find((x) => x.id === id);
      const card = await openCase(app, page, c);
      const cells = card.locator(".statblock-score, .statblock-table td");
      await expect(cells).toHaveCount(6);
      const before = await cellBoxes(cells);
      const cardBefore = await card.boundingBox();
      // The second cell's: the cells after it are the ones a result in
      // the row's flow pushed (the maintainer's report, 2026-10-20).
      const die = cells.nth(1).getByRole("button", { name: /^Rolar 1d20/ });
      await die.click();
      const result = card.locator(".dice-card:visible");
      await expect(result).toBeVisible();
      await expect(result.locator(".dice-total")).toHaveText(/^\d+$/);
      const after = await cellBoxes(cells);
      after.forEach((box, i) => box.forEach((v, k) => expect.soft(Math.abs(v - before[i][k]), `cell ${i + 1} moved: ${before[i]} → ${box}`).toBeLessThanOrEqual(2)));
      const r = await result.boundingBox();
      const cardAfter = await card.boundingBox();
      expect.soft(Math.abs(cardAfter.height - cardBefore.height), "the card's height").toBeLessThanOrEqual(2);
      expect.soft(r.x, "the result inside the card, left").toBeGreaterThanOrEqual(cardAfter.x - 1);
      expect.soft(r.x + r.width, "the result inside the card, right").toBeLessThanOrEqual(cardAfter.x + cardAfter.width + 1);
      expect.soft(await card.evaluate(auditCard), "the card under the result").toEqual([]);
      if (SHOTS) await card.screenshot({ path: shot(info, `${id}--rolled-${size.name}.png`), animations: "disabled" });
      // Escape closes it, the die focused again; a press elsewhere too.
      await page.keyboard.press("Escape");
      await expect(card.locator(".dice-card:visible")).toHaveCount(0);
      await expect(die).toBeFocused();
      await cells.last().getByRole("button", { name: /^Rolar 1d20/ }).click();
      await expect(card.locator(".dice-card:visible")).toHaveCount(1);
      expect(await cellBoxes(cells)).toEqual(before);
      // The last cell's result, at the card's right edge, moved in.
      const edge = await card.locator(".dice-card:visible").boundingBox();
      const box = await card.boundingBox();
      expect(edge.x + edge.width, "the last result inside the card").toBeLessThanOrEqual(box.x + box.width + 1);
      expect(edge.x).toBeGreaterThanOrEqual(box.x - 1);
      await card.locator(".statblock-heading-text").first().click();
      await expect(card.locator(".dice-card:visible")).toHaveCount(0);
    });
  }
}

test("a bonus in brackets is one piece with its die after it, and +0 rolls 1d20", async ({ app, page }) => {
  await setup(app, page, WIDTHS[1], "light");
  const card = await openCase(app, page, CASES.find((x) => x.id === "blood-hawk"));
  const cells = card.locator(".statblock-score");
  // CON 10: "(+0)", the die rolling 1d20, never 1d20+0.
  await expect(cells.nth(2)).toContainText("10");
  await expect(cells.nth(2).getByRole("button", { name: "Rolar 1d20 para CON" })).toHaveText("(+0)");
  await expect(cells.nth(0).getByRole("button", { name: "Rolar 1d20-2 para FOR" })).toHaveText("(−2)");
  // No die anywhere in the card rolls "+0" or "+-".
  await expect(card.getByRole("button", { name: /\+0\b|\+-/ })).toHaveCount(0);
  // "(+5)" in a trait: the brackets around the number, the die after them.
  await expect(card.locator(".statblock-trait", { hasText: "Keen Sight" })).toContainText(/\(\+5\) ?1d20\+5/);
});
