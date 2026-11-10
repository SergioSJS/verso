// "Mais temas…" (ADR 0109 item 1): the window listing every theme Verso
// ships — its four and the catalogue's — with a search, filters, cards
// drawn with each theme's tokens, the credit of each, a click that uses the
// theme, Copiar, Escape; a full screen with a back control on a phone.
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "./fixtures.mjs";

const SHOTS = process.env.SHOTS;
const LABEL = process.env.LABEL ?? "now";
const DIR = new URL("../themes/catalogue/", import.meta.url);
const CATALOGUE = readdirSync(DIR).filter((f) => f.endsWith(".verso-theme")).map((f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8")));
const surfaceOf = (t) => t.values["surface-mode"] ?? "tonal";
const phone = (page) => (page.viewportSize()?.width ?? 1500) <= 760;

async function openMore(app) {
  const { page } = app;
  await app.open();
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  const button = page.locator(".themes").getByRole("button", { name: "Mais temas…" });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const dialog = page.getByRole("dialog", { name: "Mais temas" });
  await expect(dialog).toBeVisible();
  // The catalogue arrives after the four of Verso's own.
  await expect(dialog.locator(".theme-item")).toHaveCount(4 + CATALOGUE.length);
  return { dialog, button };
}
const card = (dialog, name) => dialog.locator(`[data-theme-card="${name}"]`);

test("the button sits under the short gallery; the window is a dialog with a heading, a labelled search and cards that are buttons @layout", async ({ app, page }) => {
  const { dialog } = await openMore(app);
  await expect(dialog.getByRole("heading", { name: "Mais temas", level: 2 })).toBeVisible();
  // On a touch screen the search waits for a tap, the dialog holding the focus (screen/openFocus.ts).
  if (await page.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches)) await expect(dialog).toBeFocused();
  else await expect(dialog.getByLabel("Buscar temas")).toBeFocused();
  await expect(dialog.getByLabel("Modo")).toBeVisible();
  await expect(dialog.getByLabel("Superfície")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Do Verso" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Catálogo" })).toBeVisible();
  // Each card: a button named by the theme and its mode.
  await expect(dialog.getByRole("button", { name: "Nord, tema escuro" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Papel, tema ambos, ativo" }).or(dialog.getByRole("button", { name: /^Papel, tema/ }))).toBeVisible();
  await expect(dialog.locator(".more-count")).toHaveText(`${4 + CATALOGUE.length} temas`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/more-${LABEL}-${test.info().project.name}.png` });
});

test("the search finds by name and by author; the filters by mode and surface @layout", async ({ app }) => {
  const { dialog } = await openMore(app);
  await dialog.getByLabel("Buscar temas").fill("nord");
  await expect(card(dialog, "Nord")).toBeVisible();
  await expect(dialog.locator(".theme-item")).toHaveCount(1);
  await dialog.getByLabel("Buscar temas").fill("kepano");
  const kepano = CATALOGUE.filter((t) => /kepano/i.test(`${t.inspiredBy.author} ${t.inspiredBy.theme}`)).length;
  await expect(dialog.locator(".theme-item")).toHaveCount(kepano);
  await dialog.getByLabel("Buscar temas").fill("zzzz");
  await expect(dialog.locator(".more-none")).toBeVisible();
  await dialog.getByLabel("Buscar temas").fill("");
  await dialog.getByLabel("Modo").selectOption("dark");
  await expect(dialog.locator(".theme-item")).toHaveCount(CATALOGUE.filter((t) => t.mode === "dark").length);
  await dialog.getByLabel("Modo").selectOption("");
  await dialog.getByLabel("Superfície").selectOption("flat");
  await expect(dialog.locator(".theme-item")).toHaveCount(CATALOGUE.filter((t) => surfaceOf(t) === "flat").length);
  await dialog.getByLabel("Superfície").selectOption("cards");
  await expect(dialog.locator(".theme-item")).toHaveCount(CATALOGUE.filter((t) => surfaceOf(t) === "cards").length);
});

test("a card carries its credit, with the link; Flexoki's names stephango.com/flexoki as a link @layout", async ({ app }) => {
  const { dialog } = await openMore(app);
  await expect(card(dialog, "Minimal").locator(".theme-credit")).toContainText("Inspirado em Minimal, de Steph Ango (kepano) (MIT)");
  await expect(card(dialog, "Minimal").locator(".theme-credit a")).toHaveAttribute("href", "https://github.com/kepano/obsidian-minimal");
  const flexoki = card(dialog, "Flexoki").locator(".theme-credit");
  await expect(flexoki.locator('a[href="https://stephango.com/flexoki"]')).toHaveText("stephango.com/flexoki");
  await expect(flexoki.locator('a[href="https://github.com/kepano/flexoki"]')).toBeVisible();
});

test("a click uses the theme at once and the mark moves; Copiar keeps a copy with its credit @layout", async ({ app, page }) => {
  const { dialog } = await openMore(app);
  await card(dialog, "Dracula").locator(".theme-pick").click();
  await expect(card(dialog, "Dracula").locator(".theme-pick")).toHaveAttribute("aria-pressed", "true");
  await expect(card(dialog, "Dracula").locator(".theme-pick")).toBeFocused();
  const dracula = CATALOGUE.find((t) => t.name === "Dracula");
  const side = dracula.values.dark ?? dracula.values.light;
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--paper"))).toContain(side["--paper"].toLowerCase());
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("verso.settings")));
  // A folder is open: the choice is the folder's own (ADR 0100 item 4, 2026-10-27).
  const own = Object.values(stored.folderThemes ?? {});
  expect(own.map((t) => t.lookName)).toEqual(["Dracula"]);
  expect(own[0].lookCredit.theme).toBe("Dracula");
  expect(stored.lookName).toBeUndefined();
  // Another one: the mark moves.
  await card(dialog, "Nord").locator(".theme-pick").click();
  await expect(card(dialog, "Nord").locator(".theme-pick")).toHaveAttribute("aria-pressed", "true");
  await expect(card(dialog, "Dracula").locator(".theme-pick")).toHaveAttribute("aria-pressed", "false");
  await dialog.getByRole("button", { name: "Copiar Nord" }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("verso.settings")).looks);
  expect(saved.map((p) => p.name)).toEqual(["Cópia de Nord"]);
  expect(saved[0].theme.inspiredBy.theme).toBe("Nord");
});

test("every catalogue theme can be used: none is refused as unreadable", async ({ app, page }) => {
  const { dialog } = await openMore(app);
  for (const t of CATALOGUE) {
    await card(dialog, t.name).locator(".theme-pick").click();
    await expect(card(dialog, t.name).locator(".theme-pick"), t.name).toHaveAttribute("aria-pressed", "true");
  }
});

test("Escape closes only this window; Settings stays and the button gets the focus back; so does the back control @layout", async ({ app, page }) => {
  const { dialog, button } = await openMore(app);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".settings-box, .quick.settings").first()).toBeVisible();
  await expect(button).toBeFocused();
  await button.click();
  await expect(dialog).toBeVisible();
  if (phone(page)) {
    const box = await page.locator(".more-box").boundingBox();
    expect(Math.round(box.width)).toBe(page.viewportSize().width);
    await dialog.getByRole("button", { name: "Voltar" }).click();
  } else {
    await dialog.getByRole("button", { name: "Fechar" }).click();
  }
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
});

test("the Credits page lists the catalogue's themes from their own credits, Flexoki's link included", async ({ app, page }) => {
  await app.open();
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Créditos" }).click();
  const list = page.locator(".credit-themes");
  await expect(list.locator(".credit-theme")).toHaveCount(CATALOGUE.length);
  await expect(list.locator('[data-catalogue-theme="Nord"]')).toContainText("Inspirado em Nord");
  await expect(list.locator('[data-catalogue-theme="Flexoki"] a[href="https://stephango.com/flexoki"]')).toBeVisible();
});

test("a catalogue theme in use shows in Appearance with copy; the mode select follows a dark-only theme @layout", async ({ app, page }) => {
  const SH = process.env.INUSE_SHOTS;
  const { dialog, button } = await openMore(app);
  await expect(page.locator('.themes [data-theme-card="Dracula"]')).toHaveCount(0);
  await card(dialog, "Dracula").locator(".theme-pick").click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const gallery = page.locator(".themes");
  const own = gallery.locator('[data-theme-card="Dracula"]');
  await expect(own).toBeVisible();
  await expect(own.locator(".theme-pick")).toHaveAttribute("aria-pressed", "true");
  await expect(own.locator(".theme-on")).toBeVisible();
  await expect(own.locator(".theme-mode")).toContainText("só escuro");
  // The Tema select reads Escuro: the window is dark.
  await expect(page.locator(".setting", { hasText: "Claro, escuro ou como o sistema" }).locator("select")).toHaveValue("dark");
  if (SH) await page.screenshot({ path: `${SH}/inuse-${test.info().project.name}.png` });
  await own.getByRole("button", { name: "Copiar Dracula" }).click();
  await expect(gallery.locator('[data-theme-card="Cópia de Dracula"]')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("verso.settings")));
  expect(stored.looks.map((p) => p.name)).toEqual(["Cópia de Dracula"]);
  expect(stored.looks[0].theme.inspiredBy.theme).toBe("Dracula");
  expect(stored.lookRecent).toEqual(["dracula.verso-theme"]);
  void button;
});
