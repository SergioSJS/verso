// The table chip beside the folder's name (ADR 0110 item 16). The
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
  await expect(chip).toHaveText("Mesa");
  await expect(chip).toHaveAttribute("aria-label", "Mesa: abrir as configurações da pasta");
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
