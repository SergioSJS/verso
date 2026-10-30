// The appearance themes (ADR 0100): Settings › Aparência shows a gallery of
// theme cards (Verso's own, the person's, the folder's suggestion); a click
// uses one; Copiar makes an editable copy; Editar opens the theme builder in
// a tab of its own, where a change shows at once in the window and in the
// sample, Cancelar puts everything back and Salvar keeps a profile. The
// contrast of the real pairs is shown live, warned under 4,5:1 and undone
// under 3:1; a theme is exported and imported as a `.verso-theme`; a hostile
// file is refused; a folder's suggested theme is offered and never applied
// by itself.
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures.mjs";

const FILE = ".verso/settings.json";

async function openGallery(app) {
  await app.open();
  await app.page.locator('.ribbon-item[data-id="settings"]').click();
  await app.page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  const gallery = app.page.locator(".themes");
  await gallery.scrollIntoViewIfNeeded();
  return gallery;
}
const card = (page, name) => page.locator(`[data-theme-card="${name}"]`);
const pick = (page, name) => card(page, name).locator(".theme-pick");
const rootVar = (page, name) => page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);
const palette = (page) => page.evaluate(() => document.documentElement.dataset.palette);
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("verso.settings") ?? "{}"));
const paint = (page, selector) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).color, selector);

/** Copiar on a card; the copy's name. */
async function copyOf(app, name) {
  await app.page.getByRole("button", { name: `Copiar ${name}` }).click();
  const copy = `Cópia de ${name}`;
  await expect(card(app.page, copy)).toBeVisible();
  return copy;
}
/** Editar on a card: the builder, open. */
async function editing(app, name) {
  await app.page.getByRole("button", { name: `Editar ${name}` }).click();
  const builder = app.page.locator(".builder");
  await expect(builder).toBeVisible();
  return builder;
}
/** The builder on a new theme: the look as it is, nothing of the person's yet. */
async function fresh(app) {
  const gallery = await openGallery(app);
  await gallery.getByRole("button", { name: "Novo tema" }).click();
  const builder = app.page.locator(".builder");
  await expect(builder).toBeVisible();
  return builder;
}
const hex = (builder, token) => builder.locator(`.look-color[data-token="${token}"] .look-hex`);
async function setColor(builder, token, value) {
  const field = hex(builder, token);
  await field.fill(value);
  await field.press("Enter");
}
const theme = (extra = {}) => ({
  "verso-theme": 1,
  name: "Pergaminho",
  mode: "both",
  tokensVersion: 1,
  values: { light: { "--ink": "#142850", "--paper": "#f6edd8" }, "--heading-font": "serif" },
  ...extra,
});
const file = (obj) => ({ name: "tema.verso-theme", mimeType: "application/json", buffer: Buffer.from(typeof obj === "string" ? obj : JSON.stringify(obj)) });

test("the gallery shows Verso's four themes as named cards, the active one marked", async ({ app }) => {
  const gallery = await openGallery(app);
  for (const name of ["Papel", "Sépia", "Ardósia", "Musgo"]) await expect(pick(app.page, name)).toBeVisible();
  await expect(gallery.getByRole("button", { name: "Papel, tema do Verso, ativo" })).toHaveAttribute("aria-pressed", "true");
  await expect(gallery.getByRole("button", { name: "Sépia, tema do Verso" })).toHaveAttribute("aria-pressed", "false");
  // The settings page stays small: no colour field, no font menu, no contrast list.
  await expect(app.page.locator(".look-color")).toHaveCount(0);
  await expect(app.page.locator(".look-ratio")).toHaveCount(0);
  // A card is a minimal page in the theme's own tokens, not a picture.
  const face = card(app.page, "Sépia").locator(".theme-card");
  await expect(face).toHaveAttribute("data-palette", "sepia");
  for (const part of [".theme-mini-h", ".theme-mini-t", ".theme-mini-a", ".theme-mini-tag"]) await expect(face.locator(part)).toBeAttached();
  const papers = await app.page.evaluate(() => ["Papel", "Sépia", "Ardósia", "Musgo"].map((n) => getComputedStyle(document.querySelector(`[data-theme-card="${n}"] .theme-card`)).backgroundColor));
  expect(new Set(papers).size).toBe(4);
});

test("a card shows the side the window is on", async ({ app }) => {
  await openGallery(app);
  const face = card(app.page, "Papel").locator(".theme-card");
  const light = await face.evaluate((el) => getComputedStyle(el).backgroundColor);
  await app.page.getByLabel("Tema", { exact: true }).selectOption("dark");
  await expect.poll(() => face.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(light);
});

test("the theme mode and the dark tone sit under Temas, above the cards; Texto is its own group", async ({ app }) => {
  await openGallery(app);
  const top = async (loc) => (await loc.first().boundingBox()).y;
  const sub = (t) => app.page.locator(".settings-body .settings-subheading", { hasText: new RegExp(`^${t}$`) });
  const order = {
    temas: await top(sub("Temas")),
    tema: await top(app.page.getByLabel("Tema", { exact: true })),
    tom: await top(app.page.getByLabel("Tom do escuro")),
    cards: await top(app.page.locator(".themes")),
    texto: await top(sub("Texto")),
    size: await top(app.page.locator('.settings-body input[type="range"]')),
  };
  expect(order.temas).toBeLessThan(order.tema);
  expect(order.tema).toBeLessThan(order.tom);
  expect(order.tom).toBeLessThan(order.cards);
  expect(order.cards).toBeLessThan(order.texto);
  expect(order.texto).toBeLessThan(order.size);
  // The search still finds the mode and the tone.
  for (const q of ["claro", "escuro", "tom"]) {
    await app.page.locator(".settings-search").fill(q);
    await expect(app.page.locator(".settings-body")).toContainText(q === "tom" ? "Tom do escuro" : "Tema");
  }
  await app.page.locator(".settings-search").fill("");
  if (process.env.SHOTS) await app.page.screenshot({ path: `${process.env.SHOTS}/appearance.png` });
});

test("a click uses a theme at once, no reload, and the mark moves", async ({ app }) => {
  const gallery = await openGallery(app);
  await pick(app.page, "Sépia").click();
  await expect.poll(() => palette(app.page)).toBe("sepia");
  await expect(gallery.getByRole("button", { name: "Sépia, tema do Verso, ativo" })).toHaveAttribute("aria-pressed", "true");
  await expect(gallery.getByRole("button", { name: "Papel, tema do Verso" })).toHaveAttribute("aria-pressed", "false");
  // With a folder open the choice is the folder's own, per folder and per
  // person (ADR 0100 item 4, 2026-10-27): the person's default is not moved.
  const settings = await stored(app.page);
  expect(Object.values(settings.folderThemes ?? {}).map((t) => t.palette)).toEqual(["sepia"]);
  expect(settings.palette ?? "paper").toBe("paper");
  // The focus stays on the card that was used.
  await expect(pick(app.page, "Sépia")).toBeFocused();
});

test("Copiar makes an editable copy of a Verso theme; Verso's own have no Editar", async ({ app }) => {
  await openGallery(app);
  await expect(app.page.getByRole("button", { name: "Editar Sépia" })).toHaveCount(0);
  await expect(app.page.getByRole("button", { name: "Excluir Sépia" })).toHaveCount(0);
  const copy = await copyOf(app, "Sépia");
  await expect(pick(app.page, copy)).toBeFocused();
  await expect(app.page.locator(".themes-groups")).toContainText("Seus temas");
  // The copy carries the palette's colours.
  const saved = (await stored(app.page)).looks;
  expect(saved.map((p) => p.name)).toEqual([copy]);
  expect(Object.keys(saved[0].theme.light ?? saved[0].theme.values?.light ?? {}).length).toBeGreaterThan(5);
  // Copying a copy numbers it.
  await app.page.getByRole("button", { name: `Copiar ${copy}` }).click();
  await expect(card(app.page, `Cópia de ${copy}`)).toBeVisible();
  // Copying does not apply anything.
  expect(await palette(app.page)).toBe("paper");
});

test("Editar opens the builder in a tab of its own; the settings page steps aside", async ({ app }) => {
  await openGallery(app);
  const copy = await copyOf(app, "Papel");
  const builder = await editing(app, copy);
  await expect(app.page.locator(".settings-box")).toBeHidden();
  await expect(app.page.getByRole("tab", { name: "Construtor de tema" })).toBeVisible();
  await expect(builder.getByRole("heading", { name: `Editando “${copy}”` })).toBeVisible();
  await expect(builder.getByLabel("Nome do tema")).toHaveValue(copy);
  // Controls on one side, a large sample on the other.
  await expect(builder.locator(".look-colors")).toBeVisible();
  await expect(builder.locator(".look-sample")).toBeVisible();
  // One builder at a time: editing another theme comes back to the same tab.
  await expect(app.page.getByRole("tab", { name: "Construtor de tema" })).toHaveCount(1);
});

test("a change in the builder shows at once in the sample and in the window", async ({ app }) => {
  await openGallery(app);
  const copy = await copyOf(app, "Papel");
  const builder = await editing(app, copy);
  const before = await paint(app.page, ".look-sample .preview p");
  await setColor(builder, "--ink", "#142850");
  await expect.poll(() => paint(app.page, ".look-sample .preview p")).toBe("rgb(20, 40, 80)");
  expect(await paint(app.page, ".look-sample .preview p")).not.toBe(before);
  expect(await app.page.evaluate(() => getComputedStyle(document.body).color)).toBe("rgb(20, 40, 80)");
  expect(await rootVar(app.page, "--ink")).toContain("#142850");
  expect(await rootVar(app.page, "--ink-3")).toMatch(/^light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/);
  // Nothing is written down until Salvar.
  const kept = (await stored(app.page)).looks.find((p) => p.name === copy);
  expect(JSON.stringify(kept)).not.toContain("142850");
  expect(await app.file(FILE)).toBeNull();
});

test("Cancelar puts everything back and returns to the card", async ({ app }) => {
  await openGallery(app);
  const copy = await copyOf(app, "Papel");
  const wasInk = await app.page.evaluate(() => getComputedStyle(document.body).color);
  const builder = await editing(app, copy);
  await setColor(builder, "--ink", "#142850");
  await builder.locator("select").first().selectOption("mono");
  await expect.poll(() => rootVar(app.page, "--ink")).toContain("#142850");
  await builder.getByRole("button", { name: "Cancelar" }).click();
  await expect(app.page.locator(".builder")).toHaveCount(0);
  await expect(app.page.getByRole("tab", { name: "Construtor de tema" })).toHaveCount(0);
  expect(await app.page.evaluate(() => getComputedStyle(document.body).color)).toBe(wasInk);
  expect(await rootVar(app.page, "--ink")).toBe("");
  expect((await stored(app.page)).headingFont ?? "serif").toBe("serif");
  // The settings page is back, on the theme's card.
  await expect(app.page.locator(".settings-box")).toBeVisible();
  await expect(pick(app.page, copy)).toBeFocused();
});

test("Salvar keeps the theme, applies it, and returns to the card", async ({ app }) => {
  await openGallery(app);
  const copy = await copyOf(app, "Papel");
  const builder = await editing(app, copy);
  await setColor(builder, "--ink", "#142850");
  await builder.getByLabel("Nome do tema").fill("Noite azul");
  await builder.getByRole("button", { name: "Salvar tema" }).click();
  await expect(app.page.locator(".builder")).toHaveCount(0);
  await expect(card(app.page, "Noite azul")).toBeVisible();
  await expect(card(app.page, copy)).toHaveCount(0);
  await expect(pick(app.page, "Noite azul")).toBeFocused();
  await expect(app.page.getByRole("button", { name: "Noite azul, seu tema, ativo" })).toHaveAttribute("aria-pressed", "true");
  expect(await rootVar(app.page, "--ink")).toContain("#142850");
  const looks = (await stored(app.page)).looks;
  expect(looks.map((p) => p.name)).toEqual(["Noite azul"]);
  expect(JSON.stringify(looks[0])).toContain("#142850");
  // The card draws the saved colours.
  const ink = await card(app.page, "Noite azul").locator(".theme-mini-t").evaluate((el) => getComputedStyle(el).color);
  expect(ink).toBe("rgb(20, 40, 80)");
});

test("closing the builder's tab with changes asks; Descartar puts the look back", async ({ app }) => {
  await openGallery(app);
  const copy = await copyOf(app, "Papel");
  const builder = await editing(app, copy);
  await setColor(builder, "--ink", "#142850");
  await app.page.getByRole("tab", { name: /Construtor de tema/ }).locator(".tab-close").click();
  const box = app.page.locator(".confirm-box");
  await expect(box).toContainText("mudanças não salvas");
  await box.getByRole("button", { name: "Descartar" }).click();
  await expect(app.page.locator(".builder")).toHaveCount(0);
  expect(await rootVar(app.page, "--ink")).toBe("");
  await expect(app.page.locator(".settings-box")).toBeVisible();
});

test("a new theme needs a name, then it is a card", async ({ app }) => {
  const gallery = await openGallery(app);
  await gallery.getByRole("button", { name: "Novo tema" }).click();
  const builder = app.page.locator(".builder");
  await expect(builder.getByRole("heading", { name: "Novo tema" })).toBeVisible();
  await setColor(builder, "--seal", "#7a1f1f");
  await builder.getByRole("button", { name: "Salvar tema" }).click();
  await expect(builder.locator(".look-status")).toContainText("Dê um nome");
  await builder.getByLabel("Nome do tema").fill("Vinho");
  await builder.getByRole("button", { name: "Salvar tema" }).click();
  await expect(card(app.page, "Vinho")).toBeVisible();
});

test("a low-contrast choice warns, and says so in a polite live region", async ({ app }) => {
  const builder = await fresh(app);
  await setColor(builder, "--ink-2", "#8a8a8a");
  const row = builder.locator('.look-ratio[data-pair="ink2"]');
  await expect(row).toHaveAttribute("data-state", "warn");
  await expect(row.locator(".look-ratio-state")).toContainText("abaixo de 4,5:1");
  await expect(builder.locator(".look-ratio-value").first()).toHaveText(/\d+,\d:1/);
  await expect(builder.locator(".look-contrast-state")).toContainText(/avisos?/);
  await expect(builder.locator(".look-contrast")).toHaveAttribute("open", "");
  await expect(builder.locator(".look-status")).toContainText("contraste baixo");
  await expect(builder.locator(".look-status")).toHaveAttribute("role", "status");
  await expect(builder.locator(".look-status")).toHaveAttribute("aria-live", "polite");
  expect(await rootVar(app.page, "--ink-2")).toContain("#8a8a8a");
});

test("a choice under 3:1 is undone, once, with a message saying what", async ({ app }) => {
  const builder = await fresh(app);
  const was = await hex(builder, "--ink").inputValue();
  const ink = await rootVar(app.page, "--ink");
  await setColor(builder, "--ink", "#f0ead8");
  await expect(builder.locator(".look-status")).toContainText("Desfeito");
  await expect(builder.locator(".look-status")).toContainText("Texto sobre o papel");
  await expect(hex(builder, "--ink")).toHaveValue(was);
  expect(await rootVar(app.page, "--ink")).toBe(ink);
});

test("an invalid colour changes nothing and says so", async ({ app }) => {
  const builder = await fresh(app);
  const was = await hex(builder, "--ink").inputValue();
  const ink = await rootVar(app.page, "--ink");
  await setColor(builder, "--ink", "url(https://example.com/x.png)");
  await expect(builder.locator(".look-status")).toContainText("não é aceita");
  await expect(hex(builder, "--ink")).toHaveValue(was);
  expect(await rootVar(app.page, "--ink")).toBe(ink);
});

test("light and dark are edited apart", async ({ app }) => {
  const builder = await fresh(app);
  await builder.getByLabel("Claro").check();
  await setColor(builder, "--ink", "#142850");
  await builder.getByLabel("Escuro").check();
  await expect(builder.locator(".look-sample")).toHaveCSS("color-scheme", "dark");
  await expect(builder.locator('.look-color[data-token="--ink"]')).toHaveAttribute("data-custom", "false");
  await setColor(builder, "--ink", "#e8f0ff");
  expect(await rootVar(app.page, "--ink")).toMatch(/^light-dark\(#142850, #e8f0ff\)$/);
});

test("Restaurar padrão is in the builder, by keyboard, and puts the draft back to the default", async ({ app }) => {
  const builder = await fresh(app);
  await setColor(builder, "--ink", "#142850");
  const reset = builder.getByRole("button", { name: "Restaurar padrão" });
  await reset.focus();
  await app.page.keyboard.press("Enter");
  await expect.poll(() => rootVar(app.page, "--ink")).toBe("");
  await expect(builder.locator(".look-status")).toContainText("Padrão restaurado");
  await expect(reset).toBeFocused();
  await expect(builder.locator('.look-color[data-token="--ink"]')).toHaveAttribute("data-custom", "false");
});

test("the sample is drawn with a note's own classes and is out of the focus order", async ({ app }) => {
  const builder = await fresh(app);
  const sample = builder.locator(".look-sample");
  for (const sel of ["h1", "h2", "p", "blockquote", "pre code", "table", "button.save", "a.wikilink", "a.tag", ".callout"]) {
    await expect(sample.locator(sel).first(), sel).toBeAttached();
  }
  await expect(sample).toHaveAttribute("aria-hidden", "true");
  expect(await sample.evaluate((el) => el.inert)).toBe(true);
});

test("the builder's controls are labelled and the colours reachable by keyboard", async ({ app }) => {
  const builder = await fresh(app);
  await expect(builder.getByRole("radiogroup", { name: "Lado que você edita" })).toBeVisible();
  for (const name of ["Papel (fundo)", "Tinta (texto)", "Selo (links e destaques)"]) {
    await expect(builder.getByLabel(name, { exact: true })).toBeVisible();
    await expect(builder.getByLabel(`${name}: escolher a cor`)).toBeVisible();
  }
  for (const name of ["Fonte dos títulos", "Fonte de leitura", "Fonte de código", "Tamanho do texto", "Nome do tema"]) await expect(builder.getByLabel(name)).toBeVisible();
  await hex(builder, "--ink").focus();
  await app.page.keyboard.press("Tab");
  await expect(builder.locator('.look-color[data-token="--ink"] .look-picker')).toBeVisible();
});

test("the gallery by keyboard: Tab to a card, Space uses it, Tab to Editar, Enter opens the builder", async ({ app }) => {
  await openGallery(app);
  const copy = await copyOf(app, "Papel");
  await pick(app.page, "Sépia").focus();
  await app.page.keyboard.press("Space");
  await expect.poll(() => palette(app.page)).toBe("sepia");
  await pick(app.page, copy).focus();
  await app.page.keyboard.press("Tab");
  await expect(app.page.getByRole("button", { name: `Copiar ${copy}` })).toBeFocused();
  await app.page.keyboard.press("Tab");
  await expect(app.page.getByRole("button", { name: `Editar ${copy}` })).toBeFocused();
  await app.page.keyboard.press("Enter");
  await expect(app.page.locator(".builder")).toBeVisible();
  await expect(app.page.locator(".builder").getByLabel("Nome do tema")).toBeFocused();
});

test("Excluir asks, then removes the card and keeps the focus in the gallery", async ({ app }) => {
  await openGallery(app);
  const copy = await copyOf(app, "Papel");
  await app.page.getByRole("button", { name: `Excluir ${copy}` }).click();
  await app.page.locator(".confirm-box").getByRole("button", { name: "Excluir" }).click();
  await expect(card(app.page, copy)).toHaveCount(0);
  expect((await stored(app.page)).looks).toEqual([]);
  expect(await app.page.evaluate(() => Boolean(document.activeElement?.closest(".themes")))).toBe(true);
});

test("a theme exported is imported again as it was", async ({ app }) => {
  await openGallery(app);
  const copy = await copyOf(app, "Papel");
  const builder = await editing(app, copy);
  await setColor(builder, "--ink", "#142850");
  await setColor(builder, "--seal", "#7a1f1f");
  await builder.getByLabel("Nome do tema").fill("Noite");
  await builder.getByRole("button", { name: "Salvar tema" }).click();
  const download = app.page.waitForEvent("download");
  await app.page.getByRole("button", { name: "Exportar Noite" }).click();
  const got = await download;
  expect(got.suggestedFilename()).toMatch(/\.verso-theme$/);
  const text = readFileSync(await got.path(), "utf8");
  const obj = JSON.parse(text);
  expect(obj["verso-theme"]).toBe(1);
  expect(obj.tokensVersion).toBe(1);
  expect(obj.values.light["--ink"]).toBe("#142850");
  expect(obj.values.light["--seal"]).toBe("#7a1f1f");
  // Delete it, then back in through Importar….
  await app.page.getByRole("button", { name: "Excluir Noite" }).click();
  await app.page.locator(".confirm-box").getByRole("button", { name: "Excluir" }).click();
  await expect(card(app.page, "Noite")).toHaveCount(0);
  await app.page.locator("[data-look-import]").setInputFiles({ name: got.suggestedFilename(), mimeType: "application/json", buffer: Buffer.from(text) });
  await expect(card(app.page, "Noite")).toBeVisible();
  await expect.poll(() => rootVar(app.page, "--ink")).toContain("#142850");
  expect(await rootVar(app.page, "--seal")).toContain("#7a1f1f");
});

test("a hostile file is refused with a message and changes nothing", async ({ app }) => {
  await openGallery(app);
  const hostile = [
    [theme({ values: { light: { "--ink": "url(https://evil.example/a.png)" } } }), "contém algo"],
    [theme({ values: { light: { "--accent": "#ff0000" } } }), "Campo desconhecido"],
    [theme({ css: "body{display:none}" }), "Campo desconhecido"],
    [theme({ values: { "--book": "Comic Sans MS" } }), "só aceita"],
    [theme({ values: { light: { "--ink": "#fbf6ea", "--paper": "#fbf6ea" } } }), "ilegível"],
    ["{ not json", "JSON"],
    [JSON.stringify({ ...theme(), padding: "x".repeat(20000) }), "16 KB"],
  ];
  for (const [content, words] of hostile) {
    await app.page.locator("[data-look-import]").setInputFiles(file(content));
    const box = app.page.locator(".confirm-box");
    await expect(box).toBeVisible();
    await expect(box).toContainText("Não foi possível importar o tema");
    await expect(box).toContainText(words);
    await box.getByRole("button", { name: "Entendi" }).click();
    await expect(box).toBeHidden();
  }
  expect(await rootVar(app.page, "--ink")).toBe("");
  expect(await rootVar(app.page, "--paper")).toBe("");
  await expect(app.page.locator(".theme-item")).toHaveCount(4);
});

test("a .verso-theme dropped on the window is applied", async ({ app }) => {
  await app.open();
  await app.page.evaluate((text) => {
    const data = new DataTransfer();
    data.items.add(new File([text], "pergaminho.verso-theme", { type: "application/json" }));
    document.body.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, JSON.stringify(theme()));
  await expect.poll(() => rootVar(app.page, "--ink")).toContain("#142850");
  await expect(app.page.locator("#status")).toContainText("Pergaminho");
});

test("the folder's suggested theme is offered, never applied by itself, and the answer is kept", async ({ app }) => {
  await app.open();
  await app.writeOutside(FILE, JSON.stringify({ recommendedTheme: theme({ name: "Tema da mesa" }) }));
  await app.folderChanged([FILE]);
  const offer = app.page.locator(".look-offer");
  await expect(offer).toBeVisible();
  await expect(offer).toContainText("Tema da mesa");
  expect(await rootVar(app.page, "--ink")).toBe("");
  await offer.getByRole("button", { name: "Usar" }).click();
  await expect(offer).toBeHidden();
  await expect.poll(() => rootVar(app.page, "--ink")).toContain("#142850");
  await app.folderChanged([FILE]);
  await app.page.waitForTimeout(300);
  await expect(offer).toHaveCount(0);
  await app.writeOutside(FILE, JSON.stringify({ recommendedTheme: theme({ name: "Outro tema", values: { light: { "--ink": "#201010" } } }) }));
  await app.folderChanged([FILE]);
  await expect(offer).toContainText("Outro tema");
  await offer.getByRole("button", { name: "Agora não" }).click();
  await expect(offer).toBeHidden();
  expect(await rootVar(app.page, "--ink")).toContain("#142850");
  await app.folderChanged([FILE]);
  await app.page.waitForTimeout(300);
  await expect(offer).toHaveCount(0);
});

test("a suggestion that is not a good theme is not offered", async ({ app }) => {
  await app.open();
  await app.writeOutside(FILE, JSON.stringify({ recommendedTheme: theme({ values: { light: { "--ink": "url(x)" } } }) }));
  await app.folderChanged([FILE]);
  await app.page.waitForTimeout(300);
  await expect(app.page.locator(".look-offer")).toHaveCount(0);
});

test("the folder's suggestion is a card of its own in the gallery", async ({ app }) => {
  await app.open();
  await app.writeOutside(FILE, JSON.stringify({ recommendedTheme: theme({ name: "Tema da mesa" }) }));
  await app.folderChanged([FILE]);
  await app.page.locator(".look-offer").getByRole("button", { name: "Agora não" }).click();
  await app.page.locator('.ribbon-item[data-id="settings"]').click();
  await app.page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  await expect(app.page.locator(".themes-groups")).toContainText("Sugerido pela pasta");
  const suggested = app.page.getByRole("button", { name: "Tema da mesa, sugerido pela pasta" });
  await expect(suggested).toBeVisible();
  expect(await rootVar(app.page, "--ink")).toBe("");
  await suggested.click();
  await expect.poll(() => rootVar(app.page, "--ink")).toContain("#142850");
  // It is now one of the person's own.
  await expect(card(app.page, "Tema da mesa")).toBeVisible();
  await expect(app.page.locator(".themes-groups")).not.toContainText("Sugerido pela pasta");
});

test("the notice does not move focus and respects reduced motion", async ({ app, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await app.open();
  const before = await page.evaluate(() => document.activeElement?.tagName);
  await app.writeOutside(FILE, JSON.stringify({ recommendedTheme: theme() }));
  await app.folderChanged([FILE]);
  const offer = page.locator(".look-offer");
  await expect(offer).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(before);
  await expect(offer).toHaveCSS("animation-name", "none");
  await expect(offer.locator('[role="status"]')).toBeAttached();
});

test("the person sets a theme as the folder's suggestion from the builder, and takes it away", async ({ app }) => {
  await openGallery(app);
  const builder = await editing(app, await copyOf(app, "Papel"));
  await setColor(builder, "--ink", "#142850");
  await builder.locator(".look-share > summary").click();
  await builder.getByRole("button", { name: "Sugerir à pasta" }).click();
  await expect.poll(async () => JSON.parse((await app.file(FILE)) ?? "{}").recommendedTheme?.values?.light?.["--ink"]).toBe("#142850");
  const calls = await app.calls("set_folder_settings");
  expect(calls.length).toBeGreaterThan(0);
  await expect(builder.getByRole("button", { name: "Remover a sugestão" })).toBeVisible();
  await builder.getByRole("button", { name: "Remover a sugestão" }).click();
  await expect.poll(async () => JSON.parse((await app.file(FILE)) ?? "{}").recommendedTheme).toBeUndefined();
});

test("the builder is one column in a narrow pane and keeps both halves", async ({ app, page }) => {
  const builder = await fresh(app);
  await page.setViewportSize({ width: 560, height: 900 });
  const left = await builder.locator(".builder-left").boundingBox();
  const sample = await builder.locator(".look-sample-box").boundingBox();
  expect(sample.y).toBeGreaterThan(left.y);
  expect(Math.abs(sample.x - left.x)).toBeLessThan(4);
  await expect(builder.getByRole("button", { name: "Salvar tema" })).toBeVisible();
});
