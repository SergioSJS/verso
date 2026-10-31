// Themes, second step (ADR 0109): a version 1 theme looks exactly as it did
// (computed styles and a screenshot of a note with headings, code, callouts,
// a table and tags, written under SHOTS for a before/after comparison); a
// version 2 theme paints each of the new tokens and structural choices.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "./fixtures.mjs";

const SHOTS = process.env.SHOTS;
const LABEL = process.env.LABEL ?? "now";

export const NOTE = `---
tags: [mundo]
---
# Título um
## Título dois
### Título três
#### Título quatro
##### Título cinco
###### Título seis

Texto com \`código em linha\` e a tag #etiqueta e outra #mundo/cidade.

\`\`\`js
const tinta = "legível";
\`\`\`

> [!note] Uma nota
> Corpo da nota.

> [!tip] Uma dica
> Corpo da dica.

> [!warning] Um aviso
> Corpo do aviso.

> [!question] Uma dúvida
> Corpo da dúvida.

> [!danger] Um perigo
> Corpo do perigo.

> [!example] Um exemplo
> Corpo do exemplo.

> [!abstract] Um resumo
> Corpo do resumo.

| Item | Valor |
| --- | --- |
| Papel | claro |
| Tinta | escura |
| Selo | vermelho |
`;

export const v1 = {
  "verso-theme": 1,
  name: "Pergaminho",
  mode: "both",
  tokensVersion: 1,
  values: {
    light: { "--paper": "#f6edd8", "--paper-2": "#ece1c6", "--ink": "#2a2218", "--seal": "#9a2a22", "--brass-ink": "#6b4a10" },
    dark: { "--paper": "#241f17", "--paper-2": "#2d271d", "--ink": "#eadfc8", "--seal": "#e58a80", "--brass-ink": "#d9b46a" },
    "--heading-font": "serif",
  },
};
export const file = (obj, name = "tema.verso-theme") => ({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(obj)) });

/** The settings a theme leaves behind once applied (what the gallery's click writes). */
export function settingsOf(theme) {
  const out = { look: { light: theme.values.light ?? {}, dark: theme.values.dark ?? {} }, lookName: theme.name };
  if (theme.values["--heading-font"]) out.headingFont = theme.values["--heading-font"];
  for (const key of ["surface-mode", "heading-style", "table-style", "tag-style", "radius", "heading-scale", "heading-weight", "line-width", "line-height", "blockquote-style", "link-style", "emphasis-color", "checkbox-style", "paragraph-spacing", "callout-style"]) if (theme.values[key]) (out.look.style ??= {})[key] = theme.values[key];
  if (theme.values["--book"]) out.look.book = theme.values["--book"];
  return out;
}

/** Open the window with a theme already in the settings, and the sample note. Any screen. */
export async function useTheme(app, theme, scheme = "light") {
  const { page } = app;
  await page.emulateMedia({ colorScheme: scheme });
  await page.addInitScript((s) => localStorage.setItem("verso.settings", s), JSON.stringify(settingsOf(theme)));
  await app.open();
  await app.writeOutside("Amostra.md", NOTE);
  await app.folderChanged(["Amostra.md"], true);
  await app.quickOpen("Amostra");
  await expect(page.locator(".leaf:not([hidden]) .preview h1")).toBeVisible();
}

const PROPS = ["color", "backgroundColor", "borderRadius", "borderLeftColor", "borderLeftWidth", "borderBottomWidth", "borderTopWidth", "paddingLeft", "paddingBottom", "fontVariantCaps", "letterSpacing"];
/** The computed styles of what the new tokens touch, by selector. */
export function snapshot(page) {
  return page.evaluate((props) => {
    const sel = {
      h1: ".preview h1", h2: ".preview h2", h3: ".preview h3", h4: ".preview h4", h5: ".preview h5", h6: ".preview h6",
      code: ".preview p code", pre: ".preview pre", preCode: ".preview pre code",
      note: '.preview .callout[data-callout="note"]', noteTitle: '.preview .callout[data-callout="note"] .callout-title',
      tip: '.preview .callout[data-callout="tip"] .callout-title', warning: '.preview .callout[data-callout="warning"] .callout-title',
      question: '.preview .callout[data-callout="question"] .callout-title', danger: '.preview .callout[data-callout="danger"] .callout-title',
      example: '.preview .callout[data-callout="example"] .callout-title', abstract: '.preview .callout[data-callout="abstract"] .callout-title',
      th: ".preview th", td: ".preview td", tr2: ".preview tbody tr:nth-child(2)", tag: ".preview a.tag, .tag-pill", side: "aside.side", ribbon: ".ribbon", spaces: ".spaces", work: "main.work", right: "aside.right",
    };
    const out = {};
    for (const [k, s] of Object.entries(sel)) {
      const el = document.querySelector(s);
      if (!el) { out[k] = null; continue; }
      const cs = getComputedStyle(el);
      out[k] = Object.fromEntries(props.map((p) => [p, cs[p]]));
    }
    out.body = { backgroundColor: getComputedStyle(document.body).backgroundColor };
    return out;
  }, PROPS);
}

export function keep(page, name, data) {
  if (!SHOTS) return Promise.resolve();
  mkdirSync(SHOTS, { recursive: true });
  if (data) writeFileSync(`${SHOTS}/${name}.json`, JSON.stringify(data, null, 1));
  return Promise.all([
    page.screenshot({ path: `${SHOTS}/${name}.png` }),
    page.locator(".leaf:not([hidden]) .preview").first().screenshot({ path: `${SHOTS}/${name}-note.png` }).catch(() => {}),
  ]);
}

for (const scheme of ["light", "dark"]) {
  test(`a version 1 theme looks the same (${scheme}) @layout`, async ({ app }, info) => {
    await useTheme(app, v1, scheme);
    const snap = await snapshot(app.page);
    await keep(app.page, `v1-${LABEL}-${scheme}-${info.project.name}`, snap);
    expect(snap.h1.color).not.toBe("");
  });
}

const aurora = JSON.parse(readFileSync(new URL("../test/fixtures/themes/v2-aurora.verso-theme", import.meta.url), "utf8"));
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const calls = {
  note: "--blue", tip: "--green", warning: "--orange", question: "--yellow", danger: "--red", example: "--purple", abstract: "--cyan",
};

for (const scheme of ["light", "dark"]) {
  test(`a version 2 theme paints its colours and its structure (${scheme}) @layout`, async ({ app }, info) => {
    await useTheme(app, aurora, scheme);
    const snap = await snapshot(app.page);
    await keep(app.page, `v2-${LABEL}-${scheme}-${info.project.name}`, snap);
    const side = aurora.values[scheme];
    // What the theme does not set on this side follows the stylesheet: the seal for red, the ink 2 for h4.
    const seal = side["--seal"];
    const want = (token, fallback) => rgb(side[token] ?? fallback);
    expect(snap.h1.color).toBe(want("--h1-color"));
    expect(snap.h2.color).toBe(want("--h2-color"));
    expect(snap.h3.color).toBe(want("--h3-color"));
    expect(snap.h4.color).toBe(want("--h4-color", side["--ink-2"]));
    expect(snap.code.color).toBe(want("--code-ink"));
    expect(snap.code.backgroundColor).toBe(want("--code-paper"));
    expect(snap.pre.backgroundColor).toBe(want("--code-paper"));
    for (const [kind, token] of Object.entries(calls)) {
      const title = await app.page.evaluate((k) => getComputedStyle(document.querySelector(`.preview .callout[data-callout="${k}"] .callout-title`)).color, kind);
      // A semantic colour the theme does not set: the window's own (red is the seal), checked by not being the paper.
      if (side[token]) expect(title, `${kind} (${scheme})`).toBe(rgb(side[token]));
      else if (token === "--red") expect(title).toBe(rgb(seal));
      else expect(title).not.toBe("");
    }
    // Structure: round corners, a rule under the big headings, striped table, outlined tag.
    expect(snap.note.borderRadius).toBe("12px");
    expect(snap.h1.borderBottomWidth).toBe("1px");
    expect(snap.h3.borderBottomWidth).toBe("0px");
    expect(snap.tr2.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(snap.tag.borderTopWidth).toBe("1px");
    expect(snap.tag.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    if (info.project.name.startsWith("phone")) expect(snap.side.borderTopWidth).not.toBe("6px");
    else {
      expect(snap.side.borderTopWidth).toBe("6px");
      expect(snap.side.borderRadius).toBe("22px");
    }
  });
}

test("a version 2 theme of the flat and sharp choices", async ({ app }, info) => {
  test.skip(info.project.name.startsWith("phone"), "desktop structure");
  const flat = { ...aurora, name: "Lisa", values: { ...aurora.values, "surface-mode": "flat", radius: "sharp", "heading-style": "accent-bar", "tag-style": "minimal", "table-style": "bordered" } };
  await useTheme(app, flat, "light");
  const snap = await snapshot(app.page);
  expect(snap.side.backgroundColor).toBe(snap.body.backgroundColor);
  expect(snap.note.borderRadius).toBe("2px");
  expect(snap.h2.borderLeftWidth).toBe("3px");
  expect(snap.tag.borderTopWidth).toBe("0px");
  expect(snap.th.borderTopWidth).toBe("1px");
  await keep(app.page, `v2-${LABEL}-flat-sharp`, snap);
});

test("a version 2 theme of the contrast choice", async ({ app }, info) => {
  test.skip(info.project.name.startsWith("phone"), "desktop structure");
  const contrast = { ...aurora, name: "Contraste", values: { ...aurora.values, "surface-mode": "contrast", radius: "soft", "heading-style": "small-caps" } };
  await useTheme(app, contrast, "light");
  const snap = await snapshot(app.page);
  // The sidebar reads the dark side of the theme even in the light scheme.
  expect(snap.side.backgroundColor).toBe(rgb(aurora.values.dark["--paper-2"]));
  expect(snap.body.backgroundColor).not.toBe(snap.side.backgroundColor);
  expect(snap.h3.fontVariantCaps).toBe("small-caps");
  await keep(app.page, `v2-${LABEL}-contrast`, snap);
});
