// The theme builder's version 2 groups (ADR 0109 item 4): Base open, the
// others folded until opened (on a phone, one group at a time); a colour set
// in a group is written on the window and shown in the sample; a structural
// choice is written as data-*; a heading colour that would be unreadable is
// undone and said; Salvar keeps the extras, the choices in the profile.
import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures.mjs";

const SHOTS = process.env.SHOTS;
const LABEL = process.env.LABEL ?? "now";

async function newTheme(app) {
  const { page } = app;
  await app.open();
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  await page.locator(".themes").getByRole("button", { name: "Novo tema" }).click();
  const builder = page.locator(".builder");
  await expect(builder).toBeVisible();
  return builder;
}
const group = (builder, id) => builder.locator(`[data-group="${id}"]`);
const open = (builder, id) => group(builder, id).locator("> summary").click();
const hex = (builder, token) => builder.locator(`.look-color[data-token="${token}"] .look-hex`);
async function setColor(builder, token, value) {
  const field = hex(builder, token);
  await field.fill(value);
  await field.press("Enter");
}
const root = (page, name) => page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);
const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;

test("Base is open, the other groups are folded until opened; on a phone one at a time @layout", async ({ app, page }) => {
  const builder = await newTheme(app);
  await expect(group(builder, "base")).toHaveAttribute("open", "");
  for (const id of ["headings", "code", "callouts", "structure"]) await expect(group(builder, id)).not.toHaveAttribute("open", "");
  // The titles of the groups, in order.
  const titles = await builder.locator(".look-group > summary").allTextContents();
  expect(titles).toEqual(["Base", "Títulos", "Código", "Cores das callouts", "Estrutura"]);
  await open(builder, "headings");
  await expect(hex(builder, "--h1-color")).toBeVisible();
  await open(builder, "code");
  await expect(hex(builder, "--code-ink")).toBeVisible();
  if (phone(page)) {
    await expect(group(builder, "headings")).not.toHaveAttribute("open", "");
    await expect(group(builder, "base")).not.toHaveAttribute("open", "");
  } else {
    await expect(group(builder, "headings")).toHaveAttribute("open", "");
  }
  if (SHOTS) {
    await open(builder, "callouts");
    await builder.screenshot({ path: `${SHOTS}/builder-${LABEL}-groups-${test.info().project.name}.png` });
  }
});

test("a heading colour is written on the window and drawn in the sample @layout", async ({ app, page }) => {
  const builder = await newTheme(app);
  await open(builder, "headings");
  await setColor(builder, "--h2-color", "#1d4e6b");
  await expect(builder.locator(".look-sample h2")).toHaveCSS("color", "rgb(29, 78, 107)");
  expect(await root(page, "--h2-color")).toContain("#1d4e6b");
  await expect(builder.locator('.look-color[data-token="--h2-color"]')).toHaveAttribute("data-custom", "true");
  // Putting it back: the variable is gone, the sample follows what it had.
  await builder.locator('.look-color[data-token="--h2-color"] .look-reset-token').click();
  expect(await root(page, "--h2-color")).toBe("");
});

test("a callout colour and the code colours reach the sample", async ({ app, page }) => {
  const builder = await newTheme(app);
  await open(builder, "callouts");
  await setColor(builder, "--blue", "#1f4fb0");
  await expect(builder.locator('.look-sample .callout[data-callout="note"] .callout-title')).toHaveCSS("color", "rgb(31, 79, 176)");
  await open(builder, "code");
  await setColor(builder, "--code-paper", "#ece9dd");
  await setColor(builder, "--code-ink", "#3b2f6b");
  await expect(builder.locator(".look-sample pre")).toHaveCSS("background-color", "rgb(236, 233, 221)");
  await expect(builder.locator(".look-sample pre")).toHaveCSS("color", "rgb(59, 47, 107)");
});

test("a structural choice is written as data-* and the default writes nothing @layout", async ({ app, page }) => {
  const builder = await newTheme(app);
  await open(builder, "structure");
  const pick = (key, value) => builder.locator(`[data-style="${key}"] select`).selectOption(value);
  await pick("radius", "sharp");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.radius)).toBe("sharp");
  await pick("heading-style", "rule");
  await pick("table-style", "striped");
  await pick("tag-style", "outline");
  await pick("surface-mode", "flat");
  const data = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  expect(data).toMatchObject({ radius: "sharp", headingStyle: "rule", tableStyle: "striped", tagStyle: "outline", surface: "flat" });
  await expect(builder.locator(".look-sample h1")).toHaveCSS("border-bottom-width", "1px");
  await pick("radius", "soft");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.radius)).toBeUndefined();
});

test("a heading colour that would blank the page is undone, and said", async ({ app, page }) => {
  const builder = await newTheme(app);
  await open(builder, "headings");
  const paper = await hex(builder, "--paper").inputValue();
  await setColor(builder, "--h2-color", paper);
  await expect(builder.locator(".look-status")).toContainText("Desfeito");
  await expect(builder.locator(".look-status")).toContainText("Título 2 sobre o papel");
  expect(await root(page, "--h2-color")).toBe("");
});

test("the contrast list watches the code's ink and the headings", async ({ app, page }) => {
  const builder = await newTheme(app);
  await builder.locator(".look-contrast > summary").click();
  const names = await builder.locator(".look-ratio-name").allTextContents();
  for (const n of ["Texto do código sobre o fundo do código", "Título 1 sobre o papel", "Título 6 sobre o papel"]) expect(names).toContain(n);
});

test("Salvar keeps the extras and the choices; Cancelar puts everything back", async ({ app, page }) => {
  const builder = await newTheme(app);
  await open(builder, "headings");
  await setColor(builder, "--h1-color", "#1d4e6b");
  await open(builder, "structure");
  await builder.locator('[data-style="tag-style"] select').selectOption("minimal");
  await builder.getByLabel("Nome do tema").fill("Com extras");
  await builder.getByRole("button", { name: "Salvar tema" }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("verso.settings")).looks);
  expect(saved.map((p) => p.name)).toEqual(["Com extras"]);
  expect(JSON.stringify(saved[0].theme)).toContain("#1d4e6b");
  expect(saved[0].theme.style).toEqual({ "tag-style": "minimal" });
});

test("Cancelar undoes the choices and the colours", async ({ app, page }) => {
  const builder = await newTheme(app);
  await open(builder, "structure");
  await builder.locator('[data-style="radius"] select').selectOption("round");
  await open(builder, "callouts");
  await setColor(builder, "--green", "#1f6b3a");
  await builder.getByRole("button", { name: "Cancelar" }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.radius)).toBeUndefined();
  expect(await root(page, "--green")).toBe("");
});

const AURORA = readFileSync(new URL("../test/fixtures/themes/v2-aurora.verso-theme", import.meta.url), "utf8");

test("a credited theme shows its credit under the card, keeps it on Copiar and shows it in the builder", async ({ app, page }) => {
  await app.open();
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  await page.locator("[data-look-import]").setInputFiles({ name: "aurora.verso-theme", mimeType: "application/json", buffer: Buffer.from(AURORA) });
  const card = (name) => page.locator(`[data-theme-card="${name}"]`);
  await expect(card("Aurora de teste")).toBeVisible();
  await expect(card("Aurora de teste").locator(".theme-credit")).toContainText("Inspirado em Origem de Teste, de Autora de Teste (MIT)");
  // A link as text and an anchor, never inside the card's button.
  await expect(card("Aurora de teste").locator(".theme-credit a")).toHaveAttribute("href", "https://example.invalid/origem-de-teste");
  expect(await card("Aurora de teste").locator(".theme-pick a").count()).toBe(0);
  await page.getByRole("button", { name: "Copiar Aurora de teste" }).click();
  await expect(card("Cópia de Aurora de teste").locator(".theme-credit")).toContainText("Origem de Teste");
  await page.getByRole("button", { name: "Editar Cópia de Aurora de teste" }).click();
  await expect(page.locator(".builder .look-credit")).toContainText("Inspirado em Origem de Teste, de Autora de Teste (MIT)");
  // Saved again, the credit is still in the profile.
  await page.locator(".builder").getByRole("button", { name: "Salvar tema" }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("verso.settings")).looks);
  expect(saved.find((p) => p.name === "Cópia de Aurora de teste").theme.inspiredBy.theme).toBe("Origem de Teste");
});
