// Walkthrough, section 5: the notes search finds a note by its file name
// first, then by its content, and the × beside the words clears them — a
// phone has no Esc (the maintainer, 2026-10-09).

import { test, expect } from "./fixtures.mjs";

test("the search lists the notes named by the words first, then those that say them", async ({ app, page }) => {
  await app.open();
  // A note whose heading names it otherwise, and a note that only mentions it.
  await app.writeOutside("Sessões/Mapa do Porto.md", "# Porto de Vex\n\nruas e docas\n");
  await app.writeOutside("Diário de bordo.md", "Vimos o mapa do porto ontem.\n");
  const search = page.locator("#search");
  await search.fill("mapa do porto");
  const rows = page.locator("#notes li[data-path]");
  await expect(rows.first()).toHaveAttribute("data-path", "Sessões/Mapa do Porto.md");
  await expect(page.locator('#notes li[data-path="Diário de bordo.md"]')).toBeVisible();
  // Accents and case do not matter for the name either.
  await search.fill("DIARIO DE BORDO");
  await expect(rows.first()).toHaveAttribute("data-path", "Diário de bordo.md");
});

test("the × clears the search and brings the tree back, with no Esc", async ({ app, page }) => {
  await app.open();
  const search = page.locator("#search");
  const clear = page.getByRole("button", { name: "Limpar a busca" });
  await expect(clear).toBeHidden();
  await search.fill("board");
  await expect(clear).toBeVisible();
  await expect(page.locator("#notes")).toHaveClass(/list/);
  await clear.click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(clear).toBeHidden();
  await expect(page.locator("#notes")).not.toHaveClass(/list/);
  await expect(page.locator('#notes summary[data-folder="Personagens"]')).toBeVisible();
});
