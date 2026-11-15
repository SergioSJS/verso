// Walkthrough, section 14 (notes 23 and 24, ADR 0058): the tutorial's sheets
// note must be a page of working cards. Every ```statblock fence of
// "23 - Fichas" is drawn as a card (Leitura and Live Preview), none with an
// error, "too large" or "layout não encontrado" badge, nothing past its card
// and nothing drawn over another; "24 - Oráculos e Criação de Mundos" shows
// its [!oracle] callouts with the button, and the oracle lists the note's
// ^id table. Off a Mac the pages are kept as pictures
// (e2e/results/tutorial-shots/<engine>/), read after a change of the notes.

import { join } from "node:path";
import { test, expect } from "./fixtures.mjs";

const SHEETS = "23 - Fichas";
const ORACLES = "24 - Oráculos e Criação de Mundos";
const SHOTS = process.platform !== "darwin";
const shot = (info, file) => join(info.project.outputDir, "tutorial-shots", info.project.name, file);

/** The demo's own text of a note, from the harness's folder in memory. */
async function noteText(app, name) {
  const text = await app.file(`${name}.md`);
  expect(text, `${name}.md is in the demo vault`).not.toBeNull();
  return text;
}

/** How many ```statblock fences a note holds. */
const fences = (text) => (text.match(/^```statblock[ \t]*$/gm) ?? []).length;

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

/** What a card says about itself that should never show in a tutorial. */
function badBadges(card) {
  const out = [];
  if (card.classList.contains("statblock-error")) out.push("an error card");
  for (const b of card.querySelectorAll(".statblock-badge")) out.push(`badge: ${b.textContent.trim().slice(0, 80)}`);
  return out;
}

async function setup(app, page, width, scheme) {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await app.open();
}

async function open(app, page, name, mode) {
  await app.quickOpen(name);
  await app.mode(mode);
}

/** Grow the window to the whole note and keep its picture. */
async function keepPage(page, info, file, root) {
  if (!SHOTS) return;
  const height = await root.evaluate((el) => el.scrollHeight);
  await page.setViewportSize({ width: page.viewportSize().width, height: Math.min(height + 120, 14000) });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: shot(info, file), animations: "disabled" });
}

for (const [width, scheme] of [[600, "light"], [600, "dark"], [1400, "light"]]) {
  test(`"${SHEETS}" in Leitura at ${width} px, ${scheme}: every fence a clean card`, async ({ app, page }, info) => {
    test.setTimeout(240_000);
    await setup(app, page, width, scheme);
    const text = await noteText(app, SHEETS);
    const want = fences(text);
    expect(want, "one example for each of the 40 built-in layouts, and two of inheritance (Goblin and Goblin Rei)").toBe(42);
    await open(app, page, SHEETS, "Leitura");
    const root = page.locator("div.preview:visible");
    const cards = root.locator(".statblock-card");
    await expect(cards).toHaveCount(want);
    // No fence left as plain code.
    await expect(root.locator("pre code.language-statblock, pre.language-statblock")).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const found = {};
    for (let i = 0; i < want; i++) {
      const card = cards.nth(i);
      await card.scrollIntoViewIfNeeded();
      const problems = [...(await card.evaluate(badBadges)), ...(await card.evaluate(auditCard))];
      if (problems.length > 0) found[`card ${i + 1}: ${await card.locator(".statblock-layout-badge").first().textContent().catch(() => "?")}`] = problems;
    }
    expect(found, "every card drawn clean").toEqual({});
    if (info.project.name === "webkit" && width === 600) await keepPage(page, info, `ficha-26-leitura-${scheme}-${width}.png`, root);
  });
}

test(`"${SHEETS}" in Live Preview: every fence a clean card, scrolled through`, async ({ app, page }) => {
  test.setTimeout(300_000);
  await setup(app, page, 900, "light");
  const text = await noteText(app, SHEETS);
  const want = fences(text);
  await open(app, page, SHEETS, "Editar");
  const content = page.locator(".leaf:not([hidden]) .cm-content").first();
  await expect(content).toBeVisible();
  // The element that scrolls the note: the nearest ancestor with room to scroll.
  const scroller = await content.evaluateHandle((el) => {
    for (let p = el; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight + 50) return p;
    }
    return document.scrollingElement;
  });
  // The editor draws what is in view; walk the note and read each card once.
  const seen = new Set();
  const found = {};
  for (let top = 0, guard = 0; guard < 400; guard++) {
    await scroller.evaluate((el, t) => { el.scrollTop = t; }, top);
    await page.waitForTimeout(150);
    const cards = page.locator(".leaf:not([hidden]) .cm-content .statblock-card");
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      const key = (await card.evaluate((el) => el.textContent.replace(/\s+/g, " ").slice(0, 120))) + `#${await card.evaluate((el) => el.closest(".cm-line, .cm-widgetBuffer, div")?.getAttribute("data-from") ?? "")}`;
      const problems = [...(await card.evaluate(badBadges)), ...(await card.evaluate(auditCard))];
      seen.add(key.slice(0, 120));
      if (problems.length > 0) found[key.slice(0, 60)] = problems;
    }
    const [h, ch] = await scroller.evaluate((el) => [el.scrollHeight, el.clientHeight]);
    if (top + ch >= h) break;
    top += Math.floor(ch * 0.6);
  }
  expect(found, "every card drawn clean").toEqual({});
  expect(seen.size, "every fence drawn as a card in the editor").toBe(want);
});

test(`"${ORACLES}": the oracle callouts have their button and the oracle lists the note's table`, async ({ app, page }, info) => {
  test.setTimeout(120_000);
  await setup(app, page, 600, "light");
  const text = await noteText(app, ORACLES);
  const callouts = (text.match(/^> \[!oracle\]/gm) ?? []).length;
  expect(callouts).toBeGreaterThan(0);
  await open(app, page, ORACLES, "Leitura");
  const root = page.locator("div.preview:visible");
  const buttons = root.locator('.callout[data-callout="oracle"] .oracle-callout-btn');
  await expect(buttons).toHaveCount(callouts);
  await expect(root.locator('.callout[data-callout="oracle"]')).toHaveCount(callouts);
  // The note's table, with its ^id, is drawn as a table.
  await expect(root.locator("table").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await keepPage(page, info, "oraculos-27-leitura-light-600.png", root);
  await page.setViewportSize({ width: 1000, height: 900 });

  await buttons.first().click();
  const dialog = page.getByRole("dialog", { name: "Oráculo & Improvisação" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "Tabelas" }).click();
  // The ^id of the example table is among the tables the oracle can draw from.
  await expect(dialog).toContainText(/reviravolta/i);
});
