// The fields that end on Enter, on Escape or on leaving them: a new note or
// a new folder in the tree, a workspace's name. Chromium — WebView2, the
// Windows app's engine — fires blur while the field is being taken out of
// the page, inside the Enter or Escape that takes it out; WebKit does not.
// Each field has to end once, by whichever comes first, or Escape commits
// through the blur it causes and Enter dies on a node already gone
// (ADR 0069, item 8).

import { test, expect } from "./fixtures.mjs";
import { pickMenu } from "./menuPath.mjs";

async function folderMenu(app, folder, item) {
  await app.page.locator(`#notes summary[data-folder="${folder}"]`).click({ button: "right" });
  await pickMenu(app.page, "Novo", item);
}

async function withFolder(app) {
  await app.open();
  await app.writeOutside("Pasta/Nota.md", "# Nota\n");
  await app.folderChanged(["Pasta/Nota.md"], true);
}

test("a new folder is made on Enter, and Escape makes none", async ({ app }) => {
  await withFolder(app);
  await folderMenu(app, "Pasta", "Nova pasta");
  const field = app.page.locator("input.new-note");
  await field.fill("Sub");
  await field.press("Enter");
  await expect.poll(() => app.folders()).toContain("Pasta/Sub");
  await expect(field).toHaveCount(0);

  await folderMenu(app, "Pasta", "Nova pasta");
  await field.fill("Outra");
  await field.press("Escape");
  await expect(field).toHaveCount(0);
  expect(await app.folders()).not.toContain("Pasta/Outra");
});

test("a new note from a folder's menu is made on Enter", async ({ app }) => {
  await withFolder(app);
  await folderMenu(app, "Pasta", "Nova nota nesta pasta");
  const field = app.page.locator("input.new-note");
  await field.fill("Feita");
  await field.press("Enter");
  await expect.poll(() => app.files()).toContain("Pasta/Feita.md");
  await expect(field).toHaveCount(0);
});

test("a workspace's name: Escape keeps the old one, Enter takes the new", async ({ app }) => {
  await app.open();
  // The tabs show once there are two workspaces.
  await app.key("Mod+t");
  const tab = app.page.locator(".space-tab").first();
  await expect(tab).toBeVisible();
  const name = tab.locator(".space-name");
  const before = (await name.textContent()) ?? "";
  const field = app.page.locator("input.space-input");

  await name.dblclick();
  await field.fill("Pesquisa");
  await field.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(name).toHaveText(before);

  await name.dblclick();
  await field.fill("Pesquisa");
  await field.press("Enter");
  await expect(field).toHaveCount(0);
  await expect(name).toHaveText("Pesquisa");
});

// A name Windows cannot keep is not made on any system, so that the folder
// can be synced to Windows (ADR 0070); the field says why, in the person's
// language, and the log has it as an answer, not a fault.
test("a name Windows cannot keep is refused, and the field says why", async ({ app }) => {
  await withFolder(app);
  for (const name of ["CON", "Reunião: pauta", "Ideia?", "a\\b"]) {
    await folderMenu(app, "Pasta", "Nova nota nesta pasta");
    const field = app.page.locator("input.new-note");
    await field.fill(name);
    await field.press("Enter");
    await expect(app.page.locator("#status")).toContainText("O Windows não guarda esse nome");
  }
  const files = await app.files();
  expect(files.filter((f) => f.startsWith("Pasta/"))).toEqual(["Pasta/Nota.md"]);
  // A dot before `.md` is kept by every system: "nota." makes `nota..md`.
  await folderMenu(app, "Pasta", "Nova nota nesta pasta");
  const field = app.page.locator("input.new-note");
  await field.fill("nota.");
  await field.press("Enter");
  await expect.poll(() => app.files()).toContain("Pasta/nota..md");
});
