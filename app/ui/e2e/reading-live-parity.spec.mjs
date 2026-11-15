// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the review of 2026-11-15 found the reading view and Live Preview
// doing apart, or not at all: a link to a heading followed from Live
// Preview (⌘-click dropped the heading, and `[[#Heading]]` did nothing) and
// read the same in both ("Note › Heading", "Heading"); a declared picture
// written as a wikilink with its thumbnail beside the link; each fold
// button named by what it folds, the code block's remembered; an embedded
// picture resized by its corner in Reading; the code blocks' buttons of
// Live Preview at their own block, not all at the note's top; the "</>" of
// a diagram shown on hover; a setting changed reaching the note open.

import { expect, test } from "./fixtures.mjs";

const view = "document.querySelector('.leaf:not([hidden]) .note-sheet .editor').__cmView";
const filler = (n, word) => Array.from({ length: n }, (_, i) => `${word} ${i + 1}.\n`).join("\n");

async function folder(app, files) {
  await app.open();
  for (const [p, text] of Object.entries(files)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(files), true);
}

test("Live Preview: ⌘-click on [[Note#Heading]] lands on the heading, on [[#Heading]] moves to it; both read as in Reading", async ({ app, page }) => {
  const ALVO = `# Alvo\n\n${filler(60, "Linha")}\n## Seção Longe\n\ntexto da seção\n`;
  const ORIGEM = `# Origem\n\n[[Alvo#Seção Longe]]\n\n[[#Fim]]\n\n${filler(60, "Trecho")}\n## Fim\n\nfim da nota\n`;
  await folder(app, { "Alvo.md": ALVO, "Origem.md": ORIGEM });
  await app.quickOpen("Origem");
  // Reading: "Alvo › Seção Longe" and "Fim".
  const pv = page.locator(".leaf:not([hidden]) div.preview");
  await expect(pv.locator("a.wikilink").first()).toHaveText("Alvo › Seção Longe");
  await expect(pv.locator("a.wikilink").nth(1)).toHaveText("Fim");
  await app.mode("Editar");
  // Live Preview reads them the same, the caret elsewhere.
  await page.evaluate(`${view}.dispatch({ selection: { anchor: ${view}.state.doc.length } })`);
  const there = page.locator(".leaf:not([hidden]) .cm-lp-wikilink", { hasText: "Seção Longe" });
  await expect(there).toHaveText("Alvo › Seção Longe");
  const here = page.locator(".leaf:not([hidden]) .cm-lp-wikilink").nth(1);
  await expect(here).toHaveText("Fim");
  await expect(there).toHaveAttribute("data-target", "Alvo#Seção Longe");
  await expect(here).toHaveAttribute("data-target", "#Fim");
  // `[[#Fim]]`: the caret moves to the heading, in this note. The caret at
  // the top, the heading far below: the jump draws other lines, the link's
  // goes from the DOM (the sheet took that press for one outside the
  // editor and put the caret at the note's end).
  await page.evaluate(`${view}.dispatch({ selection: { anchor: 0 }, scrollIntoView: true })`);
  await here.click({ modifiers: ["ControlOrMeta"] });
  await expect.poll(() => page.evaluate(`${view}.state.doc.lineAt(${view}.state.selection.main.head).text`)).toBe("## Fim");
  await expect(page.locator(".leaf:not([hidden]) .cm-line.cm-lp-h2", { hasText: "Fim" })).toBeInViewport();
  // `[[Alvo#Seção Longe]]`: Alvo opens, at its heading.
  await page.evaluate(`${view}.dispatch({ selection: { anchor: 0 }, scrollIntoView: true })`);
  await page.locator(".leaf:not([hidden]) .cm-lp-wikilink", { hasText: "Seção Longe" }).click({ modifiers: ["ControlOrMeta"] });
  await expect(page.locator(".note-title:visible")).toHaveText("Alvo");
  // At its heading, in whichever mode it opened.
  const heading = page.locator(".leaf:not([hidden]) div.preview:visible h2, .leaf:not([hidden]) .editor:visible .cm-line").filter({ hasText: "Seção Longe" }).first();
  await expect(heading).toBeInViewport();
  // Nothing was written.
  expect(await app.file("Origem.md")).toBe(ORIGEM);
  expect(await app.file("Alvo.md")).toBe(ALVO);
});

test("a declared picture written as a wikilink shows its thumbnail beside the link, outside the infobox", async ({ app, page }) => {
  const SCHEMA = "# PdM\n\n```verso-schema\ntype: npc\nlabel: { pt-BR: PdM, en: NPC }\nproperties:\n  - key: retrato\n    kind: image\n    label: { pt-BR: Retrato, en: Portrait }\n```\n";
  const NOTE = '---\ntype: npc\nretrato: "[[retrato.svg|Lorde]]"\n---\n# Roderick\n\nO lorde.\n';
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#a33"/></svg>';
  await folder(app, { "PdM.md": SCHEMA, "Roderick.md": NOTE, "retrato.svg": SVG });
  await app.quickOpen("Roderick");
  await expect(page.locator(".props.infobox")).toHaveCount(0);
  const row = page.locator('.leaf:not([hidden]) .props .prop[data-key="retrato"]');
  await expect(row.locator(".link-pill")).toBeVisible();
  const thumb = row.locator("img.prop-thumb");
  await expect(thumb).toBeVisible();
  await expect.poll(() => thumb.evaluate((i) => i.complete && i.naturalWidth)).toBe(40);
  expect(await app.file("Roderick.md")).toBe(NOTE);
});

test("each fold button of the reading view is named by what it folds; the code block's says whether it is open and is kept", async ({ app, page }) => {
  const NOTE = "Dobras de leitura.md";
  const TEXT = "# Dobras de leitura\n\n## Alfa\n\ncorpo\n\n- item\n  - filho\n\n> uma citação\n\n```js\nconst a = 1;\n```\n";
  await folder(app, { [NOTE]: TEXT });
  await app.quickOpen("Dobras de leitura");
  const pv = page.locator(".leaf:not([hidden]) div.preview");
  // The heading is named by its words alone.
  await expect(pv.getByRole("heading", { name: "Alfa", exact: true })).toBeVisible();
  await expect(pv.locator("h2 .heading-fold-btn")).toHaveAttribute("title", "Recolher ou abrir a seção");
  await expect(pv.locator("li .list-fold-btn")).toHaveAttribute("title", "Recolher ou abrir a lista");
  await expect(pv.locator("blockquote .quote-fold-btn")).toHaveAttribute("title", "Recolher ou abrir a citação");
  const code = pv.locator("pre .code-fold-btn");
  await expect(code).toHaveAttribute("title", "Recolher ou abrir o bloco de código");
  await expect(code).toHaveAttribute("aria-expanded", "true");
  await code.click();
  await expect(code).toHaveAttribute("aria-expanded", "false");
  await expect(pv.locator("pre")).toHaveClass(/code-folded/);
  // Closed and opened again: still folded, and it says so.
  await app.key("Mod+w");
  await expect(page.locator(".tab", { hasText: "Dobras de leitura" })).toHaveCount(0);
  await app.quickOpen("Dobras de leitura");
  await expect(pv.locator("pre")).toHaveClass(/code-folded/);
  await expect(pv.locator("pre .code-fold-btn")).toHaveAttribute("aria-expanded", "false");
  expect(await app.file(NOTE)).toBe(TEXT);
});

test("an embedded picture `![[…]]` in Reading has its corner grip, and a drag writes its size as an embed", async ({ app, page }) => {
  const NOTE = "Figura.md";
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#36a"/></svg>';
  await folder(app, { [NOTE]: "# Figura\n\n![[quadro.svg]]\n\nfim\n", "quadro.svg": SVG });
  await app.quickOpen("Figura");
  const img = page.locator('.leaf:not([hidden]) .preview img[data-embed="quadro.svg"]');
  await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
  await img.evaluate((i) => i.scrollIntoView({ block: "center" }));
  await img.hover();
  const grip = img.locator("xpath=following-sibling::span[contains(@class, 'cm-lp-grip')]");
  await expect(grip).toHaveCount(1);
  const at = await grip.boundingBox();
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + 60, at.y + 30, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => app.file(NOTE)).toMatch(/\n!\[\[quadro\.svg\|\d+x\d+\]\]\n/);
});

test("Live Preview: each code block's copy button sits at its own block's top line, not at the note's top", async ({ app, page }) => {
  const NOTE = "Dois blocos.md";
  const TEXT = `# Dois blocos\n\n\`\`\`js\nconst a = 1;\n\`\`\`\n\n${filler(8, "Meio")}\n\`\`\`py\nb = 2\n\`\`\`\n\nfim\n`;
  await folder(app, { [NOTE]: TEXT });
  await app.quickOpen("Dois blocos");
  await app.mode("Editar");
  await page.evaluate(`${view}.dispatch({ selection: { anchor: ${view}.state.doc.length } })`);
  const firsts = page.locator(".leaf:not([hidden]) .cm-line.cm-lp-fence-first");
  await expect(firsts).toHaveCount(2);
  for (const i of [0, 1]) {
    const line = firsts.nth(i);
    const copy = line.locator(".cm-lp-copy-code");
    await expect(copy).toHaveCount(1);
    const [l, c] = [await line.boundingBox(), await copy.boundingBox()];
    expect(c.y).toBeGreaterThanOrEqual(l.y - 1);
    expect(c.y + c.height).toBeLessThanOrEqual(l.y + l.height + 12);
    expect(c.x + c.width).toBeLessThanOrEqual(l.x + l.width + 1);
  }
  // The two are apart, each at its own block.
  const [a, b] = [await firsts.nth(0).locator(".cm-lp-copy-code").boundingBox(), await firsts.nth(1).locator(".cm-lp-copy-code").boundingBox()];
  expect(b.y - a.y).toBeGreaterThan(100);
});

test("Live Preview: a Mermaid diagram's \"</>\" shows on hover and is named", async ({ app, page }) => {
  await folder(app, { "Diagrama.md": "# Diagrama\n\n```mermaid\ngraph TD\n  A --> B\n```\n\nfim\n" });
  await app.quickOpen("Diagrama");
  await app.mode("Editar");
  await page.evaluate(`${view}.dispatch({ selection: { anchor: ${view}.state.doc.length } })`);
  const block = page.locator(".leaf:not([hidden]) .cm-lp-mermaid");
  await expect(block).toBeVisible();
  const source = block.locator(".cm-lp-base-source");
  await expect(source).toHaveAttribute("aria-label", "Editar código Mermaid");
  await block.hover();
  await expect.poll(() => source.evaluate((b) => getComputedStyle(b).opacity)).toBe("1");
});

test("spell checking turned off in Settings reaches the note already open", async ({ app, page }) => {
  await folder(app, { "Ortografia.md": "# Ortografia\n\ntexto\n" });
  await app.quickOpen("Ortografia");
  await app.mode("Editar");
  const content = page.locator(".leaf:not([hidden]) .cm-content");
  await expect(content).toHaveAttribute("spellcheck", "true");
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Editor" }).click();
  const sw = page.locator(".setting", { has: page.locator(".setting-title", { hasText: /^Correção ortográfica$/ }) });
  await sw.locator("label.switch").click();
  await page.keyboard.press("Escape");
  await expect(content).toHaveAttribute("spellcheck", "false");
});
