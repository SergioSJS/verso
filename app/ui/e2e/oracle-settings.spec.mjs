// Walkthrough, section 14, step 3: the oracle's settings page (ADR 0102
// item 6), for someone who never read the ADR. It holds at 600 px and at
// 340 px (the settings take the whole screen there), light and dark, with
// no sideways scroll; a style picked is saved in the folder's settings at
// once and redraws the bars; a row typed by hand is saved only when it adds
// up to 100 and says what it lacks until then; the spark words are the
// window's language, with no language switch on the page; a word added or
// removed is saved by itself. Each state is photographed to
// e2e/results/oracle-shots/ to be read by eye.

import { mkdirSync } from "node:fs";

import { test, expect } from "./fixtures.mjs";

const FILE = ".verso/settings.json";
const SHOTS = "e2e/results/oracle-shots";
mkdirSync(SHOTS, { recursive: true });

/** ADR 0102 item 1's table, the default, as the file keeps it (nearly certain first). */
const DEFAULT = [[18, 54, 18, 2, 6, 2], [15, 45, 15, 5, 15, 5], [10, 30, 10, 10, 30, 10], [5, 15, 5, 15, 45, 15], [2, 6, 2, 18, 54, 18]];
const IRONSWORN = [[10, 80, 0, 0, 8, 2], [8, 67, 0, 0, 20, 5], [5, 45, 0, 0, 45, 5], [2, 23, 0, 0, 67, 8], [1, 9, 0, 0, 80, 10]];

const folderOracle = async (app) => JSON.parse((await app.file(FILE)) ?? "{}").oracle ?? null;

/** Open Settings on the oracle's page, at `width`, in `scheme`. A tall
 *  window, so a photograph holds the whole page. */
async function openPage(app, { width = 600, height = 900, scheme = "light", query = "", nav = "Oráculos e Solo RPG" } = {}) {
  await app.page.setViewportSize({ width, height });
  await app.page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await app.open(query);
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: nav }).click();
  await expect(app.page.locator(".orc-intro")).toBeVisible();
}

/** Nothing on the page scrolls sideways: the page itself, and the
 *  settings' body (the row of sections on a phone scrolls by design). */
async function noSideScroll(page) {
  const sizes = await page.evaluate(() => {
    const body = document.querySelector(".settings-body");
    const wide = [...document.querySelectorAll(".settings-body *")].filter((e) => e.getBoundingClientRect().right > body.getBoundingClientRect().right + 1 && e.getClientRects().length > 0 && !e.closest(".sr-only"));
    return { doc: document.documentElement.scrollWidth, win: window.innerWidth, sw: body.scrollWidth, cw: body.clientWidth, wide: wide.slice(0, 3).map((e) => e.className || e.tagName) };
  });
  expect(sizes.wide).toEqual([]);
  expect(sizes.sw).toBeLessThanOrEqual(sizes.cw);
  expect(sizes.doc).toBeLessThanOrEqual(sizes.win);
}

async function shot(page, info, name) {
  await page.locator(".settings-box").screenshot({ path: `${SHOTS}/${info.project.name}-${name}.png`, animations: "disabled" });
}

/** The bar of a level, and one of its six parts. */
const seg = (page, level, answer) => page.locator(`.orc-bar-row[data-level="${level}"] .orc-seg[data-answer="${answer}"]`);

for (const [width, scheme] of [[600, "light"], [600, "dark"], [340, "light"], [340, "dark"]]) {
  test(`the page holds at ${width} px in ${scheme}, closed and with the numbers by hand open`, async ({ app, page }, info) => {
    await openPage(app, { width, height: 3400, scheme });
    // No file path, no language switch, no save button for the page.
    const body = page.locator(".settings-body");
    await expect(body).not.toContainText(".verso/settings.json");
    await expect(body).toContainText("Compartilhado com quem abre esta pasta");
    await expect(body.getByRole("button", { name: /English|Português/ })).toHaveCount(0);
    await expect(body.getByRole("button", { name: /^Salvar/ })).toHaveCount(0);
    await expect(body.getByRole("radio", { name: /Equilibrado/ })).toBeChecked();
    await noSideScroll(page);
    await shot(page, info, `${width}-${scheme}-page`);
    await page.getByText("Ajustar à mão…").click();
    await expect(page.getByRole("spinbutton", { name: "Quase certo: Sim, e…" })).toBeVisible();
    await noSideScroll(page);
    await shot(page, info, `${width}-${scheme}-by-hand`);
    await page.getByRole("checkbox", { name: "Usar minhas próprias palavras" }).check({ force: true });
    await expect(page.getByRole("textbox", { name: "Nova palavra em Ação" })).toBeVisible();
    await noSideScroll(page);
    await shot(page, info, `${width}-${scheme}-own-words`);
  });
}

/** Every part of every bar that is drawn shows its whole number, inside
 *  it: not clipped, not hidden, the numbers never moved under the bar. */
async function everyNumberReadable(page) {
  const bad = await page.locator(".orc-bars").evaluate((bars) => {
    const out = [];
    // The numbers never leave the bar: the fallback that moved them under
    // it is gone, and a bar never scrolls at these widths.
    for (const old of document.querySelectorAll(".orc-bar-nums, .orc-bar-num, .is-cramped")) out.push(`fallback element ${old.className}`);
    for (const bar of bars.querySelectorAll(".orc-bar")) if (bar.scrollWidth > bar.clientWidth + 1) out.push(`${bar.closest(".orc-bar-row").dataset.level} scrolls`);
    for (const seg of bars.querySelectorAll(".orc-seg")) {
      const value = Number(seg.dataset.value);
      const shown = getComputedStyle(seg).display !== "none";
      if (value === 0) {
        if (shown) out.push(`${seg.dataset.answer} 0% drawn`);
        continue;
      }
      const n = seg.querySelector(".orc-seg-n");
      const s = seg.getBoundingClientRect();
      const r = n.getBoundingClientRect();
      const style = getComputedStyle(n);
      const row = seg.closest(".orc-bar-row");
      const fits = r.width > 0 && r.height > 0 && r.left >= s.left - 0.5 && r.right <= s.right + 0.5 && r.top >= s.top - 0.5 && r.bottom <= s.bottom + 0.5;
      if (!shown || !fits || style.visibility !== "visible" || style.opacity !== "1" || style.display === "none" || n.textContent !== String(value)) {
        out.push(`${row.dataset.level} ${seg.dataset.answer} ${value}: number ${r.width.toFixed(1)}px in ${s.width.toFixed(1)}px`);
      }
    }
    return out;
  });
  expect(bad).toEqual([]);
}

for (const width of [1500, 600, 340]) {
  test(`every part of the bars shows its number at ${width} px, in each of the four styles`, async ({ app, page }, info) => {
    await openPage(app, { width });
    // At once, before the web fonts may have come, and again once they have.
    await everyNumberReadable(page);
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await everyNumberReadable(page);
    for (const [style, nearlyCertainYes] of [["Equilibrado", "54"], ["Viradas prováveis", "54"], ["Ironsworn", "80"], ["Narrativo", "40"]]) {
      const radio = page.getByRole("radio", { name: new RegExp(`^${style}`) });
      if (!(await radio.isChecked())) await radio.check();
      await expect(seg(page, "nearlyCertain", "yes")).toHaveAttribute("data-value", nearlyCertainYes);
      await everyNumberReadable(page);
      for (const scheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await page.locator(".orc-bars").screenshot({ path: `${SHOTS}/${info.project.name}-bars-${width}-${scheme}-${style.split(" ")[0].toLowerCase()}.png`, animations: "disabled" });
      }
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    }
  });
}

test("the Likely twists style says it is inspired by Mythic GME, on hover and in text a reader reads", async ({ app, page }) => {
  await openPage(app);
  const label = page.locator("label.orc-style", { has: page.getByRole("radio", { name: /^Viradas prováveis/ }) });
  await expect(label).toHaveAttribute("title", /Inspirado no Mythic GME — sem o fator caos dele/);
  await expect(label).toContainText("Inspirado no Mythic GME");
  await expect(page.getByRole("radio", { name: /^Viradas prováveis.*Mythic GME/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Mythic GME/ })).toHaveCount(0);
});

test("a style picked is saved in the folder at once, redraws the bars, and can be undone", async ({ app, page }, info) => {
  await openPage(app);
  expect(await app.file(FILE)).toBeNull();
  await expect(seg(page, "nearlyCertain", "yesBut")).toHaveAttribute("data-value", "18");
  await page.getByRole("radio", { name: /Ironsworn/ }).check();
  await expect.poll(async () => (await folderOracle(app))?.odds).toEqual(IRONSWORN);
  // Ironsworn has no "but": those parts of the bars are gone.
  await expect(seg(page, "nearlyCertain", "yesBut")).toHaveAttribute("data-value", "0");
  await expect(seg(page, "nearlyCertain", "yes")).toHaveAttribute("data-value", "80");
  await expect(page.locator(".orc-said:not([hidden])")).toContainText("Estilo Ironsworn aplicado.");
  await shot(page, info, "style-ironsworn");
  await page.locator(".orc-said:not([hidden])").getByRole("button", { name: "Desfazer" }).click();
  await expect.poll(async () => (await folderOracle(app))?.odds).toEqual(DEFAULT);
  await expect(page.getByRole("radio", { name: /Equilibrado/ })).toBeChecked();
  await expect(seg(page, "nearlyCertain", "yesBut")).toHaveAttribute("data-value", "18");
});

test("a row typed by hand says what it lacks and is not saved until it adds up to 100", async ({ app, page }, info) => {
  await openPage(app);
  await page.getByText("Ajustar à mão…").click();
  const no = page.getByRole("spinbutton", { name: "Quase certo: Não", exact: true });
  await no.fill("3");
  const row = page.locator(".orc-row").first();
  await expect(row.locator(".orc-row-total")).toHaveText("faltam 3%");
  await expect(row.locator(".orc-row-kept")).toBeVisible();
  await no.press("Tab");
  await page.waitForTimeout(800);
  expect(await app.file(FILE)).toBeNull();
  expect(await app.calls("set_folder_settings")).toEqual([]);
  await shot(page, info, "row-97");
  await page.getByRole("spinbutton", { name: "Quase certo: Não, e…" }).fill("9");
  await expect(row.locator(".orc-row-total")).toHaveText("sobram 4%");
  await page.getByRole("spinbutton", { name: "Quase certo: Não, e…" }).fill("5");
  await expect(row.locator(".orc-row-total")).toHaveText("100% ✓");
  await expect.poll(async () => (await folderOracle(app))?.odds?.[0]).toEqual([18, 54, 18, 2, 3, 5]);
  await expect(page.getByRole("radio", { name: /Personalizado/ })).toBeChecked();
  await expect(seg(page, "nearlyCertain", "noAnd")).toHaveAttribute("data-value", "5");
  // Back to the default, by its button.
  await page.getByRole("button", { name: "Voltar ao padrão" }).click();
  // Cleared from the file, not a built-in table written in its place.
  await expect.poll(async () => (await folderOracle(app))?.odds).toBeUndefined();
  await expect(no).toHaveValue("6");
});

test("the spark words: Verso's in the window's language, then the folder's own, added and removed by themselves", async ({ app, page }, info) => {
  await openPage(app);
  const body = page.locator(".settings-body");
  await expect(body).not.toContainText("Idioma do Vocabulário");
  const sparks = page.locator(".orc-section", { has: page.getByRole("heading", { name: "Faíscas de ideias" }) });
  await expect(sparks.locator(".orc-words-preview").first()).toContainText("Descobrir");
  const own = page.getByRole("checkbox", { name: "Usar minhas próprias palavras" });
  await own.check({ force: true });
  // Turned on, nothing is written until a list changes.
  await page.waitForTimeout(800);
  expect(await app.file(FILE)).toBeNull();
  const field = page.getByRole("textbox", { name: "Nova palavra em Ação" });
  await field.fill("Navegar, Remar");
  await field.press("Enter");
  await expect(sparks.locator(".orc-words").first()).toContainText("2 palavras adicionadas.");
  await expect.poll(async () => (await folderOracle(app))?.sparks?.action?.slice(-2)).toEqual(["Navegar", "Remar"]);
  // A repeat is refused, and said.
  await field.fill("navegar");
  await field.press("Enter");
  await expect(sparks.locator(".orc-words").first()).toContainText("“navegar” já está na lista.");
  await page.getByRole("button", { name: "Remover Vigiar" }).click();
  await expect.poll(async () => (await folderOracle(app))?.sparks?.action?.includes("Vigiar")).toBe(false);
  expect((await folderOracle(app)).sparks.action).toHaveLength(25);
  await expect(page.getByText("As suas palavras valem em qualquer idioma")).toBeVisible();
  // The keyboard: the ×s are one stop, walked with the arrows; Delete removes.
  const first = page.getByRole("button", { name: "Remover Descobrir" });
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Remover Destruir" })).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(page.getByRole("button", { name: "Remover Destruir" })).toHaveCount(0);
  await expect.poll(async () => (await folderOracle(app))?.sparks?.action?.includes("Destruir")).toBe(false);
  await shot(page, info, "own-words-edited");
  // Back to Verso's words: the key leaves the file.
  await page.getByRole("button", { name: "Voltar às palavras do Verso" }).click();
  await expect(own).not.toBeChecked();
  await expect.poll(async () => (await folderOracle(app))?.sparks).toBeUndefined();
  await expect(sparks.locator(".orc-words-preview").first()).toContainText("Descobrir");
});

test("a list keeps its last word, and says why", async ({ app, page }) => {
  await openPage(app);
  await page.getByRole("checkbox", { name: "Usar minhas próprias palavras" }).check({ force: true });
  const focus = page.locator(".orc-words", { has: page.getByText("Foco", { exact: true }) });
  // Take all but one away by the keyboard (Delete on the first, repeatedly).
  await focus.getByRole("button", { name: /^Remover / }).first().focus();
  for (let i = 0; i < 23; i++) await page.keyboard.press("Delete");
  await expect(focus.getByRole("button", { name: /^Remover / })).toHaveCount(1);
  await page.keyboard.press("Delete");
  await expect(focus.locator(".orc-words-msg")).toHaveText("Cada lista precisa de pelo menos uma palavra: a última fica.");
  await expect(focus.getByRole("button", { name: /^Remover / })).toHaveCount(1);
  await expect.poll(async () => (await folderOracle(app))?.sparks?.focus?.length).toBe(1);
});

test("two tables of one note have their own names, and a table with a die counts and shows each option once", async ({ app, page }) => {
  await openPage(app);
  const cards = page.locator(".orc-table", { hasText: "Da nota 25 - Dados e Tabelas Sorteadas" });
  await expect(cards).toHaveCount(2);
  await expect(cards.locator(".orc-table-name")).toHaveText(["Tabelas sorteadas (^encontros)", "Tabelas sorteadas (^tempo)"]);
  const encounters = cards.first();
  await expect(encounters.locator(".orc-table-count")).toHaveText("4 opções · d6");
  await expect(encounters.locator(".orc-table-peek")).toHaveText("Uma patrulha da guarda, desconfiada · Um mercador com a carroça atolada · Lobos famintos, e Capitão Ruy chega para ajudar …");
});

test("the page's button opens the oracle to try it", async ({ app, page }) => {
  await openPage(app);
  await page.getByRole("button", { name: "Experimentar o oráculo" }).click();
  const dialog = page.getByRole("dialog", { name: "Oráculo & Improvisação" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(dialog.locator(".oracle-outcome-badge")).not.toBeEmpty();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".orc-intro")).toBeVisible();
});

test("where the folder is only read, the page says why in plain words and changes nothing", async ({ app, page }, info) => {
  await openPage(app, { query: "?sync=reader", height: 3400 });
  await expect(page.locator(".orc-where")).toContainText("Você só pode ler esta pasta");
  await expect(page.getByRole("radio", { name: /Ironsworn/ })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: "Usar minhas próprias palavras" })).toBeDisabled();
  await page.getByText("Ajustar à mão…").click();
  await expect(page.getByRole("spinbutton", { name: "Quase certo: Sim, e…" })).toBeDisabled();
  await noSideScroll(page);
  await shot(page, info, "reader");
});

test.describe("in English", () => {
  test.use({ locale: "en-US" });
  test("the spark words follow the window's language, with no switch on the page", async ({ app, page }, info) => {
    await openPage(app, { nav: "Oracles & Solo RPG", height: 3400 });
    const sparks = page.locator(".orc-section", { has: page.getByRole("heading", { name: "Idea sparks" }) });
    await expect(sparks.locator(".orc-words-preview").first()).toContainText("Discover");
    await expect(sparks).not.toContainText("Descobrir");
    await expect(page.locator(".settings-body").getByRole("button", { name: /English|Português/ })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: /Balanced/ })).toBeChecked();
    await noSideScroll(page);
    await shot(page, info, "600-light-en");
  });
});
