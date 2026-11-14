// Walkthrough, section 4, step 8: periodic notes (ADR 0093) — the
// week's and the month's notes made from the palette and the calendar,
// previous and next skipping the gaps, a week whose year differs from some
// of its days' (2027-W01, and ISO's 2026-W53), the settings kept in the
// folder's layer, a format refused by its tokens, Obsidian's settings
// offered once and never written, and a reader who only opens what exists.

import { test, expect } from "./fixtures.mjs";

const FILE = ".verso/settings.json";

/** The window's clock set to a day of 2026, before the window opens. */
async function at(app, iso, query = "") {
  await app.page.clock.setFixedTime(new Date(`${iso}T10:00:00`));
  await app.open(query);
}

/** A note just made: open, its text in focus for writing (the command
 *  puts the cursor at its end) — before the next key goes anywhere. */
async function made(app, title) {
  await expect(app.page.locator(".pane.focused .note-title:visible")).toHaveText(title);
  await expect(app.page.locator(".pane.focused .cm-content:visible")).toBeFocused();
}

async function calendar(app) {
  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="calendar"]').click();
  return app.page.locator(".daily-cal");
}

async function periodicSettings(app) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Notas periódicas" }).click();
  return app.page.locator(".periodic-settings");
}

/** A setting's row of the periodic section, by its title. */
const row = (box, title) => box.locator(".setting", { has: box.page().locator(".setting-title", { hasText: new RegExp(`^${title}$`) }) });

test("the week's and the month's notes are made from the palette, from their templates", async ({ app }) => {
  await at(app, "2026-10-14");
  await app.command("Nota desta semana");
  await expect.poll(() => app.file("Diário/2026-W42.md")).toContain("# 2026-W42");
  const week = await app.file("Diário/2026-W42.md");
  // The template Semanal, filled: {{date}} the week's first day, its days.
  expect(week).toContain('semana: "2026-10-11"');
  expect(week).toContain("De domingo, 11 de outubro a sábado, 17 de outubro.");
  expect(week).toContain("- quarta-feira, 14/10:");
  expect(week).toContain("O que fica para a próxima (18/10):");
  expect(week).toContain("O sábado desta semana: 17/10.");
  expect(week).not.toContain("{{");
  await made(app, "2026-W42");
  // Sync is told what the note was made with (ADR 0093 item 12).
  expect(await app.calls("note_made_from_template")).toEqual([{ path: "Diário/2026-W42.md", text: week }]);

  // No template named Mensal: the name as a heading.
  await app.command("Nota deste mês");
  await expect.poll(() => app.file("Diário/2026-10.md")).toBe("# 2026-10\n\n");
  await made(app, "2026-10");
  // The quarter and the year are off: not offered.
  await app.key("Mod+Shift+p");
  await app.page.keyboard.type("Nota deste ano");
  await expect(app.page.locator(".palette:not([hidden]) li", { hasText: "Nota deste ano" })).toHaveCount(0);
  await app.page.keyboard.press("Escape");
  // Nothing was written into the folder's settings by any of it.
  expect(await app.file(FILE)).toBeNull();
});

test("previous and next skip the weeks with no note, and say when there is none", async ({ app }) => {
  await at(app, "2026-10-14");
  await app.command("Nota desta semana");
  await made(app, "2026-W42");
  await app.command("Nota periódica anterior");
  await expect(app.page.locator(".pane.focused .note-title:visible")).toHaveText("2026-W39");
  await app.command("Nota periódica anterior");
  await expect(app.page.locator("#status")).toContainText("Nenhuma nota de semana antes desta.");
  await app.command("Próxima nota periódica");
  await expect(app.page.locator(".pane.focused .note-title:visible")).toHaveText("2026-W42");
  // Not offered on a note that is not periodic.
  await app.quickOpen("04 - Escrevendo");
  await app.key("Mod+Shift+p");
  await app.page.keyboard.type("Nota periódica anterior");
  await expect(app.page.locator(".palette:not([hidden]) li", { hasText: "Nota periódica anterior" })).toHaveCount(0);
  await app.page.keyboard.press("Escape");
});

test("a week whose year differs from some of its days': 2027-W01, and ISO's 2026-W53", async ({ app }) => {
  await at(app, "2026-12-30");
  await app.command("Nota desta semana");
  await expect.poll(() => app.file("Diário/2027-W01.md")).toContain('semana: "2026-12-27"');
  await made(app, "2027-W01");
  // The folder asks for ISO weeks: Monday, the week of the first Thursday.
  const reads = (await app.calls("get_folder_settings")).length;
  await app.writeOutside(FILE, '{\n  "periodic": {\n    "week": {\n      "format": "GGGG-[W]WW"\n    }\n  }\n}\n');
  await app.folderChanged([FILE]);
  // The folder's settings read again before the command.
  await expect.poll(async () => (await app.calls("get_folder_settings")).length).toBeGreaterThan(reads);
  await app.command("Nota desta semana");
  await expect.poll(() => app.file("Diário/2026-W53.md")).toContain('semana: "2026-12-28"');
  const iso = await app.file("Diário/2026-W53.md");
  expect(iso).toContain("De segunda-feira, 28 de dezembro a domingo, 3 de janeiro.");
  // `{{saturday:…}}` is that week's Saturday, Monday being its first day.
  expect(iso).toContain("O sábado desta semana: 02/01.");
});

test("the calendar: a week's number, the month's name and the year open or make their notes", async ({ app }) => {
  await at(app, "2026-10-14");
  const cal = await calendar(app);
  const week = cal.getByRole("button", { name: "Semana 42 de 2026" });
  await expect(week).toBeVisible();
  await expect(week).not.toHaveClass(/\bhas\b/);
  await week.click();
  await expect.poll(() => app.file("Diário/2026-W42.md")).toContain("# 2026-W42");
  await made(app, "2026-W42");
  await expect(week).toHaveClass(/\bhas\b/);
  await cal.getByRole("button", { name: "Criar a nota de outubro de 2026" }).click();
  await expect.poll(() => app.file("Diário/2026-10.md")).toBe("# 2026-10\n\n");
  await made(app, "2026-10");
  await expect(cal.getByRole("button", { name: "Abrir a nota de outubro de 2026" })).toHaveClass(/\bhas\b/);
  // The year is off: its number is not a button.
  await expect(cal.getByRole("button", { name: /2026$/ }).filter({ hasText: /^2026$/ })).toHaveCount(0);
  // The keyboard: ← from a week's first day to its number, → back.
  await cal.getByRole("button", { name: "Criar a nota de 18 de outubro de 2026" }).focus();
  await app.page.keyboard.press("ArrowLeft");
  await expect(cal.getByRole("button", { name: "Semana 43 de 2026" })).toBeFocused();
  await app.page.keyboard.press("ArrowUp");
  await expect(week).toBeFocused();
  await app.page.keyboard.press("ArrowRight");
  await expect(cal.getByRole("button", { name: /11 de outubro de 2026/ })).toBeFocused();
  // September: the demo vault's week 39 is marked.
  await cal.getByRole("button", { name: "Anterior" }).click();
  await expect(cal.getByRole("button", { name: "Semana 39 de 2026" })).toHaveClass(/\bhas\b/);
});

test("the settings are the folder's: the first change carries the daily folder along; a format is refused by its tokens", async ({ app }) => {
  await at(app, "2026-10-14");
  const box = await periodicSettings(app);
  const start = row(box, "A semana começa");
  await expect(start.locator(".setting-scope")).toHaveText("Desta máquina");
  await start.locator("select").selectOption("monday");
  await expect.poll(async () => JSON.parse((await app.file(FILE)) ?? "{}").periodic).toEqual({ day: { folder: "Diário" }, language: "pt-BR", weekStart: "monday" });
  await expect(row(box, "A semana começa").locator(".setting-scope")).toHaveText("Da pasta");
  const before = await app.file(FILE);
  const format = row(box, "Semana · Formato").locator("input");
  await format.fill("YYYY-[W]ww HH:mm");
  await format.press("Enter");
  await expect(box.locator(".periodic-said")).toHaveText("Este formato tem o que o Verso não lê: HH, mm. Nada foi gravado.");
  await expect(format).toHaveAttribute("aria-invalid", "true");
  expect(await app.file(FILE)).toBe(before);
  await format.fill("gggg/[Semana] ww");
  await format.press("Enter");
  await expect.poll(async () => JSON.parse((await app.file(FILE)) ?? "{}").periodic.week).toEqual({ format: "gggg/[Semana] ww" });
  await expect(app.page.locator(".periodic-said")).toContainText("As notas com nomes do formato anterior não são mais encontradas");
  // The quarter turned on: its command offered.
  await row(app.page.locator(".periodic-settings"), "Notas de trimestre").locator("label.switch").click();
  await expect.poll(async () => JSON.parse((await app.file(FILE)) ?? "{}").periodic.quarter).toEqual({ on: true });
  await app.page.locator(".settings-close").click();
  await app.command("Nota deste trimestre");
  await expect.poll(() => app.file("Diário/2026-Q4.md")).toBe("# 2026-Q4\n\n");
  await made(app, "2026-Q4");
  // The week starts on Monday now, under its new name.
  await app.command("Nota desta semana");
  await expect.poll(() => app.file("Diário/2026/Semana 42.md")).toContain('semana: "2026-10-12"');
  expect(await app.file("Diário/2026/Semana 42.md")).toContain("De segunda-feira, 12 de outubro a domingo, 18 de outubro.");
});

test("Obsidian's settings are offered once, written into the folder's, and .obsidian is never written", async ({ app }) => {
  await at(app, "2026-10-14");
  const daily = '{"folder":"Journal","format":"YYYY/MM/YYYY-MM-DD","template":"Templates/Diário"}';
  await app.writeOutside(".obsidian/daily-notes.json", daily);
  const box = await periodicSettings(app);
  await expect(box.locator(".periodic-offer")).toContainText(".obsidian/daily-notes.json");
  await expect(box.locator(".periodic-offer li")).toHaveText(['Dia: YYYY/MM/YYYY-MM-DD, pasta “Journal”, template “Templates/Diário”']);
  await box.getByRole("button", { name: "Usar os ajustes do Obsidian" }).click();
  await expect.poll(async () => JSON.parse((await app.file(FILE)) ?? "{}").periodic?.day).toEqual({ folder: "Journal", format: "YYYY/MM/YYYY-MM-DD", template: "Templates/Diário" });
  await expect(app.page.locator(".periodic-said")).toHaveText("Os ajustes do Obsidian estão nos ajustes da pasta.");
  // Offered once: the folder has its own now.
  await expect(app.page.locator(".periodic-offer")).toBeHidden();
  expect(await app.file(".obsidian/daily-notes.json")).toBe(daily);
  await app.page.locator(".settings-close").click();
  await app.key("Mod+Shift+d");
  await expect.poll(() => app.file("Journal/2026/10/2026-10-14.md")).toContain("## 🎯 Foco do Dia");
  expect(await app.file(".obsidian/daily-notes.json")).toBe(daily);
});

test("a note made meanwhile by another window is opened, not said as an error", async ({ app }) => {
  await at(app, "2026-10-14");
  // Another window made it: on disk, unknown to this one's listing.
  await app.writeOutside("Diário/2026-10.md", "# Outubro, de outra janela\n");
  await app.command("Nota deste mês");
  await expect(app.page.locator(".pane.focused .note-title:visible")).toHaveText("2026-10");
  expect(await app.file("Diário/2026-10.md")).toBe("# Outubro, de outra janela\n");
  await expect(app.page.locator("#status")).not.toContainText("Erro");
});

test("a reader opens the periodic notes that exist and is offered none to make", async ({ app }) => {
  await at(app, "2026-10-14", "?side=server&role=reader");
  await app.key("Mod+Shift+p");
  await app.page.keyboard.type("Nota desta semana");
  await expect(app.page.locator(".palette:not([hidden]) li", { hasText: "Nota desta semana" })).toHaveCount(0);
  await app.page.keyboard.press("Escape");
  const cal = await calendar(app);
  await cal.getByRole("button", { name: "Semana 42 de 2026" }).click();
  await expect(app.page.locator("#status")).toHaveText("2026-W42 ainda não existe, e você só lê esta pasta: quem a edita pode criá-la.");
  expect(await app.file("Diário/2026-W42.md")).toBeNull();
  await cal.getByRole("button", { name: "Anterior" }).click();
  await cal.getByRole("button", { name: "Semana 39 de 2026" }).click();
  await expect(app.page.locator(".pane.focused .note-title:visible")).toHaveText("2026-W39");
  // Its settings are read, not changed.
  const box = await periodicSettings(app);
  await expect(box.locator(".periodic-said")).toHaveText("Só quem edita a pasta muda estes ajustes.");
  await expect(row(box, "A semana começa").locator("select")).toBeDisabled();
});
