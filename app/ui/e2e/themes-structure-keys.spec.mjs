// Themes, ten more structural keys (ADR 0109, TM.4 = B): each key is written
// on the window's root only when it is not the window's own look, the
// stylesheet answers each value in the reading view, the builder's Structure
// group has a labelled control for each, and the sample beside it follows.
// With SHOTS set, a screenshot of the note per key and value is kept.
import { mkdirSync } from "node:fs";
import { expect, test } from "./fixtures.mjs";

const SHOTS = process.env.SHOTS;

const NOTE = `# Título um
## Título dois
### Título três

Um parágrafo com **negrito**, *itálico* e um [link externo](https://example.com/x) para ver a cor e o sublinhado.

Outro parágrafo, para o espaço entre parágrafos e a altura da linha. Ele é longo o bastante para quebrar em mais de uma linha numa coluna estreita, com acentuação: ação, coração, órgão, ª º, “aspas” e travessões — como pede o português.

> Uma citação em duas linhas, para ver a barra, o painel e o itálico.

- [x] Tarefa feita
- [ ] Tarefa por fazer

> [!note] Uma nota
> Corpo da nota.

> [!tip] Uma dica
> Corpo da dica.
`;

const theme = (style) => ({
  name: "Chaves",
  values: { light: { "--paper": "#ffffff", "--paper-2": "#f3f1ec", "--ink": "#1b1b1b", "--seal": "#8a2be2", "--brass-ink": "#6b4a10" }, dark: {}, ...style },
});

/** The settings a theme leaves behind once applied. */
function settingsOf(t) {
  const out = { look: { light: t.values.light ?? {}, dark: t.values.dark ?? {} }, lookName: t.name };
  for (const key of Object.keys(t.values)) if (key !== "light" && key !== "dark") (out.look.style ??= {})[key] = t.values[key];
  return out;
}

async function open(app, style = {}) {
  const { page } = app;
  await page.emulateMedia({ colorScheme: "light" });
  const s = settingsOf(theme(style));
  await page.addInitScript((v) => localStorage.setItem("verso.settings", v), JSON.stringify(s));
  await app.open();
  await app.writeOutside("Chaves.md", NOTE);
  await app.folderChanged(["Chaves.md"], true);
  await app.quickOpen("Chaves");
  await expect(page.locator(".leaf:not([hidden]) .preview h1")).toBeVisible();
  return page;
}
const attr = (page, name) => page.evaluate((n) => document.documentElement.dataset[n] ?? null, name);
const px = (v) => parseFloat(v);
/** Computed facts of the reading view, in numbers. */
function facts(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(`.leaf:not([hidden]) ${s}`);
    const cs = (el, p) => getComputedStyle(el)[p];
    const preview = q(".preview");
    const fs = px0(cs(preview, "fontSize"));
    function px0(v) { return parseFloat(v); }
    const ps = [...preview.querySelectorAll(":scope > p")];
    const quote = q(".preview blockquote:not(.callout)");
    const strong = q(".preview strong");
    const link = q(".preview p a");
    const box = q('.preview li input[type="checkbox"]');
    const note = q('.preview .callout[data-callout="note"]');
    const title = note.querySelector(".callout-title");
    const rem = px0(cs(document.documentElement, "fontSize"));
    return {
      h1: px0(cs(q(".preview h1"), "fontSize")) / fs,
      h2: px0(cs(q(".preview h2"), "fontSize")) / fs,
      h3: px0(cs(q(".preview h3"), "fontSize")) / fs,
      weight: cs(q(".preview h2"), "fontWeight"),
      widthRem: px0(cs(preview, "maxWidth")) / rem,
      lineHeight: px0(cs(preview, "lineHeight")) / fs,
      quote: { style: cs(quote, "fontStyle"), bar: cs(quote, "borderLeftWidth"), bg: cs(quote, "backgroundColor") },
      link: { bottom: cs(link, "borderBottomWidth"), color: cs(link, "borderBottomColor"), text: cs(link, "color") },
      strong: cs(strong, "color"),
      em: cs(q(".preview em"), "color"),
      ink: cs(ps[0], "color"),
      box: cs(box, "borderTopLeftRadius"),
      boxPx: px0(cs(box, "width")),
      gap: px0(cs(ps[0], "marginBottom")) / px0(cs(ps[0], "fontSize")),
      callout: { bg: cs(note, "backgroundColor"), top: cs(note, "borderTopWidth"), padTop: cs(note, "paddingTop"), titleBg: cs(title, "backgroundColor") },
    };
  });
}
const close = (a, b, eps = 0.03) => expect(Math.abs(a - b)).toBeLessThan(eps);
const keep = async (page, name) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.locator(".leaf:not([hidden]) .preview").first().screenshot({ path: `${SHOTS}/keys-${name}.png` }).catch(() => {});
};
/** Set the root attribute directly: the CSS is what is under test (the settings path is tested once per key below). */
const force = (page, attrName, value) => page.evaluate(([a, v]) => { if (v === null) delete document.documentElement.dataset[a]; else document.documentElement.dataset[a] = v; }, [attrName, value]);

test("with none of the ten keys nothing is written on the root, and the note is the window's own @layout", async ({ app }) => {
  const page = await open(app);
  for (const a of ["headingScale", "headingWeight", "lineWidth", "lineHeight", "blockquoteStyle", "linkStyle", "emphasisColor", "checkboxStyle", "paragraphSpacing", "calloutStyle"]) expect(await attr(page, a), a).toBeNull();
  const f = await facts(page);
  close(f.h1, 1.65);
  close(f.h2, 1.35);
  close(f.h3, 1.12);
  expect(f.weight).toBe("600");
  close(f.lineHeight, 1.7);
  close(f.gap, 0.9, 0.02); // ADR 0061 (revised 2026-10-22): Reading's standard gap is --flow, .9em
  expect(f.quote.style).toBe("italic");
  expect(f.quote.bar).toBe("2px");
  expect(f.link.bottom).toBe("1px");
  expect(f.strong).toBe(f.ink);
  expect(f.em).toBe(f.ink);
  expect(f.callout.top).toBe("0px");
  await keep(page, "default");
});

test("naming the window's own value writes nothing either @layout", async ({ app }) => {
  const page = await open(app, { "heading-scale": "standard", "heading-weight": "semibold", "line-width": "standard", "line-height": "normal", "blockquote-style": "bar-italic", "link-style": "underline", "emphasis-color": "ink", "checkbox-style": "square", "paragraph-spacing": "standard", "callout-style": "tinted" });
  for (const a of ["headingScale", "headingWeight", "lineWidth", "lineHeight", "blockquoteStyle", "linkStyle", "emphasisColor", "checkboxStyle", "paragraphSpacing", "calloutStyle"]) expect(await attr(page, a), a).toBeNull();
});

test("heading-scale and heading-weight", async ({ app }) => {
  const page = await open(app, { "heading-scale": "compact", "heading-weight": "regular" });
  expect(await attr(page, "headingScale")).toBe("compact");
  let f = await facts(page);
  close(f.h1, 1.2);
  close(f.h2, 1.1);
  close(f.h3, 1.04);
  expect(f.weight).toBe("400");
  await keep(page, "heading-compact-regular");
  await force(page, "headingScale", "large");
  await force(page, "headingWeight", "bold");
  f = await facts(page);
  close(f.h1, 2.1);
  close(f.h2, 1.7);
  close(f.h3, 1.35);
  expect(f.weight).toBe("700");
  await keep(page, "heading-large-bold");
});

test("line-width and line-height", async ({ app }) => {
  const page = await open(app, { "line-width": "narrow", "line-height": "snug" });
  expect(await attr(page, "lineWidth")).toBe("narrow");
  let f = await facts(page);
  close(f.widthRem, 40, 0.5);
  close(f.lineHeight, 1.5);
  await keep(page, "width-narrow-snug");
  await force(page, "lineWidth", "wide");
  await force(page, "lineHeight", "relaxed");
  f = await facts(page);
  close(f.widthRem, 72, 0.5);
  close(f.lineHeight, 1.9);
  await keep(page, "width-wide-relaxed");
});

test("blockquote-style", async ({ app }) => {
  const page = await open(app, { "blockquote-style": "panel" });
  expect(await attr(page, "blockquoteStyle")).toBe("panel");
  let f = await facts(page);
  expect(f.quote.bar).toBe("4px");
  expect(f.quote.bg).not.toBe("rgba(0, 0, 0, 0)");
  await keep(page, "quote-panel");
  await force(page, "blockquoteStyle", "bar");
  f = await facts(page);
  expect(f.quote.style).toBe("normal");
  expect(f.quote.bar).toBe("2px");
  await keep(page, "quote-bar");
  await force(page, "blockquoteStyle", "plain");
  f = await facts(page);
  expect(f.quote.style).toBe("normal");
  expect(f.quote.bar).toBe("0px");
  await keep(page, "quote-plain");
});

test("link-style", async ({ app }) => {
  const page = await open(app, { "link-style": "hover" });
  expect(await attr(page, "linkStyle")).toBe("hover");
  let f = await facts(page);
  expect(f.link.color).toBe("rgba(0, 0, 0, 0)");
  await page.locator(".leaf:not([hidden]) .preview p a").first().hover();
  f = await facts(page);
  expect(f.link.color).toBe(f.link.text);
  await keep(page, "link-hover");
  await page.mouse.move(2, 2);
  await force(page, "linkStyle", "plain");
  f = await facts(page);
  expect(f.link.bottom).toBe("0px");
  await keep(page, "link-plain");
});

test("emphasis-color", async ({ app }) => {
  const page = await open(app, { "emphasis-color": "accent" });
  expect(await attr(page, "emphasisColor")).toBe("accent");
  let f = await facts(page);
  expect(f.strong).toBe(f.link.text);
  expect(f.em).toBe(f.link.text);
  expect(f.strong).not.toBe(f.ink);
  await keep(page, "emphasis-accent");
  await force(page, "emphasisColor", "semantic");
  f = await facts(page);
  expect(f.strong).not.toBe(f.ink);
  expect(f.em).not.toBe(f.ink);
  expect(f.strong).not.toBe(f.em);
  await keep(page, "emphasis-semantic");
});

test("checkbox-style", async ({ app }) => {
  const page = await open(app, { "checkbox-style": "round" });
  expect(await attr(page, "checkboxStyle")).toBe("round");
  let f = await facts(page);
  expect(f.box === "50%" || px(f.box) >= f.boxPx / 2 - 0.5).toBe(true);
  await keep(page, "checkbox-round");
  await force(page, "checkboxStyle", "rounded");
  f = await facts(page);
  expect(px(f.box)).toBeGreaterThan(px(f.boxPx) * 0.25);
  expect(px(f.box)).toBeLessThan(px(f.boxPx) * 0.45);
  await force(page, "checkboxStyle", null);
  f = await facts(page);
  expect(px(f.box)).toBeLessThan(px(f.boxPx) * 0.25);
});

test("paragraph-spacing", async ({ app }) => {
  const page = await open(app, { "paragraph-spacing": "loose" });
  expect(await attr(page, "paragraphSpacing")).toBe("loose");
  let f = await facts(page);
  close(f.gap, 1.6, 0.02);
  await keep(page, "paragraph-loose");
  await force(page, "paragraphSpacing", "tight");
  f = await facts(page);
  close(f.gap, 0.5, 0.02);
});

test("callout-style", async ({ app }) => {
  const page = await open(app, { "callout-style": "outlined" });
  expect(await attr(page, "calloutStyle")).toBe("outlined");
  let f = await facts(page);
  expect(f.callout.bg).toBe("rgba(0, 0, 0, 0)");
  expect(f.callout.top).toBe("1px");
  await keep(page, "callout-outlined");
  await force(page, "calloutStyle", "title-bar");
  f = await facts(page);
  expect(f.callout.padTop).toBe("0px");
  expect(f.callout.titleBg).not.toBe("rgba(0, 0, 0, 0)");
  await keep(page, "callout-title-bar");
  await force(page, "calloutStyle", null);
  f = await facts(page);
  expect(f.callout.bg).not.toBe("rgba(0, 0, 0, 0)");
});

// --- the builder -------------------------------------------------------------
const KEYS = {
  "heading-scale": ["Tamanho dos títulos", "large", "headingScale"],
  "heading-weight": ["Peso dos títulos", "bold", "headingWeight"],
  "line-width": ["Largura do texto", "narrow", "lineWidth"],
  "line-height": ["Altura da linha", "relaxed", "lineHeight"],
  "blockquote-style": ["Estilo das citações", "panel", "blockquoteStyle"],
  "link-style": ["Estilo dos links", "plain", "linkStyle"],
  "emphasis-color": ["Cor de negrito e itálico", "semantic", "emphasisColor"],
  "checkbox-style": ["Estilo das caixas de tarefa", "round", "checkboxStyle"],
  "paragraph-spacing": ["Espaço entre parágrafos", "tight", "paragraphSpacing"],
  "callout-style": ["Estilo dos avisos", "title-bar", "calloutStyle"],
};
test("the builder's Structure group has a labelled control for each key, written live and in the sample @layout", async ({ app, page }) => {
  await app.open();
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  await page.locator(".themes").getByRole("button", { name: "Novo tema" }).click();
  const builder = page.locator(".builder");
  await expect(builder).toBeVisible();
  await builder.locator('[data-group="structure"] > summary').click();
  await expect(builder.locator('[data-group="structure"] select')).toHaveCount(16);
  for (const [key, [label, value, name]] of Object.entries(KEYS)) {
    const control = builder.getByLabel(label, { exact: true });
    await expect(control, label).toBeVisible();
    await builder.locator(`[data-style="${key}"] select`).selectOption(value);
    await expect.poll(() => attr(page, name), key).toBe(value);
  }
  // The sample follows: it has bold, italic, task boxes and a second paragraph, and obeys the scale.
  const sample = builder.locator(".look-sample");
  await expect(sample.locator("strong")).toHaveCount(1);
  await expect(sample.locator('input[type="checkbox"]')).toHaveCount(2);
  const h1 = await sample.locator("h1").evaluate((el) => parseFloat(getComputedStyle(el).fontSize) / parseFloat(getComputedStyle(el.parentElement).fontSize));
  expect(Math.abs(h1 - 2.1)).toBeLessThan(0.03);
  await expect(sample.locator("h1")).toHaveCSS("font-weight", "700");
  if (SHOTS) await builder.screenshot({ path: `${SHOTS}/keys-builder-${test.info().project.name}.png` });
  // Back to the first value of each: nothing is left on the root.
  for (const [key, [, , name]] of Object.entries(KEYS)) {
    const first = await builder.locator(`[data-style="${key}"] select option`).first().getAttribute("value");
    await builder.locator(`[data-style="${key}"] select`).selectOption(first);
    await expect.poll(() => attr(page, name), key).toBeNull();
  }
});
