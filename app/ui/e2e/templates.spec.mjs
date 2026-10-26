// "Start with" under a new note's title (ADR 0068): Blank and the
// templates folder's notes; a choice puts the template's text in the note,
// Blank or typing put the list away; a folder's items_template keeps its
// own choice.

import { test, expect } from "./fixtures.mjs";
import { pickMenu } from "./menuPath.mjs";

const picker = (app) => app.page.locator(".template-picker");
const choice = (app, name) => picker(app).getByRole("button", { name, exact: true });

async function newNote(app) {
  await app.open();
  await app.key("Mod+n");
  await expect(picker(app)).toBeVisible();
  // The title is offered for a name first; Esc keeps "Sem título".
  await app.page.keyboard.press("Escape");
}

test("a new note offers Blank and the templates, and a template fills it", async ({ app }) => {
  await newNote(app);
  await expect(picker(app)).toHaveAttribute("role", "group");
  const names = await picker(app).locator(".template-choice-name").allTextContents();
  expect(names).toEqual(["Em branco", "Diário", "Nota de Reunião", "Novo Projeto", "Semanal"]);
  await choice(app, "Nota de Reunião").click();
  await expect(picker(app)).toHaveCount(0);
  // The template's text, {{title}} and {{date}} filled, saved as an edit.
  await expect.poll(() => app.file("Sem título.md"), { timeout: 10000 }).toMatch(/^---\n/);
  const text = await app.file("Sem título.md");
  expect(text).toMatch(/^---\ntitle: "Sem título"\ndate: "\d{4}-\d{2}-\d{2}"/);
  expect(text).not.toContain("{{");
  // The template itself does not change.
  expect(await app.file("Templates/Nota de Reunião.md")).toContain("{{title}}");
});

test("Blank, or typing in the note, put the list away and write nothing", async ({ app, page }) => {
  await newNote(app);
  await choice(app, "Em branco").click();
  await expect(picker(app)).toHaveCount(0);
  expect(await app.file("Sem título.md")).toBe("# Sem título\n\n");

  await app.key("Mod+n");
  await expect(picker(app)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator(".editor .cm-content").filter({ visible: true }).click();
  await page.keyboard.type("x");
  await expect(picker(app)).toHaveCount(0);
});

test("the list is reached and chosen from the keyboard", async ({ app, page }) => {
  await newNote(app);
  await choice(app, "Em branco").focus();
  await page.keyboard.press("ArrowRight");
  await expect(choice(app, "Diário")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Escape");
  await expect(picker(app)).toHaveCount(0);
});

test("a folder's items_template makes the note and shows no list", async ({ app }) => {
  await app.open();
  await app.writeOutside("Pasta/Pasta.md", "---\nitems_template: Novo Projeto\n---\n# Pasta\n");
  await app.folderChanged(["Pasta/Pasta.md"], true);
  await app.page.locator('#notes summary[data-folder="Pasta"]').click({ button: "right" });
  await pickMenu(app.page, "Novo", "Nova nota nesta pasta");
  const field = app.page.locator("input.new-note");
  await field.fill("Feita");
  await field.press("Enter");
  await expect.poll(() => app.files()).toContain("Pasta/Feita.md");
  await expect(app.page.locator(".tab", { hasText: "Feita" })).toHaveCount(1);
  await expect(picker(app)).toHaveCount(0);
});

test("{{date:FORMAT}} and {{time:FORMAT}} in a template are filled, as Obsidian's core Templates do", async ({ app }) => {
  await app.open();
  await app.writeOutside("Templates/Formatos.md", "# {{title}}\n\nBR: {{date:DD/MM/YYYY}}\nHora: {{time:HH:mm}} / {{time}}\nIso: {{date}}\nFica: {{date:YYYY ZZ}}\n");
  await app.folderChanged(["Templates/Formatos.md"], true);
  await app.key("Mod+n");
  await expect(picker(app)).toBeVisible();
  await app.page.keyboard.press("Escape");
  await choice(app, "Formatos").click();
  await expect.poll(() => app.file("Sem título.md"), { timeout: 10000 }).toContain("BR: ");
  const text = await app.file("Sem título.md");
  expect(text).toMatch(/BR: \d{2}\/\d{2}\/\d{4}\n/);
  expect(text).toMatch(/Hora: \d{2}:\d{2} \/ \d{2}:\d{2}\n/);
  expect(text).toMatch(/Iso: \d{4}-\d{2}-\d{2}\n/);
  expect(text).toContain("Fica: {{date:YYYY ZZ}}");
  expect(text).toContain("# Sem título");
});
