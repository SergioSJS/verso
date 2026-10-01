// Walkthrough, sections 3, 4 and 6: writing in a note, a note renamed with
// its backlinks, the daily note and its calendar.

import { test, expect } from "./fixtures.mjs";

/** Today in the window's clock, as the app names a daily note. */
const today = (app) =>
  app.page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

test("the / menu inserts today's date, and ⌘Z takes it back", async ({ app }) => {
  await app.open();
  await app.quickOpen("11 - Escrevendo");
  const note = "11 - Escrevendo no Editor.md";
  await app.page.getByRole("button", { name: "Editar", exact: true }).click();
  const editor = app.page.locator(".cm-content").first();
  await editor.click();
  await app.key("Mod+End");
  await app.page.keyboard.press("Enter");
  await app.page.keyboard.press("Enter");
  await app.page.keyboard.type("/");
  const menu = app.page.locator(".slash");
  await expect(menu).toBeVisible();
  for (const section of ["Básico", "Listas", "Destaques", "Inserir"]) await expect(menu.locator(".slash-section", { hasText: section })).toBeVisible();
  await app.page.keyboard.type("data");
  await app.page.keyboard.press("Enter");
  // At the end of the note (its frontmatter has a date of its own).
  const day = await today(app);
  const end = async () => (await app.file(note)).trimEnd().split("\n").pop();
  await expect.poll(end, { timeout: 15_000 }).toBe(day);
  await app.key("Mod+z");
  await expect.poll(end, { timeout: 15_000 }).not.toBe(day);
  expect(await app.file(note)).not.toContain(`\n${day}`);
});

test("a note's own picture is shown from the folder, and its corner resizes it in the note", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("06 - Documentos");
  const note = "06 - Documentos e Mídia.md";
  // `![Diagrama|320](assets/diagrama.svg)`: asked of the core, never of the
  // window's own address first (the fixture fails on that 404).
  const img = page.locator('.preview img[alt="Diagrama|320"]');
  await expect(img).toHaveAttribute("src", "/__vault/assets/diagrama.svg");
  await expect.poll(() => img.evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
  // Its size, read from the alt text's `|320` (it had none, and a picture
  // without a size of its own was drawn 0 px wide).
  expect((await img.boundingBox()).width).toBe(320);
  // In the middle of the view: at its foot the status bar covers the corner.
  await img.evaluate((i) => i.scrollIntoView({ block: "center" }));
  await img.hover();
  const grip = img.locator("xpath=following-sibling::span[contains(@class, 'cm-lp-grip')]");
  const at = await grip.boundingBox();
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + 60, at.y + 30, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => app.file(note)).toMatch(/\n!\[Diagrama\|\d+x\d+\]\(assets\/diagrama\.svg\)\n/);
  // The same picture written as an example in the heading's code is text:
  // it was the one rewritten (2026-10-01).
  expect(await app.file(note)).toContain("### Markdown com largura (`![Diagrama|320](assets/diagrama.svg)`)");
});

test("a renamed note shows who links to it at once", async ({ app }) => {
  await app.open();
  await app.quickOpen("Projeto Beta");
  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="backlinks"]').click();
  const panel = app.page.locator("#right-body");
  await expect(panel.locator("li").first()).toBeVisible();
  await app.page.locator(".note-title:visible").first().click();
  const field = app.page.locator("input.title-input");
  await field.fill("Projeto Gama");
  await field.press("Enter");
  await app.page.locator(".plan:visible button.save").click();
  await expect.poll(() => app.files()).toContain("projetos/Projeto Gama.md");
  // Pointed at the new name, the notes and the boards — and listed now,
  // without opening the note again (a51aab2).
  expect(await app.file("projetos/Projeto Alpha.md")).toContain("[[Projeto Gama]]");
  expect(await app.file("Board de Demonstração.canvas")).toContain('"file":"projetos/Projeto Gama.md"');
  await expect(panel).toContainText("Projeto Alpha");
  await expect(panel).toContainText("Pesquisa e Descobertas");
});

test("⌘D makes today's note from the Diário template, and the calendar marks the days", async ({ app }) => {
  await app.open();
  const day = await today(app);
  await app.key("Mod+d");
  await expect.poll(() => app.file(`Diário/${day}.md`)).toContain(`# ${day}`);
  const text = await app.file(`Diário/${day}.md`);
  expect(text).toContain("## 🎯 Foco do Dia");
  expect(text).not.toContain("{{");
  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="calendar"]').click();
  const cal = app.page.locator(".daily-cal");
  await expect(cal.locator(`.daily-day.has[data-day="${day}"]`)).toBeVisible();
  for (let i = 0; i < 36 && (await cal.locator('[data-day="2026-09-24"]').count()) === 0; i++) await cal.getByRole("button", { name: "Anterior" }).click();
  await expect(cal.locator('.daily-day.has[data-day="2026-09-24"]')).toBeVisible();
  await expect(cal.locator('.daily-day.has[data-day="2026-09-25"]')).toBeVisible();
});
