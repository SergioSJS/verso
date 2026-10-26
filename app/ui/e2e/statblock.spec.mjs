// Walkthrough, section 14 (notes 26 and the Fractal campaign): a statblock
// on a layout of the app (ADR 0099). A reserve is a tracker whose box
// writes that one number into the note's text; a fact's "Quebrado" mark
// strikes it and writes `quebrado: true`; nothing else in the block moves.

import { test, expect } from "./fixtures.mjs";

// A name of its own: the demo vault the harness opens has "Yara do Farol"
// (the Fractal campaign), and "Yara" in the switcher found that note first.
const NOTE = "Ficha de ensaio.md";
const TEXT = [
  "# Ficha de ensaio",
  "",
  "```statblock",
  "layout: fractal-character",
  "name: Yara do Farol",
  "jogador: Letícia",
  "xp: 4",
  "reserva_1_nome: Coragem",
  "reserva_1_atual: 3",
  "reserva_1_total: 3",
  "reserva_2_nome: Fôlego",
  "reserva_2_atual: 2",
  "reserva_2_total: 4",
  "fatos:",
  "  - nome: Guardiã do farol velho",
  "    quebrado: false",
  "  - nome: Conhece todos os barcos do porto",
  "    quebrado: true",
  "  - nome: Dívida com a capitã Duarte",
  "    quebrado: false",
  "anotacoes: Procurar a luz que não é do farol.",
  "fatos_aplicaveis: 2",
  "```",
  "",
  "Depois da ficha.",
  "",
].join("\n");

async function openSheet(app) {
  await app.writeOutside(NOTE, TEXT);
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Ficha de ensaio");
}

test("a fractal-character block draws, a reserve's box writes only its number, and Quebrado strikes a fact", async ({ app, page }) => {
  await app.open();
  await openSheet(app);
  const card = page.locator(".preview:visible .statblock-card");
  await expect(card).toBeVisible();
  await expect(card.getByText("Yara do Farol").first()).toBeVisible();
  await expect(card.getByRole("group", { name: "Fôlego" })).toBeVisible();
  // The block is a card, not code, and the note is as it was.
  expect(await app.file(NOTE)).toBe(TEXT);

  // The third box of Fôlego: 2 of 4 becomes 3 of 4.
  await card.getByRole("button", { name: "Fôlego: marcar 3 de 4" }).click();
  const withNumber = TEXT.replace("reserva_2_atual: 2", "reserva_2_atual: 3");
  await expect.poll(() => app.file(NOTE)).toBe(withNumber);
  await expect(card.getByRole("button", { name: "Fôlego: marcar 3 de 4" })).toHaveAttribute("aria-pressed", "true");

  // The first fact breaks: one more of the three is marked, and the count says so.
  await expect(card.locator(".statblock-flag-count")).toHaveText(/1 de 3 quebrados/);
  const mark = card.getByRole("button", { name: "Quebrado: Dívida com a capitã Duarte" });
  await expect(mark).toHaveAttribute("aria-pressed", "false");
  await mark.click();
  const withMark = withNumber.replace("  - nome: Dívida com a capitã Duarte\n    quebrado: false", "  - nome: Dívida com a capitã Duarte\n    quebrado: true");
  await expect.poll(() => app.file(NOTE)).toBe(withMark);
  await expect(mark).toHaveAttribute("aria-pressed", "true");
  await expect(card.locator(".statblock-trait-flagged", { hasText: "Dívida com a capitã Duarte" })).toHaveCount(1);
  await expect(card.locator(".statblock-flag-count")).toHaveText(/2 de 3 quebrados/);

  // And it mends: the same button, the mark off again.
  await mark.click();
  await expect.poll(() => app.file(NOTE)).toBe(withNumber);
  await expect(mark).toHaveAttribute("aria-pressed", "false");
});

test("the Statblocks switch turns the card into the code it always was", async ({ app, page }) => {
  await app.open();
  await openSheet(app);
  await expect(page.locator(".preview:visible .statblock-card")).toBeVisible();

  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Dados e RPG" }).click();
  const row = page.locator(".setting", { has: page.locator(".setting-title", { hasText: /^Fichas$/ }) });
  await row.locator("label.switch").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".preview:visible .statblock-card")).toHaveCount(0);
  await expect(page.locator(".preview:visible pre code", { hasText: "layout: fractal-character" })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await app.file(NOTE)).toBe(TEXT);
});

test("a statblock inside an embedded note is drawn as a card, read-only, and the host note is left as it was", async ({ app, page }) => {
  await app.open();
  await openSheet(app);
  const HOST = "Mesa de ensaio.md";
  const HOST_TEXT = "# Mesa de ensaio\n\nA ficha da Yara:\n\n![[Ficha de ensaio]]\n";
  await app.writeOutside(HOST, HOST_TEXT);
  await app.folderChanged([HOST], true);
  await app.quickOpen("Mesa de ensaio");
  const card = page.locator(".preview:visible .embed-note .statblock-card");
  await expect(card).toBeVisible();
  await expect(card.locator(".statblock-badge")).toHaveCount(0);
  // Read-only inside an embed: a reserve's box is no button.
  await expect(card.locator("button.statblock-box")).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(await app.file(HOST)).toBe(HOST_TEXT);
  expect(await app.file(NOTE)).toBe(TEXT);
});
