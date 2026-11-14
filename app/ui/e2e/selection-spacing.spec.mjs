// Selecting text in Live Preview never changes the note's vertical rhythm
// (the maintainer's report of 2026-11-07, ADR 0061 item 9): the lines a
// selection touches show their Markdown, but a blank line between two
// blocks stays the thin gap it is away from the caret, a heading keeps its
// place, and the hover outline of a block does not draw a box inside the
// selection. The caret moved into a heading does not move it either. And
// the selection is painted once, in one shade over text, gaps and line
// ends, from the text's left edge (src/editor/evenSelection.ts).
// With SHOTS set, a screenshot of each state is kept.
import { mkdirSync } from "node:fs";
import { expect, test } from "./fixtures.mjs";

const SHOTS = process.env.SHOTS;

const NOTE = `> Uma citação no topo.

# Costa das Lanternas

Um **forte** e [[Porto]].

## Realismo

Outro parágrafo curto.

## Premissas

- primeira
- segunda
- terceira
`;

const LIVE = ".leaf:not([hidden]) .editor.live";

async function shot(page, name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.locator(".leaf:not([hidden]) .note-sheet").first().screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` });
}

/** The note's height and each heading's top, from the top of its text, in px. */
const layout = (page) =>
  page.evaluate((root) => {
    const content = document.querySelector(`${root} .cm-content`);
    const top = content.getBoundingClientRect().top;
    const heads = [...content.querySelectorAll(".cm-line.cm-lp-h")].map((el) => el.getBoundingClientRect().top - top);
    const lines = [...content.querySelectorAll(".cm-line")].map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10);
    return { height: content.getBoundingClientRect().height, heads, lines };
  }, LIVE);

function same(a, b) {
  const says = `line heights ${JSON.stringify(a.lines)} became ${JSON.stringify(b.lines)}`;
  expect(b.heads, says).toHaveLength(a.heads.length);
  expect(Math.abs(b.height - a.height), says).toBeLessThanOrEqual(2);
  a.heads.forEach((t, i) => expect(Math.abs(b.heads[i] - t), says).toBeLessThanOrEqual(2));
}

async function dragOver(app, before) {
  const { page } = app;
  await app.key("Mod+End");
  const first = await page.locator(`${LIVE} .cm-line`).first().boundingBox();
  const last = await page.locator(`${LIVE} .cm-line`).last().boundingBox();
  await page.mouse.move(first.x + 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + 40, last.y + last.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => document.querySelector(".leaf:not([hidden]) .note-sheet .editor").__cmView.state.selection.main.empty)).toBe(false);
  same(before, await layout(page));
  await expect(page.locator(`${LIVE} .cm-block-outline`)).toBeHidden();
  await shot(page, "dragged");
}

test("Live: selecting the whole note shows its Markdown and moves nothing up or down; nor does the caret in a heading @layout", async ({ app }) => {
  const { page } = app;
  await page.emulateMedia({ colorScheme: "dark" });
  await app.open();
  await app.writeOutside("Costa.md", NOTE);
  await app.folderChanged(["Costa.md"], true);
  await app.quickOpen("Costa");
  await expect(page.locator(".leaf:not([hidden]) .preview").first()).toContainText("Costa das Lanternas");
  await app.key("Mod+e");
  const content = page.locator(`${LIVE} .cm-content`);
  await expect(content).toBeVisible();
  // The caret at the note's end, on its last (empty) line.
  await page.locator(`${LIVE} .cm-line`).last().click();
  await app.key("Mod+End");
  const gaps = page.locator(`${LIVE} .cm-line.cm-lp-gap`);
  await expect(gaps).toHaveCount(6);
  const before = await layout(page);
  expect(before.heads).toHaveLength(3);
  await shot(page, "before");

  // Everything selected: the marks show, the gaps stay thin.
  await app.key("Mod+a");
  await expect(content).toContainText("# Costa das Lanternas");
  await expect(content).toContainText("**forte**");
  await expect(content).toContainText("[[Porto]]");
  await page.locator(`${LIVE} .cm-line`).nth(4).hover();
  await shot(page, "selected");
  const selected = await layout(page);
  console.log(`MEASURE ${test.info().project.name} note ${before.height.toFixed(1)}px, selected ${selected.height.toFixed(1)}px`);
  await expect(gaps).toHaveCount(6);
  same(before, selected);
  // No block's hover box inside the selection.
  await expect(page.locator(`${LIVE} .cm-block-outline`)).toBeHidden();

  // A drag from the top over the whole note: the same (a pointer's drag;
  // a finger on a touch screen scrolls).
  if (!test.info().project.use.hasTouch) await dragOver(app, before);

  // The caret into the H1, then the H2: the heading shows its `#` in place.
  await app.key("Mod+End");
  for (const n of [0, 1]) {
    const head = page.locator(`${LIVE} .cm-line.cm-lp-h`).nth(n);
    await head.click();
    await expect(head).toContainText("#");
    same(before, await layout(page));
  }
  await shot(page, "caret-heading");
  // Nothing was written by any of it.
  expect(await app.file("Costa.md")).toBe(NOTE);
});

test("Live: the rule's `---` under the caret or a selection keeps the drawn rule's height @layout", async ({ app }) => {
  const { page } = app;
  const text = "Antes da linha.\n\n---\n\nDepois da linha.\n";
  await app.open();
  await app.writeOutside("Regua.md", text);
  await app.folderChanged(["Regua.md"], true);
  await app.quickOpen("Regua");
  await expect(page.locator(".leaf:not([hidden]) .preview").first()).toContainText("Antes da linha.");
  await app.key("Mod+e");
  await page.locator(`${LIVE} .cm-line`).last().click();
  await app.key("Mod+End");
  const rule = page.locator(`${LIVE} .cm-line.cm-lp-hr-line`);
  await expect(rule).toHaveCount(1);
  const before = await layout(page);
  await app.key("Mod+a");
  await expect(page.locator(`${LIVE} .cm-content`)).toContainText("---");
  same(before, await layout(page));
  await app.key("Mod+End");
  await rule.click();
  await expect(page.locator(`${LIVE} .cm-line.cm-lp-hr-src`)).toHaveCount(1);
  same(before, await layout(page));
  expect(await app.file("Regua.md")).toBe(text);
});

/** The painted colour at points of the page, read from a screenshot. */
async function pixels(page, points) {
  const png = (await page.screenshot()).toString("base64");
  return page.evaluate(
    async ({ png, points }) => {
      const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(bmp, 0, 0);
      return points.map(([x, y]) => Array.from(g.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)));
    },
    { png, points },
  );
}

/** Points of the note: the middle of each gap, a space between two words
 *  of each line holding one, and each text line past its end. */
const probes = (page) =>
  page.evaluate((root) => {
    const view = document.querySelector(".leaf:not([hidden]) .note-sheet .editor").__cmView;
    const content = document.querySelector(`${root} .cm-content`).getBoundingClientRect();
    const out = { gap: [], space: [], end: [] };
    for (const el of document.querySelectorAll(`${root} .cm-line`)) {
      const r = el.getBoundingClientRect();
      const mid = (r.top + r.bottom) / 2;
      if (el.classList.contains("cm-lp-gap")) out.gap.push([content.left + content.width * 0.6, mid]);
      else if (el.textContent.trim() !== "") {
        const line = view.state.doc.lineAt(view.posAtDOM(el, 0));
        const at = line.text.search(/\S \S/);
        if (at >= 0) {
          const a = view.coordsAtPos(line.from + at + 1, 1);
          const b = view.coordsAtPos(line.from + at + 2, -1);
          if (a && b && b.left - a.left >= 3) out.space.push([(a.left + b.left) / 2, (a.top + a.bottom) / 2]);
        }
        out.end.push([content.left + content.width * 0.6, mid]);
      }
    }
    return out;
  }, LIVE);

const near = (a, b, d = 6) => a.every((v, i) => Math.abs(v - b[i]) <= d);

for (const scheme of ["dark", "light"]) {
  test(`Live, ${scheme}: a selection over several lines is one shade, on the text, past its end and over the gaps @layout`, async ({ app }) => {
    const { page } = app;
    await page.emulateMedia({ colorScheme: scheme });
    await app.open();
    await app.writeOutside("Costa.md", NOTE);
    await app.folderChanged(["Costa.md"], true);
    await app.quickOpen("Costa");
    await expect(page.locator(".leaf:not([hidden]) .preview").first()).toContainText("Costa das Lanternas");
    await app.key("Mod+e");
    await page.locator(`${LIVE} .cm-line`).last().click();
    await app.key("Mod+End");
    await page.mouse.move(2, 2);
    const at = await probes(page);
    const [paper] = await pixels(page, [at.end[1]]);
    await app.key("Mod+a");
    await page.mouse.move(2, 2);
    await expect(page.locator(`${LIVE} .cm-content`)).toContainText("# Costa das Lanternas");
    const now = await probes(page);
    // Every line but the last is inside the selection: the last line's end
    // (past "terceira") is, its text up to the caret.
    const points = [...now.gap, ...now.space, ...now.end.slice(0, -1)];
    const seen = await pixels(page, points);
    await shot(page, `shade-${scheme}`);
    const says = `paper ${JSON.stringify(paper)}; gaps ${JSON.stringify(seen.slice(0, now.gap.length))}; spaces ${JSON.stringify(seen.slice(now.gap.length, now.gap.length + now.space.length))}; ends ${JSON.stringify(seen.slice(now.gap.length + now.space.length))}`;
    expect(now.gap.length, says).toBe(6);
    expect(now.space.length, says).toBeGreaterThan(2);
    // The selection shows, and in one shade.
    expect(near(seen[0], paper, 10), says).toBe(false);
    for (const c of seen) expect(near(c, seen[0]), says).toBe(true);
    // The note's first line is a quote, indented: the selection of the lines
    // below still starts where their text does (a heading's `#` inside it).
    const edge = await page.evaluate((root) => {
      const content = document.querySelector(`${root} .cm-content`).getBoundingClientRect();
      const head = document.querySelector(`${root} .cm-line.cm-lp-h`).getBoundingClientRect();
      const rects = [...document.querySelectorAll(`${root} .cm-selectionBackground`)].filter((el) => el.offsetParent !== null).map((el) => el.getBoundingClientRect());
      const over = rects.filter((r) => r.top <= head.top + 2 && r.bottom >= head.bottom - 2);
      return { content: content.left, left: Math.min(...over.map((r) => r.left)), n: over.length };
    }, LIVE);
    expect(edge.n, JSON.stringify(edge)).toBeGreaterThan(0);
    expect(edge.left, JSON.stringify(edge)).toBeLessThanOrEqual(edge.content + 1);
  });
}

test("Live: a selection over a code block shows on the code too @layout", async ({ app }) => {
  const { page } = app;
  const text = "Antes do código.\n\n```js\nconst um = 1;\n```\n\nDepois.\n";
  await page.emulateMedia({ colorScheme: "dark" });
  await app.open();
  await app.writeOutside("Codigo.md", text);
  await app.folderChanged(["Codigo.md"], true);
  await app.quickOpen("Codigo");
  await expect(page.locator(".leaf:not([hidden]) .preview").first()).toContainText("Antes do código.");
  await app.key("Mod+e");
  await page.locator(`${LIVE} .cm-line`).last().click();
  await page.mouse.move(2, 2);
  const space = () =>
    page.evaluate(() => {
      const view = document.querySelector(".leaf:not([hidden]) .note-sheet .editor").__cmView;
      const from = view.state.doc.toString().indexOf("const um") + 5;
      const a = view.coordsAtPos(from, 1);
      const b = view.coordsAtPos(from + 1, -1);
      return [(a.left + b.left) / 2, (a.top + a.bottom) / 2];
    });
  const [before] = await pixels(page, [await space()]);
  await app.key("Mod+a");
  await page.mouse.move(2, 2);
  const [after] = await pixels(page, [await space()]);
  await shot(page, "shade-code");
  expect(near(after, before, 10), `${JSON.stringify(before)} then ${JSON.stringify(after)}`).toBe(false);
});
