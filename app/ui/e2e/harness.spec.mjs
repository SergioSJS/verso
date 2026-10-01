// The harness itself (ADR 0058): it answers every command of the contract,
// and the window opens on the demo vault with a clean console.

import { readFileSync } from "node:fs";
import { test, expect } from "./fixtures.mjs";

test("every command of the contract has an answer in the harness", async ({ app }) => {
  await app.open();
  const bindings = readFileSync(new URL("../src/bindings.ts", import.meta.url), "utf8");
  const contract = [...bindings.matchAll(/__TAURI_INVOKE(?:<[^>]*>)?\("([a-z_]+)"/g)].map((m) => m[1]).sort();
  const answered = await app.page.evaluate(() => window.__harness.commands);
  expect(contract.length).toBeGreaterThan(50);
  expect(contract.filter((c) => !answered.includes(c)), "commands with no answer in src/harness/core.ts").toEqual([]);
});

test("the window opens on the demo vault", async ({ app }) => {
  await app.open();
  await expect(app.page.locator("#notes")).toContainText("00 - Bem-vindo ao Verso");
  await app.quickOpen("00 - Bem-vindo");
  await expect(app.page.locator(".tab", { hasText: "00 - Bem-vindo ao Verso" }).first()).toBeVisible();
});
