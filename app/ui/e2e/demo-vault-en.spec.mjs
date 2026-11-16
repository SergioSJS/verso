// Walkthrough, section 1 (the English tutorial, ADR 0058 point 15): in a
// window in English, "Import the demo content" writes the English vault,
// whole, with the shared images beside it; the English tour opens with its
// stops, a translated note opens, and the other language is one command
// away.

import { readFileSync } from "node:fs";
import { test, expect } from "./fixtures.mjs";

test.use({ locale: "en-US" });

const embed = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8").split("export const DEMO_RETIRED")[0];
const pathsOf = (text) => [...text.matchAll(/"path": ("(?:[^"\\]|\\.)*")/g)].map((m) => JSON.parse(m[1]));
const PT = pathsOf(embed("demoVault.ts"));
const EN = pathsOf(embed("demoVaultEn.ts"));
const EN_FILES = [...EN, ...PT.filter((p) => p.startsWith("assets/") && !/servidor-/.test(p))].sort();
const tour = JSON.parse(readFileSync(new URL("../../../demo-vault-en/Verso Tour.canvas", import.meta.url), "utf8"));
const STOPS = tour.nodes.filter((n) => n.type === "group").map((n) => n.label);

async function importIn(app, command) {
  await app.open("?vault=empty");
  expect(await app.files()).toEqual([]);
  await app.command(command);
  await app.page.locator(".confirm-box button.save").click();
}

test("an English window imports the English tutorial, the images shared, and opens its welcome note", async ({ app }) => {
  await importIn(app, "Import the demo content");
  await expect.poll(() => app.files()).toEqual(EN_FILES);
  await expect(app.page.locator(".tab", { hasText: "00 - Welcome to Verso" }).first()).toBeVisible();
  // No Portuguese note came along.
  expect((await app.files()).filter((p) => /Bem-vindo|Tour do Verso/.test(p))).toEqual([]);
  // A note is in English, with its links to English names.
  const welcome = await app.file("00 - Welcome to Verso.md");
  expect(welcome).toContain("[[Verso Tour.canvas");
  expect(welcome).not.toContain("Bem-vindo");
});

test("the English tour opens with its stops in order, and a translated note opens from it", async ({ app }) => {
  await importIn(app, "Import the demo content");
  await expect.poll(() => app.files()).toEqual(EN_FILES);
  await app.quickOpen("Verso Tour", "Open…");
  await app.boardReady();
  await app.page.getByRole("button", { name: "Outline", exact: true }).click();
  await expect(app.page.locator(".board-outline-group")).toHaveText(STOPS);
  expect(STOPS[0]).toContain("Write");
  // Opening wrote nothing.
  expect(await app.calls("write_board")).toEqual([]);
  await app.quickOpen("Markdown Guide", "Open…");
  await expect(app.page.locator(".tab", { hasText: "01 - Markdown Guide and Syntax" }).first()).toBeVisible();
});

test("the other language is one command away", async ({ app }) => {
  await importIn(app, "Import the demo content in Portuguese");
  await expect.poll(() => app.files()).toEqual([...PT].sort());
  await expect(app.page.locator(".tab", { hasText: "00 - Bem-vindo ao Verso" }).first()).toBeVisible();
});

// The English vault's properties are named in English (2026-10-21): a key
// renamed in a note but missed in the base would show an empty column.
test("the English Projects base shows its English property columns with values", async ({ app, page }) => {
  await importIn(app, "Import the demo content");
  await expect.poll(() => app.files()).toEqual(EN_FILES);
  expect(await app.file("projects/Project Alpha.md")).toContain("priority: high");
  // The formula column is evaluated by the core, not the harness: check the base text instead.
  expect(await app.file("Projects.base")).toMatch(/formula\.budget_k/);
  expect(await app.file("Projects.base")).not.toMatch(/orcamento/);
  await app.quickOpen("Projects.base", "Open…");
  const row = page.locator(".base tr", { has: page.locator("a.base-file", { hasText: /^Project Alpha$/ }) });
  await expect(row).toBeVisible();
  const headers = (await page.locator(".base th").allTextContents()).map((t) => t.trim());
  expect(headers).toEqual(expect.arrayContaining(["priority", "owner", "budget"]));
  const cells = (await row.locator("td").allTextContents()).map((t) => t.trim());
  expect(cells).toEqual(expect.arrayContaining(["high", "Sérgio", "15,000"]));
});
