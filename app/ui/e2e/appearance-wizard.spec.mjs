// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The appearance wizard (ADR 0100): Settings › Aparência › Personalizar
// aparência. A colour changed there shows at once in the sample and in the
// window; the contrast of the real pairs is shown live, warned under
// 4,5:1 and undone under 3:1; "Restaurar padrão" always works; a look is
// saved as a profile, exported and imported as a `.verso-theme`; a
// hostile file is refused; a folder's suggested theme is offered and never
// applied by itself.
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures.mjs";

const FILE = ".verso/settings.json";

async function openPanel(app) {
  await app.open();
  await app.page.locator('.ribbon-item[data-id="settings"]').click();
  await app.page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  const panel = app.page.locator(".look");
  await panel.scrollIntoViewIfNeeded();
  return panel;
}
const hex = (panel, token) => panel.locator(`.look-color[data-token="${token}"] .look-hex`);
const rootVar = (page, name) => page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);
const paint = (page, selector) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).color, selector);

async function setColor(panel, token, value) {
  const field = hex(panel, token);
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

test("an ink colour changes the sample and the window at once, no reload", async ({ app }) => {
  const panel = await openPanel(app);
  const before = await paint(app.page, ".look-sample .preview p");
  await setColor(panel, "--ink", "#142850");
  await expect.poll(() => paint(app.page, ".look-sample .preview p")).toBe("rgb(20, 40, 80)");
  expect(await paint(app.page, ".look-sample .preview p")).not.toBe(before);
  // The window itself: the page's own text.
  expect(await app.page.evaluate(() => getComputedStyle(document.body).color)).toBe("rgb(20, 40, 80)");
  expect(await rootVar(app.page, "--ink")).toContain("#142850");
  // The colours derived from the ink follow it; the ones that do not depend on it stay the stylesheet's.
  expect(await rootVar(app.page, "--ink-3")).toMatch(/^light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/);
  expect(await rootVar(app.page, "--paper")).toBe("");
  expect(await rootVar(app.page, "--seal-wash")).toBe("");
  expect(await rootVar(app.page, "--brass")).toBe("");
  // Kept in the person's settings (after a moment), not in the folder.
  await expect.poll(() => app.page.evaluate(() => JSON.parse(localStorage.getItem("verso.settings") ?? "{}").look?.light?.["--ink"])).toBe("#142850");
  expect(await app.file(FILE)).toBeNull();
});

test("the sample is drawn with a note's own classes", async ({ app }) => {
  const panel = await openPanel(app);
  const sample = panel.locator(".look-sample");
  for (const sel of ["h1", "h2", "p", "blockquote", "pre code", "table", "button.save", "a.wikilink", "a.tag", ".callout"]) {
    await expect(sample.locator(sel).first(), sel).toBeAttached();
  }
  // Out of the focus order: the keyboard goes past it.
  await expect(sample).toHaveAttribute("aria-hidden", "true");
  expect(await sample.evaluate((el) => el.inert)).toBe(true);
});

test("a low-contrast choice warns, and says so in a polite live region", async ({ app }) => {
  const panel = await openPanel(app);
  await setColor(panel, "--ink-2", "#8a8a8a");
  const row = panel.locator('.look-ratio[data-pair="ink2"]');
  await expect(row).toHaveAttribute("data-state", "warn");
  await expect(row.locator(".look-ratio-state")).toContainText("abaixo de 4,5:1");
  await expect(panel.locator(".look-ratio-value").first()).toHaveText(/\d+,\d:1/);
  await expect(panel.locator(".look-status")).toContainText("contraste baixo");
  await expect(panel.locator(".look-status")).toHaveAttribute("role", "status");
  await expect(panel.locator(".look-status")).toHaveAttribute("aria-live", "polite");
  // It stands: warned, not undone.
  expect(await rootVar(app.page, "--ink-2")).toContain("#8a8a8a");
});

test("a choice under 3:1 is undone, once, with a message saying what", async ({ app }) => {
  const panel = await openPanel(app);
  const was = await hex(panel, "--ink").inputValue();
  await setColor(panel, "--ink", "#f0ead8");
  await expect(panel.locator(".look-status")).toContainText("Desfeito");
  await expect(panel.locator(".look-status")).toContainText("Texto sobre o papel");
  await expect(hex(panel, "--ink")).toHaveValue(was);
  expect(await rootVar(app.page, "--ink")).toBe("");
});

test("an invalid colour changes nothing and says so", async ({ app }) => {
  const panel = await openPanel(app);
  const was = await hex(panel, "--ink").inputValue();
  await setColor(panel, "--ink", "url(https://example.com/x.png)");
  await expect(panel.locator(".look-status")).toContainText("não é aceita");
  await expect(hex(panel, "--ink")).toHaveValue(was);
  expect(await rootVar(app.page, "--ink")).toBe("");
});

test("light and dark are edited apart", async ({ app }) => {
  const panel = await openPanel(app);
  await setColor(panel, "--ink", "#142850");
  await panel.getByLabel("Escuro").check();
  // The dark side is untouched: its ink is the stylesheet's, and the sample shows dark.
  await expect(panel.locator(".look-sample")).toHaveCSS("color-scheme", "dark");
  await expect(panel.locator('.look-color[data-token="--ink"]')).toHaveAttribute("data-custom", "false");
  await setColor(panel, "--ink", "#e8f0ff");
  expect(await rootVar(app.page, "--ink")).toMatch(/^light-dark\(#142850, #e8f0ff\)$/);
});

test("Restore default is always there, reachable by keyboard, and puts everything back", async ({ app }) => {
  const panel = await openPanel(app);
  await setColor(panel, "--ink", "#142850");
  await panel.locator(".look-sides input").first().focus();
  const reset = panel.getByRole("button", { name: "Restaurar padrão" });
  await expect(reset).toBeVisible();
  await reset.focus();
  await app.page.keyboard.press("Enter");
  await expect.poll(() => rootVar(app.page, "--ink")).toBe("");
  await expect(panel.locator(".look-status")).toContainText("Padrão restaurado");
  await expect(reset).toBeFocused();
  await expect(panel.locator('.look-color[data-token="--ink"]')).toHaveAttribute("data-custom", "false");
});

test("profiles: save, switch, rename, delete", async ({ app }) => {
  const panel = await openPanel(app);
  await setColor(panel, "--ink", "#142850");
  await panel.getByLabel("Nome do perfil").fill("Noite azul");
  await panel.getByRole("button", { name: "Salvar como perfil" }).click();
  await expect(panel.locator(".look-status")).toContainText("Noite azul");
  await expect(panel.getByLabel("Perfil salvo")).toHaveValue("Noite azul");
  await panel.getByRole("button", { name: "Restaurar padrão" }).click();
  expect(await rootVar(app.page, "--ink")).toBe("");
  await panel.getByRole("button", { name: "Usar", exact: true }).click();
  await expect.poll(() => rootVar(app.page, "--ink")).toContain("#142850");
  await panel.getByLabel("Nome do perfil").fill("Madrugada");
  await panel.getByRole("button", { name: "Renomear" }).click();
  await expect(panel.getByLabel("Perfil salvo")).toHaveValue("Madrugada");
  await panel.getByRole("button", { name: "Excluir" }).click();
  await app.page.locator(".confirm-box").getByRole("button", { name: "Excluir" }).click();
  await expect(panel.getByLabel("Perfil salvo")).toHaveValue("");
  expect(await app.page.evaluate(() => JSON.parse(localStorage.getItem("verso.settings") ?? "{}").looks)).toEqual([]);
});

test("a theme exported is imported again as it was", async ({ app }, info) => {
  const panel = await openPanel(app);
  await setColor(panel, "--ink", "#142850");
  await setColor(panel, "--seal", "#7a1f1f");
  const download = app.page.waitForEvent("download");
  await panel.getByRole("button", { name: "Exportar…" }).click();
  const got = await download;
  expect(got.suggestedFilename()).toMatch(/\.verso-theme$/);
  const text = readFileSync(await got.path(), "utf8");
  const obj = JSON.parse(text);
  expect(obj["verso-theme"]).toBe(1);
  expect(obj.tokensVersion).toBe(1);
  expect(obj.values.light["--ink"]).toBe("#142850");
  expect(obj.values.light["--seal"]).toBe("#7a1f1f");
  // Back to the default, then in again through the Import… button.
  await panel.getByRole("button", { name: "Restaurar padrão" }).click();
  expect(await rootVar(app.page, "--ink")).toBe("");
  await app.page.locator("[data-look-import]").setInputFiles({ name: got.suggestedFilename(), mimeType: "application/json", buffer: Buffer.from(text) });
  await expect.poll(() => rootVar(app.page, "--ink")).toContain("#142850");
  expect(await rootVar(app.page, "--seal")).toContain("#7a1f1f");
  await expect(panel.getByLabel("Perfil salvo").locator("option")).toHaveCount(2);
});

test("a hostile file is refused with a message and changes nothing", async ({ app }) => {
  const panel = await openPanel(app);
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
  await expect(panel.getByLabel("Perfil salvo").locator("option")).toHaveCount(1);
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
  // Answered: the same suggestion is not offered again on this device...
  await app.folderChanged([FILE]);
  await app.page.waitForTimeout(300);
  await expect(offer).toHaveCount(0);
  // ...but a changed one is.
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

test("the person sets the current look as the folder's suggestion, and takes it away", async ({ app }) => {
  const panel = await openPanel(app);
  await setColor(panel, "--ink", "#142850");
  await panel.getByRole("button", { name: "Sugerir à pasta" }).click();
  await expect.poll(async () => JSON.parse((await app.file(FILE)) ?? "{}").recommendedTheme?.values?.light?.["--ink"]).toBe("#142850");
  const calls = await app.calls("set_folder_settings");
  expect(calls.length).toBeGreaterThan(0);
  await expect(panel.getByRole("button", { name: "Remover a sugestão" })).toBeVisible();
  await panel.getByRole("button", { name: "Remover a sugestão" }).click();
  await expect.poll(async () => JSON.parse((await app.file(FILE)) ?? "{}").recommendedTheme).toBeUndefined();
});

test("the panel's controls are labelled and the colours reachable by keyboard", async ({ app }) => {
  const panel = await openPanel(app);
  await expect(panel.getByRole("radiogroup", { name: "Lado que você edita" })).toBeVisible();
  for (const name of ["Papel (fundo)", "Tinta (texto)", "Selo (links e destaques)"]) {
    await expect(panel.getByLabel(name, { exact: true })).toBeVisible();
    await expect(panel.getByLabel(`${name}: escolher a cor`)).toBeVisible();
  }
  for (const name of ["Fonte dos títulos", "Fonte de leitura", "Fonte de código", "Tamanho do texto"]) await expect(panel.getByLabel(name)).toBeVisible();
  // Tab from the Ink field reaches its colour-reset only once it is custom.
  await hex(panel, "--ink").focus();
  await app.page.keyboard.press("Tab");
  await expect(panel.locator('.look-color[data-token="--ink-2"] .look-picker, .look-color[data-token="--ink"] .look-reset-token').first()).toBeVisible();
});
