// Selecting text in Live Preview never changes the note's vertical rhythm
// (the maintainer's report of 2026-11-07, ADR 0061 item 9): the lines a
// selection touches show their Markdown, but a blank line between two
// blocks stays the thin gap it is away from the caret, a heading keeps its
// place, and the hover outline of a block does not draw a box inside the
// selection. The caret moved into a heading does not move it either.
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
