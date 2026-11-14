// Walkthrough, section 14 (note 24): the oracle (ADR 0102) and the
// features' switches (ADR 0103). The switch for Oracles in Settings ›
// Dados e RPG takes the button off an [!oracle] callout and puts it
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

async function openScene(app, text = TEXT) {
  await app.writeOutside(NOTE, text);
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
  await page.locator(".settings-nav-item", { hasText: "Dados e RPG" }).click();
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
  await page.locator(".settings-nav-item", { hasText: "Dados e RPG" }).click();
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
  // The old answer rolled 0, which a d100 never does: a new roll of 41 would
  // write the very same line (1 run in 100) and the old one could not be
  // told from it.
  const old = `> **Sim, mas…** _(d100: 0, ${ODDS})_ `;
  await openScene(app, TEXT.replace(`> **Sim, mas…** _(d100: 41, ${ODDS})_ `, old));

  await askAndWrite(page, "Há alguém atrás da porta?");
  await expect.poll(async () => (await lines(app))[2]).toBe("> [!oracle] Há alguém atrás da porta?");
  const ls = await lines(app);
  // The old answer went with the old question; the person's line did not.
  expect(ls).not.toContain(old);
  expect(ls).toContain("> A chave sumiu do gancho; foi o Ruy.");
  expect(answers(ls)).toHaveLength(1);
  expect(ls).toContain("Depois, a cena segue.");
});

test("the oracle lists a folder's tables from the index, and reads a table's note only when it is chosen", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Tabelas.md", "# Tempo\n\n- sol\n- chuva\n- neve\n\n^tempo\n\n# Texto\n\nUm paragrafo. ^par\n");
  await app.writeOutside(NOTE, TEXT);
  await app.folderChanged([NOTE, "Tabelas.md"], true);
  await app.quickOpen("Cena");
  await askButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Oráculo & Improvisação" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "Tabelas" }).click();
  const select = dialog.getByLabel("Selecione o Oráculo");
  // Listed by the index: the table of the note is offered, the paragraph's
  // id is not, and no note was read to find it.
  await expect(select.locator("option", { hasText: /^Tempo$/ })).toHaveCount(1);
  await expect(select.locator("option", { hasText: "Texto" })).toHaveCount(0);
  expect((await app.calls("list_block_ids")).length).toBeGreaterThan(0);
  expect((await app.calls("read_note")).map((a) => a.path)).not.toContain("Tabelas.md");
  // Chosen: the note is read now and the option counts its rows.
  await select.selectOption({ label: "Tempo" });
  await expect(select.locator("option:checked")).toHaveText("Tempo (3 opções)");
  expect((await app.calls("read_note")).map((a) => a.path)).toContain("Tabelas.md");
  await dialog.getByRole("button", { name: "Sortear da Tabela", exact: true }).click();
  await expect(dialog.locator(".oracle-table-result-card")).toBeVisible();
  await expect(dialog.locator(".oracle-table-roll-text")).toHaveText(/^(sol|chuva|neve)$/);
});

test("the reading view writes into the callout on its line, after only that callout was drawn again (ADR 0102, 2026-10-31)", async ({ app, page }) => {
  await app.open();
  const two = (body) =>
    ["# Cena", "", "> [!oracle] A porta está trancada?", "> Nota da porta.", "", "> [!oracle] Há alguém lá dentro?", `> ${body}`, "", "Fim.", ""].join("\n");
  await openScene(app, two("Silêncio."));
  await expect(askButton(page)).toHaveCount(2);
  // The second callout changes outside: the view draws only its block again,
  // and its button is the only one wired in that pass.
  await app.writeOutside(NOTE, two("Passos no corredor."));
  await app.folderChanged([NOTE], true);
  const second = page.locator('.preview:visible .callout[data-callout="oracle"]').nth(1);
  await expect(second).toContainText("Passos no corredor.");
  await expect(second).toHaveAttribute("data-oracle-line", "6");

  await askButton(page).nth(1).click();
  const dialog = page.getByRole("dialog", { name: "Oráculo & Improvisação" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Pergunta de sim ou não")).toHaveValue("Há alguém lá dentro?");
  await dialog.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(dialog.locator(".oracle-outcome-badge")).not.toBeEmpty();
  await dialog.getByRole("button", { name: "Gravar no callout" }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(async () => answers(await lines(app)).length).toBe(1);
  const ls = await lines(app);
  // Into the second callout, below the person's line; the first is as it was.
  expect(ls.slice(0, 5)).toEqual(["# Cena", "", "> [!oracle] A porta está trancada?", "> Nota da porta.", ""]);
  expect(ls[5]).toBe("> [!oracle] Há alguém lá dentro?");
  expect(ls[6]).toBe("> Passos no corredor.");
  expect(ANSWER.test(ls[7] ?? "")).toBe(true);
});
