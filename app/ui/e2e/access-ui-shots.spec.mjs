// The Access dialog and the table strip, photographed from the real harness UI (fix: access UI v2, 2026-10-25): runs only with
// SHOTS=<dir>, in chromium; compares with the approved mockup. Asserts nothing about looks.

import { test, expect } from "./fixtures.mjs";

const OUT = process.env.SHOTS;

// Skipped for the whole file, before any fixture opens a window.
test.skip(!OUT, "SHOTS not set");

const PLAYERS = [
  { id: "acc-ana", name: "Ana" },
  { id: "acc-bia", name: "Bia" },
  { id: "acc-caio", name: "Caio" },
  { id: "acc-dora", name: "Dora" },
];
const TABLE = { root: "Mundo", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 };
const FILES = ["Mundo/Cripta.md", "Mundo/Diario.md", "Mundo/Porto.md", "Mundo/Taverna do Corvo.md", "Mundo/Quadro.canvas"];

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "chromium", "photographed once, in chromium");
});

async function setup(app, who, width, theme) {
  const page = app.page;
  await page.addInitScript((th) => {
    const s = JSON.parse(localStorage.getItem("verso.settings") ?? "{}");
    localStorage.setItem("verso.settings", JSON.stringify({ ...s, theme: th }));
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await app.open(`?vault=empty&table=${who}` + (who === "player" ? "&side=server&role=reader" : ""));
  for (const p of FILES) await app.writeOutside(p, `# ${p.split("/").pop().replace(/\.\w+$/, "")}\n\nUm lugar frio.\n`);
  await app.folderChanged(FILES, true);
  await page.evaluate(
    ([table, players, seat]) => {
      const c = window.__harness.campaign;
      c.tables = [table];
      c.players = seat === "player" ? players.slice(0, 3) : players;
      const set = (whole, rows) => ({ whole, rows: new Map(rows) });
      c.sets.set("Mundo", set("see", []));
      // Four files of their own: the folder's dialog has exceptions.
      c.sets.set("Mundo/Cripta.md", set("see", [["acc-bia", "edit"]]));
      c.sets.set("Mundo/Diario.md", set("none", []));
      c.sets.set("Mundo/Porto.md", set("see", [["acc-caio", "edit"]]));
      c.sets.set("Mundo/Quadro.canvas", set("see", []));
      for (const path of ["Mundo/Cripta.md", "Mundo/Porto.md", "Mundo/Quadro.canvas"]) c.notes.set(path, { path, released: true, audience: { kind: "table" }, secret_name: false, grant: { kind: "none" } });
      window.__harness.emit("campaign-changed", { paths: [] });
    },
    [TABLE, PLAYERS, who],
  );
  await app.folderChanged(FILES, true);
}

async function tree(app, width) {
  const page = app.page;
  if (width <= 760) await page.getByRole("button", { name: "Arquivos" }).click();
  const folder = page.locator('#notes summary[data-folder="Mundo"]');
  if ((await folder.getAttribute("aria-expanded")) !== "true") await folder.click();
  await expect(page.locator('#notes li[data-path="Mundo/Cripta.md"]')).toBeVisible();
}

async function dialog(app, target, name) {
  await target.click({ button: "right" });
  await app.page.getByRole("menuitem", { name: /^Acesso…/ }).click();
  const d = app.page.getByRole("dialog", { name });
  await expect(d).toBeVisible();
  await app.page.waitForTimeout(300);
  return d;
}

const file = (name) => `${OUT}/${name}.png`;

for (const width of [1500, 390]) {
  for (const theme of ["light", "dark"]) {
    const tag = `${width}-${theme}`;
    test(`the Access dialog, ${tag} @layout`, async ({ app, page }) => {
      await setup(app, "owner", width, theme);
      await tree(app, width);
      // A note with a set of its own under a folder: Saved + Undo after a change.
      const note = await dialog(app, page.locator('#notes li[data-path="Mundo/Cripta.md"] > button'), /^Acesso · Cripta/);
      await note.getByRole("combobox", { name: "Dora", exact: true }).selectOption({ label: "Edita" });
      await expect(note).toContainText("Salvo ✓");
      await page.screenshot({ path: file(`${tag}-1-note-page`) });
      await note.screenshot({ path: file(`${tag}-1-note`) });
      await page.keyboard.press("Escape");
      if (width <= 760 && !(await page.evaluate(() => document.body.classList.contains("side-open")))) await page.getByRole("button", { name: "Arquivos" }).click();

      // The folder after a change: the overwrite question, the count, Cancelar / Aplicar.
      const folder = await dialog(app, page.locator('#notes summary[data-folder="Mundo"]'), /^Acesso · pasta “Mundo”/);
      await folder.screenshot({ path: file(`${tag}-2-folder-before`) });
      await folder.getByRole("combobox", { name: "Toda a mesa", exact: true }).selectOption({ label: "Edita" });
      await expect(folder).toContainText("têm acesso próprio");
      await page.screenshot({ path: file(`${tag}-2-folder-page`) });
      await folder.screenshot({ path: file(`${tag}-2-folder`) });

      // The exceptions, a second view of the same popover.
      await folder.getByRole("button", { name: /com acesso próprio/ }).click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: file(`${tag}-3-exceptions-page`) });
      await folder.screenshot({ path: file(`${tag}-3-exceptions`) });
      await page.keyboard.press("Escape");
    });

    test(`the table strip on the folder's page, ${tag} @layout`, async ({ app, page }) => {
      await setup(app, "owner", width, theme);
      await tree(app, width);
      await page.locator('#notes summary[data-folder="Mundo"] .folder-label').click();
      if (width <= 760) await page.evaluate(() => document.body.classList.remove("side-open"));
      await expect(page.locator(".table-card-owner")).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: file(`${tag}-4-card-owner-page`) });
      await page.locator(".folder-table").screenshot({ path: file(`${tag}-4-card-owner`) });
    });

    test(`the player's line on the folder's page, ${tag} @layout`, async ({ app, page }) => {
      await setup(app, "player", width, theme);
      await tree(app, width);
      await page.locator('#notes summary[data-folder="Mundo"] .folder-label').click();
      if (width <= 760) await page.evaluate(() => document.body.classList.remove("side-open"));
      await expect(page.locator(".table-card-player")).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: file(`${tag}-5-card-player-page`) });
      await page.locator(".folder-table").screenshot({ path: file(`${tag}-5-card-player`) });
    });
  }
}
