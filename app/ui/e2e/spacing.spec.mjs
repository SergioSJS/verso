// Blank lines and the horizontal rule (ADR 0061, revised 2026-10-22): in
// Live Preview a blank line between two blocks is a thin gap until the caret
// is on it; in Reading blank lines add no space at all; `---` then Enter
// writes the blank lines around the rule; and opening a note writes nothing.
// With SHOTS set, a screenshot of each case is kept.
import { mkdirSync } from "node:fs";
import { expect, test } from "./fixtures.mjs";

const SHOTS = process.env.SHOTS;

const PLAIN = "Primeiro parágrafo da nota.\n\nSegundo parágrafo da nota.\n\nTerceiro parágrafo da nota.\n";
const EXTRA = "Primeiro parágrafo da nota.\n\n\n\n\nSegundo parágrafo da nota.\n\nTerceiro parágrafo da nota.\n";
const RICH = `# Título da nota

Um parágrafo antes da linha.

---

Um parágrafo depois da linha.

## Um subtítulo

- item um
- item dois

> [!note] Destaque
> Corpo do destaque.

| a | b |
| - | - |
| 1 | 2 |

\`\`\`js
const x = 1;
\`\`\`

Parágrafo final.
`;
const HR = "Antes da linha.\n\n---\n\nDepois da linha.\n";

async function shot(page, name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.locator(".leaf:not([hidden]) .note-sheet").first().screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` });
}

async function openNote(app, name, text, live, shown) {
  const { page } = app;
  await page.emulateMedia({ colorScheme: "light" });
  await app.open();
  await app.writeOutside(`${name}.md`, text);
  await app.folderChanged([`${name}.md`], true);
  await app.quickOpen(name);
  await expect(page.locator(".leaf:not([hidden]) .preview").first()).toContainText(shown ?? text.split("\n").find((l) => /\w/.test(l)).replace(/^#+ /, ""));
  if (live) {
    await app.key("Mod+e");
    await expect(page.locator(".editor.live .cm-content")).toBeVisible();
  }
  return page;
}

/** Boxes in the page's own pixels, and the font size, of the blocks matching `sel`. */
const boxes = (page, sel) =>
  page.evaluate((s) => {
    const out = [...document.querySelectorAll(s)].map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height, text: el.textContent.slice(0, 20) };
    });
    return { out, font: parseFloat(getComputedStyle(document.querySelector(s)).fontSize) };
  }, sel);
const LIVE = ".leaf:not([hidden]) .editor.live .cm-line";
const READ = ".leaf:not([hidden]) .preview";
const docText = (page) => page.evaluate(() => document.querySelector(".leaf:not([hidden]) .note-sheet .editor").__cmView.state.doc.toString());
const note = (n, extra = "") => {
  test.info().annotations.push({ type: "measure", description: `${n} ${extra}` });
  console.log(`MEASURE ${test.info().project.name} ${n} ${extra}`);
};

test("Live: a blank line between two paragraphs is a thin gap, under half a line, until the caret is on it @layout", async ({ app }) => {
  const page = await openNote(app, "Intervalo", PLAIN, true);
  const lines = page.locator(LIVE);
  await lines.nth(4).click();
  await expect(lines.nth(1)).toHaveClass(/cm-lp-gap/);
  const { out } = await boxes(page, LIVE);
  const line = out[0].height;
  const gap = out[1].height;
  note("gap", `${gap.toFixed(1)}px of a ${line.toFixed(1)}px line = ${(gap / line).toFixed(2)}`);
  expect(gap).toBeLessThanOrEqual(line * 0.5);
  expect(gap).toBeGreaterThan(line * 0.2);
  await shot(page, "live-gap");
  // The caret on the gap: the line is full height, typing works.
  await lines.nth(1).click({ position: { x: 5, y: 2 } });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  const on = await boxes(page, LIVE);
  expect(on.out[1].height).toBeGreaterThanOrEqual(line * 0.95);
  await expect(lines.nth(1)).not.toHaveClass(/cm-lp-gap/);
  await shot(page, "live-gap-caret");
  await page.keyboard.type("x");
  expect(await docText(page)).toBe("Primeiro parágrafo da nota.\nx\nSegundo parágrafo da nota.\n\nTerceiro parágrafo da nota.\n");
});

test("Live: further blank lines in a run keep a reduced height, the first collapses @layout", async ({ app }) => {
  const page = await openNote(app, "Extras", EXTRA, true);
  const lines = page.locator(LIVE);
  await lines.last().click();
  const { out } = await boxes(page, LIVE);
  const line = out[0].height;
  const [gap, ...extras] = [out[1].height, out[2].height, out[3].height, out[4].height];
  note("run", `gap ${(gap / line).toFixed(2)}, extras ${extras.map((e) => (e / line).toFixed(2)).join(", ")} of a line`);
  expect(gap).toBeLessThanOrEqual(line * 0.5);
  for (const e of extras) {
    expect(e).toBeGreaterThan(line * 0.5);
    expect(e).toBeLessThan(line * 0.8);
  }
  await shot(page, "live-extras");
});

test("Reading: the space between paragraphs is the same with one blank line or with five @layout", async ({ app }) => {
  const space = async (name, text) => {
    const page = await openNote(app, name, text, false);
    const { out, font } = await boxes(page, `${READ} p`);
    return { gap: (out[1].top - out[0].bottom) / font, page };
  };
  const one = await space("Um", PLAIN);
  const five = await space("Cinco", EXTRA);
  note("reading gap", `${one.gap.toFixed(2)}em with one blank line, ${five.gap.toFixed(2)}em with five`);
  expect(five.gap).toBeCloseTo(one.gap, 1);
  expect(one.gap).toBeGreaterThan(0.6);
  expect(one.gap).toBeLessThan(1.1);
  expect(await app.page.locator(`${READ} p:empty, ${READ} br`).count()).toBe(0);
  await shot(one.page, "reading-paragraphs");
});

for (const style of [null, "line", "thin", "fade"]) {
  test(`the rule ${style ?? "⁂"}: about 1em above and below in Reading, a modest gap in Live @layout`, async ({ app }) => {
    const { page } = app;
    await page.emulateMedia({ colorScheme: "light" });
    const look = { light: {}, dark: {}, ...(style ? { style: { "hr-style": style } } : {}) };
    await page.addInitScript((v) => localStorage.setItem("verso.settings", v), JSON.stringify({ look, lookName: "Linha" }));
    await openNote(app, "Regra", HR, false);
    const read = await boxes(page, `${READ} :is(p, hr)`);
    const em = read.font;
    const above = (read.out[1].top - read.out[0].bottom) / em;
    const below = (read.out[2].top - read.out[1].bottom) / em;
    note("reading hr", `${style ?? "asterism"}: above ${above.toFixed(2)}em, below ${below.toFixed(2)}em, rule ${(read.out[1].height / em).toFixed(2)}em`);
    expect(above).toBeGreaterThan(0.8);
    expect(above).toBeLessThan(1.25);
    expect(below).toBeGreaterThan(0.8);
    expect(below).toBeLessThan(1.25);
    await shot(page, `reading-hr-${style ?? "asterism"}`);
    await app.key("Mod+e");
    await expect(page.locator(".editor.live .cm-content")).toBeVisible();
    await page.locator(LIVE).last().click();
    const live = await boxes(page, LIVE);
    // Paragraph, gap, rule, gap, paragraph: the text-to-text distance.
    const total = (live.out[4].top - live.out[0].bottom) / live.font;
    const readTotal = (read.out[2].top - read.out[0].bottom) / em;
    note("live hr", `${style ?? "asterism"}: text to text ${total.toFixed(2)}em in Live, ${readTotal.toFixed(2)}em in Reading`);
    expect(total).toBeLessThan(readTotal + 1.2);
    expect(total).toBeLessThan(4.2);
    await shot(page, `live-hr-${style ?? "asterism"}`);
  });
}

test("opening and reading a note, in Reading, Live and Source, writes nothing: the file is byte for byte as it was @layout", async ({ app }) => {
  const text = "---\ntitulo: a\n---\nPrimeiro.\n\n\n\nSegundo.\r\n\n---\n\nTerceiro.   \n\n\n";
  const page = await openNote(app, "Intacta", text, false, "Primeiro.");
  expect(await app.file("Intacta.md")).toBe(text);
  await app.key("Mod+e");
  await expect(page.locator(".editor.live .cm-content")).toBeVisible();
  await page.locator(LIVE).last().click();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await app.command("Fonte");
  await page.waitForTimeout(1500);
  expect(await app.file("Intacta.md")).toBe(text);
  expect(await app.calls("write_note")).toEqual([]);
});

test("--- then Enter in Live Preview: the blank lines before and after are written, one Enter more goes on writing, one undo takes it back @layout", async ({ app }) => {
  const page = await openNote(app, "Corte", "Antes do corte", true);
  await page.locator(LIVE).first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("---");
  await page.keyboard.press("Enter");
  expect(await docText(page)).toBe("Antes do corte\n\n---\n\n");
  await page.keyboard.type("Depois");
  expect(await docText(page)).toBe("Antes do corte\n\n---\n\nDepois");
  await shot(page, "live-hr-flow");
  // The text typed after is one undo; the Enter is another, and takes back the lot.
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await docText(page)).toBe("Antes do corte\n---");
});

test("--- then Enter after a blank line, in Source mode, and in the frontmatter or a code block it is only a line @layout", async ({ app }) => {
  const page = await openNote(app, "Fonte", "Texto\n\n", true);
  await app.command("Fonte");
  const content = page.locator(".leaf:not([hidden]) .editor .cm-content");
  await content.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("---");
  await page.keyboard.press("Enter");
  expect(await docText(page)).toBe("Texto\n\n---\n\n");
  // A code block: the line stays text, Enter is the ordinary one.
  await page.keyboard.type("```\n---");
  await page.keyboard.press("Enter");
  expect(await docText(page)).toBe("Texto\n\n---\n\n```\n---\n");
});

test("a note with a frontmatter: its closing --- and Enter is the ordinary Enter @layout", async ({ app }) => {
  const page = await openNote(app, "Cabecalho", "---\ntitulo: a\n---\nTexto\n", false, "Texto");
  await app.command("Fonte");
  const content = page.locator(".leaf:not([hidden]) .editor .cm-content");
  await content.click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  expect(await docText(page)).toBe("---\ntitulo: a\n---\n\nTexto\n");
});

test("a sample note and the tutorial's notes, in Reading and in Live Preview, for the eye @layout", async ({ app }) => {
  const page = await openNote(app, "Amostra", RICH, false);
  await shot(page, "sample-reading");
  await app.key("Mod+e");
  await expect(page.locator(".editor.live .cm-content")).toBeVisible();
  await page.locator(LIVE).last().click();
  await shot(page, "sample-live");
  for (const [name, key] of [["01 - Guia de Markdown", "tour01"], ["04 - Escrevendo no Editor", "tour04"]]) {
    await app.quickOpen(name);
    await expect(page.locator(".leaf:not([hidden]) .note-sheet")).toBeVisible();
    await shot(page, `${key}-live`);
    await app.key("Mod+e");
    await shot(page, `${key}-reading`);
  }
});
