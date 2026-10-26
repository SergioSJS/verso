// The table chip beside the folder's name (ADR 0110). The
// maintainer, 2026-10-23: "Como eu estou com a raiz de uma mesa aberta no
// verso, como que o dono da pasta vai conseguir ver as configurações da
// pasta? E como que os jogadores veem do lado deles?" The owner has a
// "Mesa" button there that opens the table's window; a player has a
// read-only "Mesa · jogador" chip whose popover says what they can do and
// lists the notes granted to them.

import { test, expect } from "./fixtures.mjs";
import { shot } from "./shots.mjs";

async function furnish(app, query) {
  await app.open(query);
  for (const [p, text] of Object.entries({ "Aberta.md": "# Aberta\n", "Livre.md": "# Livre\n", "Ficha do Barão.md": "# Barão\n" })) await app.writeOutside(p, text);
  await app.folderChanged(["Aberta.md", "Livre.md", "Ficha do Barão.md"], true);
}

const whole = () => {
  const c = window.__harness.campaign;
  c.tables = [{ root: "", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }];
  window.__harness.emit("campaign-changed", { paths: [] });
};

test("the owner's chip opens the table's window with no right click", async ({ app, page }) => {
  await furnish(app, "?vault=empty&table=owner");
  const chip = page.locator(".side-head .table-chip");
  await expect(chip).toBeHidden();
  await page.evaluate(whole);
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText("Mesa: pasta-vazia");
  await expect(chip).toHaveAttribute("aria-label", "Mesa: abrir as configurações de “pasta-vazia”");
  await page.locator(".side-head").screenshot({ path: shot("63-chip-mesa-dono-desktop") });
  await chip.click();
  await expect(page.getByRole("dialog", { name: /^Mesa da pasta/ })).toBeVisible();
});

test("a folder that is not a table has no chip", async ({ app, page }) => {
  await furnish(app, "?vault=empty&table=owner");
  await expect(page.locator(".side-head .table-chip")).toBeHidden();
  await app.open("?vault=empty");
  await expect(page.locator(".side-head .table-chip")).toBeHidden();
});

test("the player's chip says what they can do and lists the notes granted to them as links", async ({ app, page }) => {
  await furnish(app, "?vault=empty&table=player&side=server&role=reader");
  await page.evaluate(() => {
    const c = window.__harness.campaign;
    c.tables = [{ root: "", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }];
    c.notes.set("Livre.md", { path: "Livre.md", released: true, secret_name: false, grant: { kind: "none" } });
    c.notes.set("Aberta.md", { path: "Aberta.md", released: true, secret_name: false, grant: { kind: "group" } });
    c.notes.set("Ficha do Barão.md", { path: "Ficha do Barão.md", released: true, secret_name: false, grant: { kind: "group" } });
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  const chip = page.locator(".side-head .table-chip");
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText("Mesa · jogador");
  // Read-only: no settings, and the table's window never opens from it.
  await chip.click();
  const pop = page.locator(".table-chip-pop");
  await expect(pop).toBeVisible();
  await expect(page.getByRole("dialog", { name: /^Mesa da pasta/ })).toHaveCount(0);
  await expect(pop.locator(".table-chip-line")).toHaveCount(2);
  await expect(pop).toContainText("Você lê as notas que o mestre liberou");
  await expect(pop.locator(".table-chip-link")).toHaveText(["Aberta", "Ficha do Barão"]);
  await page.screenshot({ path: shot("64-chip-mesa-jogador-desktop") });
  // A link opens the note; Escape closes the popover.
  await pop.getByRole("button", { name: "Aberta" }).click();
  await expect(pop).toHaveCount(0);
  await expect(page.locator(".pane.focused")).toContainText("Aberta");
  await chip.click();
  await expect(page.locator(".table-chip-pop")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".table-chip-pop")).toHaveCount(0);
});

test("a player with nothing granted is told so", async ({ app, page }) => {
  await furnish(app, "?vault=empty&table=player&side=server&role=reader");
  await page.evaluate(whole);
  await page.locator(".side-head .table-chip").click();
  await expect(page.locator(".table-chip-pop")).toContainText("Nenhuma nota foi entregue a você");
  await expect(page.locator(".table-chip-link")).toHaveCount(0);
});

// N tables in one open folder (the maintainer, 2026-10-23: "ERRADO, posso ter N
// mesas numa mesma pasta"): a badge on each table's row, a chip that follows
// the active note, and "Mesas (N)" when no note says which.
async function furnishMany(app, query, roots) {
  await app.open(query);
  const files = { "Solta.md": "# Solta\n", "Ruínas/Cripta.md": "# Cripta\n", "Ruínas/Altar.md": "# Altar\n", "Torre/Sala.md": "# Sala\n", "Outra/Nada.md": "# Nada\n" };
  for (const [p, text] of Object.entries(files)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(files), true);
  await app.page.evaluate((rs) => {
    const c = window.__harness.campaign;
    c.tables = rs.map((root) => ({ root, open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }));
    for (const p of ["Solta.md", "Ruínas/Cripta.md", "Ruínas/Altar.md", "Torre/Sala.md", "Outra/Nada.md"]) c.notes.set(p, { path: p, released: true, secret_name: false, grant: { kind: "none" } });
    window.__harness.emit("campaign-changed", { paths: [] });
  }, roots);
}
const badge = (page, folder) => page.locator(`summary[data-folder="${folder}"] .table-badge`);

test("the owner has a badge on every table's row, and each opens that table's window", async ({ app, page }) => {
  await furnishMany(app, "?vault=empty&table=owner", ["Ruínas", "Torre"]);
  await expect(badge(page, "Ruínas")).toHaveAttribute("aria-label", "Mesa “Ruínas”: abrir as configurações");
  await expect(badge(page, "Torre")).toHaveText("Mesa");
  await expect(page.locator('summary[data-folder="Outra"] .table-badge')).toHaveCount(0);
  await page.locator("#notes").screenshot({ path: shot("69-selos-mesas-na-arvore") });
  await badge(page, "Torre").click();
  await expect(page.getByRole("dialog", { name: "Mesa “Torre”" })).toBeVisible();
  await page.getByRole("dialog", { name: "Mesa “Torre”" }).getByRole("button", { name: "Fechar" }).click();
  // Enter on the badge opens it too, and the folder does not toggle.
  const open = await page.locator('details:has(> summary[data-folder="Ruínas"])').evaluate((d) => d.open);
  await badge(page, "Ruínas").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Mesa “Ruínas”" })).toBeVisible();
  expect(await page.locator('details:has(> summary[data-folder="Ruínas"])').evaluate((d) => d.open)).toBe(open);
});

test("the chip follows the active note's table; with none to say, \"Mesas (N)\" lists them", async ({ app, page }) => {
  await furnishMany(app, "?vault=empty&table=owner", ["Ruínas", "Torre"]);
  const chip = page.locator(".side-head .table-chip");
  await expect(chip).toHaveText("Mesas (2)");
  await page.locator(".side-head").screenshot({ path: shot("70-chip-mesas-lista-fechada") });
  await chip.click();
  const list = page.locator(".table-chip-pop");
  await expect(list.locator(".table-chip-link")).toHaveText(["Ruínas", "Torre"]);
  await page.screenshot({ path: shot("71-chip-mesas-lista") });
  await list.getByRole("button", { name: /Torre/ }).click();
  await expect(page.getByRole("dialog", { name: "Mesa “Torre”" })).toBeVisible();
  await page.getByRole("dialog", { name: "Mesa “Torre”" }).getByRole("button", { name: "Fechar" }).click();
  // A note outside every table: still the list. A note of a table: that table.
  await app.quickOpen("Solta");
  await expect(chip).toHaveText("Mesas (2)");
  await app.quickOpen("Cripta");
  await expect(chip).toHaveText("Mesa: Ruínas");
  await expect(chip).toHaveAttribute("aria-label", "Mesa: abrir as configurações de “Ruínas”");
  await page.locator(".side-head").screenshot({ path: shot("72-chip-segue-a-nota") });
  await chip.click();
  await expect(page.getByRole("dialog", { name: "Mesa “Ruínas”" })).toBeVisible();
  await page.getByRole("dialog", { name: "Mesa “Ruínas”" }).getByRole("button", { name: "Fechar" }).click();
  await app.quickOpen("Sala");
  await expect(chip).toHaveText("Mesa: Torre");
});

test("with the root a table and another below, the nearest table up the note's path wins", async ({ app, page }) => {
  await furnishMany(app, "?vault=empty&table=owner", ["", "Ruínas"]);
  const chip = page.locator(".side-head .table-chip");
  await expect(chip).toHaveText("Mesa: pasta-vazia");
  await app.quickOpen("Altar");
  await expect(chip).toHaveText("Mesa: Ruínas");
  await app.quickOpen("Sala");
  await expect(chip).toHaveText("Mesa: pasta-vazia");
  await expect(badge(page, "Ruínas")).toBeVisible();
  await expect(page.locator('summary[data-folder="Torre"] .table-badge')).toHaveCount(0);
});

test("a player's badge opens that table's popover, with the notes granted in it only", async ({ app, page }) => {
  await furnishMany(app, "?vault=empty&table=player&side=server&role=reader", ["Ruínas", "Torre"]);
  await page.evaluate(() => {
    const c = window.__harness.campaign;
    for (const p of ["Ruínas/Cripta.md", "Torre/Sala.md"]) c.notes.set(p, { path: p, released: true, secret_name: false, grant: { kind: "group" } });
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  await expect(badge(page, "Ruínas")).toHaveAttribute("aria-label", "Mesa · jogador “Ruínas”: o que você pode fazer");
  await badge(page, "Ruínas").click();
  const pop = page.locator(".table-chip-pop");
  await expect(pop).toBeVisible();
  await expect(pop.locator(".table-chip-link")).toHaveText(["Cripta"]);
  await expect(page.getByRole("dialog", { name: /^Mesa “/ })).toHaveCount(0);
  await page.screenshot({ path: shot("73-selo-mesa-jogador-popover") });
  await page.keyboard.press("Escape");
  await expect(pop).toHaveCount(0);
  // The header: no note yet, so the list; each entry its popover.
  const chip = page.locator(".side-head .table-chip");
  await expect(chip).toHaveText("Mesas (2)");
  await chip.click();
  await page.locator(".table-chip-pop").getByRole("button", { name: /Torre/ }).click();
  await expect(page.locator(".table-chip-pop .table-chip-link")).toHaveText(["Sala"]);
  await page.keyboard.press("Escape");
  await app.quickOpen("Cripta");
  await expect(chip).toHaveText("Mesa · jogador");
  await expect(chip).toHaveAttribute("aria-label", "Mesa · jogador: o que você pode fazer em “Ruínas”");
});
