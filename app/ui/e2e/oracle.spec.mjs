// Walkthrough, section 14 (notes 26): the oracle (ADR 0102) and the
// features' switches (ADR 0103). The switch for Oracles in Settings ›
// Aplicação › Recursos takes the button off an [!oracle] callout and puts it
// back; the dialog writes its answer into the callout, a second answer to
// the same question piles up below, a line the person wrote stays, and a
// rewritten question replaces only the lines the oracle wrote.

import { test, expect } from "./fixtures.mjs";

const NOTE = "Cena.md";
const ODDS = "50 / 50";
const ANSWER = new RegExp(`^> \\*\\*[^*]+\\*\\* _\\(d100: \\d+, ${ODDS.replace("/", "\\/")}\\)_ ?$`);

const TEXT = [
  "# Cena",
  "",
  "> [!oracle] A porta está trancada?",
  `> **Sim, mas…** _(d100: 41, ${ODDS})_ `,
  "> A chave sumiu do gancho; foi o Ruy.",
  "",
  "Depois, a cena segue.",
  "",
].join("\n");

async function openScene(app) {
  await app.writeOutside(NOTE, TEXT);
  await app.folderChanged([NOTE], true);
  await app.quickOpen("Cena");
}

/** The oracle's button on the callout in the reading view. */
const askButton = (page) => page.locator('.preview:visible .callout[data-callout="oracle"] .oracle-callout-btn');

/** Ask the dialog opened from a callout: the answer is rolled and written into it. */
async function askAndWrite(page, question) {
  await askButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Oráculo & Improvisação" });
  await expect(dialog).toBeVisible();
  const field = dialog.getByLabel("Pergunta de sim ou não");
  if (question !== undefined) await field.fill(question);
  await dialog.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(dialog.locator(".oracle-outcome-badge")).not.toBeEmpty();
  await dialog.getByRole("button", { name: "Gravar no callout" }).click();
  await expect(dialog).toBeHidden();
}

const lines = async (app) => ((await app.file(NOTE)) ?? "").split("\n");
const answers = (ls) => ls.filter((l) => ANSWER.test(l));

test("the Oracles switch takes the button off an [!oracle] callout and puts it back, and no file changes", async ({ app, page }) => {
  await app.open();
  await openScene(app);
  await expect(askButton(page)).toHaveCount(1);

  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Recursos" }).click();
  const row = page.locator(".setting", { has: page.locator(".setting-title", { hasText: /^Oráculos$/ }) });
  await expect(row.locator("input[type=checkbox]")).toBeChecked();
  await row.locator("label.switch").click();
  await expect(row.locator("input[type=checkbox]")).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page.locator(".settings:not([hidden])")).toHaveCount(0);

  // Off: an ordinary callout, drawn, with no button.
  await expect(page.locator('.preview:visible .callout[data-callout="oracle"]')).toBeVisible();
  await expect(askButton(page)).toHaveCount(0);

  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Recursos" }).click();
  await row.locator("label.switch").click();
  await expect(row.locator("input[type=checkbox]")).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(askButton(page)).toHaveCount(1);

  await page.waitForTimeout(1000);
  expect(await app.file(NOTE)).toBe(TEXT);
  expect(await app.calls("write_note")).toHaveLength(0);
});

test("the same question twice piles answers up, and the line the person wrote stays between them", async ({ app, page }) => {
  await app.open();
  await openScene(app);

  await askAndWrite(page);
  await expect.poll(async () => answers(await lines(app)).length).toBe(2);
  await askAndWrite(page);
  await expect.poll(async () => answers(await lines(app)).length).toBe(3);

  const ls = await lines(app);
  const mine = ls.indexOf("> A chave sumiu do gancho; foi o Ruy.");
  const first = ls.indexOf(`> **Sim, mas…** _(d100: 41, ${ODDS})_ `);
  expect(first).toBeGreaterThan(-1);
  // Kept, and kept between the old answer and the new ones.
  expect(mine).toBeGreaterThan(first);
  expect(ls.slice(mine + 1).filter((l) => ANSWER.test(l))).toHaveLength(2);
  // The question and the rest of the note are as they were.
  expect(ls[2]).toBe("> [!oracle] A porta está trancada?");
  expect(ls).toContain("Depois, a cena segue.");
});

test("a rewritten question replaces the lines the oracle wrote and keeps the person's", async ({ app, page }) => {
  await app.open();
  await openScene(app);

  await askAndWrite(page, "Há alguém atrás da porta?");
  await expect.poll(async () => (await lines(app))[2]).toBe("> [!oracle] Há alguém atrás da porta?");
  const ls = await lines(app);
  // The old answer went with the old question; the person's line did not.
  expect(ls).not.toContain(`> **Sim, mas…** _(d100: 41, ${ODDS})_ `);
  expect(ls).toContain("> A chave sumiu do gancho; foi o Ruy.");
  expect(answers(ls)).toHaveLength(1);
  expect(ls).toContain("Depois, a cena segue.");
});
