// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Maps exported from Watabou's generators (ADR 0120). "Import Watabou
// map…" takes a One Page Dungeon's JSON and Markdown and makes a folder
// with the note, the export and a board with Verso's own drawing; a region
// of Perilous Shores makes one note, and a town's note is made, with what
// the region says of it, when its link is followed. "New generated map…"
// makes a note with the generator embedded and the seed kept. The samples
// are the unit tests' (test/watabou/), exports of watabou.github.io.

import { readFileSync } from "node:fs";
import { test, expect } from "./fixtures.mjs";

const sample = (name) => readFileSync(new URL(`../test/watabou/${name}`, import.meta.url));
const DIR = "Swamp Citadel of Uadjed";

async function importDialog(app, page) {
  await app.command("Importar mapa do Watabou");
  const dialog = page.getByRole("dialog", { name: "Importar mapa do Watabou" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("a dungeon's JSON and Markdown: a folder with the note, the export and a board drawn by Verso", async ({ app, page }) => {
  await app.open("?vault=empty");
  const before = await app.files();
  const dialog = await importDialog(app, page);
  await dialog.locator('input[type="file"]').setInputFiles([
    { name: "swamp_citadel_of_uadjed.json", mimeType: "application/json", buffer: sample("swamp_citadel_of_uadjed.json") },
    { name: "swamp_citadel_of_uadjed.md", mimeType: "text/markdown", buffer: sample("swamp_citadel_of_uadjed.md") },
  ]);
  await expect(dialog.locator(".wb-import-seen")).toContainText("One Page Dungeon “Swamp Citadel of Uadjed”: 4 salas numeradas, com o desenho.");
  await expect(dialog.locator(".wb-import-makes")).toContainText(`Cria a pasta “${DIR}” com a nota, o board com o desenho e swamp_citadel_of_uadjed.json.`);
  // Nothing is written before the person says so.
  expect(await app.files()).toEqual(before);
  await dialog.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(() => app.files()).toEqual(expect.arrayContaining([`${DIR}/${DIR}.md`, `${DIR}/${DIR}.canvas`, `${DIR}/swamp_citadel_of_uadjed.json`]));
  // The export kept as it came; the note: properties, then the generator's Markdown.
  expect(await app.file(`${DIR}/swamp_citadel_of_uadjed.json`)).toBe(sample("swamp_citadel_of_uadjed.json").toString("utf8"));
  const note = await app.file(`${DIR}/${DIR}.md`);
  expect(note).toContain("seed: 12345\n");
  expect(note).toContain(`map: "[[${DIR}.canvas]]"`);
  expect(note).toContain("1. A stuffed dwarf with a knife of death wish in their hands.");
  // The board: walls kept for later, the note as a card, the drawing on screen.
  const board = JSON.parse(await app.file(`${DIR}/${DIR}.canvas`));
  expect(board.verso.walls.generator).toBe("one-page-dungeon");
  expect(board.verso.walls.lines.length).toBeGreaterThan(20);
  expect(board.nodes).toEqual([expect.objectContaining({ type: "file", file: `${DIR}/${DIR}.md` })]);
  await app.boardReady();
  const scene = await app.scene();
  expect(scene.filter((e) => e.type === "text").map((e) => e.text)).toEqual(expect.arrayContaining(["1", "2", "3", "4", "Swamp Citadel of Uadjed"]));
  expect(scene.filter((e) => e.type === "line").length).toBeGreaterThan(1);
  await expect(page.locator("#status")).toContainText(`Mapa importado em “${DIR}”.`);

  // The same map again: the dialog starts at the folder of the last import
  // (the root), not at the new map's folder in front; a folder of its own,
  // never over the first.
  const again = await importDialog(app, page);
  await expect(again.getByLabel("Pasta")).toHaveValue("");
  await again.locator('input[type="file"]').setInputFiles([{ name: "swamp_citadel_of_uadjed.md", mimeType: "text/markdown", buffer: sample("swamp_citadel_of_uadjed.md") }]);
  await expect(again.locator(".wb-import-makes")).toContainText(`Cria a pasta “${DIR} 2” com a nota.`);
  await expect(again.locator(".wb-import-seen")).toContainText("Sem o JSON não há desenho");
  await again.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(again).toBeHidden();
  await expect.poll(() => app.file(`${DIR} 2/${DIR} 2.md`)).not.toBeNull();
  expect(await app.file(`${DIR}/${DIR}.md`)).toBe(note);
});

test("a region: one note listing the towns; a town's note is made with its seed when its link is followed", async ({ app, page }) => {
  await app.open("?vault=empty");
  const dialog = await importDialog(app, page);
  await dialog.locator('input[type="file"]').setInputFiles([{ name: "preter_fjord.json", mimeType: "application/json", buffer: sample("preter_fjord.trimmed.json") }]);
  await expect(dialog.locator(".wb-import-seen")).toContainText("Perilous Shores “Preter Fjord”");
  await dialog.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => app.files()).toEqual(expect.arrayContaining(["Preter Fjord/Preter Fjord.md", "Preter Fjord/preter_fjord.json"]));
  const files = await app.files();
  // No town's note yet, and no board for a region.
  expect(files.filter((f) => f.startsWith("Preter Fjord/"))).toHaveLength(2);
  const note = await app.file("Preter Fjord/Preter Fjord.md");
  expect(note).toContain("## Cidades");
  expect(note).toContain("- [[Westcot]] (village): A remote mountain village of abundant religion but scarce nature.");

  // Followed from the note, the link makes Westcot's note, with what the region says of it.
  // (The note opens in Reading: a click on the link follows it.)
  await page.locator('.preview a.wikilink[data-target="Westcot"]').first().click();
  await expect.poll(() => app.file("Preter Fjord/Westcot.md")).not.toBeNull();
  const town = await app.file("Preter Fjord/Westcot.md");
  expect(town).toContain('generator: "village-generator"');
  expect(town).toContain("seed: 465429558");
  expect(town).toContain('region: "[[Preter Fjord]]"');
  expect(town).toContain("A remote mountain village of abundant religion but scarce nature.");
  expect(town).toContain("[Abrir no gerador](https://watabou.github.io/village-generator/?seed=465429558");
  // The generator embedded at that seed, as a generated map's note (ADR 0120, Q1).
  expect(town).toContain('<iframe src="https://watabou.github.io/village-generator/?seed=465429558');
});

test("a house of Dwellings: a folder with the note listing its rooms and a board with a frame per floor", async ({ app, page }) => {
  await app.open("?vault=empty");
  const HOUSE = "House By The Sea";
  const dialog = await importDialog(app, page);
  await dialog.locator('input[type="file"]').setInputFiles([{ name: "house_by_the_sea.json", mimeType: "application/json", buffer: sample("house_by_the_sea.json") }]);
  await expect(dialog.locator(".wb-import-seen")).toContainText(`Dwellings “${HOUSE}”: 5 andares, 14 cômodos, com o desenho.`);
  await expect(dialog.locator(".wb-import-makes")).toContainText(`Cria a pasta “${HOUSE}” com a nota, o board com o desenho e house_by_the_sea.json.`);
  await dialog.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => app.files()).toEqual(expect.arrayContaining([`${HOUSE}/${HOUSE}.md`, `${HOUSE}/${HOUSE}.canvas`, `${HOUSE}/house_by_the_sea.json`]));
  // The note: the house described, its rooms floor by floor, the generator's names kept.
  const note = await app.file(`${HOUSE}/${HOUSE}.md`);
  expect(note).toContain('generator: "dwellings"');
  expect(note).toContain("## Térreo (GF)");
  expect(note).toContain("- **Bathroom 1**: 4 quadrados; porta para Room; 2 janelas.");
  // The board: a frame per floor, the walls kept, the note as a card.
  const board = JSON.parse(await app.file(`${HOUSE}/${HOUSE}.canvas`));
  expect(board.verso.walls.generator).toBe("dwellings");
  expect(board.nodes.filter((n) => n.type === "group").map((n) => n.label)).toEqual(["Porão (B)", "Térreo (GF)", "1º andar (1F)", "2º andar (2F)", "3º andar (3F)"]);
  expect(board.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ type: "file", file: `${HOUSE}/${HOUSE}.md` })]));
  await app.boardReady();
  const scene = await app.scene();
  expect(scene.filter((e) => e.type === "frame")).toHaveLength(5);
  expect(scene.filter((e) => e.type === "text").map((e) => e.text.replace(/\n/g, " "))).toEqual(expect.arrayContaining(["Library", "Living room", "Vault", HOUSE]));
  // Every drawn wall stays in its floor's frame.
  const frames = new Set(scene.filter((e) => e.type === "frame").map((e) => e.id));
  for (const l of scene.filter((e) => e.type === "line")) expect(frames.has(l.frameId)).toBe(true);
});

test("a city's export without its picture is not imported, the picture asked for; nothing is written", async ({ app, page }) => {
  await app.open("?vault=empty");
  const before = await app.files();
  const dialog = await importDialog(app, page);
  const city = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", id: "values", generator: "mfcg" }] });
  await dialog.locator('input[type="file"]').setInputFiles([{ name: "highchurch.json", mimeType: "application/json", buffer: Buffer.from(city) }]);
  await expect(dialog.locator(".wb-import-seen")).toContainText("O mapa do “Medieval Fantasy City Generator” é o próprio desenho");
  await expect(dialog.getByRole("button", { name: "Importar", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  expect(await app.files()).toEqual(before);
});

test("a dungeon with Watabou's own picture: the picture is the map, the keys pins on it, Verso's tracing hidden until shown @layout", async ({ app, page }) => {
  await app.open("?vault=empty");
  const dialog = await importDialog(app, page);
  await dialog.locator('input[type="file"]').setInputFiles([
    { name: "swamp_citadel_of_uadjed.json", mimeType: "application/json", buffer: sample("swamp_citadel_of_uadjed.json") },
    { name: "swamp_citadel_of_uadjed.svg", mimeType: "image/svg+xml", buffer: sample("swamp_citadel_of_uadjed.trimmed.svg") },
  ]);
  await expect(dialog.locator(".wb-import-seen")).toContainText("O desenho do próprio Watabou vira o mapa do board, alinhado às salas");
  await expect(dialog.locator(".wb-import-makes")).toContainText("o board com o desenho do Watabou");
  await dialog.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => app.file(`${DIR}/${DIR}.canvas`)).not.toBeNull();
  const board = JSON.parse(await app.file(`${DIR}/${DIR}.canvas`));
  // The picture is the map, the keys pins on it; the walls on the picture's grid.
  expect(board.nodes[0]).toEqual(expect.objectContaining({ id: "wb-map", file: `${DIR}/swamp_citadel_of_uadjed.svg`, verso: expect.objectContaining({ map: true, locked: true }) }));
  expect(board.nodes.filter((n) => n.verso?.pin).map((n) => n.verso.key).sort()).toEqual(["1", "2", "3", "4"]);
  expect(board.verso.walls.grid).toHaveLength(6);
  await app.boardReady();
  // The pins show their numbers, named for the note.
  await expect(page.locator(".board-pin.is-key")).toHaveCount(4);
  await expect(page.getByRole("button", { name: `Abrir ${DIR}, número 1` })).toBeVisible();
  // The tracing: there, unseen; shown by the board's verb, hidden again.
  const traced = () => page.evaluate(() => window.__VERSO_TEST__.board.getSceneElements().filter((e) => e.customData?.verso?.traced).map((e) => e.opacity));
  expect((await traced()).length).toBeGreaterThan(20);
  expect(new Set(await traced())).toEqual(new Set([0]));
  await app.boardVerb("tracing", "board-tool-tracing");
  await expect.poll(async () => [...new Set(await traced())]).toEqual([100]);
  await app.boardVerb("tracing", "board-tool-tracing");
  await expect.poll(async () => [...new Set(await traced())]).toEqual([0]);
});

test("a village with its picture: a folder with the note and a board whose map is the picture", async ({ app, page }) => {
  await app.open("?vault=empty");
  const dialog = await importDialog(app, page);
  await dialog.locator('input[type="file"]').setInputFiles([
    { name: "gertwharf.json", mimeType: "application/json", buffer: sample("gertwharf.values.json") },
    { name: "gertwharf.png", mimeType: "image/png", buffer: sample("gertwharf.small.png") },
  ]);
  await expect(dialog.locator(".wb-import-seen")).toContainText("“Gertwharf”: o desenho do Watabou vira o mapa de um board");
  await dialog.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => app.files()).toEqual(expect.arrayContaining(["Gertwharf/Gertwharf.md", "Gertwharf/Gertwharf.canvas", "Gertwharf/gertwharf.png", "Gertwharf/gertwharf.json"]));
  const board = JSON.parse(await app.file("Gertwharf/Gertwharf.canvas"));
  expect(board.nodes[0]).toEqual(expect.objectContaining({ file: "Gertwharf/gertwharf.png", verso: { map: true, locked: true } }));
  expect(await app.file("Gertwharf/Gertwharf.md")).toContain('generator: "village-generator"');
});

test("a generated map's note: the generator embedded at the seed Verso drew, the seed in the properties", async ({ app, page }) => {
  await app.open("?vault=empty");
  await app.command("Novo mapa gerado");
  const dialog = page.getByRole("dialog", { name: "Novo mapa gerado" });
  await expect(dialog).toBeVisible();
  const seed = dialog.getByLabel("Semente");
  await expect(seed).toHaveValue(/^\d+$/);
  await seed.fill("12345");
  await dialog.getByLabel("Nome (opcional)").fill("Covil");
  await dialog.getByRole("button", { name: "Criar nota" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => app.file("Covil.md")).not.toBeNull();
  const note = await app.file("Covil.md");
  expect(note).toContain('generator: "one-page-dungeon"');
  expect(note).toContain("seed: 12345");
  expect(note).toContain('<iframe src="https://watabou.github.io/one-page-dungeon/?seed=12345&amp;name=Covil"');
});

test("the dialog fits a phone: every control reachable at 390 × 844", async ({ app, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await app.open("?vault=empty");
  const dialog = await importDialog(app, page);
  await dialog.locator('input[type="file"]').setInputFiles([
    { name: "swamp_citadel_of_uadjed.json", mimeType: "application/json", buffer: sample("swamp_citadel_of_uadjed.json") },
  ]);
  const box = dialog.locator(".wb-import-box");
  const b = await box.boundingBox();
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(390);
  for (const name of ["Escolher arquivos…", "Cancelar", "Importar"]) {
    const button = dialog.getByRole("button", { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
  }
});
